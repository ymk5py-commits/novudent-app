import { describe, it, expect } from "vitest";
import {
  anularDocumento, camposVisibles, completarDocumento, cuerpoConDatos, documentoHtml, documentosDelPaciente, etiquetaPlan,
  guardarCambios, hayPlantillasSinGuardar, historiaClinicaPendiente, idUnico, limpiarValores, mover, normalizarPlantillas, nuevoDocumento,
  pendientesPorPaciente, plantillasActivas, plantillasDeClinica, puedeEditarDocumentos, puedeVerDocumentos,
  respuestasParaImprimir, sexoDe, slug, valorVacio,
} from "./documentosClinicos";
import { PLANTILLAS_DE_FABRICA } from "./plantillasDocumento";
import { ROLES } from "./rbac";
import { buildSeed } from "./seed";
import type { DocumentoClinico, PatientForm, PlantillaDocumento } from "./types";

const historia = () => PLANTILLAS_DE_FABRICA.find((p) => p.id === "historia_clinica")!;
const camposDeHistoria = () => historia().secciones!.flatMap((s) => s.campos);

describe("plantillas de fábrica", () => {
  it("traen la Historia Clínica de Aura con sus nueve secciones y tres textos por revisar", () => {
    expect(PLANTILLAS_DE_FABRICA.map((p) => p.id)).toEqual([
      "historia_clinica", "cuidados_exodoncia", "post_blanqueamiento", "higiene_cepillado_adultos",
    ]);
    expect(historia().tipo).toBe("formulario");
    expect(historia().secciones!.map((s) => s.titulo)).toEqual([
      "Antecedentes patológicos", "Aparatos y sistemas", "Antecedentes hereditarios", "Signos vitales",
      "Antecedentes no patológicos", "Antecedentes odontológicos", "Parafunciones",
      "Exploración extraoral", "Exploración intraoral",
    ]);
    const textos = PLANTILLAS_DE_FABRICA.filter((p) => p.tipo === "texto");
    expect(textos).toHaveLength(3);
    expect(textos.every((t) => t.porRevisar === true && (t.cuerpo ?? "").length > 200)).toBe(true);
  });

  it("los textos usan los datos del paciente y de la clínica", () => {
    for (const t of PLANTILLAS_DE_FABRICA.filter((p) => p.tipo === "texto")) {
      expect(t.cuerpo).toContain("{paciente}");
      expect(t.cuerpo).toContain("{profesional}");
    }
  });

  it("son válidas: pasan por normalizar sin perder nada", () => {
    expect(normalizarPlantillas(PLANTILLAS_DE_FABRICA)).toEqual(PLANTILLAS_DE_FABRICA);
  });

  it("los ids de campo y de sección no se repiten, y toda lista o casilla tiene opciones", () => {
    const ids = camposDeHistoria().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const secciones = historia().secciones!.map((s) => s.id);
    expect(new Set(secciones).size).toBe(secciones.length);
    for (const c of camposDeHistoria()) {
      if (c.tipo === "seleccion" || c.tipo === "casillas") expect(c.opciones!.length).toBeGreaterThan(1);
    }
  });

  it("transcriben las casillas de las capturas, con la ortografía corregida", () => {
    const opciones = (id: string) => camposDeHistoria().find((c) => c.id === id)!.opciones!;
    expect(opciones("refiere_padecido")).toHaveLength(13);
    expect(opciones("refiere_padecido")).toContain("Diabetes");
    expect(opciones("ap_respiratorio")).toContain("Sibilancias");
    expect(opciones("sistema_endocrino")).toEqual(["Polifagia", "Poliuria", "Polidipsia", "Irritabilidad al clima", "SDP"]);
    expect(opciones("habitos")).toContain("Bruxomanía");
    expect(opciones("sistema_nervioso")).toContain("Trastornos de personalidad");
  });

  it("las preguntas de embarazo son solo para mujeres", () => {
    const campo = (id: string) => camposDeHistoria().find((c) => c.id === id)!;
    expect(campo("embarazada").soloMujeres).toBe(true);
    expect(campo("embarazos_anteriores").soloMujeres).toBe(true);
    expect(camposDeHistoria().filter((c) => c.soloMujeres)).toHaveLength(2);
  });
});

