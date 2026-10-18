# Esquema de Postgres (Supabase) de Novudent

Fase B del traspaso a un servidor propio. Diseño: `docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md` (§5 datos, §6 permisos, §7 tiempo real) y `…/2026-10-17-plataforma-coolify-tunel-design.md` (§6, reparto de fases).

Las migraciones de `supabase/migrations/` **se generan, no se escriben a mano**: `node scripts/supabase/generar-esquema.mjs` las arma a partir de `lib/backend/colecciones.json` y de las plantillas de `scripts/supabase/plantillas/`. `npx vitest run` falla si lo que está en el repositorio no coincide con lo que genera el generador.

## Cómo se usan

| Qué | Comando |
|---|---|
| Regenerar las migraciones (después de tocar el manifiesto o una plantilla) | `node scripts/supabase/generar-esquema.mjs` |
| Aplicarlas a un Postgres de Supabase en un contenedor (el `db-…` de Coolify) | `scripts/supabase/aplicar-esquema.sh db-<uuid> --ssh gmktec` (`--simular` solo muestra qué haría) |
| Probar todo contra un Postgres **descartable** en el servidor | `scripts/supabase/probar-rls.sh` (levanta `nvsb-test-esquema-*`, abre el túnel, corre `test/rls/*.test.mjs` y lo borra todo) |
| Probar de punta a punta en el stack COMPLETO (Kong, PostgREST, GoTrue, Realtime) descartable | `scripts/supabase/probar-stack.sh` (las mismas imágenes fijadas de `infra/supabase`; aplica las migraciones y corre `test/rls/stack.test.mjs`: JWT real, rpc por HTTP, Realtime con RLS) |
| Un solo archivo o caso de las pruebas | `scripts/supabase/probar-rls.sh -- reglas.test.mjs` (lo que va después de `--` es de `node --test`) |
| Pruebas que no necesitan Postgres (migraciones al día, roles de fábrica atados a `lib/rbac.ts`) | `npx vitest run test/rls` |

Las migraciones son **idempotentes**: se pueden aplicar otra vez sin romper nada. `aplicar-esquema.sh` las aplica todas, en orden, como `postgres`, cada archivo en una transacción.

## El contrato para el adaptador (fase C) y el cargador (fase D)

### Tablas

Una por colección del manifiesto, con **el mismo nombre que la colección** (camelCase, entre comillas: `public."directMessages"`, `public."agendaBlocks"`, `public.users`):

```
colecciones por clínica (36):  clinic_id text, id text, data jsonb (siempre un objeto), updated_at timestamptz   clave (clinic_id, id)
colecciones raíz (5):          id text, data jsonb, updated_at timestamptz                                       clave (id)
                               clinics, subscriptions, webhookEvents, leads, checkoutTokens
```

`directory` y `serviceAccounts` **no existen**: el enrutamiento uid → clínica sale de `users.data->>'authUid'` (`public.mi_directorio()`), y la «cuenta de servicio» es la clave `service_role`.
`updated_at` lo mantiene un disparador; la clave de un documento (clínica e id) no se puede cambiar con un update. Un documento no pasa de **2 MiB** (`23514`): la demo la escribe cualquiera con una sesión anónima.

Índices: `users` por `authUid` (único entre clínicas reales: **una persona pertenece a una sola clínica**; la demo queda afuera), `appointments`/`agendaBlocks` por `start`, `appointments` por `confirmToken`, `signatures` por `token`, `patients` por `document`, `outbox` por `status`, `directMessages` por `participants` (GIN).

Realtime: están en la publicación `supabase_realtime` con `replica identity full` `subscriptions`, `clinics`, `outbox`, `directMessages` y `teamMessages` (las cinco que el navegador escucha).

### Operaciones de datos (`rpc` de PostgREST, security invoker: la RLS se aplica como en un insert directo)

| Función | Equivale a | Notas |
|---|---|---|
| `guardar(tabla, clinic_id, id, data)` | `setDoc` sin merge | alta o reemplazo del documento entero. Tablas raíz: `clinic_id = null` |
| `quitar(tabla, clinic_id, id) → integer` | `deleteDoc` | devuelve cuántos borró; si no existe, 0 y sin error |
| `fijar_campo(tabla, clinic_id, id, campo, valor jsonb default null, quitar boolean default false)` | `updateDoc` de un campo / `deleteField` | `valor = null` **guarda null**; la clave se quita solo con `quitar = true`; `campo` vacío o con punto se rechaza; si el documento no existe: error |
| `mezclar_clinica(cid, parche)` | `setDoc(clinics/{cid}, parche, {merge:true})` | fusión profunda (objetos se mezclan, arreglos se reemplazan, `null` se guarda); crea la clínica si no existe |
| `lote(operaciones jsonb) → integer` | `writeBatch` | una sola transacción. `[{op:'guardar', tabla, clinic_id, id, data} \| {op:'quitar', tabla, clinic_id, id} \| {op:'fijar_campo', tabla, clinic_id, id, campo, valor, quitar} \| {op:'mezclar_clinica', cid, parche}]`, hasta 1000 |
| `mi_directorio() → (clinic_id, user_id)` | `directory/{uid}` + `currentUserId()` | la clínica real de la sesión y el **id del documento** de usuario (no el uid de login). Cero filas = sin clínica. Nunca devuelve la demo |
| `mi_usuario(cid) → text` | | el id del documento de usuario en esa clínica (para la demo, donde `mi_directorio` no sirve) |

