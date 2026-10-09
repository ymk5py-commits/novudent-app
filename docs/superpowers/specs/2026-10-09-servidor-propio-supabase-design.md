# Novudent en un servidor propio con Supabase — diseño

**Fecha:** 9-oct-2026 · **Pedido de:** Croman · **Estado:** diseño aprobado por partes en la conversación; este documento espera su lectura. **No se implementó nada.**

> «Preparar toda la app para tener un servidor propio y pasar la base de datos de Firebase ahí. Todavía no lo tengo, pero quiero tener todo adelantado.»

## 1. Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| Destino de los datos | **Supabase auto-alojado** (Postgres + GoTrue + Realtime + PostgREST + Kong) | Croman |
| Cómo se guardan | **Enfoque A**: una tabla por colección con el documento entero en `jsonb`; el navegador sigue hablando directo con la base y los permisos pasan a RLS + disparadores | Croman |
| Dónde | **Servidor aparte** del de Santa Rosa (SRPY186): Novudent guarda fichas clínicas de clínicas ajenas | Croman |
| Escala | **5 a 30 clínicas** a 12 meses → un solo servidor | Croman |
| Orquestación | **Coolify** sobre Docker en el servidor nuevo; hoy no se instala, se deja probado y documentado | Croman |
| Motivo de irse de Firebase | No lo dijo; se asume costo (proyecto en Blaze) y control (organización de Google que bloquea cuentas de servicio). Si aparece «datos en Paraguay», cambia solo la ubicación del servidor | supuesto |

Descartados: tablas relacionales (reescribe casi toda la tienda), todo por una API propia (reescribe 83 escrituras y todas las lecturas y hay que inventar el tiempo real).

## 2. Objetivo y alcance

**Objetivo:** que el día que haya servidor, pasar Novudent sea *instalar, cargar los datos y cambiar el DNS*, con un simulacro ya hecho y sin sorpresas.

**Dentro:** capa de datos, esquema y permisos en Postgres, adaptador de cliente y de servidor, login, tiempo real, empaquetado Docker/Coolify, migración y corte, respaldos, contrato de Botika, guías de operación.

**Fuera (a propósito):** normalizar a tablas relacionales; mover las imágenes de base64 a Supabase Storage; alta disponibilidad y réplicas; varias regiones. Gemini, Resend, Lemon Squeezy y Upstash **no cambian** (Lemon Squeezy solo necesita la URL nueva del webhook).

## 3. Situación actual (verificada en el código el 9-oct-2026)

