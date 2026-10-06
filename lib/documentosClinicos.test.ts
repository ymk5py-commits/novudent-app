import { describe, it, expect } from "vitest";
import { normalizarPlantillas, plantillasActivas, plantillasDeClinica } from "./documentosClinicos";
import { PLANTILLAS_DE_FABRICA } from "./plantillasDocumento";
import type { PlantillaDocumento } from "./types";

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

describe("plantillasActivas", () => {
  it("saca las inactivas", () => {
    const l: PlantillaDocumento[] = [
      { id: "a", nombre: "A", tipo: "texto", cuerpo: "" },
      { id: "b", nombre: "B", tipo: "texto", cuerpo: "", inactiva: true },
    ];
    expect(plantillasActivas(l).map((p) => p.id)).toEqual(["a"]);
  });
});
