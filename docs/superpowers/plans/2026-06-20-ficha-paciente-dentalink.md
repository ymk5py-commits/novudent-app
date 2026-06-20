# Ficha de paciente estilo Dentalink — Implementation Plan

**Goal:** Reestructurar la ficha del paciente a los 5 grupos Dentalink (navegación de 2
niveles) y agregar la vista "Plan de tratamiento" de 2 columnas (presupuesto + seguimiento
de Ortodoncia con progreso/evoluciones), reusando al máximo lo que ya existe.

**Architecture:** Extender `Budget` (`planType`) y `OrthoRecord` (campos de la captura) —
sin entidad/colección nueva. Helpers puros TDD: `budgetRealizado` (en `lib/budgets.ts`) y
`orthoProgress` (`lib/ortho.ts`). Vistas nuevas: `PlanTratamiento` (2 columnas) →
`Ortodoncia` (5 sub-tabs); `DatosTab`; `RecibirPagoTab`. `page.tsx` pasa a navegación de 2
niveles. Reusa `lib/budgets.ts`, `setOrtho`/`addOrthoControl`/`upsertPatient`/`addPayment`,
`PatientBriefButton`, `RadiografiasTab`, `compressImage`, `ui.tsx`, `motion.tsx`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (web SDK), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-20-ficha-paciente-dentalink-design.md`

**Branch:** ya estás en `feat/ficha-paciente-dentalink` (desde `main`). No mergear hasta el final.

**Sin cambios:** `lib/store.tsx`, `firestore.rules`, `lib/plan.ts`, `components/PlanGate.tsx`.

---

## Task 1: Tipos + seed

**Files:** Modify `lib/types.ts`, `lib/seed.ts`

- [ ] **Step 1:** En `lib/types.ts`, `interface Budget` += `planType?: "general" | "ortodoncia";`.
- [ ] **Step 2:** En `interface OrthoRecord` += campos opcionales: `totalMonths?`, `progressReal?`,
  `upperArch?`, `lowerArch?`, `elasticType?`, `elasticConfig?`, `nextControlDate?`,
  `hygieneCurve?`, `nextSessionNotes?` (tipos según el spec).
- [ ] **Step 3:** En `lib/seed.ts`: enriquecer el `ortho` del paciente p1 con `totalMonths: 24`,
  `progressReal` (~15), `upperArch`/`lowerArch`/`elasticType`/`elasticConfig`,
  `hygieneCurve: 2.0`, `nextSessionNotes`, y ≥1 `controls` con una evolución realista
  ("Mantenimiento mensual — arco expandido…"). Marcar el budget g1 (patientId p1)
  `planType: "ortodoncia"`.
- [ ] **Step 4: Verify** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run` → verde.
- [ ] **Step 5: Commit** `git add lib/types.ts lib/seed.ts && git commit -m "feat(ficha): Budget.planType + OrthoRecord extendido (tracking ortodoncia) + seed demo"`

## Task 2: Helpers puros + tests (TDD)

**Files:** Create `lib/ortho.ts`, `lib/ortho.test.ts`, `lib/budgets.test.ts`; Modify `lib/budgets.ts`

- [ ] **Step 1: Tests primero.** `lib/budgets.test.ts`: `budgetRealizado` (Σ ítems realizados con
  descuento; 0 si ninguno; aplica `discountPct`). `lib/ortho.test.ts`: `orthoProgress`
  (calendarPct por meses transcurridos/total; clamp 0–100; realPct = progressReal clamp;
  sin startDate/totalMonths → 0 sin romper; basura → no NaN).
- [ ] **Step 2: Run, confirm fail** `npx vitest run lib/budgets.test.ts lib/ortho.test.ts`.
- [ ] **Step 3: Implement.** `lib/budgets.ts` += `budgetRealizado(b: Pick<Budget,"items"|"discountPct">)`.
  `lib/ortho.ts`: `orthoProgress(ortho, now = Date.now())` → `{ monthsElapsed, totalMonths, calendarPct, realPct }`
  (meses = floor((now − startDate)/30.44d), clamp todo, tolerante a `undefined`).
- [ ] **Step 4: Run, confirm pass** `npx vitest run lib/budgets.test.ts lib/ortho.test.ts`.
- [ ] **Step 5: Commit** `git add lib/budgets.ts lib/budgets.test.ts lib/ortho.ts lib/ortho.test.ts && git commit -m "feat(ficha): helpers budgetRealizado + orthoProgress (TDD)"`

## Task 3: Panel de Ortodoncia (5 sub-tabs)

**Files:** Create `components/Ortodoncia.tsx`

