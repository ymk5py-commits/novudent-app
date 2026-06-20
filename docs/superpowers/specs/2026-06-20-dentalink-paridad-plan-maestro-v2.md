# Paridad total Dentalink — Plan maestro v2 (paciente + pacientes + reportes)

**Fecha:** 2026-06-20
**Reemplaza** al plan maestro v1 (`2026-06-20-reportes-analisis-dentalink-plan-maestro.md`),
ampliándolo de "Reportes" a **toda la superficie de gestión de pacientes de Dentalink**
(11 capturas del usuario). Spec paraguas: cada sub-proyecto tiene su spec+plan propio.
Fundado en un **audit de cobertura real** (6 agentes sobre el código, jun-2026).

## Ya hecho (✅)

- **Ficha de paciente estilo Dentalink**: nav de 2 niveles (5 grupos), cabecera navy,
  vista "Plan de tratamiento" 2 columnas, panel de Ortodoncia (5 sub-tabs), Datos/Recibir
  pago básicos. *(rama `feat/ficha-paciente-dentalink`)*
- **SP1 — Análisis & Conversión**: embudo + línea temporal + 6 donuts demográficos +
  campos `gender`/`city` + `category`. *(rama `feat/reportes-analisis-dentalink`)*

## Cobertura actual vs Dentalink (del audit)

| Superficie | Cobertura | Falta (resumen) |
|---|---|---|
| Datos personales (form) | ~40% | sexo↔género separados, ciudad↔municipio, ~11 campos, convenio selector, extranjero |
| Datos personales (sub-tabs/config) | 0% | Citas/Comentarios/Tareas/Emails + matriz de config de campos |
| Ficha clínica → Historial | ~20% | timeline unificado (citas+evoluciones+prestaciones+pagos), filtros, imprimir, tabs Evoluciones/Antecedentes |
| Planes de tratamiento (detalle) | ~60% | secciones de prestaciones, DSCTO/PAGO por fila, abonos libres, citas del plan, comentarios, interconsulta |
| Planes de tratamiento (lista) | 0% | vista "En ejecución/Otros" con donut de progreso + estado financiero |
| Facturación y pagos | ~10% | 5 sub-tabs, tabla de pagos recibidos, boletas, devoluciones, balance |
| Recibir pago | ~50% | multi-plan con checkboxes, cuotas de financiamiento, link de pago |
| Pacientes (sección) | ~30% | sub-tabs, lista→tabla (Tratamientos/Deudas), Habilitados, Config, **Pacientes de Ortodoncia** |

## Decisiones transversales

1. **Sin sucursales** (Novudent es single-tenant por sesión): se omite "Sucursal" del panel
   financiero y de la columna de pagos.
2. **Link de pago / pasarela**: se implementa como **stub** (genera token/URL, sin pasarela
   real) salvo pedido explícito.
3. **`Análisis` y `Pacientes de Ortodoncia`**: en Dentalink viven bajo *Pacientes*. Se montan
   como sub-tabs de `/app/pacientes` (el `AnalisisConversion` ya existe → se reutiliza; queda
   también accesible en Reportes).
4. **Colecciones nuevas** (comentarios, tareas, emails, documentos, devoluciones, cuotas):
   cada una sigue el patrón `col()` + default `[]` en seed + **regla en `firestore.rules`**
   (default-deny; recordar `firebase deploy --only firestore:rules`).
5. **Dominio de facturación**: el tab actual muestra *claims US* (`BillingRecord` CPT/DX/POS).
   Para Dentalink (boletas/pagos LATAM) se construye la vista nueva sobre `Payment`; los claims
   conviven en su página global `/app/facturacion` sin tocarse.

## Sub-proyectos (re-decompuestos del audit)

### Fase A — alto valor, bajo riesgo, gran reuso (sin colecciones nuevas)

- **SP-A1 · Datos personales completo** [M] — `Patient` += `sex`, `municipio`, `socialName?`,
  `foreigner?`, `internalNumber?`, `address?`, `activity?`, `employer?`, `landline?`,
  `guardian?`, `referencia?`, `observaciones?`, `legalRepDoc?`, `tipo?`; `gender` queda
  separado de `sex`. Form `DatosTab` con todos los campos + checkbox Extranjero + convenio
  selector (de `clinic.config.convenios`). Seed. *(la "columna SEXO" de Ortodoncia y los
  donuts se benefician).*
- **SP-A2 · Sección Pacientes** [L] — `/app/pacientes` con sub-tabs
  [Pacientes, Análisis, **Pacientes de Ortodoncia**]; lista → **tabla** con columnas
  Tratamientos (conteo de budgets) y Deudas (`patientBalance`); montar `<AnalisisConversion/>`;
  **reporte "Pacientes de Ortodoncia"** (KPIs + tabla con `orthoProgress`, captura 5). Reusa
  todo. *(Habilitados + Configuración de campos → Fase B, requieren flag/modelo nuevo.)*
