import { describe, it, expect } from "vitest";
import { columnasDeLaSemana, columnasDelDia, citaEnColumna, bloqueoEnColumna, fueraDeHorario } from "./agendaGrilla";

/* La grilla de la agenda (pedido de Camila, 13-oct-2026): la Semanal tiene una columna por día y la Diaria global, una por profesional.
   Acá se decide qué columnas hay, qué cita y qué bloqueo va en cada una y qué celdas caen fuera del horario de atención (se ven en gris). */

const lunes = new Date(2026, 9, 12); // lunes 12 de octubre de 2026
const iso = (d: number, hh: number, mm = 0) => new Date(2026, 9, d, hh, mm).toISOString();
const sofia = { id: "u2", name: "Dra. Sofía Benítez", color: "#0E9F6E", specialty: "Ortodoncia" };
const diego = { id: "u4", name: "Dr. Diego Martínez", color: "#0D9488", specialty: undefined };

describe("columnasDeLaSemana", () => {
  it("siete días de lunes a domingo, con el nombre corto y el número del día", () => {
    const cols = columnasDeLaSemana(lunes, new Date(2026, 9, 14, 15, 0));
    expect(cols.map((c) => `${c.titulo} ${c.subtitulo}`)).toEqual(["Lun 12", "Mar 13", "Mié 14", "Jue 15", "Vie 16", "Sáb 17", "Dom 18"]);
    expect(cols.map((c) => c.esHoy)).toEqual([false, false, true, false, false, false, false]);
    expect(cols.every((c) => c.dentistId === undefined)).toBe(true);
    expect(cols[2].fecha.getHours()).toBe(0);
    expect(new Set(cols.map((c) => c.clave)).size).toBe(7);
  });

  it("aunque el lunes venga con hora, cada columna arranca a la medianoche", () => {
    const cols = columnasDeLaSemana(new Date(2026, 9, 12, 17, 45));
    expect(cols.every((c) => c.fecha.getHours() === 0 && c.fecha.getMinutes() === 0)).toBe(true);
  });
});

describe("columnasDelDia", () => {
  it("una columna por profesional, en el orden en que llegan, con su nombre, especialidad y color", () => {
    const cols = columnasDelDia(new Date(2026, 9, 13, 11, 0), [sofia, diego], new Date(2026, 9, 13, 9, 0));
    expect(cols.map((c) => [c.clave, c.titulo, c.subtitulo, c.dentistId, c.color])).toEqual([
      ["p:u2", "Dra. Sofía Benítez", "Ortodoncia", "u2", "#0E9F6E"],
      ["p:u4", "Dr. Diego Martínez", undefined, "u4", "#0D9488"],
    ]);
    expect(cols.every((c) => c.fecha.getDate() === 13 && c.fecha.getHours() === 0 && c.esHoy)).toBe(true);
  });

  it("sin profesionales, sin columnas", () => {
    expect(columnasDelDia(lunes, [])).toEqual([]);
  });
});

describe("citaEnColumna y bloqueoEnColumna", () => {
  const [lun, mar] = columnasDeLaSemana(lunes);
  const [colSofia, colDiego] = columnasDelDia(new Date(2026, 9, 13), [sofia, diego]);

  it("Semanal: la cita va en la columna de su día, sea del profesional que sea", () => {
    expect(citaEnColumna(lun, { start: iso(12, 9), dentistId: "u4" })).toBe(true);
    expect(citaEnColumna(mar, { start: iso(12, 9), dentistId: "u4" })).toBe(false);
  });

  it("Diaria global: la cita va solo en la columna de su profesional y de ese día", () => {
    expect(citaEnColumna(colSofia, { start: iso(13, 9), dentistId: "u2" })).toBe(true);
    expect(citaEnColumna(colDiego, { start: iso(13, 9), dentistId: "u2" })).toBe(false);
    expect(citaEnColumna(colSofia, { start: iso(14, 9), dentistId: "u2" })).toBe(false);
  });

  it("una cita de un profesional que no tiene columna no va en ninguna", () => {
    const cita = { start: iso(13, 9), dentistId: "u1" };
    expect([colSofia, colDiego].some((c) => citaEnColumna(c, cita))).toBe(false);
  });

  it("un bloqueo de «Todos los profesionales» va en todas las columnas del día; uno de un profesional, solo en la suya", () => {
    expect(bloqueoEnColumna(colSofia, { start: iso(13, 12), dentistId: "*" })).toBe(true);
    expect(bloqueoEnColumna(colDiego, { start: iso(13, 12), dentistId: "*" })).toBe(true);
    expect(bloqueoEnColumna(colDiego, { start: iso(13, 12), dentistId: "u2" })).toBe(false);
    expect(bloqueoEnColumna(colSofia, { start: iso(14, 12), dentistId: "*" })).toBe(false);
    expect(bloqueoEnColumna(mar, { start: iso(13, 12), dentistId: "u2" })).toBe(true);
  });
});

describe("fueraDeHorario", () => {
  const horario = { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "13:00" };
  const martes = new Date(2026, 9, 13);

  it("adentro del horario no es gris; justo en «desde» tampoco; la última celda que termina en «hasta», tampoco", () => {
    expect(fueraDeHorario(horario, martes, "09:00")).toBe(false);
    expect(fueraDeHorario(horario, martes, "10:30")).toBe(false);
    expect(fueraDeHorario(horario, martes, "12:30")).toBe(false);
  });

  it("antes de «desde» y desde «hasta» en adelante es gris", () => {
    expect(fueraDeHorario(horario, martes, "08:30")).toBe(true);
    expect(fueraDeHorario(horario, martes, "13:00")).toBe(true);
    expect(fueraDeHorario(horario, martes, "23:30")).toBe(true);
  });

  it("un día en que no atiende es gris entero", () => {
    expect(fueraDeHorario(horario, new Date(2026, 9, 17), "10:00")).toBe(true); // sábado
  });

  it("sin horario cargado usa el de siempre: lunes a sábado de 08:00 a 18:00", () => {
    expect(fueraDeHorario(undefined, martes, "08:00")).toBe(false);
    expect(fueraDeHorario(undefined, martes, "17:30")).toBe(false);
    expect(fueraDeHorario(undefined, martes, "18:00")).toBe(true);
    expect(fueraDeHorario(undefined, new Date(2026, 9, 18), "10:00")).toBe(true); // domingo
  });

  it("un horario mal cargado no rompe: cada dato que no sirve toma el valor de siempre", () => {
    expect(fueraDeHorario({ dias: [1, 2, 3, 4, 5], desde: "", hasta: "9" }, martes, "08:00")).toBe(false);
    expect(fueraDeHorario({ dias: [1, 2, 3, 4, 5], desde: "", hasta: "9" }, martes, "18:00")).toBe(true);
    expect(fueraDeHorario({ dias: "lunes" as unknown as number[], desde: "09:00", hasta: "13:00" }, martes, "10:00")).toBe(false);
  });

  it("con un paso de 15 minutos mira la celda de 15", () => {
    expect(fueraDeHorario(horario, martes, "12:45", 15)).toBe(false);
    expect(fueraDeHorario(horario, martes, "12:45", 30)).toBe(true);
  });
});
