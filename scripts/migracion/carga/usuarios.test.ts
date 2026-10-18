import { describe, expect, it } from "vitest";
import { ErrorDeGoTrue } from "./gotrue.mjs";
import { gotrueFalso } from "./fixtures";
import { PENDIENTE, asegurarUsuarios, claveDeEmail, esUsuarioReal, recolectarUsuarios, reescribirUsuario } from "./usuarios.mjs";

const doc = (clinica: string, id: string, data: Record<string, unknown>) => ({ clinica, id, data });

describe("esUsuarioReal / claveDeEmail", () => {
  it("un usuario real tiene authUid y un correo; los de la demo (sin authUid) no se migran a GoTrue", () => {
    expect(esUsuarioReal({ authUid: "fb1", email: "ana@example.com" })).toBe(true);
    expect(esUsuarioReal({ email: "admin@novudent.app" })).toBe(false); // demo: tiene correo pero no cuenta
    expect(esUsuarioReal({ authUid: "fb1" })).toBe(false);
    expect(esUsuarioReal({ authUid: "", email: "a@b.c" })).toBe(false);
    expect(esUsuarioReal({ authUid: 5, email: "a@b.c" })).toBe(false);
  });
  it("el correo se compara sin mayúsculas ni espacios (GoTrue los guarda en minúsculas)", () => {
    expect(claveDeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });
});

describe("recolectarUsuarios", () => {
  it("separa los reales, los de la demo y los que tienen authUid pero ningún correo usable", () => {
    const r = recolectarUsuarios([
      doc("c1", "fbUidAna", { authUid: "fbUidAna", email: "Ana@Example.com", name: "Ana" }),
      doc("c1", "u2", { authUid: "fbUidLuis", email: "luis@example.com", name: "Luis" }),
      doc("cl_demo", "u1", { email: "admin@novudent.app", name: "Carlos Admin" }),
      doc("c1", "u9", { authUid: "fbRaro", email: "sin-arroba", name: "Sin correo" }),
    ]);
    expect(r.reales.map((u: { clinica: string; id: string; email: string }) => `${u.clinica}/${u.id}/${u.email}`)).toEqual(["c1/fbUidAna/ana@example.com", "c1/u2/luis@example.com"]);
    expect(r.reales[0]).toMatchObject({ nombre: "Ana", firebaseUid: "fbUidAna" });
    expect(r.sinAuthUid).toEqual([{ clinica: "cl_demo", id: "u1" }]);
    expect(r.sinCorreo).toEqual([{ clinica: "c1", id: "u9" }]);
  });
});

describe("reescribirUsuario", () => {
  const mapa = new Map([["ana@example.com", "uuid-ana"]]);
  it("cambia SOLO data.authUid por el uuid de GoTrue y deja todo lo demás (también el id) como estaba", () => {
    const original = { id: "fbUidAna", authUid: "fbUidAna", email: "Ana@Example.com", role: "admin", anidado: { a: [1] } };
    const nuevo = reescribirUsuario(original, mapa);
    expect(nuevo).toEqual({ ...original, authUid: "uuid-ana" });
    expect(original.authUid).toBe("fbUidAna"); // no muta la entrada
  });
  it("un usuario de la demo queda igual", () => {
    const demo = { id: "u1", email: "admin@novudent.app" };
    expect(reescribirUsuario(demo, mapa)).toBe(demo);
  });
  it("si todavía no se creó la cuenta, authUid queda marcado como pendiente (no se deja el uid viejo de Firebase)", () => {
    expect(reescribirUsuario({ id: "x", authUid: "fb", email: "otro@example.com" }, mapa).authUid).toBe(PENDIENTE);
  });
});

const reales = [
  { clinica: "c1", id: "fbUidAna", email: "ana@example.com", nombre: "Ana", firebaseUid: "fbUidAna" },
  { clinica: "c1", id: "u2", email: "luis@example.com", nombre: "Luis", firebaseUid: "fbUidLuis" },
];

describe("asegurarUsuarios", () => {
  it("crea los que faltan y reutiliza los que ya están en GoTrue por su correo (volver a correrlo no duplica)", async () => {
    const g = gotrueFalso([{ id: "uuid-previo", email: "ana@example.com" }]);
    const r = await asegurarUsuarios({ reales, gotrue: g, crear: true });
    expect(r.uuidPorEmail.get("ana@example.com")).toBe("uuid-previo");
    expect(r.uuidPorEmail.get("luis@example.com")).toBe("uuid-1");
    expect(r).toMatchObject({ creados: 1, existentes: 1, porCrear: 0 });
    expect(g.creados).toEqual([{ email: "luis@example.com", nombre: "Luis", firebaseUid: "fbUidLuis" }]);

    const otra = await asegurarUsuarios({ reales, gotrue: g, crear: true });
    expect(otra).toMatchObject({ creados: 0, existentes: 2 });
    expect(g.usuarios).toHaveLength(2);
  });

  it("en un simulacro (crear: false) no crea nada: cuenta lo que se crearía", async () => {
    const g = gotrueFalso([{ id: "uuid-previo", email: "ana@example.com" }]);
    const r = await asegurarUsuarios({ reales, gotrue: g, crear: false });
    expect(g.creados).toEqual([]);
    expect(r).toMatchObject({ creados: 0, existentes: 1, porCrear: 1 });
    expect(r.uuidPorEmail.has("luis@example.com")).toBe(false);
  });

  it("sin GoTrue (simulacro sin la URL) no consulta y todos quedan por crear", async () => {
    const r = await asegurarUsuarios({ reales, gotrue: null, crear: false });
    expect(r).toMatchObject({ creados: 0, existentes: 0, porCrear: 2, consultado: false });
  });

  it("un mismo correo en dos documentos usa una sola cuenta y se informa", async () => {
    const g = gotrueFalso();
    const dos = [...reales, { clinica: "c2", id: "x", email: "ana@example.com", nombre: "Ana otra vez", firebaseUid: "fbUidAna" }];
    const r = await asegurarUsuarios({ reales: dos, gotrue: g, crear: true });
    expect(g.creados).toHaveLength(2);
    expect(r.repetidos).toEqual(["ana@example.com"]);
  });

  it("si otra persona lo creó en el medio (422 email_exists), lo vuelve a buscar en vez de fallar", async () => {
    const g = gotrueFalso();
    let llamadas = 0;
    g.listarUsuarios = async () => { llamadas++; return llamadas === 1 ? [] : [{ id: "uuid-tarde", email: "ana@example.com", esAnonimo: false, creadaPorElCargador: false }]; };
    g.crearUsuario = async () => { throw new ErrorDeGoTrue("ya existe", { estado: 422, codigo: "email_exists" }); };
    const r = await asegurarUsuarios({ reales: [reales[0]], gotrue: g, crear: true });
    expect(r.uuidPorEmail.get("ana@example.com")).toBe("uuid-tarde");
  });

  it("un error de GoTrue corta todo, sin copiar el correo en el mensaje", async () => {
    const g = gotrueFalso([], { falla: { "luis@example.com": new ErrorDeGoTrue("GoTrue respondió 500", { estado: 500 }) } });
    const error = await asegurarUsuarios({ reales, gotrue: g, crear: true }).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeGoTrue);
    expect(error.message).not.toMatch(/example\.com/);
  });

  it("cuenta las cuentas que ya existían sin haberlas creado el cargador (alguien pudo registrar ese correo antes)", async () => {
    const g = gotrueFalso([{ id: "uuid-ajeno", email: "ana@example.com", creadaPorElCargador: false }, { id: "uuid-nuestro", email: "luis@example.com", creadaPorElCargador: true }]);
    const r = await asegurarUsuarios({ reales, gotrue: g, crear: false });
    expect(r).toMatchObject({ existentes: 2, adoptadas: 1 });
  });

  it("las cuentas anónimas de GoTrue no cuentan como usuarios existentes", async () => {
    const g = gotrueFalso([{ id: "anon1", email: "", esAnonimo: true }]);
    const r = await asegurarUsuarios({ reales: [reales[0]], gotrue: g, crear: true });
    expect(r.creados).toBe(1);
  });
});
