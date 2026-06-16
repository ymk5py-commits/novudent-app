# Validación E2E de Novudent en producción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar de punta a punta que una clínica nueva opera en producción real (alta → login → equipo → reserva → agenda → WhatsApp) y dejar desplegadas las Firestore Rules estrictas con el aislamiento verificado.

**Architecture:** Validar-primero-blindar-al-final (híbrido). Los pasos con credenciales (Firebase Console, Vercel, `/superadmin`, login) los hace Carlos; los pasos programáticos (sondeo de endpoints en vivo, fixes de código) los hace el agente. Cada paso tiene un gate pass/fail explícito. Cualquier fallo se arregla test-first (Task F).

**Tech Stack:** Next.js en `novudent-app.vercel.app`, Firebase (Auth + Firestore proyecto `novudent-664f3`), Botika (repo aparte, integración vía outbox Firestore), `curl` para sondeo, Playwright para tests E2E.

**Convención de variables** (se rellenan en ejecución, NO son placeholders del plan):
- `$BASE` = `https://novudent-app.vercel.app`
- `$CID` = clinicId de la clínica de prueba (sale de la Task 1)
- `$DID` = id del dentista creado (sale de la Task 3)
- `$DATE` = una fecha futura hábil (lunes–sábado, dentro de +30 días), p. ej. `2026-06-22`

---

## Task 1: Alta de la clínica de prueba

**Files:** ninguno (acción en vivo + verificación por API).

- [ ] **Step 1 (Carlos): crear la clínica en `/superadmin`**

Abrí `https://novudent-app.vercel.app/superadmin`. Completá:
- Clave de propietario: tu `OWNER_PANEL_KEY` (la ponés vos en el navegador — **no la pegues en el chat**).
- Plan: **Clínica**.
- Nombre de la clínica: `Clínica Test E2E`.
- Admin: tu nombre, un **email que vos controles** (p. ej. `tucorreo+test@gmail.com`), contraseña temporal (≥6, p. ej. `Test2026`).

Click "Crear clínica y cuenta admin". Copiá del resultado: el **ID interno** (clinicId) y la **URL de agenda online**. Pasame el clinicId (no es secreto).

- [ ] **Step 2 (agente): verificar que la clínica existe por API**

Run:
```bash
curl -s "$BASE/api/reservas?clinicId=$CID&date=$DATE" | head -c 400
```
Expected (PASS): JSON `{"ok":true,"clinic":{"name":"Clínica Test E2E"},"dentists":[],"slots":{}}`
— `dentists` vacío es CORRECTO: la clínica nueva todavía no tiene equipo. Lo importante es `ok:true` + el nombre correcto ⇒ el doc de la clínica se creó en Firestore.

- [ ] **Step 3: gate**

PASS si el nombre coincide y `ok:true`. Si da 404/`Clínica no encontrada` → el alta falló → ir a Task F con el síntoma.

---

## Task 2: Login del admin + cambio de contraseña forzado

**Files:** ninguno (acción en vivo).

- [ ] **Step 1 (Carlos): primer login**

En una ventana nueva/incógnito, andá a `$BASE/login`, pestaña "Iniciar sesión", email + contraseña temporal del admin.
Expected: te redirige a la pantalla **"Creá tu contraseña"** (no al dashboard).

- [ ] **Step 2 (Carlos): cambiar la contraseña**

Ingresá una contraseña nueva (≥6) dos veces → "Guardar y continuar".
Expected: entra al **dashboard**, banner "Hola, <tu nombre>", badge de plan **Clínica** en la sidebar.

- [ ] **Step 3 (Carlos): re-login con la clave nueva (prueba de que el flag se limpió server-side)**

Cerrá sesión → `$BASE/login` → entrá con la contraseña **nueva**.
Expected: entra **directo al dashboard** (ya NO aparece el gate de contraseña).

- [ ] **Step 4: gate**

