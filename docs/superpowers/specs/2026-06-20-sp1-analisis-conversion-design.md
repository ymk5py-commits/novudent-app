# SP1 — Análisis & Conversión de pacientes — Diseño

**Fecha:** 2026-06-20
**Programa:** Reportes/Análisis estilo Dentalink (ver plan maestro
`2026-06-20-reportes-analisis-dentalink-plan-maestro.md`). Este es el **sub-proyecto 1**.
**Tipo:** Feature de paridad Dentalink (Novudent puro — sin Botika).

## Objetivo

Clonar el dashboard **"Conversión de pacientes"** de Dentalink (captura 1): embudo de
conversión, línea temporal de 12 meses, tarjetas de totales y 6 donuts demográficos —
dentro de `/app/reportes`, con datos reales del store.

## Decisiones (del brainstorming, confirmadas)

1. **Embudo** (3 etapas): **Citas agendadas** = todas las citas del período (100%) →
   **Citas confirmadas** = estado `confirmada` o `completada` (%/agendadas) →
   **Presupuestos aceptados** = budgets `aceptado`/`completado` creados en el período
   (%/agendadas). (Los presupuestos no son subconjunto estricto de las citas; el embudo de
   Dentalink los muestra igual como última etapa del funnel — se replica.)
2. **Línea temporal:** conteos **absolutos** mensuales (no %) de las 3 etapas, últimos 12
   meses.
3. **6 donuts:** Edad, Género, Ciudad, Medios de pago, Categoría de acciones, Estado de
   citas. Reusan `StatusDonutChart`.
4. **Categorías:** se **agrega `category` al catálogo** `Procedure` (confirmado); fallback
   por rango ADA para ítems sin match.
5. **Navegación:** `/app/reportes` pasa a **sub-pestañas** (`Panel de desempeño` =
   contenido actual · `Análisis de pacientes` = esta pantalla · `Reportes Excel` = export
   actual). Una sola entrada "Reportes" en el menú.
6. **Sin colección Firestore nueva, sin acción de store nueva.** Gating: feature `reportes`
   + permiso `billing.reports` (igual que la página actual).

## Contexto (qué se reutiliza)

- **`components/Charts.tsx`** (recharts): `StatusDonutChart` (los 6 donuts). Se le suman
  `FunnelChart` y `ConversionLineChart`.
- **`app/app/reportes/page.tsx`** ya calcula agregados con `useMemo` sobre `db` y tiene el
  gating + RBAC + export CSV. Se refactoriza en sub-pestañas; el contenido actual pasa a
  "Panel de desempeño".
- **Datos del store:** `db.appointments` (status), `db.budgets` (status, createdAt, items),
  `db.payments` (method), `db.patients` (birthDate + gender/city nuevos), `db.procedures`
  (catálogo, + category nuevo).
- **`PatientDatos.tsx`** (`DatosTab`): se le agregan los campos género/ciudad.
- **`lib/ortho.ts`/`lib/budgets.ts`:** molde de helpers puros + TDD.

## Modelo de datos (`lib/types.ts`)

```ts
// Patient +=
gender?: "F" | "M" | "otro";
city?: string;               // localidad/ciudad (la "Comuna" de Dentalink, adaptada PY)

// Catálogo de prestaciones
export type ProcedureCategory =
  | "diagnostico" | "prevencion" | "operatoria" | "endodoncia" | "periodoncia"
  | "protesis" | "cirugia" | "ortodoncia" | "estetica" | "general";

// Procedure +=
category?: ProcedureCategory;
```

`CATEGORY_LABEL: Record<ProcedureCategory, string>` (en `lib/categorias.ts`) para mostrar
("Operatoria", "Ortodoncia", "Prevención e higiene", …).

## Helpers puros (TDD)

### `lib/categorias.ts`
- `ageBucket(birthDate: string | undefined, now = Date.now()): string` → uno de
  `"<14" | "15-20" | "21-35" | "36-50" | "51-65" | ">65"` (o `"Sin dato"` si falta).
- `procedureCategory(cpt: string, procedures: Procedure[]): ProcedureCategory` → busca el
  `Procedure` por `cpt` y devuelve su `category`; si no hay match o no tiene category,
  fallback por **rango ADA** (`D0`→diagnostico, `D1`→prevencion, `D2`→operatoria,
  `D3`→endodoncia, `D4`→periodoncia, `D5`/`D6`→protesis, `D7`→cirugia, `D8`→ortodoncia,
  `D9`→general). Nunca rompe (cpt basura → `"general"`).
- `CATEGORY_LABEL`, `GENDER_LABEL`.

