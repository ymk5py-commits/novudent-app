import { NextResponse } from "next/server";
import { baseContesta } from "@/lib/server/salud";

/** Comprobación de vida del servidor propio: Coolify (healthcheck del contenedor) y el monitoreo externo la consultan.
 *  Pública y sin datos: solo dice si la app atiende y, con el backend de Supabase, si la base contesta (una consulta mínima, con el resultado
 *  guardado unos segundos: ver `lib/server/salud.ts`; 503 si no). Nunca devuelve el motivo del fallo: es información de infraestructura que no
 *  le debemos a cualquiera. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET() {
  if (!(await baseContesta())) return NextResponse.json({ ok: false }, { status: 503, headers: SIN_CACHE });
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}