describe("normalizarPlantillas", () => {
  const texto = (extra: Partial<PlantillaDocumento> = {}): PlantillaDocumento => ({ id: "t1", nombre: "Indicaciones", tipo: "texto", cuerpo: "Hola {paciente}", ...extra });

  it("descarta basura sin romper: no-objetos, sin id o sin nombre, ids repetidos", () => {
    const sucia = [null, 5, "x", {}, { id: "", nombre: "a", tipo: "texto" }, { id: "a", nombre: " ", tipo: "texto" },
      texto(), texto({ nombre: "Repetida" })] as unknown as PlantillaDocumento[];
    const r = normalizarPlantillas(sucia);
    expect(r.map((p) => p.id)).toEqual(["t1"]);
    expect(r[0].nombre).toBe("Indicaciones");
  });

  it("tolera que no sea una lista", () => {
    expect(normalizarPlantillas(undefined as unknown as PlantillaDocumento[])).toEqual([]);
    expect(normalizarPlantillas("x" as unknown as PlantillaDocumento[])).toEqual([]);
  });

  it("un formulario sin secciones válidas se descarta, y una sección sin campos válidos también", () => {
    const f = (secciones: unknown) => ({ id: "f", nombre: "F", tipo: "formulario", secciones }) as unknown as PlantillaDocumento;
    expect(normalizarPlantillas([f(undefined)])).toEqual([]);
    expect(normalizarPlantillas([f([{ id: "s", titulo: "S", campos: [{ id: "", etiqueta: "x", tipo: "texto" }] }])])).toEqual([]);
    const ok = normalizarPlantillas([f([{ id: "s", titulo: "S", campos: [{ id: "c", etiqueta: "C", tipo: "texto" }, { id: "c", etiqueta: "Repetido", tipo: "texto" }] }])]);
    expect(ok[0].secciones![0].campos.map((c) => c.id)).toEqual(["c"]);
  });

  it("un id de campo repetido en otra sección también se descarta", () => {
    const f = { id: "f", nombre: "F", tipo: "formulario", secciones: [
      { id: "s1", titulo: "Uno", campos: [{ id: "c", etiqueta: "C", tipo: "texto" }] },
      { id: "s2", titulo: "Dos", campos: [{ id: "c", etiqueta: "Otra C", tipo: "texto" }, { id: "d", etiqueta: "D", tipo: "texto" }] },
    ] } as unknown as PlantillaDocumento;
    const r = normalizarPlantillas([f]);
    expect(r[0].secciones!.map((s) => s.campos.map((c) => c.id))).toEqual([["c"], ["d"]]);
  });

  it("una selección o unas casillas sin opciones se descartan, y las opciones se limpian", () => {
    const campos = [
      { id: "a", etiqueta: "A", tipo: "seleccion", opciones: [] },
      { id: "b", etiqueta: "B", tipo: "casillas", opciones: [" Uno ", "", "Uno", "Dos"] },
      { id: "c", etiqueta: "C", tipo: "inventado" },
    ];
    const r = normalizarPlantillas([{ id: "f", nombre: "F", tipo: "formulario", secciones: [{ id: "s", titulo: "S", campos }] } as unknown as PlantillaDocumento]);
    expect(r[0].secciones![0].campos).toEqual([{ id: "b", etiqueta: "B", tipo: "casillas", opciones: ["Uno", "Dos"] }]);
  });

  it("un texto sin cuerpo queda con cuerpo vacío y no arrastra campos ajenos", () => {
    const r = normalizarPlantillas([{ id: "t", nombre: "T", tipo: "texto", basura: 1 } as unknown as PlantillaDocumento]);
    expect(r).toEqual([{ id: "t", nombre: "T", tipo: "texto", cuerpo: "" }]);
  });

  it("conserva porRevisar e inactiva solo cuando valen true, y soloMujeres igual", () => {
    const r = normalizarPlantillas([texto({ porRevisar: true, inactiva: true }), texto({ id: "t2", porRevisar: false, inactiva: false })]);
    expect(r[0]).toMatchObject({ porRevisar: true, inactiva: true });
    expect("porRevisar" in r[1]).toBe(false);
    expect("inactiva" in r[1]).toBe(false);
    const f = normalizarPlantillas([{ id: "f", nombre: "F", tipo: "formulario", secciones: [{ id: "s", titulo: "S", campos: [{ id: "e", etiqueta: "E", tipo: "texto", soloMujeres: true }, { id: "g", etiqueta: "G", tipo: "texto", soloMujeres: false }] }] } as unknown as PlantillaDocumento]);
    expect(f[0].secciones![0].campos).toEqual([{ id: "e", etiqueta: "E", tipo: "texto", soloMujeres: true }, { id: "g", etiqueta: "G", tipo: "texto" }]);
  });

  it("no comparte referencias con la entrada", () => {
    const entrada = [texto()];
    const r = normalizarPlantillas(entrada);
    r[0].nombre = "Cambiada";
    expect(entrada[0].nombre).toBe("Indicaciones");
    const formularios = normalizarPlantillas(PLANTILLAS_DE_FABRICA);
    formularios[0].secciones![0].campos[0].etiqueta = "Cambiada";
    expect(PLANTILLAS_DE_FABRICA[0].secciones![0].campos[0].etiqueta).not.toBe("Cambiada");
  });
});

