import { NextResponse } from "next/server";
import { backendDelServidor } from "@/lib/server/backend";
import { datosSupabase } from "@/lib/server/datos-supabase";

/** Comprobación de vida del servidor propio: Coolify (healthcheck del contenedor) y el monitoreo externo la consultan.
 *  Pública y sin datos: solo dice si la app atiende y, con el backend de Supabase, si la base contesta (una consulta mínima;
 *  503 si no). Nunca devuelve el motivo del fallo: es información de infraestructura que no le debemos a cualquiera. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  if (backendDelServidor() === "supabase") {
    try {
      await datosSupabase.ping?.();
    } catch (e) {
      console.error("[health] la base no contesta:", e instanceof Error ? e.message : e);
      return NextResponse.json({ ok: false }, { status: 503, headers: SIN_CACHE });
    }
  }
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}