- **Cliente → Firestore directo.** Solo 3 archivos importan Firebase: `lib/firebase.ts`, `lib/store.tsx` y `app/app/chat/page.tsx`. La tienda tiene un modo `local` (sin Firebase) que usan los e2e.
- **Datos:** 36 subcolecciones por clínica (`clinics/{cid}/…`, `users` incluida) y 7 colecciones raíz: `clinics`, `directory`, `subscriptions`, `serviceAccounts`, `webhookEvents`, `leads` y `checkoutTokens`. Las imágenes van en base64 dentro del documento (tope 1 MB).
- **Operaciones que usa la app** (todas simples): `setDoc` sin merge (`fsSave`), `updateDoc` de un campo con `deleteField` (`fsCampo`), `setDoc` con merge solo sobre el documento de la clínica (`fsMeta`), `deleteDoc`, `writeBatch`, `getDocs`, consultas `where` / `array-contains`, `onSnapshot`. **No hay** `runTransaction`, `increment`, `arrayUnion`, `serverTimestamp` ni `Timestamp`: las fechas son texto ISO.
- **Tiempo real:** 5 `onSnapshot`: `subscriptions/{cid}`, `clinics/{cid}` (solo `config.permisos`, `rolesPropios` y `nombresDeRoles`), `outbox`, `directMessages` (todos o solo los míos según el rol) y `teamMessages` (chat).
- **Permisos:** `firestore.rules` (580 líneas, 45 bloques). Roles de fábrica + ajustes por clínica (`config.permisos`) + planes y suscripción + demo pública + **5 reglas por campo** (ver §6.2). Las **144 pruebas** de `test/firestore-rules.test.mjs` son la especificación ejecutable.
- **Login:** Firebase Auth con email y contraseña, sesión anónima para la demo, correo de «olvidé mi contraseña», cambio de contraseña obligatorio. El servidor valida tokens contra Identity Toolkit (`lib/server/auth.ts`) y crea usuarios por REST (`/api/clinicas`, `/api/team-users`).
- **Servidor:** 13 rutas `/api` leen y escriben por `lib/server/firestore-rest.ts` con un «usuario de servicio» (`SERVICE_USER_EMAIL/PASSWORD`), porque la organización de Google no deja crear cuentas de servicio. Operaciones: `getDocument`, `listCollection`, `queryWhere`, `queryRange`, `queryIn`, `setDocument`, `patchFields`, `createIfAbsent`. `createIfAbsent` da la exclusión de turnos (`slotLocks`), la idempotencia del webhook y el alta de usuarios.
- **Usuarios:** el documento de cada usuario ya guarda `id` y `authUid` (iguales hoy, `app/api/clinicas/route.ts:205`, `app/api/team-users/route.ts:107`). `directory/{uid}` enruta un uid a su clínica.
- **Botika** (otro repo) lee y escribe `clinics/{id}/outbox` con firebase-admin.
- **Analytics:** Firebase Analytics, solo con consentimiento (`lib/firebase.ts`).
- **Hosting:** Vercel. Docker 29.4 y Compose están instalados en la notebook; no hay Supabase CLI ni `psql`.

## 4. Arquitectura destino

```
 navegador ──► novudent.novumholding.lat ──► Servidor Novudent (aparte, Coolify)
                                             ├─ app Next.js  (Docker, output standalone)
                                             ├─ Supabase: Kong → { PostgREST, GoTrue, Realtime } → Postgres
                                             ├─ proxy con HTTPS automático (el de Coolify)
                                             └─ respaldos cifrados ──► almacenamiento S3 externo
 Botika ───────────────────────────────────► Postgres (tabla outbox, clave de servicio)
 Lemon Squeezy ──► /api/webhooks/lemonsqueezy        Gemini · Resend · Upstash (sin cambios)
```

Servicios de Supabase activos: `db`, `auth` (GoTrue), `rest` (PostgREST), `realtime`, `kong`. **Apagados** al inicio: analytics/logflare, vector, imgproxy, storage, functions. `studio` queda sin exponer a internet (túnel SSH o Cloudflare Access).

### Dominios
`novudent.novumholding.lat` (app) y `api.novudent.novumholding.lat` (Kong). El navegador necesita ver la API por HTTPS: es el equivalente al dominio de Firestore.

## 5. Datos

### 5.1 Esquema
Se genera desde un **manifiesto de colecciones** (hoy `lib/backend/colecciones.json`, solo con los nombres; P2 le suma permisos e índices). Una tabla por subcolección:

```sql
create table public.<coleccion> (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (clinic_id, id)
);
```

- `clinics` es una tabla con `id` y `data` (sin `clinic_id`). Las colecciones raíz (`subscriptions`, `webhookEvents`, `leads`, `checkoutTokens`) son tablas `(id, data, updated_at)`.
- `directory` y `serviceAccounts` **desaparecen**: el enrutamiento uid → clínica sale de un índice sobre `users.data->>'authUid'`, y la «cuenta de servicio» pasa a ser la clave `service_role` de Supabase (no hay lista de permitidos que mantener).
- Índices: la clave `(clinic_id, id)`; `users (data->>'authUid')`; los que pidan los permisos (`directMessages` por `participants`); y los que sugiera la medición de P1 (p. ej. `appointments` por `data->>'start'`).
- `updated_at` lo mantiene un disparador.
- Las imágenes siguen en base64 dentro de `data` (Postgres las guarda comprimidas fuera de línea con TOAST). Pasarlas a Storage es una mejora posterior.

