# SP1 — Análisis & Conversión de pacientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Clonar el dashboard "Conversión de pacientes" de Dentalink dentro de `/app/reportes`: embudo + línea temporal de 12 meses + 6 donuts demográficos, con datos reales del store.

**Architecture:** Helpers puros TDD (`conversion.ts`, `categorias.ts`) que agregan `appointments`/`budgets`/`payments`/`patients`. Dos charts nuevos (`FunnelChart`, `ConversionLineChart`) + reuso de `StatusDonutChart`. Pantalla `AnalisisConversion.tsx`. `/app/reportes` pasa a sub-pestañas. Campos nuevos `gender`/`city` (Patient) y `category` (Procedure). Sin colección/regla/store nuevos.

**Tech Stack:** Next.js 14, TypeScript, recharts, vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-20-sp1-analisis-conversion-design.md`

**Branch:** crear `feat/reportes-analisis-dentalink` desde la rama actual (la ficha aún no está en `main`; hereda los docs). No mergear hasta el final.

---

## File Structure

- Create `lib/categorias.ts` + `lib/categorias.test.ts` — `ageBucket`, `procedureCategory`, labels.
- Create `lib/conversion.ts` + `lib/conversion.test.ts` — `conversionFunnel`, `conversionTimeline`.
- Create `components/AnalisisConversion.tsx` — la pantalla (embudo + tarjetas + línea + 6 donuts).
- Modify `lib/types.ts` — `Patient.gender/city`, `ProcedureCategory`, `Procedure.category`.
- Modify `lib/seed.ts` — poblar `gender`/`city` en pacientes + `category` en procedimientos.
- Modify `components/Charts.tsx` — `FunnelChart`, `ConversionLineChart`.
- Modify `components/PatientDatos.tsx` — campos `gender`/`city` en `DatosTab`.
- Modify `app/app/reportes/page.tsx` — sub-pestañas (Panel de desempeño / Análisis / Excel).

---

## Task 1: Tipos + seed

**Files:** Modify `lib/types.ts`, `lib/seed.ts`

- [ ] **Step 1:** En `lib/types.ts`, `interface Patient` += `gender?: "F" | "M" | "otro";` y `city?: string;`.
- [ ] **Step 2:** En `lib/types.ts` agregar antes de `interface Procedure`:
```ts
export type ProcedureCategory =
  | "diagnostico" | "prevencion" | "operatoria" | "endodoncia" | "periodoncia"
  | "protesis" | "cirugia" | "ortodoncia" | "estetica" | "general";
```
y dentro de `interface Procedure` += `category?: ProcedureCategory;`.
- [ ] **Step 3:** En `lib/seed.ts`, poblar `gender` y `city` en los 6 pacientes demo (mix realista: F/M; ciudades del área de Asunción — Asunción, Lambaré, San Lorenzo, Luque, Fernando de la Mora, Capiatá). Y agregar `category` a cada `Procedure` del catálogo (D0→diagnostico, D1→prevencion, D2→operatoria, D3→endodoncia, D7→cirugia, D8→ortodoncia, D2740 corona→protesis, D9972 blanqueamiento→estetica).
- [ ] **Step 4: Verify** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run` → verde.
- [ ] **Step 5: Commit** `git add lib/types.ts lib/seed.ts && git commit -m "feat(reportes): Patient.gender/city + Procedure.category + seed"`

---

## Task 2: Helper categorias.ts (TDD)

**Files:** Create `lib/categorias.ts`, `lib/categorias.test.ts`

