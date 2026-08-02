# Retención por medio de pago — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/app/reportes` muestre el ingreso **neto** de la comisión que se queda cada medio de pago (tarjeta, transferencia…), no solo el bruto — hoy el widget "Resultado" reporta plata que la clínica nunca vio.

**Architecture:** Un campo nuevo `Clinic.config.paymentRetention` (mismo patrón que `taskDeadlines`/`onlineBooking`, sin colección nueva) guarda el % que retiene cada medio. Dos helpers puros en `lib/budgets.ts` (`retentionPct`, `netAmount`) derivan el neto **en lectura**, con la tasa vigente — nunca se congela nada en `Payment`. Solo `/app/reportes` los consume; Caja, Liquidaciones y el motor de tareas quedan en bruto a propósito (están todos calculando cosas distintas: efectivo físico, comisión del profesional, deuda del paciente).

**Tech Stack:** TypeScript · Next.js 14 App Router · vitest · Tailwind · Firestore Web SDK (sin cambios de reglas: `paymentRetention` vive en el doc `clinics/{cid}` que ya se lee/escribe entero).

**Spec:** [`docs/superpowers/specs/2026-08-01-retencion-medios-pago-design.md`](../specs/2026-08-01-retencion-medios-pago-design.md)

---

## Contexto que el implementador necesita saber

1. **Multi-moneda ya existe y hay que respetarlo.** `lib/currency.ts` define 17 `CurrencyCode`, cada uno con `decimals` (0 para PYG/CLP/COP/CRC, 2 para las otras 13 — USD, ARS, BRL, MXN...). `budgetTotal` (`lib/budgets.ts`) redondea siempre a entero porque nació pensando en PYG — **no copiar ese patrón acá**. `netAmount` tiene que redondear a los decimales reales de la moneda de la clínica, si no un pago de USD 50 con 5% de retención da 48 en vez de 47.50 (bug real, ya encontrado y corregido en la spec).
2. **Derivar, no guardar.** El % de retención vive en la config de la clínica y los reportes lo aplican al vuelo sobre cualquier pago, sin importar cuándo se hizo. No hay campo nuevo en `Payment`. Mismo patrón que `checkStatus()` (`lib/budgets.ts`) y el motor de tareas automáticas.
3. **La comisión del profesional NO cambia.** Sigue calculándose sobre el bruto (`d.commissionPct` sobre `collectedFor` sin tocar) — la retención es un costo que absorbe la clínica, no algo que le baja el sueldo a nadie. Este plan solo agrega una línea de aclaración al subtítulo, cero cambios de matemática en "Producción y comisiones".
4. **El neto se ve SOLO en Reportes**, y dentro de Reportes solo en la tarjeta "Resultado" + `iaDatos` + el CSV de Pagos. Todo lo demás (Caja/arqueo, "Cobrado 30d", el gráfico de flujo de caja, `patientBalance`/`budgetBalance`, el dashboard home, las tareas de cobranza) sigue en bruto — ver la tabla "Qué queda en bruto" de la spec si hay dudas sobre alguna superficie no mencionada acá.
5. **Los helpers puros van con TDD.** Test primero, verlo fallar, después implementar — es norma del proyecto (ver `lib/budgets.test.ts` actual: `describe`/`it` planos, fixtures inline chicas).
6. **`firestore.rules` no se toca.** `paymentRetention` es un campo más dentro del doc `clinics/{cid}`, que ya se lee/escribe completo vía `updateClinicConfig` — no hay allowlist de campos que actualizar.
7. **Correr antes de mergear:** `npx tsc --noEmit && npx vitest run && npm run build`.

### Definiciones reales del proyecto (no las inventes)

