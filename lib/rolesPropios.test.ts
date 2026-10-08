import { describe, it, expect } from "vitest";
import { MAX_NOMBRE_DE_ROL, ROLES, ROLE_LABEL, type PermisosDeLaClinica } from "./rbac";
import {
  MAX_ROLES_PROPIOS, idDeRolNuevo, nombresEnUso, errorDeNombreDeRol, personasConElRol, crearRolPropio, quitarRolPropio,
} from "./rolesPropios";
import { efectivosDe } from "./permisosEquipo";

describe("idDeRolNuevo", () => {
  it("«rp_» más 8 letras y números, que sirven como id de rol", () => {
    expect(idDeRolNuevo([])).toMatch(/^rp_[a-z0-9]{8}$/);
  });

  it("no repite uno que ya hay, aunque el azar lo proponga", () => {
    const secuencia = [0.1, 0.1, 0.9];
    let i = 0;
    const azar = () => secuencia[Math.min(i++ % 3, 2)];
    const primero = idDeRolNuevo([], () => 0.1);
    const segundo = idDeRolNuevo([primero], azar);
    expect(segundo).not.toBe(primero);
  });
});

describe("nombresEnUso", () => {
  it("los de fábrica, con el otro nombre que les hayan puesto, y los propios", () => {
    const nombres = nombresEnUso([{ id: "rp_1", nombre: "Contador" }], { dentist: "Odontólogo" });
    expect(nombres).toContain("Odontólogo");
    expect(nombres).not.toContain("Dentista");
    expect(nombres).toContain("Contador");
    expect(nombres).toContain(ROLE_LABEL.cashier);
    expect(nombres).toHaveLength(ROLES.length + 1);
  });

  it("se puede dejar afuera el rol que se está renombrando, para no chocar consigo mismo", () => {
    expect(nombresEnUso([{ id: "rp_1", nombre: "Contador" }], {}, "rp_1")).not.toContain("Contador");
    expect(nombresEnUso([], { dentist: "Odontólogo" }, "dentist")).not.toContain("Odontólogo");
  });
});

describe("errorDeNombreDeRol", () => {
  const otros = ["Administrador", "Recepcionista", "Coordinación de tratamientos"];

  it("un nombre normal sirve", () => {
    expect(errorDeNombreDeRol("Marketing", otros)).toBeNull();
    expect(errorDeNombreDeRol("  Marketing  ", otros)).toBeNull();
  });

  it("pide escribirlo si está vacío o son solo espacios", () => {
    expect(errorDeNombreDeRol("", otros)).toMatch(/Escribí/);
    expect(errorDeNombreDeRol("    ", otros)).toMatch(/Escribí/);
  });

  it("no deja pasar uno larguísimo", () => {
    expect(errorDeNombreDeRol("x".repeat(MAX_NOMBRE_DE_ROL), otros)).toBeNull();
    expect(errorDeNombreDeRol("x".repeat(MAX_NOMBRE_DE_ROL + 1), otros)).toMatch(/hasta 40/);
  });

  it("no deja repetir un nombre, sin importar mayúsculas, tildes ni espacios de más", () => {
    expect(errorDeNombreDeRol("recepcionista", otros)).toMatch(/Ya hay/);
    expect(errorDeNombreDeRol("  COORDINACION   de tratamientos ", otros)).toMatch(/Ya hay/);
  });
});

describe("personasConElRol", () => {
  const users = [
    { role: "rp_1", active: true }, { role: "rp_1", active: true }, { role: "rp_1", active: false },
    { role: "rp_2", active: true }, { role: "dentist" },
  ];

  it("cuenta a todas, también a las dadas de baja: si se borra el rol, quedarían con uno que ya no existe", () => {
    expect(personasConElRol(users, "rp_1")).toBe(3);
    expect(personasConElRol(users, "rp_2")).toBe(1);
    expect(personasConElRol(users, "dentist")).toBe(1);
    expect(personasConElRol(users, "rp_9")).toBe(0);
  });
});

describe("crearRolPropio", () => {
  const base = { rolesPropios: [], nombresDeRoles: {}, azar: () => 0.42 };

  it("crea un rol sin permisos cuando no se elige una plantilla", () => {
    const r = crearRolPropio({ ...base, nombre: "  Contador  " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rol.nombre).toBe("Contador");
    expect(r.rol.id).toMatch(/^rp_[a-z0-9]{8}$/);
    expect(r.ajustes).toEqual({ dar: [], quitar: [] });
  });

  it("puede arrancar con los permisos de otro rol, y desde ahí es independiente (queda todo como «dar»)", () => {
    const r = crearRolPropio({ ...base, nombre: "Asesor", plantilla: "commercial" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajustes.dar).toEqual(efectivosDe("commercial"));
    expect(r.ajustes.quitar).toEqual([]);
  });

  it("arrancar con la plantilla de un rol que la clínica reconfiguró copia lo que PUEDE hoy, no lo de fábrica", () => {
    const permisos: PermisosDeLaClinica = { receptionist: { dar: ["money.view"], quitar: ["agenda.all"] } };
    const r = crearRolPropio({ ...base, nombre: "Secretaría", plantilla: "receptionist", permisos });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajustes.dar).toContain("money.view");
    expect(r.ajustes.dar).not.toContain("agenda.all");
  });

  it("la plantilla del administrador no copia lo que no se reparte (crear usuarios y configurar la clínica)", () => {
    const r = crearRolPropio({ ...base, nombre: "Gerente", plantilla: "admin" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ajustes.dar).not.toContain("users.manage");
    expect(r.ajustes.dar).not.toContain("practice.config");
    expect(r.ajustes.dar).toContain("billing.reports");
  });

  it("rechaza un nombre que ya existe, uno vacío y un id que no llegó a ser único", () => {
    expect(crearRolPropio({ ...base, nombre: "dentista" })).toMatchObject({ ok: false, error: expect.stringMatching(/Ya hay/) });
    expect(crearRolPropio({ ...base, nombre: " " })).toMatchObject({ ok: false });
    expect(crearRolPropio({ ...base, nombre: "Odontólogo", nombresDeRoles: { dentist: "Odontólogo" } })).toMatchObject({ ok: false });
  });

  it("pone un tope a los roles propios", () => {
    const muchos = Array.from({ length: MAX_ROLES_PROPIOS }, (_, i) => ({ id: `rp_${i}`, nombre: `Rol ${i}` }));
    expect(crearRolPropio({ ...base, nombre: "Uno más", rolesPropios: muchos })).toMatchObject({ ok: false, error: expect.stringMatching(/máximo/) });
  });
});

describe("quitarRolPropio", () => {
  it("saca el rol de la lista y no toca los demás", () => {
    const roles = [{ id: "rp_1", nombre: "Uno" }, { id: "rp_2", nombre: "Dos" }];
    expect(quitarRolPropio(roles, "rp_1")).toEqual([{ id: "rp_2", nombre: "Dos" }]);
    expect(quitarRolPropio(roles, "rp_9")).toEqual(roles);
  });
});