- [ ] **Step 1: Failing test** `lib/categorias.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ageBucket, procedureCategory } from "./categorias";
import type { Procedure } from "./types";

describe("ageBucket", () => {
  it("clasifica por rango de edad", () => {
    const now = new Date("2026-06-20").getTime();
    const at = (y: number) => `${2026 - y}-06-20`;
    expect(ageBucket(at(10), now)).toBe("<14");
    expect(ageBucket(at(18), now)).toBe("15-20");
    expect(ageBucket(at(30), now)).toBe("21-35");
    expect(ageBucket(at(45), now)).toBe("36-50");
    expect(ageBucket(at(60), now)).toBe("51-65");
    expect(ageBucket(at(80), now)).toBe(">65");
  });
  it("devuelve 'Sin dato' si no hay fecha", () => {
    expect(ageBucket(undefined)).toBe("Sin dato");
  });
});

describe("procedureCategory", () => {
  const cat: Procedure[] = [{ cpt: "D8080", description: "Orto", price: 1, defaultDx: [], category: "ortodoncia" }];
  it("usa la categoría del catálogo si existe", () => {
    expect(procedureCategory("D8080", cat)).toBe("ortodoncia");
  });
  it("fallback por rango ADA cuando no hay match", () => {
    expect(procedureCategory("D2330", [])).toBe("operatoria");
    expect(procedureCategory("D1110", [])).toBe("prevencion");
    expect(procedureCategory("D7140", [])).toBe("cirugia");
  });
  it("cpt basura → general (no rompe)", () => {
    expect(procedureCategory("XYZ", [])).toBe("general");
    expect(procedureCategory("", [])).toBe("general");
  });
});
```
- [ ] **Step 2: Run, fail** `npx vitest run lib/categorias.test.ts`.
- [ ] **Step 3: Implement** `lib/categorias.ts`:
```ts
import type { Procedure, ProcedureCategory } from "./types";

export const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  diagnostico: "Diagnóstico", prevencion: "Prevención e higiene", operatoria: "Operatoria",
  endodoncia: "Endodoncia", periodoncia: "Periodoncia", protesis: "Prótesis",
  cirugia: "Cirugía", ortodoncia: "Ortodoncia", estetica: "Estética", general: "General",
};

export const GENDER_LABEL: Record<string, string> = { F: "Femenino", M: "Masculino", otro: "Otro" };

const ADA_RANGE: Record<string, ProcedureCategory> = {
  D0: "diagnostico", D1: "prevencion", D2: "operatoria", D3: "endodoncia",
  D4: "periodoncia", D5: "protesis", D6: "protesis", D7: "cirugia", D8: "ortodoncia", D9: "general",
};

export function ageBucket(birthDate: string | undefined, now: number = Date.now()): string {
  if (!birthDate) return "Sin dato";
  const ms = Date.parse(birthDate);
  if (Number.isNaN(ms)) return "Sin dato";
  const age = Math.floor((now - ms) / (365.25 * 86_400_000));
  if (age < 14) return "<14";
  if (age <= 20) return "15-20";
  if (age <= 35) return "21-35";
  if (age <= 50) return "36-50";
  if (age <= 65) return "51-65";
  return ">65";
}

export function procedureCategory(cpt: string, procedures: Procedure[]): ProcedureCategory {
  const found = procedures.find((p) => p.cpt === cpt);
  if (found?.category) return found.category;
  return ADA_RANGE[(cpt || "").slice(0, 2).toUpperCase()] ?? "general";
}
```
- [ ] **Step 4: Run, pass** `npx vitest run lib/categorias.test.ts`.
- [ ] **Step 5: Commit** `git add lib/categorias.ts lib/categorias.test.ts && git commit -m "feat(reportes): helper categorias (ageBucket + procedureCategory, TDD)"`

---

## Task 3: Helper conversion.ts (TDD)

**Files:** Create `lib/conversion.ts`, `lib/conversion.test.ts`