```ts
// lib/types.ts — tal cual existen HOY, antes de este plan
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "qr";
export interface Payment {
  id: string; clinicId: string; patientId: string; budgetId?: string;
  date: string; amount: number; method: PaymentMethod; concept: string; receivedBy: string;
  paymentNumber?: string; receiptNumber?: string; dueDate?: string;
  voidedAt?: string; voidedBy?: string; voidReason?: string;
  check?: { number: string; bank: string; cashDate?: string; cobradoAt?: string };
}
export interface Clinic {
  id: string; name: string; plan?: "solo" | "clinica" | "cadena";
  config: {
    timezone: string; currency: CurrencyCode; address?: string; phone?: string;
    convenios?: Convenio[]; reminderTemplate?: string; botika?: BotikaConfig;
    consentTemplates?: ConsentTemplate[]; patientFields?: Record<string, FieldConfig>;
    taskDeadlines?: TaskDeadlines;
    onlineBooking?: { minLeadHoras?: number };
    logo?: string;
    payments?: { checkoutUrl?: string; bankInfo?: string };
  };
}

// lib/currency.ts
export type CurrencyCode = "PYG" | "USD" | "ARS" | "BRL" | "MXN" | /* ...17 en total */ string;
export const DEFAULT_CURRENCY: CurrencyCode = "PYG";
export interface CurrencyDef { code: CurrencyCode; symbol: string; name: string; locale: string; decimals: number; }
export const CURRENCIES: Record<CurrencyCode, CurrencyDef>; // PYG/CLP/COP/CRC → decimals:0; el resto → decimals:2

// lib/budgets.ts
export function budgetTotal(b: Pick<Budget, "items" | "discountPct">): number { /* redondea a entero, PYG-céntrico */ }
export const PAYMENT_METHOD_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", cheque: "Cheque", qr: "QR / billetera" };

// lib/store.tsx
updateClinicConfig: (patch: Partial<Clinic["config"]>) => void; // shallow merge, ya existe
```

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `lib/types.ts` | `PaymentRetention`, `Clinic.config.paymentRetention` |
| `lib/budgets.ts` | `retentionPct()`, `netAmount()` + import de `./currency` |
| `lib/budgets.test.ts` | tests de ambos (TDD) |
| `app/app/configuracion/page.tsx` | Card "Retención por medio de pago" |
| `app/app/reportes/page.tsx` | agregados neto/retención en `data`, tarjeta Resultado, subtítulo de comisiones, `iaDatos`, CSV Pagos |

Sin cambios en `firestore.rules`, `lib/store.tsx`, Caja, Liquidaciones ni `lib/tareas.ts`.

---

## Task 1: Tipos

**Files:**
- Modify: `lib/types.ts:408` (después de `PaymentMethod`)
- Modify: `lib/types.ts:55-56` (dentro de `Clinic.config`, después de `payments`)

- [ ] **Step 1: Agregar `PaymentRetention` después de `PaymentMethod`**

En `lib/types.ts`, línea 408, reemplazar:

```ts
/* ===== Caja: pagos y gastos ===== */
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "qr";
```

por:

```ts
/* ===== Caja: pagos y gastos ===== */
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "qr";

/** Retención (comisión) que se queda cada medio de pago, en % 0-100.
 *  Sin entrada = 0%. La aplican los REPORTES al vuelo con la tasa vigente —
 *  nunca se congela en el Payment (decisión: derivar, no guardar). */
export type PaymentRetention = Partial<Record<PaymentMethod, number>>;
```

- [ ] **Step 2: Agregar el campo a `Clinic.config`**

En `lib/types.ts`, dentro de la interfaz `Clinic`, reemplazar:

```ts
    /** Pago online configurable (sin atar a una pasarela ni guardar secretos):
     *  link de checkout del gateway de la clínica + datos de transferencia. */
    payments?: { checkoutUrl?: string; bankInfo?: string };
  };
}
```

por:

```ts
    /** Pago online configurable (sin atar a una pasarela ni guardar secretos):
     *  link de checkout del gateway de la clínica + datos de transferencia. */
    payments?: { checkoutUrl?: string; bankInfo?: string };
    /** Retención por medio de pago (módulo Reportes — ingreso neto). */
    paymentRetention?: PaymentRetention;
  };
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (el tipo nuevo no se usa todavía, no rompe nada existente)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(reportes): tipo PaymentRetention en Clinic.config"
```

---

## Task 2: Helpers puros — `retentionPct` y `netAmount` (TDD)

**Files:**
- Modify: `lib/budgets.ts` (imports + 2 funciones nuevas)
- Modify: `lib/budgets.test.ts` (tests nuevos)

- [ ] **Step 1: Escribir los tests que van a fallar**

En `lib/budgets.test.ts`, agregar al final del archivo (después de `describe("checkStatus", ...)`, línea 65):