PASS si: (a) apareció el gate la primera vez, (b) el cambio funcionó, (c) el re-login con la clave nueva NO vuelve a mostrar el gate. Si el gate reaparece tras cambiarla → bug del flujo server-side de contraseña → Task F.

---

## Task 3: Crear el equipo (un dentista)

**Files:** ninguno (acción en vivo + verificación por API).

- [ ] **Step 1 (Carlos): crear un dentista**

Dashboard → Configuración → "Usuarios del equipo" → "Agregar usuario". Rol **Dentista**, nombre, un email que controles, contraseña temporal.
Expected: el usuario aparece en la lista; el badge de uso muestra **2** (admin + dentista).

- [ ] **Step 2 (agente): verificar que el dentista llegó a Firestore (vía disponibilidad)**

Run:
```bash
curl -s "$BASE/api/reservas?clinicId=$CID&date=$DATE" | python3 -m json.tool
```
Expected (PASS): ahora `dentists` incluye al dentista creado con su `id` y `name`, y `slots` trae sus horarios (08:00–17:30). Anotá su `id` como `$DID`.

- [ ] **Step 3: gate**

PASS si el dentista aparece en `dentists[]` con slots. Si sigue vacío → la creación de usuario no escribió bien → Task F.

- [ ] **Step 4 (opcional, límite de plan): intentar el 6º profesional**

Como el plan Clínica permite hasta 5 profesionales, este check es opcional. Si querés validarlo, creá dentistas hasta el 6º y verificá que el 6º muestre el error "Tu Plan Clínica permite hasta 5 profesionales…". PASS si aparece el mensaje.

---

## Task 4: Reserva online real

**Files:** ninguno (acción por API).

- [ ] **Step 1 (agente): crear una reserva para el dentista**

Run (rellenar `$CID`, `$DID`, `$DATE` con valores reales; `time` un slot libre como `09:00`):
```bash
curl -s -X POST "$BASE/api/reservas" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$CID\",\"dentistId\":\"$DID\",\"date\":\"$DATE\",\"time\":\"09:00\",\"nombre\":\"Paciente\",\"apellido\":\"Prueba\",\"ci\":\"9999999\",\"telefono\":\"+595999111222\",\"motivo\":\"Consulta de validación\"}"
```
Expected (PASS): `{"ok":true,"appointmentId":"a_...","botikaQueued":false}` (`botikaQueued:false` porque la clínica nueva nace con Botika desconectado — se conecta en la Fase 2).

- [ ] **Step 2 (agente): verificar que el slot quedó ocupado**

Run:
```bash
curl -s "$BASE/api/reservas?clinicId=$CID&date=$DATE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('09:00 libre?' , '09:00' in d['slots'].get('$DID',[]))"
```
Expected (PASS): `09:00 libre? False` (el slot ya no se ofrece).

- [ ] **Step 3 (agente): probar el lock atómico (doble reserva del mismo slot)**

Run el mismo POST de Step 1 con `time` = `10:00` dos veces seguidas:
```bash
for i in 1 2; do curl -s -o /dev/null -w "intento $i → %{http_code}\n" -X POST "$BASE/api/reservas" -H "Content-Type: application/json" -d "{\"clinicId\":\"$CID\",\"dentistId\":\"$DID\",\"date\":\"$DATE\",\"time\":\"10:00\",\"nombre\":\"P\",\"apellido\":\"Q\",\"ci\":\"8888888\",\"telefono\":\"+595999111223\"}"; done
```
Expected (PASS): el primero `200`, el segundo `409` (slot ocupado). Confirma el anti-doble-booking.

- [ ] **Step 4: gate**

PASS si Step 1 = ok:true, Step 2 = slot ocupado, Step 3 = 200 luego 409. Cualquier otro resultado → Task F.

---

## Task 5: La cita aparece en la agenda

**Files:** ninguno (acción en vivo).

- [ ] **Step 1 (Carlos): ver la cita en el dashboard**

