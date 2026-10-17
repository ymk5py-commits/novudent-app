# Supabase de Novudent en el servidor propio (Coolify)

Stack **mínimo y con versiones fijadas** en `infra/supabase/`: Postgres (`supabase/postgres`), GoTrue (login), PostgREST (API de datos), Realtime y Kong
(puerta de entrada). **No** incluye Studio, Analytics, Vector, Storage, Functions ni Supavisor (spec del 9-oct §4): no se usan y cada uno es una
superficie más. No publica ningún puerto al host; la única entrada es Kong, y a Kong lo publica el proxy de Coolify con un dominio.

| Archivo | Para qué |
|---|---|
| `infra/supabase/docker-compose.yml` | Los cinco servicios y, en `configs` con contenido en línea, todo lo que antes eran archivos: el `kong.yml` (rutas `/auth/v1`, `/rest/v1` y `/realtime/v1`; todo lo demás da 404; exige `apikey`) y los tres SQL de inicialización de la base (esquema `_realtime`, contraseñas de `authenticator` y `supabase_auth_admin`, expiración del JWT). Sin secretos, solo nombres de variables |
| `infra/supabase/probar-local.sh` | Prueba de humo con secretos descartables (17 comprobaciones) |

**Por qué los archivos van dentro del compose (no como `./volumes/**`).** Coolify reescribe los bind mounts relativos a `/data/coolify/applications/<uuid>/volumes/**` (sin la carpeta base `infra/supabase`),
no encuentra los archivos y Docker crea **directorios vacíos** en su lugar: los scripts de la base no corren, las contraseñas de los roles quedan sin fijar y GoTrue, PostgREST y Realtime no pueden entrar
(se vio el 17-oct). Con `configs` no hay rutas del host de por medio. Dentro de un `content`, compose interpola variables: un «$» literal se escribe «$$».

## Probarlo (siempre antes de tocar versiones o configuración)

La Mac no tiene Docker: se corre en el servidor. Levanta un stack aparte (`nvsb-test-…`, solo en `127.0.0.1`), prueba y lo destruye con sus datos.

```bash
tar --no-xattrs -C infra/supabase -cf - . | ssh gmktec 'mkdir -p ~/build-tests/supabase && tar -x -C ~/build-tests/supabase && cd ~/build-tests/supabase && ./probar-local.sh'
```

Comprueba: los cinco servicios sanos; `auth/health` con clave 200 y sin clave 401; una clave inventada 401; que `/storage`, el dashboard y lo demás den 404; crear una
persona con la clave de servicio (y que la clave pública **no** pueda); iniciar sesión; la sesión anónima de la demo; que un alta por email sin confirmar no pueda entrar;
el WebSocket de Realtime (101); los roles y esquemas de la base; y que ningún puerto quede publicado fuera de `127.0.0.1`.

## Desplegarlo en Coolify

Nuevo recurso › **Docker Compose** desde un repositorio Git (público) › rama con `infra/supabase`, «Base Directory» `/infra/supabase`, archivo `/docker-compose.yml`.

- **Secretos: los genera Coolify** con sus variables mágicas, que el compose ya usa: `SERVICE_PASSWORD_POSTGRES`, `SERVICE_PASSWORD_JWT`,
  `SERVICE_PASSWORD_64_REALTIME` y las claves `SERVICE_SUPABASEANON_KEY` / `SERVICE_SUPABASESERVICE_KEY` (JWT firmados con el secreto anterior). Nunca se escriben en el
  repositorio ni en el chat. `probar-local.sh` genera sus propias, con los mismos nombres.
- **Dominio:** solo el servicio `kong`, con `http://api-novudent-prueba.novumholding.lat:8000` (el HTTPS lo pone Cloudflare). Un solo nivel: el certificado gratuito de
  Cloudflare no cubre `api.novudent…`.
- **Variables a cargar a mano:** `API_EXTERNAL_URL` (la URL pública de arriba, con `https://`) y `SITE_URL` (la de la app). Opcionales: `SMTP_*` (Resend, para el correo de
  «olvidé mi contraseña»), `ADDITIONAL_REDIRECT_URLS`, `JWT_EXPIRY` (3600).
- La app necesita `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` **en el build** (la clave anónima es pública por diseño) y `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET`
  **en tiempo de ejecución** (secretas). Salen de las variables que Coolify generó para este recurso.

## Decisiones y límites

- **Registro abierto, a propósito.** Con `GOTRUE_DISABLE_SIGNUP=true` GoTrue también rechaza la sesión **anónima** (422) y la demo pública la necesita. Compensan: el correo sin
  confirmar no puede iniciar sesión (`ENABLE_EMAIL_AUTOCONFIRM=false`, probado), y sin membresía en una clínica las reglas de datos (fase B) no dejan leer ni escribir nada fuera de
  `cl_demo`. Pendiente para la fase C: purgar las cuentas anónimas viejas (spec §8) y evaluar una sesión de demo fija o un hook `before-user-created`.
- **`REALTIME_DB_ENC_KEY`** queda con el valor por defecto de Supabase (16 caracteres): solo cifra la copia del secreto JWT que Realtime guarda en su propia base, que ya está en
  el entorno del contenedor. Si se quiere, se cambia por otro de exactamente 16 caracteres antes de la primera carga de datos.
- **Sin Studio:** para mirar la base, `docker exec -it <contenedor-db> psql -U supabase_admin -d postgres` desde el servidor (o un túnel SSH). Nada de Postgres en la red.
- **Respaldos:** todavía no (fase F): volcado lógico diario + WAL a Cloudflare R2, con prueba de restauración mensual. Los datos viven en los volúmenes `db-data` y `db-config`
  (este último guarda la clave de pgsodium: sin él, un reinicio la regenera).
- **Actualizar versiones:** se cambian las etiquetas del `docker-compose.yml` (el conjunto que Supabase publica junto en `supabase/docker`), se corre `probar-local.sh` y recién
  después se redespliega en Coolify.
