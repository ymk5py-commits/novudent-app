import { describe, it, expect } from "vitest";
import { canalDe, esTokenValido, linkConfirmacion, puedeResponder, respuestaCita } from "./confirmacionCita";
import { newSignToken } from "./firma";

const ahora = new Date("2026-10-04T12:00:00.000Z");
const futura = { status: "pendiente", start: "2026-10-06T13:00:00.000Z" };

describe("link y token", () => {
  it("el token de newSignToken es válido; basura no", () => {
    expect(esTokenValido(newSignToken())).toBe(true);
    expect(esTokenValido("corto")).toBe(false);
    expect(esTokenValido("../../appointments/x")).toBe(false);
  });
  it("el link marca el canal y no deja barra doble", () => {
    expect(linkConfirmacion("https://novudent.com/", "cl_1", "abcDEF123456789_-", "whatsapp")).toBe("https://novudent.com/confirmar/cl_1/abcDEF123456789_-?v=wa");
    expect(linkConfirmacion("https://novudent.com", "cl_1", "abcDEF123456789_-", "email")).toMatch(/\?v=mail$/);
    expect(canalDe("wa")).toBe("whatsapp");
    expect(canalDe("mail")).toBe("email");
    expect(canalDe(null)).toBe("email");
  });
});

describe("puedeResponder", () => {
  it("solo citas futuras, pendientes o confirmadas", () => {
    expect(puedeResponder(futura, ahora)).toBe(true);
    expect(puedeResponder({ ...futura, status: "confirmada" }, ahora)).toBe(true);
    expect(puedeResponder({ ...futura, status: "completada" }, ahora)).toBe(false);
    expect(puedeResponder({ ...futura, status: "cancelada" }, ahora)).toBe(false);
    expect(puedeResponder({ ...futura, start: "2026-10-03T13:00:00.000Z" }, ahora)).toBe(false);
    expect(puedeResponder({ ...futura, start: "no es fecha" }, ahora)).toBe(false);
  });
});

describe("respuestaCita", () => {
  it("confirmar deja el estado según el canal y quién respondió", () => {
    const r = respuestaCita(futura, "confirmar", "whatsapp", ahora);
    expect(r).toEqual({ ok: true, resultado: "confirmada", cambios: { status: "confirmada", estadoId: "confirmado_whatsapp", confirmedVia: "link", respondidaAt: ahora.toISOString() } });
    const m = respuestaCita(futura, "confirmar", "email", ahora);
    expect(m.ok && m.cambios?.estadoId).toBe("confirmado_email");
  });
  it("confirmar algo ya confirmado no escribe nada", () => {
    expect(respuestaCita({ ...futura, status: "confirmada" }, "confirmar", "email", ahora)).toEqual({ ok: true, resultado: "confirmada", cambios: null });
  });
  it("anular libera la cita con motivo", () => {
    const r = respuestaCita({ ...futura, status: "confirmada" }, "anular", "email", ahora);
    expect(r.ok && r.cambios).toMatchObject({ status: "cancelada", estadoId: "anulado_paciente", cancelReason: expect.stringMatching(/paciente/) });
  });
  it("una cita anulada, atendida o pasada no admite respuesta", () => {
    expect(respuestaCita({ ...futura, status: "cancelada" }, "confirmar", "email", ahora)).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/anulada/) });
    expect(respuestaCita({ ...futura, status: "completada" }, "anular", "email", ahora)).toMatchObject({ ok: false, status: 409 });
    expect(respuestaCita({ ...futura, start: "2026-10-01T10:00:00.000Z" }, "confirmar", "email", ahora)).toMatchObject({ ok: false, status: 409 });
  });
});
