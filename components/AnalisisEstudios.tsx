"use client";
import Link from "next/link";
/** «Análisis de estudios específicos» (antes «Pacientes de Ortodoncia», revisión de Novum
 *  del 27/9/2026): pacientes por tipo de tratamiento — vista general, ortodoncia,
 *  rehabilitación oral u odontología estética. Ortodoncia conserva su reporte propio
 *  (progreso, controles); los demás salen del tipo de consulta de las citas.
 *
 *  Pedido de Camila (8/10/2026): las tres cifras se tocan y dejan en la tabla solo esos pacientes, la tabla muestra todos sus datos
 *  (contacto, última y próxima cita, plan, desde cuándo están sin cita) y a quien hay que dejar de perseguir se lo quita de «Sin próxima
 *  cita» con un motivo. Quién cae en esa lista y cuándo vuelve lo decide lib/seguimiento (puro, con tests); acá solo se muestra. */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Download, MessageCircle, Undo2, UserMinus, UserRound } from "lucide-react";
import { useStore, fmtDate, fmtTime, fullName } from "@/lib/store";
import { useAlcance } from "@/lib/useAlcance";
import { useEstadosCita } from "@/lib/useEstadosCita";
import { estadoDeCita } from "@/lib/estadosCita";
import { BUDGET_STATUS_INFO } from "@/lib/budgets";
import { downloadCsv } from "@/lib/csv";
import { haceCuanto, seguimientoDeTodos, whatsappUrl, type SeguimientoDePaciente } from "@/lib/seguimiento";
import type { Appointment, Budget, Patient, QuitaDeLista } from "@/lib/types";
import { PacientesOrtodoncia } from "@/components/PacientesOrtodoncia";
import { QuitarDeListaModal } from "@/components/QuitarDeListaModal";
import { Card, Empty, Btn, Badge, StatusBadge } from "@/components/ui";

type Vista = "general" | "ortodoncia" | "rehabilitacion" | "estetica";
const VISTAS: { k: Vista; label: string }[] = [
  { k: "general", label: "Vista general" },
  { k: "ortodoncia", label: "Ortodoncia" },
  { k: "rehabilitacion", label: "Rehabilitación oral" },
  { k: "estetica", label: "Odontología estética" },
];

