"use client";
/** Chat interno del equipo (spec Dentalink 8.3). Mensajería privada recepción ↔
 *  odontólogos ↔ admin. En modo Firestore es EN VIVO vía onSnapshot; en modo local
 *  cae a la copia cargada. Escribe vía la acción del store (write-through). */
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { fsdb } from "@/lib/firebase";
import { useStore, fmtTime, fmtDate } from "@/lib/store";
import { Card, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Send, MessageCircle } from "lucide-react";
import type { TeamMessage } from "@/lib/types";

const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function ChatPage() {
  const { db, session, backend, addTeamMessage } = useStore();
  const cid = db.clinics[0]?.id ?? "";
  const [live, setLive] = useState<TeamMessage[] | null>(null);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Suscripción en vivo (solo modo Firestore). Si falla, cae a db.teamMessages.
  useEffect(() => {
    if (backend !== "firebase" || !cid) return;
    const qy = query(collection(fsdb, "clinics", cid, "teamMessages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => setLive(snap.docs.map((d) => d.data() as TeamMessage)), () => setLive(null));
    return () => unsub();
  }, [backend, cid]);

  const messages = useMemo(
    () => [...(live ?? db.teamMessages)].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [live, db.teamMessages],
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const userColor = (id: string) => db.users.find((u) => u.id === id)?.color ?? "#64748B";

  const send = () => {
    const t = text.trim();
    if (!t || !session) return;
    addTeamMessage({ id: `tm_${Date.now()}`, clinicId: cid, userId: session.userId, userName: session.name, text: t, createdAt: new Date().toISOString() });
    setText("");
  };

  return (
    <Reveal className="mx-auto flex h-[calc(100vh-9.5rem)] max-w-3xl flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><MessageCircle className="h-5 w-5" /></span>
        <div>
          <h1 className="text-lg font-extrabold text-clinic-text">Chat interno</h1>
          <p className="text-[11px] text-clinic-muted">Mensajería privada del equipo.{backend === "firebase" ? " En vivo." : ""}</p>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <Empty title="Sin mensajes" desc="Escribí el primer mensaje del equipo abajo." />
          ) : messages.map((m, i) => {
            const mine = m.userId === session?.userId;
            const showDay = i === 0 || messages[i - 1].createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
            return (
              <div key={m.id}>
                {showDay && <div className="my-2 text-center text-[11px] font-bold uppercase tracking-wide text-clinic-muted">{fmtDate(m.createdAt)}</div>}
                <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: userColor(m.userId) }}>{initials(m.userName)}</span>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-azure-600 text-white" : "rounded-bl-sm bg-clinic-bg text-clinic-text"}`}>
                    {!mine && <div className="mb-0.5 text-[11px] font-bold text-azure-700">{m.userName}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={`mt-0.5 text-right text-[11px] ${mine ? "text-white/70" : "text-clinic-muted"}`}>{fmtTime(m.createdAt)}</div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-clinic-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escribí un mensaje al equipo…"
            className="flex-1 rounded-xl border border-clinic-border px-3 py-2 text-sm focus:border-azure-400"
          />
          <button onClick={send} disabled={!text.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-azure-600 text-white transition-colors hover:bg-azure-700 disabled:opacity-40" aria-label="Enviar"><Send className="h-4 w-4" /></button>
        </div>
      </Card>
    </Reveal>
  );
}
