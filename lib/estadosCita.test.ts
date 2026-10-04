import { describe, it, expect } from "vitest";
import { ESTADOS_BASE, ESTADOS_CITA, ESTADOS_DEFAULT, anulaCupo, estadoDeCita, estadosDeClinica, idParaEstado, normalizarEstados } from "./estadosCita";
import type { EstadoCita } from "./types";

describe("estadosDeClinica", () => {
  it("sin configuración devuelve los de fábrica, con los siete base primero", () => {
    const lista = estadosDeClinica(undefined);
    expect(lista.slice(0, 7).map((e) => e.id)).toEqual(ESTADOS_CITA);
    expect(lista.length).toBe(ESTADOS_DEFAULT.length);
  });

  it("deja afuera los desactivados pero nunca un estado base", () => {
    const lista = estadosDeClinica({ estadosCita: [
      { id: "pendiente", label: "Sin confirmar", color: "#000000", base: "pendiente", tipo: "reservado", activo: false },
      { id: "propio", label: "Control 6 meses", color: "#00FF00", base: "pendiente", tipo: "propio", activo: false },
    ] });
    expect(lista.find((e) => e.id === "propio")).toBeUndefined();
    expect(lista.find((e) => e.id === "pendiente")?.label).toBe("Sin confirmar");
    for (const base of ESTADOS_CITA) expect(lista.some((e) => e.id === base)).toBe(true);
  });
});

describe("normalizarEstados", () => {
  it("descarta ids repetidos, etiquetas vacías y bases inválidas", () => {
    const sucio = [
      { id: "x", label: "Uno", color: "#111111", base: "pendiente", tipo: "propio" },
      { id: "x", label: "Repetido", color: "#111111", base: "pendiente", tipo: "propio" },
      { id: "y", label: "   ", color: "#111111", base: "pendiente", tipo: "propio" },
      { id: "z", label: "Base rara", color: "#111111", base: "volando", tipo: "propio" },
    ] as unknown as EstadoCita[];
    const out = normalizarEstados(sucio);
    expect(out.filter((e) => !ESTADOS_CITA.includes(e.id as never)).map((e) => e.id)).toEqual(["x"]);
  });

  it("un color inválido cae al color de fábrica de su base", () => {
    const [e] = normalizarEstados([{ id: "w", label: "W", color: "rojo", base: "cancelada", tipo: "propio" }]);
    expect(e.color).toBe(ESTADOS_BASE.find((b) => b.id === "cancelada")!.color);
  });

  it("un estado con id de fábrica no puede cambiar de comportamiento ni de tipo", () => {
    const [e] = normalizarEstados([{ id: "cancelada", label: "Anulado", color: "#111111", base: "confirmada", tipo: "propio" }]);
    expect(e.base).toBe("cancelada");
    expect(e.tipo).toBe("reservado");
  });
});

describe("estadoDeCita", () => {
  const lista = estadosDeClinica(undefined);
  it("resuelve por estadoId cuando existe", () => {
    expect(estadoDeCita({ status: "confirmada", estadoId: "confirmado_whatsapp" }, lista).label).toBe("Confirmado por WhatsApp");
  });
  it("si el estadoId ya no existe, cae al de fábrica del status", () => {
    expect(estadoDeCita({ status: "confirmada", estadoId: "borrado" }, lista).id).toBe("confirmada");
  });
  it("si el status cambió por otro lado, manda el status y no el estadoId viejo", () => {
    expect(estadoDeCita({ status: "completada", estadoId: "confirmado_whatsapp" }, lista).id).toBe("completada");
    expect(estadoDeCita({ status: "pendiente", estadoId: "anulado_paciente" }, lista).label).toBe("No confirmado");
  });
  it("sin estadoId usa el status", () => {
    expect(estadoDeCita({ status: "en_sala" }, lista).label).toBe("En sala de espera");
  });
});

describe("anulaCupo e idParaEstado", () => {
  it("solo los estados con base cancelada liberan el cupo", () => {
    expect(anulaCupo({ base: "cancelada" })).toBe(true);
    expect(anulaCupo({ base: "ausente" })).toBe(false);
  });
  it("el id sale del nombre, sin tildes, y no choca con los existentes", () => {
    expect(idParaEstado("Control 6 meses", [])).toBe("control_6_meses");
    expect(idParaEstado("Anulado", ESTADOS_DEFAULT)).toBe("anulado");
    expect(idParaEstado("Confirmado por WhatsApp", ESTADOS_DEFAULT)).toBe("confirmado_por_whatsapp");
    const dup = idParaEstado("Agenda Online", ESTADOS_DEFAULT);
    expect(dup).toBe("agenda_online_2");
  });
});
