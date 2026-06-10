"use client";
/** Patient Finder (sec. 3.2 A): estado de interacción por íconos. */
import { useMemo, useState } from "react";
import { Search, FileText, ClipboardList, Plus, ChevronRight } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import type { Patient } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";

export default function PatientsPage() {
  const { db, session, upsertPatient } = useStore();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const xs = !t
      ? db.patients
      : db.patients.filter((p) => fullName(p).toLowerCase().includes(t) || p.document.includes(t) || p.phone.includes(t));
    return [...xs].sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [db.patients, q]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Pacientes</h1>
          <p className="text-sm text-clinic-muted">
            <FileText className="mr-1 inline h-3.5 w-3.5 text-state-warn" /> formularios pendientes ·
            <ClipboardList className="mx-1 inline h-3.5 w-3.5 text-state-info" /> actualización de historial pendiente
          </p>
        </div>
        <Btn onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Nuevo paciente</Btn>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, CI o teléfono…"
          className="w-full rounded-xl border border-clinic-border bg-white py-2.5 pl-9 pr-3 text-sm focus:border-azure-500 focus:outline-none"
        />
      </div>

      {list.length === 0 ? (
        <Empty title="Sin resultados" desc="Probá con otro nombre o número de documento." />
      ) : (
        <Card className="divide-y divide-clinic-border">
          {list.map((p) => {
            const pendingForms = p.forms.filter((f) => f.status === "pendiente").length;
            return (
              <a key={p.id} href={`/app/pacientes/${p.id}`} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-clinic-bg/70">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-azure-100 to-azure-200 font-bold text-azure-700 ring-1 ring-azure-200/60 transition-transform group-hover:scale-105">
                  {p.firstName[0]}{p.lastName[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-clinic-text">{fullName(p)}</span>
                  <span className="block text-xs text-clinic-muted">CI {p.document} · {p.phone}{p.insurer ? ` · ${p.insurer}` : ""}</span>
                </span>
                <span className="flex items-center gap-2">
                  {pendingForms > 0 && (
                    <span data-tip={`${pendingForms} formulario(s) pendiente(s)`} className="grid h-8 w-8 place-items-center rounded-lg bg-state-warnbg">
                      <FileText className="h-4 w-4 text-state-warn" />
                    </span>
                  )}
                  {p.historyUpdatePending && (
                    <span data-tip="Actualización de historial médico pendiente" className="grid h-8 w-8 place-items-center rounded-lg bg-state-infobg">
                      <ClipboardList className="h-4 w-4 text-state-info" />
                    </span>
                  )}
                  {pendingForms === 0 && !p.historyUpdatePending && <Badge tone="ok">Al día</Badge>}
                  <ChevronRight className="h-4 w-4 text-clinic-muted" />
                </span>
              </a>
            );
          })}
        </Card>
      )}

      {creating && (
        <NewPatient
          onClose={() => setCreating(false)}
          onSave={(p) => { upsertPatient(p); setCreating(false); }}
          clinicId={session!.clinicId}
        />
      )}
    </div>
  );
}

function NewPatient({ onClose, onSave, clinicId }: { onClose: () => void; onSave: (p: Patient) => void; clinicId: string }) {
  const [f, setF] = useState({ firstName: "", lastName: "", document: "", phone: "", email: "", insurer: "" });
  return (
    <Modal title="Nuevo paciente" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id: `p_${Date.now()}`,
            clinicId,
            firstName: f.firstName,
            lastName: f.lastName,
            document: f.document,
            phone: f.phone,
            email: f.email || undefined,
            insurer: f.insurer || undefined,
            forms: [
              { id: `f_${Date.now()}`, templateName: "Anamnesis inicial", status: "pendiente", fields: [{ label: "Alergias", value: "" }, { label: "Medicación actual", value: "" }, { label: "Antecedentes", value: "" }] },
            ],
            historyUpdatePending: false,
            emr: [],
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre"><input required className={inputCls} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
          <Field label="Apellido"><input required className={inputCls} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CI"><input required className={inputCls} value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} /></Field>
          <Field label="Teléfono"><input required className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+595 …" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (opcional)"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Seguro (opcional)"><input className={inputCls} value={f.insurer} onChange={(e) => setF({ ...f, insurer: e.target.value })} /></Field>
        </div>
        <p className="rounded-xl bg-azure-50 p-3 text-xs text-azure-700">Se asigna automáticamente el formulario de <b>Anamnesis inicial</b> como pendiente.</p>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Crear paciente</Btn></div>
      </form>
    </Modal>
  );
}