### `lib/conversion.ts`
- `conversionFunnel(appointments, budgets, fromMs, toMs)` →
  `{ agendadas, confirmadas, aceptados, pctConfirmadas, pctAceptados }`
  (counts + porcentajes redondeados sobre agendadas; 0 agendadas → pct 0, sin división por
  cero).
- `conversionTimeline(appointments, budgets, months = 12, now = Date.now())` →
  `{ mes: string; agendadas: number; confirmadas: number; aceptados: number }[]`
  (un punto por mes, en orden cronológico; `mes` = etiqueta corta "jul'25").
- Ambos puros y tolerantes a datos faltantes; **tests** en `lib/conversion.test.ts` y
  `lib/categorias.test.ts`.

## Charts nuevos (`components/Charts.tsx`)

- **`FunnelChart({ stages })`** — `stages: { label: string; value: number; pct: number;
  color: string }[]`. Embudo de trapecios apilados (divs con `clip-path` o SVG), cada
  segmento con su % y valor, ancho proporcional al pct. Estética del design system
  (azure/verde/naranja como la captura).
- **`ConversionLineChart({ data })`** — `data: { mes; agendadas; confirmadas; aceptados }[]`.
  Recharts `LineChart` con 3 `Line` (azul/verde/naranja), grilla discreta, tooltip de
  tarjeta (reusa `CardTooltip`), leyenda. Eje Y por conteo.

## Componente de pantalla (`components/AnalisisConversion.tsx`)

`AnalisisConversion()` (client):
- **Filtro de período:** dos `input type="date"` (desde/hasta), default últimos 12 meses.
  Estado local; recalcula con `useMemo`.
- **Sección Conversión:** `FunnelChart` (3 etapas) + 3 tarjetas (Citas agendadas /
  confirmadas / presupuestos aceptados, cada una con % grande + conteo) + `ConversionLineChart`.
- **Sección "Datos genéricos de los pacientes":** grilla de 6 `StatusDonutChart`
  (Edad, Género, Ciudad, Medios de pago, Categoría de acciones, Estado de citas), cada uno
  con su `centerLabel` y leyenda. Colores del design system.
- Todos los cálculos con `useMemo` sobre `db` + el período. Envuelto en `Reveal`.

## Navegación de Reportes (`app/app/reportes/page.tsx`)

Refactor a 2 niveles (patrón de la ficha): estado `tab: "desempeno" | "analisis" | "excel"`.
- `desempeno` → el contenido actual (KPIs 30d, flujo de caja, producción, morosidad, NPS).
- `analisis` → `<AnalisisConversion />`.
- `excel` → el bloque de exportables actual.
Barra de sub-pestañas arriba. El gating (`reportes` + `billing.reports`) envuelve todo. Para
no inflar `page.tsx`, el contenido de "Panel de desempeño" puede extraerse a
`components/PanelDesempeno.tsx` (mejora targeted) o quedar inline si el tamaño lo permite.

## Captura de género/ciudad (`components/PatientDatos.tsx`)

`DatosTab` suma: `Género` (select F/M/Otro) y `Ciudad` (input). Persisten con
`upsertPatient`. **Etiqueta:** "Ciudad" (a confirmar; alternativa "Localidad/Barrio").

## Seed (`lib/seed.ts`)

- Poblar `gender` y `city` en los 6 pacientes demo (mix realista para que los donuts se
  vean).
- Agregar `category` a cada `Procedure` del catálogo (Operatoria/Ortodoncia/Prevención/…).

## Alcance

**v1 (IN):** sub-pestañas en Reportes; embudo + tarjetas + línea temporal; 6 donuts;
campos `gender`/`city` + captura + seed; `category` en catálogo + seed; helpers
`conversion`/`categorias` con tests; `FunnelChart` + `ConversionLineChart`; filtro de
período.

**Fuera de v1 (otros SP / más adelante):** "Pantalla completa", export PDF del dashboard,
comparativa multi-centro, "Análisis de pacientes" como sub-nav de Pacientes (vive en Reportes).

## Criterio de éxito

En `/app/reportes → Análisis de pacientes`, con el período por defecto (12 meses), se ve el
embudo con los 3 porcentajes y conteos, la línea temporal de 12 meses, y los 6 donuts
poblados con datos del demo (incluidos Género y Ciudad). Cambiar el filtro recalcula todo.
`tsc + vitest + build` verde. Sin deploy de reglas.

## Riesgos / decisiones abiertas

- **Etiqueta del campo localidad** ("Ciudad" vs "Localidad/Barrio") — se confirma al
  implementar `DatosTab`.
- **`FunnelChart`**: recharts trae `Funnel`, pero el look de la captura (trapecios con % y
  valor) sale más fiel con SVG/divs propios; se implementa custom.
- **Conteos de demo**: el seed tiene pocos pacientes/citas → los gráficos se verán con
  números chicos (correcto; en prod hay volumen real).