describe("plantillasDeClinica", () => {
  it("sin nada guardado usa las de fábrica", () => {
    expect(plantillasDeClinica(undefined)).toBe(PLANTILLAS_DE_FABRICA);
    expect(plantillasDeClinica({})).toBe(PLANTILLAS_DE_FABRICA);
  });

  it("con una lista guardada usa esa, normalizada", () => {
    const r = plantillasDeClinica({ plantillasDocumento: [{ id: "x", nombre: " X ", tipo: "texto", cuerpo: "hola" }] });
    expect(r).toEqual([{ id: "x", nombre: "X", tipo: "texto", cuerpo: "hola" }]);
  });

  it("una lista guardada vacía es una decisión de la clínica: no vuelve a las de fábrica", () => {
    expect(plantillasDeClinica({ plantillasDocumento: [] })).toEqual([]);
  });
});

/* «Guardar plantillas» (Configuración › Documentos clínicos) dejaba la barra «Descartar / Guardar plantillas» prendida para
   siempre: lo que se guarda pasa por `normalizarPlantillas`, que además reordena las claves de cada objeto, y la pantalla
   comparaba esa lista guardada con la de trabajo SIN normalizar (JSON.stringify depende del orden de las claves). */
describe("hayPlantillasSinGuardar", () => {
  /** Lo que hace «Desactivar» en la pantalla: `{ ...x, inactiva: true }`, con la clave nueva al final. */
  const desactivada = (p: PlantillaDocumento): PlantillaDocumento => ({ ...p, inactiva: true });
  /** Lo que guarda la pantalla en `config.plantillasDocumento`. */
  const guardar = (lista: PlantillaDocumento[]) => ({ plantillasDocumento: normalizarPlantillas(lista) });

  it("sin tocar nada no hay nada que guardar (con o sin plantillas propias guardadas)", () => {
    expect(hayPlantillasSinGuardar(PLANTILLAS_DE_FABRICA, undefined)).toBe(false);
    expect(hayPlantillasSinGuardar(PLANTILLAS_DE_FABRICA, {})).toBe(false);
    const propias = guardar(PLANTILLAS_DE_FABRICA);
    expect(hayPlantillasSinGuardar(propias.plantillasDocumento, propias)).toBe(false);
  });

  it("un cambio real sí cuenta: desactivar una plantilla o cambiarle el nombre", () => {
    const [primera, ...resto] = PLANTILLAS_DE_FABRICA;
    expect(hayPlantillasSinGuardar([desactivada(primera), ...resto], undefined)).toBe(true);
    expect(hayPlantillasSinGuardar([{ ...primera, nombre: "Otra" }, ...resto], undefined)).toBe(true);
  });

  it("sacar una plantilla cuenta, y también agregar una", () => {
    expect(hayPlantillasSinGuardar(PLANTILLAS_DE_FABRICA.slice(1), undefined)).toBe(true);
    expect(hayPlantillasSinGuardar([...PLANTILLAS_DE_FABRICA, { id: "n", nombre: "Nueva", tipo: "texto", cuerpo: "x" }], undefined)).toBe(true);
  });

  it("después de guardar, lo guardado ya no es una diferencia (aunque las claves estén en otro orden)", () => {
    const [primera, ...resto] = PLANTILLAS_DE_FABRICA;
    const trabajo = [desactivada(primera), ...resto];
    // Éste es el caso del defecto: el orden de claves de `trabajo` no es el de lo normalizado.
    expect(JSON.stringify(trabajo)).not.toBe(JSON.stringify(guardar(trabajo).plantillasDocumento));
    expect(hayPlantillasSinGuardar(trabajo, guardar(trabajo))).toBe(false);
  });

  it("marcar como revisada y guardar tampoco deja la barra prendida", () => {
    const trabajo = PLANTILLAS_DE_FABRICA.map((p) => { const { porRevisar: _fuera, ...resto } = p; return resto as PlantillaDocumento; });
    expect(hayPlantillasSinGuardar(trabajo, undefined)).toBe(true);
    expect(hayPlantillasSinGuardar(trabajo, guardar(trabajo))).toBe(false);
  });

  it("una lista guardada vacía es una decisión: vaciar la de trabajo no es un cambio, volver a la de fábrica sí", () => {
    expect(hayPlantillasSinGuardar([], { plantillasDocumento: [] })).toBe(false);
    expect(hayPlantillasSinGuardar(PLANTILLAS_DE_FABRICA, { plantillasDocumento: [] })).toBe(true);
  });
});

