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

import { mapaDeSaldos } from "./tareas";
import { patientBalance } from "./budgets";
import type { Budget, Payment } from "./types";

const bud = (id: string, patientId: string, status: Budget["status"], monto: number, createdAt = "2026-01-10T10:00:00.000Z"): Budget => ({
  id, clinicId: "c1", patientId, dentistId: "u1", createdAt, status,
  items: [{ id: `${id}i`, cpt: "D001", description: "Prestación", price: monto, status: "pendiente" }],
  history: [],
});

const pay = (id: string, patientId: string, amount: number, voided = false): Payment => ({
  id, clinicId: "c1", patientId, date: "2026-02-01T10:00:00.000Z", amount,
  method: "efectivo", concept: "Abono", receivedBy: "u1",
  ...(voided ? { voidedAt: "2026-02-02T10:00:00.000Z" } : {}),
});

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

import { derivarTareas } from "./tareas";
import type { Patient, Appointment } from "./types";

// Helpers de fixtures tipados de verdad (sin `as`) — la red que estos tests
// vienen a tender se rompe si algo cast-ea el shape en vez de completarlo.
const pac = (id: string, firstName = "Ana", lastName = "Prueba"): Patient => ({
  id, clinicId: "c1", firstName, lastName, document: "1234567", phone: "+595981000000",
  forms: [], historyUpdatePending: false, emr: [],
});

const cita = (id: string, patientId: string, start: string, status: Appointment["status"]): Appointment => ({
  id, clinicId: "c1", patientId, dentistId: "u1", title: "Consulta",
  start, end: start, status, amount: 0, discount: 0,
});

// Definido acá arriba (y no junto al describe de la regla cheque, más abajo en
// el archivo) porque `describe("idempotencia…")` arma su `input` en el cuerpo
// del describe, que vitest ejecuta apenas colecciona el archivo: si `payCheque`
// fuera un const declarado más abajo, esa lectura temprana rompería por TDZ
// ("usado antes de declararlo").
const payCheque = (id: string, patientId: string, amount: number, check: { cashDate: string; cobradoAt?: string }, extra: Partial<Payment> = {}): Payment => ({
  id, clinicId: "c1", patientId, date: "2026-07-20T10:00:00.000Z", amount,
  method: "cheque", concept: "Cheque", receivedBy: "u1",
  check: { number: "001", bank: "Banco Test", ...check },
  ...extra,
});

const HOY = "2026-07-30";
// Anotado en la const (no `as` por campo): mismo resultado sin usar type assertions.
const vacio: { patients: Patient[]; budgets: Budget[]; payments: Payment[]; appointments: Appointment[] } = {
  patients: [], budgets: [], payments: [], appointments: [],
};

describe("regla cobranza", () => {
  it("abre una tarea cuando el paciente tiene saldo positivo", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000)] }, HOY);
    const cob = t.filter((x) => x.type === "cobranza");
    expect(cob).toHaveLength(1);
    expect(cob[0].derivedKey).toBe("cobranza:p1");
    expect(cob[0].patientId).toBe("p1");
  });

  it("NO abre cuando el saldo es cero — este es el auto-cierre", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000)], payments: [pay("y1", "p1", 500_000)] }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(0);
  });

  it("NO abre cuando el paciente abonó de más (saldo negativo)", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000)], payments: [pay("y1", "p1", 700_000)] }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(0);
  });

  it("una sola tarea por paciente aunque deba en varios presupuestos", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "completado", 300_000)] }, HOY);
    expect(t.filter((x) => x.type === "cobranza")).toHaveLength(1);
  });

  // El motor es puro y la app soporta 17 monedas: formatear acá daría "Gs." a
  // una clínica de Colombia, y con USD el redondeo se comería los centavos.
  it("lleva el monto CRUDO en `amount`, sin formatear ni redondear", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 1_500_000)], payments: [pay("y1", "p1", 250_000.75)] }, HOY);
    const cob = t.find((x) => x.type === "cobranza")!;
    expect(cob.amount).toBe(1_249_999.25);
    expect(cob.detail).toBeUndefined();
  });

  it("ninguna tarea derivada trae un símbolo de moneda en el texto", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "presentado", 300_000), bud("b3", "p1", "completado", 100_000)],
      appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
    }, HOY);
    expect(t.length).toBeGreaterThan(0);
    for (const x of t) expect(`${x.title} ${x.detail ?? ""}`).not.toMatch(/Gs\.|\$|COP|₡/);
  });

  it("el vencimiento sale del presupuesto con saldo más antiguo + plazo", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [
      bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z"),
      bud("b2", "p1", "aceptado", 200_000, "2026-07-20T10:00:00.000Z"),
    ] }, HOY);
    expect(t.find((x) => x.type === "cobranza")!.dueDate).toBe("2026-07-08"); // 2026-07-01 + 7
  });
});

describe("regla captura", () => {
  it("abre una tarea por cada presupuesto presentado", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "presentado", 500_000, "2026-07-20T10:00:00.000Z")] }, HOY);
    const cap = t.filter((x) => x.type === "captura");
    expect(cap).toHaveLength(1);
    expect(cap[0].derivedKey).toBe("captura:b1");
    expect(cap[0].budgetId).toBe("b1");
    expect(cap[0].dueDate).toBe("2026-07-23"); // +3 días
  });

  it.each(["borrador", "aceptado", "completado", "anulado"] as const)(
    "NO abre para un presupuesto en estado %s — esto es el auto-cierre",
    (status) => {
      const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", status, 500_000)] }, HOY);
      expect(t.filter((x) => x.type === "captura")).toHaveLength(0);
    },
  );

  it("dos presupuestos presentados dan dos tareas con claves distintas", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "presentado", 100_000), bud("b2", "p1", "presentado", 200_000)] }, HOY);
    expect(t.filter((x) => x.type === "captura").map((x) => x.derivedKey).sort()).toEqual(["captura:b1", "captura:b2"]);
  });

  it("usa el nombre del plan como detalle si lo tiene", () => {
    const b: Budget = { ...bud("b1", "p1", "presentado", 100_000), name: "Ortodoncia fija" };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [b] }, HOY);
    expect(t.find((x) => x.type === "captura")!.detail).toBe("Ortodoncia fija");
  });
});

