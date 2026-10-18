/**
 * Las rutas `/api` con la implementación de Supabase y un stack de verdad: GoTrue de verdad (cuentas, sesiones, JWT firmados), PostgREST de
 * verdad y el esquema de la fase B. Lo único que se simula es lo que está fuera (Gemini, Resend). `npm run test:supabase`.
 *
 * Cada bloque arma su propia clínica (`cl_t…`) y la borra al terminar. Los pedidos llevan un `x-forwarded-for` distinto para no compartir límite de uso.
 */
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { armarClinica, borrarCuenta, crearCuenta, escribirDoc, iniciarSesion, leerDoc, limpiar, rest, sesionAnonima, sufijo, type ClinicaArmada } from "@/lib/server/stack-de-prueba";

import { GET as health } from "./health/route";
import { POST as clinicas } from "./clinicas/route";
import { POST as teamUsers } from "./team-users/route";
import { POST as cambiarClave } from "./change-password/route";
import { POST as checkout } from "./suscripcion/checkout/route";
import { GET as reservasGET, POST as reservasPOST } from "./reservas/route";
import { GET as firmarGET, POST as firmarPOST } from "./firmar/route";
import { GET as confirmarGET, POST as confirmarPOST } from "./citas/confirmar/route";
import { GET as encuestasGET, POST as encuestasPOST } from "./encuestas/route";
import { GET as pagoGET } from "./pago/route";
import { POST as contacto } from "./contacto/route";
import { POST as webhookLS } from "./webhooks/lemonsqueezy/route";
import { POST as email } from "./email/route";
import { POST as correoCita } from "./notificaciones/cita/route";
import { POST as iaResumen } from "./ia/agenda-resumen/route";
import { POST as iaCopilot } from "./ia/copilot/route";

let ip = 0;
const IP = () => `10.${Math.floor(++ip / 250)}.${ip % 250}.7`;
const pedido = (ruta: string, init: { metodo?: string; token?: string; json?: unknown; crudo?: string; cabeceras?: Record<string, string> } = {}) =>
  new Request(`http://app.test/api/${ruta}`, {
    method: init.metodo ?? (init.json !== undefined || init.crudo !== undefined ? "POST" : "GET"),
    headers: {
      "x-forwarded-for": IP(),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.cabeceras ?? {}),
    },
    body: init.crudo ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
  }) as never;

/** Lo que salió hacia afuera (Gemini, Resend), para mirarlo; lo demás pasa al stack. */
const afuera: Array<{ url: string; body: any; auth?: string }> = [];
const fetchReal = globalThis.fetch;

const clinicasCreadas: string[] = [];
const cuentasCreadas: string[] = [];
const anotar = (c: ClinicaArmada) => { clinicasCreadas.push(c.cid); for (const p of Object.values(c.personas)) cuentasCreadas.push(p.uid); return c; };

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_BACKEND", "supabase");
  vi.stubEnv("OWNER_PANEL_KEY", "clave-del-dueño-de-prueba");
  vi.stubEnv("RESEND_API_KEY", "re_de_prueba");
  vi.stubEnv("EMAIL_FROM", "Clínica <avisos@novudent.test>");
  vi.stubEnv("LEADS_EMAIL", "ventas@novudent.test");
  vi.stubEnv("GEMINI_API_KEY", "gemini_de_prueba");
  vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "secreto-ls");
  vi.stubEnv("LS_VARIANT_CLINICA", "111");
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    if (u.startsWith("https://api.resend.com")) { afuera.push({ url: u, body: JSON.parse(init.body), auth: init.headers?.Authorization }); return new Response(JSON.stringify({ id: "re_1" }), { status: 200 }); }
    if (u.includes("generativelanguage.googleapis.com")) {
      afuera.push({ url: u, body: init?.body ? JSON.parse(init.body) : undefined });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Resumen de prueba" }] } }] }), { status: 200 });
    }
    return fetchReal(url, init);
  }));
});
afterEach(() => { afuera.length = 0; });
afterAll(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await limpiar({ clinicas: clinicasCreadas, cuentas: cuentasCreadas });
});

describe("/api/health", () => {
  it("con el backend de Supabase pregunta a la base y contesta 200", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it("si la base no contesta responde 503", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:9");
    try {
      const res = await health();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ ok: false });
    } finally { vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_BACKEND", "supabase"); vi.stubEnv("OWNER_PANEL_KEY", "clave-del-dueño-de-prueba"); vi.stubEnv("RESEND_API_KEY", "re_de_prueba"); vi.stubEnv("EMAIL_FROM", "Clínica <avisos@novudent.test>"); vi.stubEnv("LEADS_EMAIL", "ventas@novudent.test"); vi.stubEnv("GEMINI_API_KEY", "gemini_de_prueba"); vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "secreto-ls"); vi.stubEnv("LS_VARIANT_CLINICA", "111"); }
  });
});

