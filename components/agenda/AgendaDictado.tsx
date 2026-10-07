"use client";
/** «Dictar la semana»: la persona dice (o escribe) lo que tiene que hacer, la IA lo separa en tareas con
 *  su día, y se revisa todo ANTES de guardar. Nada se crea solo.
 *
 *  Ningún nombre de paciente viaja hacia la IA: vuelve el nombre tal como se dictó y acá se empareja con
 *  las fichas que la persona ve. */
import { useMemo, useState } from "react";
import { Loader2, Mic, Sparkles, Square, X } from "lucide-react";
import { useStore, fullName, CLINICA_DEMO_ID } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { useTareas } from "@/lib/useTareas";
import { useGrabadora } from "@/lib/useGrabadora";
import { emparejarPaciente, mensajeErrorIA, parsearPropuestas, type PropuestaTarea } from "@/lib/agendaIA";
import { esFecha } from "@/lib/tareas";
import { iaFetch } from "@/components/NovudentIA";
import { Btn, Modal, inputCls } from "@/components/ui";

type Fase = "dictar" | "armando" | "revisar";

interface FilaPropuesta extends PropuestaTarea {
  id: number;
  incluir: boolean;
  /** La ficha elegida (o la única que coincidió). */
  patientId?: string;
  /** Las fichas que coinciden con el nombre dictado. */
  candidatos: { id: string; nombre: string }[];
}

