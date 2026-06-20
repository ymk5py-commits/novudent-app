"use client";
/** Configuración de campos del paciente (paridad Dentalink): matriz campo × contexto
 *  (Nuevo paciente / Al agendar / Agenda online / Check-in) × {Presente, Requerido},
 *  persistida en clinic.config.patientFields. */
import { Fragment, useState } from "react";
import { Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { FieldContext, FieldConfig } from "@/lib/types";
import { Card, Btn } from "@/components/ui";

const FIELDS: { key: string; label: string }[] = [
  { key: "nombreLegal", label: "Nombre legal" },
  { key: "nombreSocial", label: "Nombre social" },
  { key: "apellidos", label: "Apellidos" },
  { key: "documento", label: "Cédula / DNI" },
  { key: "email", label: "Email" },
  { key: "convenio", label: "Convenio" },
  { key: "numeroInterno", label: "Número interno" },
  { key: "sexo", label: "Sexo" },
  { key: "genero", label: "Género" },
  { key: "fechaNacimiento", label: "Fecha de nacimiento" },
  { key: "ciudad", label: "Ciudad" },
  { key: "municipio", label: "Municipio / comuna" },
  { key: "direccion", label: "Dirección" },
  { key: "telefonoFijo", label: "Teléfono fijo" },
  { key: "telefonoMovil", label: "Teléfono móvil" },
  { key: "actividad", label: "Actividad o profesión" },
  { key: "empleador", label: "Empleador" },
  { key: "observaciones", label: "Observaciones" },
  { key: "apoderado", label: "Apoderado" },
  { key: "referencia", label: "Referencia" },
  { key: "dniRepLegal", label: "DNI representante legal" },
];

const CONTEXTS: { key: FieldContext; label: string }[] = [
  { key: "nuevo", label: "Nuevo paciente" },
  { key: "agenda", label: "Al agendar" },
  { key: "online", label: "Agenda online" },
  { key: "checkin", label: "Check-in" },
];

export function ConfiguracionCampos() {
  const { db, session, updateClinicConfig } = useStore();
  const canEdit = session ? can(session.role, "practice.config") : false;
  const saved = db.clinics[0]?.config.patientFields ?? {};
  const [local, setLocal] = useState<Record<string, FieldConfig>>(() => JSON.parse(JSON.stringify(saved)));
  const dirty = JSON.stringify(local) !== JSON.stringify(saved);

  const get = (field: string, kind: "present" | "required", ctx: FieldContext) => !!local[field]?.[kind]?.[ctx];
  const toggle = (field: string, kind: "present" | "required", ctx: FieldContext) => {
    if (!canEdit) return;
    setLocal((prev) => {
      const f: FieldConfig = prev[field] ?? { present: {}, required: {} };
      const next: FieldConfig = { ...f, [kind]: { ...f[kind], [ctx]: !f[kind]?.[ctx] } };
      if (kind === "required" && next.required?.[ctx]) next.present = { ...next.present, [ctx]: true }; // requerido ⇒ presente
      return { ...prev, [field]: next };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-extrabold text-clinic-text">Configuración de campos del paciente</h3>
          <p className="text-[11px] text-clinic-muted">Qué campos están <b>presentes</b> y cuáles son <b>requeridos</b> en cada contexto.</p>
        </div>
        {canEdit && <Btn disabled={!dirty} onClick={() => updateClinicConfig({ patientFields: local })}><Save className="h-4 w-4" /> Guardar</Btn>}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-clinic-border text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
              <th rowSpan={2} className="px-4 py-3 text-left">Campo</th>
              {CONTEXTS.map((c) => <th key={c.key} colSpan={2} className="border-l border-clinic-border px-2 py-2 text-center">{c.label}</th>)}
            </tr>
            <tr className="border-b border-clinic-border text-[10px] font-bold uppercase text-clinic-muted">
              {CONTEXTS.map((c) => (
                <Fragment key={c.key}>
                  <th className="border-l border-clinic-border px-2 py-1 text-center font-semibold">Pres.</th>
                  <th className="px-2 py-1 text-center font-semibold">Req.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-clinic-border">
            {FIELDS.map((f) => (
              <tr key={f.key} className="hover:bg-clinic-bg/40">
                <td className="px-4 py-2 font-semibold text-clinic-text">{f.label}</td>
                {CONTEXTS.map((c) => (
                  <Fragment key={c.key}>
                    <td className="border-l border-clinic-border px-2 py-2 text-center">
                      <input type="checkbox" disabled={!canEdit} checked={get(f.key, "present", c.key)} onChange={() => toggle(f.key, "present", c.key)} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input type="checkbox" disabled={!canEdit} checked={get(f.key, "required", c.key)} onChange={() => toggle(f.key, "required", c.key)} />
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {!canEdit && <p className="text-xs text-clinic-muted">Solo el administrador puede editar esta configuración.</p>}
    </div>
  );
}
