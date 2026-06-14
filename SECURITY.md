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

## Pendientes recomendados (no bloqueantes)
- **Rate limiting** en `/api/ia/*`, `/api/reservas` y `/api/clinicas` (p. ej.
  Upstash/Vercel KV) — hoy no hay límite por IP.
- Forzar **cambio de contraseña en el primer login** del admin creado en
  `/superadmin` (la credencial inicial viaja en texto al cliente).
- Histórico de NPS por paciente (hoy se guarda solo el último).
