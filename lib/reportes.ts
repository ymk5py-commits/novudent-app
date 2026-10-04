import type { Appointment, Budget, BudgetItem, Expense, Patient, Payment, Procedure, User } from "./types";
import { fechaLocal, parseFecha } from "./tareas";
import { CATEGORY_LABEL, procedureCategory } from "./categorias";
import { cuotasDe } from "./financiamiento";
import { budgetTotal } from "./budgets";
import { porMedio } from "./caja";

/* Reportes gráficos (paridad Dentalink: «Reportes gráficos», cada uno con su explicación,
 * gráfico y tabla). Todo puro: la pantalla elige el reporte y el rango, y muestra esto.
 * Los meses se cuentan en la hora local de la clínica (un pago del 31 a las 22 h en
 * Paraguay es del 31, no del 1 del mes siguiente). */

export type Mes = string; // YYYY-MM
export interface RangoMeses { desde: Mes; hasta: Mes }

export const diaLocal = (iso: string): string => fechaLocal(parseFecha(iso));
export const mesLocal = (iso: string): Mes => diaLocal(iso).slice(0, 7);

export function sumarMeses(mes: Mes, n: number): Mes {
  const [y, m] = mes.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Meses del rango, inclusive. Tope de 10 años para que un rango mal cargado no cuelgue. */
export function mesesEntre(desde: Mes, hasta: Mes): Mes[] {
  const out: Mes[] = [];
  for (let m = desde; m <= hasta && out.length < 120; m = sumarMeses(m, 1)) out.push(m);
  return out;
}

/** Como Dentalink: el mes actual y los 12 anteriores, así siempre se ve el mismo mes del año pasado. */
export function rangoPorDefecto(hoy: string): RangoMeses {
  const h = hoy.slice(0, 7);
  return { desde: sumarMeses(h, -12), hasta: h };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const etiquetaMes = (mes: Mes): string => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(2, 4)}`;

const enRango = (mes: Mes, r: RangoMeses) => mes >= r.desde && mes <= r.hasta;
const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/* ===== Prestaciones realizadas: la base de «ventas» ===== */

export interface Realizada { budget: Budget; item: BudgetItem; dia: string; monto: number }

/** Prestaciones realizadas de los planes no anulados, con su día (el de realización, o el del
 *  plan si no quedó registrado) y su monto con el descuento del plan, como el «Realizado». */
export function realizadas(budgets: readonly Budget[]): Realizada[] {
  return budgets
    .filter((b) => b.status !== "anulado")
    .flatMap((b) => b.items
      .filter((i) => i.status === "realizado")
      .map((item) => ({ budget: b, item, dia: diaLocal(item.doneAt ?? b.createdAt), monto: Math.round(item.price * (1 - (b.discountPct ?? 0) / 100)) })));
}

/* ===== 1. Resultados ===== */

/** «realizado» = devengado (lo hecho y los gastos por fecha de factura);
 *  «cobrado» = percibido (lo cobrado y los gastos por fecha de pago). */
export type BaseResultados = "realizado" | "cobrado";
export interface FilaResultado { mes: Mes; ventas: number; costos: number; ganancia: number; pctSobreCostos: number | null }

export function resultados(d: { budgets: readonly Budget[]; payments: readonly Payment[]; expenses: readonly Expense[] }, r: RangoMeses, base: BaseResultados): FilaResultado[] {
  const ventas = new Map<Mes, number>();
  const costos = new Map<Mes, number>();
  if (base === "realizado") for (const x of realizadas(d.budgets)) sumar(ventas, x.dia.slice(0, 7), x.monto);
  else for (const p of d.payments) if (!p.voidedAt) sumar(ventas, mesLocal(p.date), p.amount);
  for (const e of d.expenses) {
    // Un gasto viejo sin fechas de factura ni de pago cuenta por su fecha de carga.
    const sinFechas = !e.invoiceDate && !e.payDate;
    const fecha = base === "realizado" ? e.invoiceDate ?? e.date : sinFechas ? e.date : e.payDate;
    if (fecha) sumar(costos, mesLocal(fecha), e.amount); // percibido: un gasto sin pagar todavía no salió
  }
  return mesesEntre(r.desde, r.hasta).map((mes) => {
    const v = ventas.get(mes) ?? 0;
    const c = costos.get(mes) ?? 0;
    return { mes, ventas: v, costos: c, ganancia: v - c, pctSobreCostos: c > 0 ? Math.round(((v - c) / c) * 100) : null };
  });
}

/* ===== 2 y 3. Ventas por prestación y por categoría ===== */

export interface FilaVenta { clave: string; nombre: string; cantidad: number; total: number; pct: number }

function agrupar(items: Realizada[], clave: (x: Realizada) => { clave: string; nombre: string }): FilaVenta[] {
  const m = new Map<string, FilaVenta>();
  for (const x of items) {
    const k = clave(x);
    const f = m.get(k.clave) ?? { ...k, cantidad: 0, total: 0, pct: 0 };
    f.cantidad += 1;
    f.total += x.monto;
    m.set(k.clave, f);
  }
  const total = [...m.values()].reduce((a, f) => a + f.total, 0);
  return [...m.values()]
    .map((f) => ({ ...f, pct: total > 0 ? Math.round((f.total / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad);
}

const realizadasEn = (budgets: readonly Budget[], r: RangoMeses) => realizadas(budgets).filter((x) => enRango(x.dia.slice(0, 7), r));

export function ventasPorPrestacion(budgets: readonly Budget[], procedures: readonly Procedure[], r: RangoMeses): FilaVenta[] {
  return agrupar(realizadasEn(budgets, r), (x) => {
    const clave = x.item.cpt || x.item.description;
    return { clave, nombre: procedures.find((p) => p.cpt === x.item.cpt)?.description ?? x.item.description };
  });
}

export function ventasPorCategoria(budgets: readonly Budget[], procedures: readonly Procedure[], r: RangoMeses): FilaVenta[] {
  return agrupar(realizadasEn(budgets, r), (x) => {
    const c = procedureCategory(x.item.cpt, procedures as Procedure[]);
    return { clave: c, nombre: CATEGORY_LABEL[c] };
  });
}

/* ===== 4. Eficiencia por profesional ===== */

export interface FilaProfesional { id: string; nombre: string; ventas: number; horas: number; ventasPorHora: number | null; presupuestado: number }

/** La métrica que importa es ventas por hora de sillón: compara a un ortodoncista con un
 *  odontopediatra sin que la venta bruta lo distorsione. Horas = citas atendidas. */
export function eficienciaProfesional(d: { users: readonly User[]; budgets: readonly Budget[]; appointments: readonly Appointment[] }, r: RangoMeses): FilaProfesional[] {
  const hechas = realizadasEn(d.budgets, r);
  return d.users
    .filter((u) => u.role === "dentist")
    .map((u) => {
      const ventas = hechas.filter((x) => x.budget.dentistId === u.id).reduce((a, x) => a + x.monto, 0);
      const ms = d.appointments
        .filter((a) => a.dentistId === u.id && a.status === "completada" && enRango(mesLocal(a.start), r))
        .reduce((acc, a) => acc + Math.max(0, Date.parse(a.end) - Date.parse(a.start)), 0);
      const horas = Math.round((ms / 3_600_000) * 10) / 10;
      const presupuestado = d.budgets
        .filter((b) => b.dentistId === u.id && b.status !== "borrador" && b.status !== "anulado" && enRango(mesLocal(b.createdAt), r))
        .reduce((a, b) => a + budgetTotal(b), 0);
      return { id: u.id, nombre: u.name, ventas, horas, ventasPorHora: horas > 0 ? Math.round(ventas / horas) : null, presupuestado };
    })
    .sort((a, b) => b.ventas - a.ventas);
}

/* ===== 5. Recaudación diaria ===== */

export function recaudacionDiaria(payments: readonly Payment[], expenses: readonly Expense[], dia: string) {
  const pagos = payments.filter((p) => !p.voidedAt && diaLocal(p.date) === dia).sort((a, b) => a.date.localeCompare(b.date));
  const gastos = expenses.filter((e) => diaLocal(e.payDate ?? e.date) === dia);
  const cobrado = pagos.reduce((a, p) => a + p.amount, 0);
  const gastado = gastos.reduce((a, e) => a + e.amount, 0);
  return { pagos, gastos, cobrado, gastado, neto: cobrado - gastado, porMedio: porMedio(pagos) };
}

/* ===== 6. Estado de financiamientos (mira hacia adelante) ===== */

export interface PlanFinanciado { budget: Budget; pendiente: number; vencido: number; proxima?: { numero: number; dueDate: string; saldo: number } }

export function estadoFinanciamientos(budgets: readonly Budget[], payments: Payment[], hoy: string, meses = 16) {
  const desde = hoy.slice(0, 7);
  const ventana = mesesEntre(desde, sumarMeses(desde, meses - 1));
  const porMes = new Map<Mes, { cuotas: number; monto: number }>(ventana.map((m) => [m, { cuotas: 0, monto: 0 }]));
  let vencido = 0;
  let cuotasVencidas = 0;
  const planes: PlanFinanciado[] = [];
  for (const b of budgets) {
    if (b.status === "anulado" || !(b.schedule?.length)) continue;
    const pendientes = cuotasDe(b, payments).filter((c) => c.saldo > 0);
    if (pendientes.length === 0) continue;
    let pv = 0;
    for (const c of pendientes) {
      const due = c.dueDate.slice(0, 10);
      if (due < hoy) { pv += c.saldo; cuotasVencidas += 1; continue; }
      const f = porMes.get(due.slice(0, 7));
      if (f) { f.cuotas += 1; f.monto += c.saldo; }
    }
    vencido += pv;
    const prox = pendientes.find((c) => c.dueDate.slice(0, 10) >= hoy);
    planes.push({
      budget: b,
      pendiente: pendientes.reduce((a, c) => a + c.saldo, 0),
      vencido: pv,
      ...(prox ? { proxima: { numero: prox.numero, dueDate: prox.dueDate.slice(0, 10), saldo: prox.saldo } } : {}),
    });
  }
  planes.sort((a, b) => b.vencido - a.vencido || b.pendiente - a.pendiente);
  return { vencido, cuotasVencidas, porMes: ventana.map((mes) => ({ mes, ...porMes.get(mes)! })), planes };
}

/* ===== 7. Derivación de pacientes ===== */

export interface FilaOrigen { origen: string; pacientes: number; pct: number }

/** De dónde vienen los pacientes nuevos del rango: el campo «Cómo nos conoció» de los que
 *  tuvieron su primera cita (no anulada) en esos meses. Sin el dato, «Sin dato». */
export function derivacion(patients: readonly Patient[], appointments: readonly Appointment[], r: RangoMeses): FilaOrigen[] {
  const primera = new Map<string, string>();
  for (const a of appointments) {
    if (a.status === "cancelada") continue;
    const prev = primera.get(a.patientId);
    if (!prev || a.start < prev) primera.set(a.patientId, a.start);
  }
  const m = new Map<string, FilaOrigen>();
  for (const p of patients) {
    const inicio = primera.get(p.id);
    if (!inicio || !enRango(mesLocal(inicio), r)) continue;
    const texto = (p.referencia ?? "").trim();
    const clave = texto.toLowerCase() || "—";
    const f = m.get(clave) ?? { origen: texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Sin dato", pacientes: 0, pct: 0 };
    f.pacientes += 1;
    m.set(clave, f);
  }
  const total = [...m.values()].reduce((a, f) => a + f.pacientes, 0);
  return [...m.values()].map((f) => ({ ...f, pct: total > 0 ? Math.round((f.pacientes / total) * 1000) / 10 : 0 })).sort((a, b) => b.pacientes - a.pacientes);
}

/* ===== 8. Pacientes morosos por antigüedad ===== */

export interface FilaMoroso { patient: Patient; deuda: number; hasta30: number; de30a60: number; mas60: number; diasMora: number }

/** Deuda = trabajo realizado que todavía no se pagó. Los pagos del paciente cubren primero
 *  lo más viejo; lo que queda impago se reparte por antigüedad (30, 60 días) contando desde
 *  el día en que se hizo la prestación. Es un aging de cuentas por cobrar clásico. */
export function morososPorAntiguedad(patients: readonly Patient[], budgets: readonly Budget[], payments: readonly Payment[], hoy: string): FilaMoroso[] {
  const filas: FilaMoroso[] = [];
  for (const p of patients) {
    const hechas = realizadas(budgets.filter((b) => b.patientId === p.id)).sort((a, b) => a.dia.localeCompare(b.dia));
    if (hechas.length === 0) continue;
    let pagado = payments.filter((x) => x.patientId === p.id && !x.voidedAt).reduce((a, x) => a + x.amount, 0);
    const f: FilaMoroso = { patient: p, deuda: 0, hasta30: 0, de30a60: 0, mas60: 0, diasMora: 0 };
    for (const x of hechas) {
      const cubierto = Math.min(pagado, x.monto);
      pagado -= cubierto;
      const impago = x.monto - cubierto;
      if (impago <= 0) continue;
      const dias = Math.max(0, diasEntre(x.dia, hoy));
      f.deuda += impago;
      f.diasMora = Math.max(f.diasMora, dias);
      if (dias <= 30) f.hasta30 += impago; else if (dias <= 60) f.de30a60 += impago; else f.mas60 += impago;
    }
    if (f.deuda > 0) filas.push(f);
  }
  return filas.sort((a, b) => b.diasMora - a.diasMora || b.deuda - a.deuda);
}
