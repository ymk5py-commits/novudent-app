"use client";
import Link from "next/link";
/** Alta de paciente en página completa (revisión de Novum, 27/9/2026: «que el registro
 *  no sea un pop up sea tamaño layout formulario a cargar y poder subir foto del
 *  paciente»). Los campos y cuáles son obligatorios salen de Pacientes → Configuración
 *  (contexto «Nuevo paciente»); si el paciente es menor de edad se pide el responsable.
 *  El formulario es `noValidate`: lo que falta o está mal cargado y una CI que ya tiene otro
 *  paciente se avisan con `useRevisionAlta`, no con el globito del navegador. */
import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { camposDe, datosPaciente, nuevoPaciente, siguienteCodigo, type ValoresCampos } from "@/lib/camposPaciente";
import { useRevisionAlta } from "@/lib/useRevisionAlta";
import { resizeToDataUrl } from "@/lib/image";
import { AvisoCiRepetida } from "@/components/AvisoCiRepetida";
import { CamposPacienteForm } from "@/components/CamposPacienteForm";
import { Btn, Card } from "@/components/ui";

export default function NuevoPacientePage() {
  const { db, session, crearPaciente } = useStore();
  const alcance = useAlcance();
  const router = useRouter();
  const campos = camposDe(db.clinics[0]?.config.patientFields, "nuevo");
  const [valores, setValores] = useState<ValoresCampos>({});
  const [foto, setFoto] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const alta = useRevisionAlta(campos, valores, db.patients);

  if (!session) return null;
  if (!alcance.puede("patients.personal")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-[16px] font-bold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">Los pacientes nuevos los carga la <b>recepción</b> o el <b>Administrador</b>.</p>
      </Card>
    );
  }

  const elegirFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { setFoto(await resizeToDataUrl(f, { maxDim: 512, quality: 0.85 })); setError(null); }
    catch { setError("No se pudo leer esa imagen. Probá con una foto JPG o PNG."); }
  };

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alta.validar()) return;
    const p = nuevoPaciente({ ...datosPaciente(campos, valores), ...(foto ? { photo: foto } : {}) }, session.clinicId, Date.now(), siguienteCodigo(db.patients));
    crearPaciente(p, { id: session.userId, name: session.name });
    router.push(`/app/pacientes/${p.id}`);
  };

  return (
    <form className="space-y-5" noValidate onSubmit={guardar}>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/app/pacientes" className="inline-flex items-center gap-1 text-sm font-bold text-azure-700 hover:underline"><ChevronLeft className="h-4 w-4" /> Pacientes</Link>
        <h1 className="text-[16px] font-bold text-clinic-text">Nuevo paciente</h1>
        <span className="ml-auto text-xs text-clinic-muted">Código interno: <b className="tabular-nums text-clinic-text">{siguienteCodigo(db.patients)}</b> (se asigna al guardar)</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit space-y-3 p-5 text-center">
          <div className="mx-auto grid h-32 w-32 place-items-center overflow-hidden rounded-full bg-azure-50 ring-1 ring-clinic-border">
            {foto ? <img src={foto} alt="Foto del paciente" className="h-full w-full object-cover" /> : <UserRound className="h-14 w-14 text-azure-300" />}
          </div>
          <input ref={archivo} id="foto-paciente" type="file" accept="image/*" className="hidden" onChange={elegirFoto} />
          <Btn variant="outline" type="button" onClick={() => archivo.current?.click()}><Camera className="h-4 w-4" /> {foto ? "Cambiar foto" : "Subir foto"}</Btn>
          {foto && <button type="button" onClick={() => setFoto(undefined)} className="mx-auto flex items-center gap-1 text-xs font-bold text-clinic-muted hover:text-state-err"><Trash2 className="h-3.5 w-3.5" /> Quitar foto</button>}
          <p className="text-[11px] text-clinic-muted">Opcional. Se achica a 512 px antes de guardarla.</p>
        </Card>

        <Card className="space-y-4 p-5">
          <CamposPacienteForm
            campos={campos} valores={valores} onChange={setValores} convenios={(db.clinics[0]?.config.convenios ?? []).map((c) => c.name)}
            problemas={alta.problemas}
            avisos={{ documento: <AvisoCiRepetida repetidos={alta.repetidos} otraPersona={alta.otraPersona} onOtraPersona={alta.setOtraPersona} /> }}
          />
          <p className="rounded-xl bg-azure-50 p-3 text-xs text-azure-700">Se asigna automáticamente la <b>Historia Clínica</b> como documento clínico pendiente.</p>
          {(alta.mensaje ?? error) && <p role="alert" className="rounded-xl bg-state-errbg px-3 py-2 text-xs font-semibold text-state-err">{alta.mensaje ?? error}</p>}
          <div className="flex justify-end gap-2">
            <Btn variant="outline" type="button" onClick={() => router.push("/app/pacientes")}>Cancelar</Btn>
            <Btn type="submit">Crear paciente</Btn>
          </div>
        </Card>
      </div>
    </form>
  );
}
