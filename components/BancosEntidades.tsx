"use client";
/** «Bancos y entidades financieras» (Administración): la lista de bancos, financieras, cooperativas y tarjetas con las que trabaja la
 *  clínica. Hoy sirve para anotar los cheques sin tipear el banco cada vez (el campo «Banco» las ofrece como sugerencia).
 *  Se guarda en el documento de la clínica (`config.entidadesFinancieras`); la lógica está en `lib/bancos.ts`. */
import { useState } from "react";
import { Check, Landmark, Pencil, Plus, Power, Sparkles, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  agregarEntidad, agregarSugeridas, agruparPorTipo, alternarActiva, quitarEntidad, renombrarEntidad,
  TIPO_DE_ENTIDAD_LABEL, TIPO_DE_ENTIDAD_SINGULAR, type EntidadFinanciera, type TipoDeEntidad,
} from "@/lib/bancos";
import { Badge, Btn, Card, Field, inputCls } from "@/components/ui";

const nuevoId = (indice = 0) => `ef_${Date.now().toString(36)}${indice.toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function BancosEntidades() {
  const { db, updateClinicConfig } = useStore();
  const lista: EntidadFinanciera[] = db.clinics[0]?.config.entidadesFinancieras ?? [];
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoDeEntidad>("banco");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);

  const guardar = (nueva: EntidadFinanciera[]) => updateClinicConfig({ entidadesFinancieras: nueva });
  const faltanSugeridas = agregarSugeridas(lista, (i) => String(i)).agregadas > 0;

  const agregar = () => {
    const r = agregarEntidad(lista, { name: nombre, type: tipo }, nuevoId());
    if (!r.ok) { setError(r.error); return; }
    guardar(r.lista);
    setNombre("");
    setError(null);
    setAviso(`Se agregó «${r.lista[r.lista.length - 1].name}».`);
  };
  const sumarSugeridas = () => {
    const r = agregarSugeridas(lista, (i) => nuevoId(i));
    if (r.agregadas > 0) guardar(r.lista);
    setError(null);
    setAviso(r.agregadas > 0 ? `Se agregaron ${r.agregadas} entidades. Revisá la lista y sacá las que no uses.` : "Ya tenés todas las de la lista sugerida.");
  };
  const confirmarNombre = () => {
    if (!editando) return;
    const r = renombrarEntidad(lista, editando.id, editando.texto);
    if (!r.ok) { setError(r.error); return; }
    guardar(r.lista);
    setEditando(null);
    setError(null);
    setAviso(null);
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div id="bancos" className="flex scroll-mt-24 items-center gap-2">
          <Landmark aria-hidden className="h-4 w-4 text-azure-600" />
          <h2 className="font-bold text-clinic-text">Bancos y entidades financieras</h2>
          {lista.length > 0 && <Badge tone="muted">{lista.length}</Badge>}
        </div>
        {faltanSugeridas && <Btn variant="outline" onClick={sumarSugeridas}><Sparkles aria-hidden className="h-4 w-4" /> Agregar las más usadas en Paraguay</Btn>}
      </div>
      <p className="mb-3 text-xs text-clinic-muted">
        Los bancos, financieras, cooperativas y tarjetas con los que trabaja la clínica. Al anotar un <b>cheque</b>, el campo «Banco» los ofrece como sugerencia (seguís pudiendo escribir otro).
        Una entidad <b>desactivada</b> deja de ofrecerse, pero los pagos ya registrados la conservan.
      </p>

      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); agregar(); }}>
        <div className="min-w-[14rem] flex-1">
          <Field label="Nombre de la entidad">
            <input className={inputCls} value={nombre} onChange={(e) => { setNombre(e.target.value); setError(null); }} placeholder="Banco Continental" maxLength={60} />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Tipo">
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeEntidad)}>
              {(Object.keys(TIPO_DE_ENTIDAD_SINGULAR) as TipoDeEntidad[]).map((t) => <option key={t} value={t}>{TIPO_DE_ENTIDAD_SINGULAR[t]}</option>)}
            </select>
          </Field>
        </div>
        <Btn type="submit"><Plus aria-hidden className="h-4 w-4" /> Agregar</Btn>
      </form>
      {error && <p role="alert" className="mb-3 text-xs font-semibold text-state-err">{error}</p>}
      {aviso && !error && <p role="status" className="mb-3 rounded bg-state-okbg px-3 py-2 text-xs font-semibold text-state-ok">{aviso}</p>}

      {lista.length === 0 ? (
        <p className="rounded border border-dashed border-clinic-border p-4 text-center text-sm text-clinic-muted">
          Todavía no cargaste ninguna. Agregá la primera arriba, o usá «Agregar las más usadas en Paraguay» para arrancar con una lista y sacar lo que no uses.
        </p>
      ) : (
        <div className="space-y-4">
          {agruparPorTipo(lista).map((g) => (
            <section key={g.tipo} aria-label={TIPO_DE_ENTIDAD_LABEL[g.tipo]}>
              <h3 className="mb-1 text-[12px] font-bold uppercase tracking-wide text-clinic-muted">{TIPO_DE_ENTIDAD_LABEL[g.tipo]} <span className="font-semibold">({g.entidades.length})</span></h3>
              <ul className="divide-y divide-clinic-border rounded border border-clinic-border">
                {g.entidades.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-1.5">
                    {editando?.id === e.id ? (
                      <>
                        <input
                          autoFocus
                          aria-label={`Nuevo nombre de ${e.name}`}
                          className={`${inputCls} flex-1`}
                          value={editando.texto}
                          onChange={(ev) => setEditando({ id: e.id, texto: ev.target.value })}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") { ev.preventDefault(); confirmarNombre(); }
                            else if (ev.key === "Escape") { ev.preventDefault(); setEditando(null); setError(null); }
                          }}
                          maxLength={60}
                        />
                        <button type="button" onClick={confirmarNombre} title="Guardar nombre" aria-label="Guardar nombre" className="grid h-7 w-7 place-items-center rounded-lg text-state-ok hover:bg-state-okbg"><Check aria-hidden className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => { setEditando(null); setError(null); }} title="Cancelar" aria-label="Cancelar" className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg"><X aria-hidden className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <>
                        <span className={`min-w-0 flex-1 truncate text-sm ${e.active ? "font-semibold text-clinic-text" : "text-clinic-muted line-through"}`}>{e.name}</span>
                        {!e.active && <Badge tone="muted">Desactivada</Badge>}
                        <button type="button" onClick={() => { setEditando({ id: e.id, texto: e.name }); setError(null); }} title="Cambiar el nombre" aria-label={`Cambiar el nombre de ${e.name}`} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-azure-50 hover:text-azure-700"><Pencil aria-hidden className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => guardar(alternarActiva(lista, e.id))} aria-pressed={e.active} title={e.active ? "Desactivar: deja de ofrecerse" : "Activar"} aria-label={`${e.active ? "Desactivar" : "Activar"} ${e.name}`} className={`grid h-7 w-7 place-items-center rounded-lg hover:bg-clinic-bg ${e.active ? "text-state-ok" : "text-clinic-muted"}`}><Power aria-hidden className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => { if (confirm(`¿Sacar «${e.name}» de la lista?`)) guardar(quitarEntidad(lista, e.id)); }} title="Sacar de la lista" aria-label={`Sacar ${e.name} de la lista`} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"><Trash2 aria-hidden className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
