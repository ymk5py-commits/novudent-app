import { describe, it, expect } from "vitest";
import {
  rangoDe, esMia, itemsDeTareas, rutinaDeHoy, armarAgenda, linkTarea, recortarAgenda, pestanaPorTecla,
  AMBITOS, MAX_PENDIENTES_TODAS, type Ambito, type DatosRutina, type ItemAgenda,
} from "./miAgenda";
import { sumarDias, type FilaTarea } from "./tareas";
import type { Permission } from "./rbac";

const HOY = "2026-10-06"; // martes
const YO = "u1";
const OTRO = "u2";

// Mediodía LOCAL del día pedido (es ese día en el huso de quien corra el test).
const dia = (d: string) => {
  const [y, m, n] = d.split("-").map(Number);
  return new Date(y, m - 1, n, 12).toISOString();
};

const fila = (o: Partial<FilaTarea> & { id: string }): FilaTarea => ({
  clinicId: "c1", type: "personalizada", title: "Llamar al proveedor", status: "pendiente",
  createdAt: "2026-10-01T10:00:00.000Z", createdBy: YO, fecha: HOY, estado: "pendiente", ...o,
}) as FilaTarea;

const gestion = (accion: "ok" | "cerrar" | "recontactar") => ({ fecha: HOY, at: "2026-10-06T14:00:00.000Z", by: YO, byName: "Ana", accion });

