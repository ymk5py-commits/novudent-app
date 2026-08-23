# Seguridad — Novudent

## 🔴 ACCIÓN #1 (antes del lanzamiento comercial): desplegar las Firestore Rules

Hoy el dashboard escribe/lee Firestore **directo desde el navegador**. Si las
reglas live están en modo permisivo (lo más probable, porque la app funciona con
auth anónima), **cualquier usuario logueado puede leer pacientes/facturación de
otra clínica**. El archivo [`firestore.rules`](firestore.rules) cierra esto con un
modelo de membresía. Pero hay que desplegarlo en el ORDEN correcto o se rompen
Botika y las reservas online (ambos usan un "usuario de servicio" que no es
miembro de ninguna clínica).

### Paso a paso

1. **Obtener el/los UID de servicio.** Firebase Console → Authentication → Users.
   Buscá el email de `SERVICE_USER_EMAIL` (el usuario con el que el servidor se
   autentica; ver Vercel envs de novudent-app y del repo Botika
   `NOVUDENT_BOT_EMAIL`). Copiá su **User UID**. Si Botika usa un email distinto,
   anotá ese UID también.

2. **Habilitar ese UID como servicio.** Firebase Console → Firestore → Data →
   crear colección `serviceAccounts` → documento con **ID = el UID** copiado
   (el contenido da igual, podés poner `{ note: "botika-worker" }`). Repetí por
   cada UID de servicio. Sin este paso, al desplegar las reglas el cron de Botika
   y `/api/reservas` van a empezar a fallar con permisos.

3. **Desplegar las reglas.** Desde `novudent-app/`:
   ```bash
   firebase login          # con la cuenta Google dueña del proyecto
   firebase deploy --only firestore:rules
   ```
   (Ya están `firebase.json` y `.firebaserc` con el proyecto `novudent-664f3`.)

4. **Probar inmediatamente después:**
   - Login de un admin real → ve su clínica. ✅
   - Reserva online en `/reservar/<clinicId>` → crea la cita (usa el service user). ✅
   - Ciclo Botika: tarea de outbox → confirmación por WhatsApp. ✅
   - La demo (`/login` → Ver demo) sigue cargando `cl_demo`. ✅
   - **Prueba de aislamiento**: con un admin de la clínica A logueado, abrí la
     consola del navegador e intentá
     `firebase.firestore().doc('clinics/OTRA_CLINICA/patients/x').get()` →
     debe dar **permission-denied**.

### Qué permite/niega el modelo
- **Miembro** (`clinics/{cid}/users/{uid}` existe) → lee/escribe los datos de SU
  clínica (pacientes, agenda, caja, etc.).
- **Admin** → además gestiona la lista de usuarios y la config/plan de la clínica.
  Un asistente/dentista **no** puede auto-ascenderse a admin (las reglas rechazan
  la escritura a `users/`).
- **Demo** (`cl_demo`) → sandbox abierto a cualquier sesión.
- **Service user** (allowlist `serviceAccounts/{uid}`) → acceso cross-clínica para
  el servidor (Botika, reservas, alta de clientes).
- **`directory/{uid}`** → cada uno lee solo su entrada; un admin solo puede crear
  entradas que apunten a su clínica y que no existan (no puede secuestrar el
  routing de otro). Cambios/borrados: solo servidor.

### Tests de las reglas (CI)
Hay un suite que prueba el aislamiento (`test/firestore-rules.test.mjs`):
```bash
npm run test:rules   # requiere Java (lo usa el emulador de Firestore)
```
Verifica: clínica A no lee/escribe la B, no-admin no escala a admin, self-update
acotado (mustChangePassword), demo abierta, directory protegido, serviceAccounts
inaccesible, y deny-by-default. Correlo antes de cada cambio a `firestore.rules`.

## Otras medidas aplicadas en código (esta auditoría)
- `/api/ia/*` ahora exige un **Firebase ID token** válido (`Authorization: Bearer`):
  se cerró el proxy abierto a Gemini y el canal de PII sin auth.
- `/api/clinicas`: la `OWNER_PANEL_KEY` se compara con `crypto.timingSafeEqual`
  (sin fuga de timing).
- Write-through del cliente atado a la **clínica cargada en memoria** (no a una
  variable global mutable) → sin escrituras cruzadas entre clínicas durante el
  cambio de clínica.
- `/api/reservas`: lock de slot atómico (anti doble-booking), política de fechas
  consistente y mensajes de error genéricos (sin filtrar paths internos).
- `.gitignore` cubre todos los `.env*` (no solo `.env*.local`).

## Resueltos en la 2ª pasada
- **Rate limiting** en `/api/ia/*` (por uid), `/api/reservas` (por IP, POST más
  estricto) y `/api/clinicas` (antibruteforce por IP) — `lib/server/rate-limit.ts`.
  ⚠ Es in-memory POR INSTANCIA (serverless). Para un límite global y persistente,
  cambiar el backend del rate-limiter por Upstash/Vercel KV (misma firma).
- **Cambio de contraseña obligatorio al primer login**: las cuentas creadas en
  `/superadmin` y en Configuración nacen con `mustChangePassword: true`; el
  `ChangePasswordGate` bloquea el dashboard hasta que el usuario crea su propia
  contraseña. Caduca la credencial inicial que viaja en texto.
- **Histórico de NPS** por paciente (`npsHistory[]`) — ya no se pierde ninguna
  respuesta; `nps` conserva la última por compatibilidad.