describe("regla control", () => {
  it("abre cuando hay tratamiento completado y ninguna cita futura", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000, "2026-01-10T10:00:00.000Z")] }, HOY);
    const ctl = t.filter((x) => x.type === "control");
    expect(ctl).toHaveLength(1);
    expect(ctl[0].derivedKey).toBe("control:p1");
    expect(ctl[0].dueDate).toBe("2026-07-09"); // 2026-01-10 + 180
  });

  it("NO abre si el paciente ya tiene una cita futura — auto-cierre al agendar", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000)], appointments: [cita("a1", "p1", "2026-08-15T10:00:00.000Z", "confirmada")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  // La regla `cita` incluye el día de hoy; ésta usaba `>` estricto, así que el
  // paciente que viene esta tarde igual aparecía como "sin próxima visita".
  it("una cita de HOY cuenta como próxima visita y NO abre control", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000)], appointments: [cita("a1", "p1", `${HOY}T16:00:00.000Z`, "confirmada")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  it("una cita futura CANCELADA no cuenta como cita futura", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000)], appointments: [cita("a1", "p1", "2026-08-15T10:00:00.000Z", "cancelada")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("una cita PASADA no evita la tarea de control", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000)], appointments: [cita("a1", "p1", "2026-06-01T10:00:00.000Z", "completada")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("un paciente con TRES tratamientos completados deriva UNA sola tarea", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [
      bud("b1", "p1", "completado", 100_000, "2023-01-10T10:00:00.000Z"),
      bud("b2", "p1", "completado", 200_000, "2024-05-10T10:00:00.000Z"),
      bud("b3", "p1", "completado", 300_000, "2026-01-10T10:00:00.000Z"),
    ] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("el evento es la última cita completada si existe", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000, "2026-01-10T10:00:00.000Z")], appointments: [
      cita("a1", "p1", "2026-02-01T10:00:00.000Z", "completada"),
      cita("a2", "p1", "2026-03-15T10:00:00.000Z", "completada"),
    ] }, HOY);
    expect(t.find((x) => x.type === "control")!.dueDate).toBe("2026-09-11"); // 2026-03-15 + 180
  });

  it("NO abre si el paciente no tiene ningún tratamiento completado", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000)] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  // Sin el corte, una clínica que migra su historia entera abre la bandeja el
  // primer día con una tarea vencida por cada paciente que pasó alguna vez.
  it("NO abre para un tratamiento terminado hace 8 años (fuera de la ventana)", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000, "2018-04-10T10:00:00.000Z")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  it("SÍ abre para un tratamiento terminado hace 3 meses (dentro de la ventana)", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 500_000, "2026-04-30T10:00:00.000Z")] }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });

  it("la ventana se mide contra el evento real: 1.200 pacientes viejos no llenan la bandeja", () => {
    const patients = Array.from({ length: 50 }, (_, i) => pac(`p${i}`));
    const budgets = patients.map((p, i) => bud(`b${i}`, p.id, "completado", 100_000, "2016-01-10T10:00:00.000Z"));
    const t = derivarTareas({ ...vacio, patients, budgets }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(0);
  });

  it("un tratamiento viejo con una atención RECIENTE sí genera control (el evento manda)", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")],
      budgets: [bud("b1", "p1", "completado", 500_000, "2018-04-10T10:00:00.000Z")],
      appointments: [cita("a1", "p1", "2026-06-01T10:00:00.000Z", "completada")],
    }, HOY);
    expect(t.filter((x) => x.type === "control")).toHaveLength(1);
  });
});

describe("regla cita", () => {
  it("abre para una cita pendiente dentro de los próximos 2 días", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")] }, HOY);
    const c = t.filter((x) => x.type === "cita");
    expect(c).toHaveLength(1);
    expect(c[0].derivedKey).toBe("cita:a1");
    expect(c[0].dueDate).toBe(HOY);
  });

  it("abre para una cita pendiente de HOY", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-30T16:00:00.000Z", "pendiente")] }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(1);
  });

  it.each(["confirmada", "en_atencion", "completada"] as const)(
    "NO abre para una cita en estado %s — auto-cierre al confirmar",
    (status) => {
      const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", status)] }, HOY);
      expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
    },
  );

  // Antes estos dos estaban en la lista de arriba ("ninguna tarea de cita").
  // Con la regla de Dentalink una cita cancelada o ausente, sin otra futura, SÍ
  // abre tarea de cita: la de re-agenda. Lo que se sigue verificando es que la
  // de confirmación no se dispara.
  it.each(["cancelada", "ausente"] as const)(
    "NO abre la de confirmación para una cita %s (esa abre la de re-agenda)",
    (status) => {
      const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", status)] }, HOY);
      expect(t.filter((x) => x.type === "cita" && x.title === "Cita sin confirmar")).toHaveLength(0);
      expect(t.filter((x) => x.type === "cita").map((x) => x.instanceKey)).toEqual([`${status}:a1`]);
    },
  );

  it("NO abre para una cita más allá de la ventana de 2 días", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-08-10T10:00:00.000Z", "pendiente")] }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
  });

  it("NO abre para una cita que ya pasó — auto-cierre por fecha", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-20T10:00:00.000Z", "pendiente")] }, HOY);
    expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
  });
});

describe("idempotencia de las claves derivadas", () => {
  const input = {
    patients: [pac("p1"), pac("p2", "Beto", "Ejemplo")],
    budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "presentado", 200_000), bud("b3", "p2", "completado", 300_000)],
    payments: [pay("y1", "p1", 100_000), payCheque("y2", "p1", 375_000, { cashDate: "2026-08-05" })],
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
      expect(t.derivedKey).toMatch(/^(cobranza|captura|control|cita|cheque):[\w-]+$/);
    }
  });
});

import { fusionarTareas, type DerivedTask } from "./tareas";
import type { MgmtTask } from "./types";

