import { describe, it, expect } from "vitest";
import { columnasSuperpuestas, celdasDelDia, tituloDeEspacio, posicionEnGrilla, ALTO_HORA } from "./agendaSemana";

/* La grilla semanal de la agenda (pedido de Camila, 8-oct-2026): celdas de 30 minutos y, cuando dos citas (o una cita y un bloqueo)
   caen en el mismo horario, se reparten el ancho de la columna en vez de dibujarse una encima de la otra. */

/** Minutos del lunes 12 de octubre de 2026 (a efectos del reparto solo importa el orden). */
const m = (hh: number, mm = 0) => (hh * 60 + mm) * 60_000;
const ev = (id: string, ini: number, fin: number) => ({ id, start: ini, end: fin });

describe("columnasSuperpuestas", () => {
  it("una cita sola ocupa todo el ancho", () => {
    const r = columnasSuperpuestas([ev("a", m(9), m(10))]);
    expect(r.get("a")).toEqual({ col: 0, cols: 1 });
  });

  it("dos citas a la misma hora se reparten el ancho en dos columnas", () => {
    const r = columnasSuperpuestas([ev("a", m(9), m(10)), ev("b", m(9), m(10))]);
    expect([r.get("a"), r.get("b")]).toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }]);
  });

  it("citas que solo se tocan en el borde (una termina cuando empieza la otra) no se superponen", () => {
    const r = columnasSuperpuestas([ev("a", m(9), m(10)), ev("b", m(10), m(11))]);
    expect(r.get("a")).toEqual({ col: 0, cols: 1 });
    expect(r.get("b")).toEqual({ col: 0, cols: 1 });
  });

  it("tres a la vez: tres columnas", () => {
    const r = columnasSuperpuestas([ev("a", m(9), m(10)), ev("b", m(9, 15), m(9, 45)), ev("c", m(9, 30), m(10, 30))]);
    expect(new Set(["a", "b", "c"].map((id) => r.get(id)!.col))).toEqual(new Set([0, 1, 2]));
    for (const id of ["a", "b", "c"]) expect(r.get(id)!.cols).toBe(3);
  });

  it("grupos encadenados: A pisa a B y B pisa a C, así que las tres comparten el ancho aunque A y C no se toquen (C reusa la columna de A)", () => {
    const r = columnasSuperpuestas([ev("a", m(9), m(10)), ev("b", m(9, 30), m(10, 30)), ev("c", m(10, 15), m(11))]);
    expect(r.get("a")).toEqual({ col: 0, cols: 2 });
    expect(r.get("b")).toEqual({ col: 1, cols: 2 });
    expect(r.get("c")).toEqual({ col: 0, cols: 2 });
  });

  it("dos grupos separados en el día no se afectan: cada uno con su propio ancho", () => {
    const r = columnasSuperpuestas([
      ev("a", m(9), m(10)), ev("b", m(9), m(10)), ev("c", m(9), m(10)),
      ev("d", m(15), m(16)),
    ]);
    expect(r.get("a")!.cols).toBe(3);
    expect(r.get("d")).toEqual({ col: 0, cols: 1 });
  });

  it("el orden en que llegan no cambia el reparto (se ordenan por hora; a la misma hora, la más larga primero)", () => {
    const items = [ev("corta", m(9), m(9, 30)), ev("larga", m(9), m(11)), ev("tarde", m(10), m(10, 30))];
    const a = columnasSuperpuestas(items);
    const b = columnasSuperpuestas([...items].reverse());
    for (const id of ["corta", "larga", "tarde"]) expect(b.get(id)).toEqual(a.get(id));
    expect(a.get("larga")).toEqual({ col: 0, cols: 2 });
    expect(a.get("corta")).toEqual({ col: 1, cols: 2 });
    expect(a.get("tarde")).toEqual({ col: 1, cols: 2 }); // la corta ya terminó: reusa su columna
  });

  it("acepta instantes ISO, como los guarda la agenda", () => {
    const iso = (hh: number, mm = 0) => new Date(2026, 9, 12, hh, mm).toISOString();
    const r = columnasSuperpuestas([{ id: "a", start: iso(9), end: iso(10) }, { id: "b", start: iso(9, 30), end: iso(10) }]);
    expect(r.get("a")!.cols).toBe(2);
    expect(r.get("b")!.col).toBe(1);
  });

  it("con una duración mínima en pantalla, una cita cortita que se dibuja de media hora empuja al costado a la que empieza enseguida", () => {
    const items = [ev("diez", m(9), m(9, 10)), ev("siguiente", m(9, 15), m(9, 45))];
    expect(columnasSuperpuestas(items).get("siguiente")).toEqual({ col: 0, cols: 1 }); // en el tiempo no se pisan
    expect(columnasSuperpuestas(items, { minimoMs: 30 * 60_000 }).get("siguiente")).toEqual({ col: 1, cols: 2 }); // en pantalla sí
  });

  it("una cita sin duración (fin igual o antes que el inicio) igual se ubica y no rompe nada", () => {
    const r = columnasSuperpuestas([ev("rota", m(9), m(9)), ev("b", m(9), m(10))]);
    expect(r.get("rota")).toBeDefined();
    expect(r.get("b")!.cols).toBe(2);
  });

  it("sin nada, nada", () => {
    expect(columnasSuperpuestas([]).size).toBe(0);
  });
});

describe("celdas y posiciones de la grilla", () => {
  it("el día tiene 48 celdas de 30 minutos, de 00:00 a 23:30", () => {
    const c = celdasDelDia();
    expect(c).toHaveLength(48);
    expect(c.slice(0, 3)).toEqual(["00:00", "00:30", "01:00"]);
    expect(c.at(-1)).toBe("23:30");
  });

  it("una hora mide 56 px, como las etiquetas de la izquierda; la celda de 30 minutos, la mitad", () => {
    expect(ALTO_HORA).toBe(56);
    const ini = new Date(2026, 9, 12, 9, 30).toISOString();
    const fin = new Date(2026, 9, 12, 10, 30).toISOString();
    expect(posicionEnGrilla(ini, fin)).toEqual({ top: 9.5 * 56, height: 56 - 3 });
  });

  it("una cita muy corta se dibuja al menos de media celda de alto para que se pueda leer y tocar", () => {
    const ini = new Date(2026, 9, 12, 9, 0).toISOString();
    const fin = new Date(2026, 9, 12, 9, 10).toISOString();
    expect(posicionEnGrilla(ini, fin).height).toBe(28);
  });

  it("una cita que pasa la medianoche no se sale de la grilla del día", () => {
    const ini = new Date(2026, 9, 12, 23, 0).toISOString();
    const fin = new Date(2026, 9, 13, 1, 0).toISOString();
    const p = posicionEnGrilla(ini, fin);
    expect(p.top + p.height).toBeLessThanOrEqual(24 * 56);
  });

  it("el título del menú de un espacio es «Lun 12 oct · 09:30»", () => {
    expect(tituloDeEspacio(new Date(2026, 9, 12), "09:30")).toBe("Lun 12 oct · 09:30");
    expect(tituloDeEspacio(new Date(2026, 9, 18), "17:00")).toBe("Dom 18 oct · 17:00");
    expect(tituloDeEspacio(new Date(2026, 8, 2), "08:00")).toBe("Mié 2 sep · 08:00");
  });
});
