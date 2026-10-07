"use client";
/** «Arancel de precios» (Administración): el catálogo de servicios y lo que cuesta cada uno.
 *  Cargar precios tiene que ser rápido: buscar, cambiar el precio en la misma fila (Enter guarda y pasa al siguiente),
 *  subir o bajar todo un porcentaje con vista previa —y deshacer—, y pegar las filas desde Excel. La lógica está en
 *  `lib/arancel.ts` (con sus tests); acá solo se muestra y se guarda con las acciones de siempre del store. */
import { useMemo, useRef, useState } from "react";
import { Download, Pencil, Percent, Plus, Search, Stethoscope, Trash2, Undo2, UploadCloud } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import { CURRENCIES } from "@/lib/currency";
import { CATEGORY_LABEL } from "@/lib/categorias";
import { downloadCsv } from "@/lib/csv";
import {
  aplicarCambios, analizarCargaDePrecios, categoriaDe, filasParaExportar, filtrarServicios, MAX_FILAS_DE_CARGA, normalizarCodigo,
  parsearPorcentaje, parsearPrecio, planAjuste, procedimientosDeLaCarga, totalDelArancel, type AnalisisDeCarga, type CambioDePrecio,
} from "@/lib/arancel";
import type { Procedure, ProcedureCategory } from "@/lib/types";
import { Badge, Btn, Card, Empty, Field, Modal, inputCls } from "@/components/ui";

