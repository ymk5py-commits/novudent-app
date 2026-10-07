import { parseFecha } from "./tareas";

/** Pacientes que cumplen años en los próximos `dias` días (hoy incluido), del más cercano al más lejano.
 *  La fecha de nacimiento (YYYY-MM-DD) se lee en hora local con `parseFecha`: con `new Date(iso)` se toma
 *  como medianoche UTC y en Paraguay (UTC−3) daba el día anterior, así que el cumpleaños de mañana salía «¡Hoy!». */
export function proximosCumpleanos<P extends { birthDate?: string }>(
  pacientes: readonly P[],
  ahora: Date,
  dias = 7,
): { p: P; inDays: number; turns: number }[] {
  const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const lista: { p: P; inDays: number; turns: number }[] = [];
  for (const p of pacientes) {
    if (!p.birthDate) continue;
    const nacio = parseFecha(p.birthDate);
    if (Number.isNaN(nacio.getTime())) continue;
    let proximo = new Date(ahora.getFullYear(), nacio.getMonth(), nacio.getDate());
    if (proximo < hoy0) proximo = new Date(ahora.getFullYear() + 1, nacio.getMonth(), nacio.getDate());
    const inDays = Math.round((proximo.getTime() - hoy0.getTime()) / 86_400_000);
    if (inDays <= dias) lista.push({ p, inDays, turns: proximo.getFullYear() - nacio.getFullYear() });
  }
  return lista.sort((a, b) => a.inDays - b.inDays);
}