### 5.2 Operaciones (equivalencias exactas)
| Firestore | Postgres |
|---|---|
| `setDoc(doc, data)` sin merge | `insert … on conflict (clinic_id,id) do update set data = excluded.data` (reemplaza entero, igual que hoy) |
| `updateDoc(doc, {campo})` / `deleteField` | función `fijar_campo(tabla, clinic_id, id, campo, valor)`; `valor = null` se GUARDA como `null` (igual que Firestore) y la clave se quita solo con `undefined` (`data - campo`; el adaptador distingue ambos casos, p. ej. con un parámetro `quitar`). Un `campo` vacío o con punto se rechaza (Firestore lo leería como una ruta anidada). Lista blanca de tablas; corre con los permisos de quien llama |
| `setDoc(clinics/{cid}, {config}, {merge:true})` | función `mezclar_clinica(cid, parche)` con **fusión profunda de objetos** (los arreglos se reemplazan; `null` se guarda como `null`, no borra la clave), como la de Firestore |
| `deleteDoc` | `delete` |
| `writeBatch` | una sola llamada RPC con todas las operaciones dentro de una transacción |
| `getDocs(colección)` | `select data from … where clinic_id = $1` (RLS filtra) |
| `createIfAbsent` | `insert … on conflict do nothing` y se mira si insertó |
| `onSnapshot` | Realtime `postgres_changes` filtrado por `clinic_id` (ver §7) |

**Diferencia a cuidar:** en Firestore una consulta que incluye documentos no permitidos *falla entera*; en RLS esos documentos simplemente *no aparecen*. El cliente deja de necesitar el `catch permission-denied` y la consulta especial de `directMessages` (puede pedir todo y recibe lo suyo). Se conserva igual el filtro del cliente por seguridad en profundidad.

## 6. Permisos (RLS)

**Regla de oro: denegar por defecto.** Todas las tablas con `enable row level security` (sin `force`: las funciones auxiliares, que son del dueño de la tabla, tienen que poder leer `users` sin entrar en un ciclo de políticas). PostgREST solo expone `public`; `anon` y `authenticated` empiezan sin nada y reciben `select/insert/update/delete` solo a través de políticas.

### 6.1 Funciones auxiliares (equivalen a las de `firestore.rules`)
Todas `stable security definer` (con `search_path` fijo), para que no las bloquee la propia RLS y para poder cachearlas dentro de la consulta. Siempre `(select auth.uid())` para que Postgres las evalúe una vez.

| Regla de hoy | SQL |
|---|---|
| `isSignedIn` | `auth.uid() is not null` |
| `isService` | `auth.role() = 'service_role'` (la clave de servicio salta RLS; el navegador nunca la tiene) |
| `isDemo(cid)` / `isDemoRW(cid)` | `cid = 'cl_demo'` / `cid = 'cl_demo' and auth.uid() is not null` |
| `isMember(cid)` | existe un `users` de esa clínica con `data->>'authUid' = auth.uid()::text` y `active` distinto de `false` |
| `isAdmin(cid)` | lo anterior y `role = 'admin'` |
| `mi_usuario(cid)` (nueva) | el `id` del usuario de esa clínica para `auth.uid()` — hace falta porque `participants`, `fromId`, `dentistId`… guardan el `id` del usuario, no el uid de login |
| `tienePermiso`, `isCaja`, `isRecepcion`, `isClinical`, `puedeGastos`, `puedeLiquidaciones` | leen `clinics.data->'config'->'permisos'` y los roles de fábrica, igual que las reglas; **la lista de roles de fábrica sale del mismo manifiesto que ya ata `lib/permisosEquipo.test.ts`** |
| `effectivePlan`, `canWrite`, `canWritePremium` | leen la tabla `subscriptions` y el plan de la clínica |

La demo se lee con el rol `anon` (política `to anon using (clinic_id = 'cl_demo')`) y se escribe solo con sesión (anónima de GoTrue = rol `authenticated`).