describe("rangoDe", () => {
  it("«hoy» es el día", () => {
    expect(rangoDe("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
  });
  it("«semana» va de lunes a domingo", () => {
    const esperado = { desde: "2026-10-05", hasta: "2026-10-11" };
    expect(rangoDe("semana", "2026-10-06")).toEqual(esperado); // martes
    expect(rangoDe("semana", "2026-10-05")).toEqual(esperado); // lunes
    expect(rangoDe("semana", "2026-10-11")).toEqual(esperado); // domingo
  });
  it("la semana cruza fin de mes y de año", () => {
    expect(rangoDe("semana", "2026-09-30")).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
    expect(rangoDe("semana", "2027-01-01")).toEqual({ desde: "2026-12-28", hasta: "2027-01-03" });
  });
  it("«todas» abarca cualquier fecha, la de hoy no importa", () => {
    for (const hoy of [HOY, "2027-03-01"]) {
      const { desde, hasta } = rangoDe("todas", hoy);
      for (const d of ["1900-01-01", "2020-02-29", "2026-10-06", "2026-12-31", "2099-12-31"]) expect(d >= desde && d <= hasta, d).toBe(true);
    }
  });
});

describe("esMia — qué tarea me toca", () => {
  it("la propia que creé y no delegué", () => {
    expect(esMia(fila({ id: "t", createdBy: YO }), YO)).toBe(true);
  });
  it("la propia que creó otro y no tiene responsable no es mía", () => {
    expect(esMia(fila({ id: "t", createdBy: OTRO }), YO)).toBe(false);
  });
  it("la que otro creó y me asignó a mí sí", () => {
    expect(esMia(fila({ id: "t", createdBy: OTRO, assigneeId: YO }), YO)).toBe(true);
  });
  it("la que creé y delegué en otro ya no es mía", () => {
    expect(esMia(fila({ id: "t", createdBy: YO, assigneeId: OTRO }), YO)).toBe(false);
  });
  it("una automática solo es mía si me la asignaron", () => {
    const auto = { derivedKey: "cobranza:p1", createdBy: undefined };
    expect(esMia(fila({ id: "d", ...auto }), YO)).toBe(false);
    expect(esMia(fila({ id: "d", ...auto, assigneeId: YO }), YO)).toBe(true);
    expect(esMia(fila({ id: "d", ...auto, assigneeId: OTRO }), YO)).toBe(false);
  });
});

describe("itemsDeTareas", () => {
  const ver = (filas: FilaTarea[], ambito: Ambito = "hoy") =>
    itemsDeTareas(filas, { yo: YO, hoy: HOY, rango: rangoDe(ambito, HOY), nombrePaciente: (f) => (f.patientId ? "Ana Pérez" : undefined) });

  it("una pendiente de hoy se puede tildar", () => {
    const [i] = ver([fila({ id: "t1" })]);
    expect(i).toMatchObject({ id: "propia:t1", origen: "propia", titulo: "Llamar al proveedor", fecha: HOY, hecha: false, atrasada: false, accion: "tildar" });
  });

  it("una pendiente de ayer es atrasada y se ve hoy y en la semana", () => {
    const f = fila({ id: "t1", fecha: "2026-10-05" });
    expect(ver([f])[0]).toMatchObject({ atrasada: true, hecha: false });
    expect(ver([f], "semana")[0]).toMatchObject({ atrasada: true });
    // Aunque sea de la semana pasada.
    expect(ver([fila({ id: "t2", fecha: "2026-09-20" })], "semana")[0].atrasada).toBe(true);
  });

  it("una de mañana no está en «hoy» pero sí en la semana", () => {
    const f = fila({ id: "t1", fecha: "2026-10-07" });
    expect(ver([f])).toHaveLength(0);
    expect(ver([f], "semana").map((i) => i.fecha)).toEqual(["2026-10-07"]);
  });

  it("una de la semana que viene no está ni en «hoy» ni en la semana", () => {
    const f = fila({ id: "t1", fecha: "2026-10-12" });
    expect(ver([f])).toHaveLength(0);
    expect(ver([f], "semana")).toHaveLength(0);
  });

  it("la que cerré con «se ejecutó» está hecha a mano y se puede destildar", () => {
    const f = fila({ id: "t1@x", estado: "completada", status: "cerrada", gestion: gestion("cerrar") });
    expect(ver([f])[0]).toMatchObject({ hecha: true, hechaPor: "mano", accion: "destildar" });
  });

  it("una completada con «OK» (se reactiva a la semana) no se destilda desde acá", () => {
    const f = fila({ id: "t1@x", estado: "completada", status: "cerrada", gestion: gestion("ok") });
    const [i] = ver([f]);
    expect(i).toMatchObject({ hecha: true, hechaPor: "mano" });
    expect(i.accion).toBeUndefined();
  });

  it("la que se tachó sola está hecha por el sistema y no tiene casillero", () => {
    const f = fila({ id: "t1", estado: "sistema", status: "cerrada", patientId: "p1", autoCierre: { evento: "pago", desde: HOY } });
    const [i] = ver([f]);
    expect(i).toMatchObject({ hecha: true, hechaPor: "sola" });
    expect(i.accion).toBeUndefined();
  });

  it("una pendiente con «se tacha sola» dice qué espera; una hecha ya no", () => {
    const auto = { patientId: "p1", autoCierre: { evento: "presupuesto" as const, desde: HOY, budgetId: "b1" } };
    expect(ver([fila({ id: "t1", ...auto })])[0].leyenda).toBe("Se tacha sola cuando acepte el presupuesto");
    expect(ver([fila({ id: "t2", ...auto, estado: "sistema", status: "cerrada" })])[0].leyenda).toBeUndefined();
  });

  it("lleva el paciente cuando lo tiene", () => {
    expect(ver([fila({ id: "t1", patientId: "p1" })])[0].paciente).toEqual({ id: "p1", nombre: "Ana Pérez" });
    expect(ver([fila({ id: "t2" })])[0].paciente).toBeUndefined();
  });

  it("una automática asignada a mí es de solo lectura y lleva a la bandeja", () => {
    const f = fila({ id: "d_cobranza:p1", derivedKey: "cobranza:p1", type: "cobranza", title: "Saldo pendiente de pago", createdBy: undefined, assigneeId: YO, patientId: "p1" });
    const [i] = ver([f]);
    expect(i).toMatchObject({ origen: "automatica", hecha: false });
    expect(i.accion).toBeUndefined();
    expect(i.href).toBe(`/app/tareas?fecha=${HOY}&tarea=${encodeURIComponent("d_cobranza:p1")}`);
  });

  it("una automática que se resolvió sola estando asignada a mí figura hecha", () => {
    const f = fila({ id: "s_ov1", derivedKey: "cobranza:p1", type: "cobranza", createdBy: undefined, assigneeId: YO, estado: "sistema", status: "cerrada" });
    expect(ver([f])[0]).toMatchObject({ origen: "automatica", hecha: true, hechaPor: "sola" });
  });

  it("solo las propias se pueden eliminar; las automáticas de la bandeja no", () => {
    expect(ver([fila({ id: "t1" })])[0].eliminable).toBe(true);
    expect(ver([fila({ id: "t2@x", estado: "completada", status: "cerrada", gestion: gestion("cerrar") })])[0].eliminable).toBe(true);
    const auto = fila({ id: "d_cobranza:p1", derivedKey: "cobranza:p1", type: "cobranza", createdBy: undefined, assigneeId: YO });
    expect(ver([auto])[0].eliminable).toBeUndefined();
  });

  it("las tareas de otras personas no aparecen", () => {
    expect(ver([fila({ id: "t1", createdBy: OTRO })])).toHaveLength(0);
  });

  it("con «todas» trae mis pendientes de cualquier fecha —vencidas, de hoy, de la semana que viene y de dentro de un año—, pero no las de otros", () => {
    const r = ver([
      fila({ id: "vieja", fecha: "2025-03-01" }),
      fila({ id: "hoy" }),
      fila({ id: "proxima", fecha: "2026-10-20" }),
      fila({ id: "lejana", fecha: "2027-10-06" }),
      fila({ id: "ajena", fecha: "2026-10-20", createdBy: OTRO }),
    ], "todas");
    expect(r.map((i) => i.id).sort()).toEqual(["propia:hoy", "propia:lejana", "propia:proxima", "propia:vieja"]);
    expect(r.find((i) => i.id === "propia:vieja")).toMatchObject({ atrasada: true, hecha: false });
    expect(r.find((i) => i.id === "propia:lejana")).toMatchObject({ atrasada: false, hecha: false, fecha: "2027-10-06" });
  });

  it("lo hecho solo cuenta en su día: lo de ayer no está en «hoy», pero sí en la semana", () => {
    const f = fila({ id: "t1@x", estado: "completada", status: "cerrada", fecha: "2026-10-05", gestion: gestion("cerrar") });
    expect(ver([f])).toHaveLength(0);
    expect(ver([f], "semana")).toHaveLength(1);
    expect(ver([fila({ id: "t2@x", estado: "completada", status: "cerrada", fecha: "2026-10-04", gestion: gestion("cerrar") })], "semana")).toHaveLength(0);
  });
});

describe("linkTarea", () => {
  it("abre la bandeja en el día de la tarea con la tarea elegida", () => {
    expect(linkTarea({ id: "d_cita:a1", fecha: "2026-10-08" })).toBe("/app/tareas?fecha=2026-10-08&tarea=d_cita%3Aa1");
  });
});

describe("rutinaDeHoy", () => {
  const MANANA = sumarDias(HOY, 1);
  const datos = (o: Partial<DatosRutina> = {}): DatosRutina => ({
    hoy: HOY, puede: () => true, veDoctor: () => true, tieneCaja: true, tieneInventario: true,
    appointments: [], documentosPendientes: 0, stock: [], cashSessions: [], ...o,
  });
  const cita = (id: string, d: string, status: string, extra: Record<string, unknown> = {}) =>
    ({ id, dentistId: "d1", start: dia(d), status, ...extra }) as DatosRutina["appointments"][number];
  const ids = (r: ItemAgenda[]) => r.map((i) => i.id);

  it("un rol sin ningún permiso de rutina (dentista) no tiene rutina", () => {
    expect(rutinaDeHoy(datos({ puede: () => false, appointments: [cita("a1", MANANA, "pendiente")], documentosPendientes: 3 }))).toEqual([]);
  });

  it("todo al día: la rutina que tiene base figura hecha", () => {
    const r = rutinaDeHoy(datos({
      appointments: [cita("a1", MANANA, "confirmada")],
      stock: [{ name: "Guantes", stock: 50, minStock: 10 }],
      cashSessions: [{ status: "cerrada", openedAt: dia(HOY), closedAt: dia(HOY), userName: "Ana" }],
    }));
    expect(ids(r)).toEqual(["rutina:citas-manana", "rutina:documentos", "rutina:caja", "rutina:stock"]);
    expect(r.every((i) => i.hecha && i.hechaPor === "sola" && i.origen === "rutina" && i.fecha === HOY && !i.atrasada && i.accion === undefined)).toBe(true);
  });

  describe("citas de mañana", () => {
    it("pendiente mientras haya sin confirmar, y dice cuántas", () => {
      const [c] = rutinaDeHoy(datos({ appointments: [cita("a1", MANANA, "pendiente"), cita("a2", MANANA, "confirmada"), cita("a3", MANANA, "pendiente")] }));
      expect(c).toMatchObject({ id: "rutina:citas-manana", hecha: false, detalle: "2 de 3 sin confirmar", href: "/app/agenda" });
    });
    it("se tacha sola cuando están todas confirmadas", () => {
      const [c] = rutinaDeHoy(datos({ appointments: [cita("a1", MANANA, "confirmada"), cita("a2", MANANA, "en_sala")] }));
      expect(c).toMatchObject({ hecha: true, detalle: "Las 2 citas de mañana están confirmadas" });
    });
    it("en singular", () => {
      expect(rutinaDeHoy(datos({ appointments: [cita("a1", MANANA, "confirmada")] }))[0].detalle).toBe("La cita de mañana está confirmada");
    });
    it("las canceladas y las ausentes no cuentan; sin citas de mañana no aparece", () => {
      expect(rutinaDeHoy(datos({ appointments: [cita("a1", MANANA, "cancelada"), cita("a2", MANANA, "ausente")] })).map((i) => i.id)).not.toContain("rutina:citas-manana");
      expect(ids(rutinaDeHoy(datos()))).not.toContain("rutina:citas-manana");
    });
    it("solo cuenta las citas de los doctores que veo", () => {
      const r = rutinaDeHoy(datos({ veDoctor: (id) => id === "d1", appointments: [cita("a1", MANANA, "confirmada"), cita("a2", MANANA, "pendiente", { dentistId: "d2" })] }));
      expect(r[0]).toMatchObject({ hecha: true });
    });
    it("necesita poder editar la agenda", () => {
      const r = rutinaDeHoy(datos({ puede: (p: Permission) => p !== "agenda.edit", appointments: [cita("a1", MANANA, "pendiente")] }));
      expect(ids(r)).not.toContain("rutina:citas-manana");
    });
  });

  describe("reservas online", () => {
    it("pendiente si hay por validar de hoy en adelante", () => {
      const r = rutinaDeHoy(datos({ appointments: [cita("o1", sumarDias(HOY, 3), "pendiente", { source: "online" }), cita("o2", sumarDias(HOY, 4), "confirmada", { source: "online" })] }));
      expect(r.find((i) => i.id === "rutina:reservas")).toMatchObject({ hecha: false, detalle: "1 por validar" });
    });
    it("se tacha sola cuando no queda ninguna por validar", () => {
      const r = rutinaDeHoy(datos({ appointments: [cita("o1", sumarDias(HOY, 3), "confirmada", { source: "online" })] }));
      expect(r.find((i) => i.id === "rutina:reservas")).toMatchObject({ hecha: true });
    });
    it("una reserva pendiente de un día que ya pasó no cuenta como por validar", () => {
      const r = rutinaDeHoy(datos({ appointments: [cita("o1", "2026-10-01", "pendiente", { source: "online" })] }));
      expect(r.find((i) => i.id === "rutina:reservas")).toMatchObject({ hecha: true });
    });
    it("si la clínica nunca recibió una reserva online no aparece", () => {
      expect(ids(rutinaDeHoy(datos({ appointments: [cita("a1", sumarDias(HOY, 3), "pendiente")] })))).not.toContain("rutina:reservas");
    });
  });

  describe("documentos clínicos", () => {
    it("pendiente con cuántos pacientes", () => {
      expect(rutinaDeHoy(datos({ documentosPendientes: 4 })).find((i) => i.id === "rutina:documentos")).toMatchObject({
        hecha: false, detalle: "4 pacientes con documentos pendientes", href: "/app/pacientes?pendientes=documentos",
      });
      expect(rutinaDeHoy(datos({ documentosPendientes: 1 })).find((i) => i.id === "rutina:documentos")?.detalle).toBe("1 paciente con documentos pendientes");
    });
    it("se tacha sola cuando no queda ninguno", () => {
      expect(rutinaDeHoy(datos()).find((i) => i.id === "rutina:documentos")).toMatchObject({ hecha: true });
    });
    it("necesita poder gestionar documentos", () => {
      expect(ids(rutinaDeHoy(datos({ puede: (p: Permission) => p !== "engagement.forms", documentosPendientes: 2 })))).not.toContain("rutina:documentos");
    });
  });

  describe("caja", () => {
    const abierta = { status: "abierta" as const, openedAt: dia(HOY), userName: "Ana" };
    it("pendiente mientras haya una caja abierta", () => {
      expect(rutinaDeHoy(datos({ cashSessions: [abierta] })).find((i) => i.id === "rutina:caja")).toMatchObject({ hecha: false, detalle: "Abierta por Ana", href: "/app/caja" });
    });
    it("avisa si quedó abierta de un día anterior", () => {
      const vieja = { ...abierta, openedAt: dia("2026-10-02") };
      expect(rutinaDeHoy(datos({ cashSessions: [vieja] })).find((i) => i.id === "rutina:caja")?.detalle).toBe("Quedó abierta desde el 02 Oct");
    });
    it("con varias abiertas, las cuenta", () => {
      expect(rutinaDeHoy(datos({ cashSessions: [abierta, { ...abierta, userName: "Luis" }] })).find((i) => i.id === "rutina:caja")?.detalle).toBe("2 cajas abiertas");
    });
    it("se tacha sola cuando se cerró hoy", () => {
      const r = rutinaDeHoy(datos({ cashSessions: [{ status: "cerrada", openedAt: dia(HOY), closedAt: dia(HOY), userName: "Ana" }] }));
      expect(r.find((i) => i.id === "rutina:caja")).toMatchObject({ hecha: true, detalle: "La caja de hoy está cerrada" });
    });
    it("sin movimiento de caja hoy no aparece", () => {
      expect(ids(rutinaDeHoy(datos({ cashSessions: [{ status: "cerrada", openedAt: dia("2026-10-01"), closedAt: dia("2026-10-01"), userName: "Ana" }] })))).not.toContain("rutina:caja");
    });
    it("necesita el plan con caja y poder cobrar", () => {
      expect(ids(rutinaDeHoy(datos({ tieneCaja: false, cashSessions: [abierta] })))).not.toContain("rutina:caja");
      expect(ids(rutinaDeHoy(datos({ puede: (p: Permission) => p !== "payments.manage", cashSessions: [abierta] })))).not.toContain("rutina:caja");
    });
  });

  describe("stock", () => {
    it("pendiente con los insumos bajos", () => {
      const r = rutinaDeHoy(datos({ stock: [
        { name: "Guantes", stock: 2, minStock: 10 }, { name: "Anestesia", stock: 10, minStock: 10 },
        { name: "Hilo", stock: 1, minStock: 5 }, { name: "Algodón", stock: 0, minStock: 3 }, { name: "Gasas", stock: 50, minStock: 5 },
      ] })).find((i) => i.id === "rutina:stock");
      expect(r).toMatchObject({ hecha: false, detalle: "4 insumos: Guantes, Anestesia, Hilo y 1 más", href: "/app/inventario" });
    });
    it("se tacha sola cuando no hay nada bajo", () => {
      expect(rutinaDeHoy(datos({ stock: [{ name: "Guantes", stock: 50, minStock: 10 }] })).find((i) => i.id === "rutina:stock")).toMatchObject({ hecha: true });
    });
    it("sin insumos cargados, o sin el plan con inventario, no aparece", () => {
      expect(ids(rutinaDeHoy(datos()))).not.toContain("rutina:stock");
      expect(ids(rutinaDeHoy(datos({ tieneInventario: false, stock: [{ name: "Guantes", stock: 0, minStock: 10 }] })))).not.toContain("rutina:stock");
    });
  });

  it("el orden es siempre el mismo", () => {
    const r = rutinaDeHoy(datos({
      appointments: [cita("a1", MANANA, "pendiente"), cita("o1", sumarDias(HOY, 3), "pendiente", { source: "online" })],
      documentosPendientes: 1, stock: [{ name: "Guantes", stock: 0, minStock: 10 }],
      cashSessions: [{ status: "abierta", openedAt: dia(HOY), userName: "Ana" }],
    }));
    expect(ids(r)).toEqual(["rutina:citas-manana", "rutina:reservas", "rutina:documentos", "rutina:caja", "rutina:stock"]);
  });
});

describe("armarAgenda", () => {
  const item = (o: Partial<ItemAgenda> & { id: string }): ItemAgenda => ({
    origen: "propia", titulo: o.id, fecha: HOY, hecha: false, atrasada: false, ...o,
  });

  it("el avance es lo hecho sobre el total, atrasadas incluidas", () => {
    const a = armarAgenda([item({ id: "a", hecha: true }), item({ id: "b" }), item({ id: "c", atrasada: true, fecha: "2026-10-02" }), item({ id: "d", hecha: true })], "hoy", HOY);
    expect(a).toMatchObject({ total: 4, hechasN: 2, avance: 0.5 });
  });

  it("sin nada, el avance es 0 y no divide por cero", () => {
    expect(armarAgenda([], "hoy", HOY)).toMatchObject({ total: 0, hechasN: 0, avance: 0, pendientes: [], hechas: [], dias: [], atrasadas: [] });
  });

  it("separa pendientes, hechas y atrasadas", () => {
    const a = armarAgenda([item({ id: "a", hecha: true }), item({ id: "b" }), item({ id: "c", atrasada: true, fecha: "2026-10-02" })], "hoy", HOY);
    expect(a.pendientes.map((i) => i.id)).toEqual(["c", "b"]); // las atrasadas primero
    expect(a.hechas.map((i) => i.id)).toEqual(["a"]);
    expect(a.atrasadas.map((i) => i.id)).toEqual(["c"]);
    expect(a.dias.flatMap((d) => d.items.map((i) => i.id))).toEqual(["a", "b"]); // las atrasadas no van en un día
  });

  it("agrupa por día en orden de calendario, con los días vacíos fuera", () => {
    const a = armarAgenda([item({ id: "j", fecha: "2026-10-08" }), item({ id: "h", fecha: HOY }), item({ id: "d", fecha: "2026-10-11" })], "semana", HOY);
    expect(a.dias.map((d) => d.fecha)).toEqual([HOY, "2026-10-08", "2026-10-11"]);
  });

  it("dentro de un día: rutina, propias y automáticas, y después por título; hechas y pendientes no se reordenan", () => {
    const a = armarAgenda([
      item({ id: "z", origen: "automatica", titulo: "Z auto" }),
      item({ id: "y", origen: "propia", titulo: "B propia", hecha: true }),
      item({ id: "x", origen: "propia", titulo: "A propia" }),
      item({ id: "w", origen: "rutina", titulo: "Rutina" }),
    ], "semana", HOY);
    expect(a.dias[0].items.map((i) => i.id)).toEqual(["w", "x", "y", "z"]);
  });
});

describe("armarAgenda — la pestaña «Todas»", () => {
  const item = (o: Partial<ItemAgenda> & { id: string }): ItemAgenda => ({
    origen: "propia", titulo: o.id, fecha: HOY, hecha: false, atrasada: false, ...o,
  });
  const todas = (...items: ItemAgenda[]) => armarAgenda(items, "todas", HOY);

  it("es solo lo que falta: lo hecho no se muestra y el avance cuenta únicamente pendientes", () => {
    const a = todas(
      item({ id: "p1" }), item({ id: "p2", fecha: "2026-10-20" }), item({ id: "vieja", atrasada: true, fecha: "2026-10-02" }),
      item({ id: "h1", hecha: true }), item({ id: "h2", hecha: true, hechaPor: "sola" }),
    );
    expect(a).toMatchObject({ ambito: "todas", total: 3, hechasN: 0, avance: 0, hechas: [] });
    expect(a.pendientes.map((i) => i.id)).toEqual(["vieja", "p1", "p2"]);
    expect([...a.atrasadas, ...a.dias.flatMap((d) => d.items)].some((i) => i.hecha)).toBe(false);
  });

  it("las atrasadas van primero, de la más vieja a la más nueva; después, cada día en orden de calendario", () => {
    const a = todas(
      item({ id: "lejana", fecha: "2027-01-05" }), item({ id: "reciente", atrasada: true, fecha: "2026-10-04" }),
      item({ id: "hoy" }), item({ id: "antigua", atrasada: true, fecha: "2026-09-20" }), item({ id: "proxima", fecha: "2026-10-20" }),
    );
    expect(a.atrasadas.map((i) => i.id)).toEqual(["antigua", "reciente"]);
    expect(a.dias.map((d) => d.fecha)).toEqual([HOY, "2026-10-20", "2027-01-05"]);
    expect(a.pendientes.map((i) => i.id)).toEqual(["antigua", "reciente", "hoy", "proxima", "lejana"]);
  });

  it("la rutina de hoy que falta entra; la que se tachó sola no", () => {
    const a = todas(
      item({ id: "rutina:caja", origen: "rutina", titulo: "Cerrar la caja" }),
      item({ id: "rutina:stock", origen: "rutina", titulo: "Reponer el stock bajo", hecha: true, hechaPor: "sola" }),
    );
    expect(a.pendientes.map((i) => i.id)).toEqual(["rutina:caja"]);
    expect(a).toMatchObject({ total: 1, hechasN: 0 });
  });

  it("sin pendientes no hay nada y no divide por cero", () => {
    expect(todas(item({ id: "h", hecha: true }))).toMatchObject({ total: 0, hechasN: 0, avance: 0, pendientes: [], atrasadas: [], dias: [] });
    expect(todas()).toMatchObject({ total: 0, avance: 0 });
  });

  it("«hoy» y «semana» siguen contando lo hecho", () => {
    const items = [item({ id: "a", hecha: true }), item({ id: "b" })];
    for (const ambito of ["hoy", "semana"] as const) {
      expect(armarAgenda(items, ambito, HOY)).toMatchObject({ total: 2, hechasN: 1, avance: 0.5 });
    }
  });
});

describe("recortarAgenda — las primeras pendientes de «Todas»", () => {
  const item = (id: string, fecha = HOY, atrasada = false): ItemAgenda => ({ id, origen: "propia", titulo: id, fecha, hecha: false, atrasada });
  const ids = (r: ReturnType<typeof recortarAgenda>) => [...r.atrasadas, ...r.dias.flatMap((d) => d.items)].map((i) => i.id);
  const de = (n: number, atrasadas = 0) => armarAgenda([
    ...Array.from({ length: atrasadas }, (_, i) => item(`a${String(i).padStart(2, "0")}`, sumarDias(HOY, -(atrasadas - i)), true)),
    ...Array.from({ length: n - atrasadas }, (_, i) => item(`p${String(i).padStart(2, "0")}`, sumarDias(HOY, Math.floor(i / 2)))),
  ], "todas", HOY);

  it("el tope de Mi agenda son 10 pendientes", () => {
    expect(MAX_PENDIENTES_TODAS).toBe(10);
  });

  it("con 10 o menos muestra todo y no oculta nada", () => {
    for (const n of [0, 1, 7, 10]) {
      const r = recortarAgenda(de(n));
      expect(r.ocultas, `con ${n}`).toBe(0);
      expect(ids(r)).toHaveLength(n);
    }
  });

  it("con más del tope muestra las primeras en el orden en que se ven y cuenta las que quedan afuera", () => {
    const agenda = de(14, 3); // 3 atrasadas + 11 a partir de hoy, de a dos por día
    const r = recortarAgenda(agenda);
    expect(ids(r)).toEqual(["a00", "a01", "a02", "p00", "p01", "p02", "p03", "p04", "p05", "p06"]);
    expect(r.ocultas).toBe(4);
    expect(r.atrasadas.map((i) => i.id)).toEqual(["a00", "a01", "a02"]);
  });

  it("puede cortar a la mitad de un día: ese día muestra solo lo que entra", () => {
    const r = recortarAgenda(de(12), 9); // dos por día: el quinto día queda con una sola
    expect(r.dias.map((d) => d.items.length)).toEqual([2, 2, 2, 2, 1]);
    expect(r.ocultas).toBe(3);
  });

  it("si las atrasadas ya llenan el tope no se muestra ningún día", () => {
    const r = recortarAgenda(de(13, 12));
    expect(r.atrasadas).toHaveLength(10);
    expect(r.dias).toEqual([]);
    expect(r.ocultas).toBe(3);
  });

  it("no toca la agenda que recibe", () => {
    const agenda = de(14, 3);
    const antes = JSON.stringify(agenda);
    recortarAgenda(agenda);
    expect(JSON.stringify(agenda)).toBe(antes);
  });
});

describe("pestanaPorTecla — el teclado de las pestañas Hoy · Semana · Todas", () => {
  const ir = (actual: Ambito, tecla: string) => pestanaPorTecla(AMBITOS, actual, tecla);

  it("son tres, en este orden", () => {
    expect(AMBITOS).toEqual(["hoy", "semana", "todas"]);
  });

  it("la flecha derecha pasa a la siguiente y, desde la última, da la vuelta", () => {
    expect(ir("hoy", "ArrowRight")).toBe("semana");
    expect(ir("semana", "ArrowRight")).toBe("todas");
    expect(ir("todas", "ArrowRight")).toBe("hoy");
  });

  it("la flecha izquierda pasa a la anterior y, desde la primera, da la vuelta", () => {
    expect(ir("todas", "ArrowLeft")).toBe("semana");
    expect(ir("semana", "ArrowLeft")).toBe("hoy");
    expect(ir("hoy", "ArrowLeft")).toBe("todas");
  });

  it("Inicio va a la primera y Fin a la última, estés donde estés", () => {
    for (const a of AMBITOS) {
      expect(ir(a, "Home")).toBe("hoy");
      expect(ir(a, "End")).toBe("todas");
    }
  });

  it("las demás teclas no mueven nada", () => {
    for (const t of ["Enter", " ", "Tab", "ArrowDown", "ArrowUp", "a", "Escape"]) expect(ir("semana", t), t).toBeNull();
  });

  it("una pestaña que no está en la lista no mueve nada", () => {
    expect(pestanaPorTecla(AMBITOS, "mes" as Ambito, "ArrowRight")).toBeNull();
  });
});