const derivada = (derivedKey: string, dueDate = "2026-07-25", instanceKey = "i1"): DerivedTask => ({
  derivedKey, type: "cobranza", patientId: "p1", title: "Saldo pendiente de pago",
  instanceKey, eventAt: "2026-07-18T10:00:00.000Z", dueDate,
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

  it("un override CERRADO contra la MISMA instancia oculta la derivada", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { status: "cerrada", resolution: "rechazo", closedInstance: "i1" })], HOY);
    expect(r).toHaveLength(0);
  });

  // El bug que cuesta plata: `cobranza:p1` se reusa toda la vida del paciente,
  // así que un cierre atado solo a la clave enterraba la regla para siempre.
  it("un override cerrado contra OTRA instancia NO la oculta: reaparece pendiente y sin la resolución vieja", () => {
    const r = fusionarTareas([derivada("cobranza:p1", "2026-07-25", "2000000")], [override("cobranza:p1", { status: "cerrada", resolution: "rechazo", closedInstance: "500000" })], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("pendiente");
    expect(r[0].resolution).toBeUndefined();
  });

  it("un override cerrado SIN closedInstance (dato viejo) NO la oculta — default seguro", () => {
    const r = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { status: "cerrada", resolution: "rechazo" })], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("pendiente");
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

  // "Postergar" escribe `snoozedUntil` en el doc igual que en las derivadas: si
  // la rama de manuales no lo mira, el panel se cierra y al recargar sigue ahí.
  it("una manual postergada a futuro no aparece", () => {
    const r = fusionarTareas([], [manual("mt1", { snoozedUntil: "2026-09-01" })], HOY);
    expect(r).toHaveLength(0);
  });

  it("una manual postergada a una fecha ya pasada SÍ aparece", () => {
    const r = fusionarTareas([], [manual("mt1", { snoozedUntil: "2026-07-20" })], HOY);
    expect(r).toHaveLength(1);
  });

  it("una manual postergada justo a HOY ya vuelve a aparecer", () => {
    const r = fusionarTareas([], [manual("mt1", { snoozedUntil: HOY })], HOY);
    expect(r).toHaveLength(1);
  });

  it("con incluirCerradas=true aparecen las cerradas de ambos orígenes", () => {
    const r = fusionarTareas(
      [derivada("cobranza:p1")],
      [override("cobranza:p1", { status: "cerrada", resolution: "acepto", closedInstance: "i1" }), manual("mt1", { status: "cerrada" })],
      HOY, true,
    );
    expect(r).toHaveLength(2);
  });

  it("la derivada conserva su id determinístico para que React no pierda el key", () => {
    const a = fusionarTareas([derivada("cobranza:p1")], [], HOY)[0];
    const b = fusionarTareas([derivada("cobranza:p1")], [], HOY)[0];
    expect(a.id).toBe(b.id);
  });

  // El id NO puede depender de si existe el override: al asignar la tarea se
  // crea el doc, y si el id saltara a `ov_…` la fila seleccionada dejaría de
  // encontrarse y el panel de detalle se vaciaría solo.
  it("el id de una derivada es el MISMO con y sin override", () => {
    const sinOv = fusionarTareas([derivada("cobranza:p1")], [], HOY)[0];
    const conOv = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { assigneeId: "u3" })], HOY)[0];
    expect(conOv.id).toBe(sinOv.id);
    expect(conOv.id).toBe("d_cobranza:p1");
  });

  it("el id del doc del override viaja aparte, en `overrideId`", () => {
    const conOv = fusionarTareas([derivada("cobranza:p1")], [override("cobranza:p1", { assigneeId: "u3" })], HOY)[0];
    expect(conOv.overrideId).toBe("ov_cobranza:p1");
    expect(fusionarTareas([derivada("cobranza:p1")], [], HOY)[0].overrideId).toBeUndefined();
  });
});

/** El escenario que motivó todo: la clave `cobranza:p1` vive para siempre, la
 *  deuda no. Si el cierre se pega a la clave, la clínica deja de cobrar. */
