"use client";
/** Configuración › Documentos clínicos: las plantillas que la clínica ofrece en la ficha del
 *  paciente, ya sea un formulario (secciones con campos) o un texto de indicaciones. Editar una
 *  plantilla nunca cambia los documentos ya creados: cada documento guarda su propia copia.
 *  Los textos de Novudent llegan «por revisar» hasta que un odontólogo los revisa y un
 *  administrador los marca como revisados acá. */
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Pencil, Plus, Power, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { idUnico, mover, normalizarPlantillas, plantillasDeClinica } from "@/lib/documentosClinicos";
import { PLANTILLAS_DE_FABRICA } from "@/lib/plantillasDocumento";
import type { CampoDocumento, PlantillaDocumento, SeccionDocumento, TipoCampoDocumento } from "@/lib/types";
import { Badge, Btn, Empty, Field, Modal, inputCls } from "@/components/ui";

const TIPO_CAMPO: Record<TipoCampoDocumento, string> = {
  texto: "Texto corto",
  parrafo: "Texto largo",
  numero: "Número",
  seleccion: "Lista (una opción)",
  casillas: "Casillas (varias opciones)",
};

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Quita `clave` de un objeto sin mutarlo (para apagar `inactiva` o `porRevisar`). */
function sin<T extends object, K extends keyof T>(o: T, clave: K): Omit<T, K> {
  const { [clave]: _fuera, ...resto } = o;
  return resto;
}

