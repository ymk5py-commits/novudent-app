import { describe, it, expect } from "vitest";
import {
  crearAutoCierre, autoCierreCumplido, tareasCumplidas, reabrirTarea, motivoCumplido, etiquetaAutoCierre,
  type DatosAuto,
} from "./tareasAuto";
import type { AutoCierre, MgmtTask, TaskGestion } from "./types";

const HOY = "2026-10-06";
// Mediodía LOCAL del día pedido: es ese día en el huso de quien corra el test.
const dia = (d: string) => {
  const [y, m, n] = d.split("-").map(Number);
  return new Date(y, m - 1, n, 12).toISOString();
};

const cita = (id: string, patientId: string, d: string, status = "pendiente") => ({ id, patientId, start: dia(d), status }) as DatosAuto["appointments"][number];
const plan = (id: string, status: string) => ({ id, status }) as DatosAuto["budgets"][number];
const pago = (patientId: string, d: string, voidedAt?: string) => ({ patientId, date: dia(d), ...(voidedAt ? { voidedAt } : {}) }) as DatosAuto["payments"][number];
const vacio: DatosAuto = { appointments: [], budgets: [], payments: [] };

describe("crearAutoCierre — la foto del estado al crear la tarea", () => {
  it("«pago» solo guarda desde qué día se espera", () => {
    expect(crearAutoCierre({ evento: "pago", patientId: "p1", hoy: HOY, appointments: [] })).toEqual({ evento: "pago", desde: HOY });
  });

  it("«presupuesto» guarda cuál y exige elegirlo", () => {
    expect(crearAutoCierre({ evento: "presupuesto", patientId: "p1", hoy: HOY, appointments: [], budgetId: "b1" }))
      .toEqual({ evento: "presupuesto", desde: HOY, budgetId: "b1" });
    expect(() => crearAutoCierre({ evento: "presupuesto", patientId: "p1", hoy: HOY, appointments: [] })).toThrow(/presupuesto/);
  });

  it("«cita» anota las citas de hoy en adelante que el paciente ya tenía, y solo esas", () => {
    const r = crearAutoCierre({
      evento: "cita", patientId: "p1", hoy: HOY,
      appointments: [
        cita("a_futura", "p1", "2026-10-09"),
        cita("a_hoy", "p1", HOY, "confirmada"),
        cita("a_cancelada", "p1", "2026-10-10", "cancelada"),
        cita("a_ausente", "p1", "2026-10-11", "ausente"),
        cita("a_pasada", "p1", "2026-09-01", "completada"),
        cita("a_otro", "p2", "2026-10-09"),
      ],
    });
    expect(r).toEqual({ evento: "cita", desde: HOY, previas: ["a_futura", "a_hoy"] });
  });

  it("«cita» sin citas previas guarda la lista vacía (no la omite)", () => {
    expect(crearAutoCierre({ evento: "cita", patientId: "p1", hoy: HOY, appointments: [] }).previas).toEqual([]);
  });
});

describe("autoCierreCumplido — presupuesto", () => {
  const a: AutoCierre = { evento: "presupuesto", desde: HOY, budgetId: "b1" };
  it.each([
    ["presentado", false], ["aceptado", true], ["completado", true], ["rechazado", false], ["anulado", false],
  ])("plan %s → %s", (status, esperado) => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, budgets: [plan("b1", status)] })).toBe(esperado);
  });
  it("un plan que ya no existe no la cumple", () => {
    expect(autoCierreCumplido(a, "p1", vacio)).toBe(false);
  });
  it("aceptar OTRO plan no cumple esta tarea", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, budgets: [plan("b1", "presentado"), plan("b2", "aceptado")] })).toBe(false);
  });
});

describe("autoCierreCumplido — pago", () => {
  const a: AutoCierre = { evento: "pago", desde: HOY };
  it("un pago de antes de crear la tarea no la cumple", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, payments: [pago("p1", "2026-10-05")] })).toBe(false);
  });
  it("un pago de hoy en adelante la cumple", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, payments: [pago("p1", HOY)] })).toBe(true);
    expect(autoCierreCumplido(a, "p1", { ...vacio, payments: [pago("p1", "2026-10-20")] })).toBe(true);
  });
  it("un pago anulado no cuenta: anular el pago la reabre", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, payments: [pago("p1", HOY, "2026-10-06T15:00:00.000Z")] })).toBe(false);
  });
  it("el pago de otro paciente no cuenta", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, payments: [pago("p2", HOY)] })).toBe(false);
  });
});

describe("autoCierreCumplido — cita", () => {
  const a: AutoCierre = { evento: "cita", desde: HOY, previas: ["a_vieja"] };
  it("una cita nueva del paciente la cumple", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-12")] })).toBe(true);
  });
  it("la cita que ya tenía al crear la tarea no cuenta", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_vieja", "p1", "2026-10-12")] })).toBe(false);
  });
  it("cancelada o ausente no es haber agendado", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-12", "cancelada")] })).toBe(false);
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-12", "ausente")] })).toBe(false);
  });
  it("cancelar la cita nueva reabre la tarea", () => {
    const antes = { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-12", "confirmada")] };
    const despues = { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-12", "cancelada")] };
    expect([autoCierreCumplido(a, "p1", antes), autoCierreCumplido(a, "p1", despues)]).toEqual([true, false]);
  });
  it("una cita de antes de crear la tarea no cuenta, aunque su id no esté en `previas`", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_pasada", "p1", "2026-09-01", "completada")] })).toBe(false);
  });
  it("sigue cumplida cuando la cita nueva ya se hizo", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_nueva", "p1", "2026-10-08", "completada")] })).toBe(true);
  });
  it("la cita de otro paciente no cuenta", () => {
    expect(autoCierreCumplido(a, "p1", { ...vacio, appointments: [cita("a_nueva", "p2", "2026-10-12")] })).toBe(false);
  });
  it("sin `previas` (dato incompleto) cualquier cita desde ese día cuenta", () => {
    expect(autoCierreCumplido({ evento: "cita", desde: HOY }, "p1", { ...vacio, appointments: [cita("x", "p1", "2026-10-12")] })).toBe(true);
  });
});

