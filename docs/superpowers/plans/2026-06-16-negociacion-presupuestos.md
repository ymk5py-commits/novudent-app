# Negociación de Presupuestos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El bot reengancha automáticamente los presupuestos `presentado` abandonados (≥ N días), resuelve dudas de costo, ofrece financiación dentro de una política de la clínica y deja el lead "listo para cerrar" → el humano confirma y acepta.

**Architecture:** Reusa el outbox + el bot conversacional. El cron de Botika materializa el disparo (presupuesto stale → tarea `negociacion`); el bot conversa con el contexto del presupuesto + financiación inyectado en el system prompt; `detectNovudentOutcome` clasifica el resultado (suave); Novudent refleja en `budget.negociacion` y hace handoff al humano. Dos tracks acoplados por el contrato outbox.

**Tech Stack:** Novudent: Next.js + TS, **vitest** (ya instalado). Botika: Node ESM serverless, **vitest** (ya instalado), Gemini vía `callKimi`.

**Repos:** `NOVU` = `/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app` · `BOT` = `/Users/croman/Downloads/botika`

**Contrato (mismo formato que post-op):** la tarea outbox `negociacion` lleva `refId = budgetId`. El resultado del triaje conversacional escribe en `OutboxResult`: `negociacionStatus` ("listo_para_cerrar"|"negociando"|"rechazado"), `financiacionElegida?`, `summary`. Novudent lee esos campos en `reflectOutbox`.

---

## Mapa de archivos

**Novudent (`$NOVU`)**
- `lib/types.ts` (mod) — `BotikaConfig.automations.negociacion`, `NegociacionConfig`, `Budget.negociacion`, `OutboxTaskType += negociacion|negociacion_listo`, `OutboxResult += negociacionStatus|financiacionElegida`.
- `lib/negociacion.ts` (nuevo) — helpers puros: `defaultNegociacionConfig`, `isBudgetStale`, `canRetry`. **TDD.**
- `lib/negociacion.test.ts` (nuevo).
- `lib/seed.ts` (mod) — default de `negociacion` en la config de la clínica demo.
- `lib/store.tsx` (mod) — `reflectOutbox` rama `negociacion`; acción `confirmNegociacion`.
- `app/app/configuracion/page.tsx` (mod) — bloque "Negociación" (toggle + política + N).
- `app/app/page.tsx` (mod) — tarjeta "presupuestos listos para cerrar".
- `app/app/presupuestos/page.tsx` (mod) — badge de estado + botón "Confirmar y aceptar".

**Botika (`$BOT`)**
- `api/_lib/negociacion-context.js` (nuevo) — `buildNegociacionContext(budget, config)`: texto a inyectar en el system prompt. **TDD.**
- `api/_lib/negociacion-context.test.js` (nuevo).
- `api/cron-reminders.js` (mod) — disparo: presupuestos stale → tarea `negociacion`.
- `api/_lib/novudent.js` (mod) — `detectNovudentOutcome` rama `negociacion` (clasifica) + opening.
- el path de respuesta del bot (mod) — inyectar el contexto cuando hay negociación activa.

(No hay regla Firestore nueva: `budget.negociacion` es un campo del doc existente `budgets`, ya cubierto por la regla `isMember`.)

---

## Task 1 (Novudent): tipos del dominio

**Files:** `$NOVU/lib/types.ts`, `$NOVU/lib/seed.ts`

- [ ] **Step 1: agregar tipos** (`lib/types.ts`)

En `BotikaConfig.automations` agregar: `negociacion: boolean;` (al lado de `cobranza`).
Agregar la config (dentro de `BotikaConfig` o como campo nuevo de la clínica — seguir dónde vive la config; ponerlo en `BotikaConfig`):
```ts
  /** Negociación de presupuestos abandonados */
  negociacion?: {
    diasGatillo: number;   // días en "presentado" antes de reenganchar
    maxIntentos: number;   // tope de contactos
    financiacion: { maxCuotas: number; sinInteres: boolean; anticipoMinPct: number };
  };
```
Extender outbox:
```ts
export type OutboxTaskType = "confirmar_cita" | "nps" | "cobranza" | "reagendar" | "postop" | "postop_alert" | "negociacion" | "negociacion_listo";
```
En `OutboxResult` agregar:
```ts
  negociacionStatus?: "listo_para_cerrar" | "negociando" | "rechazado";
  financiacionElegida?: string;
```
En `Budget` agregar:
```ts
  negociacion?: {
    status: "en_curso" | "listo_para_cerrar" | "sin_respuesta" | "rechazado";
    intentos: number;
    ultimoContactoAt: string;
    financiacionElegida?: string;
    resumen?: string;
  };
```

