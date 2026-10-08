import { describe, it, expect } from "vitest";
import { aplicarDatosClinica, revisarDatosClinica, MAX_DIRECCION, MAX_NOMBRE_CLINICA, MAX_TELEFONO } from "./datosClinica";
import type { Clinic } from "./types";

describe("revisarDatosClinica (Configuración › Datos de la clínica)", () => {
  it("el nombre es obligatorio: vacío o solo espacios no pasa", () => {
    expect(revisarDatosClinica({ name: "", address: "Av. España 1", phone: "021 555 000" })).toEqual({ ok: false, error: "Escribí el nombre de la clínica." });
    expect(revisarDatosClinica({ name: "   ", address: "", phone: "" })).toEqual({ ok: false, error: "Escribí el nombre de la clínica." });
  });

  it("deja el texto prolijo: sin espacios de más ni caracteres de control", () => {
    expect(revisarDatosClinica({ name: "  Clínica   Sonrisa\tNorte ", address: " Av. España\n1234 ", phone: " +595 21 555 000 " }))
      .toEqual({ ok: true, datos: { name: "Clínica Sonrisa Norte", address: "Av. España 1234", phone: "+595 21 555 000" } });
  });

  it("no toca los signos: dónde se muestra el nombre (pantalla, impresos, correos) ya lo escapa", () => {
    expect(revisarDatosClinica({ name: "Dental & Co <Sur>", address: "", phone: "" })).toEqual({ ok: true, datos: { name: "Dental & Co <Sur>", address: "", phone: "" } });
  });

  it("el nombre tiene un largo razonable: 100 caracteres sí, 101 no", () => {
    expect(MAX_NOMBRE_CLINICA).toBe(100);
    expect(revisarDatosClinica({ name: "a".repeat(100), address: "", phone: "" }).ok).toBe(true);
    expect(revisarDatosClinica({ name: "a".repeat(101), address: "", phone: "" })).toEqual({ ok: false, error: "El nombre es demasiado largo (máximo 100 caracteres)." });
  });

  it("dirección y teléfono pueden quedar vacíos: se guardan como «», porque un campo ausente no se borra en Firestore", () => {
    expect(revisarDatosClinica({ name: "Mi clínica", address: "  ", phone: "" })).toEqual({ ok: true, datos: { name: "Mi clínica", address: "", phone: "" } });
  });

  it("la dirección y el teléfono también tienen tope", () => {
    expect(revisarDatosClinica({ name: "X", address: "a".repeat(MAX_DIRECCION + 1), phone: "" })).toEqual({ ok: false, error: `La dirección es demasiado larga (máximo ${MAX_DIRECCION} caracteres).` });
    expect(revisarDatosClinica({ name: "X", address: "", phone: "1".repeat(MAX_TELEFONO + 1) })).toEqual({ ok: false, error: `El teléfono es demasiado largo (máximo ${MAX_TELEFONO} caracteres).` });
  });
});

describe("aplicarDatosClinica", () => {
  const clinica = {
    id: "c1", name: "Clínica Vieja", plan: "clinica",
    config: { timezone: "America/Asuncion", currency: "PYG", address: "Calle vieja 1", phone: "000", reminderTemplate: "Hola {paciente}", logo: "data:image/png;base64,AAA" },
  } as Clinic;

  it("cambia el nombre, la dirección y el teléfono, y deja todo lo demás como estaba", () => {
    const nueva = aplicarDatosClinica(clinica, { name: "Clínica Nueva", address: "Av. Nueva 2", phone: "111" });
    expect(nueva).toEqual({ ...clinica, name: "Clínica Nueva", config: { ...clinica.config, address: "Av. Nueva 2", phone: "111" } });
    expect(clinica.name).toBe("Clínica Vieja"); // no muta
  });

  it("vaciar la dirección y el teléfono los deja en «», no ausentes", () => {
    const nueva = aplicarDatosClinica(clinica, { name: "Clínica Vieja", address: "", phone: "" });
    expect(nueva.config.address).toBe("");
    expect(nueva.config.phone).toBe("");
    expect(Object.keys(nueva.config)).toContain("address");
  });
});
