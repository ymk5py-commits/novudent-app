"use client";
/** Ficha clínica › Documentos ▾ › Documentos clínicos (paridad Dentalink): la Historia Clínica y
 *  demás documentos del paciente. Junta en una lista los documentos nuevos (`clinicalDocs`) y los
 *  formularios que el paciente ya tenía (`Patient.forms`), crea documentos desde las plantillas
 *  de la clínica y abre el editor y el visor. Un documento clínico no se borra: se anula. */
import { useMemo, useState } from "react";
import { Eye, FileText, Lock, Pencil, Plus } from "lucide-react";
import { useStore, fmtDate, fullName } from "@/lib/store";
import {
  anularDocumento, completarDocumento, documentosDelPaciente, guardarCambios, nuevoDocumento,
  plantillasActivas, plantillasDeClinica, puedeEditarDocumentos, type ItemDocumento,
} from "@/lib/documentosClinicos";
import type { DocumentoClinico, EstadoDocumento, Patient, PatientForm, PlantillaDocumento, User } from "@/lib/types";
import { Badge, Btn, Card, Empty, Field, Modal, inputCls } from "@/components/ui";
import { EditorDocumento } from "@/components/EditorDocumento";
import { VisorDocumentoClinico } from "@/components/DocumentoClinicoPrint";

const ETIQUETA: Record<EstadoDocumento, string> = { pendiente: "Pendiente", completado: "Completado", anulado: "Anulado" };
const TONO: Record<EstadoDocumento, "warn" | "ok" | "muted"> = { pendiente: "warn", completado: "ok", anulado: "muted" };

