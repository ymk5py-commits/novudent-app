# Reportes & Análisis estilo Dentalink — Plan maestro (spec paraguas)

**Fecha:** 2026-06-20
**Tipo:** Plan maestro del programa de paridad Dentalink — módulo Reportes/Análisis.
**Importante:** este documento **no se implementa directo**. Descompone el trabajo en
sub-proyectos; **cada sub-proyecto tendrá su propio spec + plan + implementación** (su
ciclo de brainstorming → writing-plans). Acá se fija el alcance global, el orden y las
decisiones transversales.

## Objetivo

Clonar el módulo de **Reportes/Análisis de Dentalink** (capturas aportadas por el usuario)
adaptado al design system y modelo de datos de Novudent (PYG, español rioplatense,
Firestore web SDK): el **dashboard de Conversión de pacientes**, el **reporte de Pacientes
de Ortodoncia**, y los **reportes de ventas/operación/financieros** del menú.

## Referencias visuales (capturas del usuario)

1. **Conversión de pacientes:** embudo (Citas agendadas 100% / 752 → Confirmadas 70% / 525
   → Presupuestos aceptados 11% / 82) · línea temporal de 12 meses (3 series) · 6 donuts
   demográficos (Edad, Género, Comuna, Medios de pago, Categoría de acciones, Estado de
   citas) · tarjetas de totales con filtro de fechas + centro.
2. **Pacientes de Ortodoncia:** 6 KPIs (en tratamiento activo, atrasados, sin cita futura,
   1-6 años, 6-12 años, mayores de 12) + tabla (#, nombre, apellidos, sexo, edad, tel.
   fijo, tel. móvil, inicio tratamiento, dr(a) tratante, **progreso calendario** con barra).
3-4. **Menús Dentalink:** Reportes (Resultados, Flujos de dinero, Análisis de pacientes,
   Gastos, Eficiencia por profesional, Ventas por prestación, Ventas por categoría,
   Eficiencia de captación de presupuestos, Informe de recaudación diario, Ranking
   profesionales, Pacientes morosos, Estado de financiamientos, Estado de descuentos por
   planilla, Derivación de pacientes, Presupuestos capturados) y Administración.

## Qué Novudent ya cubre (NO rehacer)

- **`app/app/reportes`:** cobrado/gastos/resultado (30d), flujo de caja (área),
  producción + comisiones por profesional, morosidad, NPS, exportables CSV. → cubre
  Resultados, Flujos de dinero, Gastos, Eficiencia por profesional, Ranking, Morosos.
- **`components/Charts.tsx`** (recharts): `WeekBarsChart`, `StatusDonutChart`,
  `ProductionBarsChart`, `CashflowAreaChart`.
- **CRM** con embudo de pipeline; **Liquidaciones**; **Box**; Convenios; Usuarios;
  Inventario; Laboratorios.
- **`lib/ortho.ts` `orthoProgress`** — progreso calendario de ortodoncia (hecho).

## Decisiones transversales (aplican a todos los sub-proyectos)

1. **Navegación:** reorganizar `/app/reportes` en **sub-pestañas** estilo Dentalink (patrón
   de 2 niveles ya usado en la ficha), NO entradas de menú separadas. Sub-pestañas:
   `Panel de desempeño` (lo actual) · `Análisis de pacientes` (SP1) · `Pacientes de
   Ortodoncia` (SP2) · `Ventas` (SP3) · `Reportes Excel` (export actual). Una sola entrada
   "Reportes" en `Shell.tsx`.
2. **Datos nuevos en `Patient`:** agregar `gender?: "F" | "M" | "otro"` y
   `city?: string` (la "Comuna" chilena de Dentalink → **"Ciudad/Localidad"** en Paraguay).
   Capturables en *Datos personales*, sembrados en el demo. Habilitan los donuts de Género
   y Ciudad y la columna Sexo de Ortodoncia. **(A confirmar con el usuario: etiqueta
   "Ciudad" vs "Barrio/Localidad".)**
3. **Categorías de prestación:** para "Ventas por categoría" y el donut "Categoría de
   acciones" → agregar `category?` al catálogo `Procedure` (y resolver por ítem). Se define
   en el sub-proyecto que lo consume (SP1 para el donut, SP3 para el reporte).
4. **Charts nuevos** en `components/Charts.tsx`: `FunnelChart` (embudo) y
   `ConversionLineChart` (línea multi-serie). Recharts ya está instalado.
