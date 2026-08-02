# Gestión de cheques — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que se pueda registrar un pago con cheque desde la UI (hoy es imposible) y seguirlo por estado — por cobrar / cobrado / anulado — con paridad Dentalink.

**Architecture:** `Payment` gana un bloque `check` opcional; el estado del cheque se **deriva** (`checkStatus()`), nunca se guarda como campo propio. Anular un cheque reusa `voidPayment` tal cual existe hoy — la plata vuelve a la deuda del paciente por el mismo camino que cualquier pago anulado, cero cambios en `patientBalance`/`budgetBalance`/`sessionTotals`. Una 5ª regla en el motor de tareas automáticas (`lib/tareas.ts`) deriva "cheque por cobrar" con el mismo patrón que las otras cuatro, pero sin pasar por `plazoDe` — su vencimiento ya es una fecha absoluta.

**Tech Stack:** TypeScript · Next.js 14 App Router · vitest · Tailwind · Firestore Web SDK (sin cambios de reglas: `payments` ya acepta cualquier campo).

**Spec:** [`docs/superpowers/specs/2026-08-01-gestion-cheques-design.md`](../specs/2026-08-01-gestion-cheques-design.md)

---

## Contexto que el implementador necesita saber

1. **`cheque` existe como `PaymentMethod` desde siempre pero está muerto.** `PAYMENT_METHOD_LABEL` (`lib/budgets.ts`) no tiene entrada para él y `RecibirPago.tsx` ni lo lista en su `<select>`. Esta es la causa raíz que el plan corrige.
2. **No hay Admin SDK ni cron** (Firebase Spark). Por eso el estado del cheque se deriva en lectura, igual que las tareas automáticas — no hay proceso de servidor que lo actualice.
3. **`payments` ya está cubierta en `firestore.rules`** con `write: if (isStaff(cid) && subActive(cid))`, sin allowlist de campos. Agregar `check`/`voidReason` a `Payment` **no requiere tocar `firestore.rules`**. No la toques.
4. **Los helpers puros van con TDD.** Test primero, verlo fallar, después implementar — es norma del proyecto.
5. **El motor de tareas (`lib/tareas.ts`) es puro**: solo importa de `./types` y `./budgets`. Si en algún paso ves que hace falta importar `react`, `firebase` o `./store` ahí, pará — algo se salió del diseño.
6. **Ya existe un módulo de tareas automáticas** (`lib/tareas.ts`, `app/app/tareas/page.tsx`) con 4 reglas (cobranza/captura/control/cita). Este plan le agrega una 5ª. Leé `lib/tareas.ts` completo antes de tocarlo — vas a reusar sus patrones (`derivedKey`, `instanceKey`, agrupar antes de iterar, etc.), no reinventarlos.
7. **Correr antes de mergear:** `npx tsc --noEmit && npx vitest run && npm run build`.

### Definiciones reales del proyecto (no las inventes)

```ts
// lib/types.ts — tal cual existen HOY, antes de este plan
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "cheque" | "qr";
export interface Payment {
  id: string; clinicId: string; patientId: string; budgetId?: string;
  date: string; amount: number; method: PaymentMethod; concept: string; receivedBy: string;
  paymentNumber?: string; receiptNumber?: string; dueDate?: string;
  voidedAt?: string; voidedBy?: string;
}
export type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "personalizada";
export type TaskDeadline = { kind: "inmediato" } | { kind: "dias"; n: number };
export type TaskDeadlines = Partial<Record<Exclude<MgmtTaskType, "personalizada">, TaskDeadline>>;

// lib/budgets.ts
export const PAYMENT_METHOD_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", qr: "QR / billetera" };
export function patientBalance(patientId: string, budgets: Budget[], payments: Payment[]): number { /* ya filtra !voidedAt */ }
export function budgetBalance(b: Budget, payments: Payment[]): number { /* ídem */ }

// lib/tareas.ts
export const DEFAULT_DEADLINES: Required<TaskDeadlines> = { cobranza: {...}, captura: {...}, control: {...}, cita: {...} };
export type AutoTaskType = Exclude<MgmtTaskType, "personalizada">;
export function plazoDe(type: AutoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline { ... }
export interface DerivedTask { derivedKey: string; instanceKey: string; type: AutoTaskType; patientId: string; title: string; detail?: string; amount?: number; budgetId?: string; eventAt: string; dueDate: string; }
export interface TareasInput { patients: Patient[]; budgets: Budget[]; payments: Payment[]; appointments: Appointment[]; deadlines?: TaskDeadlines; }
export function derivarTareas(input: TareasInput, hoy: string): DerivedTask[] { ... }

// lib/store.tsx (interface + implementación)
addPayment: (p: Payment) => void;
voidPayment: (id: string, by: string) => void;
```

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/types.ts` | `Payment.check`, `Payment.voidReason`, `MgmtTaskType` += `"cheque"`, `TaskDeadlines` acotado a los 4 tipos con plazo |
| `lib/budgets.ts` | `checkStatus()` (puro), `PAYMENT_METHOD_LABEL` += `cheque` |
| `lib/budgets.test.ts` | tests de `checkStatus` |
| `lib/tareas.ts` | `PlazoTaskType`/`AutoTaskType` separados, 5ª regla `cheque` en `derivarTareas` |
| `lib/tareas.test.ts` | tests de la regla `cheque` |
| `lib/store.tsx` | `voidPayment` += `reason` opcional; nueva acción `markCheckCobrado` |
| `components/RecibirPago.tsx` | opción "Cheque" + campos condicionales |
| `app/app/caja/page.tsx` | campos condicionales en "Registrar pago"; tab **Cheques** nuevo |
| `app/app/tareas/page.tsx` | `TYPE_LABEL`/`TYPE_TONE` += `cheque` |
| `lib/seed.ts` | un cheque de ejemplo en el demo |

---

## Task 1: Tipos

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Agregar el bloque `check` y `voidReason` a `Payment`**

En `lib/types.ts`, dentro de `export interface Payment`, después de `voidedBy?: string;`:

```ts
  /** Motivo de anulación (libre: "Rebotó", "El paciente lo retiró"…). Aplica a
   *  cualquier pago anulado, no solo cheques. */
  voidReason?: string;
  /** Datos del cheque. Presente únicamente cuando `method === "cheque"`. */
  check?: {
    number: string;
    bank: string;
    /** Fecha en que se puede cobrar (YYYY-MM-DD) — el "vencimiento" del cheque. */
    cashDate: string;
    /** Cuándo se confirmó que el banco lo acreditó. Ausente = todavía pendiente. */
    cobradoAt?: string;
    cobradoBy?: string;
  };