export function PlantillasDocumento() {
  const { db, updateClinicConfig } = useStore();
  const guardadas = db.clinics[0]?.config;
  const [lista, setLista] = useState<PlantillaDocumento[]>(() => plantillasDeClinica(guardadas));
  const [editando, setEditando] = useState<{ plantilla: PlantillaDocumento; nueva: boolean } | null>(null);
  const [guardado, setGuardado] = useState(false);

  const sucio = useMemo(
    () => JSON.stringify(lista) !== JSON.stringify(plantillasDeClinica(guardadas)),
    [lista, guardadas],
  );

  const cambiar = (id: string, f: (p: PlantillaDocumento) => PlantillaDocumento) => setLista((l) => l.map((p) => (p.id === id ? f(p) : p)));
  const ids = lista.map((p) => p.id);

  const duplicar = (p: PlantillaDocumento) => {
    const nueva: PlantillaDocumento = { ...copia(sin(p, "inactiva") as PlantillaDocumento), id: idUnico(`${p.id}_copia`, ids), nombre: `${p.nombre} (copia)` };
    setLista((l) => [...l, nueva]);
  };
  const eliminar = (p: PlantillaDocumento) => {
    if (!window.confirm(`¿Eliminar la plantilla «${p.nombre}»? Los documentos que ya se hicieron con ella no se tocan.`)) return;
    setLista((l) => l.filter((x) => x.id !== p.id));
  };
  const restablecer = () => {
    if (window.confirm("¿Volver a las plantillas de fábrica? Se pierden las que creaste y los cambios que hiciste.")) setLista(copia(PLANTILLAS_DE_FABRICA));
  };
  const guardar = () => {
    updateClinicConfig({ plantillasDocumento: normalizarPlantillas(lista) });
    setGuardado(true);
    window.setTimeout(() => setGuardado(false), 2500);
  };
  const nueva = () => setEditando({
    nueva: true,
    plantilla: { id: idUnico("plantilla", ids), nombre: "", tipo: "formulario", secciones: [] },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="outline" onClick={nueva}><Plus aria-hidden className="h-3.5 w-3.5" /> Nueva plantilla de documento</Btn>
        <Btn variant="ghost" onClick={restablecer}><RotateCcw aria-hidden className="h-3.5 w-3.5" /> Restablecer de fábrica</Btn>
      </div>

      {lista.length === 0 ? (
        <Empty title="Sin plantillas" desc="Sin plantillas no se pueden crear documentos clínicos. Agregá una o volvé a las de fábrica." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-clinic-border text-left font-bold text-clinic-text">
                <th className="px-2 py-2">Plantilla</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={`border-b border-clinic-border ${p.inactiva ? "opacity-60" : ""}`}>
                  <td className="px-2 py-2 font-semibold text-clinic-text">{p.nombre}</td>
                  <td className="px-2 py-2 text-clinic-muted">
                    {p.tipo === "formulario" ? `Formulario · ${(p.secciones ?? []).length} secciones` : "Texto de indicaciones"}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-1.5">
                      <Badge tone={p.inactiva ? "muted" : "ok"}>{p.inactiva ? "Inactiva" : "Activa"}</Badge>
                      {p.porRevisar && <Badge tone="warn">Por revisar</Badge>}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap items-center justify-end gap-1.5">
                      <Btn variant="outline" onClick={() => setEditando({ plantilla: copia(p), nueva: false })}><Pencil aria-hidden className="h-3.5 w-3.5" /> Editar</Btn>
                      <Btn variant="outline" onClick={() => duplicar(p)} tip={`Duplicar ${p.nombre}`}><Copy aria-hidden className="h-3.5 w-3.5" /> Duplicar</Btn>
                      <Btn variant="outline" onClick={() => cambiar(p.id, (x) => (x.inactiva ? (sin(x, "inactiva") as PlantillaDocumento) : { ...x, inactiva: true }))}>
                        <Power aria-hidden className="h-3.5 w-3.5" /> {p.inactiva ? "Activar" : "Desactivar"}
                      </Btn>
                      {p.porRevisar && (
                        <Btn variant="outline" onClick={() => cambiar(p.id, (x) => sin(x, "porRevisar") as PlantillaDocumento)}>
                          <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> Marcar como revisada
                        </Btn>
                      )}
                      <Btn variant="danger" onClick={() => eliminar(p)} tip={`Eliminar ${p.nombre}`}><Trash2 aria-hidden className="h-3.5 w-3.5" /> Eliminar</Btn>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(sucio || guardado) && (
        <div className="flex items-center justify-end gap-2">
          {guardado && !sucio && <span role="status" className="text-[13px] font-semibold text-state-ok">Plantillas guardadas</span>}
          {sucio && (
            <>
              <Btn variant="outline" onClick={() => setLista(plantillasDeClinica(guardadas))}>Descartar</Btn>
              <Btn onClick={guardar}>Guardar plantillas</Btn>
            </>
          )}
        </div>
      )}

      {editando && (
        <EditorPlantilla
          inicial={editando.plantilla}
          nueva={editando.nueva}
          onCancelar={() => setEditando(null)}
          onGuardar={(p) => {
            setLista((l) => (editando.nueva ? [...l, p] : l.map((x) => (x.id === p.id ? p : x))));
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditorPlantilla({ inicial, nueva, onCancelar, onGuardar }: {
  inicial: PlantillaDocumento;
  nueva: boolean;
  onCancelar: () => void;
  onGuardar: (p: PlantillaDocumento) => void;
}) {
  const [p, setP] = useState<PlantillaDocumento>(() => copia(inicial));
  const [error, setError] = useState<string | null>(null);
  const secciones = p.secciones ?? [];

  const setSecciones = (s: SeccionDocumento[]) => setP((x) => ({ ...x, secciones: s }));
  const editarSeccion = (i: number, patch: Partial<SeccionDocumento>) => setSecciones(secciones.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const idsDeCampos = () => secciones.flatMap((s) => s.campos.map((c) => c.id));

  const agregarSeccion = () =>
    setSecciones([...secciones, { id: idUnico("seccion", secciones.map((s) => s.id)), titulo: "Nueva sección", campos: [] }]);
  const agregarCampo = (i: number) => {
    const campo: CampoDocumento = { id: idUnico("campo", idsDeCampos()), etiqueta: "Nuevo campo", tipo: "texto" };
    editarSeccion(i, { campos: [...secciones[i].campos, campo] });
  };
  const editarCampo = (i: number, j: number, patch: Partial<CampoDocumento>) => {
    // Al pasar a lista o casillas sin opciones se siembran dos, para que el campo siga siendo válido.
    const pasaALista = (patch.tipo === "seleccion" || patch.tipo === "casillas") && !(secciones[i].campos[j].opciones ?? []).length;
    editarSeccion(i, {
      campos: secciones[i].campos.map((c, k) => (k === j ? { ...c, ...patch, ...(pasaALista ? { opciones: ["Opción 1", "Opción 2"] } : {}) } : c)),
    });
  };

  const guardar = () => {
    const [ok] = normalizarPlantillas([p]);
    if (!ok) {
      setError("La plantilla necesita un nombre y, si es un formulario, al menos una sección con un campo.");
      return;
    }
    onGuardar(ok);
  };

  return (
    <Modal title={nueva ? "Nueva plantilla de documento" : `Editar plantilla: ${inicial.nombre}`} onClose={onCancelar} xl>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la plantilla">
            <input className={inputCls} value={p.nombre} onChange={(e) => setP({ ...p, nombre: e.target.value })} placeholder="Ej.: Historia Clínica" />
          </Field>
          <Field label="Tipo" hint={nueva ? undefined : "El tipo no se cambia después de crearla."}>
            <select
              className={inputCls}
              value={p.tipo}
              disabled={!nueva}
              onChange={(e) => setP(e.target.value === "texto" ? { ...p, tipo: "texto", cuerpo: p.cuerpo ?? "" } : { ...p, tipo: "formulario", secciones: p.secciones ?? [] })}
            >
              <option value="formulario">Formulario (secciones y campos)</option>
              <option value="texto">Texto de indicaciones</option>
            </select>
          </Field>
        </div>

        {p.tipo === "texto" ? (
          <Field label="Texto" hint="Podés usar {paciente}, {documento}, {fecha}, {profesional} y {clinica}: se completan al crear el documento.">
            <textarea rows={14} className={inputCls} value={p.cuerpo ?? ""} onChange={(e) => setP({ ...p, cuerpo: e.target.value })} />
          </Field>
        ) : (
          <div className="space-y-4">
            {secciones.map((s, i) => (
              <section key={s.id} className="rounded border border-clinic-border bg-clinic-bg p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label={`Sección ${i + 1}`}>
                      <input className={inputCls} value={s.titulo} onChange={(e) => editarSeccion(i, { titulo: e.target.value })} />
                    </Field>
                  </div>
                  <Btn variant="outline" onClick={() => setSecciones(mover(secciones, i, -1))} disabled={i === 0} tip="Subir sección"><ArrowUp aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Subir sección {s.titulo}</span></Btn>
                  <Btn variant="outline" onClick={() => setSecciones(mover(secciones, i, 1))} disabled={i === secciones.length - 1} tip="Bajar sección"><ArrowDown aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Bajar sección {s.titulo}</span></Btn>
                  <Btn variant="danger" onClick={() => setSecciones(secciones.filter((_, k) => k !== i))} tip="Eliminar sección"><Trash2 aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Eliminar sección {s.titulo}</span></Btn>
                </div>

                <div className="mt-3 space-y-2">
                  {s.campos.map((c, j) => (
                    <div key={c.id} className="rounded border border-clinic-border bg-white p-2.5">
                      <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
                        <input aria-label={`Rótulo del campo ${j + 1} de ${s.titulo}`} className={inputCls} value={c.etiqueta} onChange={(e) => editarCampo(i, j, { etiqueta: e.target.value })} />
                        <select aria-label={`Tipo del campo ${c.etiqueta}`} className={inputCls} value={c.tipo} onChange={(e) => editarCampo(i, j, { tipo: e.target.value as TipoCampoDocumento })}>
                          {(Object.keys(TIPO_CAMPO) as TipoCampoDocumento[]).map((t) => <option key={t} value={t}>{TIPO_CAMPO[t]}</option>)}
                        </select>
                        <span className="flex items-center gap-1">
                          <label className="mr-1 flex cursor-pointer items-center gap-1 whitespace-nowrap text-[12px] text-clinic-text" title="Solo se pregunta si el paciente no es hombre (ej.: embarazo)">
                            <input type="checkbox" className="accent-azure-600" aria-label={`Solo mujeres: ${c.etiqueta}`} checked={c.soloMujeres === true} onChange={(e) => editarCampo(i, j, { soloMujeres: e.target.checked || undefined })} />
                            Solo mujeres
                          </label>
                          <Btn variant="ghost" onClick={() => editarSeccion(i, { campos: mover(s.campos, j, -1) })} disabled={j === 0} tip="Subir campo"><ArrowUp aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Subir campo {c.etiqueta}</span></Btn>
                          <Btn variant="ghost" onClick={() => editarSeccion(i, { campos: mover(s.campos, j, 1) })} disabled={j === s.campos.length - 1} tip="Bajar campo"><ArrowDown aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Bajar campo {c.etiqueta}</span></Btn>
                          <Btn variant="ghost" onClick={() => editarSeccion(i, { campos: s.campos.filter((_, k) => k !== j) })} tip="Eliminar campo"><Trash2 aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">Eliminar campo {c.etiqueta}</span></Btn>
                        </span>
                      </div>
                      {(c.tipo === "seleccion" || c.tipo === "casillas") && (
                        <label className="mt-2 block">
                          <span className="mb-1 block text-[12px] font-semibold text-clinic-muted">Opciones (una por línea)</span>
                          <textarea rows={3} className={inputCls} value={(c.opciones ?? []).join("\n")} onChange={(e) => editarCampo(i, j, { opciones: e.target.value.split("\n") })} />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2"><Btn variant="outline" onClick={() => agregarCampo(i)}><Plus aria-hidden className="h-3.5 w-3.5" /> Agregar campo</Btn></div>
              </section>
            ))}
            <Btn variant="outline" onClick={agregarSeccion}><Plus aria-hidden className="h-3.5 w-3.5" /> Agregar sección</Btn>
            <p className="text-[12px] text-clinic-muted">Los campos sin rótulo se descartan al guardar. Renombrar un campo no cambia lo que ya respondieron los pacientes.</p>
          </div>
        )}

        {error && <p role="alert" className="rounded bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onCancelar}>Cancelar</Btn>
          <Btn onClick={guardar}>{nueva ? "Crear plantilla" : "Guardar cambios"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
