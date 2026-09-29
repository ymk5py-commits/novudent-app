import { describe, expect, it } from "vitest";
import { campaignEmailRecipients, campaignMailto, MAX_CAMPAIGN_EMAILS } from "./campaign-mail";
import type { Patient } from "./types";

const patient = (id: string, email?: string) => ({ id, email }) as Patient;

describe("borradores de campaña", () => {
  it("solo incluye los pacientes elegidos, con email válido y sin duplicados", () => {
    const emails = campaignEmailRecipients(
      { recipientIds: ["p2", "p3", "p4", "p5"] },
      [patient("p1", "no@elegido.com"), patient("p2", " Ana@Ejemplo.com "), patient("p3", "ana@ejemplo.com"), patient("p4", "invalido"), patient("p5", "otro@ejemplo.com")],
    );
    expect(emails).toEqual(["ana@ejemplo.com", "otro@ejemplo.com"]);
  });

  it("una campaña antigua sin selección no se dirige a toda la base", () => {
    expect(campaignEmailRecipients({}, [patient("p1", "a@ejemplo.com")])).toEqual([]);
    expect(campaignMailto({ name: "Aviso", message: "Hola" }, [])).toBeNull();
  });

  it("arma un borrador CCO solo dentro del límite del cliente de correo", () => {
    const href = campaignMailto({ name: "Control", message: "Te esperamos" }, ["a@ejemplo.com"]);
    expect(href).toContain("bcc=a%40ejemplo.com");
    expect(href).toContain("subject=Control");
    expect(campaignMailto({ name: "Control", message: "Hola" }, Array(MAX_CAMPAIGN_EMAILS + 1).fill("a@ejemplo.com"))).toBeNull();
  });
});