```

- [ ] **Step 2: Agregar `"cheque"` a `MgmtTaskType` y acotar `TaskDeadlines`**

En `lib/types.ts`, reemplazar:

```ts
export type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "personalizada";
```

por:

```ts
export type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "cheque" | "personalizada";
```

Y reemplazar:

```ts
export type TaskDeadlines = Partial<Record<Exclude<MgmtTaskType, "personalizada">, TaskDeadline>>;
```

por:

```ts
// Los 4 tipos cuyo vencimiento es "evento + plazo configurable". "cheque" queda
// afuera a propósito: su vencimiento YA es una fecha absoluta (la fecha de cobro
// del cheque), no un plazo que sumar — agregarlo acá obligaría a un default sin
// uso real (ver lib/tareas.ts, PlazoTaskType).
export type TaskDeadlines = Partial<Record<"cita" | "captura" | "control" | "cobranza", TaskDeadline>>;
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: **falla**, y eso es correcto todavía — `lib/tareas.ts` sigue usando
`AutoTaskType = Exclude<MgmtTaskType, "personalizada">` (ahora incluye
`"cheque"`) contra el `TaskDeadlines` ya acotado, y `DEFAULT_DEADLINES` no
tiene entrada `cheque`. El error tiene que mencionar `lib/tareas.ts`. Se
arregla en la Task 4 — por ahora **no lo toques**, es la prueba de que el tipo
nuevo está correctamente restringido.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(cheques): tipos — Payment.check, voidReason, MgmtTaskType cheque"
```

---

## Task 2: `checkStatus()` puro + habilitar "Cheque" en el desplegable

**Files:**
- Modify: `lib/budgets.ts`
- Modify: `lib/budgets.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/budgets.test.ts`:

```ts
import { checkStatus } from "./budgets";
import type { Payment } from "./types";

const chequePago = (extra: Partial<Payment> = {}): Payment => ({
  id: "y1", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z",
  amount: 375_000, method: "cheque", concept: "Cheque", receivedBy: "u1",
  check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05" },
  ...extra,
});