Errores: `42501` = permiso denegado (o el documento no existe y no se puede crear); `42P01` = la tabla no existe en Novudent; `22023` = argumentos mal armados (tabla raíz con `clinic_id`, `data` que no es un objeto…). Las tablas se validan contra una lista: nunca se arma SQL con un nombre que no esté en ella.

**Por qué `guardar` y no `upsert` de PostgREST.** Un `insert … on conflict do update` evalúa la política de ALTA sobre la fila nueva aunque el documento ya exista; Firestore evalúa un `setDoc` sobre un documento existente como una ACTUALIZACIÓN. Con el upsert, p. ej., el asistente no podría guardar la ficha entera de un paciente aunque no haya cambiado nada clínico. `guardar` actualiza primero y da el alta solo si no existe. **El adaptador tiene que usar `guardar`/`lote` para todo `setDoc`.**

### Funciones de permisos (`interno`, no expuestas por la API)

`uid`, `isDemo`, `isDemoRW`, `isMember`, `isAdmin`, `mi_usuario`, `tienePermiso`, `isCaja`, `isRecepcion`, `isClinical`, `puedeGastos`, `puedeLiquidaciones`, `subActive`, `effectivePlan`, `canWrite`, `canWritePremium`: las de `firestore.rules`, con los mismos nombres (entre comillas, por las mayúsculas). **`interno.uid()` lee `request.jwt.claims`** (lo que deja PostgREST con `PGRST_DB_USE_LEGACY_GUCS=false`) y el viejo `request.jwt.claim.sub`; el `auth.uid()` de la imagen de Supabase solo mira el segundo.

### Permisos (RLS)

Denegar por defecto: todas las tablas tienen RLS activado (sin `force`) y, **sin una política, `anon` y `authenticated` no tienen ni los permisos de tabla**. Las políticas (`20261017000400_rls_politicas.sql`) son las de `firestore.rules`, una por comando y por tabla, con las mismas funciones (`interno."isMember"`, `"canWrite"`, `"canWritePremium"`…). `leads`, `webhookEvents` y `checkoutTokens` no tienen políticas: solo el servidor.

Las **5 reglas por campo** (`20261017000500_rls_disparadores.sql`, disparadores `before`; no valen para `service_role` ni `postgres`, que se saltan RLS):
1. `clinics`: el admin cambia la configuración pero no `plan`.
2. `users`: un usuario edita su documento solo en `name` y `color`.
3. `patients`: quien no tiene `emr.write` no cambia `emr`, `odontogram`, `prescriptions`, `ortho` ni `perio` (el alta con esos campos la rechaza la política).
4. `directMessages` (alta): remitente = quien escribe, destinatario activo de la clínica, `participants` exactos, 1–2000 caracteres, `difusionId` solo del admin, lista cerrada de claves.
5. `directMessages` (update): el destinatario cambia solo `readAt`.

**Diferencias con Firestore que el adaptador tiene que conocer** (las revisadas caso por caso están en `test/rls/CASOS.md`):
- Una consulta con filas no permitidas **no falla: devuelve solo lo permitido**. `directMessages` se puede pedir completa.
- Un `update`/`delete` directo bloqueado por la política **afecta 0 filas, sin error**. `guardar`/`quitar`/`fijar_campo`/`lote` sí avisan (`42501`).
- `service_role` puede todo (incluso lo que en Firestore ni el usuario de servicio podía, como borrar un mensaje directo): es la llave de confianza del servidor.
- El ruteo uid → clínica ya no es una colección que alguien escribe: sale del documento de usuario. Un `authUid` es de una sola clínica real.

### Quién puede qué (lo que importa para el adaptador)

- `anon` (la clave pública sin sesión) **solo lee** la demo (`cl_demo`). No ejecuta ninguna función de datos.
- `authenticated` (GoTrue: email y contraseña, o la sesión anónima de la demo) pasa por RLS. **Sin membresía en una clínica no se lee ni se escribe nada fuera de `cl_demo`.** La demo se escribe con cualquier sesión.
- `service_role` salta RLS y las reglas por campo. Es la llave del servidor: nunca va al navegador.
- Usuarios: `users.data.authUid` = el uuid de GoTrue; `users.id` = el id del documento (para usuarios migrados es el id viejo; para los nuevos, el mismo uuid). Todo lo que dice «mi id» (`participants`, `fromId`, `toId`, `dentistId`…) es el **id del documento**, no el uid.

## Qué falta decidir o hacer (no es de esta fase)

- **La demo es escribible por cualquiera con una sesión anónima** (a propósito: es el sandbox de ventas). Cada documento tiene tope, pero no hay tope de cantidad: hace falta limitación de tasa en la entrada (Cloudflare/Kong) y una limpieza periódica de `cl_demo` (y de las cuentas anónimas viejas de GoTrue, spec §8).
- **Rendimiento de las políticas:** cada fila llama a `isMember` (una búsqueda por índice): medido con 20.000 filas en una clínica, ~10 µs por fila (≈200 ms la lectura entera). Si hiciera falta, se puede calcular una vez por consulta (`clinic_id in (select …)`); medir antes con la prueba de carga del spec §13.
- **Aplicar el esquema al stack real** (Coolify): `scripts/supabase/aplicar-esquema.sh db-<uuid> --ssh gmktec --simular` primero; no se corrió contra `supabase-prueba`.
