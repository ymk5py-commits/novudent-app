import { describe, it, expect } from "vitest";
import { fichaDemasiadoGrande, fusionarFichas, piezasEnConflicto, reasignarClaveDerivada, unirTextosMedicos } from "./fusionFichas";
import { PIEZA_SIN_HALLAZGOS } from "./odontogramaSinHallazgos";
import type { EmrNote, OdontogramStatus, OrthoRecord, Patient, PatientFileRec, PatientForm, PerioSession, Prescription } from "./types";

const ficha = (extra: Partial<Patient> = {}): Patient => ({
  id: "p1", clinicId: "cl", firstName: "María", lastName: "González", document: "3.456.789", phone: "",
  forms: [], historyUpdatePending: false, emr: [], ...extra,
});
const receta = (id: string): Prescription => ({ id, date: "2026-10-01", dentistId: "u2", dentistName: "Dra. Sofía", items: [] });
const nota = (id: string): EmrNote => ({ id, authorId: "u2", authorName: "Dra. Sofía", createdAt: "2026-10-01T09:00:00.000Z", kind: "nota", text: "x" });
const formulario = (id: string): PatientForm => ({ id, templateName: "Historia Clínica", status: "completado", fields: [] });
const archivo = (id: string): PatientFileRec => ({ id, name: "rx.png", kind: "imagen", dataUrl: "data:image/png;base64,AAA", uploadedAt: "2026-10-01", by: "u2" });
const perio = (id: string): PerioSession => ({ id, date: "2026-10-01", by: "u2", teeth: {} });
const orto = (extra: Partial<OrthoRecord> = {}): OrthoRecord => ({ active: true, applianceType: "brackets", diagnosis: "Clase II", startDate: "2026-01-01", monthlyFee: 350000, controls: [], ...extra });
const odonto = (teeth: OdontogramStatus["teeth"], globals: OdontogramStatus["globals"] = {}): OdontogramStatus => ({ version: "2.10", globals, teeth });