describe("checkStatus", () => {
  it("sin voidedAt ni cobradoAt → pendiente", () => {
    expect(checkStatus(chequePago())).toBe("pendiente");
  });

  it("con cobradoAt seteado → cobrado", () => {
    expect(checkStatus(chequePago({ check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" } }))).toBe("cobrado");
  });

  it("con voidedAt seteado → anulado", () => {
    expect(checkStatus(chequePago({ voidedAt: "2026-07-31T10:00:00.000Z" }))).toBe("anulado");
  });

  it("anulado gana aunque también esté cobradoAt — no hay estado imposible", () => {
    const p = chequePago({
      voidedAt: "2026-08-01T10:00:00.000Z",
      check: { number: "001", bank: "Banco Test", cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" },
    });
    expect(checkStatus(p)).toBe("anulado");
  });

  it("un pago que no es cheque también resuelve (sin check, sin voidedAt) → pendiente", () => {
    expect(checkStatus({ id: "y2", clinicId: "c1", patientId: "p1", date: "2026-07-20T10:00:00.000Z", amount: 100_000, method: "efectivo", concept: "Abono", receivedBy: "u1" })).toBe("pendiente");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/budgets.test.ts`
Expected: FAIL — `checkStatus is not a function`.

- [ ] **Step 3: Implementar**

En `lib/budgets.ts`, agregar el tipo y la función después de `patientBalance`:

```ts
export type CheckStatus = "pendiente" | "cobrado" | "anulado";

/** Deriva el estado del cheque — nunca se guarda como campo propio. Guardarlo
 *  aparte permitiría el estado imposible "voidedAt seteado pero status:
 *  pendiente"; derivarlo lo hace irrepresentable. `anulado` gana sobre
 *  `cobrado` a propósito: un cheque que se descubre rebotado DESPUÉS de
 *  marcarlo cobrado tiene que poder anularse igual. */
export function checkStatus(p: Payment): CheckStatus {
  if (p.voidedAt) return "anulado";
  if (p.check?.cobradoAt) return "cobrado";
  return "pendiente";
}
```

Y sumar la entrada que faltaba en `PAYMENT_METHOD_LABEL`:

```ts
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  cheque: "Cheque",
  qr: "QR / billetera",
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/budgets.test.ts`
Expected: PASS — 11 tests (6 previos + 5 nuevos).

- [ ] **Step 5: Commit**

```bash
git add lib/budgets.ts lib/budgets.test.ts
git commit -m "feat(cheques): checkStatus() derivado + habilitar Cheque en PAYMENT_METHOD_LABEL"
```

---

## Task 3: Store — `voidPayment` con motivo + marcar cobrado

**Files:**
- Modify: `lib/store.tsx`

> Sin test dedicado: `lib/store.tsx` no tiene suite propia en este proyecto —
> verificado (`ls lib/store*.test.*` no devuelve nada), no asumido. Cada acción
> es un closure sobre `db`/`persist`/`fsSave`, no una función pura, así que
> testearla aislada exigiría un harness que el proyecto no tiene hoy. Se
> verifica por uso: Task 8 la consume, y la Task 11 la ejercita de punta a
> punta contra el demo real (Prueba C).

- [ ] **Step 1: Extender la firma de `voidPayment`**

En `lib/store.tsx`, en la interface de acciones, reemplazar:

```ts
  voidPayment: (id: string, by: string) => void;
```

por:

```ts
  voidPayment: (id: string, by: string, reason?: string) => void;
  /** Cheque acreditado en el banco. No toca el saldo del paciente — ya bajó al
   *  recibir el cheque; esto solo cambia su estado (ver checkStatus en lib/budgets.ts). */
  markCheckCobrado: (id: string, by: string) => void;
```

- [ ] **Step 2: Extender la implementación de `voidPayment` y agregar `markCheckCobrado`**

En `lib/store.tsx`, reemplazar:

```ts
      voidPayment: (id: string, by: string) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p) return;
        const up = { ...p, voidedAt: new Date().toISOString(), voidedBy: by };
        persist({ ...db, payments: db.payments.map((x) => (x.id === id ? up : x)) });
        fsSave("payments", id, up);
      },
```

por:

```ts
      voidPayment: (id, by, reason) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p) return;
        const up = { ...p, voidedAt: new Date().toISOString(), voidedBy: by, ...(reason ? { voidReason: reason } : {}) };
        persist({ ...db, payments: db.payments.map((x) => (x.id === id ? up : x)) });
        fsSave("payments", id, up);
      },
      markCheckCobrado: (id, by) => {
        const p = db.payments.find((x) => x.id === id);
        if (!p || !p.check) return;
        const up = { ...p, check: { ...p.check, cobradoAt: new Date().toISOString(), cobradoBy: by } };
        persist({ ...db, payments: db.payments.map((x) => (x.id === id ? up : x)) });
        fsSave("payments", id, up);
      },
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sigue con el mismo error de la Task 1 (esperado — se arregla en la
Task 4). No debe haber errores NUEVOS relacionados con `store.tsx`.

- [ ] **Step 4: Commit**

```bash
git add lib/store.tsx
git commit -m "feat(cheques): voidPayment admite motivo + acción markCheckCobrado"
```

---

## Task 4: Motor — separar `PlazoTaskType` y agregar la 5ª regla

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

> **Antes de tocar nada, releé `lib/tareas.ts` completo.** Este task edita
> `AutoTaskType`, `plazoDe` y `derivarTareas`, que ya existen con 4 reglas
> funcionando y 234 tests verdes. No reescribas las reglas existentes — solo
> agregás la 5ª y ajustás los dos tipos.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`, después del `describe("idempotencia de las claves derivadas", ...)`:

```ts
const payCheque = (id: string, patientId: string, amount: number, check: { cashDate: string; cobradoAt?: string }, extra: Partial<Payment> = {}): Payment => ({
  id, clinicId: "c1", patientId, date: "2026-07-20T10:00:00.000Z", amount,
  method: "cheque", concept: "Cheque", receivedBy: "u1",
  check: { number: "001", bank: "Banco Test", ...check },
  ...extra,
});

describe("regla cheque", () => {
  it("abre una tarea para un cheque pendiente, con dueDate = cashDate tal cual", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], payments: [payCheque("y1", "p1", 375_000, { cashDate: "2026-08-05" })] }, HOY);
    const c = t.filter((x) => x.type === "cheque");
    expect(c).toHaveLength(1);
    expect(c[0].derivedKey).toBe("cheque:y1");
    expect(c[0].instanceKey).toBe("y1");
    expect(c[0].dueDate).toBe("2026-08-05");
    expect(c[0].amount).toBe(375_000);
    expect(c[0].patientId).toBe("p1");
  });

  it("NO abre para un pago que no es cheque", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], payments: [pay("y1", "p1", 375_000)] }, HOY);
    expect(t.filter((x) => x.type === "cheque")).toHaveLength(0);
  });

  it("NO abre si el cheque ya se marcó cobrado — auto-cierre", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], payments: [payCheque("y1", "p1", 375_000, { cashDate: "2026-08-05", cobradoAt: "2026-07-31T10:00:00.000Z" })] }, HOY);
    expect(t.filter((x) => x.type === "cheque")).toHaveLength(0);
  });

  it("NO abre si el cheque está anulado — auto-cierre", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], payments: [payCheque("y1", "p1", 375_000, { cashDate: "2026-08-05" }, { voidedAt: "2026-07-31T10:00:00.000Z" })] }, HOY);
    expect(t.filter((x) => x.type === "cheque")).toHaveLength(0);
  });

  it("dos cheques del mismo paciente derivan DOS tareas — a diferencia de cobranza/control", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      payments: [payCheque("y1", "p1", 100_000, { cashDate: "2026-08-05" }), payCheque("y2", "p1", 200_000, { cashDate: "2026-08-10" })],
    }, HOY);
    expect(t.filter((x) => x.type === "cheque")).toHaveLength(2);
  });

  it("el detalle trae banco y número", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], payments: [payCheque("y1", "p1", 375_000, { cashDate: "2026-08-05" })] }, HOY);
    expect(t.find((x) => x.type === "cheque")!.detail).toBe("Banco Test · N° 001");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — 0 tareas de tipo `cheque` en vez de 1/2 según el test.