### 6.2 Reglas por campo → disparadores
PostgreSQL no restringe por columna dentro de un `jsonb`. Un disparador `before insert or update` calcula las claves de primer nivel que cambiaron (`old.data` contra `new.data`) y rechaza (`raise exception … using errcode = '42501'`) si el rol no puede tocarlas. Son **5 reglas**, verificadas en `firestore.rules`:

| # | Dónde | Qué impide |
|---|---|---|
| 1 | `clinics` (línea 296) | un admin cambia la configuración pero **no `plan`** (lo fija la suscripción) |
| 2 | `clinics/{cid}/users` (312) | un usuario edita su propio documento solo en `name` y `color`; no `role`, `active`, `email`, `commissionPct` ni `mustChangePassword` (ese flag solo lo limpia el servidor) |
| 3 | `patients` (340 y 347) | un rol no clínico no crea ni modifica los campos clínicos: `emr`, `odontogram`, `prescriptions`, `ortho`, `perio` |
| 4 | `directMessages` alta (205) | lista cerrada de claves; `fromId` es quien escribe; `participants` son exactamente remitente y destinatario activo; texto de 1 a 2000 caracteres; `difusionId` solo del admin |
| 5 | `directMessages` update (538) | solo el destinatario y solo `readAt` (texto) |

El resto de las condiciones son de fila (`with check`) y se escriben directo como política.

### 6.3 Pruebas
Las 144 pruebas de reglas se **transcriben caso por caso** a pruebas contra Postgres real (contenedor Docker; se simula el JWT con `set local role` y `request.jwt.claims`). Criterio de aceptación: **cada caso da el mismo permitido/denegado** que en Firestore. Se agrega una tabla `caso → resultado` para revisar a mano las diferencias intencionales (las de «consulta entera contra consulta filtrada», §5.2).

## 7. Tiempo real
Las tablas con escucha entran en la publicación `supabase_realtime` con `replica identity full` (para que los `delete` lleguen con la clave). El cliente se suscribe con filtro `clinic_id=eq.<cid>` y Realtime aplica RLS por usuario. Hay que mantener el mismo comportamiento que hoy: el eco de `clinics` solo toma `permisos`/`rolesPropios`/`nombresDeRoles`, y `directMessages` solo trae lo propio salvo para el admin.

## 8. Login (GoTrue)

- **Usuarios existentes:** no se importan los hashes de Firebase (scrypt propio). La migración crea cada usuario real en GoTrue con su email y deja `data.authUid` apuntando al uuid nuevo; el `id` del usuario **no cambia**, así que ninguna referencia (`dentistId`, `participants`, `createdBy`…) se reescribe. Antes del corte, cada persona recibe un correo para **elegir contraseña nueva** (Resend como SMTP de GoTrue); también sirve «Olvidé mi contraseña».
- **Usuarios nuevos** (`/api/clinicas`, `/api/team-users`): se crean con la API de administración de GoTrue; el documento guarda `authUid` y, para usuarios nuevos, `id = authUid`.
- **Contraseña inicial obligatoria** (`/api/change-password`): pasa a `auth.updateUser` y conserva el flag que hoy fuerza el cambio.
- **Demo:** `GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true`. Un trabajo programado borra cuentas anónimas de más de 30 días (hoy 213 de 216 cuentas de Firebase eran anónimas).
- **Token en el servidor:** se verifica el JWT localmente con el secreto del proyecto (sin llamar a ningún servicio) y `isAnonymous` sale del claim `is_anonymous`. Reemplaza `lib/server/auth.ts`.
- **Enrutamiento multi-clínica:** `directory` se reemplaza por la búsqueda de `users` por `authUid` (índice); el adaptador expone `currentUserId()` que devuelve el `id` del *documento* de usuario, no el uid de login.

## 9. Capa de datos (P1)

Interfaz mínima entre la tienda y la base. `lib/store.tsx` deja de importar `firebase/*`.