describe("plantillasActivas", () => {
  it("saca las inactivas", () => {
    const l: PlantillaDocumento[] = [
      { id: "a", nombre: "A", tipo: "texto", cuerpo: "" },
      { id: "b", nombre: "B", tipo: "texto", cuerpo: "", inactiva: true },
    ];
    expect(plantillasActivas(l).map((p) => p.id)).toEqual(["a"]);
  });
});

/* ═══ Documentos ═══ */

const BY = { id: "u5", name: "Laura Recepción" };
const AHORA = "2026-10-06T12:00:00.000Z";

const formulario = (): PlantillaDocumento => ({
  id: "hc", nombre: "Historia", tipo: "formulario",
  secciones: [
    { id: "s1", titulo: "Antecedentes", campos: [
      { id: "alergia", etiqueta: "Alergia:", tipo: "texto" },
      { id: "padecido", etiqueta: "Refiere haber padecido:", tipo: "casillas", opciones: ["Anemia", "Diabetes"] },
      { id: "embarazada", etiqueta: "¿Embarazada?", tipo: "seleccion", opciones: ["Sí", "No"], soloMujeres: true },
    ] },
    { id: "s2", titulo: "Signos vitales", campos: [{ id: "tension", etiqueta: "Tensión:", tipo: "texto" }] },
  ],
});
const conTexto = (): PlantillaDocumento => ({
  id: "ex", nombre: "Cuidados", tipo: "texto", porRevisar: true,
  cuerpo: "Paciente: {paciente} ({documento}). {fecha}. {profesional} · {clinica}. {paciente} {otro}",
});
const nuevo = (plantilla: PlantillaDocumento = formulario(), extra: Record<string, unknown> = {}): DocumentoClinico =>
  nuevoDocumento({ id: "d1", clinicId: "c1", patientId: "p1", plantilla, by: BY, now: AHORA, ...extra });

