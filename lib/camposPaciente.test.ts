import { describe, it, expect } from "vitest";
import {
  CAMPOS, CONTEXTOS, camposDe, visibles, faltantes, datosPaciente, extrasOnline, esMenor, siguienteCodigo, codigosFaltantes, nuevoPaciente,
  claveDeCI, pacientesConCI, requeridos, invalidos, revisar,
} from "./camposPaciente";
import type { FieldConfig } from "./types";

const req = (ctx: "nuevo" | "agenda" | "online", config?: Record<string, FieldConfig>) =>
  camposDe(config, ctx).filter((c) => c.requerido).map((c) => c.key);
const pres = (ctx: "nuevo" | "agenda" | "online", config?: Record<string, FieldConfig>) =>
  visibles(config, ctx).map((c) => c.key);

describe("catálogo", () => {
  it("son los 21 campos de Dentalink más los 5 que pidió Novum, agrupados por sección", () => {
    expect(CAMPOS).toHaveLength(26);
    expect(CAMPOS[0].key).toBe("nombreLegal");
    expect(new Set(CAMPOS.map((c) => c.key)).size).toBe(26);
    for (const k of ["barrio", "parentesco", "ruc", "razonSocial", "codigoReferido"]) expect(CAMPOS.some((c) => c.key === k)).toBe(true);
    expect(CAMPOS.filter((c) => c.grupo === "responsable").map((c) => c.label)).toEqual(["Responsable", "CI del responsable", "Qué es del paciente"]);
  });

  it("los contextos son nuevo paciente, al agendar y agenda online (el check-in queda para después)", () => {
    expect(CONTEXTOS.map((c) => c.key)).toEqual(["nuevo", "agenda", "online"]);
  });
});

describe("sin configuración guardada, se pide lo de la revisión de Novum", () => {
  it("nuevo paciente: obligatorios nombre, apellido, CI, fecha de nacimiento, sexo, género, teléfono y email", () => {
    expect(req("nuevo")).toEqual(["nombreLegal", "apellidos", "documento", "fechaNacimiento", "sexo", "genero", "telefonoMovil", "email"]);
    for (const k of ["email", "barrio", "direccion", "ruc", "razonSocial", "convenio", "actividad", "referencia", "codigoReferido", "apoderado", "dniRepLegal", "parentesco"]) {
      expect(pres("nuevo")).toContain(k);
    }
    expect(pres("nuevo")).not.toContain("empleador");
  });

  it("al agendar pide lo mismo que el alta de paciente", () => {
    expect(pres("agenda")).toEqual(pres("nuevo"));
    expect(req("agenda")).toEqual(req("nuevo"));
  });

  it("agenda online: nombre, apellidos, CI, WhatsApp y email (la reserva crea la ficha del paciente)", () => {
    expect(pres("online")).toEqual(["nombreLegal", "apellidos", "documento", "telefonoMovil", "email"]);
    expect(req("online")).toEqual(["nombreLegal", "apellidos", "documento", "telefonoMovil", "email"]);
  });

  it("el email es obligatorio por defecto pero la clínica puede soltarlo (no es un campo fijo)", () => {
    const config = { email: { required: { nuevo: false, agenda: false, online: false } } };
    for (const ctx of ["nuevo", "agenda", "online"] as const) {
      expect(req(ctx, config)).not.toContain("email");
      expect(camposDe(config, ctx).find((c) => c.key === "email")).toMatchObject({ presente: true, requerido: false, fijo: false });
    }
  });
});

describe("la configuración de la clínica manda", () => {
  it("prender un campo lo muestra; marcarlo requerido lo exige", () => {
    const config = { empleador: { present: { nuevo: true }, required: { nuevo: true } } };
    expect(pres("nuevo", config)).toContain("empleador");
    expect(req("nuevo", config)).toContain("empleador");
    expect(pres("agenda", config)).not.toContain("empleador"); // cada contexto va por separado
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
    expect(faltantes(campos, { nombreLegal: "Ana", apellidos: "  ", documento: "123", telefonoMovil: "" }))
      .toEqual(["Apellidos", "Fecha de nacimiento", "Sexo", "Género", "Teléfono móvil", "Email"]);
    const completo = { nombreLegal: "Ana", apellidos: "Paz", documento: "123", telefonoMovil: "0981", email: "ana@correo.com", fechaNacimiento: "1990-04-12", sexo: "F", genero: "F" };
    expect(faltantes(campos, completo)).toEqual([]);
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
    expect(datosPaciente(campos, { nombreLegal: "Ana", apellidos: "Paz", empleador: "ACME" })).toEqual({ firstName: "Ana", lastName: "Paz" });
  });

  it("una fecha de nacimiento imposible no se guarda", () => {
    const campos = camposDe({ fechaNacimiento: { present: { nuevo: true } } }, "nuevo");
    expect(datosPaciente(campos, { fechaNacimiento: "2999-01-01" }).birthDate).toBeUndefined();
    expect(datosPaciente(campos, { fechaNacimiento: "12/04/1990" }).birthDate).toBeUndefined();
  });
});

