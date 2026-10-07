/** Rutina del administrador (Inicio): lo que le toca revisar cada día, cada semana y a fin de mes, con el dato de la
 *  clínica a la vista y un casillero que tilda a mano («controlé la caja»).
 *
 *  A diferencia de la rutina de «Mi agenda» (que se tacha sola cuando el estado de la clínica se resuelve), acá lo que
 *  se tilda es una REVISIÓN: que la persona miró. Por eso se guarda (colección `routineChecks`, un documento por casillero
 *  y período, con id determinístico) y se reinicia sola: lo de hoy no cuenta mañana, lo de la semana empieza el lunes.
 *
 *  La rutina es fija (la define Novum), no editable por la clínica. Módulo PURO: no importa React, ni Firestore, ni el
 *  store. Todo entra por parámetro, incluido cómo se escribe el dinero. */
import { diaDe, sumarDias } from "./tareas";
import { checkStatus } from "./budgets";
import { totalesSesion } from "./caja";
import { HREF_RETENCIONES } from "./pendientes";
import { diaLocal, morososPorAntiguedad, realizadas, recaudacionDiaria, sumarMeses } from "./reportes";
import type { Appointment, BillingRecord, Budget, BudgetItem, CashSession, Expense, Patient, Payment, RutinaCheck, Settlement, User } from "./types";

export type Frecuencia = "diaria" | "semanal" | "mensual";
export type PasoId = "caja" | "cobrado" | "deudores" | "implantes" | "retenciones" | "cheques" | "desempeno" | "liquidar" | "gastos";

interface DefPaso {
  id: PasoId;
  frecuencia: Frecuencia;
  titulo: string;
  href: string;
  /** El paso solo existe si la clínica tiene ese módulo en su plan. */
  requiere?: "caja" | "liquidaciones";
}

/** La rutina, en el orden en que se muestra. */
export const PASOS_RUTINA: readonly DefPaso[] = [
  { id: "caja", frecuencia: "diaria", titulo: "Controlar cómo cerró la caja", href: "/app/caja", requiere: "caja" },
  { id: "cobrado", frecuencia: "diaria", titulo: "Revisar lo cobrado del día", href: "/app/reportes#graficos" },
  { id: "deudores", frecuencia: "diaria", titulo: "Seguir a los pacientes que deben", href: "/app/pacientes" },
  { id: "implantes", frecuencia: "diaria", titulo: "Seguir a los que deben implantes", href: "/app/pacientes" },
  { id: "retenciones", frecuencia: "diaria", titulo: "Mirar los reclamos en retención", href: HREF_RETENCIONES },
  { id: "cheques", frecuencia: "diaria", titulo: "Controlar los cheques", href: "/app/caja" },
  { id: "desempeno", frecuencia: "semanal", titulo: "Revisar el desempeño de la semana", href: "/app/reportes#desempeno" },
  { id: "liquidar", frecuencia: "mensual", titulo: "Liquidar a los profesionales", href: "/app/liquidaciones", requiere: "liquidaciones" },
  { id: "gastos", frecuencia: "mensual", titulo: "Cargar los gastos del mes", href: "/app/gastos" },
];

/* ─── Períodos y casilleros ──────────────────────────────────────────────── */

/** El día en que arranca el período en el que cae `hoy`: el día, el lunes de la semana, o el mes (YYYY-MM). */
export function periodoDe(frecuencia: Frecuencia, hoy: string): string {
  if (frecuencia === "diaria") return hoy;
  if (frecuencia === "mensual") return hoy.slice(0, 7);
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(hoy, -((dow + 6) % 7));
}