describe("C1 · el cierre se ata a la instancia, no al paciente", () => {
  const p = [pac("p1")];

  it("cobranza: cierro con saldo 500.000 → paga todo → firma plan de 2.000.000 → la tarea VUELVE", () => {
    // 1. Debe 500.000. Recepción llama, el paciente se niega, cierran "Rechazó".
    const etapa1 = derivarTareas({ ...vacio, patients: p, budgets: [bud("b1", "p1", "aceptado", 500_000)] }, HOY);
    const cob1 = etapa1.find((t) => t.type === "cobranza")!;
    expect(cob1.instanceKey).toBe("500000");
    const ov = override("cobranza:p1", { status: "cerrada", resolution: "rechazo", closedInstance: cob1.instanceKey });
    expect(fusionarTareas(etapa1, [ov], HOY)).toHaveLength(0);

    // 2. Después paga: la derivada deja de producirse y el override queda huérfano.
    const etapa2 = derivarTareas({ ...vacio, patients: p, budgets: [bud("b1", "p1", "aceptado", 500_000)], payments: [pay("y1", "p1", 500_000)] }, HOY);
    expect(fusionarTareas(etapa2, [ov], HOY)).toHaveLength(0);

    // 3. Meses después firma un plan de 2.000.000 y no paga nada: OTRA situación.
    const etapa3 = derivarTareas({
      ...vacio, patients: p,
      budgets: [bud("b1", "p1", "aceptado", 500_000), bud("b2", "p1", "aceptado", 2_000_000, "2026-07-01T10:00:00.000Z")],
      payments: [pay("y1", "p1", 500_000)],
    }, HOY);
    const fusionada = fusionarTareas(etapa3, [ov], HOY);
    expect(fusionada).toHaveLength(1);
    expect(fusionada[0].type).toBe("cobranza");
    expect(fusionada[0].status).toBe("pendiente");
    expect(fusionada[0].resolution).toBeUndefined();
  });

  it("cobranza: si la deuda NO cambió, el cierre sigue valiendo", () => {
    const d = derivarTareas({ ...vacio, patients: p, budgets: [bud("b1", "p1", "aceptado", 500_000)] }, HOY);
    const ov = override("cobranza:p1", { status: "cerrada", resolution: "rechazo", closedInstance: "500000" });
    expect(fusionarTareas(d, [ov], HOY)).toHaveLength(0);
  });

  it("captura: la instancia es el id del presupuesto, así que cerrarla la deja cerrada", () => {
    const input = { ...vacio, patients: p, budgets: [bud("b1", "p1", "presentado", 300_000)] };
    const d = derivarTareas(input, HOY);
    const cap = d.find((t) => t.type === "captura")!;
    expect(cap.instanceKey).toBe("b1");
    const ov = override("captura:b1", { type: "captura", status: "cerrada", resolution: "rechazo", closedInstance: "b1" });
    expect(fusionarTareas(d, [ov], HOY)).toHaveLength(0);
    // Y sigue cerrada en la lectura siguiente: la instancia no se mueve.
    expect(fusionarTareas(derivarTareas(input, HOY), [ov], HOY)).toHaveLength(0);
  });

  it("cita: la instancia es el id de la cita, así que cerrarla la deja cerrada", () => {
    const input = { ...vacio, patients: p, appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")] };
    const d = derivarTareas(input, HOY);
    const c = d.find((t) => t.type === "cita")!;
    expect(c.instanceKey).toBe("a1");
    const ov = override("cita:a1", { type: "cita", status: "cerrada", resolution: "acepto", closedInstance: "a1" });
    expect(fusionarTareas(d, [ov], HOY)).toHaveLength(0);
    expect(fusionarTareas(derivarTareas(input, HOY), [ov], HOY)).toHaveLength(0);
  });

  it("control: la instancia es el eventAt, así que un tratamiento terminado DESPUÉS reabre el control", () => {
    // Los tratamientos van pagados: si no, el paciente arrastraría además una
    // cobranza y el test estaría midiendo dos reglas a la vez.
    const base = {
      ...vacio, patients: p,
      budgets: [bud("b1", "p1", "completado", 500_000, "2026-05-10T10:00:00.000Z")],
      payments: [pay("y1", "p1", 500_000)],
    };
    const d1 = derivarTareas(base, HOY);
    const ctl1 = d1.find((t) => t.type === "control")!;
    expect(ctl1.instanceKey).toBe("2026-05-10T10:00:00.000Z");
    const ov = override("control:p1", { type: "control", status: "cerrada", resolution: "acepto", closedInstance: ctl1.instanceKey });
    expect(fusionarTareas(d1, [ov], HOY)).toHaveLength(0);

    // Termina OTRO tratamiento más tarde: el cierre viejo ya no describe esto.
    const d2 = derivarTareas({
      ...base,
      budgets: [...base.budgets, bud("b2", "p1", "completado", 200_000, "2026-07-20T10:00:00.000Z")],
      payments: [pay("y1", "p1", 700_000)],
    }, HOY);
    const fusionada = fusionarTareas(d2, [ov], HOY);
    expect(fusionada).toHaveLength(1);
    expect(fusionada[0].type).toBe("control");
    expect(fusionada[0].status).toBe("pendiente");
  });
});

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

import { detalleTarea } from "./tareas";

describe("detalleTarea", () => {
  it("con solo detail, devuelve detail", () => {
    expect(detalleTarea({ detail: "Plan dental integral" })).toBe("Plan dental integral");
  });

  it("con solo amount, devuelve el monto formateado con el formateador que le pasan", () => {
    expect(detalleTarea({ amount: 375_000 }, (n) => `Gs. ${n}`)).toBe("Gs. 375000");
  });

  it("con AMBOS —el caso de cheque— muestra los dos, monto primero", () => {
    expect(detalleTarea({ amount: 375_000, detail: "Banco Itaú · N° 00456123" }, (n) => `Gs. ${n}`)).toBe("Gs. 375000 · Banco Itaú · N° 00456123");
  });

  it("sin ninguno de los dos, devuelve undefined", () => {
    expect(detalleTarea({})).toBeUndefined();
  });
});

/* ═══ Paridad Dentalink: tarea de cita, captura, bandeja por fecha, Finalizar ▾ ═══ */

describe("regla cita — re-agenda (la tarea de cita de Dentalink)", () => {
  const reagendas = (t: DerivedTask[]) => t.filter((x) => x.type === "cita" && x.title !== "Cita sin confirmar");

  it("abre cuando la última cita quedó AUSENTE y el paciente no tiene citas futuras", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-29T10:00:00.000Z", "ausente")] }, HOY);
    const c = reagendas(t);
    expect(c).toHaveLength(1);
    expect(c[0].derivedKey).toBe("cita:a1");
    expect(c[0].instanceKey).toBe("ausente:a1");
    expect(c[0].title).toBe("Faltó a su cita");
    expect(c[0].appointmentId).toBe("a1");
    expect(c[0].professionalId).toBe("u1");
    expect(c[0].dueDate).toBe("2026-07-29"); // inmediato: el día de la cita
  });

  it("abre cuando la última cita quedó CANCELADA (anulada) y no programó otra", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-28T10:00:00.000Z", "cancelada")] }, HOY);
    expect(reagendas(t).map((x) => [x.derivedKey, x.title])).toEqual([["cita:a1", "Cita cancelada sin reagendar"]]);
  });

  it.each(["pendiente", "confirmada"] as const)("NO abre si tiene una cita futura %s — auto-cierre al re-agendar", (status) => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [
      cita("a1", "p1", "2026-07-28T10:00:00.000Z", "ausente"),
      cita("a2", "p1", "2026-08-20T10:00:00.000Z", status),
    ] }, HOY);
    expect(reagendas(t)).toHaveLength(0);
  });

  it("una cita de HOY cuenta como próxima visita (mismo criterio que control)", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [
      cita("a1", "p1", "2026-07-20T10:00:00.000Z", "ausente"),
      cita("a2", "p1", `${HOY}T18:00:00.000Z`, "confirmada"),
    ] }, HOY);
    expect(reagendas(t)).toHaveLength(0);
  });

  it("una cita futura cancelada no cuenta como futura: la tarea es por ESA, la última", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [
      cita("a1", "p1", "2026-07-10T10:00:00.000Z", "completada"),
      cita("a2", "p1", "2026-08-05T10:00:00.000Z", "cancelada"),
    ] }, HOY);
    const c = reagendas(t);
    expect(c.map((x) => x.derivedKey)).toEqual(["cita:a2"]);
    expect(c[0].dueDate).toBe("2026-08-05"); // "luego de que la cita no se ejecutó": el día de la cita
  });

  it("NO abre si después de faltar vino a otra cita (la última es la que manda)", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [
      cita("a1", "p1", "2026-07-01T10:00:00.000Z", "ausente"),
      cita("a2", "p1", "2026-07-15T10:00:00.000Z", "completada"),
    ] }, HOY);
    expect(reagendas(t)).toHaveLength(0);
  });

  it("una sola por paciente aunque haya faltado varias veces: la de su última cita", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [
      cita("a1", "p1", "2026-06-01T10:00:00.000Z", "ausente"),
      cita("a2", "p1", "2026-07-01T10:00:00.000Z", "cancelada"),
      cita("a3", "p1", "2026-07-20T10:00:00.000Z", "ausente"),
    ] }, HOY);
    expect(reagendas(t).map((x) => x.derivedKey)).toEqual(["cita:a3"]);
  });

  it("el vencimiento es el día de la cita + el plazo configurado para cita", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")], deadlines: { cita: { kind: "dias", n: 1 } },
      appointments: [cita("a1", "p1", "2026-07-28T10:00:00.000Z", "ausente")],
    }, HOY);
    expect(reagendas(t)[0].dueDate).toBe("2026-07-29");
  });

  it("fuera de la ventana de 6 meses no abre: la historia importada no inunda la bandeja", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2025-12-01T10:00:00.000Z", "ausente")] }, HOY);
    expect(reagendas(t)).toHaveLength(0);
    const dentro = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-02-15T10:00:00.000Z", "ausente")] }, HOY);
    expect(reagendas(dentro)).toHaveLength(1);
  });

  it("no mezcla pacientes: la cita futura de otro no cierra la de este", () => {
    const t = derivarTareas({ ...vacio, patients: [pac("p1"), pac("p2")], appointments: [
      cita("a1", "p1", "2026-07-28T10:00:00.000Z", "ausente"),
      cita("a2", "p2", "2026-08-20T10:00:00.000Z", "confirmada"),
    ] }, HOY);
    expect(reagendas(t).map((x) => x.patientId)).toEqual(["p1"]);
  });

  it("la confirmación y la re-agenda de la MISMA cita tienen instancias distintas", () => {
    // Pendiente → la de confirmación; si después se cancela → la de re-agenda,
    // con la misma clave pero otra instancia: el cierre de una no entierra la otra.
    const antes = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")] }, HOY);
    const despues = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "cancelada")] }, HOY);
    expect(antes[0].derivedKey).toBe(despues[0].derivedKey);
    expect(antes[0].instanceKey).not.toBe(despues[0].instanceKey);
    const ov = override("cita:a1", { type: "cita", status: "cerrada", resolution: "acepto", closedInstance: antes[0].instanceKey });
    expect(fusionarTareas(despues, [ov], HOY)).toHaveLength(1);
  });
});

