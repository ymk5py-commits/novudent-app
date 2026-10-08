"use client";
/** Vista Semanal de la agenda (pedido de Camila, 8-oct-2026, como Dentalink): una columna por día con celdas de 30 minutos. Tocar un
 *  espacio abre su menú («Lun 12 oct · 09:30»): dar cita presencial o por videoconsulta, dar múltiples citas, sobreagendar y bloquear
 *  el espacio. Las citas y los bloqueos que caen en el mismo horario se reparten el ancho en columnas (`columnasSuperpuestas`); cada
 *  tarjeta trae un «+» para sobreagendar en su horario. Sin permisos de agenda (dentista y asistente) la grilla es de solo lectura: sin
 *  menú, sin «+» y sin quitar bloqueos. Al imprimir no salen ni los «+» ni los menús. Las cuentas están en lib/agendaSemana.ts.
 *
 *  En el celular los siete días no entran (quedaban columnas de 46 px y tarjetas ilegibles): la grilla tiene un ancho mínimo (unos tres días
 *  por pantalla, como los calendarios del teléfono) y se recorre de costado, con la fila de los días fija arriba y las horas fijas a la
 *  izquierda. Todo vive en un solo contenedor con scroll (`gridRef`). */
import { useCallback, useRef, useState, type RefObject } from "react";
import { CalendarCheck, CalendarPlus, CalendarRange, Lock, Plus, Video } from "lucide-react";
import { useStore, fmtTime, fullName } from "@/lib/store";
import { ALTO_HORA, MINUTOS_CELDA, celdasDelDia, columnasSuperpuestas, posicionEnGrilla, tituloDeEspacio } from "@/lib/agendaSemana";
import { etiquetaDeBloqueo, rangoDeBloqueo } from "@/lib/bloqueos";
import type { AgendaBlock, Appointment, AppointmentStatus } from "@/lib/types";
import { Card } from "@/components/ui";
import { Desplegable, ItemMenu } from "@/components/Desplegable";
import { ComentarioCita } from "@/components/agenda/ComentarioCita";
import { MenuBloqueo, quienBloquea } from "@/components/agenda/MenuBloqueo";

/** Lo que se elige en el menú de un espacio. */
export type AccionEspacio = "presencial" | "video" | "multiples" | "sobreagendar" | "bloquear";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CELDAS = celdasDelDia();
/** Una tarjeta se dibuja de al menos media hora de alto: para repartir el ancho cuenta así. */
const MINIMO_EN_PANTALLA = MINUTOS_CELDA * 60_000;

const STATUS_BG: Record<AppointmentStatus, string> = {
  confirmada: "bg-state-okbg border-state-ok/30 text-state-ok",
  en_atencion: "bg-azure-50 border-azure-400/50 text-azure-700",
  en_sala: "bg-violet-50 border-violet-300/60 text-violet-700",
  pendiente: "bg-state-warnbg border-state-warn/30 text-state-warn",
  completada: "bg-state-infobg border-azure-300/40 text-azure-700",
  cancelada: "bg-state-errbg border-state-err/30 text-state-err line-through",
  ausente: "bg-state-warnbg border-state-warn/30 text-state-warn",
};

/** La columna de las horas y los siete días (sin crecer por el contenido: el encabezado y la grilla quedan alineados). */
const COLUMNAS = "56px repeat(7,minmax(0,1fr))";