/** Id del documento de un casillero: marcarlo dos veces es escribir el mismo documento. */
export const idCheck = (paso: PasoId, periodo: string): string => `${paso}__${periodo}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «2026-10» → «octubre». */
export const nombreMes = (mes: string): string => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Los pasos de fin de mes se ven desde el día 25 y siguen a la vista hasta el 5 del mes siguiente (ya del mes que terminó). */
function ventanaMensual(hoy: string): { periodo: string; etiqueta: string } | null {
  const dia = Number(hoy.slice(8, 10));
  if (dia >= 25) return { periodo: hoy.slice(0, 7), etiqueta: "Fin de mes" };
  if (dia <= 5) return { periodo: sumarMeses(hoy.slice(0, 7), -1), etiqueta: "Del mes pasado" };
  return null;
}

/* ─── Lo que la rutina necesita saber de la clínica ───────────────────────── */

export interface DatosRutinaAdmin {
  /** Hoy, en hora local (YYYY-MM-DD). */
  hoy: string;
  tieneCaja: boolean;
  tieneLiquidaciones: boolean;
  /** Cómo se escribe un monto (la pantalla pasa `fmtGs`). */
  dinero: (n: number) => string;
  patients: readonly Patient[];
  budgets: readonly Budget[];
  payments: readonly Payment[];
  expenses: readonly Expense[];
  cashSessions: readonly CashSession[];
  billing: readonly Pick<BillingRecord, "flags">[];
  appointments: readonly Pick<Appointment, "start" | "status" | "amount" | "discount">[];
  settlements: readonly Pick<Settlement, "professionalId" | "periodTo">[];
  profesionales: readonly Pick<User, "id" | "role" | "name">[];
  checks: readonly Pick<RutinaCheck, "id" | "hechoPorNombre" | "hechoEn">[];
}

/** Lo de la clínica sin los casilleros tildados: es lo que cuesta calcular (recorre a los pacientes). */
export type DatosVivos = Omit<DatosRutinaAdmin, "checks">;

export interface PasoRutina {
  id: PasoId;
  frecuencia: Frecuencia;
  titulo: string;
  href: string;
  /** El período que se tilda: el día, el lunes de la semana o el mes. */
  periodo: string;
  hecho: boolean;
  hechoPor?: string;
  hechoEn?: string;
  /** El dato en vivo, ya escrito. */
  detalle: string;
  /** El dato pide mirar algo (caja abierta, diferencia en el arqueo, cheques vencidos, deuda vieja, retenciones). */
  atencion: boolean;
  /** «Fin de mes» / «Del mes pasado» (solo los mensuales). */
  etiqueta?: string;
}

/* ─── El dato en vivo de cada paso ───────────────────────────────────────── */

interface Dato { detalle: string; atencion: boolean }

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const hora = (iso: string) => {
  const t = new Date(iso);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
};
/** «2026-10-05» → «05 oct». */
const corta = (fecha: string) => `${fecha.slice(8, 10)} ${nombreMes(fecha.slice(0, 7)).slice(0, 3)}`;
const suma = <T,>(xs: readonly T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

function datoCaja(d: DatosVivos): Dato {
  const abiertas = d.cashSessions.filter((s) => s.status === "abierta");
  if (abiertas.length > 1) return { detalle: `${abiertas.length} cajas abiertas`, atencion: true };
  if (abiertas.length === 1) {
    const s = abiertas[0];
    const dia = diaDe(s.openedAt);
    return { detalle: `Abierta por ${s.userName} desde ${dia === d.hoy ? `las ${hora(s.openedAt)}` : `el ${corta(dia)}`}`, atencion: true };
  }
  const cerradas = d.cashSessions.filter((s) => s.closedAt).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  if (cerradas.length === 0) return { detalle: "Todavía no se abrió ninguna caja", atencion: false };
  const s = cerradas[0];
  const cerro = s.closedAt as string;
  const dia = diaDe(cerro);
  const cuando = dia === d.hoy ? "hoy" : dia === sumarDias(d.hoy, -1) ? "ayer" : `el ${corta(dia)}`;
  let arqueo: string;
  let atencion = false;
  if (s.countedCash === undefined) {
    arqueo = "sin arqueo cargado";
    atencion = true;
  } else {
    const dif = s.countedCash - totalesSesion(s, [...d.payments], [...d.expenses]).expectedCash;
    arqueo = dif === 0 ? "arqueo sin diferencia" : dif > 0 ? `sobran ${d.dinero(dif)}` : `faltan ${d.dinero(-dif)}`;
    atencion = dif !== 0;
  }
  return { detalle: `Cerró ${s.userName} ${cuando} a las ${hora(cerro)} · ${arqueo}`, atencion };
}

function datoCobrado(d: DatosVivos): Dato {
  const r = recaudacionDiaria(d.payments, d.expenses, d.hoy);
  if (r.pagos.length === 0) return { detalle: "Hoy todavía no se cobró nada", atencion: false };
  return { detalle: `${d.dinero(r.cobrado)} en ${r.pagos.length} ${plural(r.pagos.length, "pago", "pagos")}`, atencion: false };
}

function datoDeudores(d: DatosVivos): Dato {
  const filas = morososPorAntiguedad(d.patients, d.budgets, d.payments, d.hoy);
  if (filas.length === 0) return { detalle: "Nadie debe", atencion: false };
  const viejos = filas.filter((f) => f.mas60 > 0).length;
  const base = `${filas.length} ${plural(filas.length, "paciente debe", "pacientes deben")} ${d.dinero(suma(filas, (f) => f.deuda))}`;
  return { detalle: viejos > 0 ? `${base} · ${viejos} con más de 60 días` : base, atencion: viejos > 0 };
}

/** Una prestación es un implante si su código es de la serie D60–D61 (ADA) o lo dice su nombre. */
const esImplante = (i: Pick<BudgetItem, "cpt" | "description">) => /^D6[01]/i.test(i.cpt) || /implante/i.test(i.description);

/** Lo que falta pagar de los implantes ya realizados. Los pagos del paciente cubren primero lo más viejo (como en
 *  `morososPorAntiguedad`), así que lo impago de un implante es lo que queda después de cubrir lo anterior. */
export function deudaDeImplantes(patients: readonly Patient[], budgets: readonly Budget[], payments: readonly Payment[]): { pacientes: number; total: number } {
  const hechasDe = new Map<string, ReturnType<typeof realizadas>>();
  for (const x of realizadas(budgets)) hechasDe.set(x.budget.patientId, [...(hechasDe.get(x.budget.patientId) ?? []), x]);
  const pagadoPor = new Map<string, number>();
  for (const x of payments) if (!x.voidedAt) pagadoPor.set(x.patientId, (pagadoPor.get(x.patientId) ?? 0) + x.amount);
  let pacientes = 0;
  let total = 0;
  for (const p of patients) {
    const hechas = (hechasDe.get(p.id) ?? []).sort((a, b) => a.dia.localeCompare(b.dia));
    if (hechas.length === 0) continue;
    let pagado = pagadoPor.get(p.id) ?? 0;
    let deuda = 0;
    for (const x of hechas) {
      const cubierto = Math.min(pagado, x.monto);
      pagado -= cubierto;
      if (esImplante(x.item)) deuda += x.monto - cubierto;
    }
    if (deuda > 0) { pacientes += 1; total += deuda; }
  }
  return { pacientes, total };
}

function datoImplantes(d: DatosVivos): Dato {
  const r = deudaDeImplantes(d.patients, d.budgets, d.payments);
  if (r.pacientes === 0) return { detalle: "Nadie debe implantes", atencion: false };
  return { detalle: `${r.pacientes} ${plural(r.pacientes, "paciente debe", "pacientes deben")} ${d.dinero(r.total)} de implantes`, atencion: false };
}

function datoRetenciones(d: DatosVivos): Dato {
  const n = d.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length;
  if (n === 0) return { detalle: "Sin reclamos en retención", atencion: false };
  return { detalle: `${n} ${plural(n, "reclamo", "reclamos")} en retención`, atencion: true };
}

function datoCheques(d: DatosVivos): Dato {
  const pendientes = d.payments.filter((p) => p.method === "cheque" && p.check && checkStatus(p) === "pendiente");
  if (pendientes.length === 0) return { detalle: "No hay cheques por cobrar", atencion: false };
  const listos = pendientes.filter((p) => (p.check?.cashDate ?? "") <= d.hoy);
  const futuros = pendientes.filter((p) => (p.check?.cashDate ?? "") > d.hoy);
  if (listos.length > 0) {
    const base = `${listos.length} ${plural(listos.length, "cheque listo", "cheques listos")} para cobrar (${d.dinero(suma(listos, (p) => p.amount))})`;
    return { detalle: futuros.length > 0 ? `${base} · ${futuros.length} a futuro` : base, atencion: true };
  }
  const proximo = futuros.map((p) => p.check?.cashDate ?? "").sort()[0];
  return { detalle: `${futuros.length} a futuro · el próximo se cobra el ${corta(proximo)}`, atencion: false };
}

function datoDesempeno(d: DatosVivos): Dato {
  const lunes = sumarDias(periodoDe("semanal", d.hoy), -7);
  const domingo = sumarDias(lunes, 6);
  const citas = d.appointments.filter((a) => a.status !== "cancelada" && diaDe(a.start) >= lunes && diaDe(a.start) <= domingo);
  if (citas.length === 0) return { detalle: "Sin citas la semana pasada", atencion: false };
  return { detalle: `Semana pasada: ${citas.length} ${plural(citas.length, "cita", "citas")} · producción ${d.dinero(suma(citas, (a) => a.amount - a.discount))}`, atencion: false };
}

function datoLiquidar(d: DatosVivos, mes: string): Dato {
  const profs = d.profesionales.filter((u) => u.role === "dentist");
  if (profs.length === 0) return { detalle: "No hay profesionales para liquidar", atencion: false };
  const hechos = profs.filter((u) => d.settlements.some((s) => s.professionalId === u.id && s.periodTo.slice(0, 7) === mes)).length;
  return { detalle: `${hechos} de ${profs.length} ${plural(profs.length, "profesional liquidado", "profesionales liquidados")} en ${nombreMes(mes)}`, atencion: false };
}

function datoGastos(d: DatosVivos, mes: string): Dato {
  const delMes = d.expenses.filter((e) => diaLocal(e.date).slice(0, 7) === mes);
  if (delMes.length === 0) return { detalle: `Todavía no cargaste gastos de ${nombreMes(mes)}`, atencion: false };
  return { detalle: `${delMes.length} ${plural(delMes.length, "gasto cargado", "gastos cargados")} en ${nombreMes(mes)} · ${d.dinero(suma(delMes, (e) => e.amount))}`, atencion: false };
}

const DATO: Record<PasoId, (d: DatosVivos, periodo: string) => Dato> = {
  caja: (d) => datoCaja(d),
  cobrado: (d) => datoCobrado(d),
  deudores: (d) => datoDeudores(d),
  implantes: (d) => datoImplantes(d),
  retenciones: (d) => datoRetenciones(d),
  cheques: (d) => datoCheques(d),
  desempeno: (d) => datoDesempeno(d),
  liquidar: (d, mes) => datoLiquidar(d, mes),
  gastos: (d, mes) => datoGastos(d, mes),
};

/* ─── Lo que le toca hoy ─────────────────────────────────────────────────── */

const existe = (def: DefPaso, d: Pick<DatosRutinaAdmin, "tieneCaja" | "tieneLiquidaciones">) =>
  !(def.requiere === "caja" && !d.tieneCaja) && !(def.requiere === "liquidaciones" && !d.tieneLiquidaciones);

/** El paso de hoy, con su dato en vivo y todavía sin saber si está tildado. */
export type DetallePaso = Omit<PasoRutina, "hecho" | "hechoPor" | "hechoEn">;

/** Los pasos de hoy con su dato en vivo: los de todos los días, el de la semana y, a fin de mes, los del mes. Es lo caro
 *  (recorre a los pacientes): se calcula aparte de los casilleros para que tildar uno no lo repita. */
export function detallesDeHoy(d: DatosVivos): DetallePaso[] {
  const mensual = ventanaMensual(d.hoy);
  const out: DetallePaso[] = [];
  for (const def of PASOS_RUTINA) {
    if (!existe(def, d)) continue;
    if (def.frecuencia === "mensual" && !mensual) continue;
    const periodo = def.frecuencia === "mensual" && mensual ? mensual.periodo : periodoDe(def.frecuencia, d.hoy);
    out.push({
      id: def.id, frecuencia: def.frecuencia, titulo: def.titulo, href: def.href, periodo,
      ...DATO[def.id](d, periodo),
      ...(def.frecuencia === "mensual" && mensual ? { etiqueta: mensual.etiqueta } : {}),
    });
  }
  return out;
}

/** Les pone a los pasos su casillero: quién lo tildó y cuándo, si es que está tildado. */
export function conMarcas(detalles: readonly DetallePaso[], checks: readonly Pick<RutinaCheck, "id" | "hechoPorNombre" | "hechoEn">[]): PasoRutina[] {
  const marcas = new Map(checks.map((c) => [c.id, c]));
  return detalles.map((p) => {
    const marca = marcas.get(idCheck(p.id, p.periodo));
    return { ...p, hecho: Boolean(marca), ...(marca ? { hechoPor: marca.hechoPorNombre, hechoEn: marca.hechoEn } : {}) };
  });
}

/** Lo que le toca hoy al administrador, con sus casilleros. */
export function pasosDeHoy(d: DatosRutinaAdmin): PasoRutina[] {
  return conMarcas(detallesDeHoy(d), d.checks);
}

/* ─── La semana ──────────────────────────────────────────────────────────── */

export interface DiaSemana { fecha: string; etiqueta: string; esHoy: boolean; futuro: boolean }
/** «antes»: un día anterior a que se empezara a usar la rutina (no cuenta como faltante). */
export type Celda = "hecho" | "falta" | "futuro" | "antes";
export interface FilaDiaria { id: PasoId; titulo: string; celdas: Celda[] }
export interface SemanaRutina {
  dias: DiaSemana[];
  /** Los pasos de todos los días, con qué pasó cada día de la semana. */
  diarias: FilaDiaria[];
  /** Los de la semana y los de fin de mes que están a la vista. */
  periodicas: PasoRutina[];
  hechas: number;
  faltan: number;
}

const ETIQUETA_DIA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** El primer día en que se usó la rutina: el más viejo entre los días tildados de los pasos diarios y el día en que se
 *  tildó cualquier otro. Sin nada tildado, hoy. Los días anteriores no se cuentan como faltantes: la primera semana de uso
 *  no puede arrancar con una montaña de «faltan» de días en que la rutina no se usaba. */
function inicioDeUso(d: Pick<DatosRutinaAdmin, "hoy" | "checks">): string {
  let desde = d.hoy;
  for (const c of d.checks) {
    const [paso, periodo = ""] = c.id.split("__");
    const diaria = PASOS_RUTINA.find((x) => x.id === paso)?.frecuencia === "diaria" && /^\d{4}-\d{2}-\d{2}$/.test(periodo);
    const dia = diaria ? periodo : diaDe(c.hechoEn);
    if (dia < desde) desde = dia;
  }
  return desde;
}

/** «Esta semana: N hechas · M faltan». Cada día que ya llegó (hoy incluido) cuenta todos sus pasos diarios, desde que se
 *  empezó a usar la rutina; los de la semana y los de fin de mes cuentan una vez. Lo de los días que todavía no llegaron no cuenta. */
export function semanaDeRutina(d: DatosRutinaAdmin, detalles: readonly DetallePaso[] = detallesDeHoy(d)): SemanaRutina {
  const lunes = periodoDe("semanal", d.hoy);
  const desde = inicioDeUso(d);
  const marcadas = new Set(d.checks.map((c) => c.id));
  const dias: DiaSemana[] = ETIQUETA_DIA.map((etiqueta, i) => {
    const fecha = sumarDias(lunes, i);
    return { fecha, etiqueta, esHoy: fecha === d.hoy, futuro: fecha > d.hoy };
  });
  const diarias: FilaDiaria[] = PASOS_RUTINA.filter((def) => def.frecuencia === "diaria" && existe(def, d)).map((def) => ({
    id: def.id,
    titulo: def.titulo,
    celdas: dias.map((x): Celda => (x.futuro ? "futuro" : marcadas.has(idCheck(def.id, x.fecha)) ? "hecho" : x.fecha < desde ? "antes" : "falta")),
  }));
  const periodicas = conMarcas(detalles, d.checks).filter((p) => p.frecuencia !== "diaria");
  const celdas = diarias.flatMap((f) => f.celdas);
  return {
    dias, diarias, periodicas,
    hechas: celdas.filter((c) => c === "hecho").length + periodicas.filter((p) => p.hecho).length,
    faltan: celdas.filter((c) => c === "falta").length + periodicas.filter((p) => !p.hecho).length,
  };
}

/* ─── Puesta en marcha ───────────────────────────────────────────────────── */

export interface PasoMarcha {
  key: "usersCreated" | "servicesDefined" | "tourDone";
  label: string;
  href: string;
  hecho: boolean;
  /** Quedó hecho porque la clínica ya tiene lo que el paso pide, sin que nadie lo tildara. */
  sola: boolean;
}

/** Los pasos para dejar la clínica lista. Se marcan solos cuando ya hay otra persona en el equipo y cuando ya hay
 *  prestaciones cargadas; lo que se tildó a mano sigue valiendo. El recorrido solo se marca a mano. */
export function pasosPuestaEnMarcha(o: {
  onboarding: { usersCreated: boolean; servicesDefined: boolean; tourDone: boolean };
  usuarios: number;
  prestaciones: number;
}): PasoMarcha[] {
  const paso = (key: PasoMarcha["key"], label: string, href: string, derivado: boolean): PasoMarcha => ({
    key, label, href, hecho: o.onboarding[key] || derivado, sola: !o.onboarding[key] && derivado,
  });
  return [
    paso("usersCreated", "Crear usuarios del equipo", "/app/configuracion", o.usuarios > 1),
    paso("servicesDefined", "Definir servicios y aranceles", "/app/configuracion", o.prestaciones > 0),
    paso("tourDone", "Recorrer la Agenda y el Buscador", "/app/agenda", false),
  ];
}