Como admin, andá a Agenda → la fecha `$DATE`. Buscá la cita de las 09:00 con "Paciente Prueba" y el dentista.
Expected: la cita aparece con estado **pendiente**.

- [ ] **Step 2 (Carlos): ver el paciente creado**

Andá a Pacientes → buscá "Prueba" (CI 9999999).
Expected: el paciente existe (lo creó la reserva online).

- [ ] **Step 3: gate**

PASS si la cita pendiente y el paciente aparecen en el dashboard. Si la reserva dio ok:true pero no se ve en el dashboard → problema de lectura/scoping por clínica → Task F.

---

## Task 6: Confirmación por WhatsApp (Botika)

**Files (lado Novudent):** ninguno — config en vivo. La parte pesada es del repo Botika.

> **Nota:** una clínica nueva nace con `botika.connected:false`. Para esta fase hay que (a) conectar Botika en la clínica de prueba y (b) tener un **tenant de Botika linkeado** a `$CID` con credenciales YCloud. Si el setup del tenant es mucho ahora, usar el **fallback** del Step 4.

- [ ] **Step 1 (Carlos): activar Botika en la clínica de prueba**

Dashboard → Integraciones → activá la conexión Botika y la automatización **Confirmar cita**.

- [ ] **Step 2 (Carlos, lado Botika): linkear el tenant**

En Botika, asegurate de que exista un tenant con número YCloud y que esté **vinculado a `$CID`** (tabla `novudent_links`), y que el cron `novudent-outbox` esté activo (cron-job.org con el `CRON_SECRET`). Ref: `docs/INTEGRACION-BOTIKA.md`.

- [ ] **Step 3 (agente + Carlos): disparar y observar el ciclo**

Agente: crear una reserva nueva (repetir Task 4 Step 1 con otro slot y un **número de WhatsApp real de prueba**). Como ahora `botika.connected:true`, la respuesta debe traer `"botikaQueued":true`.
Carlos: en el WhatsApp de prueba debería llegar el mensaje de confirmación en ~30–60s; respondé **"Sí confirmo"**.
Expected: a los ~30s la cita pasa a **confirmada** en la agenda (badge confirmada, `confirmedVia: botika`).

- [ ] **Step 4 (fallback si el tenant de prueba no está listo): re-validar en `cl_demo`**

El ciclo WhatsApp ya se validó antes en una clínica linkeada (~29s). Si armar el tenant de prueba es mucho ahora, confirmá que el leg sigue vivo disparando una reserva en `cl_demo` (que ya tiene link) y observando la confirmación. PASS = ciclo observado en alguna clínica linkeada.

- [ ] **Step 5: gate**

PASS si: `botikaQueued:true` en la reserva + mensaje recibido + "Sí" → cita confirmada en la agenda (en la clínica de prueba o, por fallback, en `cl_demo`). Si el mensaje no llega → debug del lado Botika (tenant/YCloud/cron), no del código Novudent.

---

## Task 7: Blindar — desplegar las Firestore Rules

**Files:** `firestore.rules`, `SECURITY.md` (runbook), `test/firestore-rules.test.mjs` (CI).

- [ ] **Step 1 (Carlos): obtener el/los UID del service user**

Firebase Console → Authentication → Users. Buscá el email de `SERVICE_USER_EMAIL` (y `NOVUDENT_BOT_EMAIL` si difiere). Copiá su **User UID**.

- [ ] **Step 2 (Carlos): habilitar el service user en el allowlist**

Firebase Console → Firestore → crear colección `serviceAccounts` → documento con **ID = el UID** copiado, contenido `{ note: "botika-worker" }`. Repetir por cada UID de servicio.

- [ ] **Step 3 (Carlos): (opcional) correr los tests de reglas si tenés Java**

Run (en `novudent-app/`):
```bash
npm run test:rules
```
Expected: todos los tests PASS (aislamiento, self-update lista blanca, dinero solo staff, directory). Si no tenés Java, saltar — se valida en vivo en el Step 6.

