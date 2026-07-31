# Tareas automáticas de gestión — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la bandeja de tareas de gestión se llene y se vacíe sola, sin que nadie apriete un botón y sin backend.

**Architecture:** Las tareas automáticas (cobranza, captura, control, cita) no se guardan: se **derivan** del estado de la clínica con funciones puras en `lib/tareas.ts`. El auto-cierre es implícito — si la condición deja de cumplirse, la tarea no se deriva más. Lo único que se persiste en la colección `mgmtTasks` (que ya existe) son las tareas manuales y los **overrides**: la decisión humana sobre una derivada (postergar, asignar, cerrar a mano), enganchada por una clave determinística `derivedKey`.

**Tech Stack:** TypeScript · Next.js 14 App Router · vitest · Tailwind · Firestore Web SDK (sin cambios de reglas: no se crea ninguna colección).

**Spec:** [`docs/superpowers/specs/2026-07-30-tareas-automaticas-design.md`](../specs/2026-07-30-tareas-automaticas-design.md)

---

## Contexto que el implementador necesita saber

Cinco cosas del proyecto que no son obvias y que si no sabés te hacen perder horas:

1. **No hay Admin SDK ni cron.** Firebase plan Spark. Por eso el módulo deriva en lectura en vez de materializar filas. No propongas un job.
2. **`mgmtTasks` ya existe** en el store (`lib/store.tsx`) con `addMgmtTask` / `updateMgmtTask` / `deleteMgmtTask`, y ya está en `firestore.rules`. **No agregues colecciones**: si lo hacés, Carlos tiene que correr `firebase deploy --only firestore:rules` a mano o las clínicas reales no guardan.
3. **Los helpers puros van con TDD.** Es norma del proyecto (`lib/radiografia.ts`, `lib/firma.ts`, `lib/perio-voice.ts` son el molde). Test primero, siempre.
4. **El motor vendorizado del odontograma está excluido de vitest.** No te preocupa acá, pero si ves `components/odontogram-engine/**` en `vitest.config.ts`, es a propósito.
5. **Correr antes de mergear:** `npx tsc --noEmit && npx vitest run && npm run build`.

### Definiciones reales del proyecto (no las inventes)

```ts
type BudgetStatus = "borrador" | "presentado" | "aceptado" | "completado" | "anulado";
type AppointmentStatus = "confirmada" | "en_atencion" | "pendiente" | "completada" | "cancelada" | "ausente";
type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "personalizada";
interface Session { userId: string; clinicId: string; role: Role; name: string; }
interface Patient { id: string; firstName: string; lastName: string; phone: string; /*…*/ }
interface Appointment { id: string; patientId: string; start: string; end: string; status: AppointmentStatus; /*…*/ }
interface Payment { id: string; patientId: string; date: string; amount: number; voidedAt?: string; /*…*/ }
interface Budget { id: string; patientId: string; createdAt: string; status: BudgetStatus; name?: string; items: BudgetItem[]; /*…*/ }
```

`patientBalance(patientId, budgets, payments)` vive en `lib/budgets.ts:52` y define el saldo como: suma de `budgetTotal(b)` de los budgets `aceptado`/`completado` del paciente, menos la suma de `payments` no anulados (`!p.voidedAt`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/tareas.ts` | **Nuevo.** Motor puro: derivar, fusionar, clasificar, calcular vencimientos. No importa React ni Firestore. |
| `lib/tareas.test.ts` | **Nuevo.** TDD del motor. |
| `lib/types.ts` | `MgmtTask` += `derivedKey`, `snoozedUntil`. Tipos `TaskDeadline` / `TaskDeadlines`. `Clinic.config.taskDeadlines`. |
| `app/app/tareas/page.tsx` | Reescritura de la bandeja: consume el motor, vistas del día/atrasadas, panel de detalle, "Sólo mías", postergar. |
| `app/app/configuracion/page.tsx` | Sección de plazos por tipo. |
| `lib/seed.ts` | Datos demo que disparen al menos una tarea de cada tipo. |

---

## Task 1: Tipos

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Agregar los campos a `MgmtTask`**

En `lib/types.ts`, dentro de `export interface MgmtTask`, después de `updatedAt?: string;`:

```ts
  /** Clave de la tarea DERIVADA sobre la que este doc actúa como override
   *  (`cobranza:p_123`). Vacío en las tareas manuales (`personalizada`).
   *  Las derivadas no se guardan: este doc solo carga la decisión humana. */
  derivedKey?: string;
  /** Postergada hasta esta fecha (YYYY-MM-DD). Antes de ella la tarea no
   *  aparece en la bandeja del día ni cuenta como atrasada. */
  snoozedUntil?: string;
```

- [ ] **Step 2: Agregar los tipos de plazo**

En `lib/types.ts`, justo después del bloque de `MgmtTask`:

```ts
/** Plazo de una regla automática: cuánto pasa desde el evento que la origina
 *  hasta que la tarea vence y aparece en "Tareas del día". */
export type TaskDeadline =
  | { kind: "inmediato" }
  | { kind: "dias"; n: number };

/** Plazo por tipo de tarea automática. Vive en `Clinic.config.taskDeadlines`.
 *  Lo que no esté configurado usa DEFAULT_DEADLINES de lib/tareas.ts. */
export type TaskDeadlines = Partial<Record<Exclude<MgmtTaskType, "personalizada">, TaskDeadline>>;
```

- [ ] **Step 3: Agregar el campo a `Clinic.config`**

En `lib/types.ts`, dentro de `export interface Clinic`, en el objeto `config`, después de `patientFields?: Record<string, FieldConfig>;`:

```ts
    /** Plazos de las tareas automáticas de gestión (módulo Tareas). */
    taskDeadlines?: TaskDeadlines;
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (los campos son todos opcionales, nada existente se rompe).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(tareas): tipos de override y plazos configurables"
```

---

## Task 2: Vencimientos — `calcularVencimiento` + defaults

**Files:**
- Create: `lib/tareas.ts`
- Create: `lib/tareas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/tareas.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcularVencimiento, plazoDe, DEFAULT_DEADLINES } from "./tareas";

