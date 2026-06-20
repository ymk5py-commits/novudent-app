# Ficha de paciente estilo Dentalink — Diseño

**Fecha:** 2026-06-20
**Tipo:** Feature de paridad con Dentalink (Novudent puro — no toca Botika)
**Programa:** Paridad Dentalink. Reestructura la ficha del paciente y agrega la vista
"Plan de tratamiento" de 2 columnas con seguimiento de Ortodoncia.

## Objetivo

Replicar la **ficha del paciente de Dentalink**: navegación de 2 niveles (5 grupos de
nivel superior con sub-tabs adentro) y, dentro de "Planes de tratamiento", la vista de
**2 columnas** que combina el **presupuesto** (panel financiero) con el **seguimiento
clínico de la especialidad** (Ortodoncia), con progreso, arcos, elásticos, controles y
evoluciones por sesión. Referencia visual: captura de la ficha de "Jessica Roman /
Plan #3219 / Ortodoncia / Resumen" aportada por el usuario.

## Decisiones (del brainstorming)

1. **Alcance:** reestructuración completa de la ficha a los 5 grupos Dentalink **+** la
   vista "Plan de tratamiento" de 2 columnas con el seguimiento de Ortodoncia rico
   (confirmado: "todo junto en un plan grande").
2. **Modelo de datos:** el plan **es** el presupuesto → **extender `Budget`** (no entidad
   nueva). El seguimiento clínico de ortodoncia **reutiliza y extiende el `OrthoRecord`
   existente** (`patient.ortho`), no se duplica dentro del budget.
3. **Recetas y Radiografías** quedan en *Ficha clínica* (son transversales al paciente);
   el sub-tab "Rx y CF" del plan **referencia** las radiografías, sin duplicarlas.
4. **Ortodoncia = core (sin gate).** Gatearlo dejaría a una clínica sin ver sus propios
   planes. Lo premium sigue siendo lo avanzado (IA/firma/labs/liquidaciones/boxes). El
   botón "Resumen clínico ✨" sí queda tras IA (Clínica+), reusando el botón existente.
5. **"Plantilla Fotográfica"** = galería de fotos clínicas de seguimiento (reusa archivos
   imagen); **"Rx y CF"** = radiografías (reusa el tab/colección de radiografías). Sin
   solapamiento conceptual.

## Contexto (qué se reutiliza — el grueso ya existe)

- **`lib/budgets.ts`** ya calcula `budgetTotal` (con descuento), `budgetPaid`,
  `budgetBalance`, `budgetSubtotal`, `installmentValue`, `patientBalance`,
  `BUDGET_STATUS_INFO`, `PAYMENT_METHOD_LABEL`. **Solo falta `budgetRealizado`** (Σ ítems
  realizados con descuento).
- **`OrthoRecord`/`OrthoControl`** (`patient.ortho`) ya modelan aparatología, diagnóstico,
  inicio, cuota y controles. Store: `setOrtho(patientId, rec)` y
  `addOrthoControl(patientId, control)` ya existen. Se **extiende** el tipo con los campos
  de la captura; **cero acciones de store nuevas**.
- **`Budget`/`BudgetItem`/`Payment`** ya existen; `dentistId` = profesional a cargo,
  `discountPct` = descuento comercial, pagos ligados por `budgetId`. Acciones
  `upsertBudget`/`addPayment` ya existen.
- **Componentes reusados:** `BudgetsTab`/`RxTab`/`FilesTab`/`RadiografiasTab`/
  `ConsentimientosTab`/`Odontogram`/`Periodontogram`/`RecoveryCard` (los sub-tabs siguen
  renderizando lo que ya hay); `PatientBriefButton` (Resumen clínico IA); `ui.tsx`
  (`Card/Btn/Badge/Modal/Field/inputCls/Empty`); `motion.tsx` (`Reveal`); `compressImage`
  (subida de fotos).
- **Sin colección nueva → sin regla Firestore nueva.** `Budget` y `patient.ortho` ya están
  cubiertos por las reglas existentes (`budgets`, `patients`).

## Modelo de datos (`lib/types.ts`)

