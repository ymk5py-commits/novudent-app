import { describe, it, expect } from "vitest";
import {
  periodoDe, idCheck, pasosDeHoy, detallesDeHoy, conMarcas, semanaDeRutina, deudaDeImplantes, pasosPuestaEnMarcha, nombreMes,
  type DatosRutinaAdmin, type PasoRutina,
} from "./rutinaAdmin";
import type { Budget, BudgetItem, CashSession, Expense, Patient, Payment } from "./types";

const HOY = "2026-10-07"; // miércoles
const dinero = (n: number) => `Gs ${n}`;

// Hora LOCAL del día pedido (es ese día en el huso de quien corra el test).
const iso = (dia: string, h = 12, m = 0) => {
  const [y, mo, d] = dia.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).toISOString();
};

const paciente = (id: string) => ({ id, firstName: "Luis", lastName: `Gómez ${id}` }) as unknown as Patient;
const pago = (o: Partial<Payment> & { id: string }): Payment =>
  ({ clinicId: "c1", patientId: "p1", date: iso(HOY), amount: 100_000, method: "efectivo", concept: "Pago", receivedBy: "u1", ...o }) as Payment;
const sesion = (o: Partial<CashSession> & { id: string }): CashSession =>
  ({ clinicId: "c1", userId: "u9", userName: "Ana", openedAt: iso(HOY, 8), openingBalance: 200_000, status: "abierta", ...o }) as CashSession;
const gasto = (o: Partial<Expense> & { id: string }): Expense =>
  ({ clinicId: "c1", date: iso(HOY), category: "Varios", description: "Gasto", amount: 50_000, registeredBy: "u1", ...o }) as Expense;
const item = (o: Partial<BudgetItem> & { id: string }): BudgetItem =>
  ({ cpt: "D2391", description: "Resina", price: 500_000, status: "realizado", doneAt: iso("2026-08-10"), ...o }) as BudgetItem;
const plan = (o: Partial<Budget> & { id: string; patientId: string }): Budget =>
  ({ clinicId: "c1", status: "aceptado", createdAt: iso("2026-08-01"), discountPct: 0, items: [], ...o }) as unknown as Budget;
const cheque = (o: Partial<Payment> & { id: string; cashDate: string; cobradoAt?: string }): Payment => {
  const { cashDate, cobradoAt, ...resto } = o;
  return pago({ ...resto, method: "cheque", check: { number: "1", bank: "Itaú", cashDate, ...(cobradoAt ? { cobradoAt } : {}) } });
};

const datos = (o: Partial<DatosRutinaAdmin> = {}): DatosRutinaAdmin => ({
  hoy: HOY, tieneCaja: true, tieneLiquidaciones: true, dinero,
  patients: [], budgets: [], payments: [], expenses: [], cashSessions: [], billing: [], appointments: [], settlements: [], profesionales: [], checks: [],
  ...o,
});
const paso = (d: DatosRutinaAdmin, id: string): PasoRutina => {
  const p = pasosDeHoy(d).find((x) => x.id === id);
  if (!p) throw new Error(`no hay paso «${id}»`);
  return p;
};
const marca = (id: string, extra: Partial<{ hechoPorNombre: string; hechoEn: string }> = {}) => ({ id, hechoPorNombre: "Carlos Admin", hechoEn: iso(HOY, 9), ...extra });

describe("periodoDe — cada cuánto se reinicia un casillero", () => {
  it("diaria: el día", () => {
    expect(periodoDe("diaria", HOY)).toBe("2026-10-07");
  });
  it("semanal: el lunes de la semana", () => {
    expect(periodoDe("semanal", "2026-10-07")).toBe("2026-10-05"); // miércoles
    expect(periodoDe("semanal", "2026-10-05")).toBe("2026-10-05"); // lunes
    expect(periodoDe("semanal", "2026-10-11")).toBe("2026-10-05"); // domingo
    expect(periodoDe("semanal", "2026-09-30")).toBe("2026-09-28"); // cruza el mes
  });
  it("mensual: el mes", () => {
    expect(periodoDe("mensual", "2026-10-07")).toBe("2026-10");
  });
});

describe("idCheck", () => {
  it("es determinístico: marcar dos veces el mismo casillero es el mismo documento", () => {
    expect(idCheck("caja", "2026-10-07")).toBe("caja__2026-10-07");
    expect(idCheck("desempeno", "2026-10-05")).toBe("desempeno__2026-10-05");
  });
});

