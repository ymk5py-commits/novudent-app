import { describe, it, expect } from "vitest";
import { estadisticasTareas, lineasDeTareas, reporteTareas, resultadoGestion, COLUMNAS_REPORTE_TAREAS, type LineaTarea } from "./tareas-reportes";
import { derivarTareas, filasDeTareas, gestionarTarea, asignarTarea, etiquetaMes } from "./tareas";
import type { Appointment, Budget, MgmtTask, Patient, Payment, TaskGestion } from "./types";

const HOY = "2026-07-30";
const AHORA = "2026-07-30T13:00:00.000Z";
const laura = { id: "u5", name: "Laura Recepción" };
const marta = { id: "u6", name: "Marta Caja" };

const pac = (id: string): Patient => ({ id, clinicId: "c1", firstName: "Ana", lastName: id, document: "1", phone: "0981", forms: [], historyUpdatePending: false, emr: [] });
const bud = (id: string, patientId: string, status: Budget["status"], monto: number, createdAt = "2026-07-10T10:00:00.000Z"): Budget => ({
  id, clinicId: "c1", patientId, dentistId: "u2", createdAt, status,
  items: [{ id: `${id}i`, cpt: "D001", description: "Prestación", price: monto, status: "pendiente" }], history: [],
});
const pay = (id: string, patientId: string, amount: number, budgetId?: string): Payment => ({
  id, clinicId: "c1", patientId, budgetId, date: "2026-07-31T10:00:00.000Z", amount, method: "efectivo", concept: "Pago", receivedBy: "u6",
});
const cita = (id: string, patientId: string, start: string, status: Appointment["status"]): Appointment => ({
  id, clinicId: "c1", patientId, dentistId: "u2", title: "Consulta", start, end: start, status, amount: 0, discount: 0,
});

type Base = { patients: Patient[]; budgets: Budget[]; payments: Payment[]; appointments: Appointment[] };
/** Trabaja la primera tarea pendiente de `tipo` y devuelve los docs guardados. */
function trabajar(base: Base, docs: MgmtTask[], tipo: MgmtTask["type"], accion: "ok" | "recontactar" | "cerrar", quien = laura, hasta?: string, ahora = AHORA, hoy = HOY): MgmtTask[] {
  const fila = filasDeTareas(derivarTareas(base, hoy), docs, hoy).find((f) => f.type === tipo && f.estado === "pendiente")!;
  const doc = fila.overrideId ? docs.find((d) => d.id === fila.overrideId) : undefined;
  const r = gestionarTarea(fila, { accion, hasta, quien, ahora, hoy, clinicId: "c1", doc });
  return r.nuevo ? [r.doc, ...docs] : docs.map((d) => (d.id === r.doc.id ? r.doc : d));
}

