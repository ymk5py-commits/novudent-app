"use client";
/** El campo «Banco» del cheque: texto libre con las entidades de la clínica como sugerencia (Administración › Bancos y
 *  entidades financieras). Sigue aceptando cualquier nombre, así un cheque de un banco que no está en la lista se anota igual. */
import { useId } from "react";
import { useStore } from "@/lib/store";
import { sugerenciasDeBancos } from "@/lib/bancos";
import { inputCls } from "@/components/ui";

export function CampoBanco({ value, onChange, placeholder = "Banco Continental" }: { value: string; onChange: (valor: string) => void; placeholder?: string }) {
  const { db } = useStore();
  const id = useId();
  const sugerencias = sugerenciasDeBancos(db.clinics[0]?.config.entidadesFinancieras);
  return (
    <>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={sugerencias.length > 0 ? id : undefined} autoComplete="off" />
      {sugerencias.length > 0 && <datalist id={id}>{sugerencias.map((nombre) => <option key={nombre} value={nombre} />)}</datalist>}
    </>
  );
}