5. **Gating/RBAC:** todo bajo feature de plan `reportes` + permiso `billing.reports` (igual
   que hoy). **Sin colección Firestore nueva** — los reportes son derivados de datos
   existentes (appointments, budgets, payments, patients, ortho). Sin deploy de reglas.
6. **Filtro de período:** cada dashboard lleva filtro desde/hasta (default últimos 12 meses
   para Conversión; configurable). El selector de centro de Dentalink se omite (Novudent es
   single-tenant por sesión).

## Sub-proyectos (orden de construcción)

### SP1 — Análisis & Conversión ⭐ (captura 1) — PRIMERO
Embudo de conversión + línea temporal 12 meses + tarjetas de totales + 6 donuts.
- **Datos:** appointments (agendadas/confirmadas/estado), budgets (aceptados), payments
  (medios), patients (edad + **género** + **ciudad** nuevos), prestaciones (categoría).
- **Nuevo:** campos `gender`/`city` en Patient + captura en *Datos personales* + seed;
  `FunnelChart` + `ConversionLineChart`; donut "Categoría de acciones".
- **Reusa:** `StatusDonutChart` (los 6 donuts), `orthoProgress` no aplica.
- **Entrega:** pestaña *Análisis de pacientes* + el contenedor de sub-pestañas de Reportes.
- **Por qué primero:** es el dashboard estrella; introduce género/ciudad y los charts que
  el resto reusa.

### SP2 — Pacientes de Ortodoncia (captura 5)
6 KPIs + tabla con progreso calendario.
- **Datos:** `patient.ortho` (activo, startDate, totalMonths, controls), appointments
  futuras, edad, sexo (de SP1), dentista tratante.
- **Reglas:** "Atrasados" = próximo control vencido o sin control reciente (definir umbral);
  "Sin cita futura" = sin appointment futura.
- **Reusa:** `orthoProgress` (calendario), `OrthoRecord` extendido (ya hecho).
- **Entrega:** pestaña *Pacientes de Ortodoncia* + "Descargar reporte" (CSV).

### SP3 — Ventas & operación (menú)
Ventas por prestación · Ventas por categoría · Recaudación diario · Presupuestos
capturados · Derivación de pacientes.
- **Datos:** budgets.items (prestación/categoría/monto), payments (recaudación diaria),
  budgets aceptados con fecha (capturados), origen del paciente (derivación).
- **Nuevo:** `category` en prestaciones (consolidar con SP1); posible `source?` en Patient
  (canal de captación) o se omite "Derivación".
- **Entrega:** pestaña *Ventas* con sub-reportes.

### SP4 — Financiero avanzado (menú)
Estado de financiamientos (cuotas) · Estado de descuentos.
- **Datos:** budgets.installments + payments (cuotas pagadas/pendientes), discountPct/convenio.
- **Entrega:** dentro de *Panel de desempeño* o pestaña propia.

## Dependencias

```
SP1 (género/ciudad, FunnelChart, ConversionLineChart, contenedor de sub-pestañas)
 ├─ SP2 (reusa sexo/edad de SP1 + orthoProgress)
 ├─ SP3 (reusa category, consolidada en SP1; agrega source)
 └─ SP4 (independiente de datos nuevos)
```
SP1 crea el contenedor de sub-pestañas; cada SP agrega su pestaña.

## Criterio de éxito (global)

`/app/reportes` reproduce las pantallas de Dentalink de las capturas con datos reales del
store, bajo el gating actual, sin colección Firestore nueva. Cada sub-proyecto pasa
`tsc + vitest + build` y se mergea por separado (rama feature → main).

## Fuera de alcance

- Reportes que Novudent ya cubre (Resultados, Flujos de dinero, Gastos, Ranking, Morosos):
  se mantienen; a lo sumo ajuste cosmético para encajar en las sub-pestañas.
- Exportación PDF por pantalla (el CSV ya existe; PDF se evalúa por sub-proyecto).
- Comparativa multi-centro (single-tenant).
- "Descargar reporte"/"Pantalla completa" de Dentalink: el CSV cubre la descarga;
  "pantalla completa" es un nice-to-have por sub-proyecto.

## Próximo paso

Tras la aprobación de este plan maestro, **brainstormear SP1 (Análisis & Conversión)** en
su propio ciclo: spec detallado → writing-plans → implementación.
