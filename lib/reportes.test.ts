import { describe, it, expect } from "vitest";
import {
  derivacion, eficienciaProfesional, estadoFinanciamientos, etiquetaMes, mesesEntre, morososPorAntiguedad, rangoPorDefecto,
  recaudacionDiaria, resultados, sumarMeses, ventasPorCategoria, ventasPorPrestacion,
} from "./reportes";
import type { Appointment, Budget, Expense, Patient, Payment, Procedure, User } from "./types";

// Instantes a media tarde UTC: caen el mismo día en cualquier huso de UTC−12 a UTC+8.
const T = (dia: string, hora = "15:00") => `${dia}T${hora}:00.000Z`;

const budget = (id: string, patientId: string, dentistId: string, extra: Partial<Budget>): Budget =>
  ({ id, clinicId: "c", patientId, dentistId, createdAt: T("2026-08-01"), status: "aceptado", items: [], history: [], ...extra });
const B1 = budget("b1", "p1", "u2", {
  discountPct: 10,
  items: [
    { id: "i1", cpt: "D2330", description: "Resina 1 sup.", price: 1000, status: "realizado", doneAt: T("2026-09-10") },
    { id: "i2", cpt: "D1110", description: "Limpieza", price: 500, status: "realizado", doneAt: T("2026-08-05") },
    { id: "i3", cpt: "D2330", description: "Resina 1 sup.", price: 300, status: "pendiente" },
  ],
});
const B2 = budget("b2", "p1", "u4", { status: "anulado", items: [{ id: "x", cpt: "D2330", description: "x", price: 9999, status: "realizado", doneAt: T("2026-09-10") }] });
const B3 = budget("b3", "p3", "u4", { createdAt: T("2026-09-18"), items: [{ id: "i4", cpt: "D7140", description: "Exodoncia simple", price: 2000, status: "realizado", doneAt: T("2026-09-20") }] });
const B6 = budget("b6", "p6", "u2", { items: [{ id: "i6", cpt: "D1110", description: "Limpieza", price: 300, status: "realizado", doneAt: T("2026-07-01") }] });
const budgets = [B1, B2, B3, B6];

const procedures = [
  { cpt: "D2330", description: "Resina compuesta", price: 1000, defaultDx: [], category: "operatoria" },
  { cpt: "D1110", description: "Profilaxis", price: 500, defaultDx: [], category: "prevencion" },
] as Procedure[];

const pago = (id: string, patientId: string, budgetId: string | undefined, amount: number, date: string, extra: Partial<Payment> = {}): Payment =>
  ({ id, clinicId: "c", patientId, ...(budgetId ? { budgetId } : {}), date, amount, method: "efectivo", concept: "x", receivedBy: "Ana", ...extra });
const payments = [
  pago("p1", "p1", "b1", 800, T("2026-09-12")),
  pago("p2", "p1", "b1", 5000, T("2026-09-12"), { voidedAt: T("2026-09-13") }),
  pago("p3", "p3", "b3", 500, T("2026-09-20", "18:00"), { method: "tarjeta" }),
];

const gasto = (id: string, amount: number, extra: Partial<Expense>): Expense =>
  ({ id, clinicId: "c", date: T("2026-09-01"), category: "Insumos", description: "x", amount, registeredBy: "Ana", ...extra });
const expenses = [
  gasto("e1", 300, { invoiceDate: "2026-09-01", payDate: "2026-10-02" }),
  gasto("e2", 100, { date: T("2026-09-15") }), // viejo, sin fechas de factura ni pago
  gasto("e3", 50, { invoiceDate: "2026-09-05" }), // facturado, todavía sin pagar
];

const rango = { desde: "2026-08", hasta: "2026-09" };

describe("meses", () => {
  it("suma meses cruzando el año, arma el rango y la etiqueta", () => {
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(sumarMeses("2026-10", 3)).toBe("2027-01");
    expect(rangoPorDefecto("2026-10-04")).toEqual({ desde: "2025-10", hasta: "2026-10" });
    expect(mesesEntre("2025-10", "2026-10")).toHaveLength(13);
    expect(mesesEntre("2026-10", "2026-01")).toEqual([]);
    expect(etiquetaMes("2026-10")).toBe("oct 26");
  });
});

describe("resultados", () => {
  it("devengado: lo realizado (sin planes anulados) contra los gastos por fecha de factura", () => {
    const [ago, sep] = resultados({ budgets, payments, expenses }, rango, "realizado");
    expect(ago).toEqual({ mes: "2026-08", ventas: 450, costos: 0, ganancia: 450, pctSobreCostos: null });
    expect(sep).toEqual({ mes: "2026-09", ventas: 2900, costos: 450, ganancia: 2450, pctSobreCostos: 544 });
  });
  it("percibido: lo cobrado (sin anulados) contra los gastos ya pagados", () => {
    const [, sep, oct] = resultados({ budgets, payments, expenses }, { desde: "2026-08", hasta: "2026-10" }, "cobrado");
    expect(sep).toMatchObject({ ventas: 1300, costos: 100 });
    expect(oct).toMatchObject({ ventas: 0, costos: 300, ganancia: -300, pctSobreCostos: -100 });
  });
});

