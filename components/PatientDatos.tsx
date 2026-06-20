"use client";
/** Sub-tab "Datos personales" de la ficha: form completo estilo Dentalink
 *  (Datos requeridos + Datos opcionales). */
import { useState } from "react";
import { Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Patient } from "@/lib/types";
import { Card, Btn, Field, inputCls } from "@/components/ui";

export function DatosTab({ patient }: { patient: Patient }) {
  const { session, upsertPatient } = useStore();
  const canEdit = session ? can(session.role, "engagement.forms") || can(session.role, "emr.write") : false;

  const orig = {
    tipo: patient.tipo ?? "", firstName: patient.firstName, lastName: patient.lastName,
    document: patient.document, foreigner: patient.foreigner ?? false, email: patient.email ?? "",
    phone: patient.phone, birthDate: patient.birthDate ?? "", socialName: patient.socialName ?? "",
    insurer: patient.insurer ?? "", internalNumber: patient.internalNumber ?? "", sex: patient.sex ?? "",
    gender: patient.gender ?? "", city: patient.city ?? "", municipio: patient.municipio ?? "",
    address: patient.address ?? "", activity: patient.activity ?? "", employer: patient.employer ?? "",
    landline: patient.landline ?? "", guardian: patient.guardian ?? "", referencia: patient.referencia ?? "",
    observaciones: patient.observaciones ?? "", legalRepDoc: patient.legalRepDoc ?? "",
  };
  const [f, setF] = useState(orig);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== JSON.stringify(orig);

  const T = (label: string, k: keyof typeof f, type = "text") => (
    <Field label={label}>
      <input type={type} className={inputCls} value={f[k] as string} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </Field>
  );

  const save = () =>
    upsertPatient({
      ...patient,
      tipo: f.tipo.trim() || undefined,
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), document: f.document.trim(),
      foreigner: f.foreigner || undefined,
      email: f.email.trim() || undefined, phone: f.phone.trim(), birthDate: f.birthDate || undefined,
      socialName: f.socialName.trim() || undefined, insurer: f.insurer.trim() || undefined,
      internalNumber: f.internalNumber.trim() || undefined,
      sex: (f.sex || undefined) as Patient["sex"], gender: (f.gender || undefined) as Patient["gender"],
      city: f.city.trim() || undefined, municipio: f.municipio.trim() || undefined,
      address: f.address.trim() || undefined, activity: f.activity.trim() || undefined,
      employer: f.employer.trim() || undefined, landline: f.landline.trim() || undefined,
      guardian: f.guardian.trim() || undefined, referencia: f.referencia.trim() || undefined,
      observaciones: f.observaciones.trim() || undefined, legalRepDoc: f.legalRepDoc.trim() || undefined,
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-clinic-text">Datos personales</h3>
        {canEdit && (
          <Btn disabled={!dirty || !f.firstName.trim() || !f.lastName.trim()} onClick={save}>
            <Save className="h-4 w-4" /> Guardar datos
          </Btn>
        )}
      </div>

      <Card className="p-5">
        <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Datos requeridos</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {T("Tipo", "tipo")}
          {T("Nombre legal", "firstName")}
          {T("Apellidos", "lastName")}
          <Field label="Cédula identidad / DNI">
            <div className="flex items-center gap-2">
              <input className={inputCls} value={f.document} disabled={!canEdit} onChange={(e) => set({ document: e.target.value })} />
              <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-clinic-muted">
                <input type="checkbox" checked={f.foreigner} disabled={!canEdit} onChange={(e) => set({ foreigner: e.target.checked })} /> Extranjero
              </label>
            </div>
          </Field>
          {T("Email", "email", "email")}
          {T("Teléfono móvil", "phone")}
          {T("Fecha de nacimiento", "birthDate", "date")}
        </div>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-clinic-muted">Datos opcionales</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {T("Nombre social", "socialName")}
          {T("Convenio / seguro", "insurer")}
          {T("Número interno", "internalNumber")}
          <Field label="Sexo">
            <select className={inputCls} value={f.sex} disabled={!canEdit} onChange={(e) => set({ sex: e.target.value as typeof f.sex })}>
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </Field>
          <Field label="Género">
            <select className={inputCls} value={f.gender} disabled={!canEdit} onChange={(e) => set({ gender: e.target.value as typeof f.gender })}>
              <option value="">Sin especificar</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          {T("Ciudad", "city")}
          {T("Municipio / comuna", "municipio")}
          {T("Dirección", "address")}
          {T("Actividad o profesión", "activity")}
          {T("Empleador", "employer")}
          {T("Teléfono fijo", "landline")}
          {T("Apoderado", "guardian")}
          {T("Referencia (cómo nos conoció)", "referencia")}
          {T("DNI representante legal", "legalRepDoc")}
        </div>
        <div className="mt-3">
          <Field label="Observaciones">
            <textarea rows={2} className={inputCls} value={f.observaciones} disabled={!canEdit} onChange={(e) => set({ observaciones: e.target.value })} />
          </Field>
        </div>
      </Card>

      {!canEdit && <p className="text-xs text-clinic-muted">Tu rol tiene acceso de solo lectura a los datos del paciente.</p>}
    </div>
  );
}