describe("regla cita sin confirmar — plazo", () => {
  // El plazo configurable es el de la re-agenda: si lo usara, con "1 semana" la
  // llamada para confirmar llegaría después de la cita.
  it("vence siempre hoy, aunque la clínica configure otro plazo para cita", () => {
    const t = derivarTareas({
      ...vacio, patients: [pac("p1")], deadlines: { cita: { kind: "dias", n: 7 } },
      appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", "pendiente")],
    }, HOY);
    expect(t.find((x) => x.title === "Cita sin confirmar")!.dueDate).toBe(HOY);
  });
});

describe("regla captura — presupuesto no empezado ni pagado (Dentalink)", () => {
  it("NO abre si el presupuesto presentado ya tiene un abono", () => {
    const abono: Payment = { ...pay("y1", "p1", 100_000), budgetId: "b1" };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "presentado", 500_000)], payments: [abono] }, HOY);
    expect(t.filter((x) => x.type === "captura")).toHaveLength(0);
  });

  it("SÍ abre si el único abono del presupuesto está anulado", () => {
    const abono: Payment = { ...pay("y1", "p1", 100_000, true), budgetId: "b1" };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "presentado", 500_000)], payments: [abono] }, HOY);
    expect(t.filter((x) => x.type === "captura")).toHaveLength(1);
  });

  it("NO abre si ya tiene una prestación realizada", () => {
    const b = bud("b1", "p1", "presentado", 500_000);
    const empezado: Budget = { ...b, items: [{ ...b.items[0], status: "realizado" }] };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [empezado] }, HOY);
    expect(t.filter((x) => x.type === "captura")).toHaveLength(0);
  });

  it("un pago de OTRO presupuesto no lo da por empezado", () => {
    const otro: Payment = { ...pay("y1", "p1", 100_000), budgetId: "b9" };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "presentado", 500_000)], payments: [otro] }, HOY);
    expect(t.filter((x) => x.type === "captura")).toHaveLength(1);
  });

  it("presupuestoIniciado coincide con la regla", () => {
    const b = bud("b1", "p1", "presentado", 500_000);
    expect(presupuestoIniciado(b, [])).toBe(false);
    expect(presupuestoIniciado(b, [{ budgetId: "b1" }])).toBe(true);
    expect(presupuestoIniciado(b, [{ budgetId: "b1", voidedAt: "2026-07-01T00:00:00.000Z" }])).toBe(false);
  });
});