describe("calcularVencimiento", () => {
  it("inmediato vence el mismo día del evento", () => {
    expect(calcularVencimiento("2026-07-30T14:30:00.000Z", { kind: "inmediato" })).toBe("2026-07-30");
  });

  it("suma los días del plazo", () => {
    expect(calcularVencimiento("2026-07-30T14:30:00.000Z", { kind: "dias", n: 7 })).toBe("2026-08-06");
  });

  it("cruza el fin de mes sin romperse", () => {
    expect(calcularVencimiento("2026-01-28T00:00:00.000Z", { kind: "dias", n: 5 })).toBe("2026-02-02");
  });

  it("devuelve YYYY-MM-DD, no un ISO completo", () => {
    expect(calcularVencimiento("2026-07-30T23:59:59.000Z", { kind: "dias", n: 1 })).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("plazoDe — configuración de la clínica vs defaults", () => {
  it("sin configuración usa el default del tipo", () => {
    expect(plazoDe("cobranza", undefined)).toEqual(DEFAULT_DEADLINES.cobranza);
    expect(plazoDe("captura", {})).toEqual(DEFAULT_DEADLINES.captura);
  });

  it("la configuración de la clínica pisa al default", () => {
    expect(plazoDe("cobranza", { cobranza: { kind: "dias", n: 30 } })).toEqual({ kind: "dias", n: 30 });
  });

  it("configurar un tipo no afecta a los otros", () => {
    const cfg = { cobranza: { kind: "dias", n: 30 } } as const;
    expect(plazoDe("captura", cfg)).toEqual(DEFAULT_DEADLINES.captura);
  });

  it("los defaults son los cuatro tipos automáticos", () => {
    expect(Object.keys(DEFAULT_DEADLINES).sort()).toEqual(["captura", "cita", "cobranza", "control"]);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — `Failed to resolve import "./tareas"`.

- [ ] **Step 3: Implementar lo mínimo**

Crear `lib/tareas.ts`:

```ts
/** Motor de tareas automáticas de gestión.
 *
 *  Las tareas automáticas NO se guardan: se derivan del estado de la clínica en
 *  cada lectura. Eso hace que el auto-cierre sea implícito — si el paciente pagó,
 *  la condición "tiene saldo" deja de cumplirse y la tarea no se deriva más. No
 *  hay proceso que la cierre porque no hay nada que cerrar.
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. Todo lo que necesita
 *  entra por parámetro y todo lo que produce sale por retorno. */
import type { MgmtTaskType, TaskDeadline, TaskDeadlines } from "./types";

/** Plazos por defecto cuando la clínica no configuró los suyos. */
export const DEFAULT_DEADLINES: Required<TaskDeadlines> = {
  // Margen para que el pago entre por otra vía antes de salir a perseguirlo.
  cobranza: { kind: "dias", n: 7 },
  // El presupuesto se enfría rápido: a los 3 días ya hay que llamar.
  captura: { kind: "dias", n: 3 },
  // Control semestral, el estándar odontológico.
  control: { kind: "dias", n: 180 },
  // Una cita sin confirmar es trabajo de hoy.
  cita: { kind: "inmediato" },
};

export type AutoTaskType = Exclude<MgmtTaskType, "personalizada">;

/** Plazo efectivo de un tipo: lo que configuró la clínica, o el default. */
export function plazoDe(type: AutoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}

/** Fecha (YYYY-MM-DD) en que una tarea originada en `eventAt` pasa a estar vencida. */
export function calcularVencimiento(eventAt: string, plazo: TaskDeadline): string {
  const d = new Date(eventAt);
  if (plazo.kind === "dias") d.setUTCDate(d.getUTCDate() + plazo.n);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): plazos configurables por tipo con defaults odontológicos"
```

---

## Task 3: Saldos en una pasada

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

> **Por qué existe esta task:** la spec prohíbe llamar `patientBalance` en un bucle
> — recorre budgets y payments enteros en cada llamada, así que por paciente da
> O(P × (B + Pg)) y congela el render. Acá se construye el mapa en una pasada, y
> el test de equivalencia garantiza que las dos definiciones de saldo no divergen.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `lib/tareas.test.ts`:

```ts
import { mapaDeSaldos } from "./tareas";
import { patientBalance } from "./budgets";
import type { Budget, Payment } from "./types";

const bud = (id: string, patientId: string, status: Budget["status"], monto: number, createdAt = "2026-01-10T10:00:00.000Z"): Budget => ({
  id, clinicId: "c1", patientId, dentistId: "u1", createdAt, status,
  items: [{ id: `${id}i`, code: "D001", name: "Prestación", qty: 1, price: monto }],
} as Budget);

const pay = (id: string, patientId: string, amount: number, voided = false): Payment => ({
  id, clinicId: "c1", patientId, date: "2026-02-01T10:00:00.000Z", amount,
  method: "efectivo", concept: "Abono", receivedBy: "u1",
  ...(voided ? { voidedAt: "2026-02-02T10:00:00.000Z" } : {}),
} as Payment);

describe("mapaDeSaldos", () => {
  it("suma aceptados y completados, resta pagos no anulados", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000)];
    const payments = [pay("y1", "p1", 200_000)];
    expect(mapaDeSaldos(budgets, payments).get("p1")).toBe(600_000);
  });

  it("ignora borrador, presentado y anulado", () => {
    const budgets = [bud("b1", "p1", "borrador", 100_000), bud("b2", "p1", "presentado", 100_000), bud("b3", "p1", "anulado", 100_000)];
    expect(mapaDeSaldos(budgets, []).get("p1") ?? 0).toBe(0);
  });

  it("ignora los pagos anulados", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000)];
    const payments = [pay("y1", "p1", 500_000, true)];
    expect(mapaDeSaldos(budgets, payments).get("p1")).toBe(500_000);
  });

  it("no mezcla pacientes", () => {
    const budgets = [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p2", "aceptado", 100_000)];
    const payments = [pay("y1", "p2", 100_000)];
    const m = mapaDeSaldos(budgets, payments);
    expect(m.get("p1")).toBe(500_000);
    expect(m.get("p2")).toBe(0);
  });

  // EL test que importa: si alguien cambia la regla de saldo en lib/budgets.ts
  // y no acá, la bandeja y la ficha del paciente empiezan a mentir distinto.
  it("coincide con patientBalance para cada paciente (equivalencia)", () => {
    const budgets = [
      bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000),
      bud("b3", "p2", "presentado", 900_000), bud("b4", "p2", "aceptado", 250_000),
      bud("b5", "p3", "anulado", 100_000),
    ];
    const payments = [pay("y1", "p1", 200_000), pay("y2", "p2", 250_000), pay("y3", "p1", 50_000, true)];
    const mapa = mapaDeSaldos(budgets, payments);
    for (const pid of ["p1", "p2", "p3"]) {
      expect(mapa.get(pid) ?? 0).toBe(patientBalance(pid, budgets, payments));
    }
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — `mapaDeSaldos is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `lib/tareas.ts` (arriba, el import; abajo, la función):

```ts
import { budgetTotal } from "./budgets";
import type { Budget, Payment } from "./types";
```

```ts
/** Saldo de TODOS los pacientes en dos pasadas (una por budgets, una por pagos).
 *
 *  Misma definición que `patientBalance` de lib/budgets.ts —presupuestos
 *  aceptados/completados menos pagos no anulados— pero calculada de una sola vez
 *  para todos. Llamar `patientBalance` por paciente sería O(P × (B + Pg)) y
 *  congelaría el render de la bandeja en una clínica con historia.
 *
 *  `lib/tareas.test.ts` tiene un test de equivalencia contra `patientBalance`
 *  que falla si las dos definiciones divergen. */
export function mapaDeSaldos(budgets: Budget[], payments: Payment[]): Map<string, number> {
  const saldo = new Map<string, number>();
  for (const b of budgets) {
    if (b.status !== "aceptado" && b.status !== "completado") continue;
    saldo.set(b.patientId, (saldo.get(b.patientId) ?? 0) + budgetTotal(b));
  }
  for (const p of payments) {
    if (p.voidedAt) continue;
    saldo.set(p.patientId, (saldo.get(p.patientId) ?? 0) - p.amount);
  }
  return saldo;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 13 tests.

> Si el test de equivalencia falla, **no toques el test**: significa que
> `mapaDeSaldos` y `patientBalance` no dicen lo mismo. Leé `lib/budgets.ts:52`
> y alineá `mapaDeSaldos`.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): mapa de saldos en una pasada, con test de equivalencia"
```

---

## Task 4: Regla de cobranza

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
import { derivarTareas } from "./tareas";
import type { Patient, Appointment } from "./types";

const HOY = "2026-07-30";

const pac = (id: string, firstName = "Ana", lastName = "Prueba"): Patient => ({
  id, clinicId: "c1", firstName, lastName, document: "1234567", phone: "+595981000000",
} as Patient);

const vacio = { patients: [] as Patient[], budgets: [] as Budget[], payments: [] as Payment[], appointments: [] as Appointment[] };

describe("regla cobranza", () => {
  it("abre una tarea cuando el paciente tiene saldo positivo", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000)] }, HOY);
    const cob = t.filter((x) => x.type === "cobranza");
    expect(cob).toHaveLength(1);
    expect(cob[0].derivedKey).toBe("cobranza:p1");
    expect(cob[0].patientId).toBe("p1");
  });

  it("NO abre cuando el saldo es cero — este es el auto-cierre", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "aceptado", 500_000)],
      payments: [pay("y1", "p1", 500_000)],
    }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(0);
  });

  it("NO abre cuando el paciente abonó de más (saldo negativo)", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "aceptado", 500_000)],
      payments: [pay("y1", "p1", 700_000)],
    }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(0);
  });

  it("una sola tarea por paciente aunque deba en varios presupuestos", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000)],
    }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(1);
  });

  it("el vencimiento sale del presupuesto con saldo más antiguo + plazo", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [
        bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z"),
        bud("b2", "p1", "aceptado", 200_000, "2026-07-20T10:00:00.000Z"),
      ],
    }, HOY);
    // 2026-07-01 + 7 días (default cobranza)
    expect(t.find((x) => x.type === "cobranza")!.dueDate).toBe("2026-07-08");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — `derivarTareas is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `lib/tareas.ts`:

```ts
import type { Appointment, Patient } from "./types";

