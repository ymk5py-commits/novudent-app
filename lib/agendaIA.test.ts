import { describe, it, expect } from "vitest";
import { parsearPropuestas, emparejarPaciente, promptAgendaSemana, resumenSemanaDatos, transcripcionDe } from "./agendaIA";
import { armarAgenda, type ItemAgenda } from "./miAgenda";
import type { FilaTarea } from "./tareas";

const HOY = "2026-10-06"; // martes

describe("parsearPropuestas — lo que devuelve el modelo, sin confiar en él", () => {
  const json = (tareas: unknown[]) => JSON.stringify({ tareas });

  it("lee el JSON de siempre", () => {
    const r = parsearPropuestas(json([{ titulo: "Llamar a Juan Pérez por el presupuesto", fecha: "2026-10-08", paciente: "Juan Pérez" }]), HOY);
    expect(r).toEqual([{ titulo: "Llamar a Juan Pérez por el presupuesto", fecha: "2026-10-08", paciente: "Juan Pérez" }]);
  });

  it("aguanta el JSON envuelto en ```json", () => {
    const raw = "```json\n" + json([{ titulo: "Pedir guantes", fecha: "2026-10-07" }]) + "\n```";
    expect(parsearPropuestas(raw, HOY)).toEqual([{ titulo: "Pedir guantes", fecha: "2026-10-07" }]);
  });

  it("aguanta prosa alrededor del JSON", () => {
    const raw = "Claro, acá van:\n" + json([{ titulo: "Pedir guantes", fecha: "2026-10-07" }]) + "\nAvisame si falta algo.";
    expect(parsearPropuestas(raw, HOY)).toHaveLength(1);
  });

  it("acepta una lista suelta y un objeto ya parseado", () => {
    expect(parsearPropuestas([{ titulo: "A", fecha: "2026-10-07" }], HOY)).toHaveLength(1);
    expect(parsearPropuestas({ tareas: [{ titulo: "A", fecha: "2026-10-07" }] }, HOY)).toHaveLength(1);
  });

  it("la basura no tira: devuelve vacío", () => {
    for (const raw of ["", "no sé", "{", "[1,2,3]", null, undefined, 42, { tareas: "x" }, { tareas: [null, 3, "x"] }]) {
      expect(parsearPropuestas(raw, HOY)).toEqual([]);
    }
  });

  describe("fecha", () => {
    const f = (fecha: unknown) => parsearPropuestas(json([{ titulo: "A", fecha }]), HOY)[0].fecha;
    it("sin fecha o con una inválida cae en hoy", () => {
      expect(f(undefined)).toBe(HOY);
      expect(f("mañana")).toBe(HOY);
      expect(f("2026-02-31")).toBe(HOY);
      expect(f(20261008)).toBe(HOY);
    });
    it("una fecha pasada cae en hoy (no se crea una tarea atrasada de entrada)", () => {
      expect(f("2026-10-05")).toBe(HOY);
    });
    it("hoy y una fecha futura se respetan", () => {
      expect(f(HOY)).toBe(HOY);
      expect(f("2026-10-12")).toBe("2026-10-12");
    });
    it("más de un año adelante es un error del modelo: cae en hoy", () => {
      expect(f("2028-01-01")).toBe(HOY);
    });
    it("si trae la hora, se queda con el día", () => {
      expect(f("2026-10-08T10:00:00")).toBe("2026-10-08");
    });
  });

  describe("título", () => {
    it("se recorta y descarta lo vacío o lo que no es texto", () => {
      const r = parsearPropuestas(json([{ titulo: "  Llamar  " }, { titulo: "   " }, { titulo: 7 }, {}, { titulo: "x".repeat(300) }]), HOY);
      expect(r.map((t) => t.titulo)).toEqual(["Llamar", "x".repeat(200)]);
    });
  });

  describe("paciente", () => {
    it("se recorta; lo vacío o lo que no es texto no cuenta", () => {
      const r = parsearPropuestas(json([
        { titulo: "A", paciente: "  Ana Gómez " }, { titulo: "B", paciente: "  " }, { titulo: "C", paciente: 5 }, { titulo: "D", paciente: "z".repeat(200) },
      ]), HOY);
      expect(r[0].paciente).toBe("Ana Gómez");
      expect(r[1]).not.toHaveProperty("paciente");
      expect(r[2]).not.toHaveProperty("paciente");
      expect(r[3].paciente).toHaveLength(80);
    });
  });

  it("máximo 20 tareas y sin repetidas", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({ titulo: `Tarea ${i}`, fecha: HOY }));
    expect(parsearPropuestas(json(muchas), HOY)).toHaveLength(20);
    expect(parsearPropuestas(json([{ titulo: "Igual", fecha: HOY }, { titulo: "igual", fecha: HOY }, { titulo: "Igual", fecha: "2026-10-09" }]), HOY)).toHaveLength(2);
  });
});

