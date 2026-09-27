import { describe, it, expect } from "vitest";
import { CAMPOS, CONTEXTOS, camposDe, visibles, faltantes, datosPaciente, extrasOnline } from "./camposPaciente";
import type { FieldConfig } from "./types";

const req = (ctx: "nuevo" | "agenda" | "online", config?: Record<string, FieldConfig>) =>
  camposDe(config, ctx).filter((c) => c.requerido).map((c) => c.key);
const pres = (ctx: "nuevo" | "agenda" | "online", config?: Record<string, FieldConfig>) =>
  visibles(config, ctx).map((c) => c.key);

describe("catálogo", () => {
  it("son los 21 campos de la matriz de Dentalink, en su orden", () => {
    expect(CAMPOS).toHaveLength(21);
    expect(CAMPOS[0].key).toBe("nombreLegal");
    expect(CAMPOS.at(-1)?.key).toBe("dniRepLegal");
    expect(new Set(CAMPOS.map((c) => c.key)).size).toBe(21);
  });

  it("los contextos son nuevo paciente, al agendar y agenda online (el check-in queda para después)", () => {
    expect(CONTEXTOS.map((c) => c.key)).toEqual(["nuevo", "agenda", "online"]);
  });
});

describe("sin configuración guardada, la app se comporta como hasta ahora", () => {
  it("nuevo paciente: nombre, apellidos, CI y teléfono obligatorios; email y convenio opcionales", () => {
    expect(pres("nuevo")).toEqual(["nombreLegal", "apellidos", "documento", "email", "convenio", "telefonoMovil"]);
    expect(req("nuevo")).toEqual(["nombreLegal", "apellidos", "documento", "telefonoMovil"]);
  });

  it("al agendar pide lo mismo que el alta de paciente", () => {
    expect(pres("agenda")).toEqual(pres("nuevo"));
    expect(req("agenda")).toEqual(req("nuevo"));
  });

  it("agenda online: nombre, apellidos, CI y WhatsApp", () => {
    expect(pres("online")).toEqual(["nombreLegal", "apellidos", "documento", "telefonoMovil"]);
    expect(req("online")).toEqual(["nombreLegal", "apellidos", "documento", "telefonoMovil"]);
  });
});

describe("la configuración de la clínica manda", () => {
  it("prender un campo lo muestra; marcarlo requerido lo exige", () => {
    const config = { fechaNacimiento: { present: { nuevo: true }, required: { nuevo: true } } };
    expect(pres("nuevo", config)).toContain("fechaNacimiento");
    expect(req("nuevo", config)).toContain("fechaNacimiento");
    expect(pres("agenda", config)).not.toContain("fechaNacimiento"); // cada contexto va por separado
  });

  it("un «no» explícito apaga un campo que por defecto estaba", () => {
    const config = { email: { present: { nuevo: false } }, documento: { required: { nuevo: false } } };
    expect(pres("nuevo", config)).not.toContain("email");
    expect(pres("nuevo", config)).toContain("documento");
    expect(req("nuevo", config)).not.toContain("documento");
  });

  it("requerido sin presente no cuenta: un campo oculto no se puede exigir", () => {
    const config = { ciudad: { present: { nuevo: false }, required: { nuevo: true } } };
    expect(req("nuevo", config)).not.toContain("ciudad");
  });

  it("nombre y apellidos no se pueden apagar en ningún contexto", () => {
    const config = { nombreLegal: { present: { nuevo: false, agenda: false, online: false }, required: { nuevo: false } } };
    for (const ctx of ["nuevo", "agenda", "online"] as const) {
      const nombre = camposDe(config, ctx).find((c) => c.key === "nombreLegal")!;
      expect(nombre).toMatchObject({ presente: true, requerido: true, fijo: true });
    }
  });

  it("en la reserva online CI y WhatsApp son fijos: la reserva busca al paciente por CI y confirma por WhatsApp", () => {
    const config = { documento: { required: { online: false } }, telefonoMovil: { present: { online: false } } };
    expect(req("online", config)).toEqual(expect.arrayContaining(["documento", "telefonoMovil"]));
  });

  it("número interno y observaciones no aplican en la reserva online: los carga la clínica", () => {
    const config = { numeroInterno: { present: { online: true }, required: { online: true } }, observaciones: { present: { online: true } } };
    expect(pres("online", config)).not.toContain("numeroInterno");
    expect(pres("online", config)).not.toContain("observaciones");
    expect(camposDe(config, "online").find((c) => c.key === "numeroInterno")?.noAplica).toBe(true);
  });
});

describe("validación", () => {
  it("faltantes devuelve los requeridos vacíos (los espacios no cuentan)", () => {
    const campos = camposDe(undefined, "nuevo");
    expect(faltantes(campos, { nombreLegal: "Ana", apellidos: "  ", documento: "123", telefonoMovil: "" })).toEqual(["Apellidos", "Teléfono móvil"]);
    expect(faltantes(campos, { nombreLegal: "Ana", apellidos: "Paz", documento: "123", telefonoMovil: "0981" })).toEqual([]);
  });

  it("datosPaciente pasa los valores a los campos del paciente y descarta vacíos y opciones inválidas", () => {
    const campos = CAMPOS.map((c) => ({ ...c, presente: true, requerido: false, fijo: false, noAplica: false }));
    expect(
      datosPaciente(campos, {
        nombreLegal: " Ana ", apellidos: "Paz", documento: "1.234.567", telefonoMovil: "0981 111 222",
        email: "", fechaNacimiento: "1990-04-12", sexo: "F", genero: "cualquiera", ciudad: "Luque",
      }),
    ).toEqual({
      firstName: "Ana", lastName: "Paz", document: "1.234.567", phone: "0981 111 222",
      birthDate: "1990-04-12", sex: "F", city: "Luque",
    });
  });

  it("datosPaciente ignora los campos que no están presentes en el contexto", () => {
    const campos = camposDe(undefined, "nuevo");
    expect(datosPaciente(campos, { nombreLegal: "Ana", apellidos: "Paz", ciudad: "Luque" })).toEqual({ firstName: "Ana", lastName: "Paz" });
  });

  it("una fecha de nacimiento imposible no se guarda", () => {
    const campos = camposDe({ fechaNacimiento: { present: { nuevo: true } } }, "nuevo");
    expect(datosPaciente(campos, { fechaNacimiento: "2999-01-01" }).birthDate).toBeUndefined();
    expect(datosPaciente(campos, { fechaNacimiento: "12/04/1990" }).birthDate).toBeUndefined();
  });
});

describe("extrasOnline (lo que la página pública pide además de nombre, CI y WhatsApp)", () => {
  it("sin configuración no hay extras", () => {
    expect(extrasOnline(undefined)).toEqual([]);
  });

  it("devuelve solo lo público: clave, etiqueta, tipo y si es requerido", () => {
    const extras = extrasOnline({ email: { present: { online: true }, required: { online: true } }, ciudad: { present: { online: true } } });
    expect(extras).toEqual([
      { key: "email", label: "Email", tipo: "email", requerido: true },
      { key: "ciudad", label: "Ciudad", tipo: "texto", requerido: false },
    ]);
  });
});