/** Una tarea automática recién derivada. Todavía no pasó por los overrides. */
export interface DerivedTask {
  /** Clave determinística `${tipo}:${idDeLaEntidad}`. Es lo que permite que una
   *  decisión humana se pegue a una tarea que no existe como fila. */
  derivedKey: string;
  type: AutoTaskType;
  patientId: string;
  title: string;
  detail?: string;
  budgetId?: string;
  /** Fecha del hecho que originó la tarea (ISO). */
  eventAt: string;
  /** eventAt + plazo (YYYY-MM-DD). Antes de esta fecha la tarea no vence. */
  dueDate: string;
}

/** Lo mínimo que necesitan las reglas. Se pasa un objeto plano y no el `DB`
 *  entero para poder testear el motor sin construir una base completa. */
export interface TareasInput {
  patients: Patient[];
  budgets: Budget[];
  payments: Payment[];
  appointments: Appointment[];
  deadlines?: TaskDeadlines;
}

/** Formatea un monto en guaraníes sin decimales (PYG es zero-decimal). */
function gs(n: number): string {
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}

export function derivarTareas(input: TareasInput, hoy: string): DerivedTask[] {
  const { patients, budgets, payments, deadlines } = input;
  const out: DerivedTask[] = [];
  const saldos = mapaDeSaldos(budgets, payments);

  // ── cobranza: una por paciente con saldo pendiente ──────────────────────
  const plazoCobranza = plazoDe("cobranza", deadlines);
  for (const p of patients) {
    const saldo = saldos.get(p.id) ?? 0;
    if (saldo <= 0) continue;
    // El evento es el presupuesto con saldo más antiguo: la deuda "nació" ahí.
    const desde = budgets
      .filter((b) => b.patientId === p.id && (b.status === "aceptado" || b.status === "completado"))
      .map((b) => b.createdAt)
      .sort()[0];
    if (!desde) continue;
    out.push({
      derivedKey: `cobranza:${p.id}`,
      type: "cobranza",
      patientId: p.id,
      title: "Saldo pendiente de pago",
      detail: gs(saldo),
      eventAt: desde,
      dueDate: calcularVencimiento(desde, plazoCobranza),
    });
  }

  return out;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 18 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): regla de cobranza con auto-cierre al saldar"