describe("profesional de cada tarea (lo que va debajo del paciente)", () => {
  it("cobranza: el dentista del presupuesto con saldo más antiguo", () => {
    const b1: Budget = { ...bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z"), dentistId: "u4" };
    const b2: Budget = { ...bud("b2", "p1", "aceptado", 500_000, "2026-07-10T10:00:00.000Z"), dentistId: "u2" };
    const t = derivarTareas({ ...vacio, patients: [pac("p1")], budgets: [b2, b1] }, HOY);
    expect(t.find((x) => x.type === "cobranza")!.professionalId).toBe("u4");
  });

  it("captura y control: el dentista del plan; cheque: el del plan al que abona", () => {
    const pres: Budget = { ...bud("b1", "p1", "presentado", 100_000), dentistId: "u4" };
    const comp: Budget = { ...bud("b2", "p2", "completado", 100_000, "2026-07-01T10:00:00.000Z"), dentistId: "u2" };
    const ch = payCheque("y1", "p2", 100_000, { cashDate: "2026-08-05" }, { budgetId: "b2" });
    const t = derivarTareas({ ...vacio, patients: [pac("p1"), pac("p2")], budgets: [pres, comp], payments: [ch] }, HOY);
    expect(t.find((x) => x.type === "captura")!.professionalId).toBe("u4");
    expect(t.find((x) => x.type === "control")!.professionalId).toBe("u2");
    expect(t.find((x) => x.type === "cheque")!.professionalId).toBe("u2");
  });
});

import {
  PLAZOS_RAPIDOS, diasDePlazo, plazoDeDias, opcionDePlazo, presupuestoIniciado,
  fechaLocal, sumarDias, esFecha, tituloFecha, fechaCorta, fechaLarga,
  filasDeTareas, bandejaDelDia, ordenarFilas, baseRecontacto, gestionarTarea, asignarTarea,
  nuevaPersonalizada, resumenGestion, type FilaTarea,
} from "./tareas";

describe("configuración de plazos (los botones de Dentalink)", () => {
  it("los botones son Inmediato · 1 día · 1 semana · 1 mes · 1 año", () => {
    expect(PLAZOS_RAPIDOS.map((x) => x.label)).toEqual(["Inmediato", "1 día", "1 semana", "1 mes", "1 año"]);
  });

  it("ida y vuelta entre días y plazo", () => {
    expect(plazoDeDias(0)).toEqual({ kind: "inmediato" });
    expect(plazoDeDias(7)).toEqual({ kind: "dias", n: 7 });
    expect(diasDePlazo({ kind: "inmediato" })).toBe(0);
    expect(diasDePlazo({ kind: "dias", n: 180 })).toBe(180);
  });

  it("lo que escribe una persona en 'otro' se redondea, se topa y la basura es inmediato", () => {
    expect(plazoDeDias(2.6)).toEqual({ kind: "dias", n: 3 });
    expect(plazoDeDias(-4)).toEqual({ kind: "inmediato" });
    expect(plazoDeDias(Number.NaN)).toEqual({ kind: "inmediato" });
    expect(plazoDeDias(99_999)).toEqual({ kind: "dias", n: 3650 });
  });

  it("marca el botón que coincide, o 'otro' — los defaults de 3 y 180 días son 'otro'", () => {
    expect(opcionDePlazo(DEFAULT_DEADLINES.cobranza)).toBe(7);
    expect(opcionDePlazo(DEFAULT_DEADLINES.cita)).toBe(0);
    expect(opcionDePlazo(DEFAULT_DEADLINES.captura)).toBe("otro");
    expect(opcionDePlazo(DEFAULT_DEADLINES.control)).toBe("otro");
    expect(opcionDePlazo({ kind: "dias", n: 365 })).toBe(365);
  });
});

describe("fechas de la bandeja", () => {
  it("fechaLocal usa el día LOCAL, no el de UTC", () => {
    // 23:30 del 30 de julio en hora local: en UTC-3 ya es 31 en UTC.
    expect(fechaLocal(new Date(2026, 6, 30, 23, 30))).toBe("2026-07-30");
  });

  it("sumarDias cruza meses y años", () => {
    expect(sumarDias("2026-07-30", 3)).toBe("2026-08-02");
    expect(sumarDias("2026-12-30", 5)).toBe("2027-01-04");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("esFecha rechaza formatos y fechas imposibles", () => {
    expect(esFecha("2026-07-30")).toBe(true);
    expect(esFecha("2026-02-31")).toBe(false);
    expect(esFecha("30/07/2026")).toBe(false);
    expect(esFecha(undefined)).toBe(false);
  });

  it("el título es como el de Dentalink: 'Martes 19 Octubre'", () => {
    expect(tituloFecha("2021-10-19")).toBe("Martes 19 Octubre");
    expect(tituloFecha("2026-07-30", HOY)).toBe("Jueves 30 Julio");
    expect(tituloFecha("2027-01-04", HOY)).toBe("Lunes 4 Enero 2027");
  });

  it("fecha corta de la fila y fecha larga para frases", () => {
    expect(fechaCorta("2026-12-01", HOY)).toBe("01 Dic");
    expect(fechaCorta("2027-01-04", HOY)).toBe("04 Ene 2027");
    expect(fechaLarga("2026-11-08", HOY)).toBe("domingo 8 de noviembre");
  });
});

/* ─── Bandeja por fecha ─── */

const quien = { id: "u5", name: "Laura Recepción" };
const AHORA = "2026-07-30T13:00:00.000Z";

/** Deriva y arma las filas en un paso, como la página. */
const filas = (input: typeof vacio & { deadlines?: import("./types").TaskDeadlines }, guardadas: MgmtTask[], hoy = HOY) =>
  filasDeTareas(derivarTareas(input, hoy), guardadas, hoy);

const conCobranza = { ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000, "2026-07-23T10:00:00.000Z")] };

describe("filasDeTareas + bandejaDelDia", () => {
  it("una derivada va en el día de su vencimiento, y solo ahí", () => {
    const f = filas(conCobranza, []);
    expect(f).toHaveLength(1);
    expect(f[0].fecha).toBe("2026-07-30"); // 23/7 + 7
    expect(f[0].estado).toBe("pendiente");
    expect(bandejaDelDia(f, HOY, HOY).delDia).toHaveLength(1);
    expect(bandejaDelDia(f, "2026-07-31", HOY).delDia).toHaveLength(0);
  });

  it("una tarea futura se ve navegando a su fecha (control a 180 días)", () => {
    const f = filas({ ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "completado", 100_000, "2026-07-01T10:00:00.000Z")], payments: [pay("y1", "p1", 100_000)] }, []);
    expect(f[0].type).toBe("control");
    expect(bandejaDelDia(f, HOY, HOY).delDia).toHaveLength(0);
    expect(bandejaDelDia(f, "2026-12-28", HOY).delDia.map((x) => x.type)).toEqual(["control"]);
  });

  it("las atrasadas se miden contra HOY y no van además en 'Tareas del día' (dos listas, como Dentalink)", () => {
    const vieja = { ...vacio, patients: [pac("p1")], budgets: [bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z")] };
    const f = filas(vieja, []);
    expect(f[0].fecha).toBe("2026-07-08");
    const hoyMismo = bandejaDelDia(f, HOY, HOY);
    expect(hoyMismo.delDia).toHaveLength(0);
    expect(hoyMismo.atrasadas).toHaveLength(1);
    // Navegar a otro día no cambia el contador de atrasadas.
    expect(bandejaDelDia(f, "2026-12-01", HOY).atrasadas).toHaveLength(1);
    // En su propio día (pasado) se la ve también.
    expect(bandejaDelDia(f, "2026-07-08", HOY).delDia).toHaveLength(1);
  });

  it("una manual sin fecha (dato viejo) flota en hoy; con fecha, va en su fecha", () => {
    const f = filas(vacio, [manual("mt1"), manual("mt2", { dueDate: "2026-08-10" })]);
    expect(f.find((x) => x.id === "mt1")!.fecha).toBe(HOY);
    expect(f.find((x) => x.id === "mt2")!.fecha).toBe("2026-08-10");
  });

  it("lo postergado con el mecanismo viejo (snoozedUntil) va en esa fecha, no desaparece", () => {
    const f = filas(conCobranza, [override("cobranza:p1", { snoozedUntil: "2026-08-15" })]);
    expect(f[0].fecha).toBe("2026-08-15");
    expect(bandejaDelDia(f, "2026-08-15", HOY).delDia).toHaveLength(1);
  });

  it("un cierre viejo (sin gestiones) sigue visible con su ✓ el día que se cerró", () => {
    const f = filas(vacio, [manual("mt1", { status: "cerrada", resolution: "contacto_posterior", updatedAt: "2026-07-25T15:00:00.000Z" })]);
    expect(f).toHaveLength(1);
    expect(f[0].estado).toBe("completada");
    expect(f[0].fecha).toBe("2026-07-25");
    expect(f[0].resolution).toBe("contacto_posterior");
  });

  it("ordenarFilas: fecha, después tipo en el orden de Dentalink, después paciente", () => {
    const fila = (id: string, fecha: string, type: MgmtTask["type"]): FilaTarea => ({ ...manual(id), type, fecha, estado: "pendiente" });
    const nombres: Record<string, string> = { a: "Zoe", b: "Ana", c: "Beto", d: "Ana" };
    const r = ordenarFilas([fila("a", HOY, "cita"), fila("b", HOY, "cita"), fila("c", HOY, "personalizada"), fila("d", "2026-07-29", "control")], (f) => nombres[f.id]);
    expect(r.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("Finalizar ▾ en una derivada (vía override)", () => {
  const opts = (extra: Partial<Parameters<typeof gestionarTarea>[1]> = {}) => ({
    accion: "recontactar" as const, hasta: "2026-08-08", quien, ahora: AHORA, hoy: HOY, clinicId: "c1", ...extra,
  });

  it("Volver a contactar: desaparece de pendientes hoy, queda ✓ hoy y vuelve pendiente en la fecha elegida", () => {
    const antes = filas(conCobranza, []);
    const r = gestionarTarea(antes[0], opts());
    expect(r.nuevo).toBe(true);
    expect(r.doc.derivedKey).toBe("cobranza:p1");
    expect(r.doc.snoozedUntil).toBe("2026-08-08");
    expect(r.doc.gestiones).toEqual([{ fecha: HOY, at: AHORA, by: "u5", byName: "Laura Recepción", accion: "recontactar", hasta: "2026-08-08", instancia: "500000" }]);

    const despues = filas(conCobranza, [r.doc]);
    const hoyDia = bandejaDelDia(despues, HOY, HOY).delDia;
    expect(hoyDia.map((x) => x.estado)).toEqual(["completada"]);
    expect(hoyDia[0].id).toBe(r.filaId);
    const nuevaFecha = bandejaDelDia(despues, "2026-08-08", HOY).delDia;
    expect(nuevaFecha.map((x) => [x.type, x.estado])).toEqual([["cobranza", "pendiente"]]);
    // La fila pendiente conserva su id: el panel no pierde la selección.
    expect(nuevaFecha[0].id).toBe(antes[0].id);
  });

  it("el mismo override se reusa: una segunda vuelta agrega otra gestión", () => {
    const r1 = gestionarTarea(filas(conCobranza, [])[0], opts());
    const enLaFecha = bandejaDelDia(filas(conCobranza, [r1.doc], "2026-08-08"), "2026-08-08", "2026-08-08").delDia.find((x) => x.estado === "pendiente")!;
    const r2 = gestionarTarea(enLaFecha, opts({ hoy: "2026-08-08", ahora: "2026-08-08T13:00:00.000Z", hasta: "2026-08-15", doc: r1.doc }));
    expect(r2.nuevo).toBe(false);
    expect(r2.doc.id).toBe(r1.doc.id);
    expect(r2.doc.gestiones).toHaveLength(2);
    expect(r2.doc.snoozedUntil).toBe("2026-08-15");
  });

  it("El paciente dice OK: cierra ESTA instancia (Aceptó) y queda ✓ hoy", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], opts({ accion: "ok", hasta: undefined }));
    expect(r.doc).toMatchObject({ status: "cerrada", resolution: "acepto", closedInstance: "500000" });
    const f = filas(conCobranza, [r.doc]);
    expect(f.filter((x) => x.estado === "pendiente")).toHaveLength(0);
    expect(bandejaDelDia(f, HOY, HOY).delDia.map((x) => x.estado)).toEqual(["completada"]);
  });

  it("…y si la situación cambia (la deuda crece), la tarea vuelve", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], opts({ accion: "ok", hasta: undefined }));
    const masDeuda = { ...conCobranza, budgets: [...conCobranza.budgets, bud("b2", "p1", "aceptado", 300_000, "2026-07-24T10:00:00.000Z")] };
    expect(filas(masDeuda, [r.doc]).filter((x) => x.estado === "pendiente")).toHaveLength(1);
  });

  it("Cerrar el caso: cierra la instancia con 'Rechazó' (respuesta negativa)", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], opts({ accion: "cerrar", hasta: undefined }));
    expect(r.doc).toMatchObject({ status: "cerrada", resolution: "rechazo", closedInstance: "500000" });
    expect(r.doc.snoozedUntil).toBeUndefined();
  });

  it("reprogramar una tarea cerrada contra OTRA instancia la reabre limpia", () => {
    const viejo = override("cobranza:p1", { status: "cerrada", resolution: "rechazo", closedInstance: "123" });
    const fila = filas(conCobranza, [viejo])[0];
    expect(fila.estado).toBe("pendiente");
    const r = gestionarTarea(fila, opts({ doc: viejo }));
    expect(r.doc).toMatchObject({ id: viejo.id, status: "pendiente", snoozedUntil: "2026-08-08" });
    expect(r.doc.closedInstance).toBeUndefined();
    expect(r.doc.resolution).toBeUndefined();
  });

  it("no acepta una fecha que no sea posterior a la de la tarea, ni trabajar una ya completada", () => {
    const fila = filas(conCobranza, [])[0];
    expect(() => gestionarTarea(fila, opts({ hasta: HOY }))).toThrow();
    expect(() => gestionarTarea(fila, opts({ hasta: "no-es-fecha" }))).toThrow();
    const r = gestionarTarea(fila, opts({ accion: "ok", hasta: undefined }));
    const hecha = filas(conCobranza, [r.doc]).find((x) => x.estado === "completada")!;
    expect(() => gestionarTarea(hecha, opts())).toThrow();
  });

  it("trabajar por adelantado una tarea futura: los 'N días más' se cuentan desde su fecha", () => {
    const futura = { fecha: "2026-12-01" } as const;
    expect(baseRecontacto(futura, HOY)).toBe("2026-12-01");
    expect(baseRecontacto({ fecha: "2026-07-01" }, HOY)).toBe(HOY);
  });

  it("lo guardado es un MgmtTask limpio: sin fecha/estado/monto de memoria ni claves undefined", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], opts());
    for (const k of ["fecha", "estado", "gestion", "instanceKey", "overrideId", "amount", "professionalId", "appointmentId"]) expect(r.doc).not.toHaveProperty(k);
    expect(Object.values(r.doc).some((v) => v === undefined)).toBe(false);
    // El createdAt del override es el del hecho (lo que el reporte llama "generada").
    expect(r.doc.createdAt).toBe("2026-07-23T10:00:00.000Z");
  });
});