- [ ] **Step 1: Failing test** `lib/conversion.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { conversionFunnel, conversionTimeline } from "./conversion";
import type { Appointment, Budget } from "./types";

const appt = (start: string, status: Appointment["status"]): Appointment =>
  ({ id: start + status, clinicId: "c", patientId: "p", dentistId: "d", title: "x", start, end: start, status, amount: 0, discount: 0 });
const bud = (createdAt: string, status: Budget["status"]): Budget =>
  ({ id: createdAt + status, clinicId: "c", patientId: "p", dentistId: "d", createdAt, status, items: [], history: [] });

describe("conversionFunnel", () => {
  it("cuenta etapas y porcentajes sobre agendadas", () => {
    const from = Date.parse("2026-01-01"), to = Date.parse("2026-12-31");
    const appts = [appt("2026-03-01", "confirmada"), appt("2026-03-02", "completada"), appt("2026-03-03", "pendiente"), appt("2026-03-04", "cancelada")];
    const budgets = [bud("2026-03-05", "aceptado"), bud("2026-03-06", "borrador")];
    const r = conversionFunnel(appts, budgets, from, to);
    expect(r.agendadas).toBe(4);
    expect(r.confirmadas).toBe(2);     // confirmada + completada
    expect(r.aceptados).toBe(1);
    expect(r.pctConfirmadas).toBe(50);
    expect(r.pctAceptados).toBe(25);
  });
  it("0 agendadas → 0% sin dividir por cero", () => {
    const r = conversionFunnel([], [], 0, 1);
    expect(r.agendadas).toBe(0);
    expect(r.pctConfirmadas).toBe(0);
    expect(r.pctAceptados).toBe(0);
  });
});

describe("conversionTimeline", () => {
  it("devuelve un punto por mes en orden", () => {
    const now = Date.parse("2026-06-20");
    const r = conversionTimeline([appt("2026-06-01", "confirmada")], [bud("2026-06-02", "aceptado")], 12, now);
    expect(r).toHaveLength(12);
    const last = r[r.length - 1];
    expect(last.agendadas).toBe(1);
    expect(last.confirmadas).toBe(1);
    expect(last.aceptados).toBe(1);
  });
});
```
- [ ] **Step 2: Run, fail** `npx vitest run lib/conversion.test.ts`.
- [ ] **Step 3: Implement** `lib/conversion.ts`:
```ts
import type { Appointment, Budget } from "./types";

const CONFIRMED = new Set<Appointment["status"]>(["confirmada", "completada"]);
const ACCEPTED = new Set<Budget["status"]>(["aceptado", "completado"]);
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export interface Funnel { agendadas: number; confirmadas: number; aceptados: number; pctConfirmadas: number; pctAceptados: number; }

export function conversionFunnel(appointments: Appointment[], budgets: Budget[], fromMs: number, toMs: number): Funnel {
  const inRange = (iso: string) => { const t = Date.parse(iso); return !Number.isNaN(t) && t >= fromMs && t <= toMs; };
  const ag = appointments.filter((a) => inRange(a.start));
  const agendadas = ag.length;
  const confirmadas = ag.filter((a) => CONFIRMED.has(a.status)).length;
  const aceptados = budgets.filter((b) => ACCEPTED.has(b.status) && inRange(b.createdAt)).length;
  return { agendadas, confirmadas, aceptados, pctConfirmadas: pct(confirmadas, agendadas), pctAceptados: pct(aceptados, agendadas) };
}

export interface TimelinePoint { mes: string; agendadas: number; confirmadas: number; aceptados: number; }

export function conversionTimeline(appointments: Appointment[], budgets: Budget[], months: number = 12, now: number = Date.now()): TimelinePoint[] {
  const base = new Date(now);
  const out: TimelinePoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const sameMonth = (iso: string) => { const t = new Date(Date.parse(iso)); return !Number.isNaN(t.getTime()) && t.getFullYear() === y && t.getMonth() === m; };
    const ag = appointments.filter((a) => sameMonth(a.start));
    out.push({
      mes: d.toLocaleDateString("es-PY", { month: "short", year: "2-digit" }).replace(".", ""),
      agendadas: ag.length,
      confirmadas: ag.filter((a) => CONFIRMED.has(a.status)).length,
      aceptados: budgets.filter((b) => ACCEPTED.has(b.status) && sameMonth(b.createdAt)).length,
    });
  }
  return out;
}
```
- [ ] **Step 4: Run, pass** `npx vitest run lib/conversion.test.ts`.
- [ ] **Step 5: Commit** `git add lib/conversion.ts lib/conversion.test.ts && git commit -m "feat(reportes): helper conversion (funnel + timeline, TDD)"`

---

## Task 4: Charts (FunnelChart + ConversionLineChart)

**Files:** Modify `components/Charts.tsx`