describe("nombreMes", () => {
  it("el nombre del mes en minúscula", () => {
    expect(nombreMes("2026-10")).toBe("octubre");
    expect(nombreMes("2026-09")).toBe("septiembre");
  });
});

describe("pasosDeHoy — qué le toca al administrador", () => {
  it("un miércoles de mitad de mes: los seis de todos los días y el de la semana", () => {
    expect(pasosDeHoy(datos()).map((p) => p.id)).toEqual(["caja", "cobrado", "deudores", "implantes", "retenciones", "cheques", "desempeno"]);
  });
  it("cada paso lleva su frecuencia y el período que se tilda", () => {
    const ps = pasosDeHoy(datos());
    expect(ps.find((p) => p.id === "caja")).toMatchObject({ frecuencia: "diaria", periodo: "2026-10-07" });
    expect(ps.find((p) => p.id === "desempeno")).toMatchObject({ frecuencia: "semanal", periodo: "2026-10-05" });
  });
  it("sin el plan de caja no hay paso de caja", () => {
    expect(pasosDeHoy(datos({ tieneCaja: false })).map((p) => p.id)).not.toContain("caja");
  });
  it("a fin de mes (desde el 25) se suman liquidar y cargar gastos, de este mes", () => {
    const ps = pasosDeHoy(datos({ hoy: "2026-10-26" }));
    expect(ps.map((p) => p.id).slice(-2)).toEqual(["liquidar", "gastos"]);
    expect(ps.find((p) => p.id === "liquidar")).toMatchObject({ frecuencia: "mensual", periodo: "2026-10", etiqueta: "Fin de mes" });
  });
  it("los primeros días del mes siguen a la vista, del mes que terminó", () => {
    const ps = pasosDeHoy(datos({ hoy: "2026-10-03" }));
    expect(ps.find((p) => p.id === "gastos")).toMatchObject({ periodo: "2026-09", etiqueta: "Del mes pasado" });
  });
  it("a mitad de mes no hay pasos mensuales", () => {
    const ids = pasosDeHoy(datos({ hoy: "2026-10-15" })).map((p) => p.id);
    expect(ids).not.toContain("liquidar");
    expect(ids).not.toContain("gastos");
  });
  it("sin el plan de liquidaciones no se pide liquidar, pero sí cargar los gastos", () => {
    const ids = pasosDeHoy(datos({ hoy: "2026-10-28", tieneLiquidaciones: false })).map((p) => p.id);
    expect(ids).not.toContain("liquidar");
    expect(ids).toContain("gastos");
  });
  it("todo arranca sin hacer", () => {
    expect(pasosDeHoy(datos()).every((p) => !p.hecho)).toBe(true);
  });
  it("un casillero tildado hoy figura hecho, con quién y cuándo", () => {
    const p = paso(datos({ checks: [marca("caja__2026-10-07", { hechoPorNombre: "Carlos Admin" })] }), "caja");
    expect(p).toMatchObject({ hecho: true, hechoPor: "Carlos Admin" });
    expect(p.hechoEn).toBeTruthy();
  });
  it("lo tildado ayer no cuenta hoy: cada día se reinicia", () => {
    expect(paso(datos({ checks: [marca("caja__2026-10-06")] }), "caja").hecho).toBe(false);
  });
  it("el de la semana sigue hecho toda la semana", () => {
    expect(paso(datos({ checks: [marca("desempeno__2026-10-05")] }), "desempeno").hecho).toBe(true);
    expect(paso(datos({ hoy: "2026-10-11", checks: [marca("desempeno__2026-10-05")] }), "desempeno").hecho).toBe(true);
    expect(paso(datos({ hoy: "2026-10-12", checks: [marca("desempeno__2026-10-05")] }), "desempeno").hecho).toBe(false);
  });
});