describe("Finalizar ▾ en una personalizada", () => {
  const tarea = manual("mt1", { patientId: "p1", dueDate: HOY });
  const fila = () => filas(vacio, [tarea])[0];
  const opts = (accion: "ok" | "recontactar" | "cerrar", hasta?: string) => ({ accion, hasta, quien, ahora: AHORA, hoy: HOY, clinicId: "c1" });

  it("El paciente dice OK: la de hoy queda ✓ y se reactiva a la semana", () => {
    const r = gestionarTarea(fila(), opts("ok"));
    expect(r.nuevo).toBe(false);
    expect(r.doc).toMatchObject({ id: "mt1", status: "pendiente", dueDate: "2026-08-06" });
    const f = filas(vacio, [r.doc]);
    expect(bandejaDelDia(f, HOY, HOY).delDia.map((x) => x.estado)).toEqual(["completada"]);
    expect(bandejaDelDia(f, "2026-08-06", HOY).delDia.map((x) => x.estado)).toEqual(["pendiente"]);
    expect(resumenGestion(r.doc.gestiones![0], true, HOY)).toBe("El paciente dice OK · vuelve a la bandeja el jueves 6 de agosto");
  });

  it("Volver a contactar: la mueve a la fecha elegida", () => {
    const r = gestionarTarea(fila(), opts("recontactar", "2026-09-01"));
    expect(r.doc.dueDate).toBe("2026-09-01");
    expect(resumenGestion(r.doc.gestiones![0], true, HOY)).toBe("Paciente será contactado nuevamente el martes 1 de septiembre");
  });

  it("Cerrar el caso: se ejecutó", () => {
    const r = gestionarTarea(fila(), opts("cerrar"));
    expect(r.doc).toMatchObject({ status: "cerrada", resolution: "ejecutada" });
    const f = filas(vacio, [r.doc]);
    expect(f.map((x) => [x.estado, x.resolution])).toEqual([["completada", "ejecutada"]]);
    expect(resumenGestion(r.doc.gestiones![0], true)).toBe("Caso cerrado · la tarea se ejecutó");
  });

  it("una tarea postergada con el 'Postergar' viejo se reprograma sin arrastrar el snooze", () => {
    const vieja = manual("mt1", { dueDate: "2026-07-20", snoozedUntil: "2026-07-29" });
    const r = gestionarTarea(filas(vacio, [vieja])[0], opts("recontactar", "2026-08-03"));
    expect(r.doc.dueDate).toBe("2026-08-03");
    expect(r.doc.snoozedUntil).toBeUndefined();
  });
});