- [ ] **Step 1: Implement `FunnelChart`** — `export function FunnelChart({ stages }: { stages: { label: string; value: number; pct: number; color: string }[] })`. Embudo vertical de trapecios apilados: cada etapa es un bloque centrado cuyo ancho superior = pct de la etapa previa (100 para la primera) y ancho inferior = su propio pct, logrado con `clipPath: polygon(...)` sobre un div de alto fijo (~64px) y fondo `color`. Dentro, el `pct%` grande (blanco) y el `value` + `label` abajo. Sin dependencias nuevas (CSS puro). Responsive (ancho del contenedor).
- [ ] **Step 2: Implement `ConversionLineChart`** — `export function ConversionLineChart({ data }: { data: { mes: string; agendadas: number; confirmadas: number; aceptados: number }[] })`. Recharts `LineChart` con `ResponsiveContainer` (alto ~260): `CartesianGrid` (GRID), `XAxis dataKey="mes"`, `YAxis` (AXIS), `Tooltip content={<CardTooltip/>}`, `Legend`, y 3 `Line` (`agendadas` azul #2E83F5, `confirmadas` verde #0E9F6E, `aceptados` naranja #F59E0B), `type="monotone"`, `strokeWidth 2.5`, `dot={false}`, `activeDot={{r:4}}`. Nombres legibles ("Citas agendadas", etc.).
- [ ] **Step 3: Verify** `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `git add components/Charts.tsx && git commit -m "feat(reportes): FunnelChart + ConversionLineChart"`

---

## Task 5: Pantalla AnalisisConversion

**Files:** Create `components/AnalisisConversion.tsx`

- [ ] **Step 1: Implement** `AnalisisConversion()` (`"use client"`):
  - `const { db } = useStore()`. Estado `from`/`to` (default: `to = hoy`, `from = hoy − 12 meses`) como `YYYY-MM-DD`.
  - `useMemo` sobre `db` + período:
    - `funnel = conversionFunnel(db.appointments, db.budgets, Date.parse(from), Date.parse(to)+86_399_000)`.
    - `timeline = conversionTimeline(db.appointments, db.budgets, 12)`.
    - donuts: Edad (`ageBucket(p.birthDate)` sobre `db.patients`), Género (`GENDER_LABEL[p.gender]`), Ciudad (`p.city ?? "Sin dato"`), Medios de pago (`PAYMENT_METHOD_LABEL[p.method]` sobre `db.payments`), Categoría (`procedureCategory(item.cpt, db.procedures)` sobre todos los `budget.items`, con `CATEGORY_LABEL`), Estado de citas (`db.appointments` por `status`). Cada uno → `{ label, v, color }[]` (paleta del design system, rotando colores).
  - **Render:** filtro (2 `input date` + “Últimos 12 meses”), `<FunnelChart stages={[agendadas,confirmadas,aceptados]}>`, 3 tarjetas (% grande + conteo), `<ConversionLineChart data={timeline}>`, grilla `sm:grid-cols-2 lg:grid-cols-3` de 6 `<StatusDonutChart parts centerLabel>`. Envolver en `Reveal`. Empty-state si no hay datos en el período.
- [ ] **Step 2: Verify** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `git add components/AnalisisConversion.tsx && git commit -m "feat(reportes): pantalla Análisis & Conversión (embudo + línea + 6 donuts)"`

---

## Task 6: Captura de género/ciudad en DatosTab

**Files:** Modify `components/PatientDatos.tsx`

- [ ] **Step 1:** Agregar al estado `f` los campos `gender` (default `patient.gender ?? ""`) y `city` (default `patient.city ?? ""`); sumarlos al `dirty` y al `save` (`gender: f.gender || undefined`, `city: f.city.trim() || undefined`). En la grilla agregar `Field "Género"` (select: "" / F / M / otro con labels) y `Field "Ciudad"`.
- [ ] **Step 2: Verify** `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `git add components/PatientDatos.tsx && git commit -m "feat(reportes): captura de género/ciudad en Datos personales"`

---

## Task 7: Sub-pestañas en Reportes

**Files:** Modify `app/app/reportes/page.tsx`

- [ ] **Step 1:** Tras los gates (plan/RBAC), introducir estado `const [tab, setTab] = useState<"desempeno"|"analisis"|"excel">("desempeno")` y una barra de sub-pestañas (patrón de la ficha: `rounded-2xl border bg-white p-1`, botón activo `bg-azure-600 text-white`). Mover el contenido actual (KPIs/flujo/producción/morosidad/NPS) bajo `{tab==="desempeno" && (...)}` y el bloque de exportables bajo `{tab==="excel" && (...)}`. Agregar `{tab==="analisis" && <Reveal><AnalisisConversion/></Reveal>}`. Importar `AnalisisConversion`. El header "Informes de gestión" se mantiene arriba de las pestañas. (Si conviene, extraer el bloque de desempeño a `components/PanelDesempeno.tsx` para no inflar el archivo — opcional.)
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run build`.
- [ ] **Step 3: Commit** `git add "app/app/reportes/page.tsx" && git commit -m "feat(reportes): sub-pestañas (Panel de desempeño / Análisis / Excel)"`

---

## Task 8: Verificación final

- [ ] **Step 1:** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run && npm run build` → todo verde, EXIT 0.
- [ ] **Step 2: Smoke** (`npm run dev`): `/app/reportes` → pestaña "Análisis de pacientes" → embudo con 3 %/conteos, línea de 12 meses, 6 donuts poblados (incl. Género y Ciudad del seed). Cambiar el filtro recalcula.
- [ ] **Step 3:** Code review adversaria de runtime sobre los archivos nuevos; aplicar fixes. Dejar la rama lista (sin mergear).

---

## Self-Review

- **Cobertura del spec:** tipos+seed (T1), categorias TDD (T2), conversion TDD (T3), charts (T4), pantalla con embudo+línea+6 donuts (T5), captura género/ciudad (T6), sub-pestañas (T7), verificación (T8). Todo el spec mapeado.
- **Tipos consistentes:** `ProcedureCategory`/`Procedure.category`/`Patient.gender/city` (T1) usados por `procedureCategory`/`ageBucket` (T2) y la pantalla (T5); `Funnel`/`TimelinePoint` (T3) consumidos por T5; `FunnelChart`/`ConversionLineChart` (T4) usados en T5.
- **Sin placeholders en helpers** (T2/T3 con test+código completos). UI (T4/T5/T6/T7) con requisitos detallados + firmas (patrón validado en specs anteriores).
- **Sin colección/regla/store nuevos** — confirmado; `upsertPatient` ya persiste los campos nuevos del paciente.