- [ ] **Step 4 (Carlos): desplegar las reglas**

Run:
```bash
firebase login
firebase deploy --only firestore:rules
```
Expected: "Deploy complete!".

- [ ] **Step 5 (agente): verificar que los flujos de servicio siguen vivos post-reglas**

Run:
```bash
curl -s -o /dev/null -w "reservas GET → %{http_code}\n" "$BASE/api/reservas?clinicId=$CID&date=$DATE"
```
Expected (PASS): `200` — el service user sigue accediendo (allowlist OK). Si da 500/permiso → el `serviceAccounts/{uid}` está mal → revisar Step 2.

- [ ] **Step 6 (Carlos): prueba de aislamiento en vivo**

Logueado como admin de la clínica de prueba, abrí la consola del navegador y ejecutá una lectura cruzada:
```js
firebase.firestore().doc('clinics/cl_demo/patients/p1').get().then(d=>console.log('LEAK', d.exists)).catch(e=>console.log('OK denied', e.code))
```
Expected (PASS): `OK denied permission-denied`. Si imprime `LEAK true` → las reglas no aíslan → **rollback** (re-deploy de las reglas permisivas) y Task F.

- [ ] **Step 7: gate**

PASS si: reglas desplegadas + reservas GET sigue 200 + lectura cross-clínica denegada + la demo sigue cargando. Documentar el resultado en `SECURITY.md`.

---

## Task F: Plantilla TDD para cualquier fallo (se usa si algún gate falla)

**Cuándo:** un gate de las Tasks 1–7 falla. **Cómo:** causa raíz primero (`systematic-debugging`), luego fix test-first.

- [ ] **Step 1: reproducir con un test que FALLA**

Elegí el nivel correcto:
- Bug de endpoint en vivo → agregar un caso a `qa-flow.mjs` o un curl reproducible.
- Bug de lógica (store/plan/reglas) → test unitario o caso en `test/firestore-rules.test.mjs`.

Escribí el test que captura el síntoma exacto. Ejemplo (estructura):
```js
test("reproduce: <síntoma exacto>", async () => {
  const res = await fetch(`${BASE}/api/<ruta>`, { /* ... */ });
  assert.equal(res.status, /* lo ESPERADO, no lo que pasa hoy */);
});
```

- [ ] **Step 2: correr el test y confirmar que falla por la razón correcta**

Run: `node --test test/<archivo>` (o `node qa-flow.mjs`).
Expected: FAIL con el síntoma reproducido (no un error de setup).

- [ ] **Step 3: arreglar el código mínimo para que pase**

Implementá el fix más chico que verde el test. Mostrá el diff real.

- [ ] **Step 4: correr el test y confirmar verde + no-regresión**

Run: el test del Step 2 + `npx tsc --noEmit` + `npx next build` + `node qa-flow.mjs`.
Expected: el test nuevo PASS, tsc/build OK, qa-flow 🟢.

- [ ] **Step 5: commit + push + re-desplegar + re-validar el gate original**

```bash
git add -A && git commit -m "fix(e2e): <qué se arregló>" && git push origin main
```
Esperar el deploy de Vercel (~2 min) y volver a correr el gate que había fallado. PASS si ahora pasa.

---

## Self-review (cobertura del spec)

- Fase 1 (funcional) → Tasks 1–5. ✓
- Fase 2 (WhatsApp/Botika) → Task 6 (con fallback a `cl_demo`). ✓
- Fase 3 (blindar/reglas) → Task 7. ✓
- Fase 4 (arreglar TDD) → Task F. ✓
- Criterio de éxito del spec (alta → equipo → reserva → agenda → WhatsApp + reglas + aislamiento) → cubierto por los gates de 1–7. ✓
- Restricción "no exponer secretos" → Task 1 Step 1 y Task 7 explícitas (Carlos pone las claves, no se pegan en chat). ✓
