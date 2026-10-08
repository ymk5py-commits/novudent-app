import type { RolId, User } from "./types";

/* Color de agenda de cada persona del equipo (Administración › Usuarios y profesionales). Cada alta arrancaba con el color de
 * su rol y no se podía cambiar: dos dentistas nuevos terminaban con el mismo color en la agenda. */

export interface ColorDeAgenda {
  hex: string;
  nombre: string;
}

/** La paleta que se ofrece. Tienen que ser #RRGGBB: es lo único que acepta `/api/team-users`. */
export const PALETA_AGENDA: readonly ColorDeAgenda[] = [
  { hex: "#1769E0", nombre: "Azul" },
  { hex: "#0E9F6E", nombre: "Verde" },
  { hex: "#7C3AED", nombre: "Violeta" },
  { hex: "#DB2777", nombre: "Rosa" },
  { hex: "#B45309", nombre: "Ocre" },
  { hex: "#0891B2", nombre: "Turquesa" },
  { hex: "#DC2626", nombre: "Rojo" },
  { hex: "#475569", nombre: "Gris" },
];

/** El color con el que arranca cada rol de fábrica (los de siempre: los usuarios ya creados los tienen). */
const COLOR_POR_ROL: Record<string, string> = {
  admin: "#1769E0",
  cashier: "#7C3AED",
  receptionist: "#DB2777",
  commercial: "#0891B2",
  dentist: "#0E9F6E",
  assistant: "#B45309",
};

/** Un rol propio no tiene color de fábrica: gris azulado. */
export const COLOR_ROL_PROPIO = "#475569";

export const colorDelRol = (role: RolId): string => (Object.prototype.hasOwnProperty.call(COLOR_POR_ROL, role) ? COLOR_POR_ROL[role] : COLOR_ROL_PROPIO);

const esHex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
const mismo = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Lo que se ofrece para elegir: la paleta y, si el color actual no es de la paleta (una persona que ya tenía otro),
 *  ese color adelante, como «Color actual», para no quitárselo sin querer. */
export function opcionesDeColor(actual?: string): ColorDeAgenda[] {
  if (esHex(actual) && !PALETA_AGENDA.some((c) => mismo(c.hex, actual))) return [{ hex: actual, nombre: "Color actual" }, ...PALETA_AGENDA];
  return [...PALETA_AGENDA];
}

export const nombreDeColor = (hex: string): string => PALETA_AGENDA.find((c) => mismo(c.hex, hex))?.nombre ?? "Color actual";

/** Las personas activas que ya usan ese color (para avisar, no para impedir). `excepto`: la que se está editando. */
export function usuariosConColor<T extends Pick<User, "id" | "color" | "active">>(users: readonly T[], hex: string, excepto?: string): T[] {
  return users.filter((u) => u.active !== false && u.id !== excepto && mismo(u.color ?? "", hex));
}