describe("completadas por el sistema", () => {
  it("un override huérfano que nadie cerró es 'completada por el sistema' en su fecha", () => {
    // Laura se asignó la cobranza; después el paciente pagó y la derivada dejó de producirse.
    const asignada = asignarTarea(filas(conCobranza, [])[0], "u5", { ahora: AHORA, clinicId: "c1" });
    expect(asignada.doc.dueDate).toBe(HOY);
    const pagado = { ...conCobranza, payments: [pay("y1", "p1", 500_000)] };
    const f = filas(pagado, [asignada.doc]);
    expect(f.map((x) => x.estado)).toEqual(["sistema"]);
    // Escondidas por defecto, como la casilla de Dentalink.
    expect(bandejaDelDia(f, HOY, HOY).delDia).toHaveLength(0);
    expect(bandejaDelDia(f, HOY, HOY, false).delDia.map((x) => x.estado)).toEqual(["sistema"]);
  });

  it("si la habían reprogramado, la del sistema va en la fecha nueva y la trabajada queda en la suya", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], { accion: "recontactar", hasta: "2026-08-08", quien, ahora: AHORA, hoy: HOY, clinicId: "c1" });
    const pagado = { ...conCobranza, payments: [pay("y1", "p1", 500_000)] };
    const f = filas(pagado, [r.doc]);
    expect(f.map((x) => [x.estado, x.fecha]).sort()).toEqual([["completada", HOY], ["sistema", "2026-08-08"]]);
  });

  it("una cerrada a mano cuya condición se resolvió NO cuenta como del sistema", () => {
    const r = gestionarTarea(filas(conCobranza, [])[0], { accion: "ok", quien, ahora: AHORA, hoy: HOY, clinicId: "c1" });
    const pagado = { ...conCobranza, payments: [pay("y1", "p1", 500_000)] };
    expect(filas(pagado, [r.doc]).map((x) => x.estado)).toEqual(["completada"]);
  });
});

describe("asignarTarea y nuevaPersonalizada", () => {
  it("asignar una derivada crea el override con su fecha; desasignar lo actualiza", () => {
    const fila = filas(conCobranza, [])[0];
    const a = asignarTarea(fila, "u6", { ahora: AHORA, clinicId: "c1" });
    expect(a.nuevo).toBe(true);
    expect(a.doc).toMatchObject({ derivedKey: "cobranza:p1", assigneeId: "u6", dueDate: HOY, status: "pendiente" });
    const filaAsignada = filas(conCobranza, [a.doc])[0];
    expect(filaAsignada.assigneeId).toBe("u6");
    const b = asignarTarea(filaAsignada, undefined, { ahora: AHORA, clinicId: "c1", doc: a.doc });
    expect(b.nuevo).toBe(false);
    expect(b.doc).not.toHaveProperty("assigneeId");
  });

  it("asignar una personalizada actualiza su propio doc", () => {
    const r = asignarTarea(filas(vacio, [manual("mt1")])[0], "u2", { ahora: AHORA, clinicId: "c1" });
    expect(r.nuevo).toBe(false);
    expect(r.doc).toMatchObject({ id: "mt1", assigneeId: "u2" });
    expect(r.doc).not.toHaveProperty("fecha");
  });

  it("una personalizada nueva exige detalle y fecha, y el presupuesto solo si hay paciente", () => {
    const base = { id: "mt9", clinicId: "c1", detalle: "  Agendar cita para evaluación de prótesis ", fecha: "2026-12-01", createdBy: "u5", ahora: AHORA };
    const t = nuevaPersonalizada({ ...base, patientId: "p1", budgetId: "b1" });
    expect(t).toMatchObject({ type: "personalizada", title: "Agendar cita para evaluación de prótesis", dueDate: "2026-12-01", patientId: "p1", budgetId: "b1", status: "pendiente" });
    expect(nuevaPersonalizada({ ...base, budgetId: "b1" })).not.toHaveProperty("budgetId");
    expect(() => nuevaPersonalizada({ ...base, detalle: "   " })).toThrow();
    expect(() => nuevaPersonalizada({ ...base, fecha: "" })).toThrow();
  });

  it("resumen de las automáticas", () => {
    const g = { fecha: HOY, at: AHORA, by: "u5", byName: "Laura", accion: "ok" as const };
    expect(resumenGestion(g, false)).toBe("El paciente dice OK");
    expect(resumenGestion({ ...g, accion: "cerrar" }, false)).toBe("Caso cerrado · respuesta negativa del paciente");
  });
});

describe("tareas propias que se tachan solas (autoCierre)", () => {
  const propia = (id: string, extra: Partial<MgmtTask> = {}) =>
    manual(id, { patientId: "p1", dueDate: "2026-08-03", autoCierre: { evento: "pago", desde: HOY }, ...extra });

  it("sin `cumplidas` la propia sigue pendiente: nadie le dijo que se cumplió", () => {
    expect(filasDeTareas([], [propia("mt1")], HOY).map((x) => x.estado)).toEqual(["pendiente"]);
  });

  it("cumplida: una sola fila «sistema», con su mismo id y en su día", () => {
    const f = filasDeTareas([], [propia("mt1")], HOY, new Set(["mt1"]));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "mt1", estado: "sistema", fecha: "2026-08-03", status: "cerrada", autoCierre: { evento: "pago" } });
  });

  it("la cumplida no cuenta como atrasada aunque su día ya pasó", () => {
    const vieja = propia("mt1", { dueDate: "2026-07-20" });
    expect(bandejaDelDia(filasDeTareas([], [vieja], HOY), HOY, HOY).atrasadas).toHaveLength(1);
    expect(bandejaDelDia(filasDeTareas([], [vieja], HOY, new Set(["mt1"])), HOY, HOY).atrasadas).toHaveLength(0);
  });

  it("las del sistema se esconden de «Tareas del día» salvo que se pidan", () => {
    const f = filasDeTareas([], [propia("mt1")], HOY, new Set(["mt1"]));
    expect(bandejaDelDia(f, "2026-08-03", HOY).delDia).toHaveLength(0);
    expect(bandejaDelDia(f, "2026-08-03", HOY, false).delDia.map((x) => x.estado)).toEqual(["sistema"]);
  });

  it("una cerrada a mano figura como completada, no como del sistema, aunque la condición se cumpla", () => {
    const cerrada = propia("mt1", {
      status: "cerrada", resolution: "ejecutada",
      gestiones: [{ fecha: HOY, at: AHORA, by: "u5", byName: "Laura", accion: "cerrar" }],
    });
    expect(filasDeTareas([], [cerrada], HOY, new Set(["mt1"])).map((x) => x.estado)).toEqual(["completada"]);
  });

  it("`nuevaPersonalizada` guarda el autoCierre solo si hay paciente", () => {
    const base = { id: "mt9", clinicId: "c1", detalle: "Llamar por el presupuesto", fecha: "2026-12-01", createdBy: "u5", ahora: AHORA };
    const autoCierre = { evento: "presupuesto" as const, desde: HOY, budgetId: "b1" };
    expect(nuevaPersonalizada({ ...base, patientId: "p1", autoCierre })).toMatchObject({ autoCierre });
    expect(nuevaPersonalizada({ ...base, autoCierre })).not.toHaveProperty("autoCierre");
  });
});
