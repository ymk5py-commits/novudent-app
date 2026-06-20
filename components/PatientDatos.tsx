"use client";
/** Sub-tab "Datos personales" de la ficha: edición de datos demográficos del paciente. */
import { useState } from "react";
import { Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Patient } from "@/lib/types";
import { Card, Btn, Field, inputCls } from "@/components/ui";

export function DatosTab({ patient }: { patient: Patient }) {
  const { session, upsertPatient } = useStore();
  const canEdit = session ? can(session.role, "engagement.forms") || can(session.role, "emr.write") : false;
  const [f, setF] = useState({
    firstName: patient.firstName,
    lastName: patient.lastName,
    document: patient.document,
    phone: patient.phone,
    email: patient.email ?? "",
    birthDate: patient.birthDate ?? "",
    insurer: patient.insurer ?? "",
  });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const dirty =
    f.firstName !== patient.firstName || f.lastName !== patient.lastName || f.document !== patient.document ||
    f.phone !== patient.phone || f.email !== (patient.email ?? "") || f.birthDate !== (patient.birthDate ?? "") ||
    f.insurer !== (patient.insurer ?? "");

  const save = () =>
    upsertPatient({
      ...patient,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      document: f.document.trim(),
      phone: f.phone.trim(),
      email: f.email.trim() || undefined,
      birthDate: f.birthDate || undefined,
      insurer: f.insurer.trim() || undefined,
    });

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-extrabold text-clinic-text">Datos personales</h3>
        {canEdit && (
          <Btn disabled={!dirty || !f.firstName.trim() || !f.lastName.trim()} onClick={save}>
            <Save className="h-4 w-4" /> Guardar
          </Btn>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre"><input className={inputCls} value={f.firstName} disabled={!canEdit} onChange={(e) => set({ firstName: e.target.value })} /></Field>
        <Field label="Apellido"><input className={inputCls} value={f.lastName} disabled={!canEdit} onChange={(e) => set({ lastName: e.target.value })} /></Field>
        <Field label="Documento (CI)"><input className={inputCls} value={f.document} disabled={!canEdit} onChange={(e) => set({ document: e.target.value })} /></Field>
        <Field label="Teléfono"><input className={inputCls} value={f.phone} disabled={!canEdit} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={f.email} disabled={!canEdit} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Fecha de nacimiento"><input type="date" className={inputCls} value={f.birthDate} disabled={!canEdit} onChange={(e) => set({ birthDate: e.target.value })} /></Field>
        <Field label="Seguro / convenio"><input className={inputCls} value={f.insurer} disabled={!canEdit} onChange={(e) => set({ insurer: e.target.value })} /></Field>
      </div>
      {!canEdit && <p className="mt-3 text-xs text-clinic-muted">Tu rol tiene acceso de solo lectura a los datos del paciente.</p>}
    </Card>
  );
}
