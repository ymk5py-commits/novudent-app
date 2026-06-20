"use client";
/** Notas del paciente (Datos personales, paridad Dentalink): un componente para los 3
 *  sub-tabs (Comentarios administrativos / Tareas de gestión / Emails) según `kind`. */
import { useState } from "react";
import { Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { useStore, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Patient, PatientNoteKind } from "@/lib/types";
import { Card, Btn, Field, inputCls, Empty } from "@/components/ui";

const NOUN: Record<PatientNoteKind, string> = { comentario: "comentario", tarea: "tarea", email: "email" };

export function PatientNotas({ patient, kind }: { patient: Patient; kind: PatientNoteKind }) {
  const { db, session, addPatientNote, updatePatientNote, deletePatientNote } = useStore();
  const canWrite = session ? can(session.role, "engagement.forms") || can(session.role, "emr.write") : false;
  const notes = db.patientNotes
    .filter((n) => n.patientId === patient.id && n.kind === kind)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState("");
  const noun = NOUN[kind];

  const add = () => {
    if (!session || !text.trim()) return;
    addPatientNote({
      id: `pn_${Date.now()}`,
      clinicId: patient.clinicId, patientId: patient.id, kind,
      text: text.trim(),
      subject: kind === "email" ? subject.trim() || undefined : undefined,
      dueDate: kind === "tarea" ? dueDate || undefined : undefined,
      done: kind === "tarea" ? false : undefined,
      createdAt: new Date().toISOString(), createdBy: session.name,
    });
    setText(""); setSubject(""); setDueDate("");
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card className="space-y-3 p-4">
          {kind === "email" && <Field label="Asunto"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
          <Field label={kind === "tarea" ? "Descripción de la tarea" : kind === "email" ? "Detalle del email" : "Comentario"}>
            <textarea rows={2} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Nuevo ${noun}…`} />
          </Field>
          <div className="flex items-center gap-2">
            {kind === "tarea" && <input type="date" className={`${inputCls} w-auto`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
            <Btn disabled={!text.trim()} onClick={add} className="ml-auto"><Plus className="h-4 w-4" /> Agregar {noun}</Btn>
          </div>
        </Card>
      )}

      {notes.length === 0 ? (
        <Empty title={`Sin ${noun}s`} desc={`Los ${noun}s del paciente aparecerán acá.`} />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Card key={n.id} className="flex items-start gap-3 p-4">
              {kind === "tarea" && (
                <button onClick={() => canWrite && updatePatientNote({ ...n, done: !n.done })} className="mt-0.5 shrink-0" title={n.done ? "Marcar pendiente" : "Marcar hecha"}>
                  {n.done ? <CheckCircle2 className="h-5 w-5 text-state-ok" /> : <Circle className="h-5 w-5 text-clinic-muted" />}
                </button>
              )}
              <div className="min-w-0 flex-1">
                {n.subject && <div className="text-sm font-bold text-clinic-text">{n.subject}</div>}
                <p className={`text-sm ${n.done ? "text-clinic-muted line-through" : "text-clinic-text"}`}>{n.text}</p>
                <div className="mt-1 text-[11px] text-clinic-muted">
                  {n.createdBy} · {fmtDate(n.createdAt)}{n.dueDate ? ` · vence ${fmtDate(n.dueDate)}` : ""}
                </div>
              </div>
              {canWrite && (
                <button onClick={() => deletePatientNote(n.id)} className="shrink-0 text-clinic-muted hover:text-state-err" title="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
