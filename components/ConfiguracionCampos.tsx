"use client";
/** Configuración de campos del paciente (paridad Dentalink): matriz campo × contexto
 *  (Nuevo paciente / Al agendar / Agenda online) × {Presente, Requerido}, persistida en
 *  clinic.config.patientFields. La lógica (valores por defecto, campos fijos y los que
 *  no aplican) vive en lib/camposPaciente.ts, que es lo que usan los formularios. */
import { Fragment, useState } from "react";
import { Save } from "lucide-react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/rbac";
import { CAMPOS, CONTEXTOS, camposDe, type CampoResuelto } from "@/lib/camposPaciente";
import type { FieldContext, FieldConfig } from "@/lib/types";
import { Card, Btn } from "@/components/ui";

export function ConfiguracionCampos() {
  const { db, session, updateClinicConfig } = useStore();
  const canEdit = session ? can(session.role, "practice.config") : false;
  const saved = db.clinics[0]?.config.patientFields ?? {};
  const [local, setLocal] = useState<Record<string, FieldConfig>>(() => JSON.parse(JSON.stringify(saved)));
  const dirty = JSON.stringify(local) !== JSON.stringify(saved);

  // Estado resuelto por contexto: lo que de verdad ve cada formulario (incluye los valores por defecto).
  const resueltos = Object.fromEntries(CONTEXTOS.map((c) => [c.key, camposDe(local, c.key)])) as Record<string, CampoResuelto[]>;
  const celda = (field: string, ctx: FieldContext) => resueltos[ctx].find((c) => c.key === field)!;

  const toggle = (field: string, kind: "present" | "required", ctx: FieldContext) => {
    const c = celda(field, ctx);
    if (!canEdit || c.fijo || c.noAplica) return;
    setLocal((prev) => {
      const f: FieldConfig = prev[field] ?? {};
      if (kind === "present") {
        const presente = !c.presente;
        // Apagar «presente» apaga también «requerido»: un campo oculto no se puede exigir.
        return { ...prev, [field]: { present: { ...f.present, [ctx]: presente }, required: { ...f.required, ...(presente ? {} : { [ctx]: false }) } } };
      }
      const requerido = !c.requerido;
      // Requerido ⇒ presente.
      return { ...prev, [field]: { present: { ...f.present, ...(requerido ? { [ctx]: true } : {}) }, required: { ...f.required, [ctx]: requerido } } };
    });
  };

  const ayuda = (c: CampoResuelto, ctx: FieldContext) =>
    c.noAplica ? "No aplica: este dato lo carga la clínica, no el paciente."
      : c.fijo && ctx === "online" && (c.key === "documento" || c.key === "telefonoMovil") ? "Siempre obligatorio: la reserva busca al paciente por CI y le confirma por WhatsApp."
      : c.fijo ? "Siempre obligatorio." : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-clinic-text">Configuración de campos del paciente</h3>
          <p className="text-[11px] text-clinic-muted">Qué datos se piden (<b>presente</b>) y cuáles son obligatorios (<b>requerido</b>) al crear un paciente en cada lugar.</p>
        </div>
        {canEdit && <Btn disabled={!dirty} onClick={() => updateClinicConfig({ patientFields: local })}><Save className="h-4 w-4" /> Guardar</Btn>}
      </div>
      {dirty && <p role="status" className="rounded-xl bg-state-warnbg px-3 py-2 text-xs font-semibold text-state-warn">Hay cambios sin guardar.</p>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Campos del paciente por contexto</caption>
          <thead>
            <tr className="border-b border-clinic-border text-[13px] font-bold text-clinic-text">
              <th rowSpan={2} scope="col" className="px-4 py-3 text-left">Campo</th>
              {CONTEXTOS.map((c) => <th key={c.key} colSpan={2} scope="colgroup" className="border-l border-clinic-border px-2 py-2 text-center">{c.label}</th>)}
            </tr>
            <tr className="border-b border-clinic-border text-[13px] font-bold text-clinic-text">
              {CONTEXTOS.map((c) => (
                <Fragment key={c.key}>
                  <th scope="col" className="border-l border-clinic-border px-2 py-1 text-center font-bold">Presente</th>
                  <th scope="col" className="px-2 py-1 text-center font-bold">Requerido</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-clinic-border">
            {CAMPOS.map((f) => (
              <tr key={f.key} className="hover:bg-clinic-bg/40">
                <th scope="row" className="px-4 py-2 text-left font-normal text-clinic-text">{f.label}</th>
                {CONTEXTOS.map((ctx) => {
                  const c = celda(f.key, ctx.key);
                  const bloqueada = !canEdit || c.fijo || c.noAplica;
                  const tip = ayuda(c, ctx.key);
                  return (
                    <Fragment key={ctx.key}>
                      <td className="border-l border-clinic-border px-2 py-2 text-center" title={tip}>
                        {c.noAplica ? <span className="text-clinic-muted" aria-label="No aplica">—</span> : (
                          <input type="checkbox" aria-label={`${f.label}: presente en ${ctx.label}`} disabled={bloqueada} checked={c.presente} onChange={() => toggle(f.key, "present", ctx.key)} />
                        )}
                      </td>
                      <td className="px-2 py-2 text-center" title={tip}>
                        {c.noAplica ? <span className="text-clinic-muted" aria-label="No aplica">—</span> : (
                          <input type="checkbox" aria-label={`${f.label}: requerido en ${ctx.label}`} disabled={bloqueada} checked={c.requerido} onChange={() => toggle(f.key, "required", ctx.key)} />
                        )}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-clinic-muted">Nombre y apellidos siempre se piden. En la agenda online también la cédula y el WhatsApp: la reserva busca al paciente por CI y le confirma por WhatsApp.</p>
      {!canEdit && <p className="text-xs text-clinic-muted">Solo el administrador puede editar esta configuración.</p>}
    </div>
  );
}
