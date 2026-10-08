"use client";
/** Chat interno (spec Dentalink 8.3 + pedido del cliente en el documento de revisión):
 *  - «Equipo»: el canal de siempre, lo ven todos (colección `teamMessages`);
 *  - directos: una conversación por persona activa de la clínica (`directMessages`,
 *    que solo leen sus dos participantes y el admin — ver firestore.rules);
 *  - difusión general: el admin le escribe a todos; a cada uno le llega en su
 *    conversación con el admin, marcado «Difusión», sin saber a quién más.
 *  En el celular la lista y la conversación son dos pantallas, con «Volver». El canal
 *  del equipo se escucha en vivo acá; los directos los escucha el store, porque el
 *  contador de no leídos del menú tiene que moverse en cualquier pantalla. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { fsdb } from "@/lib/firebase";
import { useStore, fmtTime, fmtDate } from "@/lib/store";
import { can, rolLabel } from "@/lib/rbac";
import {
  MAX_TEXTO, textoParaEnviar, nuevoDirecto, armarDifusion, destinatariosDifusion, conversaciones, hilo,
  idsPorMarcarLeidos, difusiones, type Difusion,
} from "@/lib/chat";
import { Card } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Send, MessageCircle, Users, Megaphone, ArrowLeft, CheckCheck, Info } from "lucide-react";
import type { TeamMessage, DirectMessage, User } from "@/lib/types";

type Vista = { tipo: "equipo" } | { tipo: "difusion" } | { tipo: "directo"; userId: string };

const iniciales = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
/** Hora si es de hoy; si no, la fecha. */
const cuando = (iso: string) => (new Date(iso).toDateString() === new Date().toDateString() ? fmtTime(iso) : fmtDate(iso));
const GRIS = "#64748B";

