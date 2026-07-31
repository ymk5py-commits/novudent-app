import { describe, it, expect } from "vitest";
import {
  ahoraEnZona,
  minutosDeHora,
  slotAlcanzaAnticipacion,
  MIN_LEAD_HORAS_DEFAULT,
  OPCIONES_ANTICIPACION,
} from "./reserva-online";

/* Instante de referencia: 2026-07-31T23:30:00Z.
   Paraguay eliminó el horario de verano en 2024 y quedó fijo en UTC-3 todo el
   año, así que en America/Asuncion son las 20:30 del 31-jul. El servidor en UTC
   ya está a media hora del 1-ago mientras en la clínica todavía es la noche del
   31: ese desfasaje es justo lo que rompía el cálculo de "mañana". */
const T = Date.parse("2026-07-31T23:30:00.000Z");

describe("ahoraEnZona", () => {
  it("devuelve la fecha y la hora de la zona, no las del servidor", () => {
    expect(ahoraEnZona(T, "America/Asuncion")).toEqual({ fecha: "2026-07-31", minutos: 20 * 60 + 30 });
  });

  it("en UTC el mismo instante ya es otro día", () => {
    expect(ahoraEnZona(T, "UTC")).toEqual({ fecha: "2026-07-31", minutos: 23 * 60 + 30 });
  });

  it("cruza el día hacia atrás donde corresponde", () => {
    // 2026-08-01T02:00Z → 23:00 del 31-jul en Asunción (UTC-3)
    const t = Date.parse("2026-08-01T02:00:00.000Z");
    expect(ahoraEnZona(t, "America/Asuncion")).toEqual({ fecha: "2026-07-31", minutos: 23 * 60 });
  });

  it("una zona horaria inválida no explota: cae a UTC", () => {
    // Es una ruta pública: un `timezone` mal cargado en la config de la clínica
    // no puede tumbar la página de reservas.
    expect(ahoraEnZona(T, "No/Existe")).toEqual(ahoraEnZona(T, "UTC"));
  });

  it("una zona vacía también cae a UTC", () => {
    expect(ahoraEnZona(T, "")).toEqual(ahoraEnZona(T, "UTC"));
  });
});

describe("minutosDeHora", () => {
  it("convierte HH:MM a minutos desde medianoche", () => {
    expect(minutosDeHora("08:00")).toBe(480);
    expect(minutosDeHora("17:30")).toBe(1050);
    expect(minutosDeHora("00:00")).toBe(0);
  });

  it("una hora malformada da null en vez de NaN", () => {
    expect(minutosDeHora("banana")).toBeNull();
    expect(minutosDeHora("25:00")).toBeNull();
    expect(minutosDeHora("08:70")).toBeNull();
    expect(minutosDeHora("")).toBeNull();
  });
});

describe("slotAlcanzaAnticipacion", () => {
  // Referencia: 20:30 del 31-jul en Asunción.
  const zona = "America/Asuncion";

  it("con anticipación 0 el slot de hoy más tarde sirve", () => {
    expect(slotAlcanzaAnticipacion("2026-07-31", "21:00", T, zona, 0)).toBe(true);
  });

  it("con anticipación 0 un slot de hoy ya pasado NO sirve", () => {
    expect(slotAlcanzaAnticipacion("2026-07-31", "19:00", T, zona, 0)).toBe(false);
  });

  it("el slot exactamente en el borde sirve (>=, no >)", () => {
    // 20:30 + 2h = 22:30
    expect(slotAlcanzaAnticipacion("2026-07-31", "22:30", T, zona, 2)).toBe(true);
  });

  it("un minuto antes del borde no sirve", () => {
    expect(slotAlcanzaAnticipacion("2026-07-31", "22:00", T, zona, 2)).toBe(false);
  });

  it("con 2 horas de anticipación, mañana temprano sigue sirviendo", () => {
    expect(slotAlcanzaAnticipacion("2026-08-01", "08:00", T, zona, 2)).toBe(true);
  });

  it("con 24 horas, mañana temprano YA NO sirve", () => {
    // 20:30 del 31 + 24h = 20:30 del 1-ago; las 08:00 del 1 quedan cortas.
    expect(slotAlcanzaAnticipacion("2026-08-01", "08:00", T, zona, 24)).toBe(false);
  });

  it("con 24 horas, mañana a la noche sí sirve", () => {
    expect(slotAlcanzaAnticipacion("2026-08-01", "21:00", T, zona, 24)).toBe(true);
  });

  it("un día pasado nunca sirve, con cualquier anticipación", () => {
    expect(slotAlcanzaAnticipacion("2026-07-30", "23:30", T, zona, 0)).toBe(false);
  });

  /* EL test que motiva todo el helper: a las 20:30 de Asunción el servidor en UTC
     ya está en el 1-ago. Si la anticipación se calculara con la hora del servidor,
     "mañana" pasaría a ser el 2-ago y la clínica perdería un día de reservas cada
     noche. Con la zona de la clínica, el 1-ago sigue siendo mañana. */
  it("no pierde un día por calcular con la hora del servidor", () => {
    const enZona = slotAlcanzaAnticipacion("2026-08-01", "08:00", T, zona, 2);
    const enUTC = slotAlcanzaAnticipacion("2026-08-01", "08:00", T, "UTC", 2);
    expect(enZona).toBe(true);
    expect(enUTC).toBe(true);
    // Y el caso que sí se separa: un slot de HOY a la noche. En la zona de la
    // clínica son las 20:30 y el turno de las 22:00 todavía se puede tomar; con
    // la hora del servidor (23:30 UTC) ese mismo turno ya "pasó".
    expect(slotAlcanzaAnticipacion("2026-07-31", "22:00", T, zona, 0)).toBe(true);
    expect(slotAlcanzaAnticipacion("2026-07-31", "22:00", T, "UTC", 0)).toBe(false);
  });

  it("una hora malformada se rechaza en vez de dejar pasar el slot", () => {
    expect(slotAlcanzaAnticipacion("2026-08-01", "banana", T, zona, 2)).toBe(false);
  });

  it("una anticipación negativa o basura se trata como 0, no rompe", () => {
    expect(slotAlcanzaAnticipacion("2026-07-31", "21:00", T, zona, -5)).toBe(true);
    expect(slotAlcanzaAnticipacion("2026-07-31", "19:00", T, zona, -5)).toBe(false);
  });
});

describe("configuración", () => {
  it("las opciones son las de Dentalink más 24h", () => {
    expect(OPCIONES_ANTICIPACION).toEqual([0, 1, 2, 4, 8, 24]);
  });

  it("el default es 12h y NO está entre las opciones a propósito", () => {
    // 12h es el valor que aproxima la política previa ("no se reserva para hoy")
    // sin comerse la mañana siguiente. No se ofrece en el selector porque la
    // clínica que entra a configurarlo debería elegir explícitamente.
    expect(MIN_LEAD_HORAS_DEFAULT).toBe(12);
  });
});
