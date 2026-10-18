/** Ayudas para las pruebas contra un stack de Supabase de verdad (`*.supabase.test.ts`, los e2e de `e2e-supabase/`): crear cuentas de GoTrue, iniciar
 *  sesión y armar clínicas con la clave de servicio. Solo `fetch`, sin SDK. NO se importa desde código de la app: son ayudas de prueba.
 *  El stack lo levanta `scripts/adaptadores/stack-descartable.sh` y las variables las carga `scripts/adaptadores/correr.sh`. */
import { randomBytes } from "node:crypto";
import { TABLAS_DE_CLINICA } from "../backend/supabase-esquema";

export interface Stack { url: string; anon: string; servicio: string; secreto: string }

export function stack(): Stack {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secreto = process.env.SUPABASE_JWT_SECRET;
  if (!url || !anon || !servicio || !secreto) throw new Error("Faltan las variables del stack de prueba: usá scripts/adaptadores/correr.sh");
  return { url: url.replace(/\/+$/, ""), anon, servicio, secreto };
}

export const sufijo = () => randomBytes(4).toString("hex");

async function json(res: Response): Promise<any> {
  const t = await res.text();
  try { return t ? JSON.parse(t) : null; } catch { return t; }
}

/** Crea una cuenta con el correo confirmado (como lo hace el servidor). */
export async function crearCuenta(email: string, password: string): Promise<string> {
  const s = stack();
  const res = await fetch(`${s.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const cuerpo = await json(res);
  if (!res.ok) throw new Error(`crearCuenta ${email}: ${res.status} ${JSON.stringify(cuerpo)}`);
  return cuerpo.id as string;
}

export async function borrarCuenta(uid: string): Promise<void> {
  const s = stack();
  await fetch(`${s.url}/auth/v1/admin/users/${uid}`, { method: "DELETE", headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}` } });
}

export async function iniciarSesion(email: string, password: string): Promise<{ token: string; uid: string }> {
  const s = stack();
  const res = await fetch(`${s.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: s.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cuerpo = await json(res);
  if (!res.ok) throw Object.assign(new Error(`iniciarSesion ${email}: ${res.status} ${JSON.stringify(cuerpo)}`), { status: res.status });
  return { token: cuerpo.access_token as string, uid: cuerpo.user.id as string };
}

export async function sesionAnonima(): Promise<{ token: string; uid: string }> {
  const s = stack();
  const res = await fetch(`${s.url}/auth/v1/signup`, { method: "POST", headers: { apikey: s.anon, "Content-Type": "application/json" }, body: "{}" });
  const cuerpo = await json(res);
  if (!res.ok) throw new Error(`sesionAnonima: ${res.status} ${JSON.stringify(cuerpo)}`);
  return { token: cuerpo.access_token as string, uid: cuerpo.user.id as string };
}

/** PostgREST con la clave de servicio (se salta RLS): para armar y mirar el escenario. */
export async function rest(tabla: string, metodo: "GET" | "POST" | "PATCH" | "DELETE", params: Record<string, string> = {}, cuerpo?: unknown, prefer?: string): Promise<any> {
  const s = stack();
  const res = await fetch(`${s.url}/rest/v1/${encodeURIComponent(tabla)}?${new URLSearchParams(params)}`, {
    method: metodo,
    headers: { apikey: s.servicio, Authorization: `Bearer ${s.servicio}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const r = await json(res);
  if (!res.ok) throw new Error(`rest ${metodo} ${tabla}: ${res.status} ${JSON.stringify(r)}`);
  return r;
}

export async function leerDoc(tabla: string, id: string, clinicId?: string): Promise<Record<string, any> | null> {
  const filas = await rest(tabla, "GET", { select: "data", id: `eq.${id}`, ...(clinicId ? { clinic_id: `eq.${clinicId}` } : {}) });
  return filas[0]?.data ?? null;
}

export async function escribirDoc(tabla: string, id: string, data: Record<string, unknown>, clinicId?: string): Promise<void> {
  await rest(tabla, "POST", { on_conflict: clinicId ? "clinic_id,id" : "id" }, clinicId ? { clinic_id: clinicId, id, data } : { id, data }, "resolution=merge-duplicates,return=minimal");
}

export interface PersonaDeClinica { clave: string; id?: string; role: string; name?: string; active?: boolean; password?: string; mustChangePassword?: boolean }
export interface ClinicaArmada {
  cid: string;
  /** Por `clave`: id del documento de usuario, uid de login, email, contraseña y un token de sesión ya iniciada. */
  personas: Record<string, { id: string; uid: string; email: string; password: string; token: string }>;
}

/** Arma una clínica con suscripción vigente y personas con cuenta de login y ficha (el `id` del documento puede ser distinto del uid: usuarios migrados). */
export async function armarClinica(opciones: { cid?: string; plan?: string; suscripcion?: Record<string, unknown> | null; personas: PersonaDeClinica[]; clinica?: Record<string, unknown> }): Promise<ClinicaArmada> {
  const cid = opciones.cid ?? `cl_t${sufijo()}`;
  const plan = opciones.plan ?? "clinica";
  await escribirDoc("clinics", cid, { id: cid, name: `Clínica ${cid}`, plan, config: { timezone: "America/Asuncion", currency: "PYG" }, ...(opciones.clinica ?? {}) });
  if (opciones.suscripcion !== null) {
    await escribirDoc("subscriptions", cid, { clinicId: cid, plan, status: "active", currentPeriodEndMs: Date.now() + 30 * 86_400_000, ...(opciones.suscripcion ?? {}) });
  }
  const personas: ClinicaArmada["personas"] = {};
  for (const p of opciones.personas) {
    const email = `${p.clave}-${cid}@novudent.test`.toLowerCase();
    const password = p.password ?? `Clave-${sufijo()}`;
    const uid = await crearCuenta(email, password);
    const id = p.id ?? `u_${p.clave}_${sufijo()}`;
    await escribirDoc("users", id, { id, authUid: uid, clinicId: cid, name: p.name ?? p.clave, email, role: p.role, color: "#1769E0", active: p.active ?? true, ...(p.mustChangePassword ? { mustChangePassword: true } : {}) }, cid);
    const { token } = await iniciarSesion(email, password);
    personas[p.clave] = { id, uid, email, password, token };
  }
  return { cid, personas };
}

/** Borra lo que armó una prueba (clínicas por id y cuentas por uid). */
export async function limpiar(opciones: { clinicas?: string[]; cuentas?: string[]; emailsDeCuentas?: string[] }): Promise<void> {
  for (const cid of opciones.clinicas ?? []) {
    for (const t of TABLAS_DE_CLINICA) await rest(t, "DELETE", { clinic_id: `eq.${cid}` }).catch(() => {});
    await rest("subscriptions", "DELETE", { id: `eq.${cid}` }).catch(() => {});
    await rest("clinics", "DELETE", { id: `eq.${cid}` }).catch(() => {});
  }
  for (const uid of opciones.cuentas ?? []) await borrarCuenta(uid).catch(() => {});
}