describe("fusionarFichas — la ficha que se mantiene absorbe a la duplicada sin perder nada", () => {
  it("se queda con su identidad y completa los datos que le faltan con los de la duplicada", () => {
    const keep = ficha({ id: "k", code: 7 });
    const remove = ficha({
      id: "r", code: 99, phone: "+595 981 111 111", email: "maria@example.com", insurer: "Asismed", address: "Mcal. López 123",
      photo: "data:image/jpeg;base64,AAA", city: "Asunción", birthDate: "1988-04-12", emergencyContact: "Juan (esposo)", emergencyPhone: "0982",
      ruc: "3456789-0", razonSocial: "María González", sex: "F", gender: "F", foreigner: false,
    });
    const m = fusionarFichas(keep, remove);
    expect(m.id).toBe("k");
    expect(m.code).toBe(7);
    expect(m).toMatchObject({
      phone: "+595 981 111 111", email: "maria@example.com", insurer: "Asismed", address: "Mcal. López 123", photo: "data:image/jpeg;base64,AAA",
      city: "Asunción", birthDate: "1988-04-12", emergencyContact: "Juan (esposo)", emergencyPhone: "0982", ruc: "3456789-0", razonSocial: "María González",
      sex: "F", gender: "F", foreigner: false,
    });
  });

  it("no pisa un dato que la ficha que se mantiene sí tiene", () => {
    const m = fusionarFichas(
      ficha({ phone: "0981 000 000", email: "nueva@example.com", insurer: "Asismed" }),
      ficha({ id: "r", phone: "0982 999 999", email: "vieja@example.com", insurer: "Otra" }),
    );
    expect(m).toMatchObject({ phone: "0981 000 000", email: "nueva@example.com", insurer: "Asismed" });
  });

  it("une las alertas médicas, enfermedades y medicamentos de las dos fichas, sin repetir", () => {
    const m = fusionarFichas(
      ficha({ medicalAlerts: "Alérgica a la penicilina", conditions: "Diabetes", medications: "" }),
      ficha({ id: "r", medicalAlerts: "Marcapasos", conditions: "diabetes", medications: "Metformina" }),
    );
    expect(m.medicalAlerts).toBe("Alérgica a la penicilina · Marcapasos");
    expect(m.conditions).toBe("Diabetes");
    expect(m.medications).toBe("Metformina");
  });

  it("junta las recetas sin repetir y no inventa una lista donde ninguna tenía", () => {
    const con = fusionarFichas(ficha({ prescriptions: [receta("a")] }), ficha({ id: "r", prescriptions: [receta("a"), receta("b")] }));
    expect(con.prescriptions?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(fusionarFichas(ficha(), ficha({ id: "r", prescriptions: [receta("b")] })).prescriptions?.map((r) => r.id)).toEqual(["b"]);
    expect(fusionarFichas(ficha(), ficha({ id: "r" })).prescriptions).toBeUndefined();
  });

  it("la ortodoncia de la duplicada no se pierde: pasa entera si la otra no tiene, y si las dos tienen se unen los controles", () => {
    const control = (date: string, note: string) => ({ date, note, by: "Dra. Sofía" });
    const sola = fusionarFichas(ficha(), ficha({ id: "r", ortho: orto({ controls: [control("2026-03-01", "ajuste")] }) }));
    expect(sola.ortho?.controls).toHaveLength(1);

    const ambas = fusionarFichas(
      ficha({ ortho: orto({ controls: [control("2026-03-01", "ajuste"), control("2026-04-01", "elásticos")] }) }),
      ficha({ id: "r", ortho: orto({ diagnosis: "Otro", controls: [control("2026-03-01", "ajuste"), control("2026-05-01", "arco nuevo")] }) }),
    );
    expect(ambas.ortho?.diagnosis).toBe("Clase II"); // el tratamiento de la ficha que se mantiene
    expect(ambas.ortho?.controls.map((c) => c.date)).toEqual(["2026-03-01", "2026-04-01", "2026-05-01"]);
  });

  it("si solo la duplicada tiene el tratamiento activo, el de la ficha que se mantiene no lo tapa", () => {
    const m = fusionarFichas(ficha({ ortho: orto({ active: false, diagnosis: "Terminado" }) }), ficha({ id: "r", ortho: orto({ active: true, diagnosis: "En curso" }) }));
    expect(m.ortho?.active).toBe(true);
    expect(m.ortho?.diagnosis).toBe("En curso");
  });

  it("une historial, evoluciones, archivos y periodontogramas sin repetir ids", () => {
    const m = fusionarFichas(
      ficha({ forms: [formulario("f1")], emr: [nota("n1")], files: [archivo("a1")], perio: [perio("pe1")] }),
      ficha({ id: "r", forms: [formulario("f1"), formulario("f2")], emr: [nota("n2")], files: [archivo("a2")], perio: [perio("pe1"), perio("pe2")] }),
    );
    expect(m.forms.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(m.emr.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(m.files?.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(m.perio?.map((s) => s.id)).toEqual(["pe1", "pe2"]);
  });

  it("si alguna de las dos tiene la Historia Clínica pendiente, la ficha queda pendiente", () => {
    expect(fusionarFichas(ficha(), ficha({ id: "r", historyUpdatePending: true })).historyUpdatePending).toBe(true);
    expect(fusionarFichas(ficha({ historyUpdatePending: true }), ficha({ id: "r" })).historyUpdatePending).toBe(true);
    expect(fusionarFichas(ficha(), ficha({ id: "r" })).historyUpdatePending).toBe(false);
  });

  it("junta las encuestas NPS y deja como última la más reciente", () => {
    const m = fusionarFichas(
      ficha({ nps: { score: 9, at: "2026-06-01" }, npsHistory: [{ score: 9, at: "2026-06-01" }] }),
      ficha({ id: "r", nps: { score: 6, at: "2026-09-01" }, npsHistory: [{ score: 6, at: "2026-09-01" }, { score: 9, at: "2026-06-01" }] }),
    );
    expect(m.npsHistory).toHaveLength(2);
    expect(m.nps).toEqual({ score: 6, at: "2026-09-01" });
  });

  it("odontograma: las piezas de la ficha que se mantiene mandan y las otras se suman", () => {
    const m = fusionarFichas(
      ficha({ odontogram: odonto({ "11": { caries: true } as never }, { wisdomVisible: true }), odontogramUpdatedBy: "Dra. A" }),
      ficha({ id: "r", odontogram: odonto({ "11": { missing: true } as never, "26": { caries: true } as never }, { showBase: true }), odontogramUpdatedBy: "Dra. B" }),
    );
    expect(Object.keys(m.odontogram!.teeth).sort()).toEqual(["11", "26"]);
    expect((m.odontogram!.teeth["11"] as Record<string, unknown>).caries).toBe(true);
    expect(m.odontogram!.globals).toEqual({ wisdomVisible: true, showBase: true });
    expect(m.odontogramUpdatedBy).toBe("Dra. A");
    expect(fusionarFichas(ficha(), ficha({ id: "r" })).odontogram).toBeUndefined();
    expect(fusionarFichas(ficha(), ficha({ id: "r", odontogram: odonto({ "36": { caries: true } as never }) })).odontogram?.teeth["36"]).toBeDefined();
  });

  it("no modifica las fichas que recibe", () => {
    const keep = Object.freeze(ficha({ forms: Object.freeze([formulario("f1")]) as never, prescriptions: Object.freeze([receta("a")]) as never }));
    const remove = Object.freeze(ficha({ id: "r", phone: "0981", forms: Object.freeze([formulario("f2")]) as never, prescriptions: Object.freeze([receta("b")]) as never }));
    expect(() => fusionarFichas(keep, remove)).not.toThrow();
    expect(keep.forms).toHaveLength(1);
  });

  it("la ficha no queda deshabilitada si la que se mantiene está habilitada", () => {
    expect(fusionarFichas(ficha(), ficha({ id: "r", disabled: true })).disabled).toBeFalsy();
    expect(fusionarFichas(ficha({ disabled: true }), ficha({ id: "r" })).disabled).toBe(true);
  });
});

/** TODO campo de `Patient` tiene que figurar acá. Si alguien suma un campo a `Patient`, este objeto deja de compilar y esa
 *  persona tiene que decidir qué pasa con el dato cuando se fusionan dos fichas (completarlo, unirlo o descartarlo a propósito). */
const fichaConTodo: Required<Patient> = {
  id: "dup", clinicId: "cl", firstName: "María", lastName: "González", document: "3.456.789", phone: "0981", email: "m@example.com",
  birthDate: "1988-04-12", insurer: "Asismed", gender: "F", city: "Asunción", sex: "F", tipo: "Particular", socialName: "Mary", foreigner: false,
  internalNumber: "17", municipio: "Asunción", address: "Mcal. López 123", activity: "Docente", employer: "Colegio", landline: "021 555 555",
  guardian: "Ana", referencia: "Instagram", observaciones: "Prefiere la mañana", legalRepDoc: "1.111.111", parentesco: "madre",
  codigoReferido: "PROMO1", barrio: "Recoleta", ruc: "3456789-0", razonSocial: "María González", code: 42, disabled: false,
  emergencyContact: "Juan (esposo)", emergencyPhone: "0982", photo: "data:image/jpeg;base64,AAA", medicalAlerts: "Alergia a la penicilina",
  conditions: "Hipertensión", medications: "Enalapril", forms: [formulario("f1")], historyUpdatePending: true, historyUpdateDate: "2026-10-01",
  emr: [nota("n1")], odontogram: odonto({ "46": { caries: ["caries-occlusal"] } }), odontogramUpdatedBy: "Dra. Sofía", odontogramUpdatedAt: "2026-10-02T10:00:00.000Z",
  prescriptions: [receta("r1")], files: [archivo("a1")], ortho: orto(), perio: [perio("pe1")],
  nps: { score: 9, at: "2026-09-30T10:00:00.000Z" }, npsHistory: [{ score: 9, at: "2026-09-30T10:00:00.000Z" }],
};

describe("fusionarFichas — ningún dato de la duplicada se pierde", () => {
  /** Estos no son datos de la persona sino del registro: la ficha que se mantiene conserva el suyo. */
  const DEL_REGISTRO = new Set(["id", "clinicId", "firstName", "lastName", "code", "disabled"]);

  it("una ficha casi vacía que absorbe una completa termina con todo lo de la completa", () => {
    const vacia = ficha({ id: "k", document: "", phone: "" });
    const m = fusionarFichas(vacia, fichaConTodo) as unknown as Record<string, unknown>;
    const vaciosOUndefined = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    const perdidos = Object.keys(fichaConTodo).filter((k) => !DEL_REGISTRO.has(k) && !vaciosOUndefined((fichaConTodo as unknown as Record<string, unknown>)[k]) && vaciosOUndefined(m[k]));
    expect(perdidos, "campos de la duplicada que no llegaron a la ficha que se mantiene").toEqual([]);
  });

  it("y lo hace al revés: si la que se mantiene es la completa, no pierde nada al absorber una vacía", () => {
    const m = fusionarFichas({ ...fichaConTodo, id: "k" }, ficha({ id: "r", document: "", phone: "" }));
    expect(m).toMatchObject({ phone: "0981", email: "m@example.com", medicalAlerts: "Alergia a la penicilina" });
    expect(m.prescriptions).toHaveLength(1);
    expect(m.ortho?.active).toBe(true);
    expect(m.odontogram?.teeth["46"]).toBeDefined();
  });
});

/* ═══ Lo que encontró la revisión independiente ═══ */

const FDI = ["11", "12", "13", "14", "15", "16", "17", "18", "21", "22", "23", "24", "25", "26", "27", "28", "31", "32", "33", "34", "35", "36", "37", "38", "41", "42", "43", "44", "45", "46", "47", "48"];
type Pieza = OdontogramStatus["teeth"][string];
/** Un odontograma tal como lo guarda el editor: SIEMPRE las 32 piezas, las sanas con el estado por defecto del motor. */
const odontogramaCompleto = (conHallazgos: Record<string, Record<string, unknown>> = {}): OdontogramStatus => ({
  version: "2.10",
  globals: { wisdomVisible: true, showBase: false, occlusalVisible: true, showHealthyPulp: false, edentulous: false },
  teeth: Object.fromEntries(FDI.map((n) => [n, (conHallazgos[n] ? { ...PIEZA_SIN_HALLAZGOS, ...conHallazgos[n] } : PIEZA_SIN_HALLAZGOS) as Pieza])),
});

describe("fusionarFichas — odontogramas completos (como los guarda el editor)", () => {
  it("las 32 piezas sanas de la ficha que se mantiene no tapan los hallazgos de la duplicada", () => {
    const keep = ficha({ odontogram: odontogramaCompleto() });
    const remove = ficha({ id: "r", odontogram: odontogramaCompleto({ "16": { caries: ["caries-occlusal"] }, "36": { endo: "endo-filling" } }) });
    const m = fusionarFichas(keep, remove);
    expect(m.odontogram?.teeth["16"]).toMatchObject({ caries: ["caries-occlusal"] });
    expect(m.odontogram?.teeth["36"]).toMatchObject({ endo: "endo-filling" });
    expect(m.odontogram?.teeth["26"]).toEqual(PIEZA_SIN_HALLAZGOS); // las sanas en las dos siguen sanas
  });

  it("si las dos tienen hallazgos distintos en la misma pieza, manda la ficha que se mantiene", () => {
    const keep = ficha({ odontogram: odontogramaCompleto({ "46": { caries: ["caries-occlusal"] } }) });
    const remove = ficha({ id: "r", odontogram: odontogramaCompleto({ "46": { endo: "endo-filling" }, "11": { caries: ["caries-mesial"] } }) });
    const m = fusionarFichas(keep, remove);
    expect(m.odontogram?.teeth["46"]).toMatchObject({ caries: ["caries-occlusal"], endo: "none" });
    expect(m.odontogram?.teeth["11"]).toMatchObject({ caries: ["caries-mesial"] });
  });

  it("piezasEnConflicto lista solo las piezas donde las dos fichas tienen hallazgos distintos", () => {
    const keep = ficha({ odontogram: odontogramaCompleto({ "46": { caries: ["caries-occlusal"] }, "47": { endo: "endo-filling" } }) });
    const remove = ficha({ id: "r", odontogram: odontogramaCompleto({ "46": { endo: "endo-filling" }, "47": { endo: "endo-filling" }, "11": { caries: ["caries-mesial"] } }) });
    expect(piezasEnConflicto(keep, remove)).toEqual(["46"]); // la 47 es igual en las dos y la 11 solo la tiene una
    expect(piezasEnConflicto(ficha(), remove)).toEqual([]);
  });

  it("el estado global (muelas del juicio, base…) es el de la ficha que se mantiene si tiene odontograma, y el de la duplicada si no", () => {
    const sinPulpa = odontogramaCompleto();
    const conBase = { ...odontogramaCompleto(), globals: { ...sinPulpa.globals, showBase: true } };
    expect(fusionarFichas(ficha({ odontogram: sinPulpa }), ficha({ id: "r", odontogram: conBase })).odontogram?.globals.showBase).toBe(false);
    expect(fusionarFichas(ficha(), ficha({ id: "r", odontogram: conBase })).odontogram?.globals.showBase).toBe(true);
  });
});

describe("fusionarFichas — otros casos de la revisión", () => {
  it("una CI «s/d-…» de una ficha importada sin CI no tapa la CI real de la duplicada", () => {
    const m = fusionarFichas(ficha({ document: "s/d-1760000000000-3" }), ficha({ id: "r", document: "4.123.456" }));
    expect(m.document).toBe("4.123.456");
    // y una CI real de la que se mantiene nunca se pisa
    expect(fusionarFichas(ficha({ document: "3.456.789" }), ficha({ id: "r", document: "4.123.456" })).document).toBe("3.456.789");
    // si las dos son «s/d», queda la de la que se mantiene
    expect(fusionarFichas(ficha({ document: "s/d-1-1" }), ficha({ id: "r", document: "s/d-2-2" })).document).toBe("s/d-1-1");
  });

  it("la última encuesta NPS suelta (sin historial) de las dos fichas queda en el historial", () => {
    const m = fusionarFichas(
      ficha({ nps: { score: 8, at: "2026-06-01T10:00:00.000Z" } }),
      ficha({ id: "r", nps: { score: 9, at: "2026-09-30T10:00:00.000Z" } }),
    );
    expect(m.nps).toEqual({ score: 9, at: "2026-09-30T10:00:00.000Z" });
    expect(m.npsHistory?.map((n) => n.score).sort()).toEqual([8, 9]);
  });

  it("evoluciones, recetas y periodontogramas quedan de la más nueva a la más vieja, como los deja el store al agregar", () => {
    const n = (id: string, createdAt: string): EmrNote => ({ ...nota(id), createdAt });
    const r = (id: string, date: string): Prescription => ({ ...receta(id), date });
    const pe = (id: string, date: string): PerioSession => ({ ...perio(id), date });
    const m = fusionarFichas(
      ficha({ emr: [n("n2", "2026-10-02T09:00:00.000Z"), n("n1", "2026-09-01T09:00:00.000Z")], prescriptions: [r("r2", "2026-10-02"), r("r1", "2026-09-01")], perio: [pe("pe2", "2026-10-02"), pe("pe1", "2026-09-01")] }),
      ficha({ id: "x", emr: [n("n3", "2026-10-05T09:00:00.000Z"), n("n0", "2026-08-01T09:00:00.000Z")], prescriptions: [r("r3", "2026-10-05"), r("r0", "2026-08-01")], perio: [pe("pe3", "2026-10-05"), pe("pe0", "2026-08-01")] }),
    );
    expect(m.emr.map((x) => x.id)).toEqual(["n3", "n2", "n1", "n0"]);
    expect(m.prescriptions?.map((x) => x.id)).toEqual(["r3", "r2", "r1", "r0"]);
    expect(m.perio?.map((x) => x.id)).toEqual(["pe3", "pe2", "pe1", "pe0"]);
  });
});

describe("fichaDemasiadoGrande — el documento del paciente tiene que entrar en Firestore (1 MiB)", () => {
  const archivoGrande = (id: string, kb: number): PatientFileRec => ({ ...archivo(id), dataUrl: `data:image/png;base64,${"A".repeat(kb * 1024)}` });

  it("una ficha normal entra", () => {
    expect(fichaDemasiadoGrande(ficha({ files: [archivoGrande("a1", 200)] }))).toBe(false);
  });

  it("dos fichas con radiografías que juntas pasan de ~900 KB no entran: la fusión se frena en vez de borrar la duplicada", () => {
    const a = ficha({ files: [archivoGrande("a1", 250), archivoGrande("a2", 250)] });
    const b = ficha({ id: "r", files: [archivoGrande("b1", 250), archivoGrande("b2", 250)] });
    expect(fichaDemasiadoGrande(a)).toBe(false);
    expect(fichaDemasiadoGrande(b)).toBe(false);
    expect(fichaDemasiadoGrande(fusionarFichas(a, b))).toBe(true);
  });

  it("cuenta bytes y no letras: los acentos pesan dos", () => {
    expect(fichaDemasiadoGrande(ficha({ medicalAlerts: "á".repeat(460_000) }))).toBe(true);
    expect(fichaDemasiadoGrande(ficha({ medicalAlerts: "a".repeat(460_000) }))).toBe(false);
  });
});

describe("reasignarClaveDerivada — las tareas cerradas o postergadas de una fusión siguen valiendo", () => {
  it("las claves que llevan el id del paciente pasan al de la ficha que queda", () => {
    expect(reasignarClaveDerivada("cobranza:r", "r", "k")).toBe("cobranza:k");
    expect(reasignarClaveDerivada("control:r", "r", "k")).toBe("control:k");
    expect(reasignarClaveDerivada("cheque:r", "r", "k")).toBe("cheque:k");
  });

  it("las que llevan el id de un presupuesto o de una cita, las de otro paciente y las que no tienen clave no cambian", () => {
    expect(reasignarClaveDerivada("captura:r", "r", "k")).toBe("captura:r"); // un presupuesto que casualmente se llama igual
    expect(reasignarClaveDerivada("cita:a1", "r", "k")).toBe("cita:a1");
    expect(reasignarClaveDerivada("cobranza:otro", "r", "k")).toBe("cobranza:otro");
    expect(reasignarClaveDerivada(undefined, "r", "k")).toBeUndefined();
  });
});

describe("unirTextosMedicos", () => {
  it("uno vacío → el otro; iguales o uno dentro del otro → el más completo; distintos → los dos", () => {
    expect(unirTextosMedicos(undefined, "Diabetes")).toBe("Diabetes");
    expect(unirTextosMedicos("Diabetes", "  ")).toBe("Diabetes");
    expect(unirTextosMedicos("Diabetes", "diabetes")).toBe("Diabetes");
    expect(unirTextosMedicos("Diabetes tipo 2", "diabetes")).toBe("Diabetes tipo 2");
    expect(unirTextosMedicos("Diabetes", "Hipertensión")).toBe("Diabetes · Hipertensión");
    expect(unirTextosMedicos(undefined, undefined)).toBeUndefined();
  });
});