- [ ] **Step 3: Separar `PlazoTaskType` de `AutoTaskType`**

En `lib/tareas.ts`, reemplazar:

```ts
export type AutoTaskType = Exclude<MgmtTaskType, "personalizada">;
```

por:

```ts
// Los 4 con vencimiento configurable ("evento + plazo"). Mismo conjunto que las
// claves de TaskDeadlines — se nombra aparte para que la firma de plazoDe()
// quede explícita y no dependa de un keyof indirecto.
export type PlazoTaskType = "cita" | "captura" | "control" | "cobranza";
export type AutoTaskType = PlazoTaskType | "cheque";
```

Y reemplazar:

```ts
/** Plazo efectivo de un tipo: lo que configuró la clínica, o el default. */
export function plazoDe(type: AutoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}
```

por:

```ts
/** Plazo efectivo de un tipo: lo que configuró la clínica, o el default.
 *  El parámetro es PlazoTaskType, no AutoTaskType: llamar plazoDe("cheque", …)
 *  tiene que ser un error de compilación. Es lo que impide cablear por error la
 *  regla de cheque a través de un mecanismo de plazos que no le corresponde —
 *  su vencimiento es una fecha absoluta (cashDate), no evento+plazo. */
export function plazoDe(type: PlazoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}
```

- [ ] **Step 4: Agregar `checkStatus` al import de `./budgets`**

En `lib/tareas.ts`, reemplazar:

```ts
import { budgetTotal } from "./budgets";
```

por:

```ts
import { budgetTotal, checkStatus } from "./budgets";
```

- [ ] **Step 5: Agregar la regla `cheque` en `derivarTareas`**

En `lib/tareas.ts`, dentro de `derivarTareas`, justo antes de `return out;` (después
del bloque `// ── cita: …`), agregar:

```ts
  // ── cheque: uno por cheque recibido y todavía no resuelto ───────────────
  // Cada cheque es su propio Payment: la clave ya es única por instancia, así
  // que —a diferencia de cobranza/control— acá no hace falta indexar por
  // paciente ni colapsar varios en una sola tarea.
  for (const p of payments) {
    if (p.method !== "cheque" || !p.check) continue;
    if (checkStatus(p) !== "pendiente") continue;
    out.push({
      derivedKey: `cheque:${p.id}`,
      instanceKey: p.id,
      type: "cheque",
      patientId: p.patientId,
      title: "Cheque por cobrar",
      detail: `${p.check.bank} · N° ${p.check.number}`,
      amount: p.amount,
      budgetId: p.budgetId,
      eventAt: p.date,
      // No pasa por plazoDe/calcularVencimiento: la fecha de cobro YA es la
      // fecha de vencimiento, no hay plazo que sumarle a un evento.
      dueDate: p.check.cashDate,
    });
  }
```

- [ ] **Step 6: Actualizar el test de idempotencia para que cubra el 5° tipo**

En `lib/tareas.test.ts`, dentro de `describe("idempotencia de las claves derivadas", ...)`,
reemplazar:

```ts
  const input = {
    patients: [pac("p1"), pac("p2", "Beto", "Ejemplo")],
    budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "presentado", 200_000), bud("b3", "p2", "completado", 300_000)],
    payments: [pay("y1", "p1", 100_000)],
    appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
  };
```

por:

```ts
  const input = {
    patients: [pac("p1"), pac("p2", "Beto", "Ejemplo")],
    budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "presentado", 200_000), bud("b3", "p2", "completado", 300_000)],
    payments: [pay("y1", "p1", 100_000), payCheque("y2", "p1", 375_000, { cashDate: "2026-08-05" })],
    appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
  };
```

Y reemplazar:

```ts
  it("toda clave tiene la forma tipo:id", () => {
    for (const t of derivarTareas(input, HOY)) {
      expect(t.derivedKey).toMatch(/^(cobranza|captura|control|cita):[\w-]+$/);
    }
  });
```

por:

```ts
  it("toda clave tiene la forma tipo:id", () => {
    for (const t of derivarTareas(input, HOY)) {
      expect(t.derivedKey).toMatch(/^(cobranza|captura|control|cita|cheque):[\w-]+$/);
    }
  });
```

> `payCheque` está definida más abajo en el archivo (Step 1 de este mismo task).
> Si `lib/tareas.test.ts` no compila por orden de declaración, movela arriba del
> todo, junto a `pac`/`bud`/`pay`/`cita` — son todos helpers de fixture, van juntos.

- [ ] **Step 7: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 84 tests (78 previos + 6 de la regla cheque).

- [ ] **Step 8: Verificar tipos en todo el proyecto**