describe("el dato en vivo de cada paso", () => {
  describe("caja", () => {
    it("sin ninguna caja", () => {
      expect(paso(datos(), "caja")).toMatchObject({ detalle: "Todavía no se abrió ninguna caja", atencion: false });
    });
    it("una caja abierta pide atención", () => {
      expect(paso(datos({ cashSessions: [sesion({ id: "s1" })] }), "caja")).toMatchObject({ detalle: "Abierta por Ana desde las 08:00", atencion: true });
    });
    it("una caja que quedó abierta de otro día", () => {
      const p = paso(datos({ cashSessions: [sesion({ id: "s1", openedAt: iso("2026-10-05", 8) })] }), "caja");
      expect(p.detalle).toBe("Abierta por Ana desde el 05 oct");
      expect(p.atencion).toBe(true);
    });
    it("varias abiertas", () => {
      expect(paso(datos({ cashSessions: [sesion({ id: "s1" }), sesion({ id: "s2" })] }), "caja").detalle).toBe("2 cajas abiertas");
    });
    const cerrada = (contado: number | undefined, dia = HOY) =>
      datos({
        cashSessions: [sesion({ id: "s1", status: "cerrada", openedAt: iso(dia, 8), closedAt: iso(dia, 18, 30), ...(contado === undefined ? {} : { countedCash: contado }) })],
        payments: [pago({ id: "p1", date: iso(dia, 10), amount: 100_000 })],
      });
    it("cerrada y con el arqueo justo", () => {
      expect(paso(cerrada(300_000), "caja")).toMatchObject({ detalle: "Cerró Ana hoy a las 18:30 · arqueo sin diferencia", atencion: false });
    });
    it("faltante", () => {
      expect(paso(cerrada(290_000), "caja")).toMatchObject({ detalle: "Cerró Ana hoy a las 18:30 · faltan Gs 10000", atencion: true });
    });
    it("sobrante", () => {
      expect(paso(cerrada(310_000), "caja")).toMatchObject({ detalle: "Cerró Ana hoy a las 18:30 · sobran Gs 10000", atencion: true });
    });
    it("sin el arqueo cargado", () => {
      expect(paso(cerrada(undefined), "caja")).toMatchObject({ detalle: "Cerró Ana hoy a las 18:30 · sin arqueo cargado", atencion: true });
    });
    it("la de ayer se dice «ayer»", () => {
      expect(paso(cerrada(300_000, "2026-10-06"), "caja").detalle).toBe("Cerró Ana ayer a las 18:30 · arqueo sin diferencia");
    });
    it("el efectivo esperado descuenta los gastos de la sesión", () => {
      const d = cerrada(250_000);
      d.expenses = [gasto({ id: "g1", date: iso(HOY, 11), amount: 50_000 })];
      expect(paso(d, "caja").detalle).toContain("arqueo sin diferencia");
    });
  });

  describe("cobrado del día", () => {
    it("sin cobros", () => {
      expect(paso(datos(), "cobrado").detalle).toBe("Hoy todavía no se cobró nada");
    });
    it("suma los pagos de hoy y cuenta cuántos fueron", () => {
      const d = datos({ payments: [pago({ id: "a", amount: 150_000 }), pago({ id: "b", amount: 100_000 })] });
      expect(paso(d, "cobrado").detalle).toBe("Gs 250000 en 2 pagos");
    });
    it("uno solo va en singular", () => {
      expect(paso(datos({ payments: [pago({ id: "a" })] }), "cobrado").detalle).toBe("Gs 100000 en 1 pago");
    });
    it("no cuenta los anulados ni los de otro día", () => {
      const d = datos({ payments: [pago({ id: "a" }), pago({ id: "b", voidedAt: iso(HOY) }), pago({ id: "c", date: iso("2026-10-06") })] });
      expect(paso(d, "cobrado").detalle).toBe("Gs 100000 en 1 pago");
    });
  });

  describe("pacientes que deben", () => {
    const debe = (monto: number, dia: string) => ({
      patients: [paciente("p1")],
      budgets: [plan({ id: "b1", patientId: "p1", items: [item({ id: "i1", price: monto, doneAt: iso(dia) })] })],
    });
    it("nadie debe", () => {
      expect(paso(datos(), "deudores")).toMatchObject({ detalle: "Nadie debe", atencion: false });
    });
    it("uno con deuda", () => {
      expect(paso(datos(debe(500_000, "2026-09-20")), "deudores")).toMatchObject({ detalle: "1 paciente debe Gs 500000", atencion: false });
    });
    it("lo pagado se descuenta", () => {
      const d = datos({ ...debe(500_000, "2026-09-20"), payments: [pago({ id: "a", amount: 200_000 })] });
      expect(paso(d, "deudores").detalle).toBe("1 paciente debe Gs 300000");
    });
    it("con más de 60 días pide atención", () => {
      expect(paso(datos(debe(500_000, "2026-07-01")), "deudores")).toMatchObject({ detalle: "1 paciente debe Gs 500000 · 1 con más de 60 días", atencion: true });
    });
  });

  describe("deudores de implantes", () => {
    it("nadie debe implantes", () => {
      expect(paso(datos(), "implantes").detalle).toBe("Nadie debe implantes");
    });
    it("cuenta lo que falta pagar de los implantes", () => {
      const d = datos({
        patients: [paciente("p1")],
        budgets: [plan({ id: "b1", patientId: "p1", items: [item({ id: "i1", cpt: "D6010", description: "Implante", price: 3_000_000 })] })],
        payments: [pago({ id: "a", amount: 1_000_000 })],
      });
      expect(paso(d, "implantes").detalle).toBe("1 paciente debe Gs 2000000 de implantes");
    });
  });

  describe("reclamos en retención", () => {
    it("sin retenciones", () => {
      expect(paso(datos(), "retenciones")).toMatchObject({ detalle: "Sin reclamos en retención", atencion: false });
    });
    it("cuenta los retenidos por el sistema y por el gerente", () => {
      const d = datos({ billing: [{ flags: ["HOLD"] }, { flags: ["MGRHOLD"] }, { flags: [] }] });
      expect(paso(d, "retenciones")).toMatchObject({ detalle: "2 reclamos en retención", atencion: true });
    });
    it("uno va en singular", () => {
      expect(paso(datos({ billing: [{ flags: ["HOLD"] }] }), "retenciones").detalle).toBe("1 reclamo en retención");
    });
  });

  describe("cheques", () => {
    it("sin cheques por cobrar", () => {
      expect(paso(datos(), "cheques")).toMatchObject({ detalle: "No hay cheques por cobrar", atencion: false });
    });
    it("los que ya se pueden cobrar piden atención", () => {
      const d = datos({ payments: [cheque({ id: "c1", cashDate: "2026-10-05", amount: 400_000 }), cheque({ id: "c2", cashDate: HOY, amount: 100_000 })] });
      expect(paso(d, "cheques")).toMatchObject({ detalle: "2 cheques listos para cobrar (Gs 500000)", atencion: true });
    });
    it("los de fecha futura no apuran", () => {
      const d = datos({ payments: [cheque({ id: "c1", cashDate: "2026-10-20" }), cheque({ id: "c2", cashDate: "2026-11-02" })] });
      expect(paso(d, "cheques")).toMatchObject({ detalle: "2 a futuro · el próximo se cobra el 20 oct", atencion: false });
    });
    it("mezcla de listos y a futuro", () => {
      const d = datos({ payments: [cheque({ id: "c1", cashDate: HOY }), cheque({ id: "c2", cashDate: "2026-10-20" })] });
      expect(paso(d, "cheques").detalle).toBe("1 cheque listo para cobrar (Gs 100000) · 1 a futuro");
    });
    it("no cuenta los ya cobrados ni los anulados ni otros medios", () => {
      const d = datos({ payments: [cheque({ id: "c1", cashDate: HOY, cobradoAt: iso(HOY) }), cheque({ id: "c2", cashDate: HOY, voidedAt: iso(HOY) }), pago({ id: "e" })] });
      expect(paso(d, "cheques").detalle).toBe("No hay cheques por cobrar");
    });
  });

  describe("desempeño de la semana", () => {
    const cita = (dia: string, amount: number, status = "completada") => ({ start: iso(dia, 10), status, amount, discount: 0 }) as DatosRutinaAdmin["appointments"][number];
    it("sin citas la semana pasada", () => {
      expect(paso(datos(), "desempeno").detalle).toBe("Sin citas la semana pasada");
    });
    it("cuenta las citas y la producción de la semana pasada (lunes a domingo)", () => {
      const d = datos({ appointments: [cita("2026-09-28", 100_000), cita("2026-10-04", 200_000), cita("2026-10-05", 999_000), cita("2026-09-27", 999_000)] });
      expect(paso(d, "desempeno").detalle).toBe("Semana pasada: 2 citas · producción Gs 300000");
    });
    it("las canceladas no cuentan", () => {
      const d = datos({ appointments: [cita("2026-09-29", 100_000), cita("2026-09-30", 200_000, "cancelada")] });
      expect(paso(d, "desempeno").detalle).toBe("Semana pasada: 1 cita · producción Gs 100000");
    });
  });

  describe("fin de mes", () => {
    const fin = { hoy: "2026-10-28" };
    it("liquidaciones: cuántos profesionales ya están liquidados en el mes", () => {
      const profesionales = [{ id: "d1", role: "dentist" as const, name: "Dra. A" }, { id: "d2", role: "dentist" as const, name: "Dr. B" }, { id: "u1", role: "admin" as const, name: "Carlos" }];
      const d = datos({ ...fin, profesionales, settlements: [{ professionalId: "d1", periodTo: "2026-10-31" }, { professionalId: "d2", periodTo: "2026-09-30" }] });
      expect(paso(d, "liquidar").detalle).toBe("1 de 2 profesionales liquidados en octubre");
    });
    it("sin profesionales cargados", () => {
      expect(paso(datos(fin), "liquidar").detalle).toBe("No hay profesionales para liquidar");
    });
    it("gastos: cuántos se cargaron en el mes y cuánto suman", () => {
      const d = datos({ ...fin, expenses: [gasto({ id: "g1", amount: 100_000, date: iso("2026-10-02") }), gasto({ id: "g2", amount: 50_000, date: iso("2026-10-20") }), gasto({ id: "g3", date: iso("2026-09-30") })] });
      expect(paso(d, "gastos").detalle).toBe("2 gastos cargados en octubre · Gs 150000");
    });
    it("sin gastos todavía", () => {
      expect(paso(datos(fin), "gastos").detalle).toBe("Todavía no cargaste gastos de octubre");
    });
    it("en los primeros días se habla del mes que terminó", () => {
      const d = datos({ hoy: "2026-10-03", expenses: [gasto({ id: "g1", amount: 80_000, date: iso("2026-09-18") })] });
      expect(paso(d, "gastos").detalle).toBe("1 gasto cargado en septiembre · Gs 80000");
    });
  });
});