- [ ] **Step 1: Implement** `OrtodonciaPanel({ patient, budget })` — `"use client"`:
  - Si `!patient.ortho?.active` → estado "Activar ortodoncia" (reusa el patrón del `OrthoForm`
    de `PatientExtras.tsx`: aparatología/diagnóstico/inicio/cuota → `setOrtho`). Pedir
    además `totalMonths`.
  - Activo → barra de 5 sub-tabs (`Resumen · Plantilla Fotográfica · Diagnóstico · Plan de tratamiento · Rx y CF`):
    - **Resumen:** 2 donuts SVG (componente local `Donut` con `orthoProgress(...)`:
      Calendario/Real), "X de N meses", grilla de campos (arcos sup/inf, tipo/config
      elásticos, próximo control, curva higiene, indicaciones próxima sesión, aparatología),
      tarjeta "Última evolución" (control más reciente: `note` + `date` + `by`), botones
      **Editar** (modal que edita el tracking → `setOrtho({...o, ...patch})`) y **+ Nueva
      evolución** (modal note → `addOrthoControl`). Solo `emr.write` ve los botones.
    - **Plantilla Fotográfica:** grid de `patient.files` kind `imagen`; botón subir (reusa
      `compressImage` + `addPatientFile`). Si vacío → `Empty`.
    - **Diagnóstico:** textarea con `ortho.diagnosis` (guardar → `setOrtho`); debajo lista de
      `patient.emr` kind `diagnostico` (lectura).
    - **Plan de tratamiento:** lista `budget.items` (cpt/description/tooth/price) con Badge
      realizado/pendiente; subtotal/total con `budgetTotal`. Link "Gestionar presupuestos".
    - **Rx y CF:** `<RadiografiasTab patient={patient} />`.
  - Estilo: `Card/Badge/Btn/Modal/Field/inputCls` de `ui.tsx`; donuts navy/azure.
- [ ] **Step 2: Verify** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `git add components/Ortodoncia.tsx && git commit -m "feat(ficha): panel de Ortodoncia (resumen/progreso/evoluciones + 5 sub-tabs)"`

## Task 4: Vista Plan de tratamiento (2 columnas)

**Files:** Create `components/PlanTratamiento.tsx`

- [ ] **Step 1: Implement** `PlanTratamiento({ patient })`:
  - `budgets` del paciente (orden por fecha desc). Si 0 → `Empty` + link a Presupuestos.
  - Selector de plan (si >1): botones "Plan #id · {planType==ortodoncia?"Ortodoncia":"General"}".
  - Layout `grid lg:grid-cols-[330px_1fr] gap-5`.
  - **Izquierda** (`Card` con cabecera navy/`mesh-hero`): "Plan de tratamiento #{id}" + botón
    copiar id; `PatientBriefButton` (solo `useClinicPlan().features.includes("ia")`); título
    especialidad; tarjeta blanca "Presupuesto total": Descuento comercial `discountPct`% ·
    Realizado `budgetRealizado` · Abonado `budgetPaid(id,payments)` · Saldo por abonar
    `budgetBalance` (todos `fmtGs`), lista de abonos del budget / "No hay abonos"; Profesional
    a cargo = `db.users.find(u=>u.id===b.dentistId)?.name`.
  - **Derecha:** tabs `Ortodoncia / Odontograma`. Ortodoncia → `<OrtodonciaPanel patient budget>`.
    Odontograma → `<Odontogram value={patient.odontogram ?? {}} editable={emr.write} … onChange={setTooth}>`.
    (Si `planType !== "ortodoncia"` arrancar en Odontograma.)
- [ ] **Step 2: Verify** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `git add components/PlanTratamiento.tsx && git commit -m "feat(ficha): vista Plan de tratamiento 2 columnas (panel financiero + seguimiento)"`

## Task 5: Vistas admin (Datos + Recibir pago)

**Files:** Create `components/PatientDatos.tsx`, `components/RecibirPago.tsx`

- [ ] **Step 1:** `components/PatientDatos.tsx` → `DatosTab({ patient })`: form (firstName,
  lastName, document, phone, email, birthDate, insurer) → `upsertPatient({...patient,...})`.
  Editable si `can(role,"engagement.forms") || can(role,"emr.write")`, si no solo lectura.
- [ ] **Step 2:** `components/RecibirPago.tsx` → `RecibirPagoTab({ patient })`: lista budgets con
  `budgetBalance > 0`; al elegir uno, form de abono (monto ≤ saldo, fecha, `method`
  efectivo/tarjeta/transferencia/qr, concepto) → `addPayment({ id, clinicId, patientId,
  budgetId, date, amount, method, concept, receivedBy: session.name })`. Muestra saldo
  actualizado. Permiso `can(role,"billing.reports") || can(role,"emr.write")`.
