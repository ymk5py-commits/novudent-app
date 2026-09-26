import { test, expect } from "@playwright/test";

/* Rutas del servidor, sin navegador. Corren contra el servidor local SIN credenciales: nada de esto
   llega a Firestore, a Resend, a Gemini ni a Lemon Squeezy. Cada prueba usa su propia IP
   (x-forwarded-for) porque /api/contacto limita 5 pedidos por hora por IP. */
let n = 0;
const ip = () => ({ "x-forwarded-for": `10.77.${process.pid % 250}.${++n}` });

test.describe("/api/contacto (pedido de acceso de la landing)", () => {
  test("la trampa para bots responde OK sin procesar nada", async ({ request }) => {
    const r = await request.post("/api/contacto", { headers: ip(), data: { nombre: "Bot", email: "bot@example.com", website: "https://spam.example" } });
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  test("sin nombre o email: 400 con un mensaje entendible", async ({ request }) => {
    const r = await request.post("/api/contacto", { headers: ip(), data: { nombre: "", email: "" } });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toMatch(/nombre y tu email/);
  });
  test("email mal escrito: 400", async ({ request }) => {
    const r = await request.post("/api/contacto", { headers: ip(), data: { nombre: "Dra. Prueba", email: "no-es-un-email" } });
    expect(r.status()).toBe(400);
  });
  test("cuerpo que no es JSON: 400", async ({ request }) => {
    const r = await request.post("/api/contacto", { headers: { ...ip(), "content-type": "application/json" }, data: "{roto" });
    expect(r.status()).toBe(400);
  });
  test("más de 5 pedidos por hora desde la misma IP: 429", async ({ request }) => {
    const misma = ip();
    for (let i = 0; i < 5; i++) await request.post("/api/contacto", { headers: misma, data: { nombre: "", email: "" } });
    const r = await request.post("/api/contacto", { headers: misma, data: { nombre: "", email: "" } });
    expect(r.status()).toBe(429);
    expect(r.headers()["retry-after"]).toBeTruthy();
  });
});

test.describe("Rutas que necesitan configuración o sesión", () => {
  const CASOS: [string, string][] = [
    ["/api/ia/copilot", "IA"], ["/api/ia/radiografia", "IA"], ["/api/email", "email"], ["/api/suscripcion/checkout", "cobro"],
    ["/api/change-password", "contraseña"], ["/api/webhooks/lemonsqueezy", "webhook de cobro"], ["/api/reservas", "reservas"], ["/api/firmar", "firma"],
  ];
  for (const [ruta, que] of CASOS) {
    test(`${ruta} (${que}) sin credenciales: rechaza con un mensaje, no con un error crudo`, async ({ request }) => {
      const r = await request.post(ruta, { headers: ip(), data: {} });
      expect(r.status()).toBeGreaterThanOrEqual(400);
      const cuerpo = await r.json();
      expect(cuerpo.ok).toBe(false);
      expect(typeof cuerpo.error).toBe("string");
      expect(JSON.stringify(cuerpo)).not.toMatch(/at \w+ \(|node_modules|stack/i); // sin trazas internas
    });
  }
});
