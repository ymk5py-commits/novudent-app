"use client";
/** Los campos de un documento clínico (texto, párrafo, número, lista y casillas) y las
 *  secciones que los agrupan, como el «Nuevo documento clínico» de Dentalink: cada sección con
 *  su barra azul y los campos en una grilla de cuatro columnas (una sola en el celular). */
import { useId } from "react";
import { camposVisibles, type Sexo, type Valores } from "@/lib/documentosClinicos";
import type { CampoDocumento, SeccionDocumento } from "@/lib/types";
import { inputCls } from "@/components/ui";

function CampoEditor({ campo, valor, onChange, disabled }: {
  campo: CampoDocumento;
  valor: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();

  if (campo.tipo === "casillas") {
    const marcadas = Array.isArray(valor) ? valor : [];
    return (
      <fieldset className="min-w-0" disabled={disabled}>
        <legend className="mb-1.5 block text-[13px] font-semibold text-clinic-text">{campo.etiqueta}</legend>
        <div className="space-y-1">
          {(campo.opciones ?? []).map((o) => (
            <label key={o} className="flex cursor-pointer items-start gap-2 text-[13px] text-clinic-text">
              <input
                type="checkbox"
                className="mt-0.5 accent-azure-600"
                checked={marcadas.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...marcadas, o] : marcadas.filter((x) => x !== o))}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const texto = typeof valor === "string" ? valor : "";
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold text-clinic-text">{campo.etiqueta}</label>
      {campo.tipo === "seleccion" ? (
        <select id={id} className={inputCls} value={texto} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">Seleccionar</option>
          {(campo.opciones ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : campo.tipo === "parrafo" ? (
        <textarea id={id} rows={2} className={inputCls} value={texto} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          type={campo.tipo === "numero" ? "number" : "text"}
          inputMode={campo.tipo === "numero" ? "decimal" : undefined}
          className={inputCls}
          value={texto}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function SeccionesEditor({ secciones, valores, onChange, sexo, disabled }: {
  secciones: SeccionDocumento[];
  valores: Valores;
  onChange: (v: Valores) => void;
  /** Para ocultar las preguntas «solo mujeres» si el paciente es hombre. */
  sexo?: Sexo;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      {secciones.map((s) => (
        <section key={s.id} aria-labelledby={`seccion-${s.id}`}>
          <h3 id={`seccion-${s.id}`} className="mb-2 border-l-4 border-azure-600 pl-3 text-[13px] font-bold uppercase tracking-wide text-azure-700">{s.titulo}</h3>
          <div className="grid gap-x-6 gap-y-4 rounded border border-clinic-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
            {camposVisibles(s, sexo).map((c) => (
              <CampoEditor
                key={c.id}
                campo={c}
                valor={valores[c.id]}
                disabled={disabled}
                onChange={(v) => onChange({ ...valores, [c.id]: v })}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
