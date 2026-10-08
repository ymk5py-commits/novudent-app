import { describe, it, expect } from "vitest";
import { AUTOMATION_LABEL, DEFAULT_TEMPLATES, borradoresDePlantillas, botikaMessage, plantillasModificadas, plantillasParaGuardar } from "./botika";
import type { DB } from "./types";

const dbWith = (template?: string): DB =>
  ({ clinics: [{ id: "c", name: "Aura", config: template ? { botika: { templates: { confirmCita: template } } } : {} }] } as unknown as DB);

describe("botikaMessage", () => {
  it("sustituye los placeholders de la plantilla configurada", () => {
    const db = dbWith("Hola {paciente}, tu cita es el {fecha} a las {hora}.");
    expect(botikaMessage(db, "confirmCita", { paciente: "Ana", fecha: "lunes", hora: "10:00" }))
      .toBe("Hola Ana, tu cita es el lunes a las 10:00.");
  });
  it("placeholders sin valor quedan vacíos", () => {
    const db = dbWith("Hola {paciente}, saldo {saldo}.");
    expect(botikaMessage(db, "confirmCita", { paciente: "Ana" })).toBe("Hola Ana, saldo .");
  });
  it("cae a la plantilla por defecto si la clínica no configuró una", () => {
    const msg = botikaMessage(dbWith(), "confirmCita", { paciente: "Ana", clinica: "Aura" });
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("Ana");        // sustituyó {paciente}
    expect(msg).not.toContain("{paciente}");
  });
});

/* Integraciones › Plantillas de mensajes: `drafts` del editor se armaba con 4 claves y DEFAULT_TEMPLATES tiene 5, así que la de
   «Negociación de presupuestos» salía vacía, con «Restaurar default» y con «Guardar plantillas» prendido para siempre. */
describe("editor de plantillas de Botika", () => {
  const claves = Object.keys(DEFAULT_TEMPLATES) as (keyof typeof DEFAULT_TEMPLATES)[];

  it("hay un nombre para cada plantilla que tiene un default", () => {
    expect(Object.keys(AUTOMATION_LABEL).sort()).toEqual([...claves].sort());
  });

  describe("borradoresDePlantillas", () => {
    it("arranca con TODAS las plantillas, también la de Negociación, con su texto de fábrica y nunca vacío", () => {
      const b = borradoresDePlantillas(undefined);
      expect(Object.keys(b).sort()).toEqual([...claves].sort());
      for (const k of claves) expect(b[k], k).toBe(DEFAULT_TEMPLATES[k]);
      expect(b.negociacion.length).toBeGreaterThan(20);
    });

    it("usa lo que la clínica guardó para esa y el de fábrica para el resto", () => {
      const b = borradoresDePlantillas({ nps: "Mi NPS" });
      expect(b.nps).toBe("Mi NPS");
      expect(b.negociacion).toBe(DEFAULT_TEMPLATES.negociacion);
      expect(b.cobranza).toBe(DEFAULT_TEMPLATES.cobranza);
    });

    it("un texto guardado vacío vale como «el de fábrica» (así se deshace una personalización)", () => {
      expect(borradoresDePlantillas({ nps: "" }).nps).toBe(DEFAULT_TEMPLATES.nps);
    });
  });

  describe("plantillasModificadas — cuándo aparece «Guardar plantillas»", () => {
    it("recién abierto el editor no hay nada que guardar, con o sin plantillas propias", () => {
      expect(plantillasModificadas(borradoresDePlantillas(undefined), undefined)).toBe(false);
      const guardadas = { nps: "Mi NPS", cobranza: "Mi cobranza" };
      expect(plantillasModificadas(borradoresDePlantillas(guardadas), guardadas)).toBe(false);
    });

    it("editar una plantilla (también la de Negociación) lo prende", () => {
      const b = borradoresDePlantillas(undefined);
      expect(plantillasModificadas({ ...b, negociacion: "Otro texto" }, undefined)).toBe(true);
      expect(plantillasModificadas({ ...b, confirmCita: "Otro texto" }, undefined)).toBe(true);
    });

    it("después de guardar se apaga", () => {
      const editados = { ...borradoresDePlantillas(undefined), negociacion: "Texto propio de negociación" };
      const guardadas = plantillasParaGuardar(editados, undefined);
      expect(plantillasModificadas(editados, guardadas)).toBe(false);
    });
  });

  describe("plantillasParaGuardar", () => {
    it("guarda solo lo que se cambió: lo que quedó igual al de fábrica no se escribe", () => {
      const editados = { ...borradoresDePlantillas(undefined), nps: "Mi NPS" };
      expect(plantillasParaGuardar(editados, undefined)).toEqual({ nps: "Mi NPS" });
    });

    it("sin cambios no guarda ninguna plantilla", () => {
      expect(plantillasParaGuardar(borradoresDePlantillas(undefined), undefined)).toEqual({});
    });

    it("«Restaurar default» sobre una plantilla ya guardada la deja vacía en vez de omitirla (el guardado hace merge y un campo ausente no se borra)", () => {
      const guardadas = { nps: "Mi NPS", cobranza: "Mi cobranza" };
      const restaurada = { ...borradoresDePlantillas(guardadas), nps: DEFAULT_TEMPLATES.nps };
      expect(plantillasParaGuardar(restaurada, guardadas)).toEqual({ nps: "", cobranza: "Mi cobranza" });
    });

    it("una plantilla que nunca se personalizó y sigue igual no aparece (ni vacía)", () => {
      const guardadas = { nps: "Mi NPS" };
      const b = borradoresDePlantillas(guardadas);
      expect(plantillasParaGuardar(b, guardadas)).toEqual({ nps: "Mi NPS" });
    });

    it("lo guardado vacío se lee de nuevo como el de fábrica y el mensaje final también", () => {
      const guardadas = plantillasParaGuardar({ ...borradoresDePlantillas({ nps: "Mi NPS" }), nps: DEFAULT_TEMPLATES.nps }, { nps: "Mi NPS" });
      expect(borradoresDePlantillas(guardadas).nps).toBe(DEFAULT_TEMPLATES.nps);
      const db = { clinics: [{ id: "c", name: "Aura", config: { botika: { connected: true, automations: {}, templates: guardadas } } }] } as unknown as DB;
      expect(botikaMessage(db, "nps", { paciente: "Ana", clinica: "Aura" })).toContain("Ana");
    });
  });
});