```

---

## Task 5: Regla de captura

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
describe("regla captura", () => {
  it("abre una tarea por cada presupuesto presentado", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "presentado", 500_000, "2026-07-20T10:00:00.000Z")],
    }, HOY);
    const cap = t.filter((x) => x.type === "captura");
    expect(cap).toHaveLength(1);
    expect(cap[0].derivedKey).toBe("captura:b1");
    expect(cap[0].budgetId).toBe("b1");
    expect(cap[0].dueDate).toBe("2026-07-23"); // +3 días (default captura)
  });

  it.each(["borrador", "aceptado", "completado", "anulado"] as const)(
    "NO abre para un presupuesto en estado %s — esto es el auto-cierre",
    (status) => {
      const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", status, 500_000)] }, HOY);
      expect(t.filter((x) => x.type === "captura")).toHaveLength(0);
    },
  );

  it("dos presupuestos presentados dan dos tareas con claves distintas", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "presentado", 100_000), bud("b2", "p1", "presentado", 200_000)],
    }, HOY);
    const claves = t.filter((x) => x.type === "captura").map((x) => x.derivedKey);
    expect(claves.sort()).toEqual(["captura:b1", "captura:b2"]);
  });

  it("usa el nombre del plan como detalle si lo tiene", () => {
    const b = { ...bud("b1", "p1", "presentado", 100_000), name: "Ortodoncia fija" } as Budget;
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [b] }, HOY);
    expect(t.find((x) => x.type === "captura")!.detail).toBe("Ortodoncia fija");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — las tareas de captura no se derivan (0 en vez de 1).

- [ ] **Step 3: Implementar**

En `lib/tareas.ts`, dentro de `derivarTareas`, antes del `return out;`:

```ts
  // ── captura: una por presupuesto presentado que no avanzó ───────────────
  const plazoCaptura = plazoDe("captura", deadlines);
  for (const b of budgets) {
    if (b.status !== "presentado") continue;
    out.push({
      derivedKey: `captura:${b.id}`,
      type: "captura",
      patientId: b.patientId,
      title: "Presupuesto presentado sin aceptar",
      detail: b.name ?? "Presupuesto",
      budgetId: b.id,
      eventAt: b.createdAt,
      dueDate: calcularVencimiento(b.createdAt, plazoCaptura),
    });
  }
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 25 tests (el `it.each` cuenta 4).

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): regla de captura con auto-cierre al cambiar de estado"
```

---

## Task 6: Regla de control

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

> **Ojo con la clave.** `control` va indexada **por paciente** (`control:p1`), no
> por presupuesto. Con la clave por presupuesto, una clínica con años de historia
> derivaría una tarea por cada tratamiento terminado alguna vez, todas vencidas:
> cientos de atrasadas el primer día. Y clínicamente al paciente se lo cita una
> vez, no una vez por tratamiento histórico.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
const cita = (id: string, patientId: string, start: string, status: Appointment["status"]): Appointment => ({
  id, clinicId: "c1", patientId, dentistId: "u1", title: "Consulta",
  start, end: start, status, amount: 0, discount: 0,
} as Appointment);

describe("regla control", () => {
  it("abre cuando hay tratamiento completado y ninguna cita futura", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000, "2026-01-10T10:00:00.000Z")],
    }, HOY);
    const ctl = t.filter((x) => x.type === "control");
    expect(ctl).toHaveLength(1);
    expect(ctl[0].derivedKey).toBe("control:p1");
    expect(ctl[0].dueDate).toBe("2026-07-09"); // 2026-01-10 + 180 días
  });

  it("NO abre si el paciente ya tiene una cita futura — auto-cierre al agendar", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000)],
      appointments: [cita("a1", "p1", "2026-08-15T10:00:00.000Z", "confirmada")],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  it("una cita futura CANCELADA no cuenta como cita futura", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000)],
      appointments: [cita("a1", "p1", "2026-08-15T10:00:00.000Z", "cancelada")],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("una cita PASADA no evita la tarea de control", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000)],
      appointments: [cita("a1", "p1", "2026-06-01T10:00:00.000Z", "completada")],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("un paciente con TRES tratamientos completados deriva UNA sola tarea", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [
        bud("b1", "p1", "completado", 100_000, "2023-01-10T10:00:00.000Z"),
        bud("b2", "p1", "completado", 200_000, "2024-05-10T10:00:00.000Z"),
        bud("b3", "p1", "completado", 300_000, "2026-01-10T10:00:00.000Z"),
      ],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("el evento es la última cita completada si existe", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000, "2026-01-10T10:00:00.000Z")],
      appointments: [
        cita("a1", "p1", "2026-02-01T10:00:00.000Z", "completada"),
        cita("a2", "p1", "2026-03-15T10:00:00.000Z", "completada"),
      ],
    }, HOY);
    expect(t.find((x) => x.type === "control")!.dueDate).toBe("2026-09-11"); // 2026-03-15 + 180
  });

  it("NO abre si el paciente no tiene ningún tratamiento completado", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "aceptado", 500_000)],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — 0 tareas de control.

- [ ] **Step 3: Implementar**

En `lib/tareas.ts`, dentro de `derivarTareas`, antes del `return out;`:

```ts
  // ── control: una POR PACIENTE con tratamiento terminado y sin próxima visita ──
  const plazoControl = plazoDe("control", deadlines);
  const { appointments } = input;
  for (const p of patients) {
    const completados = budgets
      .filter((b) => b.patientId === p.id && b.status === "completado")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (completados.length === 0) continue;

    const tieneCitaFutura = appointments.some(
      (a) => a.patientId === p.id && a.start.slice(0, 10) > hoy && a.status !== "cancelada",
    );
    if (tieneCitaFutura) continue;

    // El evento es la última atención real; si nunca vino, el fin del tratamiento.
    const ultimaAtencion = appointments
      .filter((a) => a.patientId === p.id && a.status === "completada")
      .map((a) => a.start)
      .sort()
      .pop();
    const eventAt = ultimaAtencion ?? completados[completados.length - 1].createdAt;

    out.push({
      derivedKey: `control:${p.id}`,
      type: "control",
      patientId: p.id,
      title: "Control post-tratamiento",
      detail: "Tratamiento finalizado — agendar control.",
      budgetId: completados[completados.length - 1].id,
      eventAt,
      dueDate: calcularVencimiento(eventAt, plazoControl),
    });
  }
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 32 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): regla de control por paciente (no por presupuesto)"
```

---

## Task 7: Regla de cita

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

> Este tipo existía en el enum `MgmtTaskType` desde siempre y **ninguna regla lo
> producía**. Acá se implementa por primera vez.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
describe("regla cita", () => {
  it("abre para una cita pendiente dentro de los próximos 2 días", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
    }, HOY);
    const c = t.filter((x) => x.type === "cita");
    expect(c).toHaveLength(1);
    expect(c[0].derivedKey).toBe("cita:a1");
    expect(c[0].dueDate).toBe(HOY); // plazo inmediato
  });

  it("abre para una cita pendiente de HOY", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      appointments: [cita("a1", "p1", "2026-07-30T16:00:00.000Z", "pendiente")],
    }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(1);
  });

  it.each(["confirmada", "en_atencion", "completada", "cancelada", "ausente"] as const)(
    "NO abre para una cita en estado %s — auto-cierre al confirmar",
    (status) => {
      const t = derivarTareas({
        ...vacio, patients: [pac("p1")],
        appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", status)],
      }, HOY);
      expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
    },
  );

  it("NO abre para una cita más allá de la ventana de 2 días", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      appointments: [cita("a1", "p1", "2026-08-10T10:00:00.000Z", "pendiente")],
    }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
  });

  it("NO abre para una cita que ya pasó — auto-cierre por fecha", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      appointments: [cita("a1", "p1", "2026-07-20T10:00:00.000Z", "pendiente")],
    }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — 0 tareas de cita.

- [ ] **Step 3: Implementar**

En `lib/tareas.ts`, agregar la constante arriba (junto a `DEFAULT_DEADLINES`):

```ts
/** Ventana de anticipación de la regla `cita`: una cita sin confirmar entra a la
 *  bandeja este número de días antes. Dos días es lo que da margen a llamar y,
 *  si el paciente no puede, liberar el turno a tiempo. */
export const VENTANA_CITA_DIAS = 2;
```

Y dentro de `derivarTareas`, antes del `return out;`:

```ts
  // ── cita: una por cita próxima sin confirmar ────────────────────────────
  const plazoCita = plazoDe("cita", deadlines);
  const limite = new Date(hoy);
  limite.setUTCDate(limite.getUTCDate() + VENTANA_CITA_DIAS);
  const hasta = limite.toISOString().slice(0, 10);
  for (const a of appointments) {
    if (a.status !== "pendiente") continue;
    const dia = a.start.slice(0, 10);
    if (dia < hoy || dia > hasta) continue;
    out.push({
      derivedKey: `cita:${a.id}`,
      type: "cita",
      patientId: a.patientId,
      title: "Cita sin confirmar",
      detail: a.title,
      eventAt: hoy,
      dueDate: calcularVencimiento(hoy, plazoCita),
    });
  }
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 41 tests (el `it.each` cuenta 5).

- [ ] **Step 5: Agregar el test de idempotencia de las claves**

Las `derivedKey` son lo que sostiene todo el mecanismo de override: si cambiaran
entre dos lecturas del mismo estado, cada recálculo huerfanizaría todas las
decisiones humanas. Agregar a `lib/tareas.test.ts`:

