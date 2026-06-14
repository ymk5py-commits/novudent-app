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
