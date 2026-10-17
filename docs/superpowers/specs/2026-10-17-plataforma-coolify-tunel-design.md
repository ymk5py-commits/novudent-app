# Plataforma en el servidor propio: Coolify + túnel de Cloudflare + Supabase — fase A

**Fecha:** 17-oct-2026 · **Pedido de:** Croman · **Estado:** plan por fases aprobado en la conversación del 17-oct. Este documento **actualiza** el de
`2026-10-09-servidor-propio-supabase-design.md` (que sigue valiendo para datos, permisos, login y migración) en lo que cambió al existir el servidor.

> «Todo lo de Firebase y todo en el servidor con Supabase y Coolify, y desactivar Vercel y Firebase una vez que migremos todo.»

## 1. Qué cambió respecto del spec del 9-oct

| Tema | Spec del 9-oct | Ahora |
|---|---|---|
| Servidor | Contratar uno en un centro de datos (São Paulo / Asunción), 8 vCPU / 16 GB, IP pública, Traefik con HTTPS | **El GMKtec de Croman** (i7-10875H, 32 GB, 394 GB libres), en su casa, **sin puertos abiertos**: todo entra por el túnel de Cloudflare |
| HTTPS | Let's Encrypt en el proxy de Coolify | **Lo pone Cloudflare** en el borde; hacia el servidor viaja HTTP por el túnel (loopback) |
| Dominio de la API | `api.novudent.novumholding.lat` | **`api-novudent.novumholding.lat`** (un solo nivel). El certificado gratuito de Cloudflare cubre `*.novumholding.lat` pero **no** un segundo nivel: el navegador daría error de TLS |
| Respaldos | S3 externo a elegir | **Cloudflare R2** (ya está en la cuenta de Croman), cifrados |
| Disponibilidad | Centro de datos | Luz e internet de una casa: aceptado mientras no haya pacientes reales; **la pila queda portable a un VPS** (mismos contenedores, otro host y un `cloudflared` nuevo) |

Todo lo demás del spec del 9-oct no cambia: Supabase auto-alojado, enfoque A (una tabla por colección con el documento en `jsonb`), RLS y disparadores, GoTrue, Realtime, `lib/backend/` como capa de datos.

## 2. Estado verificado el 17-oct-2026 (solo lectura)

- **Túnel `novum-gmktec`**: sano, 1 réplica, administrado **localmente**: las rutas viven en `/home/novum/.cloudflared/config.yml` del servidor (el proceso corre como usuario `novum`, no como servicio; no hace falta `sudo` para editarlo). Rutas actuales: `novumholding.lat`, `www.`, `novum-prueba.` → `localhost:3101`; `prueba.` → `http_status:200`; `novudent-prueba.novumholding.lat` → `localhost:3102`.
- **`novudent-app`** (puerto 3102) es un contenedor levantado **a mano** con docker compose en `~/deploy`, con el archivo de variables vacío. Se reemplaza por una aplicación de Coolify.
- **Coolify 4.4.6** sano, con un solo proyecto («My first project») y **ninguna aplicación**. Su proxy (Traefik v3.7) escucha en 80/443 con el proveedor de Docker (`exposedbydefault=false`) y un directorio de archivos dinámicos. Coolify todavía no tiene dominio propio (se entra por la IP de casa del servidor, puerto 8000).
- **Producción** sigue en Vercel: `novudent.novumholding.lat`. La zona `novumholding.lat` está en Cloudflare, así que el corte de DNS lo controlamos nosotros.
- La Mac no tiene Docker. **Todo lo que necesite contenedores corre en el servidor** (ver §6).
- La config web de Firebase está escrita en `lib/firebase.ts` (es pública por diseño): el build de la app **no** necesita variables de Firebase; solo el servidor las usa en tiempo de ejecución.

## 3. Arquitectura de la fase A

```
 navegador ─► Cloudflare (HTTPS, WebSocket) ─► túnel novum-gmktec (cloudflared, en el host)
                                                   │  service: http://localhost:80
                                                   ▼
                                       Traefik de Coolify (enruta por Host)
                                        ├─ novudent-prueba.novumholding.lat      → app Next.js (contenedor standalone)
                                        └─ api-novudent-prueba.novumholding.lat  → Kong (Supabase)
                                                                                     ├─ GoTrue · PostgREST · Realtime ─► Postgres
                                       Studio y Postgres: NO se publican (solo túnel SSH)
```

**El túnel apunta al Traefik de Coolify, no a cada puerto.** Cada recurso nuevo que Croman cree en Coolify se publica con su dominio sin volver a tocar el túnel; solo hace falta un registro DNS (CNAME proxied al túnel). Los dominios en Coolify se escriben con `http://` para que no pida certificados que Cloudflare ya cubre. `cloudflared` conserva las rutas específicas de Novum (`:3101`) por delante.

### Dominios

| Entorno | App | API (Kong) |
|---|---|---|
| Prueba (fase A) | `novudent-prueba.novumholding.lat` | `api-novudent-prueba.novumholding.lat` |
| Producción (fase F) | `novudent.novumholding.lat` | `api-novudent.novumholding.lat` |

`NEXT_PUBLIC_SUPABASE_URL` y la clave anónima se **hornean en el build**: la app de prueba y la de producción son dos recursos de Coolify con sus variables de compilación propias (o un redeploy con las de producción en el corte).

## 4. Pasos de la fase A