```ts
import { retentionPct, netAmount } from "./budgets";
import type { PaymentRetention } from "./types";

describe("retentionPct", () => {
  it("devuelve el % configurado para el medio", () => {
    expect(retentionPct("tarjeta", { tarjeta: 5 })).toBe(5);
  });
  it("0% si el medio no tiene entrada en la config", () => {
    expect(retentionPct("efectivo", { tarjeta: 5 })).toBe(0);
  });
  it("0% si la config es undefined", () => {
    expect(retentionPct("tarjeta", undefined)).toBe(0);
  });
  it("acota un valor negativo a 0", () => {
    expect(retentionPct("tarjeta", { tarjeta: -10 })).toBe(0);
  });
  it("acota un valor mayor a 100 a 100", () => {
    expect(retentionPct("tarjeta", { tarjeta: 250 })).toBe(100);
  });
  it("0% si el valor no es numérico (NaN)", () => {
    expect(retentionPct("tarjeta", { tarjeta: NaN })).toBe(0);
  });
});

describe("netAmount", () => {
  const cfg: PaymentRetention = { tarjeta: 5 };

  it("PYG (0 decimales): 5% sobre 1.000.000 → 950.000", () => {
    expect(netAmount({ amount: 1_000_000, method: "tarjeta" }, cfg, "PYG")).toBe(950_000);
  });
  it("0% de retención → monto idéntico al bruto", () => {
    expect(netAmount({ amount: 100_000, method: "efectivo" }, cfg, "PYG")).toBe(100_000);
  });
  it("PYG redondea a entero: 5% sobre 333 → 316 (no 316.35)", () => {
    expect(netAmount({ amount: 333, method: "tarjeta" }, cfg, "PYG")).toBe(316);
  });
  it("100% de retención → 0", () => {
    expect(netAmount({ amount: 50_000, method: "tarjeta" }, { tarjeta: 100 }, "PYG")).toBe(0);
  });
  it("moneda de 2 decimales (USD): 5% sobre 50 → 47.5, NO se redondea a entero", () => {
    expect(netAmount({ amount: 50, method: "tarjeta" }, { tarjeta: 5 }, "USD")).toBe(47.5);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run lib/budgets.test.ts`
Expected: FAIL — `retentionPct`/`netAmount` no existen en `./budgets`

- [ ] **Step 3: Implementar los helpers**

En `lib/budgets.ts`, línea 1, reemplazar el import:

```ts
import type { Budget, BudgetStatus, Payment } from "./types";
```

por:

```ts
import type { Budget, BudgetStatus, Payment, PaymentMethod, PaymentRetention } from "./types";
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from "./currency";
```

Al final del archivo (después de `PAYMENT_METHOD_LABEL`, línea 79), agregar:

```ts
/** % de retención vigente para un medio. Sanea basura: un valor negativo, no
 *  numérico o mayor a 100 no puede producir un neto negativo ni inflar el
 *  ingreso — se acota a [0, 100]. */
export function retentionPct(method: PaymentMethod, cfg: PaymentRetention | undefined): number {
  const v = cfg?.[method];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Monto que efectivamente entra a la clínica después de la retención del
 *  medio, redondeado a los decimales REALES de la moneda de la clínica.
 *
 *  ⚠️ `budgetTotal` (más arriba en este archivo) redondea siempre a entero —
 *  está bien ahí porque nació pensando en PYG. Copiarle ese `Math.round` acá
 *  sería un bug real: de las 17 monedas de `lib/currency.ts` solo
 *  PYG/CLP/COP/CRC son zero-decimal, las otras 13 (USD, ARS, BRL, MXN…)
 *  tienen 2 decimales. Un pago de USD 50 con 5% de retención tiene que dar
 *  47.50, no redondearse a 48. */
export function netAmount(
  p: Pick<Payment, "amount" | "method">,
  cfg: PaymentRetention | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): number {
  const factor = 10 ** CURRENCIES[currency].decimals;
  return Math.round(p.amount * (1 - retentionPct(p.method, cfg) / 100) * factor) / factor;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run lib/budgets.test.ts`
Expected: PASS — todos los tests de `retentionPct` y `netAmount`, más los ya existentes (`budgetRealizado`, `financialStatus`, `checkStatus`) siguen en verde

- [ ] **Step 5: Commit**