describe("tareasCumplidas — qué tareas guardadas se tachan solas", () => {
  const base = (o: Partial<MgmtTask>): MgmtTask => ({
    id: "t", clinicId: "c", type: "personalizada", title: "x", status: "pendiente", createdAt: "2026-10-06T10:00:00.000Z",
    patientId: "p1", autoCierre: { evento: "pago", desde: HOY }, ...o,
  });
  const datos: DatosAuto = { ...vacio, payments: [pago("p1", HOY)] };

  it("devuelve el id de la manual abierta con paciente cuya condición se cumple", () => {
    expect([...tareasCumplidas([base({ id: "t1" })], datos)]).toEqual(["t1"]);
  });
  it("ignora la que no tiene `autoCierre`", () => {
    expect(tareasCumplidas([base({ autoCierre: undefined })], datos).size).toBe(0);
  });
  it("ignora la que no tiene paciente", () => {
    expect(tareasCumplidas([base({ patientId: undefined })], datos).size).toBe(0);
  });
  it("ignora la que alguien ya cerró a mano", () => {
    expect(tareasCumplidas([base({ status: "cerrada" })], datos).size).toBe(0);
  });
  it("ignora los overrides de las automáticas", () => {
    expect(tareasCumplidas([base({ derivedKey: "cobranza:p1" })], datos).size).toBe(0);
  });
  it("no incluye la que todavía no se cumplió", () => {
    expect(tareasCumplidas([base({})], vacio).size).toBe(0);
  });
});

describe("reabrirTarea — destildar", () => {
  const cerrar = (at: string): TaskGestion => ({ fecha: HOY, at, by: "u1", byName: "Ana", accion: "cerrar" });
  const cerrada = (o: Partial<MgmtTask> = {}): MgmtTask => ({
    id: "t1", clinicId: "c", type: "personalizada", title: "Llamar", status: "cerrada", resolution: "ejecutada",
    dueDate: HOY, createdAt: "2026-10-05T10:00:00.000Z", gestiones: [cerrar("2026-10-06T14:00:00.000Z")], ...o,
  });
  const AHORA = "2026-10-06T15:00:00.000Z";

  it("saca la gestión «Se ejecutó» y la deja pendiente, sin resolución", () => {
    const r = reabrirTarea(cerrada(), AHORA);
    expect(r.status).toBe("pendiente");
    expect(r.resolution).toBeUndefined();
    expect(r.gestiones).toEqual([]);
    expect(r.updatedAt).toBe(AHORA);
    expect(r.dueDate).toBe(HOY);
  });
  it("conserva las gestiones anteriores", () => {
    const antes: TaskGestion = { fecha: "2026-10-01", at: "2026-10-01T09:00:00.000Z", by: "u1", byName: "Ana", accion: "ok", hasta: "2026-10-08" };
    const r = reabrirTarea(cerrada({ gestiones: [antes, cerrar("2026-10-06T14:00:00.000Z")] }), AHORA);
    expect(r.gestiones).toEqual([antes]);
  });
  it("una cerrada de antes de las gestiones (sin gestiones) también se reabre", () => {
    const r = reabrirTarea(cerrada({ gestiones: undefined }), AHORA);
    expect(r.status).toBe("pendiente");
  });
  it("no toca el doc original", () => {
    const original = cerrada();
    reabrirTarea(original, AHORA);
    expect(original.status).toBe("cerrada");
    expect(original.gestiones).toHaveLength(1);
  });
  it("una automática (override) no se reabre desde acá", () => {
    expect(() => reabrirTarea(cerrada({ derivedKey: "cobranza:p1" }), AHORA)).toThrow(/propia/);
  });
  it("una tarea pendiente no se reabre", () => {
    expect(() => reabrirTarea(cerrada({ status: "pendiente" }), AHORA)).toThrow(/cerrada/);
  });
});

describe("textos", () => {
  it("el motivo dice qué pasó", () => {
    expect(motivoCumplido({ evento: "presupuesto", desde: HOY, budgetId: "b" })).toMatch(/aceptó el presupuesto/);
    expect(motivoCumplido({ evento: "pago", desde: HOY })).toMatch(/pago/);
    expect(motivoCumplido({ evento: "cita", desde: HOY })).toMatch(/agendó/);
  });
  it("la etiqueta dice qué espera la tarea", () => {
    expect(etiquetaAutoCierre({ evento: "presupuesto", desde: HOY, budgetId: "b" })).toBe("Se tacha sola cuando acepte el presupuesto");
    expect(etiquetaAutoCierre({ evento: "pago", desde: HOY })).toBe("Se tacha sola cuando registre un pago");
    expect(etiquetaAutoCierre({ evento: "cita", desde: HOY })).toBe("Se tacha sola cuando agende una cita");
  });
});
