import { describe, it, expect } from "vitest";
import { COLOR_ROL_PROPIO, PALETA_AGENDA, colorDelRol, nombreDeColor, opcionesDeColor, usuariosConColor } from "./coloresUsuario";
import { ROLES } from "./rbac";

describe("paleta de colores de la agenda", () => {
  it("son 8 colores distintos y con nombre, en el formato #RRGGBB que acepta el servidor al crear un usuario", () => {
    expect(PALETA_AGENDA).toHaveLength(8);
    expect(new Set(PALETA_AGENDA.map((c) => c.hex.toLowerCase())).size).toBe(8);
    expect(new Set(PALETA_AGENDA.map((c) => c.nombre)).size).toBe(8);
    for (const c of PALETA_AGENDA) expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("cada rol de fábrica tiene su color, distinto del de los demás, y está en la paleta (así el inicial se ve elegido)", () => {
    const colores = ROLES.map(colorDelRol);
    expect(new Set(colores).size).toBe(ROLES.length);
    for (const c of colores) expect(PALETA_AGENDA.map((x) => x.hex)).toContain(c);
  });

  it("un rol propio usa el gris azulado, que también está en la paleta", () => {
    expect(colorDelRol("rp_abc12345")).toBe(COLOR_ROL_PROPIO);
    expect(PALETA_AGENDA.map((x) => x.hex)).toContain(COLOR_ROL_PROPIO);
  });

  it("los colores de siempre de cada rol no cambiaron (los usuarios ya creados los tienen)", () => {
    expect(colorDelRol("admin")).toBe("#1769E0");
    expect(colorDelRol("dentist")).toBe("#0E9F6E");
    expect(colorDelRol("assistant")).toBe("#B45309");
  });
});

describe("opcionesDeColor", () => {
  it("son las 8 de la paleta", () => {
    expect(opcionesDeColor("#1769E0")).toEqual([...PALETA_AGENDA]);
    expect(opcionesDeColor("#1769e0")).toEqual([...PALETA_AGENDA]); // mayúsculas o minúsculas
  });

  it("si el color actual es otro (el de un usuario que ya tenía uno), se suma adelante como «Color actual»", () => {
    expect(opcionesDeColor("#0D9488")).toEqual([{ hex: "#0D9488", nombre: "Color actual" }, ...PALETA_AGENDA]);
  });

  it("un valor que no es un color no se suma", () => {
    expect(opcionesDeColor("rojo")).toEqual([...PALETA_AGENDA]);
    expect(opcionesDeColor(undefined)).toEqual([...PALETA_AGENDA]);
  });
});

describe("nombreDeColor", () => {
  it("usa el nombre de la paleta, sin importar mayúsculas", () => {
    expect(nombreDeColor("#7c3aed")).toBe("Violeta");
    expect(nombreDeColor("#0D9488")).toBe("Color actual");
  });
});

describe("usuariosConColor", () => {
  const users = [
    { id: "u1", name: "Ana", color: "#0E9F6E", active: true },
    { id: "u2", name: "Beto", color: "#0e9f6e", active: true },
    { id: "u3", name: "Carla", color: "#0E9F6E", active: false },
    { id: "u4", name: "Dora", color: "#1769E0", active: true },
  ];

  it("las personas activas que ya usan ese color (las dadas de baja no cuentan)", () => {
    expect(usuariosConColor(users, "#0E9F6E").map((u) => u.name)).toEqual(["Ana", "Beto"]);
  });

  it("sin contar a la persona que se está editando", () => {
    expect(usuariosConColor(users, "#0E9F6E", "u1").map((u) => u.name)).toEqual(["Beto"]);
  });
});