describe("deudaDeImplantes", () => {
  const impl = (o: Partial<BudgetItem> & { id: string }) => item({ cpt: "D6010", description: "Implante", price: 3_000_000, ...o });
  it("lo impago de los implantes, por paciente", () => {
    const r = deudaDeImplantes([paciente("p1"), paciente("p2")],
      [plan({ id: "b1", patientId: "p1", items: [impl({ id: "i1" })] }), plan({ id: "b2", patientId: "p2", items: [impl({ id: "i2" })] })],
      [pago({ id: "a", patientId: "p1", amount: 3_000_000 }), pago({ id: "b", patientId: "p2", amount: 1_000_000 })]);
    expect(r).toEqual({ pacientes: 1, total: 2_000_000 });
  });
  it("lo pagado cubre primero lo más viejo, aunque no sea un implante", () => {
    const r = deudaDeImplantes([paciente("p1")],
      [plan({ id: "b1", patientId: "p1", items: [item({ id: "viejo", price: 500_000, doneAt: iso("2026-07-01") }), impl({ id: "i1", doneAt: iso("2026-09-01") })] })],
      [pago({ id: "a", amount: 1_000_000 })]);
    expect(r).toEqual({ pacientes: 1, total: 2_500_000 });
  });
  it("reconoce el implante por el nombre aunque el código no sea de la serie D60", () => {
    const r = deudaDeImplantes([paciente("p1")], [plan({ id: "b1", patientId: "p1", items: [item({ id: "i1", cpt: "X1", description: "Implante unitario", price: 800_000 })] })], []);
    expect(r).toEqual({ pacientes: 1, total: 800_000 });
  });
  it("lo que no es implante ni lo pendiente de hacer no cuenta", () => {
    const r = deudaDeImplantes([paciente("p1")], [plan({ id: "b1", patientId: "p1", items: [item({ id: "i1" }), impl({ id: "i2", status: "pendiente" })] })], []);
    expect(r).toEqual({ pacientes: 0, total: 0 });
  });
  it("un plan anulado no cuenta", () => {
    const r = deudaDeImplantes([paciente("p1")], [plan({ id: "b1", patientId: "p1", status: "anulado", items: [impl({ id: "i1" })] })], []);
    expect(r).toEqual({ pacientes: 0, total: 0 });
  });
});

