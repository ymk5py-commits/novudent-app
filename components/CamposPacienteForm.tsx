"use client";
/** Campos del paciente según la configuración de la clínica (Pacientes → Configuración).
 *  Lo usan «Nuevo paciente» y «Paciente nuevo» al dar una cita. Los requeridos llevan
 *  asterisco y `required`: el navegador no deja enviar el formulario sin ellos. */
import type { CampoResuelto, ValoresCampos } from "@/lib/camposPaciente";
import { Field, inputCls } from "@/components/ui";

export function CamposPacienteForm({ campos, valores, onChange, convenios = [] }: {
  campos: CampoResuelto[];
  valores: ValoresCampos;
  onChange: (valores: ValoresCampos) => void;
  /** Convenios de la clínica: se sugieren en el campo Convenio. */
  convenios?: string[];
}) {
  const set = (key: string, v: string) => onChange({ ...valores, [key]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {campos.filter((c) => c.presente).map((c) => {
        const label = c.requerido ? `${c.label} *` : c.label;
        const valor = valores[c.key] ?? "";
        const comun = { required: c.requerido, "aria-required": c.requerido, className: inputCls, value: valor };
        if (c.tipo === "sexo" || c.tipo === "genero") {
          return (
            <Field key={c.key} label={label}>
              <select {...comun} onChange={(e) => set(c.key, e.target.value)}>
                <option value="">Sin especificar</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                {c.tipo === "genero" && <option value="otro">Otro</option>}
              </select>
            </Field>
          );
        }
        if (c.tipo === "textoLargo") {
          return (
            <div key={c.key} className="sm:col-span-2">
              <Field label={label}>
                <textarea {...comun} rows={2} maxLength={c.max} onChange={(e) => set(c.key, e.target.value)} />
              </Field>
            </div>
          );
        }
        const tipo = c.tipo === "fecha" ? "date" : c.tipo === "email" ? "email" : c.tipo === "tel" ? "tel" : "text";
        return (
          <Field key={c.key} label={label}>
            <input
              {...comun}
              type={tipo}
              maxLength={c.max}
              max={c.tipo === "fecha" ? new Date().toISOString().slice(0, 10) : undefined}
              placeholder={c.key === "telefonoMovil" ? "+595 …" : undefined}
              list={c.key === "convenio" && convenios.length > 0 ? "convenios-clinica" : undefined}
              onChange={(e) => set(c.key, e.target.value)}
            />
            {c.key === "convenio" && convenios.length > 0 && (
              <datalist id="convenios-clinica">{convenios.map((n) => <option key={n} value={n} />)}</datalist>
            )}
          </Field>
        );
      })}
    </div>
  );
}
