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

  it.each(["confirmada", "en_atencion", "completada", "cancelada", "ausente"] as const)(
    "NO abre para una cita en estado %s — auto-cierre al confirmar",
    (status) => {
      const t = derivarTareas({ ...vacio, patients: [pac("p1")], appointments: [cita("a1", "p1", "2026-07-31T10:00:00.000Z", status)] }, HOY);
      expect(t.filter((x) => x.type === "cita")).toHaveLength(0);
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