- [ ] **Step 2: default en el seed** (`lib/seed.ts`) — en `config.botika.automations` agregar `negociacion: true`, y `config.botika.negociacion = { diasGatillo: 5, maxIntentos: 2, financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 } }`.

- [ ] **Step 3: typecheck** — `cd "$NOVU" && npx tsc --noEmit` → PASS (puede requerir tocar `app/app/integraciones/page.tsx` si tiene un `Record<OutboxTaskType,...>` exhaustivo — agregar entradas `negociacion`/`negociacion_listo` reusando iconos, igual que se hizo con postop).

- [ ] **Step 4: commit** — `git add -A && git commit -m "feat(negociacion): tipos del dominio + defaults"`

---

## Task 2 (Novudent): helpers puros `lib/negociacion.ts` (TDD)

**Files:** `$NOVU/lib/negociacion.ts`, `$NOVU/lib/negociacion.test.ts`

- [ ] **Step 1: test que falla** (`lib/negociacion.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { defaultNegociacionConfig, isBudgetStale, canRetry } from "./negociacion";

describe("defaultNegociacionConfig", () => {
  it("trae los defaults (5 días, 2 intentos, 3 cuotas sin interés)", () => {
    const c = defaultNegociacionConfig();
    expect(c.diasGatillo).toBe(5);
    expect(c.maxIntentos).toBe(2);
    expect(c.financiacion).toEqual({ maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 });
  });
});

describe("isBudgetStale", () => {
  const now = new Date("2026-06-16T10:00:00.000Z");
  it("presentado hace ≥ N días y sin negociación → stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-10T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(true);
  });
  it("presentado hace < N días → no stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-14T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
  it("no presentado → no stale", () => {
    const b = { status: "aceptado", createdAt: "2026-06-01T10:00:00.000Z" } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
  it("ya tiene negociación terminal → no stale", () => {
    const b = { status: "presentado", createdAt: "2026-06-01T10:00:00.000Z", negociacion: { status: "sin_respuesta", intentos: 2 } } as any;
    expect(isBudgetStale(b, 5, now)).toBe(false);
  });
});

describe("canRetry", () => {
  it("permite si intentos < max", () => {
    expect(canRetry({ negociacion: { intentos: 1 } } as any, 2)).toBe(true);
  });
  it("no permite si intentos >= max", () => {
    expect(canRetry({ negociacion: { intentos: 2 } } as any, 2)).toBe(false);
  });
  it("sin negociación previa → permite", () => {
    expect(canRetry({} as any, 2)).toBe(true);
  });
});
```

- [ ] **Step 2: correr y ver fallar** — `cd "$NOVU" && npx vitest run lib/negociacion.test.ts` → FAIL.

- [ ] **Step 3: implementar** (`lib/negociacion.ts`)
```ts
import type { Budget } from "./types";

export function defaultNegociacionConfig() {
  return { diasGatillo: 5, maxIntentos: 2, financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 } };
}

/** ¿El presupuesto está "presentado" hace ≥ diasGatillo y SIN negociación cerrada/terminal? */
export function isBudgetStale(b: Budget, diasGatillo: number, now: Date): boolean {
  if (b.status !== "presentado") return false;
  // negociación ya terminal (no se vuelve a disparar)
  const st = b.negociacion?.status;
  if (st === "sin_respuesta" || st === "rechazado" || st === "listo_para_cerrar") return false;
  const created = new Date(b.createdAt).getTime();
  const ageDays = (now.getTime() - created) / (24 * 3600 * 1000);
  return ageDays >= diasGatillo;
}

/** ¿Quedan intentos? */
export function canRetry(b: Budget, maxIntentos: number): boolean {
  const intentos = b.negociacion?.intentos ?? 0;
  return intentos < maxIntentos;
}
```

- [ ] **Step 4: correr y ver verde** — `npx vitest run lib/negociacion.test.ts` → PASS (10 tests).

- [ ] **Step 5: commit** — `git add lib/negociacion.ts lib/negociacion.test.ts && git commit -m "feat(negociacion): helpers puros isBudgetStale/canRetry/defaults + tests"`

---

## Task 3 (Novudent): store — reflejo `negociacion` + confirmar

**Files:** `$NOVU/lib/store.tsx`

- [ ] **Step 1: rama `negociacion` en `reflectOutbox`** (después de la rama `postop`, antes del return). `r` es `task.result`:
```ts
  if (task.type === "negociacion" && r.negociacionStatus && task.refId) {
    const bud = next.budgets.find((b) => b.id === task.refId);
    if (bud) {
      const mapa = { listo_para_cerrar: "listo_para_cerrar", negociando: "en_curso", rechazado: "rechazado" } as const;
      const nuevoStatus = mapa[r.negociacionStatus];
      const up = {
        ...bud,
        negociacion: {
          ...(bud.negociacion ?? { intentos: 1, ultimoContactoAt: r.at }),
          status: nuevoStatus,
          financiacionElegida: r.financiacionElegida ?? bud.negociacion?.financiacionElegida,
          resumen: r.summary ?? bud.negociacion?.resumen,
          ultimoContactoAt: r.at,
        },
      };
      next = { ...next, budgets: next.budgets.map((b) => (b.id === up.id ? up : b)) };
      saves.push(["budgets", up.id, up]);
      // si quedó listo para cerrar, avisar a la clínica
      if (nuevoStatus === "listo_para_cerrar") {
        const pat = next.patients.find((p) => p.id === bud.patientId);
        const alertId = `negolisto_${bud.id}`;
        const alert = {
          id: alertId, clinicId: bud.clinicId, type: "negociacion_listo" as const,
          patientId: bud.patientId, phone: "",
          message: `💰 Presupuesto listo para cerrar: ${pat ? pat.firstName + " " + pat.lastName : "paciente"}${r.financiacionElegida ? ` (${r.financiacionElegida})` : ""}. Confirmá las condiciones.`,
          refId: bud.id, status: "pendiente" as const, createdAt: r.at, createdBy: "Negociación",
        };
        saves.push(["outbox", alertId, alert]);
      }
    }
  }
```
(`negociacion_listo` no se envía por WhatsApp — `phone: ""` — es solo señal para la tarjeta del dashboard. El cron de Botika debe SALTEAR tareas con phone vacío; ver Task 8.)

- [ ] **Step 2: acción `confirmNegociacion`** (Ctx interface + value): el humano confirma → presupuesto `aceptado`.
```ts
// interface Ctx:
  confirmNegociacion: (budgetId: string, by: string) => void;
// value:
      confirmNegociacion: (budgetId, by) => {
        const bud = db.budgets.find((b) => b.id === budgetId);
        if (!bud) return;
        const up = { ...bud, status: "aceptado" as const, negociacion: bud.negociacion ? { ...bud.negociacion, status: "listo_para_cerrar" as const } : undefined, history: [...bud.history, { at: new Date().toISOString(), action: "Aceptado tras negociación del bot", by }] };
        persist({ ...db, budgets: db.budgets.map((b) => (b.id === budgetId ? up : b)) });
        fsSave("budgets", budgetId, up);
      },
```

- [ ] **Step 3: verificar** — `npx tsc --noEmit && npx vitest run` → PASS.

- [ ] **Step 4: commit** — `git add lib/store.tsx && git commit -m "feat(negociacion): store refleja resultado + confirmNegociacion"`

---

## Task 4 (Novudent): UI (config + tarjeta dashboard + confirmar en presupuestos)

**Files:** `$NOVU/app/app/configuracion/page.tsx`, `$NOVU/app/app/page.tsx`, `$NOVU/app/app/presupuestos/page.tsx`

- [ ] **Step 1: bloque "Negociación" en Configuración** — toggle `automations.negociacion`, inputs para `diasGatillo` (N), `maxIntentos`, y la política de financiación (`maxCuotas`, `sinInteres`, `anticipoMinPct`). Persistir vía `updateClinicConfig`. Seguir el idioma visual de los otros bloques de config; gatear por `can(session.role, "practice.config")`.

- [ ] **Step 2: tarjeta en el dashboard** (`app/app/page.tsx`, dentro de `criticalTasks`, antes del `.filter(Boolean)`):
```ts
    ...(can(session.role, "budgets.manage")
      ? db.budgets
          .filter((b) => b.negociacion?.status === "listo_para_cerrar" && b.status === "presentado")
          .map((b) => {
            const p = db.patients.find((x) => x.id === b.patientId);
            return {
              icon: FileSpreadsheet, tone: "bg-state-okbg text-state-ok",
              label: `💰 Listo para cerrar: ${p ? p.firstName + " " + p.lastName : "paciente"}`,
              hint: b.negociacion?.financiacionElegida ? `Acordó: ${b.negociacion.financiacionElegida}` : "Confirmá las condiciones",
              href: "/app/presupuestos",
            };
          })
      : []),
```

- [ ] **Step 3: badge + botón en Presupuestos** — en la lista/ficha de presupuestos, mostrar un badge del estado de negociación (en_curso/listo_para_cerrar/sin_respuesta/rechazado) y, cuando `listo_para_cerrar`, un botón "Confirmar y aceptar" → `confirmNegociacion(b.id, session.name)` (gateado por `budgets.manage`).

- [ ] **Step 4: verificar build + qa** —
```bash
cd "$NOVU" && npx tsc --noEmit && npx next build 2>&1 | grep -E "Compiled|error" | head
lsof -ti:3100 | xargs kill -9 2>/dev/null; pkill -9 -f next-server; nohup npx next start -p 3100 >/tmp/n.log 2>&1 & sleep 5; node qa-flow.mjs | tail -3
```
Expected: build ✓, qa-flow 🟢.

- [ ] **Step 5: commit + push** — `git add -A && git commit -m "feat(negociacion): UI config + tarjeta dashboard + confirmar" && git push origin <branch>`

---

## Task 5 (Botika): contexto de negociación `negociacion-context.js` (TDD)

**Files:** `$BOT/api/_lib/negociacion-context.js`, `$BOT/api/_lib/negociacion-context.test.js`

- [ ] **Step 1: test que falla** (`negociacion-context.test.js`)
```js
import { describe, it, expect } from "vitest";
import { buildNegociacionContext } from "./negociacion-context.js";

const budget = { id: "g1", items: [{ description: "Resina", price: 420000 }, { description: "Profilaxis", price: 250000 }], installments: 2, discountPct: 0 };
const config = { financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 } };

describe("buildNegociacionContext", () => {
  it("incluye el total y los ítems", () => {
    const ctx = buildNegociacionContext(budget, config);
    expect(ctx).toMatch(/670.?000|670000/); // total
    expect(ctx).toMatch(/Resina/);
  });
  it("incluye las opciones de financiación de la política", () => {
    const ctx = buildNegociacionContext(budget, config);
    expect(ctx).toMatch(/3 cuotas/);
    expect(ctx).toMatch(/sin inter[ée]s/i);
  });
  it("instruye NO prometer fuera de la política", () => {
    const ctx = buildNegociacionContext(budget, config);
    expect(ctx.toLowerCase()).toMatch(/no prometas|no ofrezcas|fuera de|derivá|consultá/);
  });
});
```

- [ ] **Step 2: correr y ver fallar** — `cd "$BOT" && npx vitest run api/_lib/negociacion-context.test.js` → FAIL.

- [ ] **Step 3: implementar** (`negociacion-context.js`)
```js
// Texto que se inyecta en el system prompt del bot cuando hay una negociación
// de presupuesto activa. El bot ofrece SOLO dentro de la política.
export function buildNegociacionContext(budget, config) {
  const items = (budget.items || []).map((i) => `- ${i.description}: Gs ${Number(i.price).toLocaleString("es-PY")}`).join("\n");
  const subtotal = (budget.items || []).reduce((s, i) => s + Number(i.price || 0), 0);
  const total = Math.round(subtotal * (1 - (Number(budget.discountPct || 0) / 100)));
  const fin = config?.financiacion || { maxCuotas: 1, sinInteres: false, anticipoMinPct: 0 };
  const opciones = `hasta ${fin.maxCuotas} cuotas${fin.sinInteres ? " sin interés" : ""}${fin.anticipoMinPct ? ` (anticipo mínimo ${fin.anticipoMinPct}%)` : ""}`;
  return [
    `CONTEXTO DE NEGOCIACIÓN — el paciente tiene un presupuesto presentado sin aceptar.`,
    `Tratamiento:`,
    items,
    `Total: Gs ${total.toLocaleString("es-PY")}.`,
    budget.installments ? `El profesional propuso ${budget.installments} cuotas.` : ``,
    `Financiación que PODÉS ofrecer (política de la clínica): ${opciones}.`,
    `Tu objetivo: resolver dudas de costo con calidez, ofrecer estas opciones de financiación y acercar al paciente a aceptar.`,
    `REGLAS: NO prometas descuentos ni cuotas fuera de la política. Si el paciente pide algo distinto, decile que lo consultás con el equipo y que la clínica le confirma (no inventes). Nunca presiones; ofrecé hablar con una persona si lo prefiere.`,
  ].filter(Boolean).join("\n");
}
```

- [ ] **Step 4: correr y ver verde** — `npx vitest run api/_lib/negociacion-context.test.js` → PASS.

- [ ] **Step 5: commit** — `git add api/_lib/negociacion-context.js api/_lib/negociacion-context.test.js && git commit -m "feat(negociacion): contexto inyectable al system prompt + tests"`

---

## Task 6 (Botika): rama `negociacion` en `detectNovudentOutcome` + opening

**Files:** `$BOT/api/_lib/novudent.js`

- [ ] **Step 1: opening** — agregar (export):
```js
export function buildNegociacionOpening(paciente, total) {
  return `Hola ${paciente} 👋 Te escribo de la clínica por el presupuesto que vimos juntos` +
    (total ? ` (Gs ${Number(total).toLocaleString("es-PY")})` : "") +
    `. ¿Quedaste con alguna duda sobre el costo o las formas de pago? Tenemos opciones de financiación que te pueden venir bien. ¿Querés que te cuente? 😊`;
}
```

- [ ] **Step 2: rama `negociacion` en `detectNovudentOutcome`** — clasifica la respuesta del paciente. Reusa `callKimi` (como `classifyPostop` de la feature anterior) con un prompt estricto que devuelve JSON `{ status: "listo_para_cerrar"|"negociando"|"rechazado", financiacionElegida?: string, summary: string }`. **SUAVE:** ante ambigüedad, `negociando` (nunca cerrar por las dudas). Si la IA falla → `negociando` (no terminal). Devolver el resultado con `negociacionStatus`, `financiacionElegida`, `summary`, `comment`, `at` (los campos que Novudent lee). Seguir el patrón JSON del repo (strip fences + `{…}` + validar).

- [ ] **Step 3: test** — en `negociacion-context.test.js` o un test nuevo, validar el guard suave de forma pura si extraés la lógica de merge/validación (p. ej. una función `safeNegociacionStatus(raw)` que mapea entradas inválidas → "negociando"). `npx vitest run` → PASS.

- [ ] **Step 4: verificar suite** — `cd "$BOT" && npm test 2>&1 | tail -10` → todo PASS.

- [ ] **Step 5: commit** — `git add api/_lib/novudent.js api/_lib/*.test.js && git commit -m "feat(negociacion): clasificación de resultado (suave) + opening"`

---

## Task 7 (Botika): inyectar el contexto en la conversación del bot

**Files:** el path de respuesta del bot (probablemente `api/ycloud-webhook.js` donde arma el `systemPrompt` con `buildSystemPrompt`).

- [ ] **Step 1: leer** cómo el webhook arma el `systemPrompt` para un contacto y dónde está la sección Novudent (la integración ya inyecta un `novudentSection`). **READ FIRST.**

- [ ] **Step 2: inyectar** — cuando el contacto tiene una tarea `negociacion` activa (o el `novudent_task` asociado es de tipo negociacion), llamar a `buildNegociacionContext(budget, config)` y concatenarlo a la sección que se pasa a `buildSystemPrompt`. Necesitás el budget (leerlo de Firestore por `refId` con los helpers REST) y la `negociacion` config de la clínica.

- [ ] **Step 3: verificar suite** — `npm test 2>&1 | tail -8` → PASS.

- [ ] **Step 4: commit + push** — `git add -A && git commit -m "feat(negociacion): inyecta contexto del presupuesto en el system prompt del bot" && git push origin <branch>`

---

## Task 8 (Botika): cron — disparar negociación de presupuestos stale

**Files:** `$BOT/api/cron-reminders.js` (job `novudent-outbox`)

- [ ] **Step 1: disparo** — por clínica con `config.botika.automations.negociacion` ON: leer `clinics/{cid}/budgets`; para cada budget con `status==presentado`, `isBudgetStale`-equivalente (≥ `diasGatillo` días, sin negociación terminal) y `intentos < maxIntentos`: crear tarea outbox `negociacion` (refId=budgetId, phone del paciente, `buildNegociacionOpening(nombre, total)`); incrementar `budget.negociacion.intentos` (+ `status:"en_curso"`, `ultimoContactoAt`) vía `patchDocumentFields`. (Reusa los helpers REST agregados en la feature post-op.)

- [ ] **Step 2: saltear `negociacion_listo` con phone vacío** — esas tareas son señal interna (tarjeta del dashboard), NO se envían por WhatsApp. En el loop de envío, saltear tareas cuyo `phone` esté vacío (marcarlas `enviado`/`done` sin mandar). Verificar que no rompe el resto.

- [ ] **Step 3: verificar** — `npm test 2>&1 | tail -10` → PASS; el job no rompe con clínicas sin budgets/negociacion.

- [ ] **Step 4: commit + push** — `git add api/cron-reminders.js && git commit -m "feat(negociacion): cron dispara reenganche de presupuestos stale" && git push origin <branch>`

---

## Task 9: Validación E2E (interactivo)

- [ ] En una clínica linkeada a Botika, dejar un presupuesto `presentado` con `createdAt` de hace ≥ 5 días y un paciente con WhatsApp real. Disparar el cron → llega el WhatsApp de apertura.
- [ ] Conversar: preguntar por el costo y las cuotas → el bot responde dentro de la política. Decir "dale, acepto las 3 cuotas" → el presupuesto aparece en el dashboard como **"listo para cerrar"** con la financiación.
- [ ] Confirmar desde el dashboard → el presupuesto pasa a `aceptado`.
- [ ] Probar el no-interés ("no gracias") → `rechazado`, sin más mensajes. Y el no-responde tras 2 intentos → `sin_respuesta`.

---

## Self-review

**Cobertura del spec:** modelo de datos → Task 1 ✓; helpers → Task 2 ✓; reflejo + confirmar → Task 3 ✓; UI (config/dashboard/presupuestos) → Task 4 ✓; contexto de financiación inyectable → Task 5 ✓; clasificación suave + opening → Task 6 ✓; inyección en la conversación → Task 7 ✓; disparo automático + cap + saltear señal interna → Task 8 ✓; E2E → Task 9 ✓.

**Consistencia de tipos:** la tarea outbox lleva `refId = budgetId` (Task 8) y se parsea en `reflectOutbox` por `budgets.find(refId)` (Task 3). `OutboxResult.negociacionStatus/financiacionElegida/summary` (Task 1) se escriben en Task 6 y se leen en Task 3. `negociacion`/`negociacion_listo` consistentes en Tasks 1/3/8. La config `negociacion` (Task 1) se lee en Tasks 4/7/8.

**Sin placeholders:** núcleos (helpers, contexto, reflejo) con código completo; UI/cron/inyección con archivos exactos + el código clave + verificación por build/tests (las partes mecánicas siguen el patrón existente del repo, igual que en la feature post-op ya entregada).
