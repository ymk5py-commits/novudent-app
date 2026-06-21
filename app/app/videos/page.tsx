"use client";
/** Videos 3D / educativos (spec 5.8): biblioteca de animaciones de tratamientos
 *  para mostrar al paciente y reducir su temor. Curable por la clínica
 *  (YouTube/Vimeo); se reproduce embebido o se abre en una pestaña. */
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Video, Plus, Pencil, Trash2, Play, ExternalLink } from "lucide-react";
import type { EduVideo } from "@/lib/types";

function ytId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

export default function VideosPage() {
  const { db, session, addEduVideo, updateEduVideo, deleteEduVideo } = useStore();
  const canManage = session ? can(session.role, "practice.config") : false;
  const [editing, setEditing] = useState<EduVideo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [playing, setPlaying] = useState<EduVideo | null>(null);
  const [cat, setCat] = useState("Todas");

  const categories = useMemo(() => ["Todas", ...Array.from(new Set(db.eduVideos.map((v) => v.category).filter(Boolean)))], [db.eduVideos]);
  const list = db.eduVideos.filter((v) => cat === "Todas" || v.category === cat);

  const reproducir = (v: EduVideo) => {
    if (ytId(v.url)) setPlaying(v);
    else if (typeof window !== "undefined") window.open(v.url, "_blank", "noopener");
  };

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-azure-50 text-azure-600"><Video className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-extrabold text-clinic-text">Videos 3D</h1>
            <p className="text-[11px] text-clinic-muted">Animaciones de tratamientos para explicar al paciente.</p>
          </div>
        </div>
        {canManage && <Btn className="ml-auto" onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Agregar video</Btn>}
      </div>

      {db.eduVideos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${cat === c ? "bg-navy-800 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>{c}</button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Empty title="Sin videos" desc="Agregá videos educativos (YouTube/Vimeo) para mostrar a los pacientes." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((v) => {
            const id = ytId(v.url);
            return (
              <Card key={v.id} className="overflow-hidden p-0">
                <button onClick={() => reproducir(v)} className="group relative block aspect-video w-full bg-navy-900">
                  {id ? (
                    <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt={v.title} className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-white/60"><Video className="h-10 w-10" /></span>
                  )}
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-azure-700 shadow-pop transition-transform group-hover:scale-110"><Play className="h-5 w-5" /></span>
                  </span>
                </button>
                <div className="p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone="info">{v.category || "General"}</Badge>
                    {!id && <span className="inline-flex items-center gap-0.5 text-[10px] text-clinic-muted"><ExternalLink className="h-3 w-3" /> Abre en YouTube</span>}
                  </div>
                  <div className="text-sm font-bold text-clinic-text">{v.title}</div>
                  {v.description && <p className="mt-1 text-xs text-clinic-muted">{v.description}</p>}
                  {canManage && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => { setEditing(v); setShowForm(true); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-azure-700" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => { if (confirm("¿Eliminar este video?")) deleteEduVideo(v.id); }} className="rounded-lg p-1.5 text-clinic-muted hover:bg-clinic-bg hover:text-state-err" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {playing && ytId(playing.url) && (
        <Modal title={playing.title} onClose={() => setPlaying(null)} wide>
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ytId(playing.url)}?autoplay=1&rel=0`}
              title={playing.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </Modal>
      )}

      {showForm && (
        <VideoForm
          video={editing}
          clinicId={db.clinics[0]?.id ?? ""}
          onClose={() => setShowForm(false)}
          onSave={(v) => { if (editing) updateEduVideo(v); else addEduVideo(v); setShowForm(false); }}
        />
      )}
    </Reveal>
  );
}

function VideoForm({ video, clinicId, onClose, onSave }: {
  video: EduVideo | null; clinicId: string; onClose: () => void; onSave: (v: EduVideo) => void;
}) {
  const [title, setTitle] = useState(video?.title ?? "");
  const [category, setCategory] = useState(video?.category ?? "");
  const [url, setUrl] = useState(video?.url ?? "");
  const [description, setDescription] = useState(video?.description ?? "");

  const guardar = () => {
    if (!title.trim() || !url.trim()) return;
    onSave({
      id: video?.id ?? `ev_${Date.now()}`, clinicId: video?.clinicId ?? clinicId,
      title: title.trim(), category: category.trim() || "General", url: url.trim(), description: description.trim() || undefined,
    });
  };

  return (
    <Modal title={video ? "Editar video" : "Agregar video"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ej. ¿Cómo funciona un implante?" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} list="video-cats" placeholder="Implantes, Endodoncia…" /><datalist id="video-cats">{["Implantes", "Endodoncia", "Ortodoncia", "Estética", "Prótesis", "Cirugía", "Prevención"].map((c) => <option key={c} value={c} />)}</datalist></Field>
          <Field label="URL del video (YouTube/Vimeo)"><input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://youtu.be/…" /></Field>
        </div>
        <Field label="Descripción"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-clinic-border px-4 py-2 text-sm font-bold text-clinic-muted hover:text-clinic-text">Cancelar</button>
          <Btn onClick={guardar}>Guardar video</Btn>
        </div>
      </div>
    </Modal>
  );
}
