import { describe, it, expect } from "vitest";
import { planificarImportacion } from "./importacionPacientes";
import { historiaClinicaPendiente, historiasClinicasPendientes, pendientesPorPaciente } from "./documentosClinicos";
import { PLANTILLAS_DE_FABRICA } from "./plantillasDocumento";
import type { PatientForm } from "./types";

const fila = (document: string, nombre = "X") => ({ patient: { document, firstName: nombre }, debt: 0 });
const existentes = [{ document: "3.456.789" }, { document: "4.567.890" }];

describe("planificarImportacion: qué filas del archivo se cargan", () => {
  it("separa las nuevas, las que ya están en Novudent y las repetidas dentro del archivo", () => {
    const r = planificarImportacion(
      [fila("7.000.001", "Ana"), fila("7.000.002", "Beto"), fila("7000001", "Ana otra vez"), fila("3.456.789", "María")],
      existentes,
    );
    expect(r.nuevos.map((f) => f.patient.firstName)).toEqual(["Ana", "Beto"]);
    expect(r.repetidos.map((f) => f.patient.firstName)).toEqual(["Ana otra vez"]);
    expect(r.yaExisten.map((f) => f.patient.firstName)).toEqual(["María"]);
  });

  it("compara la CI sin puntos, guiones ni espacios: «3456789» es la de «3.456.789»", () => {
    const r = planificarImportacion([fila("3456789"), fila(" 4-567-890 ")], existentes);
    expect(r.nuevos).toHaveLength(0);
    expect(r.yaExisten).toHaveLength(2);
  });

  it("la primera aparición se queda y las demás se saltean, en el orden del archivo", () => {
    const r = planificarImportacion([fila("9.000.001", "primera"), fila("9.000.001", "segunda"), fila("9.000.001", "tercera")], []);
    expect(r.nuevos.map((f) => f.patient.firstName)).toEqual(["primera"]);
    expect(r.repetidos.map((f) => f.patient.firstName)).toEqual(["segunda", "tercera"]);
  });

  it("dos filas con la CI de alguien que ya existe cuentan las dos como «ya existe»", () => {
    const r = planificarImportacion([fila("3.456.789", "a"), fila("3456789", "b")], existentes);
    expect(r.yaExisten).toHaveLength(2);
    expect(r.repetidos).toHaveLength(0);
  });

  it("las filas sin CI (o con «s/d», ceros…) nunca son duplicados: se cargan todas", () => {
    const r = planificarImportacion([fila(""), fila(""), fila("s/d"), fila("s/d"), fila("0"), fila("000000"), fila("000000")], [{ document: "s/d" }, { document: "" }]);
    expect(r.nuevos).toHaveLength(7);
    expect(r.yaExisten).toHaveLength(0);
    expect(r.repetidos).toHaveLength(0);
  });

  it("conserva todo lo demás de la fila (la deuda, por ejemplo)", () => {
    const r = planificarImportacion([{ patient: { document: "7.000.001" }, debt: 150000 }], []);
    expect(r.nuevos[0]).toEqual({ patient: { document: "7.000.001" }, debt: 150000 });
  });
});

describe("historiasClinicasPendientes (cada paciente importado queda con la Historia Clínica pendiente)", () => {
  const por = { plantillas: PLANTILLAS_DE_FABRICA, by: { id: "u5", name: "Laura Recepción" }, now: "2026-10-08T12:00:00.000Z" };

  it("deja una Historia Clínica pendiente por paciente, con el mismo id que le pone el alta de uno solo", () => {
    const docs = historiasClinicasPendientes([{ id: "p_1_0", clinicId: "c1" }, { id: "p_1_1", clinicId: "c1" }], por);
    expect(docs.map((d) => d.id)).toEqual(["cd_p_1_0_hc", "cd_p_1_1_hc"]);
    expect(docs.map((d) => d.patientId)).toEqual(["p_1_0", "p_1_1"]);
    for (const d of docs) expect(d).toMatchObject({ clinicId: "c1", plantillaId: "historia_clinica", estado: "pendiente", createdByName: "Laura Recepción" });
    // El id coincide con el que arma `crearPaciente` (store) con `historiaClinicaPendiente`: repetir la carga no duplica nada.
    expect(docs[0]).toEqual(historiaClinicaPendiente({ id: "cd_p_1_0_hc", clinicId: "c1", patientId: "p_1_0", ...por }));
  });

  it("cuentan como pendientes de cada paciente (campana, Inicio, cabecera de la ficha)", () => {
    const pacientes = [{ id: "p_1_0", clinicId: "c1", forms: [] as PatientForm[] }, { id: "p_1_1", clinicId: "c1", forms: [] as PatientForm[] }];
    const pendientes = pendientesPorPaciente(pacientes, historiasClinicasPendientes(pacientes, por));
    expect([...pendientes.entries()]).toEqual([["p_1_0", 1], ["p_1_1", 1]]);
  });

  it("sin la plantilla activa no crea nada, y sin pacientes tampoco", () => {
    expect(historiasClinicasPendientes([{ id: "p_1_0", clinicId: "c1" }], { ...por, plantillas: [] })).toEqual([]);
    expect(historiasClinicasPendientes([], por)).toEqual([]);
  });
});
