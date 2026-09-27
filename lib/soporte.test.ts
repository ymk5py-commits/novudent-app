import { describe, it, expect } from "vitest";
import { canalesDesde, haySoporte, mensajeSoporte, linkCorreoSoporte, SOPORTE } from "./soporte";

describe("canalesDesde (variables NEXT_PUBLIC_SOPORTE_*)", () => {
  it("sin variables no hay ningún canal", () => {
    expect(canalesDesde({})).toEqual({});
    expect(haySoporte(canalesDesde({}))).toBe(false);
  });

  it("normaliza el WhatsApp a dígitos: acepta +, espacios y guiones", () => {
    expect(canalesDesde({ whatsapp: "+595 981 123-456" }).whatsapp).toBe("595981123456");
  });

  it("un WhatsApp que no es un número no cuenta como canal (nunca un link roto)", () => {
    expect(canalesDesde({ whatsapp: "pendiente" }).whatsapp).toBeUndefined();
    expect(canalesDesde({ whatsapp: "12345" }).whatsapp).toBeUndefined(); // demasiado corto
    expect(canalesDesde({ whatsapp: "1".repeat(16) }).whatsapp).toBeUndefined(); // E.164: hasta 15 dígitos
  });

  it("el correo tiene que parecer un correo", () => {
    expect(canalesDesde({ email: " soporte@novum.com.py " }).email).toBe("soporte@novum.com.py");
    expect(canalesDesde({ email: "soporte" }).email).toBeUndefined();
    expect(canalesDesde({ email: "a b@c.com" }).email).toBeUndefined();
  });

  it("el horario es texto libre; en blanco no se muestra", () => {
    expect(canalesDesde({ horario: "  Lunes a viernes de 8:00 a 18:00 " }).horario).toBe("Lunes a viernes de 8:00 a 18:00");
    expect(canalesDesde({ horario: "   " }).horario).toBeUndefined();
  });

  it("el horario solo no es un canal: no hay por dónde escribir", () => {
    expect(haySoporte(canalesDesde({ horario: "Lunes a viernes" }))).toBe(false);
    expect(haySoporte(canalesDesde({ email: "ayuda@novum.com.py" }))).toBe(true);
    expect(haySoporte(canalesDesde({ whatsapp: "595981123456" }))).toBe(true);
  });

  it("en los tests no hay variables cargadas: SOPORTE queda vacío", () => {
    expect(haySoporte(SOPORTE)).toBe(false);
  });
});

describe("texto prearmado", () => {
  const quien = { clinica: "Aura Esthetic Center", usuario: "Carlos Admin" };

  it("dice de qué clínica es y quién escribe", () => {
    const m = mensajeSoporte(quien);
    expect(m).toContain("Aura Esthetic Center");
    expect(m).toContain("Carlos Admin");
  });

  it("el correo sale con asunto y cuerpo codificados", () => {
    const link = linkCorreoSoporte("ayuda@novum.com.py", quien);
    expect(link.startsWith("mailto:ayuda@novum.com.py?subject=")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("subject")).toContain("Aura Esthetic Center");
    expect(params.get("body")).toBe(mensajeSoporte(quien));
    expect(link).not.toContain(" "); // todo codificado: un espacio suelto corta el mailto en algunos clientes
  });
});
