import { NextResponse } from "next/server";

/** Comprobación de vida del servidor propio: Coolify (healthcheck del contenedor) y el monitoreo externo la consultan.
 *  Pública y sin datos: solo dice que el proceso atiende. Todavía no mira la base; cuando el adaptador de Supabase
 *  esté (fase C), acá se suma una consulta mínima y un 503 si no contesta. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