export default function ChatPage() {
  const { db, session, backend, addTeamMessage, addDirectMessage, addDifusion, markDirectsRead } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const yo = session?.userId ?? "";
  const esAdmin = !!session && can(session.role, "users.manage");
  const [liveEquipo, setLiveEquipo] = useState<TeamMessage[] | null>(null);
  /** `null` = nada elegido: en el celular se ve la lista; en escritorio, el equipo. */
  const [vista, setVista] = useState<Vista | null>(null);

  // Canal del equipo en vivo (solo modo Firestore). Si falla, cae a db.teamMessages.
  useEffect(() => {
    if (backend !== "firebase" || !cid) return;
    const qy = query(collection(fsdb, "clinics", cid, "teamMessages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => setLiveEquipo(snap.docs.map((d) => d.data() as TeamMessage)), () => setLiveEquipo(null));
    return () => unsub();
  }, [backend, cid]);

  const equipo = useMemo(
    () => [...(liveEquipo ?? db.teamMessages)].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [liveEquipo, db.teamMessages],
  );
  const directos = db.directMessages;
  const convs = useMemo(() => conversaciones(db.users, directos, yo), [db.users, directos, yo]);
  // Difusiones enviadas: es la vista del admin, el único que lee todas las copias.
  const enviadas = useMemo(() => (esAdmin ? difusiones(directos) : []), [esAdmin, directos]);

  if (!session) return null;
  const usuario = (id: string) => db.users.find((u) => u.id === id);
  const nombreDe = (id: string, respaldo = "Usuario") => usuario(id)?.name ?? respaldo;
  const remitente = { id: session.userId, name: session.name };
  const ahora = () => new Date().toISOString();

  // Lo elegido, validado: un usuario dado de baja o una difusión sin ser admin vuelven al equipo.
  const otro = vista?.tipo === "directo" ? convs.find((c) => c.user.id === vista.userId)?.user : undefined;
  const activa: Vista =
    vista?.tipo === "directo" ? (otro ? vista : { tipo: "equipo" })
    : vista?.tipo === "difusion" ? (esAdmin ? vista : { tipo: "equipo" })
    : { tipo: "equipo" };
  const volver = () => setVista(null);

  const ultimoEquipo = equipo[equipo.length - 1];
  const vistaPrevia = (m: DirectMessage) => `${m.difusionId ? "Difusión · " : ""}${m.fromId === yo ? "Vos: " : ""}${m.text}`;

  return (
    <Reveal className="flex h-[calc(100dvh-7rem)] min-h-[26rem] flex-col md:h-[calc(100dvh-10.5rem)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><MessageCircle className="h-5 w-5" /></span>
        <div>
          <h1 className="text-[16px] font-bold text-clinic-text">Chat interno</h1>
          <p className="text-[11px] text-clinic-muted">El canal del equipo y tus mensajes directos.{backend === "firebase" ? " En vivo." : ""}</p>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 overflow-hidden p-0">
        <nav aria-label="Conversaciones" className={`${vista ? "hidden md:flex" : "flex"} w-full flex-col md:w-72 md:shrink-0 md:border-r md:border-clinic-border`}>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            <ItemConversacion
              activa={activa.tipo === "equipo"}
              onClick={() => setVista({ tipo: "equipo" })}
              avatar={<Avatar color="#0369C9" icono={<Users className="h-4 w-4" />} />}
              titulo="Equipo"
              subtitulo="Lo ve toda la clínica"
              vistaPrevia={ultimoEquipo ? `${ultimoEquipo.userId === yo ? "Vos" : nombreDe(ultimoEquipo.userId, ultimoEquipo.userName)}: ${ultimoEquipo.text}` : "Sin mensajes todavía"}
              hora={ultimoEquipo && cuando(ultimoEquipo.createdAt)}
            />
            {esAdmin && (
              <ItemConversacion
                activa={activa.tipo === "difusion"}
                onClick={() => setVista({ tipo: "difusion" })}
                avatar={<Avatar color="#051735" icono={<Megaphone className="h-4 w-4" />} />}
                titulo="Difusión general"
                subtitulo="Un mensaje a cada persona"
                vistaPrevia={enviadas[0] ? `${enviadas[0].fromId === yo ? "Vos" : nombreDe(enviadas[0].fromId, enviadas[0].fromName)}: ${enviadas[0].text}` : "Nadie ve a quién más le llegó"}
                hora={enviadas[0] && cuando(enviadas[0].createdAt)}
              />
            )}
            {convs.map((c) => (
              <ItemConversacion
                key={c.user.id}
                activa={activa.tipo === "directo" && activa.userId === c.user.id}
                onClick={() => setVista({ tipo: "directo", userId: c.user.id })}
                avatar={<Avatar color={c.user.color} nombre={c.user.name} />}
                titulo={c.user.name}
                subtitulo={rolLabel(c.user.role)}
                vistaPrevia={c.ultimo ? vistaPrevia(c.ultimo) : "Escribile un mensaje directo"}
                hora={c.ultimo && cuando(c.ultimo.createdAt)}
                sinLeer={c.sinLeer}
              />
            ))}
          </ul>
        </nav>

        <div className={`${vista ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {activa.tipo === "equipo" && (
            <section aria-label="Conversación del equipo" className="flex min-h-0 flex-1 flex-col">
              <CabeceraHilo onVolver={volver} avatar={<Avatar color="#0369C9" icono={<Users className="h-4 w-4" />} />} titulo="Equipo" subtitulo={`Todo el equipo · ${db.users.filter((u) => u.active !== false).length} personas`} />
              <ListaMensajes
                vacio="Todavía no hay mensajes. Escribí el primero para todo el equipo."
                items={equipo.map((m) => ({
                  id: m.id, mio: m.userId === yo, autor: nombreDe(m.userId, m.userName), color: usuario(m.userId)?.color ?? GRIS,
                  texto: m.text, createdAt: m.createdAt,
                }))}
              />
              <Redactor
                etiqueta="Mensaje para todo el equipo"
                placeholder="Escribí un mensaje al equipo…"
                onEnviar={(texto) => addTeamMessage({ id: `tm_${Date.now()}`, clinicId: cid, userId: session.userId, userName: session.name, text: texto, createdAt: ahora() })}
              />
            </section>
          )}

          {activa.tipo === "directo" && otro && (
            <HiloDirecto
              key={otro.id}
              otro={otro}
              mensajes={hilo(directos, yo, otro.id)}
              pendientes={idsPorMarcarLeidos(directos, yo, otro.id)}
              yo={yo}
              miNombre={session.name}
              miColor={usuario(yo)?.color ?? GRIS}
              marcarLeidos={markDirectsRead}
              onVolver={volver}
              onEnviar={(texto) => addDirectMessage(nuevoDirecto({ clinicId: cid, from: remitente, toId: otro.id, text: texto, createdAt: ahora() }))}
            />
          )}

          {activa.tipo === "difusion" && esAdmin && (
            <PanelDifusion
              destinatarios={destinatariosDifusion(db.users, yo)}
              enviadas={enviadas}
              nombreDe={nombreDe}
              onVolver={volver}
              onEnviar={(texto) => {
                const copias = armarDifusion({ clinicId: cid, from: remitente, destinatarios: destinatariosDifusion(db.users, yo), text: texto, createdAt: ahora() });
                addDifusion(copias);
                return copias.length;
              }}
            />
          )}
        </div>
      </Card>
    </Reveal>
  );
}

function Avatar({ color, nombre, icono }: { color?: string; nombre?: string; icono?: ReactNode }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: color ?? GRIS }}>
      {icono ?? iniciales(nombre ?? "")}
    </span>
  );
}

function ItemConversacion({ activa, onClick, avatar, titulo, subtitulo, vistaPrevia, hora, sinLeer = 0 }: {
  activa: boolean; onClick: () => void; avatar: ReactNode; titulo: string; subtitulo: string; vistaPrevia: string; hora?: string; sinLeer?: number;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={activa ? "true" : undefined}
        className={`flex w-full items-center gap-3 border-b border-clinic-border/60 px-3 py-2.5 text-left transition-colors ${activa ? "bg-azure-50" : "hover:bg-clinic-bg"}`}
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-bold text-clinic-text">{titulo}</span>
            {hora && <span className="shrink-0 text-[11px] text-clinic-muted">{hora}</span>}
          </span>
          <span className="block truncate text-[11px] font-semibold text-clinic-muted">{subtitulo}</span>
          <span className={`block truncate text-xs ${sinLeer > 0 ? "font-bold text-clinic-text" : "text-clinic-muted"}`}>{vistaPrevia}</span>
        </span>
        {sinLeer > 0 && (
          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-azure-600 px-1.5 tabular-nums text-[11px] font-bold text-white">
            <span aria-hidden>{sinLeer}</span>
            <span className="sr-only">{sinLeer === 1 ? "1 mensaje sin leer" : `${sinLeer} mensajes sin leer`}</span>
          </span>
        )}
      </button>
    </li>
  );
}

function CabeceraHilo({ onVolver, avatar, titulo, subtitulo }: { onVolver: () => void; avatar: ReactNode; titulo: string; subtitulo: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-clinic-border px-3 py-2.5">
      <button type="button" onClick={onVolver} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-azure-700 transition-colors hover:bg-azure-50 md:hidden">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      {avatar}
      <div className="min-w-0">
        <h2 className="truncate text-sm font-bold text-clinic-text">{titulo}</h2>
        <p className="truncate text-[11px] text-clinic-muted">{subtitulo}</p>
      </div>
    </div>
  );
}

type ItemMensaje = { id: string; mio: boolean; autor: string; color: string; texto: string; createdAt: string; difusion?: boolean; leido?: boolean };

function ListaMensajes({ items, vacio }: { items: ItemMensaje[]; vacio: string }) {
  const caja = useRef<HTMLDivElement>(null);
  // Al fondo al abrir y con cada mensaje nuevo. Se mueve la caja y no la ventana
  // (scrollIntoView arrastraba toda la página en el celular).
  useEffect(() => {
    const el = caja.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  if (items.length === 0) return <div className="grid flex-1 place-items-center p-6 text-center text-sm text-clinic-muted">{vacio}</div>;
  return (
    <div ref={caja} role="log" aria-label="Mensajes" className="min-h-0 flex-1 overflow-y-auto p-4">
      <ol className="space-y-3">
        {items.map((m, i) => {
          const nuevoDia = i === 0 || items[i - 1].createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
          return (
            <li key={m.id}>
              {nuevoDia && <div className="my-2 text-center text-[13px] font-semibold text-clinic-muted">{fmtDate(m.createdAt)}</div>}
              <div className={`flex items-end gap-2 ${m.mio ? "flex-row-reverse" : ""}`}>
                <Avatar color={m.color} nombre={m.autor} />
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.mio ? "rounded-br-sm bg-azure-600 text-white" : "rounded-bl-sm bg-clinic-bg text-clinic-text"}`}>
                  {(!m.mio || m.difusion) && (
                    <div className={`mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold ${m.mio ? "text-white/85" : "text-azure-700"}`}>
                      {!m.mio && <span>{m.autor}</span>}
                      {m.difusion && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px tabular-nums text-[13px] font-semibold ${m.mio ? "bg-white/20 text-white" : "bg-navy-800 text-white"}`}>
                          <Megaphone className="h-3 w-3" aria-hidden /> Difusión
                        </span>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                  <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${m.mio ? "text-white/75" : "text-clinic-muted"}`}>
                    {fmtTime(m.createdAt)}
                    {m.mio && m.leido && <><CheckCheck className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Leído</span></>}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Redactor({ etiqueta, placeholder, onEnviar }: { etiqueta: string; placeholder: string; onEnviar: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  const listo = textoParaEnviar(texto);
  const enviar = () => {
    if (!listo) return;
    onEnviar(listo);
    setTexto("");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="flex items-end gap-2 border-t border-clinic-border p-3">
      <div className="min-w-0 flex-1">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          aria-label={etiqueta}
          placeholder={placeholder}
          maxLength={MAX_TEXTO}
          rows={1}
          className="block max-h-32 min-h-10 w-full resize-none rounded-xl border border-clinic-border px-3 py-2 text-sm [field-sizing:content] focus:border-azure-400"
        />
        {texto.length > MAX_TEXTO - 200 && <p className="mt-1 text-right text-[11px] text-clinic-muted">{texto.length}/{MAX_TEXTO}</p>}
      </div>
      <button type="submit" disabled={!listo} aria-label="Enviar" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-azure-600 text-white transition-colors hover:bg-azure-700 disabled:opacity-40">
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}

function HiloDirecto({ otro, mensajes, pendientes, yo, miNombre, miColor, marcarLeidos, onVolver, onEnviar }: {
  otro: User; mensajes: DirectMessage[]; pendientes: string[]; yo: string; miNombre: string; miColor: string;
  marcarLeidos: (ids: string[]) => void; onVolver: () => void; onEnviar: (texto: string) => void;
}) {
  // Con la conversación abierta, lo que llega queda leído. Cada id se intenta UNA
  // vez: si la escritura fallara, el listener lo devolvería a "sin leer" y sin
  // esto quedaría reintentando en cada snapshot.
  const intentados = useRef(new Set<string>());
  useEffect(() => {
    const nuevos = pendientes.filter((id) => !intentados.current.has(id));
    if (nuevos.length === 0) return;
    nuevos.forEach((id) => intentados.current.add(id));
    marcarLeidos(nuevos);
  }, [pendientes, marcarLeidos]);

  return (
    <section aria-label={`Conversación con ${otro.name}`} className="flex min-h-0 flex-1 flex-col">
      <CabeceraHilo onVolver={onVolver} avatar={<Avatar color={otro.color} nombre={otro.name} />} titulo={otro.name} subtitulo={`${rolLabel(otro.role)} · mensaje directo`} />
      <ListaMensajes
        vacio={`Todavía no hay mensajes con ${otro.name}. Lo que escribas acá lo ven solo ustedes dos.`}
        items={mensajes.map((m) => ({
          id: m.id, mio: m.fromId === yo, autor: m.fromId === yo ? miNombre : otro.name, color: m.fromId === yo ? miColor : otro.color,
          texto: m.text, createdAt: m.createdAt, difusion: !!m.difusionId, leido: !!m.readAt,
        }))}
      />
      <Redactor etiqueta={`Mensaje para ${otro.name}`} placeholder={`Escribí un mensaje a ${otro.name}…`} onEnviar={onEnviar} />
    </section>
  );
}

function PanelDifusion({ destinatarios, enviadas, nombreDe, onVolver, onEnviar }: {
  destinatarios: User[]; enviadas: Difusion[]; nombreDe: (id: string, respaldo?: string) => string;
  onVolver: () => void; onEnviar: (texto: string) => number;
}) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  const listo = textoParaEnviar(texto);
  const n = destinatarios.length;
  const enviar = () => {
    if (!listo || n === 0) return;
    const cuantos = onEnviar(listo);
    setTexto("");
    setAviso(`Listo: le llegó a ${cuantos} ${cuantos === 1 ? "persona" : "personas"}.`);
  };
  return (
    <section aria-label="Difusión general" className="flex min-h-0 flex-1 flex-col">
      <CabeceraHilo onVolver={onVolver} avatar={<Avatar color="#051735" icono={<Megaphone className="h-4 w-4" />} />} titulo="Difusión general" subtitulo="Solo el administrador la manda" />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <p className="flex gap-2 rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
          <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
          <span>A cada persona activa le llega en su conversación con vos, marcado como «Difusión». Nadie ve a quién más le llegó: esa lista la ves solo vos.</span>
        </p>

        <form onSubmit={(e) => { e.preventDefault(); enviar(); }} className="space-y-2">
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setAviso(""); }}
            aria-label="Mensaje de la difusión"
            placeholder="Escribí el aviso para toda la clínica…"
            maxLength={MAX_TEXTO}
            rows={3}
            className="block w-full resize-y rounded-xl border border-clinic-border px-3 py-2 text-sm focus:border-azure-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <details className="text-[11px] text-clinic-muted">
              <summary className="cursor-pointer font-bold">
                {n === 0 ? "No hay otras personas activas en la clínica" : `Le va a llegar a ${n} ${n === 1 ? "persona" : "personas"}`}
              </summary>
              <p className="mt-1">{destinatarios.map((u) => u.name).join(", ")}</p>
            </details>
            <button type="submit" disabled={!listo || n === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-navy-800 px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-navy-700 disabled:opacity-40">
              <Send className="h-4 w-4" aria-hidden /> Enviar a todos
            </button>
          </div>
          <p role="status" className="text-xs font-semibold text-state-ok">{aviso}</p>
        </form>

        <div>
          <h3 className="mb-2 text-[13px] font-bold text-clinic-muted">Difusiones enviadas</h3>
          {enviadas.length === 0 ? (
            <p className="text-sm text-clinic-muted">Todavía no se mandó ninguna.</p>
          ) : (
            <ul className="space-y-3">
              {enviadas.map((d) => {
                const leidas = d.destinatarios.filter((x) => x.readAt).length;
                return (
                  <li key={d.difusionId} className="rounded-xl border border-clinic-border p-3">
                    <div className="flex flex-wrap justify-between gap-2 text-[11px] text-clinic-muted">
                      <span className="font-bold">{nombreDe(d.fromId, d.fromName)}</span>
                      <span>{fmtDate(d.createdAt)} · {fmtTime(d.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-clinic-text">{d.text}</p>
                    <p className="mt-2 text-[11px] font-bold text-clinic-muted">
                      Le llegó a {d.destinatarios.length} · {leidas === 0 ? "nadie la leyó todavía" : `la ${leidas === 1 ? "leyó 1" : `leyeron ${leidas}`}`}
                    </p>
                    <ul aria-label="Destinatarios" className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.destinatarios.map((x) => (
                        <li key={x.toId} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${x.readAt ? "bg-state-okbg text-state-ok" : "bg-clinic-bg text-clinic-muted"}`}>
                          {nombreDe(x.toId)}{x.readAt ? " · leída" : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