```ts
interface BackendDeDatos {
  tipo: "firestore" | "supabase";
  // sesión
  iniciarSesion(email: string, clave: string): Promise<string>;     // devuelve el id del usuario
  iniciarDemo(): Promise<boolean>;
  cerrarSesion(): Promise<void>;
  usuarioActual(): Promise<string | null>;                          // id del documento de usuario
  token(): Promise<string | null>;
  enviarRecuperacion(email: string): Promise<void>;
  cambiarClave(nueva: string): Promise<void>;
  // datos
  cargarClinica(cid: string, opciones: OpcionesCarga): Promise<DB>; // reemplaza loadFirestore
  guardar(col: string, id: string, data: unknown): Promise<void>;   // fsSave
  quitar(col: string, id: string): Promise<void>;                   // fsDelete
  fijarCampo(col: string, id: string, campo: string, valor: unknown): Promise<void>; // fsCampo
  guardarConfig(cid: string, parche: unknown): Promise<void>;       // fsMeta
  lote(ops: OperacionDeLote[]): Promise<void>;                      // writeBatch
  escuchar(objetivo: ObjetivoDeEscucha, alCambiar: (docs: unknown[]) => void): () => void; // onSnapshot
}
```

> La interfaz que quedó (P1) es más fina y está en `lib/backend/tipos.ts`: `cargarClinica` se partió en `leerClinica` + `cargarDB` (`lib/backend/carga.ts`), `escuchar` en `escucharSuscripcion` / `escucharClinica` / `escucharColeccion`, y se sumaron `esperarSesion`, `iniciarSesionDeDemo` y `clinicaDelUsuario`. `cambiarClave` (el viejo `updateCurrentPassword` de `lib/firebase.ts`, que no usa nadie) quedó fuera de la interfaz a propósito.

- Se elige con `NEXT_PUBLIC_BACKEND=firestore | supabase`. **El valor por defecto es `firestore`**: publicar P1 no cambia nada visible.
- Del lado servidor, `lib/server/firestore-rest.ts` se parte en una interfaz `DatosDeServidor` con **las mismas 8 operaciones y firmas**; las 13 rutas solo cambian el `import`. La implementación Supabase usa la clave `service_role` con `pg` o PostgREST.
- Analytics deja de depender de Firebase: `gtag.js` directo con el mismo ID de medición y el mismo bloqueo por consentimiento (P3).
- Las pruebas e2e actuales (modo `local`) no cambian. Se suma un grupo chico de e2e contra el stack Supabase local (§12).

## 10. Servidor, empaquetado y operación

### 10.1 Empaquetado de la app (P4)
- `output: "standalone"` en `next.config.mjs`, `Dockerfile` en varias etapas (dependencias → compilación → ejecución con usuario sin privilegios), `.dockerignore`, ruta `GET /api/health` (nueva: responde 200 si la app y la base contestan).
- Variables de entorno, tabla en `docs/servidor/variables.md` con el equivalente de cada una:

| Hoy | Después |
|---|---|
| `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID`, `SERVICE_USER_EMAIL/PASSWORD`, `NEXT_PUBLIC_APPCHECK_SITE_KEY` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` |
| `GEMINI_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `LS_*`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `UPSTASH_*`, `OWNER_PANEL_KEY`, `NEXT_PUBLIC_*` de soporte | iguales |
| (nuevo) | `NEXT_PUBLIC_BACKEND`, `DATABASE_URL` si el servidor usa `pg` directo |

### 10.2 Servidor (se contrata más adelante)
Tamaño y ubicación acordados: **8 vCPU, 16 GB de RAM, 240 GB o más de NVMe**, un solo servidor para la app y Supabase; mínimo viable 4 vCPU, 8 GB, 160 GB. Con centro de datos en São Paulo o Asunción (30–60 ms de latencia; desde Europa ronda 200 ms y se nota porque el navegador habla directo con la base). Hay que confirmar proveedores y precios. **Esto es una estimación:** el volumen real de Firestore lo mide el script de exportación de P1 y se ajusta *antes* de contratar. Se pasa a separar base y app con más de 30 clínicas, la base arriba de 100 GB o CPU sostenida arriba del 60 %.