## 3ª pasada — hallazgos de la verificación adversarial (workflow multi-agente)
Un workflow de 6 dimensiones revisó los fixes y confirmó 14 hallazgos (verificando
cada uno adversarialmente). Los reales se corrigieron:
- **[ALTO] Regla self-update con lista negra** → un dentista podía subir su propio
  `commissionPct` (fraude) o limpiar `mustChangePassword`. Ahora la regla usa lista
  BLANCA: un usuario solo edita su propio `name`/`color`. role/active/clinicId/
  email/commissionPct/mustChangePassword son inmutables desde el cliente.
- **[ALTO] El gate de contraseña era solo-cliente** → el flag se podía limpiar por
  SDK sin rotar la clave. Ahora el cambio es 100% server-side: `/api/change-password`
  rota la contraseña vía Identity Toolkit y SOLO entonces el service user limpia
  el flag (inmutable desde el cliente). Imposible saltarse el cambio.
- **[ALTO] Seed de NPS duplicaba el histórico** (timestamps `at` desalineados entre
  paciente y tarea) → alineados; la idempotencia por `at` ya no duplica.
- **[MEDIO] Envenenamiento de `directory`** → un admin solo crea la entrada de un
  uid que YA es miembro de su clínica (`exists(users/{uid})`).
- **[MEDIO/regresión] `createTeamUser`** ahora espera y propaga el fallo del write
  (no deja cuentas de Auth sin doc) y resuelve el orden users→directory.
- **[BAJO] RBAC financiero a nivel reglas:** `payments`/`expenses` solo los escribe
  el staff (admin/asistente); el dentista no maneja dinero ni por SDK directo.
- **[BAJO] GC del rate-limiter** expira cada clave con SU ventana (no la del llamante).

Confirmado SIN cambios (verificación los validó): auth corre antes de Gemini en
las 4 rutas IA, ninguna respuesta filtra errores de Gemini/PII/credenciales, los
caps de payload siguen, el invariante clinicIdRef en el store se respeta.

## Pendiente recomendado (no bloqueante)
- Migrar el rate-limiter a Upstash/Vercel KV para límite global (hoy es por
  instancia de lambda).
- Correr `npm run test:rules` (Java) en CI antes de cada deploy de reglas.

## 4ª pasada — auditoría de seguridad externa + hardening aplicado

### Resuelto en código
- **[ALTO] Next.js desactualizado** (14.2.35, 4 CVEs high) → migrado a
  **Next 16.3.x + React 19** (`params` async con `React.use()`, framer-motion v12,
  script `lint` reemplazado por `typecheck`). `npm audit` = **0 vulnerabilidades**.
- **Rate limiting DISTRIBUIDO**: si se configuran `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` en Vercel, el contador vive en Redis (ventana
  deslizante vía pipeline REST) y la cuota es GLOBAL entre lambdas. Sin esas envs,
  sigue el modo in-memory de siempre. Fail-open ante caída de Redis (disponibilidad
  > rigidez; loguea 1 warn/min como máximo).
- **`/api/firmar` ya no descarga hasta 500 firmas** para buscar el token en memoria:
  nueva función `queryWhere()` en `lib/server/firestore-rest.ts` filtra EN Firestore
  (`token == X`). Funciona con cualquier tamaño de colección y viajan menos datos.
- **CSP endurecida** (next.config.mjs): además de `frame-ancestors 'self'`, ahora
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
  `upgrade-insecure-requests`. El script-src con nonces queda como hardening futuro.
- **App Check listo para activar** (opcional): con `NEXT_PUBLIC_APPCHECK_SITE_KEY`
  definida, `lib/firebase.ts` registra App Check (reCAPTCHA v3). Ver pasos más abajo.

### Pendiente en consolas / operación (no requiere código)

1. **Restringir la web API key** (#8): Google Cloud Console → APIs y servicios →
   Credenciales → clave `AIzaSy…` del proyecto → Restricciones de sitios web:
   dominios de prod + preview de Vercel + localhost. La seguridad de DATOS vive en
   las reglas, pero esto frena abuso de cuota/facturación de Identity Toolkit.

2. **Rotación periódica del service user** (#3): `SERVICE_USER_PASSWORD` es una
   llave maestra (el usuario está en `serviceAccounts/`). Rotarla cada 90 días:
   Firebase Console → Authentication → usuario de servicio → restablecer contraseña
   → actualizar env en Vercel (novudent-app Y Botika) → redeploy. Ojo con el orden:
   cambiar primero la env que NO está en uso no sirve — coordinar el corte.

3. **Higiene de la demo** (#6): `cl_demo` es público a propósito. NUNCA cargar
   datos reales de pacientes ahí. Si un prospecto carga algo propio, borrarlo desde
   la consola. Revisar de tanto en tanto que siga siendo datos de ejemplo.

4. **Activar App Check** (#7):
   - Firebase Console → App Check → registrar la app web con reCAPTCHA v3
     (dominio prod + localhost).
   - Vercel: `NEXT_PUBLIC_APPCHECK_SITE_KEY=<key>` → redeploy.
   - Dejar unos días en MODO MONITOREO y recién después poner Firestore en
     ENFORCED (proyecto Blaze = cada llamada abusiva es plata).

5. **script-src con nonces** (futuro): cerraría el XSS del todo. Requiere revisar
   Firebase, Recharts, framer-motion y el iframe de Jitsi antes de activarlo.