describe("estadisticasTareas — los contadores de Dentalink", () => {
  const base: Base = {
    patients: [pac("p1"), pac("p2"), pac("p3"), pac("p4")],
    budgets: [
      bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z"),    // cobranza p1
      bud("b2", "p2", "presentado", 300_000, "2026-07-20T10:00:00.000Z"),  // captura p2
      bud("b3", "p3", "completado", 100_000, "2026-07-02T10:00:00.000Z"),  // control p3 (pagado)
    ],
    payments: [pay("y3", "p3", 100_000, "b3")],
    appointments: [cita("a1", "p4", "2026-07-29T10:00:00.000Z", "ausente")], // re-agenda p4
  };

  it("sin gestiones no hay casos: lo que nadie trabajó no se mide", () => {
    const e = estadisticasTareas({ ...base, mgmtTasks: [] }, { tipo: "historico" });
    expect(Object.values(e.contadores).every((c) => c.casos === 0 && c.exitos === 0)).toBe(true);
    expect(e.usuarios).toEqual([]);
  });

  it("cuenta los casos trabajados y los éxitos según cómo están HOY", () => {
    let docs: MgmtTask[] = [];
    // El control vence a fin de año (180 días): "volver a contactar" nunca adelanta una tarea,
    // así que la fecha nueva tiene que ser posterior a todas.
    for (const tipo of ["cobranza", "captura", "control", "cita"] as const) docs = trabajar(base, docs, tipo, "recontactar", laura, "2027-01-15");
    // Después: p1 paga todo, p2 acepta, p3 agenda control, p4 no hace nada.
    const despues = {
      ...base,
      budgets: base.budgets.map((b) => (b.id === "b2" ? { ...b, status: "aceptado" as const } : b)),
      payments: [...base.payments, pay("y1", "p1", 500_000, "b1")],
      appointments: [...base.appointments, cita("a2", "p3", "2026-08-20T10:00:00.000Z", "pendiente")],
    };
    const e = estadisticasTareas({ ...despues, mgmtTasks: docs }, { tipo: "historico" });
    expect(e.contadores).toEqual({
      cobranza: { casos: 1, exitos: 1 },
      captura: { casos: 1, exitos: 1 },
      control: { casos: 1, exitos: 1 },
      cita: { casos: 1, exitos: 0 },
    });
  });

  it("'Citas re-agendadas' no cuenta las llamadas de confirmación (cita sin confirmar)", () => {
    const conf: Base = { ...base, appointments: [cita("a9", "p1", "2026-07-31T10:00:00.000Z", "pendiente")] };
    const docs = trabajar(conf, [], "cita", "ok");
    expect(docs[0].gestiones![0].instancia).toBe("a9");
    const e = estadisticasTareas({ ...conf, mgmtTasks: docs }, { tipo: "historico" });
    expect(e.contadores.cita.casos).toBe(0);
    // …pero la participación del usuario sí la cuenta.
    expect(e.usuarios[0].porTipo.cita).toBe(1);
  });

  it("dos vueltas del mismo caso son UN caso, y dos usuarios que lo trabajaron cuentan cada uno una vez", () => {
    let docs = trabajar(base, [], "cobranza", "recontactar", laura, "2026-08-05");
    docs = trabajar(base, docs, "cobranza", "recontactar", marta, "2026-08-12", "2026-08-05T13:00:00.000Z", "2026-08-05");
    docs = trabajar(base, docs, "cobranza", "recontactar", laura, "2026-08-19", "2026-08-12T13:00:00.000Z", "2026-08-12");
    const e = estadisticasTareas({ ...base, mgmtTasks: docs }, { tipo: "historico" });
    expect(e.contadores.cobranza.casos).toBe(1);
    expect(e.usuarios.map((u) => [u.nombre, u.porTipo.cobranza, u.total])).toEqual([["Laura Recepción", 1, 1], ["Marta Caja", 1, 1]]);
  });

  it("si la deuda cambió entre una gestión y otra, son dos casos (dos deudas distintas)", () => {
    let docs = trabajar(base, [], "cobranza", "ok");
    const otraDeuda = { ...base, budgets: [...base.budgets, bud("b9", "p1", "aceptado", 200_000, "2026-07-15T10:00:00.000Z")] };
    docs = trabajar(otraDeuda, docs, "cobranza", "cerrar", marta);
    expect(estadisticasTareas({ ...otraDeuda, mgmtTasks: docs }, { tipo: "historico" }).contadores.cobranza.casos).toBe(2);
  });

  it("'Por mes' filtra por el mes de la gestión", () => {
    const docs = trabajar(base, [], "captura", "cerrar");
    expect(estadisticasTareas({ ...base, mgmtTasks: docs }, { tipo: "mes", mes: "2026-07" }).contadores.captura.casos).toBe(1);
    expect(estadisticasTareas({ ...base, mgmtTasks: docs }, { tipo: "mes", mes: "2026-08" }).contadores.captura.casos).toBe(0);
  });

  it("usuarios de más a menos casos, con las personalizadas en la cuenta", () => {
    let docs = trabajar(base, [], "captura", "cerrar", marta);
    const pers: MgmtTask = { id: "mt1", clinicId: "c1", type: "personalizada", title: "Llamar", status: "pendiente", dueDate: HOY, createdAt: AHORA };
    docs = trabajar(base, [pers, ...docs], "personalizada", "ok", laura);
    docs = trabajar(base, docs, "control", "ok", laura);
    const e = estadisticasTareas({ ...base, mgmtTasks: docs }, { tipo: "historico" });
    expect(e.usuarios.map((u) => [u.nombre, u.total])).toEqual([["Laura Recepción", 2], ["Marta Caja", 1]]);
    expect(e.usuarios[0].porTipo).toEqual({ personalizada: 1, control: 1 });
  });

  it("etiqueta del botón 'Por mes'", () => {
    expect(etiquetaMes("2021-10")).toBe("Oct 2021");
  });
});