- [ ] **Step 3: Verify** `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `git add components/PatientDatos.tsx components/RecibirPago.tsx && git commit -m "feat(ficha): vistas Datos personales + Recibir pago"`

## Task 6: Navegación de 2 niveles (wiring)

**Files:** Modify `app/app/pacientes/[id]/page.tsx`

- [ ] **Step 1:** Definir grupos y sub-tabs:
  ```ts
  type SubTab = "datos"|"formularios"|"archivos"|"consentimientos"
    |"resumen"|"odontograma"|"periodoncia"|"historial"|"radiografias"|"recetas"
    |"planes"|"facturacion"|"recibir-pago";
  const GROUPS = [
    { key:"datos-personales", label:"Datos personales", tabs:["datos","formularios","archivos","consentimientos"] },
    { key:"ficha-clinica", label:"Ficha clínica", tabs:["resumen","odontograma","periodoncia","historial","radiografias","recetas"] },
    { key:"planes", label:"Planes de tratamiento", tabs:["planes"] },
    { key:"facturacion", label:"Facturación y pagos", tabs:["facturacion"] },
    { key:"recibir-pago", label:"Recibir pago", tabs:["recibir-pago"] },
  ];
  ```
- [ ] **Step 2:** Estado `const [tab, setTab] = useState<SubTab>("resumen")`. El grupo activo se
  deriva del `tab`. Render: **barra de grupos** (click → primer sub-tab del grupo) + **barra
  de sub-tabs** del grupo activo (ocultar si el grupo tiene 1 solo sub-tab). Mantener labels
  e iconos lucide; conservar el badge de formularios pendientes.
- [ ] **Step 3:** Mapear renders: `datos`→`<DatosTab>`; `formularios`→bloque existente;
  `archivos`→`<FilesTab>`; `consentimientos`→`<ConsentimientosTab>`; `resumen`→bloque
  existente (+`RecoveryCard`); `odontograma`/`periodoncia`/`historial`→bloques existentes;
  `radiografias`→`<RadiografiasTab>`; `recetas`→`<RxTab>`; `planes`→`<PlanTratamiento>`;
  `facturacion`→bloque existente; `recibir-pago`→`<RecibirPagoTab>`. Quitar los tabs planos
  `presupuestos` y `ortodoncia` (absorbidos en `planes`) y sus imports muertos
  (`BudgetsTab`/`OrthoTab` ya no se usan acá).
- [ ] **Step 4: Verify** `npx tsc --noEmit && npm run build`.
- [ ] **Step 5: Commit** `git add "app/app/pacientes/[id]/page.tsx" && git commit -m "feat(ficha): navegación 2 niveles estilo Dentalink (5 grupos + sub-tabs)"`

## Task 7: Verificación final

- [ ] **Step 1:** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run && npm run build` → todo verde, build EXIT 0.
- [ ] **Step 2: Smoke** (`npm run dev`): login demo → un paciente → grupo "Planes de tratamiento"
  → ver 2 columnas (presupuesto + ortodoncia con progreso) → editar tracking → agregar
  evolución → "Recibir pago" registra abono y baja el saldo.
- [ ] **Step 3:** Dejar la rama lista (sin mergear). Resumen para el usuario.

---

## Self-Review

- **Cobertura del spec:** tipos+seed (T1), helpers TDD (T2), panel ortodoncia 5 sub-tabs +
  progreso + evoluciones (T3), vista 2 columnas + panel financiero (T4), Datos + Recibir
  pago (T5), navegación 2 niveles + wiring + quitar tabs absorbidos (T6), verificación (T7).
- **Reuso:** `lib/budgets.ts` (financiero), `setOrtho`/`addOrthoControl`/`upsertPatient`/
  `addPayment` (sin acciones nuevas), `PatientBriefButton`/`RadiografiasTab`/`compressImage`/
  `Odontogram`/`ui.tsx`/`motion`. Sin colección/regla/plan nuevos.
- **Consistencia de tipos:** `Budget.planType` + `OrthoRecord+` (T1) consumidos por
  `budgetRealizado`/`orthoProgress` (T2) y por `Ortodoncia`/`PlanTratamiento` (T3/T4);
  vistas nuevas (T3/T4/T5) cableadas en `page.tsx` (T6).
- **Riesgo:** `page.tsx` toca navegación — `npm run build` en T6/T7 valida. Un
  `patient.ortho` por paciente (documentado).