Run: `npx tsc --noEmit`
Expected: **sin salida**. Esto confirma que el error "pendiente" desde la
Task 1 (DEFAULT_DEADLINES sin `cheque`, `AutoTaskType` roto) ya se resolvió al
separar `PlazoTaskType`.

- [ ] **Step 9: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(cheques): 5ª regla del motor de tareas — cheque por cobrar"
```

---

## Task 5: Checkpoint del motor

**Files:** ninguno (verificación)

- [ ] **Step 1: Confirmar que el motor sigue puro**

Run: `grep -nE "^import" lib/tareas.ts`
Expected: solo imports de `./types` y `./budgets`. Si aparece `react`,
`firebase` o `./store`, algo se salió del diseño — revertí ese import.

- [ ] **Step 2: Confirmar que nadie puede llamar `plazoDe("cheque", …)`**

Run: `grep -n 'plazoDe("cheque"' lib/tareas.ts lib/tareas.test.ts`
Expected: **sin salida**. Si aparece algo, borralo — es exactamente lo que la
separación de tipos de la Task 4 debía impedir en tiempo de compilación.

- [ ] **Step 3: Suite completa**

Run: `npx vitest run`
Expected: PASS — 29 archivos, 293 tests (282 de la base actual + 6 de la regla
`cheque` en `tareas.test.ts` + 5 de `checkStatus` en `budgets.test.ts`).

---

## Task 6: `RecibirPago.tsx` — opción Cheque

**Files:**
- Modify: `components/RecibirPago.tsx`

> El selector de `method` hoy solo existe dentro del bloque `pagables.length > 0`
> (la sección "Seleccioná uno o varios planes…"), y `pagarCuota` reusa ese mismo
> estado de nivel de componente. Esta limitación es **preexistente** — un
> paciente que solo tiene cuotas de financiamiento sin presupuestos con saldo
> nunca ve el selector de medio. No la arregles acá: fuera de alcance.

- [ ] **Step 1: Agregar estado para los campos del cheque**

En `components/RecibirPago.tsx`, dentro de `RecibirPagoTab`, después de:

```ts
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
```

agregar:

```ts
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [checkCashDate, setCheckCashDate] = useState(() => new Date().toISOString().slice(0, 10));
```

- [ ] **Step 2: Armar el bloque `check` al construir el `Payment`**

En `pagar()`, reemplazar:

```ts
      addPayment({
        id: `pay_${Date.now()}_${b.id}`,
        clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
        date: new Date(date + "T12:00:00").toISOString(), amount: saldo, method,
        concept: concept.trim() || `Abono plan #${b.id}`, receivedBy: session.name,
      });
```

por:

```ts
      addPayment({
        id: `pay_${Date.now()}_${b.id}`,
        clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
        date: new Date(date + "T12:00:00").toISOString(), amount: saldo, method,
        concept: concept.trim() || `Abono plan #${b.id}`, receivedBy: session.name,
        ...(method === "cheque" ? { check: { number: checkNumber.trim(), bank: checkBank.trim(), cashDate: checkCashDate } } : {}),
      });
```

En `pagarCuota()`, aplicar el mismo cambio: reemplazar

```ts
    addPayment({
      id: `pay_${Date.now()}_${b.id}_c${c.numero}`,
      clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
      date: new Date().toISOString(), amount: c.saldo, method,
      concept: `Cuota #${c.numero} — plan #${b.id}`, receivedBy: session.name,
    });
```

por:

```ts
    addPayment({
      id: `pay_${Date.now()}_${b.id}_c${c.numero}`,
      clinicId: patient.clinicId, patientId: patient.id, budgetId: b.id,
      date: new Date().toISOString(), amount: c.saldo, method,
      concept: `Cuota #${c.numero} — plan #${b.id}`, receivedBy: session.name,
      ...(method === "cheque" ? { check: { number: checkNumber.trim(), bank: checkBank.trim(), cashDate: checkCashDate } } : {}),
    });
```

- [ ] **Step 3: Agregar "Cheque" al `<select>` y los campos condicionales**

Reemplazar:

```tsx
              <Field label="Medio">
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="qr">QR / billetera</option>
                </select>
              </Field>
              <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Abono…" /></Field>
              <Btn disabled={selBudgets.length === 0} onClick={pagar} className="w-full justify-center">
                <Wallet className="h-4 w-4" /> Pagar tratamiento(s){totalSel > 0 ? ` · ${fmtGs(totalSel)}` : ""}
              </Btn>
            </div>
          </Card>
```

por:

```tsx
              <Field label="Medio">
                <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="qr">QR / billetera</option>
                </select>
              </Field>
              <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Abono…" /></Field>
              <Btn disabled={selBudgets.length === 0 || (method === "cheque" && (!checkNumber.trim() || !checkBank.trim()))} onClick={pagar} className="w-full justify-center">
                <Wallet className="h-4 w-4" /> Pagar tratamiento(s){totalSel > 0 ? ` · ${fmtGs(totalSel)}` : ""}
              </Btn>
            </div>
            {method === "cheque" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="N° de cheque"><input className={inputCls} value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="00012345" /></Field>
                <Field label="Banco"><input className={inputCls} value={checkBank} onChange={(e) => setCheckBank(e.target.value)} placeholder="Banco Continental" /></Field>
                <Field label="Fecha de cobro"><input type="date" className={inputCls} value={checkCashDate} onChange={(e) => setCheckCashDate(e.target.value)} /></Field>
              </div>
            )}
          </Card>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add components/RecibirPago.tsx