describe("sexoDe y camposVisibles", () => {
  it("el sexo manda y el género es el respaldo; sin dato, nada", () => {
    expect(sexoDe({ sex: "F", gender: "M" })).toBe("F");
    expect(sexoDe({ gender: "M" })).toBe("M");
    expect(sexoDe({ gender: "nd" })).toBeUndefined();
    expect(sexoDe({ gender: "otro" })).toBeUndefined();
    expect(sexoDe({})).toBeUndefined();
  });

  it("las preguntas «solo mujeres» se ocultan únicamente si el paciente es hombre", () => {
    const s = formulario().secciones![0];
    expect(camposVisibles(s, "M").map((c) => c.id)).toEqual(["alergia", "padecido"]);
    expect(camposVisibles(s, "F").map((c) => c.id)).toEqual(["alergia", "padecido", "embarazada"]);
    expect(camposVisibles(s, undefined).map((c) => c.id)).toEqual(["alergia", "padecido", "embarazada"]);
  });
});

describe("cuerpoConDatos", () => {
  it("reemplaza todos los datos conocidos, deja los desconocidos y vacía los que faltan", () => {
    const r = cuerpoConDatos("{paciente} / {documento} / {fecha} / {profesional} / {clinica} / {otro} / {paciente}", {
      paciente: "Ana Gómez", documento: "1.234.567", fecha: "6 de octubre de 2026", clinica: "Clínica Demo",
    });
    expect(r).toBe("Ana Gómez / 1.234.567 / 6 de octubre de 2026 /  / Clínica Demo / {otro} / Ana Gómez");
  });
});

describe("nuevoDocumento", () => {
  it("un formulario arranca pendiente, vacío y con su propia copia de la plantilla", () => {
    const pl = formulario();
    const d = nuevo(pl);
    expect(d).toMatchObject({
      id: "d1", clinicId: "c1", patientId: "p1", plantillaId: "hc", nombre: "Historia", tipo: "formulario",
      estado: "pendiente", valores: {}, createdAt: AHORA, createdBy: "u5", createdByName: "Laura Recepción",
    });
    expect("cuerpo" in d).toBe(false);
    expect("dentistId" in d).toBe(false);
    expect("porRevisar" in d).toBe(false);
    d.secciones![0].campos[0].etiqueta = "Cambiada";
    expect(pl.secciones![0].campos[0].etiqueta).toBe("Alergia:");
  });

  it("un texto lleva el cuerpo con los datos puestos y hereda «por revisar»", () => {
    const d = nuevo(conTexto(), { dentistId: "u2", datos: { paciente: "Ana Gómez", documento: "1", fecha: "hoy", profesional: "Dra. Sofía", clinica: "Demo" } });
    expect(d.tipo).toBe("texto");
    expect(d.cuerpo).toBe("Paciente: Ana Gómez (1). hoy. Dra. Sofía · Demo. Ana Gómez {otro}");
    expect(d.porRevisar).toBe(true);
    expect(d.dentistId).toBe("u2");
    expect("secciones" in d).toBe(false);
    expect("valores" in d).toBe(false);
  });
});

describe("limpiarValores y valorVacio", () => {
  it("saca los vacíos y las casillas sin marcar", () => {
    expect(limpiarValores({ a: "x", b: "", c: "   ", d: [], e: ["Uno", ""], f: [] })).toEqual({ a: "x", e: ["Uno"] });
  });
  it("valorVacio entiende textos, espacios y listas", () => {
    expect(valorVacio(undefined)).toBe(true);
    expect(valorVacio("  ")).toBe(true);
    expect(valorVacio([])).toBe(true);
    expect(valorVacio("0")).toBe(false);
    expect(valorVacio(["x"])).toBe(false);
  });
});