```bash
git add lib/budgets.ts lib/budgets.test.ts
git commit -m "feat(reportes): retentionPct/netAmount con redondeo por moneda (TDD)"
```

---

## Task 3: Card de configuración en `/app/configuracion`

**Files:**
- Modify: `app/app/configuracion/page.tsx`

- [ ] **Step 1: Importar `PAYMENT_METHOD_LABEL` y el tipo**

En `app/app/configuracion/page.tsx`, línea 11, reemplazar:

```tsx
import type { Role, User, Procedure, BotikaConfig, ConsentTemplate, Branch, TaskDeadline } from "@/lib/types";
```

por:

```tsx
import type { Role, User, Procedure, BotikaConfig, ConsentTemplate, Branch, TaskDeadline, PaymentMethod } from "@/lib/types";
import { PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

- [ ] **Step 2: Agregar la Card después de "Plazos de tareas automáticas"**

En `app/app/configuracion/page.tsx`, después del cierre de la Card de "Plazos de tareas automáticas" (línea 545, `</Reveal>` que sigue al comentario `{/* Plazos de las tareas automáticas... */}`), agregar una Card nueva:

```tsx
      {/* Retención por medio de pago: el % que se queda la tarjeta/banco antes
          de que la plata entre a la clínica. Vive acá (no en Reportes) porque
          es una tasa pactada con el banco, no un filtro del reporte — mismo
          criterio que Plazos de tareas automáticas. */}
      <Reveal>
      <Card className="p-5">
        <div id="retencion" className="mb-1 flex scroll-mt-24 items-center gap-2"><Percent className="h-4 w-4 text-azure-600" /><h2 className="text-sm font-extrabold text-clinic-text">Retención por medio de pago</h2></div>
        <p className="mt-1 text-xs text-clinic-muted">El % que se queda el medio de pago (ej.: comisión de la tarjeta). Los reportes muestran el ingreso neto descontándolo. La caja y el arqueo siguen en bruto.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((method) => (
            <Field key={method} label={PAYMENT_METHOD_LABEL[method]}>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={0} max={100} step={0.1}
                  className={inputCls}
                  value={clinic.config.paymentRetention?.[method] ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? undefined : Number(raw);
                    updateClinicConfig({ paymentRetention: { ...clinic.config.paymentRetention, [method]: n } });
                  }}
                  placeholder="0"
                />
                <span className="text-sm font-bold text-clinic-muted">%</span>
              </div>
            </Field>
          ))}
        </div>
      </Card>
      </Reveal>

```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Verificación visual en el navegador**

Iniciar el servidor de desarrollo (`preview_start` con el dev server configurado), navegar a `/app/configuracion#retencion`, confirmar:
- La Card "Retención por medio de pago" aparece con 5 inputs (Efectivo, Tarjeta, Transferencia, Cheque, QR / billetera).
- Escribir `5` en "Tarjeta" y hacer blur/tab: el valor persiste (releer la página o el estado con `read_page`).
- El `#retencion` en la URL hace scroll a la Card (deep-link, mismo patrón que `#tareas`).

- [ ] **Step 5: Commit**

```bash
git add app/app/configuracion/page.tsx
git commit -m "feat(reportes): Card de retención por medio de pago en Configuración"
```

---

## Task 4: Reportes — neto en el `useMemo` + tarjeta "Resultado" + aclaración de comisiones

**Files:**
- Modify: `app/app/reportes/page.tsx`

- [ ] **Step 1: Importar `netAmount`**

En `app/app/reportes/page.tsx`, línea 8, reemplazar:

