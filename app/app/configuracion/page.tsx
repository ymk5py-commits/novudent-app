"use client";
/** Configuración de la práctica (solo Administrador): usuarios, servicios, clínica. */
import { useState } from "react";
import { ShieldAlert, Plus, UserCog, Stethoscope, Building2 } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import { can, ROLE_LABEL } from "@/lib/rbac";
import type { Role, User, Procedure } from "@/lib/types";
import { Card, Btn, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";

export default function ConfigPage() {
  const { db, session, upsertProcedure, setOnboarding, createTeamUser, backend } = useStore();
  const [addingUser, setAddingUser] = useState(false);
  const [addingProc, setAddingProc] = useState(false);

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
              <Badge tone={u.role === "admin" ? "info" : u.role === "dentist" ? "ok" : "warn"}>{ROLE_LABEL[u.role]}</Badge>
            </div>
          ))}
        </div>
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
          <table className="w-full text-sm">
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
