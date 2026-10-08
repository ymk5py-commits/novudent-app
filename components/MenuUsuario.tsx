"use client";
/** Menú del usuario en la barra superior (paridad Dentalink: Mi perfil · Cerrar sesión ·
 *  Contáctanos · ID de soporte) y el pie «Plataforma de soporte». El ID de soporte es el id
 *  de la clínica: es lo que necesita el equipo de Novum para encontrar la cuenta. */
import { useRef, useState } from "react";
import { ChevronDown, UserRound, Headset, Copy, LogOut, KeyRound, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { rolLabel } from "@/lib/rbac";
import { SOPORTE, linkCorreoSoporte } from "@/lib/soporte";
import type { User } from "@/lib/types";
import { Btn, Field, Modal, inputCls } from "@/components/ui";
import { Desplegable, ItemMenu } from "@/components/Desplegable";

function copiar(texto: string) {
  try { void navigator.clipboard?.writeText(texto); } catch { /* sin portapapeles */ }
}

export function MenuUsuario({ me, clinica, onAyuda, onSalir }: { me?: User; clinica: string; onAyuda: () => void; onSalir: () => void }) {
  const { session } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [perfil, setPerfil] = useState(false);
  const [copiado, setCopiado] = useState(false);
  if (!session) return null;
  const iniciales = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <>
      <button
        ref={ref} type="button" aria-haspopup="menu" aria-expanded={abierto} aria-label={`Menú de ${session.name}`}
        onClick={() => setAbierto((a) => !a)}
        className="hidden shrink-0 items-center gap-2 rounded-[10px] px-1.5 py-1 text-left text-white transition-colors hover:bg-white/10 sm:flex"
      >
        <span className="hidden text-right xl:block xl:whitespace-nowrap">
          <span className="block text-xs font-bold leading-tight">{session.name}</span>
          <span className="block text-[11px] leading-tight text-white/75">{rolLabel(session.role)}</span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ring-2 ring-white/40" style={{ background: me?.color ?? "#0369C9" }} aria-hidden>{iniciales}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-white/70 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <Desplegable ancla={ref} abierto={abierto} onCerrar={() => setAbierto(false)} ancho={270} alinear="derecha" etiqueta="Menú del usuario">
        <div className="border-b border-clinic-border px-3 pb-2 pt-1">
          <div className="text-[13px] font-bold text-clinic-text">{session.name}</div>
          <div className="text-[12px] text-clinic-muted">{rolLabel(session.role)} · {clinica}</div>
        </div>
        <ItemMenu onClick={() => { setAbierto(false); setPerfil(true); }}><UserRound className="h-4 w-4 text-azure-600" /> Mi perfil</ItemMenu>
        <ItemMenu onClick={() => { setAbierto(false); onAyuda(); }}><Headset className="h-4 w-4 text-azure-600" /> Ayuda de Novum</ItemMenu>
        <ItemMenu onClick={() => { copiar(session.clinicId); setCopiado(true); window.setTimeout(() => setCopiado(false), 1500); }}>
          {copiado ? <Check className="h-4 w-4 text-state-ok" /> : <Copy className="h-4 w-4 text-azure-600" />}
          <span>ID de soporte: <b className="tabular-nums">{session.clinicId}</b></span>
        </ItemMenu>
        <div className="my-1 border-t border-clinic-border" />
        <ItemMenu onClick={() => { setAbierto(false); onSalir(); }} peligro><LogOut className="h-4 w-4" /> Cerrar sesión</ItemMenu>
      </Desplegable>
      {perfil && <MiPerfilModal me={me} clinica={clinica} onClose={() => setPerfil(false)} />}
    </>
  );
}

function MiPerfilModal({ me, clinica, onClose }: { me?: User; clinica: string; onClose: () => void }) {
  const { session, changeMyPassword } = useStore();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (!session) return null;

  const cambiar = async () => {
    setEstado(null);
    if (p1.length < 6) { setEstado({ ok: false, texto: "La contraseña debe tener al menos 6 caracteres." }); return; }
    if (p1 !== p2) { setEstado({ ok: false, texto: "Las contraseñas no coinciden." }); return; }
    setOcupado(true);
    try {
      await changeMyPassword(p1);
      setP1(""); setP2("");
      setEstado({ ok: true, texto: "Listo: tu contraseña nueva ya rige." });
    } catch (e) {
      setEstado({ ok: false, texto: e instanceof Error ? e.message : "No se pudo cambiar la contraseña." });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal title="Mi perfil" onClose={onClose}>
      <div className="space-y-4 text-[13px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-clinic-muted">Nombre</dt><dd className="font-semibold">{session.name}</dd>
          {me?.email && <><dt className="text-clinic-muted">Correo</dt><dd>{me.email}</dd></>}
          <dt className="text-clinic-muted">Rol</dt><dd>{rolLabel(session.role)}</dd>
          <dt className="text-clinic-muted">Clínica</dt><dd>{clinica}</dd>
          <dt className="text-clinic-muted">ID de soporte</dt>
          <dd className="flex items-center gap-2"><span className="tabular-nums">{session.clinicId}</span><button type="button" onClick={() => copiar(session.clinicId)} className="text-azure-700 hover:underline">Copiar</button></dd>
        </dl>

        <div className="border-t border-clinic-border pt-3">
          <div className="mb-2 flex items-center gap-1.5 font-bold text-clinic-text"><KeyRound className="h-4 w-4 text-azure-600" /> Cambiar contraseña</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contraseña nueva"><input type="password" autoComplete="new-password" className={inputCls} value={p1} onChange={(e) => setP1(e.target.value)} /></Field>
            <Field label="Repetí la contraseña"><input type="password" autoComplete="new-password" className={inputCls} value={p2} onChange={(e) => setP2(e.target.value)} /></Field>
          </div>
          {estado && <p role={estado.ok ? "status" : "alert"} className={`mt-2 rounded px-3 py-2 font-semibold ${estado.ok ? "bg-state-okbg text-state-ok" : "bg-state-errbg text-state-err"}`}>{estado.texto}</p>}
          <div className="mt-3 flex justify-end"><Btn disabled={ocupado || !p1 || !p2} onClick={() => void cambiar()}>Guardar contraseña</Btn></div>
        </div>
      </div>
    </Modal>
  );
}

/** Pie del panel: por dónde escribirle a Novum y el ID de soporte (Dentalink: «Plataforma de soporte»). */
export function PieSoporte({ clinica, usuario, clinicId }: { clinica: string; usuario: string; clinicId: string }) {
  const quien = { clinica, usuario };
  return (
    <footer className="border-t border-clinic-border bg-white px-4 py-3 text-center text-[12px] text-clinic-muted print:hidden">
      <span className="font-semibold text-clinic-text">Plataforma de soporte</span>
      {SOPORTE.email && <> · <a href={linkCorreoSoporte(SOPORTE.email, quien)} className="text-azure-700 hover:underline">{SOPORTE.email}</a></>}
      {SOPORTE.whatsapp && <> · WhatsApp <span className="tabular-nums">+{SOPORTE.whatsapp}</span></>}
      {SOPORTE.horario && <> · {SOPORTE.horario}</>}
      {" · "}ID de soporte: <span className="tabular-nums text-clinic-text">{clinicId}</span>
    </footer>
  );
}
