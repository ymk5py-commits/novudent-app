"use client";
/** Campos del paciente según la configuración de la clínica (Pacientes → Configuración),
 *  por secciones. Lo usan el alta de paciente (página completa) y «Crear nuevo paciente»
 *  al dar una cita. Los requeridos llevan asterisco, `required` y `aria-required`; quien arma el
 *  formulario le pone `noValidate` y revisa con `useRevisionAlta` (lib/useRevisionAlta.ts), que
 *  marca acá los campos con problema (`problemas`: `aria-invalid` y borde rojo). Si la fecha de
 *  nacimiento es de un menor de edad, aparece la sección del responsable y pasa a ser obligatoria. */
import { Fragment, type ReactNode } from "react";
import { CAMPOS_RESPONSABLE, GRUPOS, esMenor, type CampoKey, type CampoResuelto, type ValoresCampos } from "@/lib/camposPaciente";
import { Field, inputCls } from "@/components/ui";

import { fechaLocal } from "@/lib/tareas";
export function CamposPacienteForm({ campos, valores, onChange, convenios = [], compacto = false, problemas = [], avisos = {} }: {
  /** Todos los campos del contexto (`camposDe`); se muestran los presentes. */
  campos: CampoResuelto[];
  valores: ValoresCampos;
  onChange: (valores: ValoresCampos) => void;
  /** Convenios de la clínica: se sugieren en el campo Convenio. */
  convenios?: string[];
  /** Sin títulos de sección (para ventanas chicas). */
  compacto?: boolean;
  /** Los campos a marcar como inválidos. */
  problemas?: readonly CampoKey[];
  /** Un aviso a todo el ancho debajo de un campo (p. ej. «ya hay un paciente con esa CI»). */
  avisos?: Partial<Record<CampoKey, ReactNode>>;
}) {
  const set = (key: string, v: string) => onChange({ ...valores, [key]: v });
  const menor = esMenor(valores);
  const mostrar = (c: CampoResuelto) => c.presente || (menor && CAMPOS_RESPONSABLE.includes(c.key));
  const obligatorio = (c: CampoResuelto) => c.requerido || (menor && CAMPOS_RESPONSABLE.includes(c.key));

  const campo = (c: CampoResuelto) => {
    const label = obligatorio(c) ? `${c.label} *` : c.label;
    const valor = valores[c.key] ?? "";
    const malo = problemas.includes(c.key);
    const comun = {
      id: `campo-${c.key}`, required: obligatorio(c), "aria-required": obligatorio(c), "aria-invalid": malo || undefined,
      className: malo ? `${inputCls} !border-state-err` : inputCls, value: valor,
    };
    const conAviso = (nodo: ReactNode) => (avisos[c.key] ? <Fragment key={c.key}>{nodo}<div className="sm:col-span-2">{avisos[c.key]}</div></Fragment> : nodo);
    if (c.tipo === "sexo" || c.tipo === "genero") {
      return conAviso(
        <Field key={c.key} label={label}>
          <select {...comun} onChange={(e) => set(c.key, e.target.value)}>
            <option value="">Elegí una opción</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            {c.tipo === "genero" && <option value="nd">Prefiero no decirlo</option>}
            {c.tipo === "genero" && valor === "otro" && <option value="otro">Otro</option>}
          </select>
        </Field>
      );
    }
    if (c.tipo === "textoLargo") {
      return conAviso(
        <div key={c.key} className="sm:col-span-2">
          <Field label={label}>
            <textarea {...comun} rows={2} maxLength={c.max} onChange={(e) => set(c.key, e.target.value)} />
          </Field>
        </div>
      );
    }
    const tipo = c.tipo === "fecha" ? "date" : c.tipo === "email" ? "email" : c.tipo === "tel" ? "tel" : "text";
    return conAviso(
      <Field key={c.key} label={label}>
        <input
          {...comun}
          type={tipo}
          maxLength={c.max}
          max={c.tipo === "fecha" ? fechaLocal() : undefined}
          placeholder={c.key === "telefonoMovil" ? "+595 …" : c.key === "parentesco" ? "Madre, padre, tutor…" : undefined}
          list={c.key === "convenio" && convenios.length > 0 ? "convenios-clinica" : undefined}
          onChange={(e) => set(c.key, e.target.value)}
        />
        {c.key === "convenio" && convenios.length > 0 && (
          <datalist id="convenios-clinica">{convenios.map((n) => <option key={n} value={n} />)}</datalist>
        )}
      </Field>
    );
  };

  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => {
        const lista = campos.filter((c) => c.grupo === g.key && mostrar(c));
        if (lista.length === 0) return null;
        // El responsable solo tiene sentido con un paciente menor de edad.
        if (g.key === "responsable" && !menor && !lista.some((c) => (valores[c.key] ?? "").trim())) {
          return compacto ? null : (
            <p key={g.key} className="text-xs text-clinic-muted">Si el paciente es menor de edad, al cargar la fecha de nacimiento se piden los datos del responsable.</p>
          );
        }
        return (
          <fieldset key={g.key} className="space-y-3">
            {!compacto && <legend className="mb-1 text-[13px] font-bold text-clinic-muted">{g.label}</legend>}
            {g.key === "responsable" && menor && (
              <p role="status" className="rounded-xl bg-state-infobg px-3 py-2 text-xs font-semibold text-state-info">El paciente es menor de edad: completá los datos del responsable.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">{lista.map(campo)}</div>
          </fieldset>
        );
      })}
    </div>
  );
}