git commit -m "feat(cheques): opción Cheque en Recibir pago, con campos condicionales"
```

---

## Task 7: Caja — "Registrar pago" (pago libre) con Cheque

**Files:**
- Modify: `app/app/caja/page.tsx`

> `Object.entries(PAYMENT_METHOD_LABEL)` ya va a mostrar "Cheque" solo, gracias
> a la Task 2. Este task solo agrega los campos condicionales al modal.

- [ ] **Step 1: Agregar estado en `PaymentForm`**

En `app/app/caja/page.tsx`, dentro de `PaymentForm`, después de:

```ts
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
```

agregar:

```ts
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [checkCashDate, setCheckCashDate] = useState(() => new Date().toISOString().slice(0, 10));
```

- [ ] **Step 2: Campos condicionales + armar el `check` al guardar**

Reemplazar:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (Gs)"><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Método">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Cuota ortodoncia, profilaxis…" /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={!patientId || amount <= 0 || !concept.trim()} onClick={() => {
            const pay: Payment = { id: `pay_${Date.now()}`, clinicId: db.clinics[0].id, patientId, budgetId: budgetId || undefined, date: new Date().toISOString(), amount, method, concept: concept.trim(), receivedBy: session!.name };
            store.addPayment(pay);
            onClose();
          }}>Registrar {amount > 0 && fmtGs(amount)}</Btn>
        </div>
```

por:

```tsx
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (Gs)"><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Método">
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        {method === "cheque" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="N° de cheque"><input className={inputCls} value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} placeholder="00012345" /></Field>
            <Field label="Banco"><input className={inputCls} value={checkBank} onChange={(e) => setCheckBank(e.target.value)} placeholder="Banco Continental" /></Field>
            <Field label="Fecha de cobro"><input type="date" className={inputCls} value={checkCashDate} onChange={(e) => setCheckCashDate(e.target.value)} /></Field>
          </div>
        )}
        <Field label="Concepto"><input className={inputCls} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Cuota ortodoncia, profilaxis…" /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={!patientId || amount <= 0 || !concept.trim() || (method === "cheque" && (!checkNumber.trim() || !checkBank.trim()))} onClick={() => {
            const pay: Payment = {
              id: `pay_${Date.now()}`, clinicId: db.clinics[0].id, patientId, budgetId: budgetId || undefined,
              date: new Date().toISOString(), amount, method, concept: concept.trim(), receivedBy: session!.name,
              ...(method === "cheque" ? { check: { number: checkNumber.trim(), bank: checkBank.trim(), cashDate: checkCashDate } } : {}),
            };
            store.addPayment(pay);
            onClose();
          }}>Registrar {amount > 0 && fmtGs(amount)}</Btn>
        </div>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add app/app/caja/page.tsx
git commit -m "feat(cheques): campos condicionales en Registrar pago (Cajas)"
```

---

## Task 8: Caja — tab **Cheques**

**Files:**
- Modify: `app/app/caja/page.tsx`

- [ ] **Step 1: Importar `checkStatus` y extender el tipo `Tab`**

Reemplazar:

```ts
import { budgetTotal, budgetBalance, patientBalance, PAYMENT_METHOD_LABEL } from "@/lib/budgets";
```

por:

```ts
import { budgetTotal, budgetBalance, patientBalance, PAYMENT_METHOD_LABEL, checkStatus } from "@/lib/budgets";
```

Reemplazar:

```ts
type Tab = "mi" | "abiertas" | "cerradas";
```

por:

```ts
type Tab = "mi" | "abiertas" | "cerradas" | "cheques";
```

- [ ] **Step 2: Agregar el tab a la barra y calcular el badge**

En `CashPage`, reemplazar:

```ts
  const sessions = [...db.cashSessions].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const abiertas = sessions.filter((s) => s.status === "abierta");
  const cerradas = sessions.filter((s) => s.status === "cerrada");
  const miCaja = abiertas.find((s) => s.userId === session.userId) ?? null;

  const TABS: [Tab, string][] = [["mi", "Mi caja"], ["abiertas", "Cajas abiertas"], ["cerradas", "Cajas cerradas"]];
```

por:

```ts
  const sessions = [...db.cashSessions].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const abiertas = sessions.filter((s) => s.status === "abierta");
  const cerradas = sessions.filter((s) => s.status === "cerrada");
  const miCaja = abiertas.find((s) => s.userId === session.userId) ?? null;
  const chequesPorCobrar = db.payments.filter((p) => p.method === "cheque" && p.check && checkStatus(p) === "pendiente").length;

  const TABS: [Tab, string][] = [["mi", "Mi caja"], ["abiertas", "Cajas abiertas"], ["cerradas", "Cajas cerradas"], ["cheques", "Cheques"]];
```

Reemplazar:

```tsx
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${tab === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              {label}{k === "abiertas" && abiertas.length > 0 ? ` (${abiertas.length})` : ""}
            </button>
          ))}
```

por:

```tsx
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${tab === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              {label}
              {k === "abiertas" && abiertas.length > 0 ? ` (${abiertas.length})` : ""}
              {k === "cheques" && chequesPorCobrar > 0 ? ` (${chequesPorCobrar})` : ""}
            </button>
          ))}
```

- [ ] **Step 3: Renderizar el panel**

Reemplazar:

```tsx
      {tab === "abiertas" && <SesionesTable sessions={abiertas} kind="open" onCerrar={setCerrar} />}
      {tab === "cerradas" && <SesionesTable sessions={cerradas} kind="closed" />}
```