describe("extrasOnline (lo que la página pública pide además de nombre, CI y WhatsApp)", () => {
  it("sin configuración el único extra es el email, obligatorio", () => {
    expect(extrasOnline(undefined)).toEqual([{ key: "email", label: "Email", tipo: "email", requerido: true }]);
  });

  it("devuelve solo lo público: clave, etiqueta, tipo y si es requerido", () => {
    const extras = extrasOnline({ email: { present: { online: true }, required: { online: true } }, ciudad: { present: { online: true } } });
    expect(extras).toEqual([
      { key: "email", label: "Email", tipo: "email", requerido: true },
      { key: "ciudad", label: "Ciudad", tipo: "texto", requerido: false },
    ]);
  });
});

describe("paciente menor de edad", () => {
  const HOY = Date.parse("2026-09-27T12:00:00Z");
  it("esMenor calcula la edad con la fecha de nacimiento", () => {
    expect(esMenor({ fechaNacimiento: "2010-01-01" }, HOY)).toBe(true);
    expect(esMenor({ fechaNacimiento: "2008-09-27" }, HOY)).toBe(false); // cumple 18 hoy
    expect(esMenor({ fechaNacimiento: "2008-09-28" }, HOY)).toBe(true);
    expect(esMenor({}, HOY)).toBe(false);
  });

  it("si es menor, el responsable es obligatorio aunque la clínica no lo haya marcado", () => {
    const config = { apoderado: { present: { nuevo: false } }, dniRepLegal: { present: { nuevo: false } }, parentesco: { present: { nuevo: false } } };
    const campos = camposDe(config, "nuevo");
    const base = { nombreLegal: "Leo", apellidos: "Paz", documento: "9", telefonoMovil: "0981", email: "leo@correo.com", sexo: "M", genero: "M" };
    expect(faltantes(campos, { ...base, fechaNacimiento: "2015-05-05" })).toEqual(["Responsable", "CI del responsable", "Qué es del paciente"]);
    expect(faltantes(campos, { ...base, fechaNacimiento: "1990-05-05" })).toEqual([]);
    expect(datosPaciente(campos, { ...base, fechaNacimiento: "2015-05-05", apoderado: "Ana Paz", dniRepLegal: "123", parentesco: "Madre" }))
      .toMatchObject({ guardian: "Ana Paz", legalRepDoc: "123", parentesco: "Madre" });
  });

  it("género acepta «Prefiero no decirlo»", () => {
    const campos = camposDe(undefined, "nuevo");
    expect(datosPaciente(campos, { genero: "nd" }).gender).toBe("nd");
  });
});

describe("alta de paciente", () => {
  it("ya no crea el formulario «Anamnesis inicial»: la Historia Clínica pendiente la deja crearPaciente como documento clínico", () => {
    const p = nuevoPaciente({ firstName: "A", lastName: "B" }, "cl", 1);
    expect(p.forms).toEqual([]);
    expect(p.emr).toEqual([]);
  });
});

describe("código interno", () => {
  it("el siguiente es el mayor más uno", () => {
    expect(siguienteCodigo([])).toBe(1);
    expect(siguienteCodigo([{ code: 3 }, {}, { code: 7 }])).toBe(8);
    expect(nuevoPaciente({ firstName: "A" }, "cl", 1, 9).code).toBe(9);
  });

  it("los pacientes viejos reciben códigos en orden de alta, a continuación del mayor", () => {
    const r = codigosFaltantes([{ id: "p_300" }, { id: "p1", code: 1 }, { id: "p_20" }, { id: "p2" }]);
    expect(r).toEqual([{ id: "p2", code: 2 }, { id: "p_20", code: 3 }, { id: "p_300", code: 4 }]);
  });
});

/* ═══ CI repetida (B1a) ═══ */

describe("claveDeCI: con qué se compara una CI", () => {
  it("sin puntos, guiones ni espacios y sin distinguir mayúsculas: «3.456.789» y «3456789» son la misma", () => {
    expect(claveDeCI("3.456.789")).toBe("3456789");
    expect(claveDeCI(" 3 456-789 ")).toBe("3456789");
    expect(claveDeCI("AB-123456")).toBe("ab123456"); // pasaportes
  });

  it("lo que no identifica a nadie no sirve para comparar: vacío, «s/d», ceros, un solo dígito repetido, muy corto", () => {
    for (const v of ["", "   ", "s/d", "sin ci", "-", "0", "12", "000000", "1111111"]) expect(claveDeCI(v), `«${v}»`).toBeNull();
    expect(claveDeCI(undefined)).toBeNull();
  });
});

