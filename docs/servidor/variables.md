# Variables de entorno de Novudent en el servidor propio

Lista sacada del código el 17-oct-2026 (`process.env.*` en `app/`, `lib/`, `components/`, `scripts/` y `next.config.mjs`). **Antes del corte, compararla con la
de Vercel** (Settings › Environment Variables): lo que esté allá y no acá es una variable que el código ya no usa o que se nos escapó.

En Coolify se cargan en la aplicación (Configuration › Environment Variables). Las `NEXT_PUBLIC_*` tienen que marcarse **«Build Variable»**: se
hornean en el código compilado (el navegador las lee de ahí) y cambiarlas obliga a **volver a construir**. Las demás se leen al arrancar y se
cambian con un reinicio. **Ningún valor va al repositorio ni al chat**; los secretos se teclean en Coolify o en el servidor.

## En tiempo de ejecución (no `NEXT_PUBLIC_`)

| Variable | Para qué | Notas |
|---|---|---|
| `IP_CLIENTE_HEADER` | Qué header trae la IP real del cliente para los límites de uso | **En el servidor propio: `cf-connecting-ip`.** No ponerla en Vercel. Sin ella se usa `x-forwarded-for`, que detrás de Traefik trae siempre la IP del túnel (todos compartirían un mismo límite). Si está y el header falta, el pedido cae en el balde `sin-proxy` |
| `GEMINI_API_KEY` | IA (voz, visión, texto) | Secreta. Google AI Studio |
| `GEMINI_TEXT_MODEL`, `GEMINI_AUDIO_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_IMAGE_MODEL` | Modelo de cada tipo de uso | Opcionales: tienen valor por defecto en el código |
| `CORREO_PROVEEDOR`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Correo SMTP propio para avisos de cita y contacto | `CORREO_PROVEEDOR=smtp`, puerto 465 o 587 y remitente autorizado. Ver `correo-propio.md`. Secretos solo en ejecución |
| `RESEND_API_KEY`, `EMAIL_FROM` | Compatibilidad con instalaciones que ya usan Resend | Se conserva si no se selecciona SMTP; nunca como respaldo automático de una configuración SMTP incompleta |
| `LEADS_EMAIL` | Destino de los pedidos del formulario de contacto | |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Firma del webhook de pagos | La URL del webhook en Lemon Squeezy es la del dominio de producción: no cambia con el corte |
| `LS_VARIANT_SOLO`, `LS_VARIANT_CLINICA`, `LS_VARIANT_CADENA`, `LS_LEGACY_CHECKOUT_ENABLED` | Variantes de los planes | |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Límite de uso compartido entre instancias | Opcionales. Con una sola instancia (como en el servidor) alcanza la memoria del proceso |
| `OWNER_PANEL_KEY` | Clave del panel `/superadmin` | La elige Croman |
| `TRIAL_DIAS` | Días de prueba de una clínica nueva | Opcional |

## Solo mientras exista Firebase (se van en la fase F)

| Variable | Para qué |
|---|---|
| `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID` | Verificar tokens y hablar con Firestore desde las rutas `/api` |
| `SERVICE_USER_EMAIL`, `SERVICE_USER_PASSWORD` | El «usuario de servicio» con el que las rutas escriben en Firestore (ver `ARCHITECTURE.md` §2) |

## Se hornean en el build (`NEXT_PUBLIC_*`, «Build Variable» en Coolify)

| Variable | Para qué | Valor por defecto |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Dominio propio (canónica, sitemap, redirección desde `novudent-app.vercel.app`) | `https://novudent.novumholding.lat`. **En la app de prueba, la URL de prueba** |
| `NEXT_PUBLIC_BACKEND` | Qué backend usa la tienda: `firestore` o `supabase` | `firestore`. Pasa a `supabase` en la fase C/F |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | URL de Kong (`https://api-novudent….novumholding.lat`) y clave anónima | Solo con `NEXT_PUBLIC_BACKEND=supabase` (ver la sección de Supabase) |
| `NEXT_PUBLIC_APPCHECK_SITE_KEY` | App Check de Firebase | Sin ella no se registra nada |
| `NEXT_PUBLIC_WHATSAPP_VENTAS`, `NEXT_PUBLIC_SOPORTE_WHATSAPP`, `NEXT_PUBLIC_SOPORTE_HORARIO`, `NEXT_PUBLIC_SOPORTE_EMAIL`, `NEXT_PUBLIC_CONTACTO_LEGAL` | Datos de contacto y soporte que muestra la web | Ver `lib/site.ts` |

La config web de Firebase no es una variable: está escrita en `lib/firebase.ts` (es pública por diseño).

## Supabase (fase C: `NEXT_PUBLIC_BACKEND=supabase`)

La misma variable `NEXT_PUBLIC_BACKEND` elige la base del navegador **y** la de las rutas `/api` (`lib/server/backend.ts`): se hornea al compilar y las dos tienen que coincidir.
Las genera Coolify al crear el servicio de Supabase (ver `supabase.md`); ninguna va al repositorio ni al chat.

| Variable | Cuándo | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build (`NEXT_PUBLIC_*`) | El navegador habla con Kong (`https://api-novudent….novumholding.lat`) con la clave anónima (pública por diseño) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ejecución, **secreta** | Las rutas `/api` leen y escriben con ella (se salta RLS) y crean las cuentas con la API de administración de GoTrue. Nunca llega al navegador |
| `SUPABASE_JWT_SECRET` | Ejecución, **secreta** | Verificar en el servidor, sin llamar a nadie, el token de sesión (HS256) de quien llama a las rutas `/api` |
| `SUPABASE_URL` | Ejecución, opcional | URL de Kong **para el servidor**, si es distinta de la pública (por ejemplo, la interna de la red de Docker: no da la vuelta por Cloudflare). Sin ella se usa `NEXT_PUBLIC_SUPABASE_URL` |

`/api/health` consulta la base cuando el backend es Supabase y responde 503 si no contesta. La clave anónima también la usa el servidor (iniciar sesión para recuperar una cuenta y cambiar la contraseña con el token de quien llama).
`DATABASE_URL` no hace falta: el servidor habla con PostgREST por HTTP, no con `pg`.

## Solo para pruebas (no van en producción)

`FIRESTORE_EMULATOR_HOST`, `PARITY_CAPTURE`.