por:

```tsx
      {tab === "abiertas" && <SesionesTable sessions={abiertas} kind="open" onCerrar={setCerrar} />}
      {tab === "cerradas" && <SesionesTable sessions={cerradas} kind="closed" />}
      {tab === "cheques" && <ChequesPanel />}
```

- [ ] **Step 4: Escribir `ChequesPanel` y `AnularChequeModal`**

Agregar al final del archivo `app/app/caja/page.tsx` (después de `PaymentForm`):

```tsx
/* ===== Cheques ===== */
type ChequeVista = "porCobrar" | "cobrados" | "anulados";

function ChequesPanel() {
  const { db, session, markCheckCobrado } = useStore();
  const [vista, setVista] = useState<ChequeVista>("porCobrar");
  const [anular, setAnular] = useState<Payment | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);

  const cheques = db.payments.filter((p): p is Payment & { check: NonNullable<Payment["check"]> } => p.method === "cheque" && !!p.check);
  const porCobrar = cheques.filter((p) => checkStatus(p) === "pendiente").sort((a, b) => a.check.cashDate.localeCompare(b.check.cashDate));
  const cobrados = cheques.filter((p) => checkStatus(p) === "cobrado").sort((a, b) => (b.check.cobradoAt ?? "").localeCompare(a.check.cobradoAt ?? ""));
  const anulados = cheques.filter((p) => checkStatus(p) === "anulado").sort((a, b) => (b.voidedAt ?? "").localeCompare(a.voidedAt ?? ""));

  const lista = vista === "porCobrar" ? porCobrar : vista === "cobrados" ? cobrados : anulados;
  const VISTAS: [ChequeVista, string][] = [["porCobrar", "Por cobrar"], ["cobrados", "Cobrados"], ["anulados", "Anulados"]];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-clinic-border bg-white p-1">
        {VISTAS.map(([k, label]) => (
          <button key={k} onClick={() => setVista(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${vista === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
            {label}{k === "porCobrar" && porCobrar.length > 0 ? ` (${porCobrar.length})` : ""}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Empty title="Sin cheques acá" desc={vista === "porCobrar" ? "Los cheques que recibas van a aparecer acá hasta cobrarse o anularse." : "Todavía no hay cheques en este estado."} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="px-4 py-3">Paciente</th>
                <th className="px-2 py-3">N° cheque</th>
                <th className="px-2 py-3">Banco</th>
                <th className="px-2 py-3">Fecha de cobro</th>
                <th className="px-2 py-3 text-right">Monto</th>
                <th className="px-2 py-3">Recibido por</th>
                {vista === "porCobrar" && <th className="px-2 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {lista.map((p) => {
                const patient = db.patients.find((x) => x.id === p.patientId);
                const atrasado = vista === "porCobrar" && p.check.cashDate < hoy;
                return (
                  <tr key={p.id} className="hover:bg-clinic-bg/60">
                    <td className="px-4 py-2.5">
                      {patient ? <a href={`/app/pacientes/${patient.id}`} className="font-semibold text-clinic-text hover:text-azure-700">{fullName(patient)}</a> : "—"}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-clinic-muted">{p.check.number}</td>
                    <td className="px-2 py-2.5 text-clinic-muted">{p.check.bank}</td>
                    <td className="px-2 py-2.5">
                      <span className={atrasado ? "font-bold text-state-err" : "text-clinic-muted"}>{fmtDate(p.check.cashDate)}</span>
                      {atrasado && <Badge tone="err">Atrasado</Badge>}
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono font-bold">{fmtGs(p.amount)}</td>
                    <td className="px-2 py-2.5 text-clinic-muted">{p.receivedBy}</td>
                    {vista === "porCobrar" && (
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => markCheckCobrado(p.id, session!.name)} className="rounded-lg border border-state-ok/40 bg-state-okbg px-2 py-1 text-[11px] font-bold text-state-ok hover:brightness-95">Marcar cobrado</button>
                          <button onClick={() => setAnular(p)} className="rounded-lg border border-state-err/40 bg-state-errbg px-2 py-1 text-[11px] font-bold text-state-err hover:brightness-95">Anular</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {anular && <AnularChequeModal payment={anular} onClose={() => setAnular(null)} />}
    </div>
  );
}

function AnularChequeModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { session, voidPayment } = useStore();
  const [reason, setReason] = useState("");
  return (
    <Modal title="Anular cheque" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-clinic-muted">
          El cheque N° {payment.check?.number} pasa a "Anulados" y el saldo vuelve a la deuda del paciente — igual que cualquier pago anulado.
        </p>
        <Field label="Motivo (opcional)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: Rebotó, el paciente lo retiró…" /></Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn onClick={() => { voidPayment(payment.id, session!.name, reason.trim() || undefined); onClose(); }}>Anular cheque</Btn>
        </div>
      </div>
    </Modal>
  );
}
```