describe("alta de una clínica → equipo → cambio de contraseña → ingreso", () => {
  const adminEmail = `admin-${sufijo()}@novudent.test`;
  const adminClave = "Provisoria-1";
  let cid = "";
  let adminUid = "";

  it("POST /api/clinicas crea la cuenta de GoTrue, la clínica, la suscripción de prueba y el administrador con id = authUid", async () => {
    const res = await clinicas(pedido("clinicas", { json: { ownerKey: "clave-del-dueño-de-prueba", clinicName: `Prueba ${sufijo()}`, adminName: "Ana Admin", adminEmail, adminPassword: adminClave } }));
    const cuerpo = await res.json();
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    cid = cuerpo.clinicId;
    clinicasCreadas.push(cid);
    const { token, uid } = await iniciarSesion(adminEmail, adminClave); // la cuenta existe de verdad en GoTrue y se puede entrar
    adminUid = uid; cuentasCreadas.push(uid);
    expect(token).toBeTruthy();
    const usuario = await leerDoc("users", uid, cid);
    expect(usuario).toMatchObject({ id: uid, authUid: uid, role: "admin", email: adminEmail, mustChangePassword: true });
    expect(await leerDoc("subscriptions", cid)).toMatchObject({ status: "trialing", plan: "clinica" });
    expect(await leerDoc("clinics", cid)).toMatchObject({ id: cid });
    expect((await rest("procedures", "GET", { select: "id", clinic_id: `eq.${cid}` })).length).toBeGreaterThan(5);
  });

  it("repetir el alta con la misma cuenta da 409 (ya es usuario de la clínica) y no duplica nada", async () => {
    const res = await clinicas(pedido("clinicas", { json: { ownerKey: "clave-del-dueño-de-prueba", clinicName: "Otra", adminName: "Ana", adminEmail, adminPassword: adminClave } }));
    expect(res.status).toBe(409);
    expect((await rest("clinics", "GET", { select: "id", id: `like.cl_otra*` })).length).toBe(0);
  });

  it("con una clave de dueño equivocada, 401 sin tocar nada", async () => {
    const res = await clinicas(pedido("clinicas", { json: { ownerKey: "mala", clinicName: "X", adminName: "Y", adminEmail: `x-${sufijo()}@novudent.test`, adminPassword: "123456" } }));
    expect(res.status).toBe(401);
  });

  let miembroUid = "";
  const miembroEmail = `recep-${sufijo()}@novudent.test`;
  it("POST /api/team-users (el administrador) crea una cuenta de GoTrue y su ficha, y esa persona puede entrar", async () => {
    const { token } = await iniciarSesion(adminEmail, adminClave);
    const res = await teamUsers(pedido("team-users", { token, json: { name: "Rita Recepción", email: miembroEmail, password: "Inicial-123", role: "receptionist", color: "#1769E0" } }));
    const cuerpo = await res.json();
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    miembroUid = cuerpo.user.id;
    cuentasCreadas.push(miembroUid);
    expect(cuerpo.user).toMatchObject({ authUid: miembroUid, clinicId: cid, role: "receptionist", mustChangePassword: true });
    expect(await leerDoc("users", miembroUid, cid)).toMatchObject({ email: miembroEmail, active: true });
    const sesion = await iniciarSesion(miembroEmail, "Inicial-123");
    expect(sesion.uid).toBe(miembroUid);
  });

  it("el mismo email dos veces: 409 (ya está en el equipo)", async () => {
    const { token } = await iniciarSesion(adminEmail, adminClave);
    const res = await teamUsers(pedido("team-users", { token, json: { name: "Otra Rita", email: miembroEmail, password: "Inicial-123", role: "receptionist", color: "#1769E0" } }));
    expect(res.status).toBe(409);
  });

  it("quien no es administrador no puede crear usuarios (403), ni una sesión anónima (403), ni sin token (401)", async () => {
    const { token } = await iniciarSesion(miembroEmail, "Inicial-123");
    const cuerpo = { name: "Zeta", email: `z-${sufijo()}@novudent.test`, password: "Inicial-123", role: "receptionist", color: "#1769E0" };
    expect((await teamUsers(pedido("team-users", { token, json: cuerpo }))).status).toBe(403);
    const anonima = await sesionAnonima();
    cuentasCreadas.push(anonima.uid);
    expect((await teamUsers(pedido("team-users", { token: anonima.token, json: cuerpo }))).status).toBe(403);
    expect((await teamUsers(pedido("team-users", { json: cuerpo }))).status).toBe(401);
  });

  it("POST /api/change-password cambia la contraseña en GoTrue y baja el flag mustChangePassword", async () => {
    const { token } = await iniciarSesion(miembroEmail, "Inicial-123");
    const res = await cambiarClave(pedido("change-password", { token, json: { newPassword: "Definitiva-456", clinicId: cid } }));
    const cuerpo = await res.json();
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    expect(cuerpo).toEqual({ ok: true, clinicId: cid });
    expect((await leerDoc("users", miembroUid, cid))?.mustChangePassword).toBe(false);
    await expect(iniciarSesion(miembroEmail, "Inicial-123")).rejects.toMatchObject({ status: 400 });
    expect((await iniciarSesion(miembroEmail, "Definitiva-456")).uid).toBe(miembroUid);
  });

  it("una contraseña igual a la actual se rechaza con un mensaje claro (400) y una débil también", async () => {
    const { token } = await iniciarSesion(miembroEmail, "Definitiva-456");
    const igual = await cambiarClave(pedido("change-password", { token, json: { newPassword: "Definitiva-456" } }));
    expect(igual.status).toBe(400);
    expect((await igual.json()).error).toMatch(/distinta/);
    const corta = await cambiarClave(pedido("change-password", { token, json: { newPassword: "123" } }));
    expect(corta.status).toBe(400);
  });

  it("la sesión anónima y la falta de token no cambian contraseñas (403 / 401)", async () => {
    const anonima = await sesionAnonima();
    cuentasCreadas.push(anonima.uid);
    expect((await cambiarClave(pedido("change-password", { token: anonima.token, json: { newPassword: "Nueva-1234" } }))).status).toBe(403);
    expect((await cambiarClave(pedido("change-password", { json: { newPassword: "Nueva-1234" } }))).status).toBe(401);
  });

  it("un token forjado o vencido es 401", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const firmar = (carga: object, secreto: string) => { const c = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(carga)}`; return `${c}.${createHmac("sha256", secreto).update(c).digest("base64url")}`; };
    const base = { sub: adminUid, role: "authenticated", aud: "authenticated" };
    expect((await cambiarClave(pedido("change-password", { token: firmar({ ...base, exp: Date.now() / 1000 + 600 }, "otro-secreto"), json: { newPassword: "Nueva-1234" } }))).status).toBe(401);
    const stackSecreto = process.env.SUPABASE_JWT_SECRET!;
    expect((await cambiarClave(pedido("change-password", { token: firmar({ ...base, exp: Date.now() / 1000 - 10 }, stackSecreto), json: { newPassword: "Nueva-1234" } }))).status).toBe(401);
  });
});

/* ─────────────────────────── usuarios migrados: el id del documento NO es el uid de login ─────────────────────────── */

describe("usuarios migrados (id del documento ≠ authUid): la identidad se resuelve por authUid", () => {
  let mundo: ClinicaArmada;
  beforeAll(async () => {
    mundo = anotar(await armarClinica({
      plan: "clinica",
      personas: [
        { clave: "admin", id: "u_admin_de_firebase", role: "admin" },
        { clave: "recep", id: "u_recep_de_firebase", role: "receptionist" },
        { clave: "baja", id: "u_baja_de_firebase", role: "receptionist", active: false },
      ],
    }));
  });

  it("los ids del documento son distintos de los uid de login (el escenario es el que se quiere probar)", () => {
    for (const p of Object.values(mundo.personas)) expect(p.id).not.toBe(p.uid);
  });

  it("IA: un miembro con plan Clínica pasa el control y llega a Gemini; la respuesta vuelve", async () => {
    const res = await iaResumen(pedido("ia/agenda-resumen", { token: mundo.personas.recep.token, json: { datos: { tareas: { hechas: 3 } } } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect((await res.json()).resumen).toBe("Resumen de prueba");
    expect(afuera.filter((a) => a.url.includes("generativelanguage"))).toHaveLength(1);
  });

  it("IA: la producción en guaraníes solo viaja si el rol ve reportes (el administrador sí, recepción no)", async () => {
    const datos = { produccionSemanaGs: 4567890, tareas: {} };
    await iaResumen(pedido("ia/agenda-resumen", { token: mundo.personas.admin.token, json: { datos } }));
    await iaResumen(pedido("ia/agenda-resumen", { token: mundo.personas.recep.token, json: { datos } }));
    const enviados = afuera.filter((a) => a.url.includes("generativelanguage")).map((a) => JSON.stringify(a.body));
    expect(enviados[0]).toContain("4567890");
    expect(enviados[1]).not.toContain("4567890");
  });

  it("IA: un usuario dado de baja, una sesión anónima y un registrado sin clínica reciben 403 y Gemini no se toca", async () => {
    const anonima = await sesionAnonima();
    const suelto = `suelto-${sufijo()}@novudent.test`;
    const sueltoUid = await crearCuenta(suelto, "Suelto-12345");
    cuentasCreadas.push(anonima.uid, sueltoUid);
    const { token: tokenSuelto } = await iniciarSesion(suelto, "Suelto-12345");
    for (const [quien, token] of [["baja", mundo.personas.baja.token], ["anónima", anonima.token], ["sin clínica", tokenSuelto]] as const) {
      const res = await iaResumen(pedido("ia/agenda-resumen", { token, json: { datos: {} } }));
      expect(res.status, quien).toBe(403);
    }
    expect(afuera.filter((a) => a.url.includes("generativelanguage"))).toHaveLength(0);
  });

  it("IA: sin token es 401", async () => {
    expect((await iaResumen(pedido("ia/agenda-resumen", { json: { datos: {} } }))).status).toBe(401);
  });

  it("IA: con el plan Solo no hay IA (403) aunque el usuario sea miembro", async () => {
    const solo = anotar(await armarClinica({ plan: "solo", personas: [{ clave: "admin", id: "u_solo_viejo", role: "admin" }] }));
    const res = await iaResumen(pedido("ia/agenda-resumen", { token: solo.personas.admin.token, json: { datos: {} } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/plan/i);
  });

  it("IA: con la suscripción vencida es 403", async () => {
    const vencida = anotar(await armarClinica({ plan: "clinica", suscripcion: { status: "active", currentPeriodEndMs: Date.now() - 1000 }, personas: [{ clave: "admin", id: "u_venc_viejo", role: "admin" }] }));
    expect((await iaResumen(pedido("ia/agenda-resumen", { token: vencida.personas.admin.token, json: { datos: {} } }))).status).toBe(403);
  });

  it("team-users: el administrador migrado crea un usuario nuevo en SU clínica (el rol sale del documento, no del uid)", async () => {
    const correo = `nuevo-${sufijo()}@novudent.test`;
    const res = await teamUsers(pedido("team-users", { token: mundo.personas.admin.token, json: { name: "Nuevo", email: correo, password: "Inicial-123", role: "dentist", color: "#1769E0" } }));
    const cuerpo = await res.json();
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    cuentasCreadas.push(cuerpo.user.id);
    expect(cuerpo.user.clinicId).toBe(mundo.cid);
  });

  it("team-users: recepción migrada no puede crear usuarios (403)", async () => {
    const res = await teamUsers(pedido("team-users", { token: mundo.personas.recep.token, json: { name: "N", email: `n-${sufijo()}@novudent.test`, password: "Inicial-123", role: "dentist", color: "#1769E0" } }));
    expect(res.status).toBe(403);
  });

  it("change-password: baja el flag en el documento VIEJO (u_recep_de_firebase), no en uno nuevo con el uid", async () => {
    const m = anotar(await armarClinica({ personas: [{ clave: "u", id: "u_migrada_vieja", role: "receptionist", mustChangePassword: true }] }));
    const { token } = await iniciarSesion(m.personas.u.email, m.personas.u.password);
    const res = await cambiarClave(pedido("change-password", { token, json: { newPassword: "Cambiada-789" } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect((await leerDoc("users", "u_migrada_vieja", m.cid))?.mustChangePassword).toBe(false);
    expect(await leerDoc("users", m.personas.u.uid, m.cid)).toBeNull(); // no se creó ninguna ficha nueva con el uid
  });

  it("checkout: solo un administrador de la clínica contrata (la recepción migrada recibe 403); con el cobro desactivado el admin recibe 503", async () => {
    const recep = await checkout(pedido("suscripcion/checkout", { token: mundo.personas.recep.token, json: { plan: "clinica" } }));
    expect(recep.status).toBe(403);
    const admin = await checkout(pedido("suscripcion/checkout", { token: mundo.personas.admin.token, json: { plan: "clinica" } }));
    expect(admin.status).toBe(503);
    expect((await admin.json()).error).toMatch(/guaraníes/);
  });

  it("checkout: con el cobro habilitado guarda el token de checkout en checkoutTokens (tabla de primer nivel) atado a ESTA clínica", async () => {
    vi.stubEnv("LS_LEGACY_CHECKOUT_ENABLED", "true");
    vi.stubEnv("LS_CHECKOUT_CLINICA", "https://novudent.lemonsqueezy.com/checkout/buy/abc");
    try {
      const res = await checkout(pedido("suscripcion/checkout", { token: mundo.personas.admin.token, json: { plan: "clinica" } }));
      const cuerpo = await res.json();
      expect(res.status, JSON.stringify(cuerpo)).toBe(200);
      const token = new URL(cuerpo.url).searchParams.get("checkout[custom][novudent_token]");
      expect(token).toBeTruthy();
      expect(await leerDoc("checkoutTokens", token!)).toMatchObject({ clinicId: mundo.cid, plan: "clinica", uid: mundo.personas.admin.uid });
      await rest("checkoutTokens", "DELETE", { id: `eq.${token}` });
    } finally { vi.stubEnv("LS_LEGACY_CHECKOUT_ENABLED", ""); }
  });

  it("checkout: una sesión anónima no contrata (403)", async () => {
    const anonima = await sesionAnonima();
    cuentasCreadas.push(anonima.uid);
    expect((await checkout(pedido("suscripcion/checkout", { token: anonima.token, json: { plan: "clinica" } }))).status).toBe(403);
  });

  it("email: una persona real manda por Resend; la anónima no (403)", async () => {
    const ok = await email(pedido("email", { token: mundo.personas.admin.token, json: { to: "paciente@correo.test", subject: "Hola", text: "Hola" } }));
    expect(ok.status).toBe(200);
    expect(afuera.filter((a) => a.url.includes("resend"))).toHaveLength(1);
    const anonima = await sesionAnonima();
    cuentasCreadas.push(anonima.uid);
    expect((await email(pedido("email", { token: anonima.token, json: { to: "x@y.test", subject: "Hola", text: "Hola" } }))).status).toBe(403);
  });

  it("notificaciones/cita: recepción migrada manda el correo de confirmación y la cita guarda su confirmToken (patchFields real)", async () => {
    const aviso = anotar(await armarClinica({ personas: [{ clave: "recep", id: "u_aviso_viejo", role: "receptionist" }, { clave: "dr", id: "u_dr_viejo", role: "dentist", name: "Dr. Gómez" }] }));
    await escribirDoc("patients", "p_aviso", { id: "p_aviso", firstName: "Paula", lastName: "Paz", email: "paula@correo.test" }, aviso.cid);
    const inicio = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await escribirDoc("appointments", "a_aviso", { id: "a_aviso", clinicId: aviso.cid, patientId: "p_aviso", dentistId: "u_dr_viejo", title: "Limpieza", start: inicio, end: new Date(Date.now() + 3 * 86_400_000 + 1_800_000).toISOString(), status: "pendiente" }, aviso.cid);
    const res = await correoCita(pedido("notificaciones/cita", { token: aviso.personas.recep.token, json: { appointmentId: "a_aviso", tipo: "confirmacion" } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const enviado = afuera.find((a) => a.url.includes("resend"))!;
    expect(enviado.body.to).toEqual(["paula@correo.test"]);
    const cita = await leerDoc("appointments", "a_aviso", aviso.cid);
    expect(cita?.confirmToken).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(cita).toMatchObject({ id: "a_aviso", title: "Limpieza", status: "pendiente" }); // el resto del documento quedó intacto
    expect(enviado.body.text + enviado.body.html).toContain(String(cita?.confirmToken));
  });
});

/* ─────────────────────────── rutas públicas (sin sesión: el token o el id público es la credencial) ─────────────────────────── */

/** Un día hábil (no domingo) dentro del rango que admite la reserva online, en formato AAAA-MM-DD. */
function diaHabil(deAhora = 4): string {
  const d = new Date(Date.now() + deAhora * 86_400_000);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("reserva online (/api/reservas)", () => {
  let mundo: ClinicaArmada;
  const fecha = diaHabil();
  const dentistaId = "u_dr_reserva";
  beforeAll(async () => {
    mundo = anotar(await armarClinica({ personas: [{ clave: "dr", id: dentistaId, role: "dentist", name: "Dra. Reserva" }] }));
  });
  const paciente = (ci: string) => ({ clinicId: mundo.cid, dentistId: dentistaId, date: fecha, time: "10:00", nombre: "Lucía", apellido: "Benítez", ci, telefono: "0981123456", extras: { email: "lucia@correo.test" } });

  it("GET sin fecha devuelve solo el nombre de la clínica", async () => {
    const res = await reservasGET(pedido(`reservas?clinicId=${mundo.cid}`));
    expect(await res.json()).toEqual({ ok: true, clinic: { name: `Clínica ${mundo.cid}` } });
  });

  it("GET con fecha lista el profesional (nunca un dado de baja) y sus turnos libres", async () => {
    const res = await reservasGET(pedido(`reservas?clinicId=${mundo.cid}&date=${fecha}`));
    const cuerpo = await res.json();
    expect(res.status).toBe(200);
    expect(cuerpo.dentists).toEqual([{ id: dentistaId, name: "Dra. Reserva" }]);
    expect(cuerpo.slots[dentistaId]).toContain("10:00");
  });

  it("GET de una clínica que no existe es 404", async () => {
    expect((await reservasGET(pedido(`reservas?clinicId=cl_no_existe_zz&date=${fecha}`))).status).toBe(404);
  });

  it("POST crea la ficha del paciente (con su Historia Clínica pendiente), la cita pendiente y el candado del turno", async () => {
    const res = await reservasPOST(pedido("reservas", { json: paciente("4123001") }));
    const cuerpo = await res.json();
    expect(res.status, JSON.stringify(cuerpo)).toBe(200);
    const cita = await leerDoc("appointments", cuerpo.appointmentId, mundo.cid);
    expect(cita).toMatchObject({ status: "pendiente", source: "online", dentistId: dentistaId, start: `${fecha}T10:00:00` });
    const pacientes = await rest("patients", "GET", { select: "id,data", clinic_id: `eq.${mundo.cid}` });
    expect(pacientes).toHaveLength(1);
    expect(pacientes[0].data).toMatchObject({ firstName: "Lucía", document: "4123001" });
    expect(await leerDoc("clinicalDocs", `cd_${pacientes[0].id}_hc`, mundo.cid)).not.toBeNull();
    expect(await leerDoc("slotLocks", `${dentistaId}_${fecha}_10_00`, mundo.cid)).toMatchObject({ dentistId: dentistaId });
  });

  it("el turno reservado desaparece del GET y reservarlo otra vez da 409 (no hay doble reserva)", async () => {
    const lista = await (await reservasGET(pedido(`reservas?clinicId=${mundo.cid}&date=${fecha}`))).json();
    expect(lista.slots[dentistaId]).not.toContain("10:00");
    const otra = await reservasPOST(pedido("reservas", { json: { ...paciente("4999888"), nombre: "Otro" } }));
    expect(otra.status).toBe(409);
  });

  it("el mismo paciente (misma CI) reutiliza su ficha en otra reserva", async () => {
    const res = await reservasPOST(pedido("reservas", { json: { ...paciente("4123001"), time: "11:00" } }));
    expect(res.status).toBe(200);
    expect(await rest("patients", "GET", { select: "id", clinic_id: `eq.${mundo.cid}` })).toHaveLength(1);
  });

  it("dos pedidos simultáneos por el mismo turno: exactamente uno lo consigue (createIfAbsent es atómico)", async () => {
    const turno = { ...paciente("4555000"), time: "15:00" };
    const respuestas = await Promise.all([1, 2, 3, 4].map((n) => reservasPOST(pedido("reservas", { json: { ...turno, ci: `45550${n}0`, nombre: `Persona${n}` } }))));
    const codigos = respuestas.map((r) => r.status).sort();
    expect(codigos).toEqual([200, 409, 409, 409]);
    const citas = (await rest("appointments", "GET", { select: "id,data", clinic_id: `eq.${mundo.cid}` })).filter((a: any) => a.data.start === `${fecha}T15:00:00`);
    expect(citas).toHaveLength(1);
  });

  it("un espacio bloqueado de la agenda no se reserva", async () => {
    await escribirDoc("agendaBlocks", "b1", { id: "b1", dentistId: dentistaId, start: `${fecha}T12:00:00`, end: `${fecha}T13:00:00`, motivo: "Almuerzo" }, mundo.cid);
    const res = await reservasPOST(pedido("reservas", { json: { ...paciente("4777000"), time: "12:00" } }));
    expect(res.status).toBe(409);
  });

  it("la consulta por rango ve las citas recientes aunque la clínica tenga más de 1000 citas viejas", async () => {
    // 1200 citas viejas (ids que ordenan ANTES que las nuevas) + una reciente a las 16:00: si la ruta bajara «los primeros N» no vería la reciente.
    const viejas = Array.from({ length: 1200 }, (_, i) => ({ clinic_id: mundo.cid, id: `a_0viejo${String(i).padStart(4, "0")}`, data: { id: `a_0viejo${i}`, dentistId: dentistaId, start: "2020-01-01T09:00:00", end: "2020-01-01T09:30:00", status: "realizada" } }));
    await rest("appointments", "POST", {}, viejas, "return=minimal");
    await escribirDoc("appointments", "a_zreciente", { id: "a_zreciente", dentistId: dentistaId, start: `${fecha}T16:00:00`, end: `${fecha}T16:30:00`, status: "pendiente" }, mundo.cid);
    const lista = await (await reservasGET(pedido(`reservas?clinicId=${mundo.cid}&date=${fecha}`))).json();
    expect(lista.slots[dentistaId]).not.toContain("16:00");
  });
});

describe("firma remota (/api/firmar) y confirmación de cita (/api/citas/confirmar)", () => {
  let mundo: ClinicaArmada;
  const tokenFirma = "F".repeat(8) + "irma-token-de-prueba-0001";
  const tokenCita = "C".repeat(8) + "ita-token-de-prueba-0001";
  beforeAll(async () => {
    mundo = anotar(await armarClinica({ personas: [{ clave: "dr", id: "u_dr_firma", role: "dentist", name: "Dr. Firma" }] }));
    await escribirDoc("patients", "p_firma", { id: "p_firma", firstName: "Hugo", lastName: "Ruiz", phone: "0981000000", document: "123" }, mundo.cid);
    await escribirDoc("signatures", "s1", { id: "s1", patientId: "p_firma", token: tokenFirma, title: "Consentimiento de extracción", body: "Texto…", status: "pendiente" }, mundo.cid);
    await escribirDoc("appointments", "a1", { id: "a1", clinicId: mundo.cid, patientId: "p_firma", dentistId: "u_dr_firma", title: "Control", start: new Date(Date.now() + 2 * 86_400_000).toISOString(), end: new Date(Date.now() + 2 * 86_400_000 + 1_800_000).toISOString(), status: "pendiente", confirmToken: tokenCita }, mundo.cid);
  });
  const PNG = "data:image/png;base64," + Buffer.from("png-de-prueba-con-algo-de-contenido-para-pasar-validacion".repeat(4)).toString("base64");

  it("GET firmar encuentra el documento por token (consulta filtrada en la base) y no revela datos de más", async () => {
    const res = await firmarGET(pedido(`firmar?cid=${mundo.cid}&token=${tokenFirma}`));
    expect(await res.json()).toEqual({ ok: true, title: "Consentimiento de extracción", body: "Texto…", status: "pendiente", patientName: "Hugo Ruiz" });
  });

  it("un token que no existe, o de otra clínica, es el mismo 404", async () => {
    expect((await firmarGET(pedido(`firmar?cid=${mundo.cid}&token=${"X".repeat(30)}`))).status).toBe(404);
    expect((await firmarGET(pedido(`firmar?cid=cl_otra_clinica&token=${tokenFirma}`))).status).toBe(404);
  });

  it("POST firmar guarda la firma reescribiendo el documento y no deja firmar dos veces", async () => {
    const res = await firmarPOST(pedido("firmar", { json: { cid: mundo.cid, token: tokenFirma, signatureImage: PNG, signedByName: "Hugo Ruiz" } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(await leerDoc("signatures", "s1", mundo.cid)).toMatchObject({ status: "firmado", signedByName: "Hugo Ruiz", channel: "remoto", token: tokenFirma, title: "Consentimiento de extracción" });
    const otra = await firmarPOST(pedido("firmar", { json: { cid: mundo.cid, token: tokenFirma, signatureImage: PNG, signedByName: "Hugo Ruiz" } }));
    expect(otra.status).toBe(409);
  });

  it("GET confirmar muestra la cita por su token", async () => {
    const res = await confirmarGET(pedido(`citas/confirmar?cid=${mundo.cid}&token=${tokenCita}`));
    const cuerpo = await res.json();
    expect(res.status).toBe(200);
    expect(cuerpo).toMatchObject({ ok: true, profesional: "Dr. Firma", paciente: "Hugo", estado: "pendiente", puedeResponder: true });
  });

  it("POST confirmar cambia SOLO los campos que corresponden (patchFields) y el resto de la cita queda igual", async () => {
    const res = await confirmarPOST(pedido("citas/confirmar", { json: { cid: mundo.cid, token: tokenCita, accion: "confirmar", v: "wa" } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const cita = await leerDoc("appointments", "a1", mundo.cid);
    expect(cita).toMatchObject({ id: "a1", title: "Control", confirmToken: tokenCita, dentistId: "u_dr_firma" });
    expect(cita?.status).not.toBe("pendiente");
  });

  it("confirmar con un token de otra clínica o inventado es 404", async () => {
    expect((await confirmarPOST(pedido("citas/confirmar", { json: { cid: "cl_otra_clinica", token: tokenCita, accion: "confirmar" } }))).status).toBe(404);
  });
});

describe("encuestas, pago y contacto (públicas)", () => {
  let mundo: ClinicaArmada;
  beforeAll(async () => {
    mundo = anotar(await armarClinica({ personas: [{ clave: "a", role: "admin" }], clinica: { config: { timezone: "America/Asuncion", currency: "PYG", phone: "021 555 111", payments: { checkoutUrl: "https://pagos.test/checkout", bankInfo: "Banco X cta 123" } } } }));
    await escribirDoc("surveys", "sv1", { id: "sv1", title: "NPS", active: true, questions: [] }, mundo.cid);
    await escribirDoc("surveys", "sv_off", { id: "sv_off", title: "Vieja", active: false, questions: [] }, mundo.cid);
  });

  it("GET encuesta devuelve la definición y el nombre de la clínica; una inexistente es 404", async () => {
    const res = await encuestasGET(pedido(`encuestas?cid=${mundo.cid}&surveyId=sv1`));
    const cuerpo = await res.json();
    expect(cuerpo.survey).toMatchObject({ id: "sv1", title: "NPS" });
    expect(cuerpo.clinicName).toBe(`Clínica ${mundo.cid}`);
    expect((await encuestasGET(pedido(`encuestas?cid=${mundo.cid}&surveyId=nada`))).status).toBe(404);
  });

  it("POST encuesta guarda la respuesta en surveyResponses (acota el NPS) y rechaza una encuesta inactiva", async () => {
    const res = await encuestasPOST(pedido("encuestas", { json: { cid: mundo.cid, surveyId: "sv1", patientName: "Marta", npsScore: 14, comment: "Excelente", answers: [{ q: 1, a: "sí" }] } }));
    expect(res.status).toBe(200);
    const filas = await rest("surveyResponses", "GET", { select: "data", clinic_id: `eq.${mundo.cid}` });
    expect(filas).toHaveLength(1);
    expect(filas[0].data).toMatchObject({ surveyId: "sv1", patientName: "Marta", npsScore: 10, comment: "Excelente" });
    expect((await encuestasPOST(pedido("encuestas", { json: { cid: mundo.cid, surveyId: "sv_off", npsScore: 5 } }))).status).toBe(404);
  });

  it("GET pago devuelve solo el link https, los datos de transferencia y el teléfono", async () => {
    const cuerpo = await (await pagoGET(pedido(`pago?cid=${mundo.cid}`))).json();
    expect(cuerpo).toEqual({ clinicName: `Clínica ${mundo.cid}`, checkoutUrl: "https://pagos.test/checkout", bankInfo: "Banco X cta 123", phone: "021 555 111", currency: "PYG" });
  });

  it("POST contacto guarda el pedido en leads (colección de primer nivel) aunque el correo salga", async () => {
    const email = `lead-${sufijo()}@novudent.test`;
    const res = await contacto(pedido("contacto", { json: { nombre: "Interesada", clinica: "Sonrisas", email, telefono: "0981", mensaje: "Quiero una demo", plan: "clinica" } }));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const leads = await rest("leads", "GET", { select: "id,data", "data->>email": `eq.${email}` });
    expect(leads).toHaveLength(1);
    expect(leads[0].data).toMatchObject({ nombre: "Interesada", atendido: false, origen: "landing:solicitar-acceso" });
    expect(afuera.filter((a) => a.url.includes("resend"))).toHaveLength(1);
    await rest("leads", "DELETE", { id: `eq.${leads[0].id}` });
  });
});

describe("webhook de Lemon Squeezy (/api/webhooks/lemonsqueezy)", () => {
  let mundo: ClinicaArmada;
  const TOKEN = "w".repeat(40);
  const firmado = (cuerpo: unknown, secreto = "secreto-ls") => {
    const crudo = JSON.stringify(cuerpo);
    return pedido("webhooks/lemonsqueezy", { crudo, cabeceras: { "x-signature": createHmac("sha256", secreto).update(crudo).digest("hex"), "Content-Type": "application/json" } });
  };
  const evento = (over: { sub?: string; actualizado?: string; estado?: string } = {}) => ({
    meta: { event_name: "subscription_created", custom_data: { clinic_id: mundo.cid, novudent_token: TOKEN } },
    data: { id: over.sub ?? "sub_ws_1", attributes: { customer_id: 42, variant_id: 111, status: over.estado ?? "active", renews_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), updated_at: over.actualizado ?? "2026-10-01T10:00:00.000000Z", urls: { customer_portal: "https://novudent.lemonsqueezy.com/portal/xyz" } } },
  });
  beforeAll(async () => {
    mundo = anotar(await armarClinica({ plan: "solo", suscripcion: { status: "trialing", plan: "solo" }, personas: [{ clave: "a", role: "admin" }] }));
    await escribirDoc("checkoutTokens", TOKEN, { token: TOKEN, clinicId: mundo.cid, plan: "clinica" });
  });
  afterAll(async () => { await rest("checkoutTokens", "DELETE", { id: `eq.${TOKEN}` }).catch(() => {}); await rest("webhookEvents", "DELETE", { "data->>clinicId": `eq.${mundo.cid}` }).catch(() => {}); });

  it("una firma inválida es 401 y no se toca nada", async () => {
    const res = await webhookLS(firmado(evento(), "otro-secreto"));
    expect(res.status).toBe(401);
    expect(await leerDoc("subscriptions", mundo.cid)).toMatchObject({ status: "trialing" });
  });

  it("un evento válido activa el plan en subscriptions/{cid} y deja el evento aplicado (createIfAbsent + patchFields sobre webhookEvents)", async () => {
    const res = await webhookLS(firmado(evento()));
    expect(await res.json()).toEqual({ ok: true });
    expect(await leerDoc("subscriptions", mundo.cid)).toMatchObject({ clinicId: mundo.cid, plan: "clinica", status: "active", lsSubscriptionId: "sub_ws_1" });
    const eventos = await rest("webhookEvents", "GET", { select: "id,data", "data->>clinicId": `eq.${mundo.cid}` });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].data).toMatchObject({ provider: "lemonsqueezy", estado: "aplicado" });
    expect(typeof eventos[0].data.appliedAt).toBe("string");
  });

  it("el mismo evento reenviado es un duplicado y no se vuelve a aplicar", async () => {
    const res = await webhookLS(firmado(evento()));
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
  });

  it("un evento cuyo token no existe se ignora sin tocar la suscripción", async () => {
    const e = evento({ sub: "sub_ws_2", actualizado: "2026-10-02T10:00:00.000000Z" });
    (e.meta.custom_data as Record<string, string>).novudent_token = "z".repeat(40);
    expect(await (await webhookLS(firmado(e))).json()).toEqual({ ok: true, ignored: true });
  });
});