describe("ventas por prestación y por categoría", () => {
  it("rankea lo realizado en el rango, con el nombre del arancel y el porcentaje", () => {
    expect(ventasPorPrestacion(budgets, procedures, rango)).toEqual([
      { clave: "D7140", nombre: "Exodoncia simple", cantidad: 1, total: 2000, pct: 59.7 },
      { clave: "D2330", nombre: "Resina compuesta", cantidad: 1, total: 900, pct: 26.9 },
      { clave: "D1110", nombre: "Profilaxis", cantidad: 1, total: 450, pct: 13.4 },
    ]);
  });
  it("agrupa por categoría; sin categoría en el arancel, por el rango del código", () => {
    expect(ventasPorCategoria(budgets, procedures, rango).map((f) => [f.nombre, f.total])).toEqual([["Cirugía", 2000], ["Operatoria", 900], ["Prevención e higiene", 450]]);
  });
});

describe("eficiencia por profesional", () => {
  const users = [
    { id: "u1", name: "Admin", role: "admin" },
    { id: "u2", name: "Dra. Sofía", role: "dentist" },
    { id: "u4", name: "Dr. Diego", role: "dentist" },
  ] as User[];
  const cita = (id: string, dentistId: string, start: string, end: string, status: Appointment["status"]) =>
    ({ id, clinicId: "c", patientId: "p1", dentistId, title: "x", start, end, status, amount: 0, discount: 0 }) as Appointment;
  const appointments = [
    cita("a1", "u2", T("2026-09-10", "13:00"), T("2026-09-10", "14:30"), "completada"),
    cita("a2", "u2", T("2026-09-11", "13:00"), T("2026-09-11", "15:00"), "pendiente"),
    cita("a3", "u4", T("2026-09-20", "13:00"), T("2026-09-20", "14:00"), "completada"),
  ];
  it("ventas, horas atendidas, ventas por hora y lo presupuestado en el rango", () => {
    expect(eficienciaProfesional({ users, budgets, appointments }, rango)).toEqual([
      { id: "u4", nombre: "Dr. Diego", ventas: 2000, horas: 1, ventasPorHora: 2000, presupuestado: 2000 },
      { id: "u2", nombre: "Dra. Sofía", ventas: 1350, horas: 1.5, ventasPorHora: 900, presupuestado: 1620 + 300 },
    ]);
  });
});

describe("recaudación diaria", () => {
  it("cobros vigentes del día por medio, y los gastos pagados ese día", () => {
    const r = recaudacionDiaria(payments, [...expenses, gasto("e4", 70, { payDate: "2026-09-12" })], "2026-09-12");
    expect(r.pagos.map((p) => p.id)).toEqual(["p1"]);
    expect(r.porMedio).toEqual([{ method: "efectivo", cantidad: 1, total: 800 }]);
    expect([r.cobrado, r.gastado, r.neto]).toEqual([800, 70, 730]);
  });
});

describe("estado de financiamientos", () => {
  const B4 = budget("b4", "p4", "u2", {
    items: [{ id: "i", cpt: "D8080", description: "Ortodoncia", price: 300, status: "pendiente" }],
    schedule: [{ numero: 1, dueDate: "2026-09-01", amount: 100 }, { numero: 2, dueDate: "2026-10-15", amount: 100 }, { numero: 3, dueDate: "2026-11-15", amount: 100 }],
  });
  it("separa lo vencido y proyecta las cuotas por mes hacia adelante", () => {
    const e = estadoFinanciamientos([B4], [pago("q", "p4", "b4", 50, T("2026-09-02"))], "2026-10-04", 3);
    expect([e.vencido, e.cuotasVencidas]).toEqual([50, 1]);
    expect(e.porMes).toEqual([{ mes: "2026-10", cuotas: 1, monto: 100 }, { mes: "2026-11", cuotas: 1, monto: 100 }, { mes: "2026-12", cuotas: 0, monto: 0 }]);
    expect(e.planes[0]).toMatchObject({ pendiente: 250, vencido: 50, proxima: { numero: 2, dueDate: "2026-10-15", saldo: 100 } });
  });
});

describe("derivación de pacientes", () => {
  const pac = (id: string, referencia?: string) => ({ id, firstName: id, lastName: "", ...(referencia !== undefined ? { referencia } : {}) }) as Patient;
  const cita = (patientId: string, start: string, status: Appointment["status"] = "completada") =>
    ({ id: `${patientId}${start}`, clinicId: "c", patientId, dentistId: "u2", title: "x", start, end: start, status, amount: 0, discount: 0 }) as Appointment;
  it("cuenta por «cómo nos conoció» a los que tuvieron su primera cita en el rango", () => {
    const patients = [pac("p1", "Instagram"), pac("p2", " instagram "), pac("p3"), pac("p4", "Google"), pac("p5", "Google")];
    const appointments = [
      cita("p1", T("2026-09-01")), cita("p2", T("2026-09-05")), cita("p3", T("2026-08-10")),
      cita("p4", T("2026-05-01")), cita("p4", T("2026-09-01")),
      cita("p5", T("2026-09-01"), "cancelada"),
    ];
    expect(derivacion(patients, appointments, rango)).toEqual([
      { origen: "Instagram", pacientes: 2, pct: 66.7 },
      { origen: "Sin dato", pacientes: 1, pct: 33.3 },
    ]);
  });
});

describe("morosos por antigüedad", () => {
  it("los pagos cubren primero lo más viejo; lo impago se reparte en tramos de 30 y 60 días", () => {
    const patients = [{ id: "p1" }, { id: "p3" }, { id: "p6" }, { id: "p9" }] as Patient[];
    const filas = morososPorAntiguedad(patients, budgets, payments, "2026-10-04");
    expect(filas.map((f) => [f.patient.id, f.deuda, f.hasta30, f.de30a60, f.mas60, f.diasMora])).toEqual([
      ["p6", 300, 0, 0, 300, 95],
      ["p1", 550, 550, 0, 0, 24],
      ["p3", 1500, 1500, 0, 0, 14],
    ]);
  });
});
