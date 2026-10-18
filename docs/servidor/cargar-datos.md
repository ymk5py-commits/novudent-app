# Cargar los datos de Firestore en Postgres (fase D / P5)

`scripts/migracion/cargar-postgres.mjs` toma la exportación de Firestore (`npm run migracion:exportar`) y la deja en el Postgres de Supabase **idéntica**, con la prueba escrita: una
comparación SHA-256 documento por documento. Spec: `docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md` §11.2 y §13 (P5).

## Qué hace

1. **Valida la exportación antes de tocar nada**: cada archivo contra el manifiesto (SHA-256, tamaño y cantidad de documentos), que no sea una medición (`--solo-medir`), parcial
   (`--clinica`) ni incompleta, y que no traiga colecciones fuera de `lib/backend/colecciones.json` (esas no tienen tabla y se perderían). Los datos se leen de una carpeta **fuera del
   repositorio** (por defecto `~/novudent-export`, la más nueva); el programa se niega a leer o escribir adentro del repo.
2. **Revisa la base**: que existan las tablas de **todas** las colecciones del manifiesto (con `id` y `data`). Las tablas son las de la fase B (`supabase/migrations/`).
3. **Cuentas de GoTrue**: un usuario es *real* si su documento tiene `authUid` y un correo (los de la demo traen correo pero no `authUid`; las cuentas anónimas de Firebase no tienen
   documento). A cada uno se le crea una cuenta con la API de administración —**sin contraseña**, correo confirmado, y el uid viejo de Firebase en `app_metadata.firebase_uid`—;
   la persona elige su contraseña por correo. Se busca por correo antes de crear: repetir no duplica. **El documento conserva todo, también el `id`; solo `data.authUid` pasa a ser el uuid
   nuevo**, así que ninguna referencia (`dentistId`, `participants`…) se reescribe.
4. **Carga por upsert**: `insert … on conflict do update … where data is distinct from excluded.data`. Una segunda carga igual no toca ni una fila (tampoco su `updated_at`).
   Parámetros siempre ligados; los nombres de tabla salen de la lista blanca y se hallan en el catálogo de la base. `directory` y `serviceAccounts` **no** se cargan.
5. **Verifica TODO**: SHA-256 de la forma canónica `{id, data}` de cada documento del archivo contra el leído de la base (Postgres reordena las claves de `jsonb`, por eso no es el hash de
   la línea cruda), en los dos sentidos: faltan, distintos y **sobran** (incluso clínicas enteras que no están en la exportación). **El cargador nunca borra.**

## Cómo se usa

La base y GoTrue **no tienen valor por defecto**. Las claves van por variables de entorno (la línea de comandos queda en el historial):

```bash
export NOVUDENT_CARGA_DB_URL='postgres://supabase_admin:CLAVE@127.0.0.1:15432/postgres'
export NOVUDENT_CARGA_GOTRUE_URL='http://127.0.0.1:18100/auth/v1'     # con el prefijo /auth/v1 (Kong); directo a GoTrue es http://auth:9999
export NOVUDENT_CARGA_SERVICE_KEY='…'                                   # la clave service_role del proyecto; solo por variable

npm run migracion:cargar -- --dry-run          # simulacro: no escribe NADA (ni documentos ni cuentas); dice qué insertaría/actualizaría y cuántas cuentas crearía
npm run migracion:cargar                       # carga y verifica
npm run migracion:cargar -- --solo-verificar   # solo compara (la sesión de Postgres se abre en solo lectura)
```

Opciones: `--exportacion DIR`, `--url-base`, `--url-gotrue`, `--sobrescribir`, `--permitir-incompleto`, `--ignorar-desconocidas`, `--lote N`, `--informe RUTA`, `--ayuda`.
Sin `--url-base` ni `--url-gotrue`, `--dry-run` solo valida la exportación.

**Código de salida:** `0` todo bien · `2` hay diferencias (o documentos que no se pudieron cargar) · `1` error (la exportación no sirve, falta algo, la base no está lista…).
El informe (Markdown, solo ids y números, nunca el contenido de un documento ni una clave) va a la salida y a `<exportación>/informe-de-carga-<fecha>.md` (600).

### Seguridad

- **No pisa ediciones más nuevas.** Si la base ya tiene documentos *distintos* a los de la exportación, la carga se niega (sin crear cuentas) y lista las colecciones; hay que repetir con
  `--sobrescribir`. Un segundo simulacro con una exportación nueva sí lo necesita; cargar la misma exportación otra vez, no. Mirá antes con `--dry-run`.
- Un bloqueo de aviso de Postgres (por esquema) impide que dos cargas corran a la vez.
- Un documento que Postgres no acepta (por ejemplo un texto con el carácter NUL) se informa por su id —sin su contenido—, el resto se carga y el resultado sale con código 2.
- Si el mismo correo está en dos clínicas, comparten una sola cuenta de GoTrue, pero el esquema (fase B) admite **una sola clínica real por persona**: el segundo documento no se carga y se informa.
- Si algo corta la carga a la mitad, se repite sin riesgo: todo es idempotente.

### Alcanzar una base que no está publicada

En el servidor la base de Supabase no publica ningún puerto. Desde la Mac, un túnel a la IP del contenedor (sin tocar nada del servidor):

```bash
IP=$(ssh gmktec "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <contenedor-db>" | awk '{print $1}')
ssh -N -L 15432:$IP:5432 gmktec        # y NOVUDENT_CARGA_DB_URL apunta a 127.0.0.1:15432
```

GoTrue se alcanza por la URL pública de Kong (HTTPS) con la clave de servicio.

## Probarlo

- `npx vitest run scripts/migracion`: ~200 pruebas con exportaciones sintéticas armadas por el exportador de verdad. Las que necesitan Postgres y GoTrue reales se saltean solas.
- Contra un Postgres y un GoTrue de verdad (descartables, solo en `127.0.0.1` del servidor): `scripts/migracion/stack-de-prueba.sh` (instrucciones en su cabecera) levanta el stack con los
  mismos servicios que `infra/supabase`; con las variables `NOVUDENT_PRUEBA_DB_URL`, `NOVUDENT_PRUEBA_GOTRUE_URL` y `NOVUDENT_PRUEBA_SERVICE_KEY` (salen de `acceso.env` de ese stack, por `ssh -L`)
  `npx vitest run scripts/migracion` corre también las pruebas de punta a punta. Las tablas de esas pruebas son un esquema aparte con la forma del spec §5.1; para ver el cargador con el esquema
  real de la fase B, `scripts/supabase/aplicar-esquema.sh <contenedor-db-de-prueba> --ssh gmktec` y luego el programa tal cual.
