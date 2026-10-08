import { describe, it, expect } from "vitest";
import { fusionarFichas, unirTextosMedicos } from "./fusionFichas";
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