> `fmtDate`, `Badge`, `Empty`, `Modal`, `Field`, `inputCls`, `fullName`, `fmtGs`
> ya están importados al inicio del archivo — no dupliques imports.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add app/app/caja/page.tsx
git commit -m "feat(cheques): tab Cheques en Cajas — por cobrar / cobrados / anulados"
```

---

## Task 9: Tareas — etiqueta y color del tipo `cheque`

**Files:**
- Modify: `app/app/tareas/page.tsx`

- [ ] **Step 1: Sumar la entrada**

Reemplazar:

```ts
const TYPE_LABEL: Record<MgmtTaskType, string> = { cita: "Cita", captura: "Captura", control: "Control", cobranza: "Cobranza", personalizada: "Personalizada" };
const TYPE_TONE: Record<MgmtTaskType, "info" | "ok" | "warn" | "err" | "muted"> = { cita: "info", captura: "warn", control: "ok", cobranza: "err", personalizada: "muted" };
```

por:

```ts
const TYPE_LABEL: Record<MgmtTaskType, string> = { cita: "Cita", captura: "Captura", control: "Control", cobranza: "Cobranza", cheque: "Cheque", personalizada: "Personalizada" };
// "warn" — mismo tono que captura: plata que todavía no se puede dar por
// perdida, pero tampoco por segura hasta que se acredite.
const TYPE_TONE: Record<MgmtTaskType, "info" | "ok" | "warn" | "err" | "muted"> = { cita: "info", captura: "warn", control: "ok", cobranza: "err", cheque: "warn", personalizada: "muted" };
```

- [ ] **Step 2: Sumar `"cheque"` a los chips de filtro por tipo**

`FILTERS` está hardcodeado (no se deriva de `MgmtTaskType`). En
`app/app/tareas/page.tsx`, reemplazar:

```ts
  const FILTERS: ("todas" | MgmtTaskType)[] = ["todas", "captura", "control", "cobranza", "cita", "personalizada"];
```

por:

```ts
  const FILTERS: ("todas" | MgmtTaskType)[] = ["todas", "captura", "control", "cobranza", "cheque", "cita", "personalizada"];
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add app/app/tareas/page.tsx
git commit -m "feat(cheques): etiqueta y color del tipo cheque en la bandeja de Tareas"
```

---

## Task 10: Seed — un cheque de ejemplo

**Files:**
- Modify: `lib/seed.ts`

- [ ] **Step 1: Agregar el pago**

En `lib/seed.ts`, dentro del array `payments`, después de `pay5`:

```ts
  { id: "pay6", clinicId: CLINIC_ID, patientId: "p6", budgetId: "g2", date: at(0, 9), amount: 375000, method: "cheque", concept: "Cuota mensual ortodoncia (cheque)", receivedBy: "Carlos Admin", check: { number: "00456123", bank: "Banco Itaú", cashDate: at(3, 0).slice(0, 10) } },
```

> `p6` (Marco Giménez) ya tiene saldo pendiente en `g2` (ortodoncia) por los
> pagos `pay1`/`pay2` existentes — este cheque baja un poco más ese saldo y
> deja algo pendiente todavía, así se puede ver en la demo: el saldo bajó al
> registrar el cheque, Y aparece una tarea "Cheque por cobrar" en Tareas con
> vencimiento a 3 días.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add lib/seed.ts
git commit -m "feat(cheques): cheque de ejemplo en el demo"
```

---

## Task 11: Verificación final

**Files:** ninguno

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc sin salida · todos los tests verdes (293) · build exitoso.

- [ ] **Step 2: Confirmar que `firestore.rules` no cambió**

Run: `git diff main --stat -- firestore.rules`
Expected: **sin salida**. Esta feature no crea colecciones ni campos con ACL
propia — si `firestore.rules` cambió, algo se salió del plan.

- [ ] **Step 3: Probar el ciclo completo en el navegador**

Run: `npm run dev -- -p 3100`

Entrar a `http://localhost:3100/login` → "Ver demo" → **Restaurar datos de
demo** → **Administrador**.

**Prueba A — registrar y ver el cheque:**
1. `/app/caja` → tab **Cheques** → sub-vista "Por cobrar".
2. Verificar que el cheque del seed (`pay6`, Marco Giménez, Banco Itaú)
   aparece con su fecha de cobro.
3. Ir a `/app/tareas` → verificar que hay una tarea **"Cheque por cobrar"**
   para el mismo paciente, con el detalle "Banco Itaú · N° 00456123".

**Prueba B — marcar cobrado (auto-cierre):**
1. Volver a `/app/caja` → Cheques → "Marcar cobrado" en ese cheque.
2. Verificar que pasa a la sub-vista "Cobrados".
3. Volver a `/app/tareas`: **la tarea "Cheque por cobrar" tiene que haber
   desaparecido sola**, sin tocar nada ahí.

**Prueba C — registrar uno nuevo y anularlo:**
1. Ficha de cualquier paciente con saldo pendiente → Recibir pago → medio
   **Cheque** → completar N°/banco/fecha → pagar.
2. Verificar que aparece en Cajas → Cheques → Por cobrar.
3. Anularlo con un motivo (ej. "Rebotó").
4. Verificar: pasa a "Anulados" en Cheques, **y también aparece en "Pagos
   eliminados"** de la ficha del paciente (Facturación → Pagos eliminados) —
   confirma que reusa `voidPayment` de verdad, no un mecanismo aparte.
5. Verificar que el saldo del paciente **volvió a subir** en esa misma ficha.

**Prueba D — RBAC:**
1. Salir, entrar como **Dentista**.
2. `/app/caja` tiene que mostrar "Acceso denegado" (ya lo hacía antes de este
   plan — confirmá que seguir agregando el tab Cheques no lo rompió).

Apagar el dev server cuando termines.

- [ ] **Step 4: Commit final**

Si quedó algo sin commitear:

```bash
git add -A
git commit -m "feat(cheques): gestión de cheques completa"
```
