"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { fullName } from "@/lib/store";
import type { Patient } from "@/lib/types";

/** «Ya hay un paciente con esa CI»: sale debajo del campo de la CI cuando otro paciente ya la tiene. Dos personas no
 *  comparten CI, pero hay casos reales (un menor que usa la de su responsable), así que se puede seguir confirmando que
 *  es otra persona. Sin confirmar, el alta no se hace: una ficha duplicada parte la historia clínica en dos y arreglarla
 *  después (Fusión de fichas) pierde datos.
 *  Con `onUsar` (el popup de «Dar cita») se ofrece quedarse con el paciente que ya existe en vez de abrirle la ficha. */
export function AvisoCiRepetida({ repetidos, otraPersona, onOtraPersona, onUsar }: {
  repetidos: readonly Patient[];
  otraPersona: boolean;
  onOtraPersona: (v: boolean) => void;
  onUsar?: (p: Patient) => void;
}) {
  if (repetidos.length === 0) return null;
  return (
    <div role="status" className="space-y-2 rounded-xl border border-state-warn/30 bg-state-warnbg px-3.5 py-3 text-sm text-state-warn">
      <p className="font-semibold">
        <AlertTriangle aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
        Ya hay {repetidos.length === 1 ? "un paciente" : `${repetidos.length} pacientes`} con esa CI:{" "}
        {repetidos.map((p, i) => (
          <span key={p.id}>
            {i > 0 && "; "}
            {onUsar ? (
              <>
                <b>{fullName(p)}</b> (CI {p.document}){" "}
                <button type="button" onClick={() => onUsar(p)} className="font-bold underline">Usar a {fullName(p)}</button>
              </>
            ) : (
              <>
                <Link href={`/app/pacientes/${p.id}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">{fullName(p)}</Link>{" "}
                (CI {p.document}{p.disabled ? ", deshabilitado" : ""})
              </>
            )}
          </span>
        ))}
        .
      </p>
      <label className="flex items-start gap-2 text-xs font-normal text-clinic-text">
        <input type="checkbox" className="mt-0.5" checked={otraPersona} onChange={(e) => onOtraPersona(e.target.checked)} />
        <span><b>Es otra persona</b> con la misma CI (por ejemplo, un menor que usa la CI de su responsable): crear la ficha igual.</span>
      </label>
    </div>
  );
}