```ts
describe("idempotencia de las claves derivadas", () => {
  const input = {
    patients: [pac("p1"), pac("p2", "Beto", "Ejemplo")],
    budgets: [
      bud("b1", "p1", "aceptado", 500_000),
      bud("b2", "p1", "presentado", 200_000),
      bud("b3", "p2", "completado", 300_000),
    ],
    payments: [pay("y1", "p1", 100_000)],
    appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
  };

  it("dos llamadas con el mismo input dan exactamente las mismas claves", () => {
    const a = derivarTareas(input, HOY).map((t) => t.derivedKey).sort();
    const b = derivarTareas(input, HOY).map((t) => t.derivedKey).sort();
    expect(a).toEqual(b);
  });

  it("no hay claves duplicadas dentro de una misma derivación", () => {
    const claves = derivarTareas(input, HOY).map((t) => t.derivedKey);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("toda clave tiene la forma tipo:id", () => {
    for (const t of derivarTareas(input, HOY)) {
      expect(t.derivedKey).toMatch(/^(cobranza|captura|control|cita):[\w-]+$/);
    }
  });
});
```

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 44 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): regla de cita sin confirmar (el tipo que nunca se generaba)"
```

---

## Task 8: Fusión con los overrides

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
import { fusionarTareas, type DerivedTask } from "./tareas";
import type { MgmtTask } from "./types";

const derivada = (derivedKey: string, dueDate = "2026-07-25"): DerivedTask => ({
  derivedKey, type: "cobranza", patientId: "p1", title: "Saldo pendiente de pago",
  eventAt: "2026-07-18T10:00:00.000Z", dueDate,
});

const override = (derivedKey: string, extra: Partial<MgmtTask> = {}): MgmtTask => ({
  id: `ov_${derivedKey}`, clinicId: "c1", type: "cobranza", derivedKey,
  title: "", status: "pendiente", createdAt: "2026-07-20T10:00:00.000Z", ...extra,
});

const manual = (id: string, extra: Partial<MgmtTask> = {}): MgmtTask => ({
  id, clinicId: "c1", type: "personalizada", title: "Llamar al proveedor",
  status: "pendiente", createdAt: "2026-07-20T10:00:00.000Z", ...extra,
});

describe("fusionarTareas", () => {
  it("una derivada sin override aparece tal cual", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].derivedKey).toBe("cobranza:p1");
    expect(r[0].status).toBe("pendiente");
  });

  it("un override CERRADO oculta la derivada", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { status: "cerrada", resolution: "rechazo" })], HOY);
    expect(r).toHaveLength(0);
  });

  it("un override postergado a futuro oculta la derivada", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { snoozedUntil: "2026-08-15" })], HOY);
    expect(r).toHaveLength(0);
  });

  it("un override postergado a una fecha ya pasada NO la oculta", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { snoozedUntil: "2026-07-20" })], HOY);
    expect(r).toHaveLength(1);
  });

  it("el override aporta assigneeId y status sin pisar el título de la derivada", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { assigneeId: "u3", status: "en_proceso" })], HOY);
    expect(r[0].assigneeId).toBe("u3");
    expect(r[0].status).toBe("en_proceso");
    expect(r[0].title).toBe("Saldo pendiente de pago");
  });

  it("un override HUÉRFANO (la condición se resolvió) se ignora", () => {
    const r = fusionarTareas([], [override("cobranza:p1", { assigneeId: "u3" })], HOY);
    expect(r).toHaveLength(0);
  });

  it("las tareas manuales pasan intactas", () => {
    const r = fusionarTareas([], [manual("mt1")], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("mt1");
    expect(r[0].type).toBe("personalizada");
  });

  it("una manual cerrada no aparece", () => {
    const r = fusionarTareas([], [manual("mt1", { status: "cerrada", resolution: "acepto" })], HOY);
    expect(r).toHaveLength(0);
  });

  it("con incluirCerradas=true aparecen las cerradas de ambos orígenes", () => {
    const r = fusionarTareas(
      [derivada("cobranza:p1")],
      [override("cobranza:p1", { status: "cerrada", resolution: "acepto" }), manual("mt1", { status: "cerrada" })],
      HOY, true,
    );
    expect(r).toHaveLength(2);
  });

  it("la derivada conserva su id determinístico para que React no pierda el key", () => {
    const a = fusionarTareas([derivada("cobranza:p1")], [], HOY)[0];
    const b = fusionarTareas([derivada("cobranza:p1")], [], HOY)[0];
    expect(a.id).toBe(b.id);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — `fusionarTareas is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `lib/tareas.ts`:

```ts
import type { MgmtTask } from "./types";

/** Combina las derivadas con lo guardado y devuelve lo que ve la UI.
 *
 *  Reglas de convivencia: una derivada NUNCA pisa una decisión humana, y un
 *  override NUNCA revive una tarea cuya condición ya no se cumple.
 *
 *  El override huérfano —el que quedó cuando el paciente pagó y la cobranza
 *  dejó de derivarse— se ignora en silencio. No se borra: borrarlo sería
 *  escribir en una lectura, y no molesta a nadie donde está. */
export function fusionarTareas(
  derivadas: DerivedTask[],
  guardadas: MgmtTask[],
  hoy: string,
  incluirCerradas = false,
): MgmtTask[] {
  const porClave = new Map<string, MgmtTask>();
  for (const g of guardadas) if (g.derivedKey) porClave.set(g.derivedKey, g);

  const out: MgmtTask[] = [];

  for (const d of derivadas) {
    const ov = porClave.get(d.derivedKey);
    if (ov?.status === "cerrada" && !incluirCerradas) continue;
    if (ov?.snoozedUntil && ov.snoozedUntil > hoy) continue;
    out.push({
      // Id determinístico: si cambiara entre renders, React perdería el foco y
      // el scroll de la lista en cada recálculo.
      id: ov?.id ?? `d_${d.derivedKey}`,
      clinicId: ov?.clinicId ?? "",
      type: d.type,
      patientId: d.patientId,
      title: d.title,
      detail: d.detail,
      budgetId: d.budgetId,
      derivedKey: d.derivedKey,
      dueDate: d.dueDate,
      createdAt: d.eventAt,
      assigneeId: ov?.assigneeId,
      snoozedUntil: ov?.snoozedUntil,
      status: ov?.status ?? "pendiente",
      resolution: ov?.resolution,
      updatedAt: ov?.updatedAt,
    });
  }

  for (const g of guardadas) {
    if (g.derivedKey) continue; // ya se procesó como override (o quedó huérfano)
    if (g.status === "cerrada" && !incluirCerradas) continue;
    out.push(g);
  }

  return out;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 51 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): fusión de derivadas con overrides humanos"
```

---

## Task 9: Clasificación en vistas

**Files:**
- Modify: `lib/tareas.ts`
- Modify: `lib/tareas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `lib/tareas.test.ts`:

```ts
import { clasificarTareas } from "./tareas";

const conVenc = (id: string, dueDate?: string): MgmtTask => ({
  id, clinicId: "c1", type: "cobranza", title: "X", status: "pendiente",
  createdAt: "2026-07-01T10:00:00.000Z", dueDate,
});