/** Rayado gris de un espacio bloqueado. */
const RAYADO = "[background-image:repeating-linear-gradient(135deg,#eceff3_0,#eceff3_6px,#f7f8fa_6px,#f7f8fa_12px)]";

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function GrillaSemanal({ weekStart, citas, bloqueos, gridRef, puedeAgendar, puedeBloquear, onVer, onAccion, onSobreagendar, onQuitarBloqueos }: {
  weekStart: Date;
  /** Las citas de la semana, ya filtradas. */
  citas: Appointment[];
  /** Los espacios bloqueados de la semana, ya filtrados. */
  bloqueos: AgendaBlock[];
  gridRef: RefObject<HTMLDivElement | null>;
  /** agenda.create: dar cita (en todas sus variantes) y el «+» de cada tarjeta. */
  puedeAgendar: boolean;
  /** agenda.edit: bloquear espacios y quitarlos. */
  puedeBloquear: boolean;
  onVer: (a: Appointment) => void;
  onAccion: (accion: AccionEspacio, fecha: Date, hora: string) => void;
  onSobreagendar: (a: Appointment) => void;
  onQuitarBloqueos: (ids: string[]) => void;
}) {
  const { db } = useStore();
  const hoy = new Date().toDateString();
  const interactivo = puedeAgendar || puedeBloquear;

  // Un solo menú de espacio y uno de bloqueo para toda la grilla, anclados a lo que se tocó.
  const anclaEspacio = useRef<HTMLElement | null>(null);
  const [espacio, setEspacio] = useState<{ fecha: Date; hora: string; etiqueta: string } | null>(null);
  const cerrarEspacio = useCallback(() => setEspacio(null), []);
  const anclaBloqueo = useRef<HTMLElement | null>(null);
  const [bloqueoAbierto, setBloqueoAbierto] = useState<AgendaBlock | null>(null);
  const cerrarBloqueo = useCallback(() => setBloqueoAbierto(null), []);
  const elegir = (accion: AccionEspacio) => {
    if (!espacio) return;
    const { fecha, hora } = espacio;
    setEspacio(null);
    onAccion(accion, fecha, hora);
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div ref={gridRef} className="relative max-h-[560px] overflow-auto overscroll-x-contain print:max-h-none print:overflow-visible">
          <div className="min-w-[840px] md:min-w-[680px] print:min-w-0">
            <div className="sticky top-0 z-30 grid border-b border-clinic-border bg-white print:static" style={{ gridTemplateColumns: COLUMNAS }}>
              <div className="sticky left-0 z-10 bg-white print:static" />
              {DIAS.map((d, i) => {
                const date = addDays(weekStart, i);
                const esHoy = date.toDateString() === hoy;
                return (
                  <div key={d} className={`border-l border-clinic-border px-2 py-2.5 text-center ${esHoy ? "bg-azure-50" : "bg-white"}`}>
                    <div className="text-[13px] font-semibold text-clinic-muted">{d}</div>
                    <div className={`text-lg font-bold ${esHoy ? "text-azure-600" : "text-clinic-text"}`}>{date.getDate()}</div>
                  </div>
                );
              })}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: COLUMNAS }}>
              <div className="sticky left-0 z-20 bg-white print:static">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex items-start justify-end border-b border-clinic-border/60 pr-2 pt-1" style={{ height: ALTO_HORA }}>
                    <span className="tabular-nums text-[11px] text-clinic-muted">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const date = addDays(weekStart, dayIdx);
                const esHoy = date.toDateString() === hoy;
                const diaJs = (dayIdx + 1) % 7;
                const delDia = citas.filter((a) => new Date(a.start).getDay() === diaJs);
                const bloqueosDelDia = bloqueos.filter((b) => new Date(b.start).getDay() === diaJs);
                const columnas = columnasSuperpuestas(
                  [...bloqueosDelDia.map((b) => ({ id: `b:${b.id}`, start: b.start, end: b.end })), ...delDia.map((a) => ({ id: `c:${a.id}`, start: a.start, end: a.end }))],
                  { minimoMs: MINIMO_EN_PANTALLA },
                );
                /** Dónde va una tarjeta: su horario y su columna. A la derecha queda un canal libre para tocar el espacio de abajo. */
                const lugar = (clave: string, start: string, end: string) => {
                  const { top, height } = posicionEnGrilla(start, end);
                  const { col, cols } = columnas.get(clave) ?? { col: 0, cols: 1 };
                  return { top, height, left: `calc((100% - var(--canal)) * ${col / cols} + 2px)`, width: `calc((100% - var(--canal)) / ${cols} - 4px)` };
                };
                return (
                  <div key={dayIdx} className={`relative border-l border-clinic-border [--canal:8px] sm:[--canal:14px] ${esHoy ? "bg-azure-50/40" : ""}`}>
                    {CELDAS.map((hora, i) => {
                      const borde = i % 2 === 0 ? "border-dashed border-clinic-border/40" : "border-clinic-border/60";
                      if (!interactivo) return <div key={hora} className={`h-7 border-b ${borde}`} />;
                      const etiqueta = tituloDeEspacio(date, hora);
                      return (
                        <button
                          key={hora}
                          type="button"
                          aria-label={etiqueta}
                          aria-haspopup="menu"
                          aria-expanded={espacio?.etiqueta === etiqueta}
                          onClick={(ev) => { anclaEspacio.current = ev.currentTarget; setEspacio({ fecha: date, hora, etiqueta }); }}
                          className={`block h-7 w-full border-b ${borde} transition-colors hover:bg-azure-50 focus-visible:bg-azure-50 ${espacio?.etiqueta === etiqueta ? "bg-azure-100" : ""}`}
                        />
                      );
                    })}

                    {bloqueosDelDia.map((b) => {
                      const box = b.boxId ? db.boxes.find((x) => x.id === b.boxId)?.name : undefined;
                      const etiqueta = etiquetaDeBloqueo(b, quienBloquea(b, db.users), box);
                      const contenido = (
                        <>
                          <span className="flex items-center gap-1 truncate font-semibold text-clinic-text"><Lock aria-hidden className="h-3 w-3 shrink-0" />{b.reason || "Bloqueado"}</span>
                          <span className="block truncate tabular-nums">{rangoDeBloqueo(b)}</span>
                        </>
                      );
                      // flex en columna: un <button> centra su contenido en vertical, y en un bloqueo de varias horas el motivo quedaba en el medio.
                    const cls = `flex h-full w-full flex-col justify-start overflow-hidden rounded-lg border border-clinic-border px-1.5 py-1 text-left text-[11px] text-clinic-muted ${RAYADO}`;
                      return (
                        <div key={b.id} style={lugar(`b:${b.id}`, b.start, b.end)} className="absolute">
                          {puedeBloquear ? (
                            <button
                              type="button"
                              aria-label={etiqueta}
                              title={etiqueta}
                              aria-haspopup="menu"
                              onClick={(ev) => { ev.stopPropagation(); anclaBloqueo.current = ev.currentTarget; setBloqueoAbierto(b); }}
                              className={`${cls} transition-colors hover:border-clinic-muted`}
                            >
                              {contenido}
                            </button>
                          ) : (
                            <div title={etiqueta} className={cls}>{contenido}</div>
                          )}
                        </div>
                      );
                    })}

                    {delDia.map((a) => {
                      const p = db.patients.find((x) => x.id === a.patientId);
                      const dent = db.users.find((x) => x.id === a.dentistId);
                      // Lugar para el ícono del comentario, sin que el relleno haga a la tarjeta más ancha que su columna (dos o tres citas en el
                      // mismo horario dejan tarjetas angostas). El «+» va encima del texto: aparece al pasar el mouse y en pantallas táctiles.
                      const relleno = a.notes?.trim() ? "pr-[min(1.5rem,45%)]" : "";
                      return (
                        <div key={a.id} style={lugar(`c:${a.id}`, a.start, a.end)} className="group absolute hover:z-10 focus-within:z-10">
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); onVer(a); }}
                            className={`flex h-full w-full flex-col justify-start overflow-hidden rounded-lg border px-1 py-1 text-left text-[11px] font-semibold shadow-card transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 hover:-translate-y-px hover:shadow-pop ${STATUS_BG[a.status]} ${relleno}`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              {dent && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dent.color }} title={dent.name} />}
                              {a.sobrecupo && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">Sobrecupo</span>}
                              <span className="truncate">{fmtTime(a.start)} · {a.title || "Cita"}</span>
                            </div>
                            {p && <div className="truncate font-normal opacity-80">{fullName(p)}</div>}
                          </button>
                          {/* Los íconos no se salen de su tarjeta (con citas superpuestas la tarjeta es angosta): lo que no entra se recorta por
                              la izquierda. La barra deja pasar los toques a la tarjeta; solo los íconos los toman. */}
                          <div className="pointer-events-none absolute left-0.5 right-0.5 top-0.5 flex items-center justify-end gap-0.5 overflow-hidden print:hidden">
                            <ComentarioCita texto={a.notes} className="pointer-events-auto shrink-0 bg-white/80" />
                            {puedeAgendar && (
                              <button
                                type="button"
                                aria-label="Sobreagendar en este horario"
                                title="Sobreagendar en este horario"
                                onClick={(ev) => { ev.stopPropagation(); onSobreagendar(a); }}
                                className="pointer-events-auto grid h-5 w-5 shrink-0 place-items-center rounded bg-white/90 text-azure-700 opacity-0 shadow-card transition-opacity hover:bg-azure-50 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Desplegable ancla={anclaEspacio} abierto={!!espacio} onCerrar={cerrarEspacio} ancho={250} etiqueta={espacio?.etiqueta}>
        {espacio && (
          <>
            <p className="px-3 pb-1 pt-2 text-[12px] font-bold text-clinic-muted">{espacio.etiqueta}</p>
            {puedeAgendar && (
              <>
                <ItemMenu onClick={() => elegir("presencial")}><CalendarPlus aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar cita presencial</ItemMenu>
                <ItemMenu onClick={() => elegir("video")}><Video aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar cita por videoconsulta</ItemMenu>
                <ItemMenu onClick={() => elegir("multiples")}><CalendarRange aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar múltiples citas</ItemMenu>
                <ItemMenu onClick={() => elegir("sobreagendar")}><CalendarCheck aria-hidden className="h-3.5 w-3.5 text-amber-600" /> Sobreagendar en este horario</ItemMenu>
              </>
            )}
            {puedeAgendar && puedeBloquear && <div className="my-1 border-t border-clinic-border" />}
            {puedeBloquear && <ItemMenu onClick={() => elegir("bloquear")}><Lock aria-hidden className="h-3.5 w-3.5 text-clinic-muted" /> Bloquear espacio</ItemMenu>}
          </>
        )}
      </Desplegable>
      <MenuBloqueo bloqueo={bloqueoAbierto} ancla={anclaBloqueo} onCerrar={cerrarBloqueo} onQuitar={onQuitarBloqueos} />
    </>
  );
}