```ts
// Budget +=
planType?: "general" | "ortodoncia";   // default tratado como "general"

// OrthoRecord += (campos de la vista Plan de tratamiento, todos opcionales)
totalMonths?: number;        // duración estimada (ej. 24) → "X de 24 meses"
progressReal?: number;       // 0–100 manual → donut "Progreso Real"
upperArch?: string;          // último arco superior
lowerArch?: string;          // último arco inferior
elasticType?: string;        // tipo de elásticos
elasticConfig?: string;      // configuración de elásticos
nextControlDate?: string;    // próximo control (ISO o YYYY-MM-DD)
hygieneCurve?: number;       // curva de higiene (promedio, ej. 2.0)
nextSessionNotes?: string;   // indicaciones próxima sesión
```

`OrthoControl` (date/note/by) **no cambia**: cada control es una **evolución** ("Acción
realizada" = `note`, fecha = `date`). La "Última evolución" es el control más reciente.

## Helpers puros (TDD)

- **`lib/budgets.ts` += `budgetRealizado(b)`** = `Σ items realizados × (1 − discount%)`.
  Test nuevo `lib/budgets.test.ts`.
- **`lib/ortho.ts` (nuevo)** → `orthoProgress(ortho, now)` →
  `{ monthsElapsed, totalMonths, calendarPct, realPct }`.
  - `calendarPct = clamp(monthsElapsed / totalMonths × 100, 0, 100)`.
  - `realPct = clamp(progressReal ?? 0, 0, 100)`.
  - Robusto ante basura: sin `startDate`/`totalMonths` → `monthsElapsed 0`, `calendarPct 0`.
  Test `lib/ortho.test.ts`.

## Arquitectura de navegación (2 niveles)

La cabecera (banda navy + foto + badges médicos + acciones) **no cambia**. Debajo, **2
barras de tabs**: grupos (N1) y, según el grupo activo, sus sub-tabs (N2). El estado pasa
de `tab` plano a un mapa grupo→sub-tabs; el grupo activo se deriva del sub-tab actual.

| Grupo (N1) | Sub-tabs (N2) | Render |
|---|---|---|
| **Datos personales** | Datos · Formularios · Archivos · Consentimientos | `DatosTab` (nuevo) · forms (existe) · `FilesTab` · `ConsentimientosTab` |
| **Ficha clínica** | Resumen · Odontograma · Periodoncia · Historial · Radiografías · Recetas | bloques existentes · `RadiografiasTab` · `RxTab` |
| **Planes de tratamiento** | *vista 2 columnas* | `PlanTratamiento` (nuevo) — absorbe Presupuestos + Ortodoncia |
| **Facturación y pagos** | Facturación | bloque existente |
| **Recibir pago** | *registrar abono* | `RecibirPagoTab` (nuevo) |

Los tabs planos `presupuestos` y `ortodoncia` se **absorben** en `PlanTratamiento` (dejan
de existir como tabs sueltos).

## Vista "Plan de tratamiento" (`components/PlanTratamiento.tsx`)

Lista los `budgets` del paciente; selector "Plan #id · especialidad" si hay varios.
Layout `lg:grid-cols-[330px_1fr]`:

- **Columna izquierda (panel navy, estilo captura):** "Plan de tratamiento #{id}" + copiar ·
  `PatientBriefButton` "Resumen clínico ✨" (solo si `hasIA`) · especialidad/título
  editable · **Tarjeta Presupuesto total:** Descuento comercial % (de `discountPct`) ·
  **Realizado** (`budgetRealizado`) · **Abonado** (`budgetPaid`) · **Saldo por abonar**
  (`budgetBalance`) · lista de abonos / "No hay abonos" · **Profesional a cargo**
  (`dentistId` → nombre del user).
- **Columna derecha:** tabs especialidad `Ortodoncia / Odontograma` (según `planType`) +,
  para Ortodoncia, los 5 sub-tabs (`components/Ortodoncia.tsx`).

## Panel de Ortodoncia (`components/Ortodoncia.tsx`)

Lee/escribe `patient.ortho` vía `setOrtho`/`addOrthoControl`. Si `ortho` inactivo → estado
"activar" (reusa el formulario de activación existente). Activo → 5 sub-tabs:

| Sub-tab | Contenido | Fuente |
|---|---|---|
| **Resumen** | 2 donuts SVG (Calendario `orthoProgress.calendarPct` / Real `realPct`) · "X de N meses" · grilla (arcos, tipo/config elásticos, próx. control, curva higiene, indicaciones, aparatología) · **Última evolución** (control más reciente) · botones **Editar** (modal del tracking) y **+ Nueva evolución** (modal → `addOrthoControl`) | `patient.ortho` |
| **Plantilla Fotográfica** | galería de fotos clínicas (frontal/lateral/oclusal); subir reusa `compressImage`+`addPatientFile` | `patient.files` (imagen) |
| **Diagnóstico** | textarea editable (guarda en `ortho.diagnosis` vía `setOrtho`) + notas EMR `diagnostico` (lectura) | `ortho.diagnosis` · `patient.emr` |
| **Plan de tratamiento** | ítems/aparatología del budget con estado realizado/pendiente | `budget.items` |
| **Rx y CF** | radiografías del paciente (+ control fotográfico) | `RadiografiasTab` |

RBAC: editar tracking/evoluciones/diagnóstico/fotos requiere `emr.write` (dentista/admin),
igual que el `OrthoTab` actual. Lectura para todos.

## Vistas administrativas nuevas

- **`DatosTab`** (`components/PatientDatos.tsx`): formulario de datos demográficos
  (firstName, lastName, document, phone, email, birthDate, insurer) → `upsertPatient`.
  Editable con `engagement.forms` o `emr.write` (igual criterio que la cabecera).
- **`RecibirPagoTab`** (`components/RecibirPago.tsx`): lista budgets con saldo > 0; form de
  abono (monto, fecha, medio `PaymentMethod`, concepto) → `addPayment({ budgetId, … })`.
  Actualiza Abonado/Saldo en vivo (vía el store). Permiso financiero
  (`billing.reports`/`emr.write`, mismo criterio que Caja).

## Seed (`lib/seed.ts`)

El paciente que ya tiene `ortho` (p1) se enriquece con los campos nuevos (`totalMonths: 24`,
`progressReal`, arcos, elásticos, `hygieneCurve: 2.0`, una evolución "Mantenimiento mensual…")
y su budget (g1) se marca `planType: "ortodoncia"` — así el demo reproduce la captura.

## Componentes / archivos

- **Nuevos:** `lib/ortho.ts` (+`.test`), `lib/budgets.test.ts`, `components/PlanTratamiento.tsx`,
  `components/Ortodoncia.tsx`, `components/PatientDatos.tsx`, `components/RecibirPago.tsx`.
- **Modificados:** `lib/types.ts` (Budget.planType, OrthoRecord+), `lib/budgets.ts`
  (`budgetRealizado`), `lib/seed.ts` (enriquecer ortho + planType), `app/app/pacientes/[id]/page.tsx`
  (nav 2 niveles + render de las vistas nuevas).
- **Sin cambios:** `lib/store.tsx`, `firestore.rules`, `lib/plan.ts`, `components/PlanGate.tsx`.

## Alcance

**v1 (IN):** navegación 2 niveles (5 grupos); vista Plan de tratamiento 2 columnas con
panel financiero (reusa budgets); seguimiento de Ortodoncia (tracking + donuts de progreso
+ evoluciones + 5 sub-tabs); `DatosTab`; `RecibirPagoTab`; helpers `budgetRealizado` y
`orthoProgress` con tests; seed demo; motion.

**Fuera de v1:** múltiples especialidades con plantillas de campos propias (solo
Ortodoncia + General por ahora); "Pantalla completa" del plan (toggle de layout — nice to
have); impresión/PDF del plan completo; cefalometría con trazado; multi-plan financiero
consolidado.

## Criterio de éxito

La ficha se navega como Dentalink (5 grupos con sub-tabs). En "Planes de tratamiento" se ve
el plan de Jessica/p1 como 2 columnas: a la izquierda el presupuesto (descuento, realizado,
abonado, saldo, profesional), a la derecha el seguimiento de Ortodoncia con progreso
"X de 24 meses", arcos/elásticos, la última evolución, y se puede **editar el tracking** y
**agregar una evolución**. `tsc + vitest + build` en verde. Sin deploy de reglas necesario.

## Riesgos / decisiones abiertas

- **Acople ortodoncia↔budget:** un paciente con varios budgets `ortodoncia` compartiría el
  mismo `patient.ortho` (1 tratamiento de ortodoncia por paciente). Es la realidad clínica
  habitual; se documenta. Si en el futuro hace falta multi-tratamiento, migrar `ortho` a
  nivel budget.
- **Tamaño de `page.tsx`:** el refactor extrae vistas a componentes nuevos para no crecer
  el archivo; la cabecera y los bloques clínicos existentes se conservan.