- **SP-A3 · Planes: vista LISTA** [M] — en el grupo "Planes de tratamiento" de la ficha, antes
  del detalle: lista agrupada **En ejecución / Otros**, cada plan con donut de progreso (calendario
  para ortodoncia; % ítems realizados para general) + **estado financiero** (`Hay saldo`/`Deudas`/
  `No hay saldo`, helper nuevo en `lib/budgets.ts`) + profesional/especialidad/última actividad +
  "+ Nuevo plan" + filtro "activos".
- **SP-A4 · Recibir pago multi-plan** [M] — `RecibirPago` → **tabla** con checkbox por plan,
  columnas Total/Realizado/Pagado/Saldo (helpers ya existen), flag DEUDA, Dr; botón único
  "Pagar tratamiento(s)" que crea N `Payment`. Copys Dentalink.
- **SP-A5 · Historial timeline** [L] — `lib/historial.ts` (puro, **TDD**): agrega
  `appointments` + `ortho.controls` + `BudgetItem` realizados (`doneAt`) + `payments` + `emr`
  en entradas cronológicas tipadas (CITA AGENDADA / EVOLUCIÓN / PRESTACIÓN / PAGO / NOTA),
  agrupadas por fecha. Tab Historial → timeline + filtros (mes/tipo/anuladas) + imprimir.
  Tabs nuevos **Evoluciones** y **Antecedentes médicos**.

### Fase B — colecciones/modelos nuevos

- **SP-B1 · Facturación: Pagos + Balance** [L] — grupo "Facturación y pagos" → sub-tabs
  [Pagos, Balance] (+ placeholders Documentos/Devoluciones/Pagos eliminados). Tabla "Pagos
  recibidos" sobre `db.payments`; `Payment` += `receiptNumber?`, `dueDate?`, `breakdown?`,
  `paymentNumber?`. Vista Balance con `patientBalance`.
- **SP-B2 · Prestaciones por sección + DSCTO/PAGO** [L] — `BudgetItem` += `section?`,
  `discountPct?`, estado de PAGO; UI "+ Sección"/"+ Prestación"/"Acciones"; estado por fila
  (CircleCheck verde / carrito rojo). + "Comentarios para el paciente" (`Budget.patientComments`)
  + "Citas del paciente" (`Appointment.budgetId`).
- **SP-B3 · Cuotas de financiamiento + link de pago** [L] — tipo `Installment`
  {budgetId, numero, dueDate, amount, paidAmount}; sección en Recibir pago; `PaymentLink` (stub).
- **SP-B4 · Datos personales sub-tabs + Config de campos** [XL] — colecciones
  `patientComments`/`patientTasks`/`patientEmails`; sub-tab Citas (reusa appts); matriz
  `clinic.config.patientFields` (campo × {nuevoPaciente, agendar, online, checkin} × {presente,
  requerido}) + pantalla de Configuración + gating dinámico del form. + flag `Patient.archived`
  para sub-tab **Habilitados** de SP-A2.
- **SP-B5 · Facturación: Documentos/Devoluciones/Pagos eliminados** [XL] — tipos
  `EmittedDocument`/`Refund` + soft-delete de pagos.

### Fase C — reportes restantes (del plan v1)

- **SP-C1 · Ventas & operación** [L] — Ventas por prestación/categoría, Recaudación diario,
  Presupuestos capturados, Derivación.
- **SP-C2 · Financiero avanzado** [M] — Estado de financiamientos, Descuentos.

## Orden de construcción

A1 → A2 → A3 → A4 → A5 (Fase A entrega las pantallas que el usuario mostró, con máximo reuso
y sin colecciones nuevas) → Fase B (modelos/colecciones) → Fase C (reportes). Cada SP: rama o
commits incrementales + TDD en helpers + gate `tsc`+`vitest`+`build` + revisión adversaria.

## Modelo de datos — adiciones acumuladas (referencia)

`Patient`: sex, municipio, tipo, socialName, foreigner, internalNumber, address, activity,
employer, landline, guardian, referencia, observaciones, legalRepDoc, archived, convenioId.
`Budget`: patientComments, specialty, (sections derivadas). `BudgetItem`: section, discountPct,
pagoStatus. `Appointment`: budgetId. `Payment`: receiptNumber, paymentNumber, dueDate,
breakdown. Nuevos tipos: `Installment`, `PaymentLink`, `EmittedDocument`, `Refund`,
`HistorialEntry` (derivado), `PatientComment`, `PatientTask`, `PatientEmail`. Config:
`clinic.config.patientFields`.

## Criterio de éxito (global)

La sección Pacientes + la ficha + Reportes reproducen las pantallas de las 11 capturas con
datos reales del store, bajo el gating actual. Cada SP pasa el gate y se mergea por separado.
