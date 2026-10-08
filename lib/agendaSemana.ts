/* La grilla semanal de la agenda (app/app/agenda/page.tsx), en cuentas puras: las celdas de 30 minutos, dónde va cada tarjeta y cómo se
 * reparten el ancho las que caen en el mismo horario (pedido de Camila, 8-oct-2026). Todo en hora local, como el resto de la agenda.
 * Tests en lib/agendaSemana.test.ts. */

/** Alto en px de una hora de la grilla (las etiquetas «08:00» de la izquierda). Una celda de 30 minutos mide la mitad. */
export const ALTO_HORA = 56;
/** Minutos de cada celda de la grilla. */
export const MINUTOS_CELDA = 30;

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dos = (n: number) => String(n).padStart(2, "0");

/** Las celdas de un día («00:00», «00:30» … «23:30»). */
export function celdasDelDia(paso = MINUTOS_CELDA): string[] {
  return Array.from({ length: Math.floor(1440 / paso) }, (_, i) => `${dos(Math.floor((i * paso) / 60))}:${dos((i * paso) % 60)}`);
}

/** Título del menú de un espacio de la grilla: «Lun 12 oct · 09:30». */
export function tituloDeEspacio(fecha: Date, hora: string): string {
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} ${MESES[fecha.getMonth()]} · ${hora}`;
}

/** Dónde va una tarjeta en la columna del día: `top` desde la medianoche y `height`, en px. Al menos media celda de alto (una cita de
 *  10 minutos tiene que poder leerse y tocarse) y nunca más abajo que el fin del día (una cita que pasa la medianoche). */
export function posicionEnGrilla(start: string, end: string, altoHora = ALTO_HORA): { top: number; height: number } {
  const s = new Date(start);
  const horas = (Date.parse(end) - Date.parse(start)) / 3_600_000;
  const top = (s.getHours() + s.getMinutes() / 60) * altoHora;
  const height = Math.max(altoHora / 2, horas * altoHora - 3);
  return { top, height: Math.max(0, Math.min(height, 24 * altoHora - top)) };
}

/** Columna que le toca a una tarjeta dentro de su grupo de superpuestas: va de `col / cols` a `(col + 1) / cols` del ancho. */
export interface Columna { col: number; cols: number }

const aMs = (v: string | number) => (typeof v === "number" ? v : Date.parse(v));

/** Reparto clásico de eventos superpuestos (el de los calendarios): se ordenan por inicio (a la misma hora, el más largo primero), se arman
 *  los grupos de los que se pisan entre sí —también en cadena: si A pisa a B y B pisa a C, los tres van juntos— y dentro de cada grupo cada
 *  uno toma la primera columna que ya quedó libre. Todos los del grupo se reparten el ancho en tantas columnas como hicieron falta. Los que
 *  solo se tocan en el borde (uno termina cuando empieza el otro) no se superponen. `minimoMs` es la duración mínima con que se dibuja una
 *  tarjeta: una cita de 10 minutos ocupa en pantalla media celda y empuja al costado a la que empieza enseguida. */
export function columnasSuperpuestas(
  items: readonly { id: string; start: string | number; end: string | number }[],
  opts: { minimoMs?: number } = {},
): Map<string, Columna> {
  const minimo = Math.max(1, opts.minimoMs ?? 0);
  const orden = items
    .map((x) => {
      const ini = aMs(x.start);
      const fin = aMs(x.end);
      return { id: x.id, ini, fin: Math.max(Number.isFinite(fin) ? fin : ini, ini + minimo) };
    })
    .filter((x) => Number.isFinite(x.ini))
    .sort((a, b) => a.ini - b.ini || b.fin - a.fin || a.id.localeCompare(b.id));

  const out = new Map<string, Columna>();
  let grupo: { id: string; col: number }[] = [];
  let finesDeColumna: number[] = [];
  let finDelGrupo = -Infinity;
  const cerrarGrupo = () => {
    for (const g of grupo) out.set(g.id, { col: g.col, cols: finesDeColumna.length });
    grupo = [];
    finesDeColumna = [];
    finDelGrupo = -Infinity;
  };

  for (const x of orden) {
    if (x.ini >= finDelGrupo) cerrarGrupo();
    let col = finesDeColumna.findIndex((fin) => fin <= x.ini);
    if (col < 0) { col = finesDeColumna.length; finesDeColumna.push(x.fin); } else finesDeColumna[col] = x.fin;
    grupo.push({ id: x.id, col });
    finDelGrupo = Math.max(finDelGrupo, x.fin);
  }
  cerrarGrupo();
  return out;
}
