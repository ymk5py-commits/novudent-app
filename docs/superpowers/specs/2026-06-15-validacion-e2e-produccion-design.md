# Validación E2E de Novudent en producción — Diseño

**Fecha:** 2026-06-15
**Objetivo:** Confirmar que el flujo completo de Novudent funciona en producción
real (Firebase + Vercel), de punta a punta, y dejar desplegada la seguridad
(Firestore Rules). Arreglar (test-first) cualquier cosa que se rompa.

## Contexto / estado actual (descubierto por sondeo en vivo)

Deploy: `novudent-app.vercel.app` (rama `main`, commit `f78f1dd`).

Sondeos a los endpoints en vivo (2026-06-15):
- `/login` → **200** (último código desplegado).
- `POST /api/clinicas` (key inválida) → **401** ⇒ `OWNER_PANEL_KEY` está seteada.
- `POST /api/change-password` y `/api/ia/contralor` (sin token) → **401** ⇒
  `FIREBASE_WEB_API_KEY` está seteada.
- `GET /api/reservas?clinicId=cl_demo` → **200** con "Clínica Demo Asunción" + 2
  dentistas + horarios ⇒ el **service user funciona** y la **clínica demo tiene
  datos** en Firestore.

Conclusión: envs OK, service user OK, datos demo presentes. Lo que falta validar
en real: el POST de reserva, el ciclo cliente (login → cambio de contraseña →
equipo → agenda), la confirmación por WhatsApp (Botika) y **el despliegue de las
Firestore Rules** (casi seguro aún permisivas: si estuvieran estrictas sin el
allowlist del service user, `/api/reservas` habría fallado).

## Enfoque

**A — Validar primero, blindar al final (híbrido).** Confirmar que todo el flujo
funcional anda en la prod actual; al cierre, desplegar las reglas estrictas y
re-verificar aislamiento. Razón: separar "¿funciona?" de "¿está cerrado?" para no
confundir un bug funcional con un bug de reglas (no hay Java/emulador local para
probar las reglas antes de desplegar).

Descartados: **B (blindar primero)** — un detalle fino en las reglas rompería todo
a la vez; **C (suite E2E automatizada contra prod)** — crea datos basura en prod
real y varios pasos no se automatizan (consola Firebase).

## Restricciones

- No tengo acceso a la consola de Firebase, a Vercel ni al navegador del usuario.
  Los pasos con credenciales/login los hace Carlos; yo verifico programáticamente
  (sondeo de endpoints en vivo) y arreglo el código.
- **Nunca exponer secretos en el chat** (la `OWNER_PANEL_KEY` la pone Carlos en el
  navegador; me pasa solo el `clinicId` y la URL de reserva, que no son secretos).
- No hay Java/emulador en esta máquina → las reglas se validan con `npm run
  test:rules` en CI (artefacto) y por verificación en vivo tras el deploy.

## Plan de validación (fases)

### Fase 1 — Flujo funcional (prod actual)
1. **Alta de clínica de prueba** — Carlos: en `/superadmin` crea "Clínica Test" +
   admin. Yo: verifico por API. **Gate:** clínica + admin + directory existen
   (la GET de reservas del nuevo `clinicId` responde con el nombre).
2. **Login admin + cambio de contraseña forzado** — Carlos: entra a `/login`.
   **Gate:** aparece el `ChangePasswordGate`, cambia la clave, entra al dashboard.
3. **Crear equipo** — Carlos: Configuración → Usuarios → crea un dentista.
   **Gate:** usuario creado, respeta el límite del plan.
4. **Reserva online real** — Yo: `POST /api/reservas` de esa clínica. **Gate:**
   `ok:true` + el slot queda ocupado al re-consultar.
5. **Cita en la agenda** — Carlos: abre la agenda. **Gate:** la cita "pendiente"
   aparece.

### Fase 2 — WhatsApp (Botika)
Conectar la clínica de prueba a un tenant de Botika (YCloud + link de la clínica)
→ la tarea outbox dispara WhatsApp → "Sí confirmo" → la cita pasa a *confirmada*.
**Gate:** mensaje recibido, respuesta "Sí" → cita `confirmada` reflejada en la
agenda (ciclo ya validado antes ~29s; acá se hace con una clínica real).

### Fase 3 — Blindar (despliegue de reglas)
1. Carlos: saca el UID del service user (Firebase Auth → Users → email de
   `SERVICE_USER_EMAIL` / `NOVUDENT_BOT_EMAIL`).
2. Carlos: crea `serviceAccounts/{uid}` en Firestore.
3. Carlos: `firebase deploy --only firestore:rules`.
**Gate:** `/api/reservas` sigue en 200 (service user OK post-reglas); un intento de
lectura cross-clínica en la consola del navegador da `permission-denied`; la demo
sigue cargando. (Runbook completo en `SECURITY.md`.)

### Fase 4 — Arreglar lo que se rompa (TDD)
Cualquier fallo en 1-3 → `systematic-debugging` para la causa raíz → fix
**test-first** (`test-driven-development`) → redeploy → re-validar el gate.

## Criterio de éxito

Una clínica nueva se puede dar de alta, su admin entra y crea su equipo, un
paciente reserva online, la cita aparece en la agenda y se confirma por WhatsApp,
y todo corre con las Firestore Rules estrictas desplegadas y el aislamiento entre
clínicas verificado en vivo.

## Riesgos / abiertos

- **Fase 2 (Botika)** necesita setup del lado del repo Botika (tenant, YCloud,
  link de la clínica de prueba). Es el tramo más pesado y puede requerir credenciales
  de Carlos.
- Desplegar reglas no probadas localmente (sin emulador) tiene riesgo; se mitiga
  con la verificación en vivo inmediata de la Fase 3 y el rollback (re-deploy de
  las reglas permisivas) si algo falla.
- Datos de prueba en prod: la clínica "Test" queda en Firestore; se puede borrar al
  final o dejar como clínica de staging.