describe("emparejarPaciente — el nombre dictado contra las fichas (todo local)", () => {
  const p = (id: string, firstName: string, lastName: string) => ({ id, firstName, lastName });
  const fichas = [
    p("1", "Juan Carlos", "Pérez González"), p("2", "Juan", "Pérez"), p("3", "María", "Pérez"),
    p("4", "Susana", "López"), p("5", "Ana", "López"), p("6", "María José", "Ríos"),
  ];
  const ids = (n: string) => emparejarPaciente(n, fichas).map((x) => x.id);

  it("el nombre completo exacto va primero", () => {
    expect(ids("Juan Pérez")[0]).toBe("2");
  });
  it("un nombre incompleto encuentra la ficha más larga", () => {
    expect(ids("Juan Carlos Pérez")).toEqual(["1"]);
  });
  it("no distingue mayúsculas ni tildes", () => {
    expect(ids("JUAN perez")).toEqual(["2", "1"]);
    expect(ids("maria rios")).toEqual(["6"]);
  });
  it("un apellido compartido devuelve a todos, el más parecido primero", () => {
    expect(ids("Pérez")).toEqual(["2", "3", "1"]);
  });
  it("hay que coincidir con palabras enteras: «Ana» no es «Susana»", () => {
    expect(ids("Ana")).toEqual(["5"]);
  });
  it("ignora los tratamientos: «doña María Ríos», «el señor López»", () => {
    expect(ids("doña María Ríos")).toEqual(["6"]);
    expect(ids("el señor López")).toEqual(["5", "4"]);
  });
  it("sin coincidencia o sin nombre, nada", () => {
    expect(ids("Roberto Díaz")).toEqual([]);
    expect(ids("   ")).toEqual([]);
  });
  it("devuelve hasta 5", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => p(String(i), "Ana", `García ${i}`));
    expect(emparejarPaciente("Ana", muchos)).toHaveLength(5);
  });
});

describe("promptAgendaSemana", () => {
  it("le dice a la IA qué día es hoy, con el día de la semana", () => {
    const t = promptAgendaSemana(HOY);
    expect(t).toContain("2026-10-06");
    expect(t).toContain("martes");
  });
  it("trae el calendario de los próximos 14 días, para que el modelo no tenga que hacer cuentas con las fechas", () => {
    const t = promptAgendaSemana(HOY);
    expect(t).toContain("martes 6 de octubre → 2026-10-06 (hoy)");
    expect(t).toContain("miércoles 7 de octubre → 2026-10-07 (mañana)");
    expect(t).toContain("jueves 8 de octubre → 2026-10-08");
    expect(t).toContain("lunes 19 de octubre → 2026-10-19"); // el día 14
    expect(t).not.toContain("2026-10-20");
  });
  it("el calendario cruza el fin de año", () => {
    const t = promptAgendaSemana("2026-12-30");
    expect(t).toContain("→ 2027-01-02");
  });
  it("pide solo el JSON y no inventar", () => {
    const t = promptAgendaSemana(HOY);
    expect(t).toMatch(/SOLO este JSON/);
    expect(t).toMatch(/No inventes/);
  });
});