1. **A1 · Empaquetado (P4)**: `output: "standalone"` en `next.config.mjs`, `Dockerfile` en varias etapas con usuario sin privilegios, `.dockerignore`, `GET /api/health` y `docs/servidor/variables.md`. Se prueba con `docker build` en el servidor.
2. **A2 · Túnel → Traefik**: en `config.yml` del servidor se agregan `novudent-prueba` y `api-novudent-prueba` con `service: http://localhost:80` (se reemplaza la ruta a `:3102`); se crea el CNAME de `api-novudent-prueba` (el de `novudent-prueba` ya existe). Reinicio de `cloudflared` sin cortar las webs de Novum más de unos segundos.
3. **A3 · Aplicación en Coolify**: repositorio público `ymk5py-commits/novudent-app` (sin llave de despliegue), Dockerfile, dominio `http://novudent-prueba…`, variables de entorno (las que no se pueden generar las teclea Croman). Se da de baja el contenedor manual `novudent-app`.
4. **A4 · Supabase en Coolify**: servicio desde la plantilla de Coolify con las imágenes **fijadas** y solo `db`, `auth`, `rest`, `realtime`, `kong` (+ `studio` sin dominio público). Dominio `http://api-novudent-prueba…` sobre Kong. Secretos que genera Coolify (JWT, claves anon/service, contraseña de Postgres) y quedan fuera del repositorio.
5. **A5 · Verificación**: ver §5.

**Fuera de la fase A, a propósito:** tocar `novudent.novumholding.lat` o Vercel; cambiar `NEXT_PUBLIC_BACKEND` (la app de prueba sigue con `firestore` hasta la fase C); respaldos a R2 (fase F, pero con el diseño de este documento); apagar nada.

## 5. Criterios de aceptación de la fase A

- `https://novudent-prueba.novumholding.lat/api/health` responde 200 con la app corriendo **desde Coolify** (no desde el contenedor manual).
- La **demo** (`/login` → «Ver demo») abre y la tienda carga (usa Firebase anónimo y las reglas `isDemo`: no necesita ningún secreto del servidor).
- Supabase: `https://api-novudent-prueba.novumholding.lat/auth/v1/health` → 200; `/rest/v1/` con la clave anónima → 200; el WebSocket de `/realtime/v1/websocket` se establece a través del túnel.
- **Nada expuesto de más:** desde la red de casa y desde afuera no se llega a Postgres (5432), a Studio ni al puerto 8000 de Coolify por Cloudflare; el túnel no publica nada fuera de la lista.
- Los contenedores nuevos tienen política de reinicio (`unless-stopped` / la de Coolify) y las webs de Novum (`:3101`) siguieron respondiendo durante todo el proceso.
- `tsc`, las pruebas unitarias y `npm run build` siguen verdes.

## 6. Cómo se reparte el resto (fases B, C, D)

Cada una es una sesión propia, con su rama, sin tocar el servidor de producción ni Firebase; como la Mac no tiene Docker, los contenedores de prueba se levantan **en el servidor** con nombres `test-…`, ligados a `127.0.0.1` y se borran al terminar (o se usa un túnel SSH desde la Mac).

| Fase | Rama (el nombre real lleva prefijo y sufijo: buscala con `git branch --list '*<slug>*'`) | Es dueña de | No toca |
|---|---|---|---|
| B · esquema, RLS y 144 pruebas | `supabase-esquema-rls` | `supabase/**`, `scripts/supabase/**`, `test/rls/**` | `lib/**`, `app/**` |
| C · adaptador Supabase (cliente y servidor), login, tiempo real | `supabase-adaptadores` | `lib/backend/supabase*`, `lib/server/**`, `app/api/**`, `lib/firebase.ts` | `supabase/**` |
| D · cargador de datos con verificación | `migracion-cargador` | `scripts/migracion/cargar-postgres.mjs` y su prueba | el resto |

**Contrato entre B, C y D** (de §5 del spec del 9-oct): tablas `(clinic_id, id, data jsonb, updated_at)` generadas desde `lib/backend/colecciones.json`; funciones `fijar_campo`, `mezclar_clinica`, funciones auxiliares de RLS (`mi_usuario`, `isMember`…). B entrega **primero** el generador de esquema, las tablas y esas funciones (aunque falte el RLS) para que C y D se apoyen en eso.

## 7. Lo que va a tener que hacer Croman

1. **Coolify:** entrar al panel de Coolify (IP de casa del servidor, puerto 8000), activar «API Access» (Settings › Advanced), crear un token de API y guardarlo **en el servidor** con la entrada oculta (comando en el chat); el token nunca pasa por el chat.
2. **Variables sin generar:** teclear en el servidor las que no se pueden inventar (Gemini, Resend, Lemon Squeezy, Upstash, `OWNER_PANEL_KEY`). Las de Firebase desaparecen cuando termine la fase F.
3. **`sudo`** si en algún paso hiciera falta: lo escribe él en la terminal.
4. **Pendiente abierto del spec del 9-oct (§17):** decir si, además de Botika, algo más lee o escribe Firestore. No bloquea la fase A, sí el apagado de Firebase.

## 8. Riesgos de esta fase

| Riesgo | Qué hacemos |
|---|---|
| Reiniciar `cloudflared` corta por segundos las webs de Novum (`novumholding.lat`) | Se valida la configuración antes (`cloudflared tunnel ingress validate`), se conserva una copia de `config.yml` y se prueba `:3101` apenas vuelve |
| Un error en Coolify o en Traefik deja inaccesible el puerto 80 | La app de Novum corre por el túnel directo a `:3101`, no por Traefik: no depende de Coolify |
| El WebSocket de Realtime falla por Cloudflare | Se prueba en A5 antes de dar nada por hecho; el plan gratuito de Cloudflare admite WebSocket |
| Secretos de Supabase en el repositorio o en el historial | Los genera Coolify, viven en su base y nunca se escriben en el repo ni en el chat |
| Servidor casero cae (luz, internet) | Aceptado mientras no haya pacientes reales; en la fase F: UPS recomendado, respaldos a R2 y el plan de mover la pila a un VPS |
