"use client";
/** «Quitar de la lista» (Pacientes › Análisis de estudios específicos): pide el motivo y devuelve el registro que se guarda en
 *  `Patient.seguimiento`. La validación (motivo elegido, texto de «Otro» obligatorio y acotado) es `armarQuita` de lib/seguimiento. */
import { useId, useState } from "react";
import { Modal, Btn, Field, inputCls } from "@/components/ui";
import { MAX_MOTIVO, MOTIVOS_DE_QUITA, OTRO_MOTIVO, armarQuita } from "@/lib/seguimiento";
import type { QuitaDeLista } from "@/lib/types";

export function QuitarDeListaModal({ nombre, por, onClose, onQuitar }: {
  /** Nombre del paciente, para que quede claro a quién se está quitando. */
  nombre: string;
  /** Quien quita (queda en el registro). */
  por: string;
  onClose: () => void;
  onQuitar: (quita: QuitaDeLista) => void;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const [otro, setOtro] = useState("");
  const [error, setError] = useState<string | null>(null);
  const grupo = useId();

  const confirmar = () => {
    const r = armarQuita({ motivo, otro, por, ahora: new Date() });
    if (!r.ok) { setError(r.error); return; }
    onQuitar(r.quita);
  };

  return (
    <Modal title="Quitar de la lista" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); confirmar(); }} className="space-y-4">
        <p className="text-sm text-clinic-text">
          Vas a sacar a <strong>{nombre}</strong> de «Sin próxima cita». Si más adelante se atiende de nuevo y no le agendan otra cita, vuelve solo a la lista.
        </p>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-clinic-text">Motivo</legend>
          <div className="space-y-1.5">
            {[...MOTIVOS_DE_QUITA, OTRO_MOTIVO].map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2.5 rounded border px-3 py-2 text-sm transition-colors ${motivo === m ? "border-azure-600 bg-azure-50 text-clinic-text" : "border-clinic-border bg-white text-clinic-text hover:border-azure-300"}`}>
                <input
                  type="radio" name={grupo} value={m} checked={motivo === m}
                  onChange={() => { setMotivo(m); setError(null); }}
                  className="h-4 w-4 accent-azure-600"
                />
                {m}
              </label>
            ))}
          </div>
        </fieldset>

        {motivo === OTRO_MOTIVO && (
          <Field label="¿Cuál es el motivo?" hint={`Hasta ${MAX_MOTIVO} letras. Queda guardado en la ficha.`}>
            <textarea
              value={otro} rows={3} maxLength={MAX_MOTIVO}
              onChange={(e) => { setOtro(e.target.value); setError(null); }}
              className={`${inputCls} resize-none`}
              aria-invalid={(!!error && !otro.trim()) || undefined}
            />
          </Field>
        )}

        {error && <p role="alert" className="text-sm font-semibold text-state-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit">Quitar de la lista</Btn>
        </div>
      </form>
    </Modal>
  );
}
