/** Reglas de la reserva online (paridad Dentalink).
 *
 *  Módulo PURO: no importa React, ni Firestore, ni el store. El instante "ahora"
 *  entra por parámetro (`nowMs`) en vez de leerse de `Date.now()`, que es lo que
 *  hace testeable la anticipación mínima sin congelar relojes.
 *
 *  ⚠️ Todo se calcula en la zona horaria DE LA CLÍNICA, no en la del servidor.
 *  La API corre en Vercel (UTC) y las clínicas están en UTC-3/-4: calcular "hoy"
 *  con la hora del servidor hacía que, entre las 21:00 y medianoche hora local,
 *  el backend ya creyera que era el día siguiente — y la clínica perdía una noche
 *  de reservas, todas las noches. */

/** Anticipación mínima por defecto, en horas.
 *
 *  Antes de que esto fuera configurable, la reserva online bloqueaba el día de
 *  hoy por completo ("mañana → +30 días"). 12 horas es lo que más se le parece
 *  sin comerse la mañana siguiente: quien reserva a las 17:00 sigue teniendo todo
 *  el día de mañana disponible, y quien entra a las 23:00 ya no puede tomar el
 *  primer turno de las 08:00.
 *
 *  No figura entre `OPCIONES_ANTICIPACION` a propósito: es el valor de arranque
 *  para quien nunca lo configuró. La clínica que entra a tocarlo debería elegir
 *  explícitamente uno de los de Dentalink. */
export const MIN_LEAD_HORAS_DEFAULT = 12;

/** Las opciones que ofrece Dentalink, más 24h para la clínica que no quiere
 *  reservas del día siguiente sin al menos un día completo de aviso. */
export const OPCIONES_ANTICIPACION = [0, 1, 2, 4, 8, 24] as const;

/** Fecha (YYYY-MM-DD) y minutos desde medianoche en una zona horaria dada.
 *
 *  Una `timeZone` inválida cae a UTC en vez de tirar `RangeError`: esto corre en
 *  la ruta pública de reservas, y un `timezone` mal cargado en la config de una
 *  clínica no puede tumbarle la página al paciente. */
export function ahoraEnZona(nowMs: number, timeZone: string): { fecha: string; minutos: number } {
  const partes = formatearEnZona(nowMs, timeZone) ?? formatearEnZona(nowMs, "UTC")!;
  return partes;
}

function formatearEnZona(nowMs: number, timeZone: string): { fecha: string; minutos: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const p: Record<string, string> = {};
    for (const { type, value } of fmt.formatToParts(new Date(nowMs))) p[type] = value;
    // `hour12:false` devuelve "24" a medianoche en algunos runtimes de ICU.
    const h = Number(p.hour) % 24;
    return {
      fecha: `${p.year}-${p.month}-${p.day}`,
      minutos: h * 60 + Number(p.minute),
    };
  } catch {
    return null;
  }
}

/** "HH:MM" → minutos desde medianoche. `null` si no es una hora válida.
 *  Devolver `null` y no `NaN` obliga a quien llama a decidir qué hacer: un `NaN`
 *  se propaga en silencio por las comparaciones y deja pasar el slot. */
export function minutosDeHora(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ¿El slot `fecha`+`hora` respeta la anticipación mínima respecto de `nowMs`?
 *
 *  El borde exacto SÍ pasa: con 2 horas de anticipación y las 19:30 en la
 *  clínica, el turno de las 21:30 se puede tomar. Rechazarlo sería arbitrario y
 *  al paciente le resultaría inexplicable ver el turno y no poder reservarlo.
 *
 *  Una hora malformada devuelve `false`: ante basura, no se reserva. */
export function slotAlcanzaAnticipacion(
  fechaSlot: string,
  horaSlot: string,
  nowMs: number,
  timeZone: string,
  minLeadHoras: number,
): boolean {
  const minutosSlot = minutosDeHora(horaSlot);
  if (minutosSlot === null) return false;

  const ahora = ahoraEnZona(nowMs, timeZone);
  // Una anticipación negativa o no numérica se trata como 0 en vez de correr el
  // límite hacia atrás y habilitar turnos ya pasados.
  const lead = Number.isFinite(minLeadHoras) && minLeadHoras > 0 ? minLeadHoras : 0;

  const diasDeDiferencia = diasEntre(ahora.fecha, fechaSlot);
  if (diasDeDiferencia === null) return false;

  const minutosHastaElSlot = diasDeDiferencia * 24 * 60 + minutosSlot - ahora.minutos;
  return minutosHastaElSlot >= lead * 60;
}

/** Días calendario entre dos fechas YYYY-MM-DD (b − a). `null` si alguna no es
 *  una fecha válida. Se comparan como fechas UTC puras: no hay hora de por medio,
 *  así que el horario de verano no puede correr la cuenta. */
function diasEntre(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T00:00:00.000Z`);
  const tb = Date.parse(`${b}T00:00:00.000Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
}

/** Lee la anticipación configurada por la clínica, saneada. Cualquier valor raro
 *  —negativo, no numérico, ausente— cae al default en vez de deshabilitar el
 *  control sin que nadie se entere. */
export function anticipacionDe(config: { onlineBooking?: { minLeadHoras?: number } } | undefined): number {
  const v = config?.onlineBooking?.minLeadHoras;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : MIN_LEAD_HORAS_DEFAULT;
}