export function DocumentosClinicos({ patient, onCompletarFormulario }: {
  patient: Patient;
  /** Los formularios anteriores (Patient.forms) se completan con el modal de siempre. */
  onCompletarFormulario: (f: PatientForm) => void;
}) {
  const { db, session, addClinicalDoc, updateClinicalDoc } = useStore();
  const [mostrarAnulados, setMostrarAnulados] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [viendoId, setViendoId] = useState<string | null>(null);

  const clinic = db.clinics[0];
  const items = useMemo(
    () => documentosDelPaciente(patient, db.clinicalDocs, mostrarAnulados),
    [patient, db.clinicalDocs, mostrarAnulados],
  );
  const plantillas = useMemo(() => plantillasActivas(plantillasDeClinica(clinic?.config)), [clinic?.config]);

  if (!session || !clinic) return null;
  const puedeEditar = puedeEditarDocumentos(session.role);
  const dentistas = db.users.filter((u) => u.role === "dentist" && u.active !== false);
  const nombreDe = (id?: string) => db.users.find((u) => u.id === id)?.name;
  const editando = editandoId ? db.clinicalDocs.find((d) => d.id === editandoId) : undefined;
  const viendo = viendoId ? db.clinicalDocs.find((d) => d.id === viendoId) : undefined;
  const ahora = () => new Date().toISOString();
  const yo = { id: session.userId, name: session.name };

  const crear = (plantilla: PlantillaDocumento, dentistId: string) => {
    const hoy = new Date();
    const d = nuevoDocumento({
      id: crypto.randomUUID(), clinicId: clinic.id, patientId: patient.id, plantilla,
      dentistId: dentistId || undefined, by: yo, now: hoy.toISOString(),
      datos: {
        paciente: fullName(patient),
        documento: patient.document,
        fecha: hoy.toLocaleDateString("es-PY", { day: "numeric", month: "long", year: "numeric" }),
        profesional: nombreDe(dentistId) ?? "",
        clinica: clinic.name,
      },
    });
    addClinicalDoc(d);
    setNuevoOpen(false);
    setEditandoId(d.id);
  };

  const anular = (d: DocumentoClinico) => {
    if (!window.confirm("¿Anular este documento? Queda en la ficha como anulado.")) return;
    updateClinicalDoc(anularDocumento(d, { now: ahora(), by: session.name }));
  };

  if (editando) {
    return (
      <EditorDocumento
        key={editando.id}
        doc={editando}
        paciente={patient}
        puedeEditar={puedeEditar && editando.estado !== "anulado"}
        onGuardar={(c) => updateClinicalDoc(guardarCambios(editando, { ...c, now: ahora() }))}
        onContinuar={(c) => {
          const hecho = completarDocumento(editando, { ...c, now: ahora(), by: yo });
          updateClinicalDoc(hecho);
          setEditandoId(null);
          setViendoId(hecho.id);
        }}
        onVolver={() => setEditandoId(null)}
      />
    );
  }

  const detalle = (i: ItemDocumento): string => {
    if (i.origen === "formulario") return i.estado === "pendiente" ? "Formulario anterior · pendiente de completar" : `Formulario anterior · completado el ${fmtDate(i.fecha)}`;
    const d = i.doc!;
    return [
      `Creado ${fmtDate(d.createdAt)}`,
      d.completedAt ? `completado ${fmtDate(d.completedAt)}` : "",
      nombreDe(d.dentistId) ?? "",
      d.voidedAt ? `anulado ${fmtDate(d.voidedAt)}${d.voidedBy ? ` por ${d.voidedBy}` : ""}` : "",
    ].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[18px] font-normal text-clinic-text">Documentos clínicos</h2>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[13px] text-clinic-text">
          <input type="checkbox" className="accent-azure-600" checked={mostrarAnulados} onChange={(e) => setMostrarAnulados(e.target.checked)} />
          Mostrar anulados
        </label>
        {puedeEditar && <Btn onClick={() => setNuevoOpen(true)}><Plus aria-hidden className="h-4 w-4" /> Nuevo documento clínico</Btn>}
      </div>

      {!puedeEditar && (
        <p className="flex items-center gap-1.5 rounded bg-clinic-bg p-3 text-sm text-clinic-muted">
          <Lock aria-hidden className="h-3.5 w-3.5" /> Tu rol puede ver los documentos clínicos, pero no crearlos ni editarlos.
        </p>
      )}

      {items.length === 0 ? (
        <Empty title="Sin documentos clínicos" desc="Los documentos que se hagan con este paciente van a aparecer acá." />
      ) : (
        <Card className="divide-y divide-clinic-border">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded ${i.estado === "pendiente" ? "bg-state-warnbg text-state-warn" : i.estado === "anulado" ? "bg-clinic-bg text-clinic-muted" : "bg-state-okbg text-state-ok"}`}>
                <FileText aria-hidden className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-clinic-text">{i.nombre}</span>
                  {i.doc?.porRevisar && <Badge tone="warn">Por revisar</Badge>}
                  <Badge tone={TONO[i.estado]}>{ETIQUETA[i.estado]}</Badge>
                </span>
                <span className="block text-xs text-clinic-muted">{detalle(i)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {i.origen === "formulario" && i.estado === "pendiente" && puedeEditar && (
                  <Btn onClick={() => onCompletarFormulario(i.form!)}>Completar</Btn>
                )}
                {i.origen === "clinico" && i.estado === "pendiente" && puedeEditar && (
                  <>
                    <Btn onClick={() => setEditandoId(i.id)}>Completar</Btn>
                    <Btn variant="danger" onClick={() => anular(i.doc!)}>Anular</Btn>
                  </>
                )}
                {i.origen === "clinico" && i.estado === "completado" && (
                  <>
                    <Btn variant="outline" onClick={() => setViendoId(i.id)}><Eye aria-hidden className="h-4 w-4" /> Ver / imprimir</Btn>
                    {puedeEditar && <Btn variant="outline" onClick={() => setEditandoId(i.id)}><Pencil aria-hidden className="h-4 w-4" /> Editar</Btn>}
                    {puedeEditar && <Btn variant="danger" onClick={() => anular(i.doc!)}>Anular</Btn>}
                  </>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}

      {nuevoOpen && (
        <NuevoDocumentoModal
          plantillas={plantillas}
          dentistas={dentistas}
          dentistaInicial={session.role === "dentist" ? session.userId : ""}
          onClose={() => setNuevoOpen(false)}
          onCrear={crear}
        />
      )}

      {viendo && (
        <VisorDocumentoClinico
          doc={viendo}
          clinic={clinic}
          paciente={patient}
          profesional={nombreDe(viendo.dentistId)}
          onClose={() => setViendoId(null)}
        />
      )}
    </div>
  );
}

function NuevoDocumentoModal({ plantillas, dentistas, dentistaInicial, onClose, onCrear }: {
  plantillas: PlantillaDocumento[];
  dentistas: User[];
  dentistaInicial: string;
  onClose: () => void;
  onCrear: (p: PlantillaDocumento, dentistId: string) => void;
}) {
  const [plantillaId, setPlantillaId] = useState("");
  const [dentistId, setDentistId] = useState(dentistaInicial);
  const plantilla = plantillas.find((p) => p.id === plantillaId);
  return (
    <Modal title="Nuevo documento clínico" onClose={onClose}>
      {plantillas.length === 0 ? (
        <div className="space-y-4">
          <p className="rounded bg-state-warnbg px-3 py-2 text-sm text-state-warn">
            No hay plantillas activas. Un administrador puede cargarlas o activarlas en Configuración › Documentos clínicos.
          </p>
          <div className="flex justify-end"><Btn variant="outline" onClick={onClose}>Cerrar</Btn></div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (plantilla) onCrear(plantilla, dentistId); }}>
          <Field label="Seleccioná el tipo de documento clínico que querés crear">
            <select required className={inputCls} value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
              <option value="">Seleccionar</option>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.porRevisar ? " (por revisar)" : ""}</option>)}
            </select>
          </Field>
          {plantilla?.porRevisar && (
            <p role="note" className="rounded border border-state-warn/40 bg-state-warnbg px-3 py-2 text-xs text-state-warn">
              Este texto es un borrador de Novudent: todavía no lo revisó un odontólogo. La hoja impresa va a llevar la leyenda de borrador.
            </p>
          )}
          <Field label="Profesional a cargo">
            <select className={inputCls} value={dentistId} onChange={(e) => setDentistId(e.target.value)}>
              <option value="">Sin profesional</option>
              {dentistas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
            <Btn type="submit" disabled={!plantilla}>Crear documento</Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}