### 10.3 Endurecimiento y operación (guía en `docs/servidor/`)
- Cortafuegos: solo 80/443 abiertos y SSH por llave (sin contraseña, sin root), `fail2ban`. Postgres **nunca** expuesto. Studio solo por túnel.
- Secretos generados nuevos (JWT, claves anon/service, contraseñas de base) y guardados fuera del repositorio.
- Versiones de las imágenes de Supabase **fijadas**; actualización mensual primero en el stack local.
- Monitoreo: agente (Beszel o Netdata) hacia tu monitoreo actual y una comprobación **externa** de `/api/health` (Uptime Kuma en SRPY186) que avisa si el servidor entero cae.
- **Respaldos:** volcado lógico diario cifrado + archivado continuo de WAL con `pgBackRest` a almacenamiento S3 externo. Objetivo: **RPO ≤ 15 min, RTO ≤ 2 h**. **Prueba de restauración mensual**, anotada; un respaldo sin restaurar no cuenta.

## 11. Migración de datos y corte (P5, P7)

### 11.1 Exportar (P1)
`scripts/migracion/exportar-firestore.mjs`: lee, con una credencial de solo lectura (por defecto la sesión del CLI de Firebase) y por páginas, todas las clínicas y colecciones; escribe un archivo JSONL por colección y clínica y un `manifiesto.json` con cantidades, bytes y SHA-256. También informa: tamaño total, documentos más grandes, tipos de dato que no sean JSON puro (hay que confirmar que no aparece ningún `Timestamp`), usuarios reales frente a anónimos y clínicas reales. **Es de solo lectura.** La credencial por defecto es la sesión del CLI de Firebase (`firebase login`), porque es la única que lee `directMessages` (las reglas no se lo permiten al usuario de servicio); el comando es `npm run migracion:exportar`.

### 11.2 Cargar (P5)
`scripts/migracion/cargar-postgres.mjs`: lee el JSONL y hace `upsert` (se puede correr varias veces sin duplicar), crea los usuarios de GoTrue y reescribe `authUid`. Genera un informe: cantidades por colección contra el manifiesto, SHA-256 de cada documento (comparación completa, no por muestra) y diferencias.

### 11.3 Corte (P7)
1. Con 7 días de aviso: correo a cada usuario real con el enlace para elegir contraseña.
2. Simulacro completo en el servidor real, con una copia, mínimo dos veces; se cronometra.
3. **Ventana de mantenimiento corta** (fuera del horario de las clínicas): se publican reglas de Firestore que *niegan toda escritura* y la app muestra el aviso de mantenimiento.
4. Exportación final, carga, informe sin diferencias, pruebas de humo (login, abrir ficha, dar cita, cobrar, chat en tiempo real, reserva online, webhook de pago de prueba).
5. Cambio de DNS y de `NEXT_PUBLIC_BACKEND`. Botika y Lemon Squeezy se cambian en la misma ventana.
6. Firestore queda **solo lectura 14 días** y después se archiva.

**Marcha atrás:** solo es limpia *dentro de la ventana* (nada se escribió todavía en Supabase): se revierte el DNS y se republican las reglas viejas. Una vez abierto a los usuarios no hay retorno automático a Firestore; el riesgo se cubre con los simulacros. Si hiciera falta, se escribe entonces un script inverso Postgres → Firestore.

## 12. Botika (P6, otro repositorio)
Botika pasa de `firebase-admin` + `onSnapshot` a Supabase: lee/escribe la tabla `outbox` con la clave de servicio y escucha por Realtime (o consulta cada pocos segundos). El contrato de `docs/INTEGRACION-BOTIKA.md` (campos, estados `pendiente → enviado → respondido | error`) **no cambia**; se publica una v2 con el acceso nuevo. Se prueba contra el stack local antes del corte y se cambia en la misma ventana.

## 13. Pruebas y criterios de aceptación

