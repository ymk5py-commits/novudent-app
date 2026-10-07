import { describe, it, expect } from "vitest";
import { enRetencion, listaPendientes, HREF_DOCUMENTOS_PENDIENTES, HREF_RETENCIONES } from "./pendientes";
import type { BillingRecord, DocumentoClinico, PatientForm } from "./types";

const pac = (id: string, firstName: string, lastName: string, forms: PatientForm[] = []) => ({ id, firstName, lastName, forms });
const form = (id: string, nombre: string, status: "pendiente" | "completado" = "pendiente"): PatientForm => ({ id, templateName: nombre, status, fields: [] });
const doc = (id: string, patientId: string, nombre: string, estado: DocumentoClinico["estado"] = "pendiente"): DocumentoClinico => ({
  id, clinicId: "c", patientId, plantillaId: "x", nombre, tipo: "texto", estado,
  createdAt: "2026-10-01T10:00:00.000Z", createdBy: "u1", createdByName: "Laura",
});
const fac = (id: string, patientId: string, flags: BillingRecord["flags"], holdReason?: string) =>
  ({ id, patientId, flags, holdReason }) as Pick<BillingRecord, "id" | "patientId" | "flags" | "holdReason">;

const pacientes = [pac("p1", "María", "González", [form("f1", "Historia médica")]), pac("p2", "Juan", "Ríos"), pac("p3", "Ana", "Acosta")];
const todo = { verDocumentos: true, verRetenciones: true };

describe("enRetencion", () => {
  it("HOLD y MGRHOLD son retención; el resto no", () => {
    expect(enRetencion({ flags: ["HOLD"] })).toBe(true);
    expect(enRetencion({ flags: ["MBILLED", "MGRHOLD"] })).toBe(true);
    expect(enRetencion({ flags: ["FACTURADO"] })).toBe(false);
    expect(enRetencion({ flags: [] })).toBe(false);
  });
});

describe("listaPendientes · documentos", () => {
  it("una fila por paciente, ordenada por nombre, con el documento pendiente y el link a su pestaña", () => {
    const r = listaPendientes({ ...todo, patients: pacientes, docs: [doc("d1", "p2", "Historia Clínica")], billing: [] });
    expect(r.documentos).toEqual([
      { id: "doc_p2", tipo: "documentos", titulo: "Juan Ríos", detalle: "Historia Clínica", href: "/app/pacientes/p2?tab=documentos" },
      { id: "doc_p1", tipo: "documentos", titulo: "María González", detalle: "Historia médica", href: "/app/pacientes/p1?tab=documentos" },
    ]);
    expect(r.total).toBe(2);
  });

  it("resume los nombres cuando hay varios: uno, dos o «y N más»", () => {
    const uno = listaPendientes({ ...todo, patients: [pac("p1", "A", "B")], docs: [doc("d1", "p1", "Uno")], billing: [] });
    const dos = listaPendientes({ ...todo, patients: [pac("p1", "A", "B")], docs: [doc("d1", "p1", "Uno"), doc("d2", "p1", "Dos")], billing: [] });
    const cuatro = listaPendientes({ ...todo, patients: [pac("p1", "A", "B")], docs: ["Uno", "Dos", "Tres", "Cuatro"].map((n, i) => doc(`d${i}`, "p1", n)), billing: [] });
    expect(uno.documentos[0].detalle).toBe("Uno");
    expect(dos.documentos[0].detalle).toMatch(/^(Uno y Dos|Dos y Uno)$/);
    expect(cuatro.documentos[0].detalle).toMatch(/^\w+, \w+ y 2 más$/);
  });

  it("no cuenta los documentos completados ni anulados", () => {
    const r = listaPendientes({ ...todo, patients: [pac("p1", "A", "B"), pac("p2", "C", "D")], docs: [doc("d1", "p1", "X", "completado"), doc("d2", "p2", "Y", "anulado")], billing: [] });
    expect(r.documentos).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("sin permiso para ver documentos, no hay filas de documentos", () => {
    const r = listaPendientes({ verDocumentos: false, verRetenciones: true, patients: pacientes, docs: [doc("d1", "p2", "Historia Clínica")], billing: [] });
    expect(r.documentos).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe("listaPendientes · retenciones de facturación", () => {
  it("una fila por reclamo en retención, con el motivo y el link a Facturación filtrada", () => {
    const sinFormularios = pacientes.map((p) => ({ ...p, forms: [] }));
    const r = listaPendientes({
      ...todo, patients: sinFormularios, docs: [],
      billing: [fac("b1", "p1", ["MBILLED", "HOLD"], "Falta el código de diagnóstico"), fac("b2", "p2", ["MGRHOLD"]), fac("b3", "p3", ["FACTURADO"])],
    });
    expect(r.retenciones).toEqual([
      { id: "ret_b1", tipo: "retencion", titulo: "María González", detalle: "Falta el código de diagnóstico", href: HREF_RETENCIONES },
      { id: "ret_b2", tipo: "retencion", titulo: "Juan Ríos", detalle: "En retención", href: HREF_RETENCIONES },
    ]);
    expect(r.total).toBe(2);
  });

  it("un reclamo de un paciente que ya no existe igual aparece", () => {
    const r = listaPendientes({ ...todo, patients: [], docs: [], billing: [fac("b1", "fantasma", ["HOLD"])] });
    expect(r.retenciones[0].titulo).toBe("Paciente sin ficha");
  });

  it("sin permiso para ver montos, no hay retenciones", () => {
    const r = listaPendientes({ verDocumentos: true, verRetenciones: false, patients: pacientes, docs: [], billing: [fac("b1", "p1", ["HOLD"])] });
    expect(r.retenciones).toEqual([]);
  });
});

describe("listaPendientes · total y links", () => {
  it("el total suma pacientes con documentos pendientes más reclamos en retención (como contaba la campana)", () => {
    const r = listaPendientes({
      ...todo, patients: pacientes, docs: [doc("d1", "p2", "Historia Clínica"), doc("d2", "p2", "Otro")],
      billing: [fac("b1", "p1", ["HOLD"])],
    });
    expect(r.documentos).toHaveLength(2); // p1 (formulario viejo) y p2 (dos documentos = una fila)
    expect(r.retenciones).toHaveLength(1);
    expect(r.total).toBe(3);
  });

  it("los links de «ver todos» son rutas fijas", () => {
    expect(HREF_DOCUMENTOS_PENDIENTES).toBe("/app/pacientes?pendientes=documentos");
    expect(HREF_RETENCIONES).toBe("/app/facturacion?filtro=en-retencion");
  });
});
