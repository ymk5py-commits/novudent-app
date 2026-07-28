"use client";
/** Migración desde Dentalink (u otro software) sin fricción:
 *  pegás el export (CSV o copiado de Excel), Novudent detecta separador y columnas,
 *  mapea automáticamente por nombre de encabezado, deduplica por CI e importa.
 *  Si hay columna de deuda, crea un presupuesto "Saldo migrado" para que
 *  Cuentas por cobrar funcione desde el día uno. */
import { useMemo, useRef, useState } from "react";
import { UploadCloud, ArrowRight, ArrowLeft, CheckCircle2, FileSpreadsheet, Wand2 } from "lucide-react";
import { useStore, fmtGs } from "@/lib/store";
import type { Patient, Budget } from "@/lib/types";
import { Btn, Modal, Field, inputCls, Badge } from "@/components/ui";

/* Campos destino y palabras clave para auto-mapear encabezados de Dentalink */
const FIELDS = [
  { key: "firstName", label: "Nombre", required: true, kw: ["nombre", "nombres", "first"] },
  { key: "lastName", label: "Apellido", required: true, kw: ["apellido", "apellidos", "last", "paterno"] },
  { key: "document", label: "CI / RUT", required: false, kw: ["rut", "ci", "cedula", "cédula", "documento", "dni", "identificac"] },
  { key: "phone", label: "Teléfono", required: false, kw: ["telefono", "teléfono", "celular", "cel", "fono", "movil", "móvil", "whats"] },
  { key: "email", label: "Email", required: false, kw: ["mail", "correo"] },
  { key: "birthDate", label: "Nacimiento", required: false, kw: ["nacimiento", "nacim", "birth", "fecha de nac"] },
  { key: "insurer", label: "Convenio / Previsión", required: false, kw: ["prevision", "previsión", "convenio", "isapre", "seguro", "asegurad", "obra social"] },
  { key: "debt", label: "Deuda / Saldo (Gs)", required: false, kw: ["deuda", "saldo", "por cobrar", "pendiente"] },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

function detectSeparator(text: string): string {
  const firstLines = text.split("\n").slice(0, 3).join("\n");
  const counts: [string, number][] = [["\t", 0], [";", 0], [",", 0]];
  counts.forEach((c) => (c[1] = (firstLines.match(new RegExp(c[0] === "\t" ? "\t" : `\\${c[0]}`, "g")) ?? []).length));
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** dd/mm/yyyy | dd-mm-yyyy | yyyy-mm-dd → yyyy-mm-dd */
function parseDate(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `19${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return undefined;
}

function parseMoney(s: string): number {
  const n = Number(s.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function DentalinkImport({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [raw, setRaw] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, number>>>({});
  const [done, setDone] = useState<{ imported: number; skipped: number; debts: number } | null>(null);

  /* ---- parseo ---- */
  const parsed = useMemo(() => {
    if (!raw.trim()) return { headers: [] as string[], rows: [] as string[][] };
    const sep = detectSeparator(raw);
    const lines = raw.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim());
    const cells = lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
    const headers = hasHeader ? cells[0] : cells[0]?.map((_, i) => `Columna ${i + 1}`) ?? [];
    const rows = hasHeader ? cells.slice(1) : cells;
    return { headers, rows };
  }, [raw, hasHeader]);

  /* ---- auto-mapeo por encabezado ---- */
  const autoMap = () => {
    const m: Partial<Record<FieldKey, number>> = {};
    parsed.headers.forEach((h, i) => {
      const n = normalize(h);
      for (const f of FIELDS) {
        if (m[f.key] === undefined && f.kw.some((k) => n.includes(k))) {
          m[f.key] = i;
          break;
        }
      }
    });
    /* sin encabezados: posiciones del formato simple nombre;apellido;ci;tel;email */
    if (Object.keys(m).length === 0 && parsed.headers.length >= 2) {
      (["firstName", "lastName", "document", "phone", "email"] as FieldKey[]).forEach((k, i) => {
        if (i < parsed.headers.length) m[k] = i;
      });
    }
    setMapping(m);
  };

  /* ---- filas mapeadas ---- */
  const mapped = useMemo(() => {
    const get = (row: string[], k: FieldKey) => (mapping[k] !== undefined ? row[mapping[k]!] ?? "" : "");
    const existing = new Set(db.patients.map((p) => p.document));
    const out: { patient: Patient; debt: number; dup: boolean }[] = [];
    const now = Date.now();
    parsed.rows.forEach((row, i) => {
      const firstName = get(row, "firstName").trim();
      const lastName = get(row, "lastName").trim();
      if (!firstName || !lastName) return;
      const doc = get(row, "document").trim();
      out.push({
        dup: !!doc && existing.has(doc),
        debt: parseMoney(get(row, "debt")),
        patient: {
          id: `p_${now}_${i}`,
          clinicId: db.clinics[0].id,
          firstName, lastName,
          document: doc || `s/d-${now}-${i}`,
          phone: get(row, "phone").trim(),
          email: get(row, "email").trim() || undefined,
          birthDate: parseDate(get(row, "birthDate")),
          insurer: get(row, "insurer").trim() || undefined,
          forms: [], historyUpdatePending: false, emr: [],
        },
      });
    });
    return out;
  }, [parsed.rows, mapping, db.patients, db.clinics]);

  const ready = mapping.firstName !== undefined && mapping.lastName !== undefined;
  const news = mapped.filter((x) => !x.dup);
  const withDebt = news.filter((x) => x.debt > 0);

  const runImport = () => {
    store.importPatients(news.map((x) => x.patient));
    /* deuda → presupuesto "Saldo migrado" aceptado (alimenta Cuentas por cobrar) */
    withDebt.forEach((x, i) => {
      const b: Budget = {
        id: `g_mig_${Date.now()}_${i}`,
        clinicId: db.clinics[0].id,
        patientId: x.patient.id,
        dentistId: db.users.find((u) => u.role === "dentist")?.id ?? "",
        createdAt: new Date().toISOString(),
        status: "aceptado",
        items: [{ id: `gi_mig_${i}`, cpt: "MIG", description: "Saldo migrado de Dentalink", price: x.debt, status: "realizado", doneAt: new Date().toISOString(), doneBy: "Migración" }],
        notes: "Generado automáticamente por la migración — representa la deuda previa del paciente.",
        history: [{ at: new Date().toISOString(), action: "Saldo inicial migrado desde Dentalink", by: session?.name ?? "Migración" }],
      };
      store.upsertBudget(b);
    });
    setDone({ imported: news.length, skipped: mapped.length - news.length, debts: withDebt.length });
  };

  return (
    <Modal title="Migración desde Dentalink" onClose={onClose} wide>
      {done ? (
        <div className="space-y-4 py-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-state-ok" />
          <h3 className="text-lg font-extrabold text-clinic-text">¡Migración completada!</h3>
          <p className="text-sm text-clinic-muted">
            <b className="text-clinic-text">{done.imported}</b> paciente{done.imported !== 1 && "s"} importado{done.imported !== 1 && "s"}
            {done.skipped > 0 && <> · {done.skipped} duplicado{done.skipped > 1 && "s"} omitido{done.skipped > 1 && "s"}</>}
            {done.debts > 0 && <> · <b className="text-clinic-text">{done.debts}</b> saldo{done.debts > 1 && "s"} pendiente{done.debts > 1 && "s"} cargado{done.debts > 1 && "s"} en Cuentas por cobrar</>}.
          </p>
          <div className="flex justify-center gap-2">
            <a href="/app/pacientes"><Btn>Ver pacientes</Btn></a>
            {done.debts > 0 && <a href="/app/caja"><Btn variant="outline">Ver cuentas por cobrar</Btn></a>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* pasos */}
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
            {["Datos", "Columnas", "Confirmar"].map((s, i) => (
              <span key={s} className={`flex items-center gap-2 ${i + 1 <= step ? "text-azure-700" : "text-clinic-muted"}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-full font-mono text-[11px] ${i + 1 <= step ? "bg-azure-600 text-white" : "bg-clinic-bg"}`}>{i + 1}</span>
                {s} {i < 2 && <ArrowRight className="h-3 w-3 text-clinic-border" />}
              </span>
            ))}
          </div>

          {step === 1 && (
            <>
              <p className="rounded-xl bg-azure-50 p-3 text-xs leading-relaxed text-azure-700">
                En Dentalink: <b>Reportes → Pacientes → Exportar a Excel</b>. Abrí el archivo y <b>copiá y pegá todo acá</b> (Ctrl+A, Ctrl+C, Ctrl+V) — también podés subir el .csv.
                Novudent detecta solo el separador y las columnas. Sirve para cualquier otro software con el mismo método.
              </p>
              <div className="flex gap-2">
                <Btn variant="outline" onClick={() => fileRef.current?.click()}><UploadCloud className="h-4 w-4" /> Subir .csv</Btn>
                <input
                  ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setRaw(await f.text());
                    e.target.value = "";
                  }}
                />
              </div>
              <textarea
                rows={9}
                className={inputCls + " font-mono text-[11px]"}
                placeholder={"Nombre\tApellidos\tRUT\tTeléfono\tEmail\tDeuda\nMaría\tGonzález\t3.456.789\t0981 111 111\tmaria@mail.com\t250000"}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-clinic-text">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="h-4 w-4 accent-azure-600" />
                La primera fila son los encabezados
              </label>
              <div className="flex justify-end gap-2">
                <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
                <Btn disabled={parsed.rows.length === 0} onClick={() => { autoMap(); setStep(2); }}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </Btn>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-clinic-muted">{parsed.rows.length} filas · revisá el mapeo de columnas (auto-detectado).</p>
                <Btn variant="outline" onClick={autoMap}><Wand2 className="h-3.5 w-3.5" /> Re-detectar</Btn>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                    <select
                      className={inputCls}
                      value={mapping[f.key] ?? -1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMapping((m) => ({ ...m, [f.key]: v === -1 ? undefined : v }));
                      }}
                    >
                      <option value={-1}>— No importar —</option>
                      {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Columna ${i + 1}`}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              {!ready && <p className="rounded-xl bg-state-warnbg p-3 text-xs font-semibold text-state-warn">Mapeá al menos Nombre y Apellido para continuar.</p>}
              <div className="flex justify-between gap-2">
                <Btn variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Volver</Btn>
                <Btn disabled={!ready} onClick={() => setStep(3)}>Vista previa <ArrowRight className="h-4 w-4" /></Btn>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone="ok">{news.length} nuevos</Badge>
                {mapped.length - news.length > 0 && <Badge tone="warn" tip="Ya existen en Novudent (mismo CI) — se omiten">{mapped.length - news.length} duplicados</Badge>}
                {withDebt.length > 0 && <Badge tone="info" tip="Se crea un presupuesto «Saldo migrado» por cada uno — aparecen en Caja → Cuentas por cobrar">{withDebt.length} con deuda · {fmtGs(withDebt.reduce((s, x) => s + x.debt, 0))}</Badge>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-clinic-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-clinic-border bg-clinic-bg text-left font-bold uppercase tracking-wide text-clinic-muted">
                      <th className="px-3 py-2">Paciente</th><th className="px-3 py-2">CI</th><th className="px-3 py-2">Teléfono</th><th className="px-3 py-2">Convenio</th><th className="px-3 py-2 text-right">Deuda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-clinic-border">
                    {news.slice(0, 6).map((x) => (
                      <tr key={x.patient.id}>
                        <td className="px-3 py-2 font-semibold text-clinic-text">{x.patient.firstName} {x.patient.lastName}</td>
                        <td className="px-3 py-2 font-mono">{x.patient.document}</td>
                        <td className="px-3 py-2">{x.patient.phone || "—"}</td>
                        <td className="px-3 py-2">{x.patient.insurer ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{x.debt > 0 ? fmtGs(x.debt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {news.length > 6 && <p className="bg-clinic-bg px-3 py-1.5 text-center text-[11px] text-clinic-muted">… y {news.length - 6} más</p>}
              </div>
              <div className="flex justify-between gap-2">
                <Btn variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Volver</Btn>
                <Btn disabled={news.length === 0} onClick={runImport}>
                  <FileSpreadsheet className="h-4 w-4" /> Importar {news.length} paciente{news.length !== 1 && "s"}
                </Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