| Parte | Cómo se acepta |
|---|---|
| P1 capa de datos | `tsc`, 1700+ pruebas unitarias y los e2e actuales siguen verdes sin cambios; la tienda no importa `firebase/*`; el script de exportación corre contra Firestore real y entrega el informe de volumen |
| P2 esquema y permisos | Las 144 pruebas de reglas dan el mismo resultado contra Postgres; informe de diferencias intencionales firmado |
| P3 adaptadores | Los e2e de login, ficha, cita, pago, chat en vivo y reserva online pasan con `NEXT_PUBLIC_BACKEND=supabase` contra el stack local; las 13 rutas `/api` pasan sus pruebas con la implementación Supabase |
| P4 empaquetado | La imagen arranca en Docker local con las variables documentadas; `/api/health` responde; el manual de instalación se probó de cero en un contenedor limpio |
| P5 migración | Con una copia real exportada: carga repetible dos veces seguidas sin diferencias; SHA-256 de todos los documentos coincide |
| P6 Botika | Una tarea de `outbox` recorre `pendiente → enviado → respondido` contra el stack local |
| P7 servidor | Carga con 30 clínicas × 10 usuarios simultáneos (k6) sin errores y con latencia aceptable; restauración de un respaldo completada; simulacros cronometrados |

## 14. Riesgos

| Riesgo | Qué hacemos |
|---|---|
| Una política RLS deja pasar de más o bloquea de menos | Denegar por defecto, 144 casos transcriptos, tabla de diferencias revisada, revisor independiente en las políticas de pacientes, pagos y usuarios |
| RLS lenta con funciones por fila | Funciones `stable` y `security definer`, `(select auth.uid())`, índices sobre `authUid` y las claves; medir con `EXPLAIN` y con la prueba de carga |
| Fusión profunda de `clinics.config` distinta a la de Firestore | Función con pruebas dedicadas (objetos anidados, arreglos, `null`) |
| Pérdida de datos al migrar | Exportación de solo lectura, carga repetible, comparación documento por documento, Firestore intacto 14 días |
| El servidor cae o se llena el disco | Monitoreo externo, alertas de disco, respaldos con restauración mensual, RPO/RTO definidos |
| Latencia alta si el servidor queda lejos | Elegir centro de datos cercano; medirlo antes de cerrar la contratación |
| Operar Supabase auto-alojado es trabajo continuo | Versiones fijadas, actualización mensual en local primero, guías en `docs/servidor/` |
| Dependencia de Google que queda | Firebase Auth/Firestore se apagan al terminar los 14 días; el ID de Analytics sigue siendo de Google y se usa con `gtag.js` |

## 15. Orden de trabajo

Cada parte lleva su plan, sus pruebas y se publica sola; las cuatro primeras **no necesitan servidor**.

| # | Parte | Necesita servidor | Depende de |
|---|---|---|---|
| P1 | Capa de datos + exportación y medición | No | — |
| P2 | Esquema generado, RLS, disparadores y las 144 pruebas | No (Docker local) | P1 (manifiesto) |
| P3 | Adaptador Supabase de cliente y de servidor, GoTrue, Realtime, analytics | No (Docker local) | P1, P2 |
| P4 | Dockerfile, health, variables, configuración Coolify, guías | No | P3 |
| P5 | Cargador de datos + verificación | No | P1, P2 |
| P6 | Contrato y cambio de Botika | No | P3 |
| P7 | Servidor real: instalar, respaldos, carga, simulacros, corte | **Sí** | P1–P6 |

## 16. Lo que vas a tener que decidir o contratar cuando llegue el momento
1. Proveedor y ciudad del servidor (con el volumen real de P1 a la vista).
2. Almacenamiento S3 externo para respaldos (Backblaze, Cloudflare R2 u otro).
3. Registros DNS de `api.novudent.novumholding.lat`.
4. La fecha y la hora de la ventana de corte, y el aviso a las clínicas.
5. Quién recibe las alertas de monitoreo.

## 17. Verificaciones que quedan abiertas (se cierran en P1)
- Volumen real de datos y documento más grande (hoy es una estimación).
- Que no haya `Timestamp` ni otros tipos que no sean JSON.
- Cantidad de clínicas y de usuarios reales.
- Si algún otro sistema, además de Botika, lee o escribe Firestore.