```tsx
import { budgetTotal, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

por:

```tsx
import { budgetTotal, patientBalance, netAmount, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

- [ ] **Step 2: Sumar `collectedNet`/`retention` en el `useMemo` de `data`**

En `app/app/reportes/page.tsx`, dentro del `useMemo` (línea 43), reemplazar:

```tsx
    const pays = db.payments.filter((p) => inWindow(p.date) && !p.voidedAt);
    const exps = db.expenses.filter((e) => inWindow(e.date));
    const collected = pays.reduce((s, p) => s + p.amount, 0);
    const spent = exps.reduce((s, e) => s + e.amount, 0);
```

por:

```tsx
    const pays = db.payments.filter((p) => inWindow(p.date) && !p.voidedAt);
    const exps = db.expenses.filter((e) => inWindow(e.date));
    const collected = pays.reduce((s, p) => s + p.amount, 0);
    const spent = exps.reduce((s, e) => s + e.amount, 0);

    // Neto de la retención del medio de pago (comisión de la tarjeta/banco) —
    // se recalcula siempre con la tasa VIGENTE en Clinic.config, nunca se
    // congela por pago. Solo alimenta "Resultado"; el resto de este useMemo
    // sigue en bruto a propósito (ver tabla "Qué queda en bruto" de la spec).
    const currency = db.clinics[0]?.config.currency;
    const retentionCfg = db.clinics[0]?.config?.paymentRetention;
    const collectedNet = pays.reduce((s, p) => s + netAmount(p, retentionCfg, currency), 0);
    const retention = collected - collectedNet;
```

Y en el `return` final del `useMemo` (línea 93), reemplazar:

```tsx
    return { pays, exps, collected, spent, presented, accepted, acceptRate, production, maxProd, cashflow, debtors, surveys, prom, pasv, detr, npsScore };
  }, [db]);
```

por:

```tsx
    return { pays, exps, collected, spent, collectedNet, retention, presented, accepted, acceptRate, production, maxProd, cashflow, debtors, surveys, prom, pasv, detr, npsScore };
  }, [db]);
```

- [ ] **Step 3: La tarjeta "Resultado" pasa a neto**

En `app/app/reportes/page.tsx`, reemplazar la Card "Resultado" (línea 246-252):

```tsx
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Scale className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Resultado</span></div>
          <div className={`mt-1 font-mono text-xl font-extrabold ${data.collected - data.spent >= 0 ? "text-state-ok" : "text-state-err"}`}>{fmtGs(data.collected - data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">cobrado − gastos</div>
        </Card>
        </StaggerItem>
```

por:

```tsx
        <StaggerItem className="block h-full">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Scale className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Resultado</span></div>
          <div className={`mt-1 font-mono text-xl font-extrabold ${data.collectedNet - data.spent >= 0 ? "text-state-ok" : "text-state-err"}`}>{fmtGs(data.collectedNet - data.spent)}</div>
          <div className="mt-1 text-[11px] text-clinic-muted">{data.retention > 0 ? `cobrado neto − gastos · retención ${fmtGs(data.retention)}` : "cobrado − gastos"}</div>
        </Card>
        </StaggerItem>
```

- [ ] **Step 4: Aclaración en el subtítulo de "Producción y comisiones"**

En `app/app/reportes/page.tsx`, reemplazar (línea 276-277):

```tsx
          <h2 className="font-extrabold text-clinic-text">Producción y comisiones por profesional</h2>
          <p className="text-[11px] text-clinic-muted">Pagos cobrados (30 días) sobre presupuestos de cada profesional.</p>
```

por:

```tsx
          <h2 className="font-extrabold text-clinic-text">Producción y comisiones por profesional</h2>
          <p className="text-[11px] text-clinic-muted">Pagos cobrados (30 días) sobre presupuestos de cada profesional. Comisiones calculadas sobre el monto bruto cobrado (la retención del medio de pago la absorbe la clínica).</p>
```

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 6: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS — nada de este Task toca lógica testeada, pero confirma que no rompió nada

- [ ] **Step 7: Commit**

```bash
git add app/app/reportes/page.tsx
git commit -m "feat(reportes): tarjeta Resultado en neto de retención"
```

---

## Task 5: Reportes — `iaDatos` y CSV "Pagos"

**Files:**
- Modify: `app/app/reportes/page.tsx`

- [ ] **Step 1: Actualizar `iaDatos`**

En `app/app/reportes/page.tsx`, reemplazar (línea 178-182):

```tsx
  const iaDatos = {
    ventana: "últimos 30 días",
    cobradoGs: data.collected,
    gastadoGs: data.spent,
    resultadoGs: data.collected - data.spent,
```

por:

```tsx
  const iaDatos = {
    ventana: "últimos 30 días",
    cobradoBrutoGs: data.collected,
    retencionMediosGs: data.retention,
    cobradoNetoGs: data.collectedNet,
    gastadoGs: data.spent,
    resultadoGs: data.collectedNet - data.spent,
```

- [ ] **Step 2: Agregar columnas al CSV "Pagos"**

En `app/app/reportes/page.tsx`, dentro de `EXPORTS`, reemplazar (línea 114-121):

```tsx
    {
      label: "Pagos", file: "pagos.csv",
      rows: () => [
        ["Fecha", "Paciente", "Concepto", "Método", "Monto Gs", "Recibido por"],
        ...db.payments.map((p) => [p.date.slice(0, 10), patientName(p.patientId), p.concept, PAYMENT_METHOD_LABEL[p.method], p.amount, p.receivedBy]),
      ],
    },
```

por:

```tsx
    {
      label: "Pagos", file: "pagos.csv",
      rows: () => {
        const cfg = db.clinics[0]?.config?.paymentRetention;
        const currency = db.clinics[0]?.config.currency;
        return [
          ["Fecha", "Paciente", "Concepto", "Método", "Monto Gs", "Retención %", "Monto neto", "Recibido por"],
          ...db.payments.map((p) => [
            p.date.slice(0, 10), patientName(p.patientId), p.concept, PAYMENT_METHOD_LABEL[p.method], p.amount,
            retentionPct(p.method, cfg), netAmount(p, cfg, currency),
            p.receivedBy,
          ]),
        ];
      },
    },
```

- [ ] **Step 3: Importar `retentionPct` (además de `netAmount`, ya importado en el Task 4)**

En `app/app/reportes/page.tsx`, línea 8, reemplazar:

```tsx
import { budgetTotal, patientBalance, netAmount, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

por:

```tsx
import { budgetTotal, patientBalance, netAmount, retentionPct, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 5: Verificación visual en el navegador**

Con el dev server corriendo, ir a `/app/reportes#excel`, descargar el CSV "Pagos" (o inspeccionar `rows()` desde la consola vía `javascript_tool` si la descarga no es inspeccionable en el entorno de preview) y confirmar que trae las 2 columnas nuevas con valores coherentes (retención 0% para pagos en efectivo si no se configuró nada).

También ir a `/app/reportes#desempeno` y, si en el Task 3 se configuró algún % de retención en el demo, confirmar que la tarjeta "Resultado" muestra el neto y el subtítulo menciona la retención; si no se configuró nada, confirmar que el subtítulo queda igual que antes ("cobrado − gastos", cero ruido).

- [ ] **Step 6: Commit**

```bash
git add app/app/reportes/page.tsx
git commit -m "feat(reportes): retención/neto en iaDatos y CSV de Pagos"
```

---

## Task 6: Verificación final

**Files:** ninguno (solo comandos)

- [ ] **Step 1: Type-check completo**

Run: `npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 2: Suite de tests completa**

Run: `npx vitest run`
Expected: PASS — incluye los tests nuevos de `retentionPct`/`netAmount` (Task 2) y todos los preexistentes

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores de tipos ni de lint

- [ ] **Step 4: Confirmar que `firestore.rules` no cambió**

Run: `git diff --stat firestore.rules`
Expected: sin salida (0 líneas) — esta feature no toca reglas, el campo vive dentro del doc `clinics/{cid}` que ya se lee/escribe entero

- [ ] **Step 5: E2E manual en el navegador — flujo completo**

Con el dev server corriendo:
1. Login demo (`/login` → "Ver demo" → un usuario Administrador).
2. Ir a `/app/configuracion#retencion`, poner `tarjeta: 5`, confirmar que persiste.
3. Ir a `/app/reportes#desempeno`: si hay pagos con tarjeta en los últimos 30 días del demo, "Resultado" debe ser menor que "Cobrado 30d" menos "Gastos 30d" (el neto descuenta la retención), y el subtítulo debe mostrar "retención {monto}".
4. Ir a `/app/reportes#excel`, descargar "Pagos", confirmar las columnas "Retención %" y "Monto neto".
5. Volver a `/app/configuracion#retencion` y dejar `tarjeta` vacío (0%) — confirmar que en Reportes "Resultado" vuelve a ser exactamente `cobrado − gastos` y el subtítulo vuelve a decir "cobrado − gastos" sin mención de retención (cero ruido para quien no usa la feature).

- [ ] **Step 6: Commit final (si quedó algo pendiente)**

```bash
git status
```

Si no hay cambios sin commitear, este paso no genera ningún commit — es solo la confirmación de que el árbol de trabajo quedó limpio.