export function AgendaDictado({ onClose, onGuardadas }: { onClose: () => void; onGuardadas: (cuantas: number) => void }) {
  const { db, session } = useStore();
  const alcance = useAlcance();
  const { hoy, crearPersonalizada } = useTareas();
  const [fase, setFase] = useState<Fase>("dictar");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaPropuesta[]>([]);
  const [transcripcion, setTranscripcion] = useState("");

  const visibles = useMemo(() => db.patients.filter((p) => alcance.vePaciente(p.id)), [db.patients, alcance]);
  const nombreDe = (id?: string) => { const p = id ? db.patients.find((x) => x.id === id) : undefined; return p ? fullName(p) : undefined; };

  async function armar(carga: { texto?: string; audio?: string; mimeType?: string }) {
    setError(null);
    setFase("armando");
    try {
      const res = await iaFetch("/api/ia/agenda-semana", { ...carga, hoy });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(mensajeErrorIA(res.status, data.error, session?.clinicId === CLINICA_DEMO_ID));
      // Se vuelve a validar acá: lo que llega de la red no se da por bueno.
      const propuestas = parsearPropuestas(data.tareas, hoy);
      if (propuestas.length === 0) throw new Error("No encontré tareas en lo que dijiste. Probá de nuevo.");
      setFilas(propuestas.map((p, i) => {
        const candidatos = p.paciente
          ? emparejarPaciente(p.paciente, visibles).map((x) => ({ id: x.id, nombre: fullName(x) }))
          : [];
        return { ...p, id: i, incluir: true, candidatos, patientId: candidatos.length === 1 ? candidatos[0].id : undefined };
      }));
      setTranscripcion(typeof data.transcripcion === "string" ? data.transcripcion : "");
      setFase("revisar");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFase("dictar");
    }
  }

  const grabadora = useGrabadora((audio, mimeType) => armar({ audio, mimeType }));
  const mm = String(Math.floor(grabadora.segundos / 60)).padStart(2, "0");
  const ss = String(grabadora.segundos % 60).padStart(2, "0");

  const cambiar = (id: number, c: Partial<FilaPropuesta>) => setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...c } : f)));
  const elegidas = filas.filter((f) => f.incluir);

  function guardar() {
    if (elegidas.some((f) => !f.titulo.trim())) { setError("Una de las tareas quedó sin texto."); return; }
    if (elegidas.some((f) => !esFecha(f.fecha) || f.fecha < hoy)) { setError("Elegí una fecha de hoy en adelante en cada tarea."); return; }
    for (const f of elegidas) {
      crearPersonalizada({ detalle: f.titulo, fecha: f.fecha, patientId: f.patientId, patientName: nombreDe(f.patientId) });
    }
    onGuardadas(elegidas.length);
    onClose();
  }

  return (
    <Modal title="Dictar la semana" onClose={onClose} wide>
      {fase === "dictar" && grabadora.estado === "quieta" && (
        <div className="space-y-4">
          <p className="text-sm text-clinic-muted">
            Contá lo que tenés que hacer —con la voz o escribiendo— y la IA lo separa en tareas con su día. Antes de guardar las revisás vos.
          </p>
          <textarea
            rows={4}
            className={inputCls}
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setError(null); }}
            aria-label="Lo que tenés que hacer"
            placeholder="Ej.: El martes llamar a María López por su presupuesto. El jueves pedir guantes y anestesia. El viernes confirmar las citas del lunes."
          />
          {(error || grabadora.error) && (
            <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">{error || grabadora.error}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Btn variant="outline" onClick={() => void grabadora.iniciar()}><Mic aria-hidden className="h-4 w-4" /> Dictar con la voz</Btn>
            <Btn onClick={() => void armar({ texto })} disabled={!texto.trim()}><Sparkles aria-hidden className="h-4 w-4" /> Armar las tareas</Btn>
          </div>
        </div>
      )}

      {fase === "dictar" && grabadora.estado === "grabando" && (
        <div className="space-y-4 text-center">
          <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-state-errbg"><Mic aria-hidden className="h-8 w-8 text-state-err" /></span>
          <p className="text-2xl font-bold tabular-nums text-clinic-text" role="timer">{mm}:{ss}</p>
          <p className="text-xs text-clinic-muted">Grabando… contá lo que tenés que hacer y cuándo.</p>
          <Btn onClick={grabadora.detener}><Square aria-hidden className="h-4 w-4" /> Detener y armar las tareas</Btn>
        </div>
      )}

      {(fase === "armando" || (fase === "dictar" && grabadora.estado === "procesando")) && (
        <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-clinic-muted">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Armando tus tareas…
        </p>
      )}

      {fase === "revisar" && (
        <div className="space-y-4">
          {transcripcion && <p className="rounded-xl bg-clinic-bg px-3 py-2 text-xs text-clinic-muted"><b>Entendí:</b> «{transcripcion}»</p>}
          <p className="text-sm text-clinic-muted">Revisá las tareas antes de guardarlas: podés cambiar el texto o el día, o sacar las que no quieras.</p>
          <ul className="space-y-2.5">
            {filas.map((f) => (
              <li key={f.id} className={`rounded-xl border p-3 ${f.incluir ? "border-clinic-border" : "border-dashed border-clinic-border opacity-60"}`}>
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={f.incluir}
                    onChange={(e) => cambiar(f.id, { incluir: e.target.checked })}
                    aria-label={`Guardar esta tarea: ${f.titulo}`}
                    className="mt-2 h-4 w-4 shrink-0 accent-azure-600"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input className={inputCls} value={f.titulo} onChange={(e) => { cambiar(f.id, { titulo: e.target.value }); setError(null); }} aria-label="Texto de la tarea" disabled={!f.incluir} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" className={`${inputCls} !w-auto`} min={hoy} value={f.fecha} onChange={(e) => { cambiar(f.id, { fecha: e.target.value }); setError(null); }} aria-label={`Día de: ${f.titulo}`} disabled={!f.incluir} />
                      {f.patientId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-azure-50 py-1 pl-2.5 pr-1 text-xs font-bold text-azure-700">
                          {nombreDe(f.patientId)}
                          <button type="button" onClick={() => cambiar(f.id, { patientId: undefined })} aria-label={`Quitar el paciente de: ${f.titulo}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-white">
                            <X aria-hidden className="h-3 w-3" />
                          </button>
                        </span>
                      ) : f.candidatos.length > 1 ? (
                        <select
                          className={`${inputCls} !w-auto`}
                          value=""
                          onChange={(e) => cambiar(f.id, { patientId: e.target.value || undefined })}
                          aria-label={`¿Qué paciente es «${f.paciente}»?`}
                        >
                          <option value="">¿Cuál es «{f.paciente}»?</option>
                          {f.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      ) : f.paciente ? (
                        <span className="text-xs text-clinic-muted">«{f.paciente}» no está en tus fichas: queda como tarea interna.</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Btn variant="outline" onClick={() => { setFase("dictar"); setError(null); }}>Volver a dictar</Btn>
            <Btn onClick={guardar} disabled={elegidas.length === 0}>
              {elegidas.length === 1 ? "Guardar 1 tarea" : `Guardar ${elegidas.length} tareas`}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