describe("resumenSemanaDatos — lo que sale del navegador hacia el resumen semanal", () => {
  const item = (o: Partial<ItemAgenda> & { id: string }): ItemAgenda => ({ origen: "propia", titulo: `Llamar a ${o.id}`, fecha: HOY, hecha: false, atrasada: false, ...o });
  const agenda = armarAgenda([
    item({ id: "Juan Pérez", hecha: true, hechaPor: "mano" }),
    item({ id: "Ana López", atrasada: true, fecha: "2026-10-02" }),
    item({ id: "rutina:caja", origen: "rutina", titulo: "Cerrar la caja", detalle: "Abierta por Ana", hecha: false }),
    item({ id: "rutina:stock", origen: "rutina", titulo: "Reponer el stock bajo", detalle: "El stock está al día", hecha: true, hechaPor: "sola" }),
  ], "semana", HOY);
  const cita = (start: string, status: string, dentistId = "d1") => ({ start, status, dentistId }) as never;
  const fila = (id: string, type: string, fecha: string, estado = "pendiente") => ({ id, type, fecha, estado }) as FilaTarea;
  const base = {
    hoy: HOY, agenda,
    filasBandeja: [fila("a", "cobranza", HOY), fila("b", "cobranza", "2026-10-01"), fila("c", "captura", "2026-10-09"), fila("d", "control", "2026-10-20"), fila("e", "cita", HOY, "completada")],
    appointments: [
      cita("2026-10-05T12:00:00", "completada"), cita("2026-10-06T12:00:00", "confirmada"), cita("2026-10-07T12:00:00", "pendiente"),
      cita("2026-10-08T12:00:00", "cancelada"), cita("2026-10-09T12:00:00", "ausente"), cita("2026-10-07T15:00:00", "confirmada", "d2"),
      cita("2026-10-13T12:00:00", "confirmada"), cita("2026-10-14T12:00:00", "cancelada"),
    ],
    veDoctor: (id: string | undefined) => id === "d1",
    verMontos: false,
  };

  it("cuenta mis tareas (sin la rutina, que va aparte), con las atrasadas", () => {
    expect(resumenSemanaDatos(base).misTareas).toEqual({ total: 2, hechas: 1, pendientes: 1, atrasadas: 1 });
  });

  it("la rutina va con su estado y su detalle", () => {
    expect(resumenSemanaDatos(base).rutina).toEqual([
      { punto: "Cerrar la caja", hecha: false, detalle: "Abierta por Ana" },
      { punto: "Reponer el stock bajo", hecha: true, detalle: "El stock está al día" },
    ]);
  });

  it("la bandeja cuenta lo pendiente que vence esta semana o antes, por tipo", () => {
    expect(resumenSemanaDatos(base).bandeja).toEqual({ pendientes: 3, atrasadas: 1, porTipo: { cobranza: 2, captura: 1 } });
  });

  it("las citas de la semana por estado, solo de los doctores que veo; y cuántas vienen la semana próxima", () => {
    expect(resumenSemanaDatos(base).citas).toEqual({
      semana: { total: 5, completadas: 1, confirmadas: 1, pendientes: 1, canceladas: 1, ausentes: 1 },
      proximaSemana: 1,
    });
  });

  it("el período es la semana de hoy", () => {
    expect(resumenSemanaDatos(base).semana).toEqual({ desde: "2026-10-05", hasta: "2026-10-11" });
  });

  it("ningún nombre de paciente ni título de tarea sale hacia la IA", () => {
    const s = JSON.stringify(resumenSemanaDatos(base));
    for (const prohibido of ["Juan", "Pérez", "Ana López", "Llamar a"]) expect(s).not.toContain(prohibido);
  });

  it("la producción solo viaja si el rol ve montos", () => {
    expect(resumenSemanaDatos({ ...base, produccionSemanaGs: 4_500_000 })).not.toHaveProperty("produccionSemanaGs");
    expect(resumenSemanaDatos({ ...base, verMontos: true, produccionSemanaGs: 4_500_000 }).produccionSemanaGs).toBe(4_500_000);
  });
});

describe("transcripcionDe", () => {
  it("saca lo que se dijo del JSON del modelo, venga como venga", () => {
    expect(transcripcionDe('{"tareas":[],"transcripcion":"pedir guantes"}')).toBe("pedir guantes");
    expect(transcripcionDe("```json\n" + '{"transcripcion":"  hola  "}' + "\n```")).toBe("hola");
  });
  it("sin transcripción, o con basura, queda vacía", () => {
    for (const raw of ['{"tareas":[]}', "no sé", "", null, '{"transcripcion":5}']) expect(transcripcionDe(raw)).toBe("");
  });
  it("se topa en 4000 caracteres", () => {
    expect(transcripcionDe(JSON.stringify({ transcripcion: "x".repeat(5000) }))).toHaveLength(4000);
  });
});