describe("guardar, completar y anular", () => {
  it("guardar cambios mantiene el estado y limpia los valores", () => {
    const g = guardarCambios(nuevo(), { valores: { alergia: "Penicilina", tension: "" }, now: "2026-10-06T13:00:00.000Z" });
    expect(g.estado).toBe("pendiente");
    expect(g.valores).toEqual({ alergia: "Penicilina" });
    expect(g.updatedAt).toBe("2026-10-06T13:00:00.000Z");
  });

  it("el cuerpo solo se guarda en los documentos de texto", () => {
    expect(guardarCambios(nuevo(conTexto()), { cuerpo: "Nuevo texto", now: AHORA }).cuerpo).toBe("Nuevo texto");
    expect("cuerpo" in guardarCambios(nuevo(), { cuerpo: "Nuevo texto", now: AHORA })).toBe(false);
  });

  it("completar deja quién y cuándo, y no pisa la primera vez", () => {
    const c = completarDocumento(nuevo(), { valores: { tension: "120/80" }, now: "2026-10-06T14:00:00.000Z", by: { id: "u2", name: "Dra. Sofía" } });
    expect(c).toMatchObject({ estado: "completado", completedAt: "2026-10-06T14:00:00.000Z", completedBy: "Dra. Sofía", valores: { tension: "120/80" } });
    const otra = completarDocumento(c, { now: "2026-10-07T09:00:00.000Z", by: { id: "u1", name: "Carlos" } });
    expect(otra).toMatchObject({ estado: "completado", completedAt: "2026-10-06T14:00:00.000Z", completedBy: "Dra. Sofía", updatedAt: "2026-10-07T09:00:00.000Z" });
  });

  it("anular deja quién y cuándo, es idempotente y un anulado ya no se edita ni se completa", () => {
    const a = anularDocumento(nuevo(), { now: "2026-10-06T15:00:00.000Z", by: "Ana" });
    expect(a).toMatchObject({ estado: "anulado", voidedAt: "2026-10-06T15:00:00.000Z", voidedBy: "Ana" });
    expect(anularDocumento(a, { now: "2026-10-07T00:00:00.000Z", by: "Bea" })).toBe(a);
    expect(guardarCambios(a, { valores: { alergia: "x" }, now: AHORA })).toBe(a);
    expect(completarDocumento(a, { now: AHORA, by: BY })).toBe(a);
  });
});

describe("respuestasParaImprimir", () => {
  const respondido = () => guardarCambios(nuevo(), {
    valores: { alergia: "Penicilina", padecido: ["Anemia", "Diabetes"], embarazada: "No", tension: "   " }, now: AHORA,
  });

  it("solo trae lo respondido, por sección, con las casillas en una línea", () => {
    expect(respuestasParaImprimir(respondido(), "F")).toEqual([
      { titulo: "Antecedentes", filas: [
        { etiqueta: "Alergia:", valor: "Penicilina" },
        { etiqueta: "Refiere haber padecido:", valor: "Anemia, Diabetes" },
        { etiqueta: "¿Embarazada?", valor: "No" },
      ] },
    ]);
  });

  it("no imprime lo que no corresponde al paciente (hombre) aunque haya un valor viejo", () => {
    const filas = respuestasParaImprimir(respondido(), "M")[0].filas.map((f) => f.etiqueta);
    expect(filas).not.toContain("¿Embarazada?");
  });

  it("un documento de texto no tiene respuestas", () => {
    expect(respuestasParaImprimir(nuevo(conTexto()), "F")).toEqual([]);
  });
});

describe("documentosDelPaciente", () => {
  const doc = (id: string, patch: Partial<DocumentoClinico>): DocumentoClinico => ({ ...nuevo(), id, ...patch });
  const form = (id: string, status: "pendiente" | "completado", completedAt?: string): PatientForm => ({ id, templateName: `Form ${id}`, status, fields: [], ...(completedAt ? { completedAt } : {}) });
  const docs = [
    doc("d_a", { createdAt: "2026-10-01T10:00:00.000Z" }),
    doc("d_b", { estado: "completado", createdAt: "2026-09-01T10:00:00.000Z", completedAt: "2026-10-05T10:00:00.000Z" }),
    doc("d_c", { estado: "completado", createdAt: "2026-09-01T10:00:00.000Z", completedAt: "2026-09-20T10:00:00.000Z" }),
    doc("d_x", { estado: "anulado", createdAt: "2026-09-25T10:00:00.000Z" }),
    doc("d_otro", { patientId: "p2" }),
  ];
  const p = { id: "p1", forms: [form("f1", "pendiente"), form("f2", "completado", "2026-05-20")] };

  it("junta los documentos y los formularios viejos: pendientes primero, después lo más reciente", () => {
    expect(documentosDelPaciente(p, docs).map((i) => i.id)).toEqual(["d_a", "f1", "d_b", "d_c", "f2"]);
  });

  it("marca de dónde viene cada uno", () => {
    const items = documentosDelPaciente(p, docs);
    expect(items.find((i) => i.id === "d_a")).toMatchObject({ origen: "clinico", estado: "pendiente", nombre: "Historia" });
    expect(items.find((i) => i.id === "f1")).toMatchObject({ origen: "formulario", estado: "pendiente", nombre: "Form f1" });
    expect(items.find((i) => i.id === "f2")).toMatchObject({ origen: "formulario", estado: "completado" });
  });

  it("los anulados aparecen solo si se piden", () => {
    expect(documentosDelPaciente(p, docs, true).map((i) => i.id)).toContain("d_x");
    expect(documentosDelPaciente(p, docs).map((i) => i.id)).not.toContain("d_x");
  });

  it("tolera un paciente sin formularios", () => {
    expect(documentosDelPaciente({ id: "p1", forms: undefined as unknown as PatientForm[] }, [])).toEqual([]);
  });
});

