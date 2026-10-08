"use client";
/** Configuración › «Datos de la clínica»: el nombre, la dirección y el teléfono que salen en la cabecera, en los
 *  impresos y en los mensajes a los pacientes, y la moneda. Antes se veían pero no se podían corregir (los cargaba
 *  Novum al dar de alta la clínica).
 *
 *  Un solo «Guardar datos» para los tres: `updateClinicProfile` los escribe juntos (el nombre es un campo del documento
 *  de la clínica; la dirección y el teléfono, de su configuración). El nombre es obligatorio; la dirección y el teléfono
 *  se pueden dejar vacíos. Las reglas (largos, limpieza) están en lib/datosClinica.ts. */
import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { CURRENCY_LIST, type CurrencyCode } from "@/lib/currency";
import { MAX_DIRECCION, MAX_NOMBRE_CLINICA, MAX_TELEFONO, revisarDatosClinica } from "@/lib/datosClinica";
import { Btn, Card, Field, inputCls } from "@/components/ui";

export function DatosClinica() {
  const { db, updateClinicConfig, updateClinicProfile } = useStore();
  const clinic = db.clinics[0];
  const nombre = clinic?.name ?? "";
  const direccion = clinic?.config.address ?? "";
  const telefono = clinic?.config.phone ?? "";
  const [f, setF] = useState({ name: nombre, address: direccion, phone: telefono });
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const cambios = f.name !== nombre || f.address !== direccion || f.phone !== telefono;

  // Si los datos cambian desde otro lado y acá no hay nada sin guardar, se muestra lo nuevo (también deja en pantalla el texto ya limpio).
  useEffect(() => {
    if (!cambios) setF({ name: nombre, address: direccion, phone: telefono });
  }, [nombre, direccion, telefono]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambia lo guardado: `cambios` depende del borrador

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const r = revisarDatosClinica(f);
    if (!r.ok) { setError(r.error); setGuardado(false); return; }
    setError(null);
    setF(r.datos); // lo que queda guardado (sin espacios de más): así "sin cambios" se cumple apenas se guarda
    const ok = await updateClinicProfile(r.datos);
    setGuardado(ok); // si Firestore la rechazó, el aviso «No se guardó» (con reintento) lo da el Shell
    if (ok) setTimeout(() => setGuardado(false), 3000);
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-azure-600" /><h2 className="font-bold text-clinic-text">Datos de la clínica</h2></div>
      <form noValidate onSubmit={guardar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><input className={inputCls} value={f.name} maxLength={MAX_NOMBRE_CLINICA} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="organization" /></Field>
          <Field label="Teléfono"><input type="tel" className={inputCls} value={f.phone} maxLength={MAX_TELEFONO} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Ej.: +595 21 555 000" /></Field>
          <div className="sm:col-span-2">
            <Field label="Dirección"><input className={inputCls} value={f.address} maxLength={MAX_DIRECCION} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Calle, número y ciudad" autoComplete="street-address" /></Field>
          </div>
        </div>
        <p className="text-[11px] text-clinic-muted">Salen en la cabecera, en los documentos impresos (presupuestos, recetas, comprobantes) y en los mensajes a los pacientes.</p>
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {guardado && !cambios && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm font-bold text-state-ok"><CheckCircle2 aria-hidden className="h-4 w-4" /> Datos guardados</span>
          )}
          <Btn type="submit" disabled={!cambios}>Guardar datos</Btn>
        </div>
      </form>

      <div id="moneda" className="mt-4 scroll-mt-24 border-t border-clinic-border pt-3 text-sm">
        <span className="text-clinic-muted">Moneda:</span>{" "}
        <select
          value={clinic?.config.currency ?? "PYG"}
          onChange={(e) => updateClinicConfig({ currency: e.target.value as CurrencyCode })}
          className="ml-1 rounded-lg border border-clinic-border bg-white px-2 py-1 text-sm font-bold text-clinic-text focus:border-azure-400"
        >
          {CURRENCY_LIST.map((c) => <option key={c.code} value={c.code}>{c.symbol} · {c.name} ({c.code})</option>)}
        </select>
        <p className="mt-2 text-[11px] text-clinic-muted">Cambiar la moneda afecta el formato en toda la app (presupuestos, pagos, caja, reportes). No convierte montos por tipo de cambio.</p>
      </div>
    </Card>
  );
}
