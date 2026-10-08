"use client";
/** Sub-tab "Datos personales" de la ficha: form completo estilo Dentalink
 *  (Datos requeridos + Datos opcionales).
 *
 *  «Datos requeridos» es lo que la clínica configuró como obligatorio para un paciente nuevo
 *  (Pacientes › Configuración de campos, contexto «Nuevo paciente»; de fábrica: nombre, apellidos, CI,
 *  fecha de nacimiento, sexo, género, teléfono y email, y el responsable si es menor), no una lista fija:
 *  lo demás va en «Datos opcionales».
 *
 *  «Guardar datos» no deja VACIAR un dato obligatorio, pero no obliga a inventar uno que el paciente nunca
 *  tuvo (importado, o cargado cuando el campo no era obligatorio): ese solo se avisa. Si no, corregir un
 *  teléfono de un paciente viejo exigiría un email que nadie tiene a mano. */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { camposDe, faltantes, pacientesConCI, requeridos, vaciados, valoresDe } from "@/lib/camposPaciente";
import type { Patient } from "@/lib/types";
import { Card, Btn, Field, inputCls } from "@/components/ui";

export function DatosTab({ patient }: { patient: Patient }) {
  const { db, session, upsertPatient } = useStore();
  const canEdit = session ? can(session.role, "patients.personal") : false; // roles v3: recepción, caja y admin

  const orig = {
    tipo: patient.tipo ?? "", firstName: patient.firstName, lastName: patient.lastName,
    document: patient.document, foreigner: patient.foreigner ?? false, email: patient.email ?? "",
    phone: patient.phone, birthDate: patient.birthDate ?? "", socialName: patient.socialName ?? "",
    insurer: patient.insurer ?? "", internalNumber: patient.internalNumber ?? "", sex: patient.sex ?? "",
    gender: patient.gender ?? "", city: patient.city ?? "", municipio: patient.municipio ?? "",
    address: patient.address ?? "", activity: patient.activity ?? "", employer: patient.employer ?? "",
    landline: patient.landline ?? "", guardian: patient.guardian ?? "", referencia: patient.referencia ?? "",
    observaciones: patient.observaciones ?? "", legalRepDoc: patient.legalRepDoc ?? "",
    parentesco: patient.parentesco ?? "", barrio: patient.barrio ?? "", ruc: patient.ruc ?? "",
    razonSocial: patient.razonSocial ?? "", codigoReferido: patient.codigoReferido ?? "",
    emergencyContact: patient.emergencyContact ?? "", emergencyPhone: patient.emergencyPhone ?? "",
  };
  const [f, setF] = useState(orig);
  const [intento, setIntento] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== JSON.stringify(orig);

  // Lo que la clínica exige (la misma cuenta que el alta) y lo que esta edición dejaría vacío.
  const campos = camposDe(db.clinics[0]?.config.patientFields, "nuevo");
  const valores = valoresDe(f);
  const exigidos = new Set<string>(requeridos(campos, valores).map((c) => c.prop));
  const faltan = faltantes(campos, valores);
  const aVaciar = vaciados(campos, valoresDe(orig), valores);
  // Otro paciente con la misma CI: solo se avisa (acá se está corrigiendo una ficha que ya existe, no creando una).
  const repetidos = pacientesConCI(db.patients, f.document, patient.id);

  const T = (label: string, k: keyof typeof f, type = "text") => (
    <Field label={label}>
      <input type={type} className={inputCls} value={f[k] as string} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </Field>
  );

  const save = () => {
    if (aVaciar.length > 0) { setIntento(true); return; }
    setIntento(false);
    upsertPatient({
      ...patient,
      tipo: f.tipo.trim() || undefined,
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), document: f.document.trim(),
      foreigner: f.foreigner || undefined,
      email: f.email.trim() || undefined, phone: f.phone.trim(), birthDate: f.birthDate || undefined,
      socialName: f.socialName.trim() || undefined, insurer: f.insurer.trim() || undefined,
      internalNumber: f.internalNumber.trim() || undefined,
      sex: (f.sex || undefined) as Patient["sex"], gender: (f.gender || undefined) as Patient["gender"],
      city: f.city.trim() || undefined, municipio: f.municipio.trim() || undefined,
      address: f.address.trim() || undefined, activity: f.activity.trim() || undefined,
      employer: f.employer.trim() || undefined, landline: f.landline.trim() || undefined,
      guardian: f.guardian.trim() || undefined, referencia: f.referencia.trim() || undefined,
      observaciones: f.observaciones.trim() || undefined, legalRepDoc: f.legalRepDoc.trim() || undefined,
      parentesco: f.parentesco.trim() || undefined, barrio: f.barrio.trim() || undefined, ruc: f.ruc.trim() || undefined,
      razonSocial: f.razonSocial.trim() || undefined, codigoReferido: f.codigoReferido.trim() || undefined,
      emergencyContact: f.emergencyContact.trim() || undefined, emergencyPhone: f.emergencyPhone.trim() || undefined,
    });
  };

  /** Todos los datos, en el orden del formulario de alta; cada uno va a «requeridos» u «opcionales» según la configuración. */
  const datos: { prop: string; nodo: ReactNode; ancho?: boolean }[] = [
    { prop: "firstName", nodo: T("Nombre legal", "firstName") },
    { prop: "lastName", nodo: T("Apellidos", "lastName") },
    {
      prop: "document",
      nodo: (
        <div>
          <Field label="Cédula identidad / DNI">
            <div className="flex items-center gap-2">
              <input className={inputCls} value={f.document} disabled={!canEdit} onChange={(e) => set({ document: e.target.value })} />
              <label className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-clinic-muted">
                <input type="checkbox" checked={f.foreigner} disabled={!canEdit} onChange={(e) => set({ foreigner: e.target.checked })} /> Extranjero
              </label>
            </div>
          </Field>
          {repetidos.length > 0 && (
            <p role="status" className="mt-1 text-xs font-semibold text-state-warn">
              Otro paciente tiene esta misma CI:{" "}
              {repetidos.map((p, i) => (
                <span key={p.id}>{i > 0 && ", "}<Link href={`/app/pacientes/${p.id}`} className="underline">{fullName(p)}</Link></span>
              ))}
              . Si es el mismo, usá «Fusión de fichas».
            </p>
          )}
        </div>
      ),
    },
    { prop: "birthDate", nodo: T("Fecha de nacimiento", "birthDate", "date") },
    {
      prop: "sex",
      nodo: (
        <Field label="Sexo">
          <select className={inputCls} value={f.sex} disabled={!canEdit} onChange={(e) => set({ sex: e.target.value as typeof f.sex })}>
            <option value="">Sin especificar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
          </select>
        </Field>
      ),
    },
    {
      prop: "gender",
      nodo: (
        <Field label="Género">
          <select className={inputCls} value={f.gender} disabled={!canEdit} onChange={(e) => set({ gender: e.target.value as typeof f.gender })}>
            <option value="">Sin especificar</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
            <option value="nd">Prefiero no decirlo</option>
            {f.gender === "otro" && <option value="otro">Otro</option>}
          </select>
        </Field>
      ),
    },
    { prop: "phone", nodo: T("Teléfono móvil", "phone") },
    { prop: "email", nodo: T("Email", "email", "email") },
    { prop: "tipo", nodo: T("Tipo", "tipo") },
    { prop: "socialName", nodo: T("Nombre social", "socialName") },
    { prop: "insurer", nodo: T("Convenio / seguro", "insurer") },
    { prop: "internalNumber", nodo: T("Número interno", "internalNumber") },
    { prop: "city", nodo: T("Ciudad", "city") },
    { prop: "municipio", nodo: T("Municipio / comuna", "municipio") },
    { prop: "barrio", nodo: T("Barrio", "barrio") },
    { prop: "address", nodo: T("Dirección", "address") },
    { prop: "activity", nodo: T("Actividad o profesión", "activity") },
    { prop: "employer", nodo: T("Empleador", "employer") },
    { prop: "landline", nodo: T("Teléfono fijo", "landline") },
    { prop: "guardian", nodo: T("Responsable (paciente menor)", "guardian") },
    { prop: "legalRepDoc", nodo: T("CI del responsable", "legalRepDoc") },
    { prop: "parentesco", nodo: T("Qué es del paciente", "parentesco") },
    { prop: "ruc", nodo: T("RUC", "ruc") },
    { prop: "razonSocial", nodo: T("Razón social", "razonSocial") },
    { prop: "referencia", nodo: T("Referido por (de quién)", "referencia") },
    { prop: "codigoReferido", nodo: T("Código de referido", "codigoReferido") },
    { prop: "emergencyContact", nodo: T("Contacto de emergencia", "emergencyContact") },
    { prop: "emergencyPhone", nodo: T("Teléfono de emergencia", "emergencyPhone", "tel") },
    {
      prop: "observaciones", ancho: true,
      nodo: (
        <Field label="Observaciones">
          <textarea rows={2} className={inputCls} value={f.observaciones} disabled={!canEdit} onChange={(e) => set({ observaciones: e.target.value })} />
        </Field>
      ),
    },
  ];
  const grilla = (lista: typeof datos) =>
    lista.map((d) => <div key={d.prop} className={d.ancho ? "sm:col-span-2 lg:col-span-3" : undefined}>{d.nodo}</div>);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-clinic-text">Datos personales</h3>
        {canEdit && (
          <Btn disabled={!dirty || !f.firstName.trim() || !f.lastName.trim()} onClick={save}>
            <Save className="h-4 w-4" /> Guardar datos
          </Btn>
        )}
      </div>

      {intento && aVaciar.length > 0 && (
        <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold text-state-err">
          No se guardó. Son datos obligatorios y no se pueden dejar vacíos: {aVaciar.join(", ")}.
        </p>
      )}

      <Card className="p-5">
        <h4 className="mb-3 text-[13px] font-bold text-clinic-muted">Datos requeridos</h4>
        {faltan.length > 0 && (
          <p role="status" className="mb-3 text-xs font-semibold text-state-warn">Faltan datos requeridos: {faltan.join(", ")}.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{grilla(datos.filter((d) => exigidos.has(d.prop)))}</div>
      </Card>

      <Card className="p-5">
        <h4 className="mb-3 text-[13px] font-bold text-clinic-muted">Datos opcionales</h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{grilla(datos.filter((d) => !exigidos.has(d.prop)))}</div>
      </Card>

      {!canEdit && <p className="text-xs text-clinic-muted">Tu rol tiene acceso de solo lectura a los datos del paciente.</p>}
    </div>
  );
}