describe("pacientesConCI", () => {
  const todos = [
    { id: "p1", document: "3.456.789" },
    { id: "p2", document: "4.567.890" },
    { id: "p3", document: "s/d" },
    { id: "p4", document: "s/d" },
  ];

  it("encuentra a quien ya tiene esa CI aunque esté escrita distinto", () => {
    expect(pacientesConCI(todos, "3456789").map((p) => p.id)).toEqual(["p1"]);
    expect(pacientesConCI(todos, "9.999.999")).toEqual([]);
  });

  it("al editar, el propio paciente no cuenta", () => {
    expect(pacientesConCI(todos, "3.456.789", "p1")).toEqual([]);
    expect(pacientesConCI(todos, "3.456.789", "p2").map((p) => p.id)).toEqual(["p1"]);
  });

  it("una CI que no sirve para comparar nunca coincide: los «s/d» no se confunden entre sí", () => {
    expect(pacientesConCI(todos, "s/d")).toEqual([]);
    expect(pacientesConCI(todos, "")).toEqual([]);
    expect(pacientesConCI(todos, undefined)).toEqual([]);
  });
});

/* ═══ Revisión del formulario (B8) ═══ */

describe("requeridos: lo que de verdad se exige", () => {
  it("los requeridos presentes, más el responsable si el paciente es menor", () => {
    const campos = camposDe(undefined, "nuevo");
    expect(requeridos(campos, {}).map((c) => c.key)).toEqual(["nombreLegal", "apellidos", "documento", "fechaNacimiento", "sexo", "genero", "telefonoMovil", "email"]);
    const conMenor = requeridos(campos, { fechaNacimiento: "2018-01-01" }).map((c) => c.key);
    expect(conMenor).toEqual(expect.arrayContaining(["apoderado", "dniRepLegal", "parentesco"]));
  });
});

describe("invalidos: lo cargado que se descartaría en silencio", () => {
  const campos = camposDe(undefined, "nuevo");

  it("un email sin dominio y una fecha de nacimiento futura se detectan", () => {
    expect(invalidos(campos, { email: "ana@correo", fechaNacimiento: "2999-01-01" }).map((c) => c.label)).toEqual(["Fecha de nacimiento", "Email"]);
  });

  it("lo vacío no es inválido (de eso se ocupa faltantes) y lo correcto pasa", () => {
    expect(invalidos(campos, { email: "  ", documento: "", fechaNacimiento: "" })).toEqual([]);
    expect(invalidos(campos, { email: "ana@correo.com", fechaNacimiento: "1990-04-12", sexo: "F" })).toEqual([]);
  });

  it("no mira los campos que el contexto no muestra", () => {
    expect(invalidos(campos, { empleador: "<>" })).toEqual([]);
  });
});

describe("revisar: un solo mensaje con todo lo que hay que corregir", () => {
  const campos = camposDe(undefined, "nuevo");
  const completo = { nombreLegal: "Ana", apellidos: "Paz", documento: "1.234.567", fechaNacimiento: "1990-05-20", sexo: "F", genero: "nd", telefonoMovil: "0981 111 222", email: "ana@correo.com" };

  it("sin problemas no hay mensaje", () => {
    expect(revisar(campos, completo)).toMatchObject({ mensaje: null, claves: [] });
  });

  it("todo vacío: lista los ocho obligatorios, en el orden del formulario", () => {
    const r = revisar(campos, {});
    expect(r.mensaje).toBe("Completá: Nombre legal, Apellidos, Cédula / DNI, Fecha de nacimiento, Sexo, Género, Teléfono móvil, Email.");
    expect(r.claves[0]).toBe("nombreLegal");
    expect(r.claves).toHaveLength(8);
  });

  it("los espacios no cuentan como dato y un correo sin dominio se pide revisar", () => {
    const r = revisar(campos, { ...completo, documento: "   ", email: "ana@correo" });
    expect(r.mensaje).toBe("Completá: Cédula / DNI. Revisá: Email.");
    expect(r.claves).toEqual(["documento", "email"]);
  });

  it("un dato opcional mal cargado también se avisa (si no, se perdería sin decir nada)", () => {
    const conRuc = camposDe(undefined, "nuevo");
    const r = revisar(conRuc, { ...completo, fechaNacimiento: "2999-01-01" });
    expect(r.mensaje).toBe("Revisá: Fecha de nacimiento.");
  });
});