describe("clasificarTareas", () => {
  it("del día incluye las que vencen hoy y las atrasadas", () => {
    const { delDia } = clasificarTareas([conVenc("a", "2026-07-30"), conVenc("b", "2026-07-01")], HOY);
    expect(delDia.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("atrasadas son solo las de fecha ANTERIOR a hoy", () => {
    const { atrasadas } = clasificarTareas([conVenc("a", "2026-07-30"), conVenc("b", "2026-07-01")], HOY);
    expect(atrasadas.map((t) => t.id)).toEqual(["b"]);
  });

  it("futuras son las que vencen después de hoy", () => {
    const { futuras } = clasificarTareas([conVenc("a", "2026-08-10")], HOY);
    expect(futuras.map((t) => t.id)).toEqual(["a"]);
  });

  it("una tarea SIN vencimiento cuenta como del día (no se esconde nunca)", () => {
    const { delDia, futuras } = clasificarTareas([conVenc("a")], HOY);
    expect(delDia.map((t) => t.id)).toEqual(["a"]);
    expect(futuras).toHaveLength(0);
  });

  it("las tres listas particionan el total sin duplicar", () => {
    const todas = [conVenc("a", "2026-07-01"), conVenc("b", "2026-07-30"), conVenc("c", "2026-08-10"), conVenc("d")];
    const { delDia, futuras } = clasificarTareas(todas, HOY);
    expect(delDia.length + futuras.length).toBe(todas.length);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/tareas.test.ts`
Expected: FAIL — `clasificarTareas is not a function`.

- [ ] **Step 3: Implementar**

Agregar a `lib/tareas.ts`:

```ts
/** Particiona la bandeja en las vistas de Dentalink.
 *
 *  `delDia` y `futuras` son una partición exacta del total; `atrasadas` es un
 *  subconjunto de `delDia` (las que además ya vencieron), que es lo que va en el
 *  badge con el número. Una tarea sin `dueDate` —las manuales sin fecha— cuenta
 *  como del día: si la escondiéramos hasta "algún día", no se haría nunca. */
export function clasificarTareas(tareas: MgmtTask[], hoy: string): {
  delDia: MgmtTask[];
  atrasadas: MgmtTask[];
  futuras: MgmtTask[];
} {
  const delDia: MgmtTask[] = [];
  const atrasadas: MgmtTask[] = [];
  const futuras: MgmtTask[] = [];
  for (const t of tareas) {
    if (t.dueDate && t.dueDate > hoy) { futuras.push(t); continue; }
    delDia.push(t);
    if (t.dueDate && t.dueDate < hoy) atrasadas.push(t);
  }
  return { delDia, atrasadas, futuras };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/tareas.test.ts`
Expected: PASS — 56 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/tareas.ts lib/tareas.test.ts
git commit -m "feat(tareas): clasificación en del día / atrasadas / futuras"
```

---

## Task 10: Checkpoint del motor

**Files:** ninguno (verificación)

- [ ] **Step 1: Correr toda la suite**

Run: `npx vitest run`
Expected: PASS. Los 26 archivos previos siguen verdes + `lib/tareas.test.ts` con 56 tests.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 3: Verificar que el motor no importó nada prohibido**

Run: `grep -nE "^import" lib/tareas.ts`
Expected: solo imports de `./types` y `./budgets`. **Si aparece `react`, `firebase` o `./store`, el módulo dejó de ser puro** y hay que revertir ese import.

---

## Task 11: Bandeja — cablear el motor

**Files:**
- Modify: `app/app/tareas/page.tsx`

- [ ] **Step 1: Reemplazar el cálculo de la lista y borrar "Generar automáticas"**

En `app/app/tareas/page.tsx`, reemplazar el bloque de imports de `lib/` y el `useMemo` de `tasks` y la función `generar` (líneas 6-72 del archivo actual) por:

```tsx
import { useMemo, useState } from "react";
import { useStore, fmtDate, fullName, waLink } from "@/lib/store";
import { can } from "@/lib/rbac";
import { derivarTareas, fusionarTareas, clasificarTareas } from "@/lib/tareas";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { ListChecks, Plus, MessageCircle, Trash2, Clock } from "lucide-react";
import type { MgmtTask, MgmtTaskType } from "@/lib/types";

const TYPE_LABEL: Record<MgmtTaskType, string> = { cita: "Cita", captura: "Captura", control: "Control", cobranza: "Cobranza", personalizada: "Personalizada" };
const TYPE_TONE: Record<MgmtTaskType, "info" | "ok" | "warn" | "err" | "muted"> = { cita: "info", captura: "warn", control: "ok", cobranza: "err", personalizada: "muted" };
const RES_LABEL: Record<string, string> = { acepto: "Aceptó", contacto_posterior: "Contacto posterior", rechazo: "Rechazó" };
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function TareasPage() {
  const { db, session, addMgmtTask, updateMgmtTask, deleteMgmtTask } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const canManage = session ? can(session.role, "engagement.forms") : false;
  const [vista, setVista] = useState<"dia" | "atrasadas" | "todas">("dia");
  const [typeFilter, setTypeFilter] = useState<"todas" | MgmtTaskType>("todas");
  const [soloMias, setSoloMias] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);

  const hoy = hoyISO();

  /** Las automáticas se DERIVAN del estado de la clínica: no se guardan. Por eso
   *  se cierran solas — si el paciente pagó, la condición deja de cumplirse y la
   *  tarea no se deriva más. Lo guardado en `db.mgmtTasks` son las manuales y los
   *  overrides (postergar / asignar / cerrar a mano). */
  const { delDia, atrasadas, todas } = useMemo(() => {
    const derivadas = derivarTareas({
      patients: db.patients,
      budgets: db.budgets,
      payments: db.payments,
      appointments: db.appointments,
      deadlines: db.clinics[0]?.config?.taskDeadlines,
    }, hoy);
    const fusionadas = fusionarTareas(derivadas, db.mgmtTasks, hoy, showClosed);
    const c = clasificarTareas(fusionadas, hoy);
    return { delDia: c.delDia, atrasadas: c.atrasadas, todas: fusionadas };
  }, [db.patients, db.budgets, db.payments, db.appointments, db.mgmtTasks, db.clinics, hoy, showClosed]);

  const tasks = useMemo(() => {
    const base = vista === "dia" ? delDia : vista === "atrasadas" ? atrasadas : todas;
    return base
      .filter((t) => typeFilter === "todas" || t.type === typeFilter)
      .filter((t) => !soloMias || t.assigneeId === session?.userId)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }, [delDia, atrasadas, todas, vista, typeFilter, soloMias, session?.userId]);

  const sel = tasks.find((t) => t.id === selId) ?? null;
```

- [ ] **Step 2: Escribir el helper que persiste sobre una derivada**

En el mismo componente, después del `useMemo` de `tasks`:

```tsx
  /** Aplica un cambio a una tarea. Si es manual, actualiza su doc. Si es derivada,
   *  crea o actualiza el OVERRIDE: el doc que guarda la decisión humana sobre una
   *  tarea que no existe como fila. */
  const aplicar = (t: MgmtTask, cambio: Partial<MgmtTask>) => {
    if (!t.derivedKey) { updateMgmtTask({ ...t, ...cambio, updatedAt: new Date().toISOString() }); return; }
    const existente = db.mgmtTasks.find((x) => x.derivedKey === t.derivedKey);
    if (existente) { updateMgmtTask({ ...existente, ...cambio, updatedAt: new Date().toISOString() }); return; }
    addMgmtTask({
      id: `ov_${t.derivedKey.replace(":", "_")}_${Date.now()}`,
      clinicId: cid,
      type: t.type,
      patientId: t.patientId,
      derivedKey: t.derivedKey,
      title: t.title,
      status: "pendiente",
      createdAt: new Date().toISOString(),
      ...cambio,
    });
  };

  const cerrar = (t: MgmtTask, resolution: MgmtTask["resolution"]) => aplicar(t, { status: "cerrada", resolution });
  const postergar = (t: MgmtTask, dias: number) => {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + dias);
    aplicar(t, { snoozedUntil: d.toISOString().slice(0, 10) });
  };
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: errores esperados en el JSX de abajo, que todavía referencia `generar` y `tasks` con la forma vieja. Se arreglan en la Task 12.

- [ ] **Step 4: No commitear todavía**

La página queda a medias hasta la Task 12. Se commitea junta.

---

## Task 12: Bandeja — vistas y panel de detalle

**Files:**
- Modify: `app/app/tareas/page.tsx`

- [ ] **Step 1: Reemplazar el JSX de la cabecera, filtros y lista**

Reemplazar todo el `return (…)` del componente `TareasPage` por:

```tsx
  const pName = (t: MgmtTask) => { const p = t.patientId ? db.patients.find((x) => x.id === t.patientId) : undefined; return p ? fullName(p) : t.patientName ?? "—"; };
  const pPhone = (t: MgmtTask) => (t.patientId ? db.patients.find((x) => x.id === t.patientId)?.phone : undefined);
  const FILTERS: ("todas" | MgmtTaskType)[] = ["todas", "captura", "control", "cobranza", "cita", "personalizada"];

  return (
    <Reveal className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><ListChecks className="h-5 w-5" /></span>
        <div>
          <h1 className="text-lg font-extrabold text-clinic-text">Tareas de gestión</h1>
          <p className="text-xs text-clinic-muted">{delDia.length} para hoy · se generan y se cierran solas.</p>
        </div>
        {canManage && <Btn className="ml-auto" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Nueva tarea</Btn>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-clinic-border pb-2">
        {([["dia", "Tareas del día", delDia.length], ["atrasadas", "Atrasadas", atrasadas.length], ["todas", "Todas", todas.length]] as const).map(([k, label, n]) => (
          <button key={k} onClick={() => { setVista(k); setSelId(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${vista === k ? "bg-navy-800 text-white" : "text-clinic-muted hover:text-clinic-text"}`}>
            {label}
            {n > 0 && <span className={`rounded px-1.5 py-0.5 text-[10px] ${vista === k ? "bg-white/20" : k === "atrasadas" ? "bg-state-errbg text-state-err" : "bg-clinic-bg"}`}>{n}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${typeFilter === f ? "bg-azure-600 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>
            {f === "todas" ? "Todas" : TYPE_LABEL[f]}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted">
          <input type="checkbox" checked={soloMias} onChange={(e) => setSoloMias(e.target.checked)} /> Sólo mías
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-clinic-muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Ver cerradas
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <Empty title="Nada pendiente" desc="Cuando haya un saldo sin cobrar, un presupuesto sin aceptar o una cita sin confirmar, la tarea aparece acá sola." />
          ) : tasks.map((t) => (
            <button key={t.id} onClick={() => setSelId(t.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${selId === t.id ? "border-azure-400 bg-azure-50" : "border-clinic-border bg-white hover:border-azure-300"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TYPE_TONE[t.type]}>{TYPE_LABEL[t.type]}</Badge>
                <span className="text-sm font-bold text-clinic-text">{t.title}</span>
                {t.dueDate && t.dueDate < hoy && <Badge tone="err">Atrasada</Badge>}
                {t.status === "cerrada" && t.resolution && <Badge tone="muted">{RES_LABEL[t.resolution]}</Badge>}
              </div>
              <div className="mt-1 text-xs text-clinic-muted">{pName(t)}{t.detail ? ` · ${t.detail}` : ""}</div>
            </button>
          ))}
        </div>

        <Card className="h-fit p-4">
          {!sel ? (
            <p className="py-8 text-center text-xs text-clinic-muted">Seleccione una tarea para ver su detalle</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge tone={TYPE_TONE[sel.type]}>{TYPE_LABEL[sel.type]}</Badge>
                {sel.derivedKey && <span className="text-[10px] font-bold uppercase tracking-wide text-clinic-muted">Automática</span>}
              </div>
              <p className="text-sm font-bold text-clinic-text">{sel.title}</p>
              {sel.detail && <p className="text-xs text-clinic-muted">{sel.detail}</p>}
              {sel.patientId && <a href={`/app/pacientes/${sel.patientId}`} className="block text-xs font-bold text-azure-700 hover:underline">{pName(sel)}</a>}
              <dl className="space-y-1 border-t border-clinic-border pt-3 text-xs">
                <div className="flex justify-between"><dt className="text-clinic-muted">Origen</dt><dd className="font-bold text-clinic-text">{fmtDate(sel.createdAt)}</dd></div>
                {sel.dueDate && <div className="flex justify-between"><dt className="text-clinic-muted">Vence</dt><dd className={`font-bold ${sel.dueDate < hoy ? "text-state-err" : "text-clinic-text"}`}>{sel.dueDate}</dd></div>}
              </dl>

              {canManage && sel.status !== "cerrada" && (
                <div className="space-y-3 border-t border-clinic-border pt-3">
                  <Field label="Asignar a">
                    <select value={sel.assigneeId ?? ""} onChange={(e) => aplicar(sel, { assigneeId: e.target.value || undefined })} className={inputCls}>
                      <option value="">Sin asignar</option>
                      {db.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </Field>
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-bold text-clinic-muted"><Clock className="h-3 w-3" /> Postergar</p>
                    <div className="flex gap-1.5">
                      {([["1 día", 1], ["1 semana", 7], ["1 mes", 30]] as const).map(([label, d]) => (
                        <button key={d} onClick={() => { postergar(sel, d); setSelId(null); }} className="rounded-lg border border-clinic-border px-2 py-1 text-[11px] font-bold text-clinic-muted hover:text-clinic-text">{label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-bold text-clinic-muted">Cerrar caso</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => { cerrar(sel, "acepto"); setSelId(null); }} className="rounded-lg border border-state-ok/40 bg-state-okbg px-2 py-1 text-[11px] font-bold text-state-ok hover:brightness-95">Aceptó</button>
                      <button onClick={() => { cerrar(sel, "contacto_posterior"); setSelId(null); }} className="rounded-lg border border-state-warn/40 bg-state-warnbg px-2 py-1 text-[11px] font-bold text-state-warn hover:brightness-95">Contacto posterior</button>
                      <button onClick={() => { cerrar(sel, "rechazo"); setSelId(null); }} className="rounded-lg border border-state-err/40 bg-state-errbg px-2 py-1 text-[11px] font-bold text-state-err hover:brightness-95">Rechazó</button>
                    </div>
                  </div>
                  {pPhone(sel) && (
                    <a href={waLink(pPhone(sel)!, `Hola ${pName(sel)}, te contactamos de la clínica.`)} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-clinic-border py-2 text-xs font-bold text-state-ok hover:bg-state-okbg">
                      <MessageCircle className="h-3.5 w-3.5" /> Escribir por WhatsApp
                    </a>
                  )}
                  {!sel.derivedKey && (
                    <button onClick={() => { if (confirm("¿Eliminar tarea?")) { deleteMgmtTask(sel.id); setSelId(null); } }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold text-clinic-muted hover:text-state-err">
                      <Trash2 className="h-3 w-3" /> Eliminar tarea
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {showForm && (
        <TaskForm
          clinicId={cid}
          patients={db.patients.map((p) => ({ id: p.id, name: fullName(p) }))}
          users={db.users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
          onClose={() => setShowForm(false)}
          onSave={(t) => { addMgmtTask(t); setShowForm(false); }}
        />
      )}
    </Reveal>
  );
}
```

`TaskForm` (líneas 163-220 del archivo actual) queda **sin cambios**.

- [ ] **Step 2: Verificar tipos y build**

Run: `npx tsc --noEmit && npm run build`
Expected: sin errores. Si `tsc` se queja de `fmtGs` o `RefreshCw` sin usar, borrá esos imports.

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev -- -p 3100`
Abrir `http://localhost:3100/login` → "Ver demo" → Administrador → `/app/tareas`.

Verificar:
1. Hay tareas **sin haber apretado ningún botón**.
2. Los tabs muestran contadores.
3. Al clickear una tarea se abre el panel de detalle.
4. Postergar 1 día la saca de la lista.
5. Cerrar con "Rechazó" la saca y con "Ver cerradas" reaparece.

- [ ] **Step 4: Commit**

```bash
git add app/app/tareas/page.tsx
git commit -m "feat(tareas): bandeja que se llena y se vacía sola, con panel de detalle"
```

---

## Task 13: Plazos configurables en Configuración

**Files:**
- Modify: `app/app/configuracion/page.tsx`

> **Lo que ya provee la página** (verificado en `app/app/configuracion/page.tsx`):
> `const clinic = db.clinics[0];` en la línea 56, y la acción del store
> `updateClinicConfig(parcial)` que **mergea un parcial** de `clinic.config` — o
> sea que NO hay que desparramar el config entero, alcanza con mandar la clave
> que cambia. Es el mismo patrón de las secciones de moneda, convenios y logo.

- [ ] **Step 1: Agregar los imports**

En `app/app/configuracion/page.tsx`, junto a los imports existentes:

```tsx
import { DEFAULT_DEADLINES } from "@/lib/tareas";
import type { TaskDeadline } from "@/lib/types";
```

- [ ] **Step 2: Agregar la sección de plazos**

Insertar una `Card` nueva al final del contenido de la página:

```tsx
{/* Plazos de las tareas automáticas: cuánto pasa desde el evento (deuda,
    presupuesto presentado, tratamiento terminado, cita sin confirmar) hasta que
    la tarea aparece en "Tareas del día". */}
<Card className="p-5">
  <h2 className="text-sm font-extrabold text-clinic-text">Plazos de tareas automáticas</h2>
  <p className="mt-1 text-xs text-clinic-muted">Cuánto esperar antes de que la tarea entre a la bandeja del día.</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {([["cobranza", "Cobranza"], ["captura", "Captura de presupuesto"], ["control", "Control post-tratamiento"], ["cita", "Cita sin confirmar"]] as const).map(([key, label]) => {
      const actual = clinic.config.taskDeadlines?.[key] ?? DEFAULT_DEADLINES[key];
      const valor = actual.kind === "inmediato" ? "0" : String(actual.n);
      return (
        <Field key={key} label={label}>
          <select
            value={valor}
            onChange={(e) => {
              const n = Number(e.target.value);
              const plazo: TaskDeadline = n === 0 ? { kind: "inmediato" } : { kind: "dias", n };
              updateClinicConfig({ taskDeadlines: { ...clinic.config.taskDeadlines, [key]: plazo } });
            }}
            className={inputCls}
          >
            <option value="0">Inmediato</option>
            <option value="1">1 día</option>
            <option value="7">1 semana</option>
            <option value="30">1 mes</option>
            <option value="180">6 meses</option>
            <option value="365">1 año</option>
          </select>
        </Field>
      );
    })}
  </div>
</Card>
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificar en el navegador**

En `/app/configuracion`, cambiar "Cobranza" a "1 mes", ir a `/app/tareas` y confirmar que las tareas de cobranza corren su vencimiento (pueden pasar de "atrasada" a "futura" y desaparecer de la vista del día).

- [ ] **Step 5: Commit**

```bash
git add app/app/configuracion/page.tsx
git commit -m "feat(tareas): plazos configurables por tipo desde Configuración"
```

---

## Task 14: Datos demo

**Files:**
- Modify: `lib/seed.ts`

- [ ] **Step 1: Ajustar `mgmtTasks` del seed**

En `lib/seed.ts` línea 426, reemplazar el array `mgmtTasks` por:

```ts
    mgmtTasks: [
      // Las automáticas (cobranza/captura/control/cita) NO van acá: se derivan
      // del estado de la clínica. Acá solo van las manuales y los overrides.
      { id: "mt2", clinicId: CLINIC_ID, type: "personalizada", patientId: "p6", title: "Llamar para confirmar control de ortodoncia", status: "en_proceso", assigneeId: "u3", createdAt: at(-2, 11) },
      { id: "mt3", clinicId: CLINIC_ID, type: "personalizada", title: "Pedir presupuesto de autoclave nueva", detail: "Comparar tres proveedores.", status: "pendiente", createdAt: at(-1, 15) },
    ],
```

> Se elimina `mt1` (era una tarea de captura hardcodeada): ahora la genera la
> regla sola desde el presupuesto `g1` en estado `presentado`.

- [ ] **Step 2: Verificar que el seed dispara al menos una tarea de cada tipo**

Run: `npm run dev -- -p 3100`, entrar al demo, ir a `/app/tareas`, poner el filtro en "Todas" y la vista en "Todas".

Expected: al menos una tarea de **cobranza**, una de **captura**, una de **control** y las dos **personalizadas**.

Si falta alguna, ajustar el seed:
- **cobranza**: que un paciente tenga un budget `aceptado` con más monto que sus payments.
- **captura**: que haya un budget en `presentado` (hoy `g1` lo está).
- **control**: que un paciente tenga un budget `completado` y ninguna cita futura.
- **cita**: que haya una cita con `status: "pendiente"` dentro de los próximos 2 días.

- [ ] **Step 3: Commit**

```bash
git add lib/seed.ts
git commit -m "feat(tareas): demo sin tareas automáticas hardcodeadas"
```

---

## Task 15: Verificación final

**Files:** ninguno

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc sin salida · todos los tests verdes · build exitoso.

- [ ] **Step 2: Probar el auto-cierre de punta a punta**

Este es **el** comportamiento que justifica todo el diseño. Hay que verlo, no asumirlo.

1. `/app/tareas` → anotar un paciente con tarea de **cobranza**.
2. Ir a su ficha → **Recibir pago** → registrar el pago del saldo completo.
3. Volver a `/app/tareas`.

Expected: **la tarea de cobranza desapareció sola**, sin apretar nada.

- [ ] **Step 3: Probar el auto-cierre de captura**

1. Anotar un presupuesto con tarea de **captura**.
2. Cambiarlo a `aceptado`.
3. Volver a `/app/tareas`.

Expected: la tarea de captura desapareció.

- [ ] **Step 4: Probar que el override sobrevive al recálculo**

1. Asignar una tarea de cobranza a un usuario.
2. Recargar la página.

Expected: sigue asignada. (Si se pierde, el `derivedKey` no está matcheando — revisar `fusionarTareas`.)

- [ ] **Step 5: Verificar que no se tocaron las reglas de Firestore**

Run: `git diff main --stat -- firestore.rules`
Expected: **sin salida**. Si `firestore.rules` cambió, algo se salió del diseño: esta feature no crea colecciones y Carlos no debería tener que desplegar nada.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "feat(tareas): módulo de tareas automáticas completo"
```