describe("pendientesPorPaciente", () => {
  const doc = (id: string, patientId: string, estado: DocumentoClinico["estado"]): DocumentoClinico => ({ ...nuevo(), id, patientId, estado });
  const f = (id: string, status: "pendiente" | "completado"): PatientForm => ({ id, templateName: "F", status, fields: [] });

  it("cuenta documentos pendientes y formularios viejos pendientes, por paciente", () => {
    const pacientes = [{ id: "p1", forms: [f("a", "pendiente")] }, { id: "p2", forms: [] }, { id: "p3", forms: [f("b", "completado")] }];
    const r = pendientesPorPaciente(pacientes, [doc("d1", "p1", "pendiente"), doc("d2", "p2", "pendiente"), doc("d3", "p2", "completado"), doc("d4", "p3", "anulado")]);
    expect([...r.entries()]).toEqual([["p1", 2], ["p2", 1]]);
  });

  it("ignora los documentos de pacientes que ya no están", () => {
    expect(pendientesPorPaciente([{ id: "p1", forms: [] }], [doc("d1", "fantasma", "pendiente")]).size).toBe(0);
  });
});

describe("historiaClinicaPendiente", () => {
  const base = { id: "cd_p9_hc", clinicId: "c1", patientId: "p9", by: BY, now: AHORA };

  it("crea la Historia Clínica pendiente con la plantilla activa", () => {
    const d = historiaClinicaPendiente({ ...base, plantillas: PLANTILLAS_DE_FABRICA })!;
    expect(d).toMatchObject({ id: "cd_p9_hc", patientId: "p9", plantillaId: "historia_clinica", nombre: "Historia Clínica", estado: "pendiente", createdByName: "Laura Recepción" });
    expect(d.secciones).toHaveLength(9);
  });

  it("sin la plantilla, o si la clínica la desactivó, no crea nada", () => {
    expect(historiaClinicaPendiente({ ...base, plantillas: [] })).toBeNull();
    const apagada = PLANTILLAS_DE_FABRICA.map((p) => (p.id === "historia_clinica" ? { ...p, inactiva: true } : p));
    expect(historiaClinicaPendiente({ ...base, plantillas: apagada })).toBeNull();
  });
});

describe("permisos", () => {
  it("editan los documentos: admin, caja, recepción, comercial y dentista (espejo de firestore.rules)", () => {
    expect(ROLES.filter(puedeEditarDocumentos).sort()).toEqual(["admin", "cashier", "commercial", "dentist", "receptionist"]);
  });

  it("los ven todos; el asistente solo lee", () => {
    expect(ROLES.filter(puedeVerDocumentos)).toEqual(ROLES);
    expect(puedeEditarDocumentos("assistant")).toBe(false);
  });
});

describe("etiquetaPlan", () => {
  it("numera con el id y usa el nombre del plan", () => {
    expect(etiquetaPlan({ id: "b4351", name: "Ortodoncia" })).toBe("#b4351 — Ortodoncia");
    expect(etiquetaPlan({ id: "b9" })).toBe("#b9 — Plan de tratamiento");
    expect(etiquetaPlan({ id: "b9", name: "  " })).toBe("#b9 — Plan de tratamiento");
  });
});

