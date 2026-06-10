"use client";
/** Configuración de la práctica (solo Administrador): usuarios (con % comisión),
 *  servicios, convenios, plantilla de recordatorio y carga masiva de pacientes. */
import { useState } from "react";
import { ShieldAlert, Plus, UserCog, Stethoscope, Building2, Handshake, Trash2, MessageSquareText, UploadCloud, Percent } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import { can, ROLE_LABEL } from "@/lib/rbac";
import type { Role, User, Procedure } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";
import DentalinkImport from "@/components/DentalinkImport";

export default function ConfigPage() {
  const { db, session, upsertProcedure, setOnboarding, createTeamUser, backend, updateClinicConfig, upsertUser } = useStore();
  const [addingUser, setAddingUser] = useState(false);
  const [addingProc, setAddingProc] = useState(false);
  const [importing, setImporting] = useState(false);
  const [convName, setConvName] = useState("");
  const [convPct, setConvPct] = useState(10);
  const [template, setTemplate] = useState<string | null>(null);

  if (!session) return null;
  if (!can(session.role, "practice.config")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">La configuración de la práctica es exclusiva del rol <b>Administrador</b> (matriz RBAC, sec. 2.2).</p>
      </Card>
    );
  }

  const clinic = db.clinics[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-clinic-text">Configuración</h1>
        <p className="text-sm text-clinic-muted">Usuarios, servicios y datos de la clínica.</p>
      </div>

      {/* Clínica */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Clínica</h2></div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="text-clinic-muted">Nombre:</span> <b>{clinic?.name}</b></div>
          <div><span className="text-clinic-muted">Moneda:</span> <b>{clinic?.config.currency}</b></div>
          <div><span className="text-clinic-muted">Dirección:</span> <b>{clinic?.config.address}</b></div>
          <div><span className="text-clinic-muted">Teléfono:</span> <b>{clinic?.config.phone}</b></div>
        </div>
      </Card>

      {/* Usuarios */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UserCog className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Usuarios del equipo</h2></div>
          <Btn onClick={() => setAddingUser(true)}><Plus className="h-4 w-4" /> Agregar usuario</Btn>
        </div>
        <div className="divide-y divide-clinic-border">
          {db.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: u.color }}>
                {u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-clinic-text">{u.name}</span>
                <span className="block text-xs text-clinic-muted">{u.email}</span>
              </span>
              {u.role === "dentist" && (
                <label className="flex items-center gap-1 rounded-lg border border-clinic-border px-2 py-1" title="% de comisión sobre producción cobrada">
                  <Percent className="h-3 w-3 text-clinic-muted" />
                  <input
                    type="number" min={0} max={100}
                    className="w-10 bg-transparent text-right font-mono text-xs font-bold text-clinic-text focus:outline-none"
                    value={u.commissionPct ?? 0}
                    onChange={(e) => upsertUser({ ...u, commissionPct: Number(e.target.value) || 0 })}
                  />
                </label>
              )}
              <Badge tone={u.role === "admin" ? "info" : u.role === "dentist" ? "ok" : "warn"}>{ROLE_LABEL[u.role]}</Badge>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-clinic-muted">El % de comisión de cada dentista alimenta el cálculo de pago en <a href="/app/reportes" className="font-bold text-azure-700">Reportes</a>.</p>
      </Card>

      {/* Convenios */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><Handshake className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Gestión de convenios</h2></div>
        <p className="mb-3 text-xs text-clinic-muted">Acuerdos con empresas/aseguradoras — el descuento se aplica automáticamente en los presupuestos.</p>
        <div className="flex flex-wrap gap-2">
          {(clinic.config.convenios ?? []).map((c) => (
            <span key={c.name} className="inline-flex items-center gap-2 rounded-full border border-clinic-border bg-clinic-bg px-3 py-1.5 text-xs font-bold text-clinic-text">
              {c.name} <span className="font-mono text-azure-700">{c.discountPct}%</span>
              <button
                onClick={() => updateClinicConfig({ convenios: (clinic.config.convenios ?? []).filter((x) => x.name !== c.name) })}
                className="text-clinic-muted hover:text-state-err" aria-label={`Quitar ${c.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {(clinic.config.convenios ?? []).length === 0 && <span className="text-sm text-clinic-muted">Sin convenios cargados.</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input className={inputCls + " !w-48"} placeholder="Nombre (ej: IPS)" value={convName} onChange={(e) => setConvName(e.target.value)} />
          <input type="number" min={0} max={100} className={inputCls + " !w-24"} value={convPct} onChange={(e) => setConvPct(Number(e.target.value))} title="% de descuento" />
          <Btn
            variant="outline"
            disabled={!convName.trim()}
            onClick={() => {
              updateClinicConfig({ convenios: [...(clinic.config.convenios ?? []).filter((x) => x.name !== convName.trim()), { name: convName.trim(), discountPct: convPct }] });
              setConvName("");
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Agregar convenio
          </Btn>
        </div>
      </Card>

      {/* Plantilla de recordatorio */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Confirmación de citas — plantilla WhatsApp</h2></div>
        <p className="mb-2 text-xs text-clinic-muted">Variables disponibles: <code className="font-mono">{"{paciente} {fecha} {hora} {clinica}"}</code>. Se usa desde la Agenda al enviar recordatorios.</p>
        <textarea
          rows={3}
          className={inputCls}
          value={template ?? clinic.config.reminderTemplate ?? ""}
          onChange={(e) => setTemplate(e.target.value)}
        />
        {template !== null && template !== (clinic.config.reminderTemplate ?? "") && (
          <div className="mt-2 flex justify-end">
            <Btn onClick={() => { updateClinicConfig({ reminderTemplate: template }); setTemplate(null); }}>Guardar plantilla</Btn>
          </div>
        )}
      </Card>

      {/* Migración desde Dentalink / carga masiva */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><UploadCloud className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Migración desde Dentalink</h2></div>
          <Btn onClick={() => setImporting(true)}><UploadCloud className="h-4 w-4" /> Iniciar migración</Btn>
        </div>
        <p className="text-xs leading-relaxed text-clinic-muted">
          Traé toda tu base sin complicaciones: exportá <b>Reportes → Pacientes → Excel</b> en Dentalink, copiá y pegá (o subí el CSV) —
          Novudent detecta las columnas solo, omite duplicados por CI y si hay columna de <b>deuda</b> la carga directo en Cuentas por cobrar.
          Sirve también para cualquier otro software o planilla propia.
        </p>
      </Card>

      {/* Servicios / aranceles */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Servicios y aranceles</h2></div>
          <Btn onClick={() => setAddingProc(true)}><Plus className="h-4 w-4" /> Agregar servicio</Btn>
        </div>
        {db.procedures.length === 0 ? (
          <Empty title="Sin servicios" />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="py-2 pr-3">Código</th><th className="py-2 pr-3">Descripción</th><th className="py-2 text-right">Arancel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {db.procedures.map((p) => (
                <tr key={p.cpt}>
                  <td className="py-2.5 pr-3 font-mono font-bold text-clinic-text">{p.cpt}</td>
                  <td className="py-2.5 pr-3">{p.description}</td>
                  <td className="py-2.5 text-right font-mono">{fmtGs(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {addingUser && (
        <NewUser
          firebase={backend === "firebase"}
          onClose={() => setAddingUser(false)}
          onCreate={async (data) => {
            await createTeamUser(data);
            setOnboarding("usersCreated", true);
            setAddingUser(false);
          }}
        />
      )}
      {addingProc && (
        <NewProc
          onClose={() => setAddingProc(false)}
          onSave={(p) => { upsertProcedure(p); setOnboarding("servicesDefined", true); setAddingProc(false); }}
        />
      )}
      {importing && <DentalinkImport onClose={() => setImporting(false)} />}
    </div>
  );
}

function NewUser({
  firebase,
  onClose,
  onCreate,
}: {
  firebase: boolean;
  onClose: () => void;
  onCreate: (d: { name: string; email: string; role: Role; password: string; color: string }) => Promise<void>;
}) {
  const [f, setF] = useState({ name: "", email: "", role: "assistant" as Role, password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const COLORS: Record<Role, string> = { admin: "#1769E0", dentist: "#0E9F6E", assistant: "#B45309" };

  return (
    <Modal title="Agregar usuario" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onCreate({ name: f.name, email: f.email, role: f.role, password: f.password, color: COLORS[f.role] });
          } catch (err: any) {
            const code = err?.code ?? "";
            setError(
              code.includes("email-already-in-use") ? "Ese email ya tiene una cuenta."
              : code.includes("weak-password") ? "La contraseña debe tener al menos 6 caracteres."
              : code.includes("operation-not-allowed") ? "Habilitá «Email/Contraseña» en Firebase Console → Authentication → Sign-in method."
              : err?.message ?? "No se pudo crear el usuario."
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
          {firebase
            ? "Se crea una cuenta real en Firebase Auth. Compartile el email y la contraseña provisional a tu colaborador — ingresa desde la pantalla de inicio de sesión."
            : "⚠ Estás en modo local: el usuario se guarda solo en este navegador. Conectá Firebase para crear cuentas reales."}
        </p>
        <Field label="Nombre completo"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><input type="email" required autoComplete="off" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Contraseña provisional" hint="Mínimo 6 caracteres.">
            <input type="text" required minLength={6} autoComplete="new-password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Ej.: Clinica2026" />
          </Field>
        </div>
        <Field label="Rol" hint="Define permisos según la matriz RBAC.">
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            <option value="admin">Administrador</option>
            <option value="dentist">Dentista</option>
            <option value="assistant">Asistente</option>
          </select>
        </Field>
        {error && <p role="alert" className="rounded-xl bg-state-errbg px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-state-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" onClick={onClose}>Cancelar</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function NewProc({ onClose, onSave }: { onClose: () => void; onSave: (p: Procedure) => void }) {
  const [f, setF] = useState({ cpt: "", description: "", price: 0 });
  return (
    <Modal title="Agregar servicio" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); onSave({ cpt: f.cpt.toUpperCase(), description: f.description, price: f.price, defaultDx: [] }); }}
      >
        <Field label="Código (CPT/CDT)"><input required className={inputCls} value={f.cpt} onChange={(e) => setF({ ...f, cpt: e.target.value })} placeholder="D2330" /></Field>
        <Field label="Descripción"><input required className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Arancel (Gs)"><input type="number" min={0} required className={inputCls} value={f.price} onChange={(e) => setF({ ...f, price: +e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Cancelar</Btn><Btn type="submit">Crear servicio</Btn></div>
      </form>
    </Modal>
  );
}