describe("lineasDeTareas + reporteTareas (Reportes Excel → CRM)", () => {
  const base: Base = {
    patients: [pac("p1"), pac("p2")],
    budgets: [bud("b1", "p1", "aceptado", 500_000, "2026-07-01T10:00:00.000Z"), bud("b2", "p2", "presentado", 300_000, "2026-07-20T10:00:00.000Z")],
    payments: [],
    appointments: [],
  };
  const nombres = { paciente: (l: LineaTarea) => l.patientId ?? l.patientName ?? "—", usuario: (id?: string) => ({ u5: "Laura Recepción", u2: "Dra. Sofía" } as Record<string, string>)[id ?? ""] ?? "?" };
  const lineas = (docs: MgmtTask[], b = base) => lineasDeTareas(derivarTareas(b, HOY), docs, HOY);

  it("una línea por tarea, con generada = el hecho y vence = su día en la bandeja", () => {
    const l = lineas([]);
    expect(l.map((x) => [x.type, x.generada, x.vence, x.estado])).toEqual([
      ["cobranza", "2026-07-01", "2026-07-08", "Pendiente"],
      ["captura", "2026-07-20", "2026-07-23", "Pendiente"],
    ]);
  });

  it("generadas: filtra por la fecha de generación, rango inclusivo", () => {
    const filas = reporteTareas("generadas", lineas([]), { desde: "2026-07-20", hasta: "2026-07-20" }, nombres);
    expect(filas[0]).toEqual(COLUMNAS_REPORTE_TAREAS);
    expect(filas.slice(1).map((r) => r[0])).toEqual(["Captura"]);
  });

  it("a vencer: solo las pendientes cuya fecha cae en el rango (lo reprogramado, en su fecha nueva)", () => {
    const docs = trabajar(base, [], "cobranza", "recontactar", laura, "2026-08-15");
    const l = lineas(docs);
    expect(reporteTareas("a_vencer", l, { desde: "2026-08-01", hasta: "2026-08-31" }, nombres).slice(1).map((r) => [r[0], r[6]])).toEqual([["Cobranza", "2026-08-15"]]);
    const cerrada = trabajar(base, [], "captura", "cerrar");
    expect(reporteTareas("a_vencer", lineas(cerrada), { desde: "2026-07-01", hasta: "2026-07-31" }, nombres).slice(1).map((r) => r[0])).toEqual(["Cobranza"]);
  });

  it("trae responsable, última gestión, quién y el resultado", () => {
    const docs = trabajar(base, [], "cobranza", "recontactar", laura, "2026-08-15");
    const fila = reporteTareas("generadas", lineas(docs), { desde: "2026-07-01", hasta: "2026-07-31" }, nombres).find((r) => r[0] === "Cobranza")!;
    expect(fila).toEqual(["Cobranza", "p1", "Dra. Sofía", "Saldo pendiente de pago", "", "2026-07-01", "2026-08-15", "Pendiente", "No asignado", HOY, "Laura Recepción", "Volver a contactar el 2026-08-15", 500_000]);
  });

  it("una cerrada dice cómo; una que se resolvió sola dice 'Completada por el sistema'", () => {
    let docs = trabajar(base, [], "captura", "cerrar");
    const fila0 = filasDeTareas(derivarTareas(base, HOY), docs, HOY).find((f) => f.type === "cobranza")!;
    docs = [asignarTarea(fila0, "u5", { ahora: AHORA, clinicId: "c1" }).doc, ...docs];
    const pagado = { ...base, payments: [pay("y1", "p1", 500_000, "b1")] };
    const estados = reporteTareas("generadas", lineas(docs, pagado), { desde: "2026-01-01", hasta: "2026-12-31" }, nombres).slice(1).map((r) => [r[0], r[7], r[8]]);
    expect(estados).toEqual([["Cobranza", "Completada por el sistema", "Laura Recepción"], ["Captura", "Cerrada · Rechazó", "No asignado"]]);
  });

  it("una personalizada sin paciente sale con el nombre guardado o el guion", () => {
    const pers: MgmtTask = { id: "mt1", clinicId: "c1", type: "personalizada", title: "Pedir autoclave", status: "pendiente", createdAt: "2026-07-29T10:00:00.000Z" };
    const r = reporteTareas("generadas", lineas([pers], { ...base, budgets: [] }), { desde: "2026-07-29", hasta: "2026-07-29" }, nombres);
    expect(r.slice(1).map((x) => [x[0], x[1], x[3], x[6]])).toEqual([["Personalizada", "—", "Pedir autoclave", HOY]]);
  });

  it("resultadoGestion en palabras", () => {
    const g: TaskGestion = { fecha: HOY, at: AHORA, by: "u5", byName: "Laura", accion: "ok" };
    expect(resultadoGestion(undefined)).toBe("");
    expect(resultadoGestion(g)).toBe("El paciente dice OK");
    expect(resultadoGestion({ ...g, accion: "cerrar" })).toBe("Caso cerrado");
  });
});