describe("documentoHtml", () => {
  const o = { clinica: "Clínica <Demo>", paciente: "Ana <b>Gómez</b>", fecha: "6 oct." };

  it("escapa todo lo que escribe una persona", () => {
    const d = guardarCambios(nuevo(), { valores: { alergia: "<script>alert(1)</script>" }, now: AHORA });
    const html = documentoHtml({ ...d, nombre: "Historia <i>x</i>" }, o);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Gómez</b>");
    expect(html).not.toContain("<i>x</i>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un formulario lista solo lo respondido; un texto lleva su cuerpo", () => {
    const f = documentoHtml(guardarCambios(nuevo(), { valores: { alergia: "Penicilina" }, now: AHORA }), o);
    expect(f).toContain("Penicilina");
    expect(f).toContain("Antecedentes");
    expect(f).not.toContain("Signos vitales");
    const t = documentoHtml(nuevo(conTexto(), { datos: { paciente: "Ana" } }), o);
    expect(t).toContain("Paciente: Ana");
  });

  it("avisa cuando el documento sale de un borrador por revisar", () => {
    expect(documentoHtml(nuevo(conTexto()), o)).toContain("Borrador pendiente de revisión");
    expect(documentoHtml(nuevo(), o)).not.toContain("Borrador pendiente de revisión");
  });

  it("sin respuestas lo dice", () => {
    expect(documentoHtml(nuevo(), o)).toContain("Sin respuestas registradas");
  });
});

describe("utilidades del editor de plantillas", () => {
  it("slug saca tildes, mayúsculas y símbolos", () => {
    expect(slug("Antecedentes Patológicos")).toBe("antecedentes_patologicos");
    expect(slug("¿Cuántas veces?")).toBe("cuantas_veces");
    expect(slug("***")).toBe("");
  });

  it("idUnico agrega un número si ya existe y nunca devuelve vacío", () => {
    expect(idUnico("Campo nuevo", [])).toBe("campo_nuevo");
    expect(idUnico("Campo nuevo", ["campo_nuevo"])).toBe("campo_nuevo_2");
    expect(idUnico("Campo nuevo", new Set(["campo_nuevo", "campo_nuevo_2"]))).toBe("campo_nuevo_3");
    expect(idUnico("???", [])).toBe("item");
  });

  it("mover intercambia con el vecino y no se sale de la lista", () => {
    expect(mover(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(mover(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(mover(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    const original = ["a", "b"];
    mover(original, 0, 1);
    expect(original).toEqual(["a", "b"]);
  });
});

describe("demo sembrada", () => {
  const seed = buildSeed();

  it("trae documentos clínicos válidos: ids únicos, de pacientes que existen y de la clínica demo", () => {
    const ids = seed.clinicalDocs.map((d) => d.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of seed.clinicalDocs) {
      expect(seed.patients.some((p) => p.id === d.patientId)).toBe(true);
      expect(d.clinicId).toBe("cl_demo");
    }
  });

  it("el completado responde campos y opciones que existen en su plantilla", () => {
    const completado = seed.clinicalDocs.find((d) => d.estado === "completado")!;
    expect(completado.completedAt).toBeTruthy();
    const campos = new Map(completado.secciones!.flatMap((s) => s.campos).map((c) => [c.id, c]));
    const claves = Object.keys(completado.valores!);
    expect(claves.length).toBeGreaterThan(5);
    for (const k of claves) {
      const campo = campos.get(k);
      expect(campo, `el campo ${k} no existe en la plantilla`).toBeDefined();
      const marcadas = ([] as string[]).concat(completado.valores![k]);
      if (campo!.opciones) for (const m of marcadas) expect(campo!.opciones, `${k}: «${m}»`).toContain(m);
    }
  });

  it("siguen siendo tres los pacientes con pendientes: p1 y p2 (documentos) y p4 (formulario viejo)", () => {
    expect([...pendientesPorPaciente(seed.patients, seed.clinicalDocs).keys()].sort()).toEqual(["p1", "p2", "p4"]);
  });
});