type Abierto = null | { tipo: "servicio"; proc?: Procedure } | { tipo: "ajuste" } | { tipo: "carga" };
type Aviso = { tono: "ok" | "warn"; texto: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("es-PY", { maximumFractionDigits: 2 })} %`;

export function ArancelPrecios() {
  const { db, upsertProcedure, upsertProcedures, deleteProcedure, setOnboarding } = useStore();
  const procs = db.procedures;
  const moneda = CURRENCIES[db.clinics[0]?.config.currency ?? "PYG"] ?? CURRENCIES.PYG;

  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<ProcedureCategory | "todas">("todas");
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [ultimoAjuste, setUltimoAjuste] = useState<{ porcentaje: number; cambios: CambioDePrecio[] } | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // El precio que se está escribiendo en una fila. Va en un ref además del estado: un `blur` rezagado del campo anterior
  // (al pasar al siguiente con Enter) no tiene que cerrar el campo nuevo.
  const [editando, setEditando] = useState<{ cpt: string; texto: string } | null>(null);
  const edicion = useRef<{ cpt: string; texto: string } | null>(null);
  const cambiarEdicion = (v: { cpt: string; texto: string } | null) => { edicion.current = v; setEditando(v); };

  const visibles = useMemo(() => filtrarServicios(procs, busqueda, categoria), [procs, busqueda, categoria]);
  const filtrando = busqueda.trim() !== "" || categoria !== "todas";
  const categorias = useMemo(() => {
    const cuenta = new Map<ProcedureCategory, number>();
    for (const p of procs) cuenta.set(categoriaDe(p), (cuenta.get(categoriaDe(p)) ?? 0) + 1);
    return (Object.keys(CATEGORY_LABEL) as ProcedureCategory[]).filter((c) => cuenta.has(c)).map((clave) => ({ clave, n: cuenta.get(clave) ?? 0 }));
  }, [procs]);

  const empezarEdicion = (p: Procedure, limpiarAviso = true) => { if (limpiarAviso) setAviso(null); cambiarEdicion({ cpt: p.cpt, texto: String(p.price) }); };
  const terminarEdicion = (p: Procedure, guardar: boolean, siguiente?: Procedure) => {
    const actual = edicion.current;
    if (!actual || actual.cpt !== p.cpt) return;
    cambiarEdicion(null);
    if (guardar) {
      const valor = parsearPrecio(actual.texto);
      if (valor === null) {
        setAviso({ tono: "warn", texto: `No se cambió el precio de ${p.cpt}: «${actual.texto.trim()}» no es un monto.` });
      } else {
        const nuevo = Number(valor.toFixed(moneda.decimals));
        if (nuevo !== p.price) {
          upsertProcedure({ ...p, price: nuevo });
          setAviso({ tono: "ok", texto: `${p.cpt}: ${fmtGs(p.price)} → ${fmtGs(nuevo)}` });
        }
      }
    }
    // Al pasar al siguiente con Enter, el aviso del precio recién guardado se queda a la vista.
    if (siguiente) empezarEdicion(siguiente, false);
  };

  const aplicarAjuste = (cambios: CambioDePrecio[], porcentaje: number) => {
    upsertProcedures(aplicarCambios(procs, cambios, "despues"));
    setUltimoAjuste({ porcentaje, cambios });
    setAviso(null);
    setAbierto(null);
  };
  const deshacerAjuste = () => {
    if (!ultimoAjuste) return;
    // Solo se devuelven los precios que siguen como los dejó el ajuste: si alguien ya cambió uno a mano, no se le pisa.
    const vigentes = ultimoAjuste.cambios.filter((c) => procs.find((p) => p.cpt === c.cpt)?.price === c.despues);
    upsertProcedures(aplicarCambios(procs, vigentes, "antes"));
    const omitidos = ultimoAjuste.cambios.length - vigentes.length;
    setAviso({ tono: omitidos > 0 ? "warn" : "ok", texto: `Ajuste deshecho en ${plural(vigentes.length, "precio", "precios")}.${omitidos > 0 ? ` ${omitidos} no se ${omitidos === 1 ? "tocó porque ya lo habías cambiado" : "tocaron porque ya los habías cambiado"} después.` : ""}` });
    setUltimoAjuste(null);
  };
  const aplicarCarga = (aGuardar: Procedure[], analisis: AnalisisDeCarga) => {
    upsertProcedures(aGuardar);
    if (analisis.nuevos > 0) setOnboarding("servicesDefined", true);
    setUltimoAjuste(null);
    setAviso({ tono: "ok", texto: `Listo: ${plural(analisis.nuevos, "servicio nuevo", "servicios nuevos")} y ${plural(analisis.cambian, "precio actualizado", "precios actualizados")}.` });
    setAbierto(null);
  };
  const descargar = () => downloadCsv("arancel-de-precios.csv", filasParaExportar(procs));

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div id="arancel" className="flex scroll-mt-24 items-center gap-2">
          <Stethoscope aria-hidden className="h-4 w-4 text-azure-600" />
          <h2 className="font-bold text-clinic-text">Arancel de precios</h2>
          <Badge tone="muted">{procs.length} servicios</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="outline" onClick={() => setAbierto({ tipo: "carga" })}><UploadCloud aria-hidden className="h-4 w-4" /> Cargar desde Excel</Btn>
          <Btn variant="outline" onClick={() => setAbierto({ tipo: "ajuste" })} disabled={procs.length === 0}><Percent aria-hidden className="h-4 w-4" /> Ajustar precios</Btn>
          <Btn variant="outline" onClick={descargar} disabled={procs.length === 0}><Download aria-hidden className="h-4 w-4" /> Descargar</Btn>
          <Btn onClick={() => setAbierto({ tipo: "servicio" })}><Plus aria-hidden className="h-4 w-4" /> Agregar servicio</Btn>
        </div>
      </div>
      <p className="mb-3 text-xs text-clinic-muted">
        Hacé clic en un precio para cambiarlo ahí mismo: <b>Enter</b> guarda y pasa al siguiente. Para cambiar muchos juntos usá <b>Ajustar precios</b> (sube o baja un porcentaje, con vista previa)
        o <b>Cargar desde Excel</b> (pegás las filas de tu planilla).
      </p>

      {ultimoAjuste && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded border border-clinic-border bg-clinic-bg px-3 py-2 text-xs text-clinic-text">
          <span>Ajuste de <b>{fmtPct(ultimoAjuste.porcentaje)}</b> aplicado a {plural(ultimoAjuste.cambios.length, "precio", "precios")}.</span>
          <button type="button" onClick={deshacerAjuste} className="inline-flex items-center gap-1 font-bold text-azure-700 hover:underline"><Undo2 aria-hidden className="h-3.5 w-3.5" /> Deshacer</button>
        </div>
      )}
      {aviso && (
        <p role="status" className={`mb-3 rounded px-3 py-2 text-xs font-semibold ${aviso.tono === "ok" ? "bg-state-okbg text-state-ok" : "bg-state-warnbg text-state-warn"}`}>{aviso.texto}</p>
      )}

      {procs.length === 0 ? (
        <Empty title="Sin servicios" desc="Agregá el primero o cargá tu lista de precios desde Excel." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <span className="sr-only">Buscar servicio</span>
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-clinic-muted" />
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código, nombre o categoría…" className={`${inputCls} pl-8`} />
            </label>
            <select aria-label="Filtrar por categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as ProcedureCategory | "todas")} className={`${inputCls} !w-auto`}>
              <option value="todas">Todas las categorías ({procs.length})</option>
              {categorias.map((c) => <option key={c.clave} value={c.clave}>{CATEGORY_LABEL[c.clave]} ({c.n})</option>)}
            </select>
            {filtrando && <span className="text-xs text-clinic-muted">{visibles.length} de {procs.length}</span>}
          </div>

          {visibles.length === 0 ? (
            <Empty title="Ningún servicio coincide" desc="Probá con otra palabra o quitá el filtro de categoría." />
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold text-azure-700 sm:hidden">Deslizá la tabla para ver todos los aranceles →</p>
              <div className="scroll-hint-shown relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">
                      <th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Descripción</th><th className="py-2 text-right">Arancel</th><th className="py-2"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-clinic-border">
                    {visibles.map((p, i) => (
                      <tr key={p.cpt} className="hover:bg-clinic-bg/50">
                        <td className="py-2 pr-3 tabular-nums font-bold text-clinic-text">{p.cpt}</td>
                        <td className="py-2 pr-3">
                          {p.description}
                          <span className="block text-[11px] text-clinic-muted">{CATEGORY_LABEL[categoriaDe(p)]}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {editando?.cpt === p.cpt ? (
                            <input
                              autoFocus
                              inputMode="decimal"
                              aria-label={`Arancel de ${p.description}`}
                              value={editando.texto}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => cambiarEdicion({ cpt: p.cpt, texto: e.target.value })}
                              onBlur={() => terminarEdicion(p, true)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); terminarEdicion(p, true, visibles[i + 1]); }
                                else if (e.key === "Escape") { e.preventDefault(); terminarEdicion(p, false); }
                              }}
                              className={`${inputCls} !w-36 text-right`}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => empezarEdicion(p)}
                              aria-label={`Cambiar el arancel de ${p.description}`}
                              title="Clic para cambiar el precio"
                              className="rounded px-2 py-1 tabular-nums text-clinic-text hover:bg-azure-50 hover:text-azure-700"
                            >
                              {fmtGs(p.price)}
                            </button>
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            <button onClick={() => setAbierto({ tipo: "servicio", proc: p })} title="Editar servicio" aria-label={`Editar servicio ${p.cpt}`} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-azure-50 hover:text-azure-700"><Pencil aria-hidden className="h-3.5 w-3.5" /></button>
                            <button onClick={() => { if (confirm(`¿Eliminar el servicio ${p.cpt} — ${p.description}?`)) deleteProcedure(p.cpt); }} title="Eliminar servicio" aria-label={`Eliminar servicio ${p.cpt}`} className="grid h-7 w-7 place-items-center rounded-lg text-clinic-muted hover:bg-state-errbg hover:text-state-err"><Trash2 aria-hidden className="h-3.5 w-3.5" /></button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {abierto?.tipo === "servicio" && (
        <FormularioServicio
          proc={abierto.proc}
          procs={procs}
          simbolo={moneda.symbol}
          decimales={moneda.decimals}
          onClose={() => setAbierto(null)}
          onSave={(p) => { upsertProcedure(p); if (!abierto.proc) setOnboarding("servicesDefined", true); setAbierto(null); }}
        />
      )}
      {abierto?.tipo === "ajuste" && (
        <AjusteModal procs={procs} visibles={visibles} filtrando={filtrando} decimales={moneda.decimals} onClose={() => setAbierto(null)} onAplicar={aplicarAjuste} />
      )}
      {abierto?.tipo === "carga" && (
        <CargaModal procs={procs} decimales={moneda.decimals} onClose={() => setAbierto(null)} onDescargar={descargar} onAplicar={aplicarCarga} />
      )}
    </Card>
  );
}

/* ───────────── Agregar / editar un servicio ───────────── */

function FormularioServicio({ proc, procs, simbolo, decimales, onClose, onSave }: {
  proc?: Procedure; procs: Procedure[]; simbolo: string; decimales: number; onClose: () => void; onSave: (p: Procedure) => void;
}) {
  const editar = !!proc;
  const [cpt, setCpt] = useState(proc?.cpt ?? "");
  const [descripcion, setDescripcion] = useState(proc?.description ?? "");
  const [categoria, setCategoria] = useState<ProcedureCategory | "">(proc?.category ?? "");
  const [precio, setPrecio] = useState(proc ? String(proc.price) : "");
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const codigo = proc ? proc.cpt : normalizarCodigo(cpt);
    if (!codigo) return setError("El código solo puede tener letras, números, punto y guion (hasta 20 caracteres). Ej.: D2330.");
    if (!proc && procs.some((p) => p.cpt === codigo)) return setError(`Ya existe un servicio con el código ${codigo}. Buscalo en la lista y cambiale el precio ahí.`);
    if (!descripcion.trim()) return setError("Escribí la descripción del servicio.");
    const valor = parsearPrecio(precio);
    if (valor === null) return setError("El arancel tiene que ser un monto, por ejemplo 150000 o 150.000.");
    onSave({ ...(proc ?? { defaultDx: [] }), cpt: codigo, description: descripcion.trim(), price: Number(valor.toFixed(decimales)), category: categoria || undefined });
  };

  return (
    <Modal title={editar ? "Editar servicio" : "Agregar servicio"} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <Field label="Código (CPT/CDT)" hint={editar ? "El código no se puede cambiar." : "Se guarda en mayúsculas. Ej.: D2330."}>
          <input required disabled={editar} className={inputCls} value={cpt} onChange={(e) => { setCpt(e.target.value); setError(null); }} placeholder="D2330" maxLength={20} />
        </Field>
        <Field label="Descripción"><input required className={inputCls} value={descripcion} onChange={(e) => { setDescripcion(e.target.value); setError(null); }} maxLength={200} /></Field>
        <Field label="Categoría" hint="Para agrupar en los reportes. Automática: se deduce del código (D2… = Operatoria).">
          <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value as ProcedureCategory | "")}>
            <option value="">Automática</option>
            {(Object.keys(CATEGORY_LABEL) as ProcedureCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label={`Arancel (${simbolo})`} hint="Podés escribir 1500000 o 1.500.000.">
          <input required inputMode="decimal" className={inputCls} value={precio} onChange={(e) => { setPrecio(e.target.value); setError(null); }} />
        </Field>
        {error && <p role="alert" className="text-xs font-semibold text-state-err">{error}</p>}
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">{editar ? "Guardar" : "Crear servicio"}</Btn></div>
      </form>
    </Modal>
  );
}

/* ───────────── Ajustar precios en bloque ───────────── */

function AjusteModal({ procs, visibles, filtrando, decimales, onClose, onAplicar }: {
  procs: Procedure[]; visibles: Procedure[]; filtrando: boolean; decimales: number; onClose: () => void; onAplicar: (cambios: CambioDePrecio[], porcentaje: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const [redondeo, setRedondeo] = useState(0);
  const [alcance, setAlcance] = useState<"todos" | "vistos">(filtrando ? "vistos" : "todos");
  const base = alcance === "vistos" && filtrando ? visibles : procs;
  const porcentaje = parsearPorcentaje(texto);
  const plan = useMemo(() => (porcentaje === null ? [] : planAjuste(base, porcentaje, redondeo, decimales)), [porcentaje, base, redondeo, decimales]);
  const antes = totalDelArancel(base);
  const despues = Math.round((antes + plan.reduce((s, c) => s + c.despues - c.antes, 0)) * 100) / 100;
  const descripciones = useMemo(() => new Map(procs.map((p) => [p.cpt, p.description])), [procs]);
  const opciones: [number, string][] = decimales === 0
    ? [[0, "Sin redondear"], [1000, "A los mil (1.000)"], [10000, "A los diez mil (10.000)"], [50000, "A los cincuenta mil (50.000)"]]
    : [[0, "Sin redondear"], [1, "Al entero"], [5, "De a 5"], [10, "De a 10"]];

  return (
    <Modal title="Ajustar precios" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-clinic-muted">Sube o baja los precios un porcentaje. Primero ves cómo quedaría cada uno; recién al confirmar se guarda, y después podés deshacerlo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Porcentaje" hint="Positivo sube, negativo baja. Ej.: 10 sube un 10 %; -5 baja un 5 %.">
            <input autoFocus inputMode="decimal" className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="10" aria-invalid={texto.trim() !== "" && porcentaje === null} />
          </Field>
          <Field label="Redondear a">
            <select className={inputCls} value={redondeo} onChange={(e) => setRedondeo(Number(e.target.value))}>
              {opciones.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </Field>
        </div>
        {texto.trim() !== "" && porcentaje === null && <p role="alert" className="text-xs font-semibold text-state-err">Escribí un número entre -90 y 500. Ej.: 10 o -5.</p>}
        {filtrando && (
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 text-[13px] font-semibold text-clinic-text">Aplicar a</legend>
            <label className="flex items-center gap-2"><input type="radio" name="alcance" checked={alcance === "vistos"} onChange={() => setAlcance("vistos")} /> Solo los {visibles.length} que estoy viendo</label>
            <label className="flex items-center gap-2"><input type="radio" name="alcance" checked={alcance === "todos"} onChange={() => setAlcance("todos")} /> Todos los {procs.length} servicios</label>
          </fieldset>
        )}

        {porcentaje !== null && (
          plan.length === 0 ? (
            <p className="rounded bg-clinic-bg px-3 py-2 text-sm text-clinic-muted">Con ese porcentaje ningún precio cambia.</p>
          ) : (
            <div>
              <p className="mb-2 text-sm text-clinic-text">
                Cambia{plan.length === 1 ? "" : "n"} <b>{plan.length}</b> de {base.length} precios. El arancel pasa de <b>{fmtGs(antes)}</b> a <b>{fmtGs(despues)}</b> (suma de todos los precios).
              </p>
              <div className="max-h-56 overflow-y-auto rounded border border-clinic-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-clinic-bg text-left text-xs font-bold text-clinic-text">
                    <tr><th className="px-3 py-1.5">Servicio</th><th className="px-3 py-1.5 text-right">Antes</th><th className="px-3 py-1.5 text-right">Después</th></tr>
                  </thead>
                  <tbody className="divide-y divide-clinic-border">
                    {plan.slice(0, 12).map((c) => (
                      <tr key={c.cpt}>
                        <td className="px-3 py-1.5"><b className="tabular-nums">{c.cpt}</b> <span className="text-clinic-muted">{descripciones.get(c.cpt)}</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-clinic-muted">{fmtGs(c.antes)}</td>
                        <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmtGs(c.despues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.length > 12 && <p className="mt-1 text-xs text-clinic-muted">…y {plan.length - 12} más con el mismo ajuste.</p>}
            </div>
          )
        )}

        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={plan.length === 0 || porcentaje === null} onClick={() => porcentaje !== null && onAplicar(plan, porcentaje)}>
            {plan.length > 0 ? `Aplicar a ${plural(plan.length, "precio", "precios")}` : "Aplicar"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Cargar precios desde una planilla ───────────── */

async function leerArchivo(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); } // el CSV «ANSI» que guarda Excel en español
}

function CargaModal({ procs, decimales, onClose, onDescargar, onAplicar }: {
  procs: Procedure[]; decimales: number; onClose: () => void; onDescargar: () => void; onAplicar: (aGuardar: Procedure[], analisis: AnalisisDeCarga) => void;
}) {
  const [texto, setTexto] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const analisis = useMemo(() => analizarCargaDePrecios(texto, procs, decimales), [texto, procs, decimales]);
  const aGuardar = analisis.nuevos + analisis.cambian;
  const MOSTRAR = 60;

  const cargarArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    if (archivo.size > 1_000_000) { setErrorArchivo("El archivo es muy grande: el máximo son unas 500 filas."); return; }
    setErrorArchivo(null);
    setTexto(await leerArchivo(archivo));
  };

  return (
    <Modal title="Cargar precios desde Excel" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="text-sm text-clinic-muted">
          <p>Copiá las filas de tu planilla (Excel o Google Sheets) y pegalas acá, o elegí un archivo CSV. Las columnas son <b>código</b>, <b>descripción</b>, <b>categoría</b> (opcional) y <b>precio</b>.
            Con solo <b>código y precio</b> se actualizan los servicios que ya existen. Máximo {MAX_FILAS_DE_CARGA} filas por carga.</p>
          <button type="button" onClick={onDescargar} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-azure-700 hover:underline"><Download aria-hidden className="h-3 w-3" /> Descargar el arancel actual como modelo</button>
        </div>
        <Field label="Filas de la planilla">
          <textarea
            className={`${inputCls} min-h-[8rem] font-mono text-xs`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            spellCheck={false}
            placeholder={"D2330\tResina compuesta — 1 superficie\t450.000\nD2740\tCorona de porcelana\t2.900.000"}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded border border-clinic-border px-3 py-1.5 font-bold text-clinic-text hover:border-azure-300 hover:text-azure-700">
            <UploadCloud aria-hidden className="h-3.5 w-3.5" /> Elegir archivo CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values" className="sr-only" onChange={(e) => { void cargarArchivo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {errorArchivo && <span role="alert" className="font-semibold text-state-err">{errorArchivo}</span>}
        </div>

        {analisis.filas.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="ok">{plural(analisis.nuevos, "nuevo", "nuevos")}</Badge>
              <Badge tone="warn">{plural(analisis.cambian, "cambia", "cambian")}</Badge>
              <Badge tone="muted">{analisis.iguales} sin cambios</Badge>
              {analisis.errores > 0 && <Badge tone="err">{plural(analisis.errores, "con error", "con errores")}</Badge>}
            </div>
            {analisis.truncado && <p className="mb-2 text-xs font-semibold text-state-warn">Se leyeron solo las primeras {MAX_FILAS_DE_CARGA} filas. Cargá el resto en otra tanda.</p>}
            <div className="max-h-64 overflow-auto rounded border border-clinic-border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="sticky top-0 bg-clinic-bg text-left text-xs font-bold text-clinic-text">
                  <tr><th className="px-3 py-1.5">Línea</th><th className="px-3 py-1.5">Servicio</th><th className="px-3 py-1.5 text-right">Precio</th><th className="px-3 py-1.5">Qué pasa</th></tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {analisis.filas.slice(0, MOSTRAR).map((f) => (
                    <tr key={f.linea}>
                      <td className="px-3 py-1.5 tabular-nums text-clinic-muted">{f.linea}</td>
                      {f.estado === "error" ? (
                        <>
                          <td className="max-w-[16rem] truncate px-3 py-1.5 text-clinic-muted" title={f.texto}>{f.texto}</td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5"><Badge tone="err">Error</Badge> <span className="text-xs text-state-err">{f.motivo}</span></td>
                        </>
                      ) : f.estado === "igual" ? (
                        <>
                          <td className="px-3 py-1.5"><b className="tabular-nums">{f.cpt}</b></td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5"><Badge tone="muted">Sin cambios</Badge></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5"><b className="tabular-nums">{f.cpt}</b> <span className="text-clinic-muted">{f.description}</span></td>
                          <td className="px-3 py-1.5 text-right font-bold tabular-nums">{fmtGs(f.price)}</td>
                          <td className="px-3 py-1.5">
                            {f.estado === "nuevo" ? <Badge tone="ok">Nuevo</Badge> : (
                              <>
                                <Badge tone="warn">Cambia</Badge>{" "}
                                <span className="text-xs text-clinic-muted">
                                  {f.antes.price !== f.price && <>antes {fmtGs(f.antes.price)}</>}
                                  {f.antes.description !== f.description && <> · nuevo nombre</>}
                                  {f.antes.category !== f.category && <> · otra categoría</>}
                                </span>
                              </>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analisis.filas.length > MOSTRAR && <p className="mt-1 text-xs text-clinic-muted">…y {analisis.filas.length - MOSTRAR} filas más (se aplican igual).</p>}
            {analisis.errores > 0 && <p className="mt-2 text-xs text-clinic-muted">Las filas con error se saltan; el resto se aplica.</p>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn disabled={aGuardar === 0} onClick={() => onAplicar(procedimientosDeLaCarga(analisis, procs), analisis)}>
            {aGuardar > 0 ? `Aplicar ${plural(aGuardar, "cambio", "cambios")}` : "Aplicar"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