export function AnalisisEstudios() {
  const [vista, setVista] = useState<Vista>("general");
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Tipo de estudio" className="flex flex-wrap gap-1.5">
        {VISTAS.map((v) => (
          <button key={v.k} type="button" aria-pressed={vista === v.k} onClick={() => setVista(v.k)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-normal transition-colors ${vista === v.k ? "bg-azure-600 text-white" : "border border-clinic-border bg-white text-clinic-muted hover:text-clinic-text"}`}>
            {v.label}
          </button>
        ))}
      </div>
      {vista === "ortodoncia" ? <PacientesOrtodoncia /> : <TablaEstudio vista={vista} />}
    </div>
  );
}

type Seguimiento = SeguimientoDePaciente<Appointment, Budget>;
interface Fila { p: Patient; r: Seguimiento; profesional?: string }
/** Qué pacientes deja la tabla: todos, los que tienen una cita que viene o los que están en «Sin próxima cita». */
type Filtro = "todos" | "con" | "sin";

/** Una columna de la tabla. `csv` dice qué columnas planas aporta al archivo (una celda de pantalla puede juntar dos datos, como el
 *  teléfono y el correo; en el archivo cada dato va en la suya). Sin `csv`, la columna es solo de pantalla (las acciones). */
interface Columna {
  id: string;
  titulo: string;
  celda: (f: Fila) => ReactNode;
  csv?: { titulo: string; texto: (f: Fila) => string | number }[];
  derecha?: boolean;
  /** La del nombre: queda fija a la izquierda al recorrer la tabla de costado (en el celular es lo que dice de quién es cada renglón). */
  fija?: boolean;
}

const NOMBRE_DEL_FILTRO: Record<Filtro, string> = { todos: "", con: "-con-proxima-cita", sin: "-sin-proxima-cita" };
const guion = <span className="text-clinic-muted">—</span>;
/** La columna del nombre, fija a la izquierda. La sombra de 1 px a su izquierda tapa la rendija de medio píxel por la que, en las pantallas de
 *  mucha densidad, se asoma lo que pasa por debajo (el recorte del contenedor y el fondo de la celda no coinciden al redondear). */
const COLUMNA_FIJA = "sticky left-0 z-[1] border-r px-4 shadow-[-1px_0_0_0_#fff]";
const botonDeFila = "inline-flex min-h-[30px] items-center gap-1 whitespace-nowrap rounded border border-clinic-border bg-white px-2 text-[12px] font-semibold transition-colors";

function TablaEstudio({ vista }: { vista: Exclude<Vista, "ortodoncia"> }) {
  const { db, session, upsertPatient } = useStore();
  const alcance = useAlcance();
  const estados = useEstadosCita();
  const verPersonales = alcance.puede("patients.personal");
  const verPlanes = alcance.puede("plans.view");
  // Quita y vuelve a incluir quien maneja los datos del paciente o su ficha clínica: es lo que Firestore deja escribir en `patients`
  // (cualquier miembro, salvo los campos clínicos) y lo que el resto de la ficha ya pide para cambiar al paciente.
  const puedeQuitar = verPersonales || alcance.puede("emr.write");
  const titulo = VISTAS.find((v) => v.k === vista)!.label;

  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [verQuitados, setVerQuitados] = useState(false);
  const [quitando, setQuitando] = useState<Fila | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);

  const filas = useMemo<Fila[]>(() => {
    const visibles = db.patients.filter((p) => alcance.vePaciente(p.id) && !p.disabled);
    const seguimientos = seguimientoDeTodos({
      pacientes: visibles, citas: db.appointments, presupuestos: db.budgets, ahora: new Date(),
      tipo: vista === "general" ? undefined : vista,
    });
    const usuarios = new Map(db.users.map((u) => [u.id, u.name]));
    return visibles
      .map((p) => ({ p, r: seguimientos.get(p.id)! }))
      .filter((f) => f.r.enVista)
      .map((f) => ({ ...f, profesional: usuarios.get((f.r.ultima ?? f.r.proxima)?.dentistId ?? "") }))
      .sort((a, b) => fullName(a.p).localeCompare(fullName(b.p)));
  }, [db.patients, db.appointments, db.budgets, db.users, alcance, vista]);

  const conProxima = filas.filter((f) => f.r.proxima).length;
  const enLista = filas.filter((f) => f.r.enLista).length;
  const quitados = useMemo(() => filas.filter((f) => f.r.quita), [filas]);
  const mostradas = filtro === "con" ? filas.filter((f) => f.r.proxima) : filtro === "sin" ? filas.filter((f) => f.r.enLista) : filas;

  /** Tocar una cifra la enciende; tocarla de nuevo (o la primera) vuelve a todos. Mientras se miran los quitados ninguna figura como activa:
   *  tocar una de ellas es elegirla, no apagarla. */
  const elegirFiltro = (k: Filtro) => {
    const veniaDeLosQuitados = verQuitados;
    setVerQuitados(false);
    setAviso(null);
    setFiltro((actual) => (k === "todos" || (actual === k && !veniaDeLosQuitados) ? "todos" : k));
  };

  const etiquetaDelEstado = (a: Appointment) => estadoDeCita(a, estados).label;
  const textoDeUltima = (r: Seguimiento) => (r.ultima ? `${fmtDate(r.ultima.start)} · ${etiquetaDelEstado(r.ultima)}` : "—");
  const textoDeProxima = (r: Seguimiento) => (r.proxima ? `${fmtDate(r.proxima.start)} ${fmtTime(r.proxima.start)}` : "Sin cita");
  const textoDelPlan = (r: Seguimiento) => (r.plan ? `${r.plan.name ?? "Plan de tratamiento"} · ${BUDGET_STATUS_INFO[r.plan.status]?.label ?? r.plan.status}` : "—");
  const textoDesde = (r: Seguimiento) => (r.enLista && r.desde ? `${haceCuanto(r.dias)} · ${r.desdeDe === "plan" ? "plan del" : "desde el"} ${fmtDate(r.desde)}` : "—");
  const textoDeSeguimiento = (r: Seguimiento) =>
    r.proxima ? "Con próxima cita" : r.enLista ? "A recontactar" : r.quita ? `Quitado: ${r.quita.motivo}` : r.finalizado ? "Plan finalizado" : "Sin asistencias";

  const quitar = (f: Fila, quita: QuitaDeLista) => {
    const actual = db.patients.find((p) => p.id === f.p.id); // el paciente tal cual está ahora: se guarda entero (setDoc sin merge)
    setQuitando(null);
    if (!actual) return;
    upsertPatient({ ...actual, seguimiento: quita });
    setAviso(`Quitaste a ${fullName(actual)} de la lista. Lo encontrás en «Ver quitados» para volver a incluirlo.`);
    tituloRef.current?.focus();
  };
  const volverAIncluir = (f: Fila) => {
    const actual = db.patients.find((p) => p.id === f.p.id);
    if (!actual) return;
    const { seguimiento: _quitado, ...sinQuita } = actual;
    void _quitado;
    upsertPatient(sinQuita);
    setAviso(`${fullName(actual)} volvió a la lista.`);
    tituloRef.current?.focus();
  };

  /** Los botones de cada renglón: en una sola línea hasta el escritorio (el renglón no se estira) y en dos desde ahí (la columna no se ensancha). */
  const acciones = (f: Fila, extra?: ReactNode) => {
    const nombre = fullName(f.p);
    const wa = verPersonales ? whatsappUrl(f.p.phone) : null;
    return (
      <div className="flex flex-nowrap items-center gap-1.5 lg:w-[200px] lg:flex-wrap">
        <Link href={`/app/pacientes/${f.p.id}`} aria-label={`Ver ficha de ${nombre}`} className={`${botonDeFila} text-azure-700 hover:border-azure-300 hover:bg-azure-50`}>
          <UserRound className="h-3.5 w-3.5" aria-hidden /> Ver ficha
        </Link>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${nombre}`} className={`${botonDeFila} text-state-ok hover:border-state-ok/40 hover:bg-state-okbg`}>
            <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
          </a>
        )}
        {extra}
      </div>
    );
  };

  const celdaDelNombre = (f: Fila) => (
    <div>
      <Link href={`/app/pacientes/${f.p.id}`} className="font-semibold text-clinic-text hover:text-azure-700">{fullName(f.p)}</Link>
      {verPersonales && <div className="tabular-nums text-[11px] text-clinic-muted">CI {f.p.document || "—"}</div>}
    </div>
  );
  const csvDelNombre = [
    { titulo: "Paciente", texto: (f: Fila) => fullName(f.p) },
    ...(verPersonales ? [{ titulo: "CI", texto: (f: Fila) => f.p.document || "—" }] : []),
  ];
  const columnaDeUltima: Columna = {
    id: "ultima", titulo: "Última cita",
    csv: [{ titulo: "Última cita", texto: (f) => textoDeUltima(f.r) }],
    celda: (f) => f.r.ultima
      ? <div className="space-y-1"><div className="text-clinic-text">{fmtDate(f.r.ultima.start)}</div><StatusBadge status={f.r.ultima.status} estadoId={f.r.ultima.estadoId} /></div>
      : guion,
  };

  const columnas: Columna[] = [
    { id: "paciente", titulo: "Paciente", fija: true, csv: csvDelNombre, celda: celdaDelNombre },
    ...(verPersonales ? [{
      id: "contacto", titulo: "Contacto",
      csv: [{ titulo: "Teléfono", texto: (f: Fila) => f.p.phone || "—" }, { titulo: "Correo", texto: (f: Fila) => f.p.email || "—" }],
      celda: (f: Fila) => (
        <div>
          <div className="tabular-nums">{f.p.phone || "—"}</div>
          <div className="max-w-[190px] truncate text-[11px] text-clinic-muted" title={f.p.email || undefined}>{f.p.email || "—"}</div>
        </div>
      ),
    }] : []),
    { id: "profesional", titulo: "Profesional", csv: [{ titulo: "Profesional", texto: (f) => f.profesional ?? "—" }], celda: (f) => <span className="text-clinic-muted">{f.profesional ?? "—"}</span> },
    columnaDeUltima,
    {
      id: "proxima", titulo: "Próxima cita",
      csv: [{ titulo: "Próxima cita", texto: (f) => textoDeProxima(f.r) }],
      celda: (f) => f.r.proxima
        ? <span>{fmtDate(f.r.proxima.start)} <span className="tabular-nums text-clinic-muted">{fmtTime(f.r.proxima.start)}</span></span>
        : <span className={f.r.enLista ? "font-semibold text-state-warn" : "text-clinic-muted"}>Sin cita</span>,
    },
    ...(verPlanes ? [{
      id: "plan", titulo: "Plan de tratamiento",
      csv: [{ titulo: "Plan de tratamiento", texto: (f: Fila) => textoDelPlan(f.r) }],
      celda: (f: Fila) => f.r.plan
        ? (
          <div className="max-w-[210px] space-y-1">
            <div className="truncate text-clinic-text" title={f.r.plan.name ?? "Plan de tratamiento"}>{f.r.plan.name ?? "Plan de tratamiento"}</div>
            <Badge tone={BUDGET_STATUS_INFO[f.r.plan.status]?.tone ?? "muted"}>{BUDGET_STATUS_INFO[f.r.plan.status]?.label ?? f.r.plan.status}</Badge>
          </div>
        )
        : guion,
    }] : []),
    // Entre quienes ya tienen cita, «Sin cita desde» no tiene sentido.
    ...(filtro === "sin" ? [{
      id: "desde", titulo: "Sin cita desde",
      csv: [{ titulo: "Sin cita desde", texto: (f: Fila) => textoDesde(f.r) }],
      celda: (f: Fila) => f.r.enLista && f.r.desde
        ? <div><div className="font-semibold text-state-warn">{haceCuanto(f.r.dias)}</div><div className="text-[11px] text-clinic-muted">{f.r.desdeDe === "plan" ? "plan del" : "desde el"} {fmtDate(f.r.desde)}</div></div>
        : guion,
    }] : []),
    // Viendo a todos, una sola columna explica la situación de cada paciente: si está en la lista (y desde cuándo), si ya tiene cita, si su
    // plan terminó o si lo quitaron. Mantiene la tabla igual de ancha que filtrada.
    ...(filtro === "todos" ? [{
      id: "seguimiento", titulo: "Seguimiento",
      csv: [{ titulo: "Seguimiento", texto: (f: Fila) => textoDeSeguimiento(f.r) }, { titulo: "Sin cita desde", texto: (f: Fila) => textoDesde(f.r) }],
      celda: (f: Fila) => {
        const r = f.r;
        if (r.proxima) return <span className="text-clinic-muted">Con próxima cita</span>;
        if (r.enLista) {
          return (
            <div className="space-y-1">
              <Badge tone="warn">A recontactar</Badge>
              {r.desde && <div className="text-[11px] text-clinic-muted"><span className="font-semibold text-state-warn">{haceCuanto(r.dias)}</span> · {r.desdeDe === "plan" ? "plan del" : "desde el"} {fmtDate(r.desde)}</div>}
            </div>
          );
        }
        if (r.quita) return <div className="max-w-[190px] space-y-1"><Badge tone="muted">Quitado de la lista</Badge><div className="whitespace-normal text-[11px] leading-snug text-clinic-muted">{r.quita.motivo}</div></div>;
        if (r.finalizado) return <Badge tone="ok">Plan finalizado</Badge>;
        return <span className="text-clinic-muted">Sin asistencias</span>;
      },
    }] : []),
    { id: "citas", titulo: "Citas", derecha: true, csv: [{ titulo: "Citas", texto: (f) => f.r.citas }], celda: (f) => <span className="tabular-nums">{f.r.citas}</span> },
    { id: "planes", titulo: "Planes", derecha: true, csv: [{ titulo: "Planes", texto: (f) => f.r.planes }], celda: (f) => <span className="tabular-nums">{f.r.planes}</span> },
    {
      id: "acciones", titulo: "Acciones",
      celda: (f) => acciones(f, puedeQuitar && f.r.enLista && (
        <button type="button" onClick={() => setQuitando(f)} aria-label={`Quitar de la lista: ${fullName(f.p)}`} className={`${botonDeFila} text-clinic-text hover:border-state-err/40 hover:bg-state-errbg hover:text-state-err`}>
          <UserMinus className="h-3.5 w-3.5" aria-hidden /> Quitar de la lista
        </button>
      )),
    },
  ];

  // La tabla de los quitados: a quién, cuándo, por qué y quién; con «Volver a incluir».
  const columnasDeQuitados: Columna[] = [
    { id: "paciente", titulo: "Paciente", fija: true, csv: csvDelNombre, celda: celdaDelNombre },
    ...(verPersonales ? [{
      id: "telefono", titulo: "Teléfono",
      csv: [{ titulo: "Teléfono", texto: (f: Fila) => f.p.phone || "—" }],
      celda: (f: Fila) => <span className="tabular-nums">{f.p.phone || "—"}</span>,
    }] : []),
    columnaDeUltima,
    {
      id: "quitado", titulo: "Quitado el",
      csv: [{ titulo: "Quitado el", texto: (f) => `${fmtDate(f.r.quita!.cerradoAt)} ${fmtTime(f.r.quita!.cerradoAt)}` }],
      celda: (f) => <span>{fmtDate(f.r.quita!.cerradoAt)} <span className="tabular-nums text-clinic-muted">{fmtTime(f.r.quita!.cerradoAt)}</span></span>,
    },
    { id: "motivo", titulo: "Motivo", csv: [{ titulo: "Motivo", texto: (f) => f.r.quita!.motivo }], celda: (f) => <span className="block max-w-[260px] whitespace-normal break-words text-clinic-text">{f.r.quita!.motivo}</span> },
    { id: "por", titulo: "Quitado por", csv: [{ titulo: "Quitado por", texto: (f) => f.r.quita!.por || "—" }], celda: (f) => <span className="text-clinic-muted">{f.r.quita!.por || "—"}</span> },
    {
      id: "acciones", titulo: "Acciones",
      celda: (f) => acciones(f, puedeQuitar && (
        <button type="button" onClick={() => volverAIncluir(f)} aria-label={`Volver a incluir: ${fullName(f.p)}`} className={`${botonDeFila} text-azure-700 hover:border-azure-300 hover:bg-azure-50`}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden /> Volver a incluir
        </button>
      )),
    },
  ];

  const cols = verQuitados ? columnasDeQuitados : columnas;
  const filasDeLaTabla = verQuitados ? quitados : mostradas;

  const exportar = () => {
    const planas = cols.flatMap((c) => c.csv ?? []);
    downloadCsv(`estudios-${vista}${verQuitados ? "-quitados" : NOMBRE_DEL_FILTRO[filtro]}.csv`, [
      planas.map((c) => c.titulo),
      ...filasDeLaTabla.map((f) => planas.map((c) => c.texto(f))),
    ]);
  };

  const cifras: { k: Filtro; valor: number; etiqueta: string; tono: string }[] = [
    { k: "todos", valor: filas.length, etiqueta: `Pacientes en ${titulo.toLowerCase()}`, tono: "text-clinic-text" },
    { k: "con", valor: conProxima, etiqueta: "Con próxima cita", tono: "text-clinic-text" },
    { k: "sin", valor: enLista, etiqueta: "Sin próxima cita (a recontactar)", tono: "text-state-warn" },
  ];

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filtrar pacientes" className="grid grid-cols-3 gap-2 sm:gap-3">
        {cifras.map((c) => {
          const activa = !verQuitados && filtro === c.k;
          return (
            <button key={c.k} type="button" aria-pressed={activa} onClick={() => elegirFiltro(c.k)}
              className={`min-w-0 rounded border bg-white p-3 text-left transition-[border-color,box-shadow] sm:p-4 ${activa ? "border-azure-600 ring-2 ring-azure-100" : "border-clinic-border hover:border-azure-300"}`}>
              <div className={`text-2xl font-bold ${c.tono}`}>{c.valor}</div>
              <div className="text-[11px] leading-snug text-clinic-muted sm:text-xs">{c.etiqueta}</div>
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        {aviso && <p className="rounded border border-state-ok/30 bg-state-okbg px-3 py-2 text-sm text-state-ok">{aviso}</p>}
      </div>

      {filas.length === 0 ? (
        <Empty title={`Sin pacientes en ${titulo.toLowerCase()}`} desc={vista === "general" ? "Cuando un paciente tenga una cita o un plan, aparece acá." : "Aparecen los pacientes con citas de este tipo de consulta (se elige al dar la cita)."} />
      ) : (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-clinic-border px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 ref={tituloRef} tabIndex={-1} className="text-sm font-bold text-clinic-text outline-none">{verQuitados ? `Quitados de la lista · ${titulo}` : titulo}</h3>
              {!verQuitados && filtro !== "todos" && (
                <>
                  <span className="text-xs text-clinic-muted">Mostrando {mostradas.length} de {filas.length}</span>
                  <button type="button" onClick={() => elegirFiltro("todos")} className="text-xs font-bold text-azure-700 hover:underline">Quitar filtro</button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex cursor-pointer select-none items-center gap-2">
                <span className="text-xs font-semibold text-clinic-text">Ver quitados ({quitados.length})</span>
                <button
                  type="button" role="switch" aria-checked={verQuitados}
                  onClick={() => { setVerQuitados((v) => !v); setAviso(null); }}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${verQuitados ? "bg-azure-600" : "bg-clinic-border"}`}
                >
                  {/* `left-0.5`: sin un `left`, la bolita absoluta se queda donde la deja el botón y, encendida, se sale de la pista. */}
                  <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${verQuitados ? "translate-x-4" : "translate-x-0"}`} />
                </button>
              </label>
              <Btn variant="outline" onClick={exportar} disabled={filasDeLaTabla.length === 0}><Download className="h-3.5 w-3.5" /> Exportar CSV</Btn>
            </div>
          </div>

          {filasDeLaTabla.length === 0 ? (
            <div className="p-4">
              <Empty
                title={verQuitados ? "Nadie fue quitado de la lista" : filtro === "con" ? "Ningún paciente con próxima cita" : "Ningún paciente sin próxima cita"}
                desc={verQuitados
                  ? "Cuando quites a alguien de «Sin próxima cita», lo vas a encontrar acá con su motivo para volver a incluirlo."
                  : filtro === "con" ? "Cuando agendes una cita a un paciente, aparece acá."
                  : "Los que asistieron ya tienen su próxima cita, terminaron su tratamiento o fueron quitados de la lista."}
              />
            </div>
          ) : (
            <>
              <p className="px-4 pt-2 text-xs font-semibold text-azure-700 sm:hidden">Deslizá la tabla para ver todas las columnas →</p>
              {/* `scroll-hint-shown`: el aviso de arriba reemplaza al genérico, que se movía con la tabla. `relative`: un `sr-only` dentro de un
                  contenedor con scroll horizontal sobresale de la tabla y en el celular ensancha toda la ventana. */}
              <div key={verQuitados ? "quitados" : filtro} className="scroll-hint-shown relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                {/* `border-separate`: con los bordes colapsados, una columna fija deja ver una rendija de lo que pasa por debajo. */}
                <table className="w-full min-w-max border-separate border-spacing-0 whitespace-nowrap text-sm">
                  <caption className="sr-only">{verQuitados ? `Pacientes quitados de la lista, ${titulo.toLowerCase()}` : `Pacientes en ${titulo.toLowerCase()}${filtro === "con" ? ", con próxima cita" : filtro === "sin" ? ", sin próxima cita" : ""}`}</caption>
                  <thead>
                    <tr className="text-left text-[13px] font-bold text-clinic-text">
                      {cols.map((c) => (
                        <th key={c.id} scope="col" className={`border-b border-clinic-border py-2 ${c.fija ? `${COLUMNA_FIJA} bg-white` : "px-3"} ${c.derecha ? "text-right" : ""}`}>{c.titulo}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {filasDeLaTabla.map((f) => (
                      <tr key={f.p.id} className="group align-top hover:bg-clinic-bg">
                        {cols.map((c) => (
                          <td key={c.id} className={`border-b border-clinic-border py-2.5 ${c.fija ? `${COLUMNA_FIJA} bg-white group-hover:bg-clinic-bg group-hover:shadow-[-1px_0_0_0_theme(colors.clinic.bg)]` : "px-3"} ${c.derecha ? "text-right" : ""}`}>{c.celda(f)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {quitando && (
        <QuitarDeListaModal
          nombre={fullName(quitando.p)} por={session?.name ?? ""}
          onClose={() => setQuitando(null)}
          onQuitar={(quita) => quitar(quitando, quita)}
        />
      )}
    </div>
  );
}
