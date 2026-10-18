/** El tiempo real con sesiones de verdad (RLS + Realtime de verdad): lo que un miembro recibe y lo que NO. `npm run test:supabase`. */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armarClinica, escribirDoc, limpiar, rest, stack, type ClinicaArmada } from "../server/stack-de-prueba";
import { crearDatosSupabase, crearSesionSupabase } from "./supabase";
import type { Doc } from "./tipos";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperar(condicion: () => boolean, ms = 15_000) {
  const limite = Date.now() + ms;
  while (!condicion()) { if (Date.now() > limite) throw new Error("se agotó la espera"); await pausa(50); }
}

let a: ClinicaArmada;
let b: ClinicaArmada;

beforeAll(async () => {
  a = await armarClinica({ personas: [{ clave: "admin", id: "u_a_admin", role: "admin" }] });
  b = await armarClinica({ personas: [{ clave: "admin", id: "u_b_admin", role: "admin" }] });
}, 60_000);
afterAll(async () => {
  await limpiar({ clinicas: [a.cid, b.cid], cuentas: [...Object.values(a.personas), ...Object.values(b.personas)].map((p) => p.uid) });
});

describe("Realtime con la sesión de un miembro", () => {
  it("recibe los altas, cambios y borrados de SU clínica y no se entera de los borrados de otra (Realtime no filtra los DELETE)", async () => {
    const s = stack();
    const cliente = createClient(s.url, s.anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { sesion, uidDeLogin } = crearSesionSupabase(cliente);
    await sesion.iniciarSesion(a.personas.admin.email, a.personas.admin.password);
    const datos = crearDatosSupabase(cliente, sesion.usuarioActual, uidDeLogin);

    const vistos: Doc[][] = [];
    const parar = datos.escucharColeccion(a.cid, "outbox", (d) => vistos.push(d));
    await esperar(() => vistos.length >= 1);
    expect(vistos[0]).toEqual([]);

    // Un alta y un borrado de OTRA clínica: no llega nada a este miembro.
    await escribirDoc("outbox", "t_ajeno", { id: "t_ajeno", status: "pendiente" }, b.cid);
    await pausa(1500);
    await rest("outbox", "DELETE", { clinic_id: `eq.${b.cid}`, id: "eq.t_ajeno" });
    await pausa(1500);
    expect(vistos).toHaveLength(1);

    // Lo de su clínica sí: alta, cambio y borrado.
    await escribirDoc("outbox", "t1", { id: "t1", status: "pendiente" }, a.cid);
    await esperar(() => vistos.at(-1)?.length === 1);
    await escribirDoc("outbox", "t1", { id: "t1", status: "enviado" }, a.cid);
    await esperar(() => vistos.at(-1)?.[0]?.status === "enviado");
    await rest("outbox", "DELETE", { clinic_id: `eq.${a.cid}`, id: "eq.t1" });
    await esperar(() => vistos.at(-1)?.length === 0);
    parar();
    await cliente.removeAllChannels();
  }, 60_000);

  it("la sesión de otra clínica no ve las filas de esta en la lectura inicial ni en vivo", async () => {
    const s = stack();
    const cliente = createClient(s.url, s.anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { sesion, uidDeLogin } = crearSesionSupabase(cliente);
    await sesion.iniciarSesion(b.personas.admin.email, b.personas.admin.password);
    const datos = crearDatosSupabase(cliente, sesion.usuarioActual, uidDeLogin);
    await escribirDoc("outbox", "t_de_a", { id: "t_de_a" }, a.cid);
    const vistos: Doc[][] = [];
    // Pide la colección de A con la sesión de B: RLS no le entrega nada.
    const parar = datos.escucharColeccion(a.cid, "outbox", (d) => vistos.push(d));
    await esperar(() => vistos.length >= 1);
    expect(vistos[0]).toEqual([]);
    await escribirDoc("outbox", "t_de_a2", { id: "t_de_a2" }, a.cid);
    await pausa(2000);
    expect(vistos.every((v) => v.length === 0)).toBe(true);
    parar();
    await cliente.removeAllChannels();
    await rest("outbox", "DELETE", { clinic_id: `eq.${a.cid}` });
  }, 60_000);
});
