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