describe("semanaDeRutina — lo hecho y lo que falta de la semana", () => {
  it("la semana va de lunes a domingo y marca hoy y lo que todavía no llegó", () => {
    const s = semanaDeRutina(datos());
    expect(s.dias.map((x) => x.fecha)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(s.dias.map((x) => x.esHoy)).toEqual([false, false, true, false, false, false, false]);
    expect(s.dias.map((x) => x.futuro)).toEqual([false, false, false, true, true, true, true]);
    expect(s.dias[0].etiqueta).toBe("Lun");
  });
  it("el primer día de uso no castiga: los días anteriores al primer casillero no cuentan", () => {
    const s = semanaDeRutina(datos()); // miércoles, nunca se tildó nada
    expect(s.diarias.find((f) => f.id === "caja")?.celdas).toEqual(["antes", "antes", "falta", "futuro", "futuro", "futuro", "futuro"]);
    expect(s.hechas).toBe(0);
    expect(s.faltan).toBe(6 + 1); // los seis de hoy y el de la semana
  });
  it("desde el primer casillero tildado, los días sin hacer cuentan como faltantes", () => {
    const s = semanaDeRutina(datos({ checks: [marca("caja__2026-10-05")] })); // se empezó el lunes
    expect(s.diarias.find((f) => f.id === "cobrado")?.celdas).toEqual(["falta", "falta", "falta", "futuro", "futuro", "futuro", "futuro"]);
    expect(s.hechas).toBe(1);
    expect(s.faltan).toBe(6 * 3 + 1 - 1);
  });
  it("tildar un día anterior mueve el comienzo hacia atrás", () => {
    const s = semanaDeRutina(datos({ checks: [marca("caja__2026-10-06")] })); // se empezó el martes
    expect(s.diarias.find((f) => f.id === "caja")?.celdas).toEqual(["antes", "hecho", "falta", "futuro", "futuro", "futuro", "futuro"]);
  });
  it("lo del día en que se tildó una cosa de la semana también marca el comienzo", () => {
    const s = semanaDeRutina(datos({ checks: [marca("desempeno__2026-10-05", { hechoEn: iso("2026-10-06", 9) })] })); // tildado el martes
    expect(s.diarias.find((f) => f.id === "caja")?.celdas).toEqual(["antes", "falta", "falta", "futuro", "futuro", "futuro", "futuro"]);
  });
  it("lo de una semana anterior cuenta: toda esta semana ya se debía hacer", () => {
    const s = semanaDeRutina(datos({ checks: [marca("caja__2026-09-30")] }));
    expect(s.diarias.find((f) => f.id === "caja")?.celdas).toEqual(["falta", "falta", "falta", "futuro", "futuro", "futuro", "futuro"]);
  });
  it("cada fila diaria dice qué pasó cada día", () => {
    const s = semanaDeRutina(datos({ checks: [marca("caja__2026-10-05"), marca("caja__2026-10-07")] }));
    expect(s.diarias.find((f) => f.id === "caja")?.celdas).toEqual(["hecho", "falta", "hecho", "futuro", "futuro", "futuro", "futuro"]);
  });
  it("cuenta lo hecho", () => {
    const s = semanaDeRutina(datos({ checks: [marca("caja__2026-10-05"), marca("caja__2026-10-07"), marca("desempeno__2026-10-05")] }));
    expect(s.hechas).toBe(3);
    expect(s.faltan).toBe(6 * 3 + 1 - 3);
  });
  it("un lunes solo cuenta el lunes", () => {
    const s = semanaDeRutina(datos({ hoy: "2026-10-12" }));
    expect(s.faltan).toBe(6 + 1);
    expect(s.dias.filter((x) => x.futuro)).toHaveLength(6);
  });
  it("en los primeros días del mes se suman los pasos de fin de mes que quedaron del mes pasado", () => {
    const s = semanaDeRutina(datos({ hoy: "2026-10-05" })); // lunes 5: todavía se ven los de septiembre
    expect(s.periodicas.map((p) => p.id)).toEqual(["desempeno", "liquidar", "gastos"]);
    expect(s.faltan).toBe(6 + 3);
  });
  it("sin el plan de caja esa fila no existe y no se cuenta", () => {
    const s = semanaDeRutina(datos({ tieneCaja: false }));
    expect(s.diarias.map((f) => f.id)).not.toContain("caja");
    expect(s.faltan).toBe(5 + 1);
  });
  it("los pasos de la semana y del mes figuran aparte, con su estado, y suman", () => {
    const s = semanaDeRutina(datos({ hoy: "2026-10-26", checks: [marca("liquidar__2026-10", { hechoEn: iso("2026-10-26", 9) })] }));
    expect(s.periodicas.map((p) => [p.id, p.hecho])).toEqual([["desempeno", false], ["liquidar", true], ["gastos", false]]);
    expect(s.hechas).toBe(1);
  });
  it("el domingo la semana está completa", () => {
    const s = semanaDeRutina(datos({ hoy: "2026-10-11", checks: [marca("caja__2026-10-05")] }));
    expect(s.dias.every((x) => !x.futuro)).toBe(true);
    expect(s.faltan).toBe(6 * 7 + 1 - 1);
  });
});

describe("detallesDeHoy y conMarcas — lo caro aparte de los casilleros", () => {
  it("los detalles no dependen de los casilleros tildados", () => {
    const { checks, ...vivos } = datos({ checks: [marca("caja__2026-10-07")] });
    expect(checks).toHaveLength(1);
    expect(detallesDeHoy(vivos).every((p) => !("hecho" in p))).toBe(true);
  });
  it("conMarcas suma los casilleros sobre los mismos detalles, sin recalcularlos", () => {
    const { checks, ...vivos } = datos({ checks: [marca("caja__2026-10-07", { hechoPorNombre: "Ana" })] });
    const detalles = detallesDeHoy(vivos);
    const pasos = conMarcas(detalles, checks);
    expect(pasos.find((p) => p.id === "caja")).toMatchObject({ hecho: true, hechoPor: "Ana" });
    expect(pasos.find((p) => p.id === "cobrado")).toMatchObject({ hecho: false });
    expect(pasos.map((p) => p.detalle)).toEqual(detalles.map((p) => p.detalle));
    expect(conMarcas(detalles, [])).toEqual(conMarcas(detalles, [marca("otro__2026-10-07")]));
  });
  it("pasosDeHoy es la unión de las dos", () => {
    const d = datos({ checks: [marca("desempeno__2026-10-05")] });
    const { checks, ...vivos } = d;
    expect(pasosDeHoy(d)).toEqual(conMarcas(detallesDeHoy(vivos), checks));
  });
  it("semanaDeRutina acepta los detalles ya calculados y da lo mismo", () => {
    const d = datos({ checks: [marca("caja__2026-10-05")] });
    const { checks: _c, ...vivos } = d;
    expect(semanaDeRutina(d, detallesDeHoy(vivos))).toEqual(semanaDeRutina(d));
  });
});

describe("pasosPuestaEnMarcha — se marcan solos cuando ya está hecho", () => {
  const onboarding = (o: Partial<{ usersCreated: boolean; servicesDefined: boolean; tourDone: boolean }> = {}) => ({ usersCreated: false, servicesDefined: false, tourDone: false, ...o });
  it("una clínica recién creada tiene todo pendiente", () => {
    const ps = pasosPuestaEnMarcha({ onboarding: onboarding(), usuarios: 1, prestaciones: 0 });
    expect(ps.map((p) => [p.key, p.hecho])).toEqual([["usersCreated", false], ["servicesDefined", false], ["tourDone", false]]);
  });
  it("con otra persona en el equipo, los usuarios se marcan solos", () => {
    const p = pasosPuestaEnMarcha({ onboarding: onboarding(), usuarios: 3, prestaciones: 0 }).find((x) => x.key === "usersCreated");
    expect(p).toMatchObject({ hecho: true, sola: true });
  });
  it("con prestaciones cargadas, los servicios se marcan solos", () => {
    const p = pasosPuestaEnMarcha({ onboarding: onboarding(), usuarios: 1, prestaciones: 12 }).find((x) => x.key === "servicesDefined");
    expect(p).toMatchObject({ hecho: true, sola: true });
  });
  it("lo marcado a mano sigue valiendo, y no se dice que fue sola", () => {
    const p = pasosPuestaEnMarcha({ onboarding: onboarding({ usersCreated: true }), usuarios: 1, prestaciones: 0 }).find((x) => x.key === "usersCreated");
    expect(p).toMatchObject({ hecho: true, sola: false });
  });
  it("el recorrido solo se marca a mano", () => {
    const ps = pasosPuestaEnMarcha({ onboarding: onboarding(), usuarios: 5, prestaciones: 50 });
    expect(ps.find((x) => x.key === "tourDone")).toMatchObject({ hecho: false, sola: false });
  });
});
