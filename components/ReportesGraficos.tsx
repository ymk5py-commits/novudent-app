"use client";
/** Reportes gráficos (paridad Dentalink): un selector de reporte dentro de la pantalla y el
 *  mismo chasis para todos — qué mide (en prosa), rango, gráfico y la tabla con los mismos
 *  números, descargable. La cuenta vive en lib/reportes (pura, con tests). */
import { useMemo, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { useStore, fmtGs, fmtDate, fmtTime, fullName } from "@/lib/store";
import { PAYMENT_METHOD_LABEL } from "@/lib/budgets";
import { fechaLocal } from "@/lib/tareas";
import { downloadCsv } from "@/lib/csv";
import {
  derivacion, eficienciaProfesional, estadoFinanciamientos, etiquetaMes, morososPorAntiguedad, rangoPorDefecto,
  recaudacionDiaria, resultados, ventasPorCategoria, ventasPorPrestacion, type BaseResultados,
} from "@/lib/reportes";
import { Btn, Card, Field, inputCls } from "@/components/ui";
import { DosSeriesBarsChart, WeekBarsChart } from "@/components/Charts";
import { PrintLetterhead, PrintPortal } from "@/components/PrintDocument";

type Clave = "resultados" | "profesionales" | "prestaciones" | "categorias" | "diario" | "financiamientos" | "derivacion" | "morosos";

const CATALOGO: { clave: Clave; titulo: string; explica: string; filtro: "meses" | "dia" | "hoy" }[] = [
  { clave: "resultados", titulo: "Resultados", filtro: "meses",
    explica: "Cuánto ganó la clínica cada mes: ventas menos costos, y ese resultado como porcentaje sobre los costos. «Prestaciones realizadas» mira lo hecho en el sillón y los gastos por fecha de factura (devengado). «Pagos recibidos» mira lo cobrado y los gastos ya pagados (percibido)." },
  { clave: "profesionales", titulo: "Eficiencia por profesional", filtro: "meses",
    explica: "Lo que realizó cada profesional, sus horas de sillón (citas atendidas) y las ventas por hora, que permiten comparar especialidades distintas sin que pese la venta bruta. «Presupuestado» es lo que presentó en planes nuevos del período." },
  { clave: "prestaciones", titulo: "Ventas por prestación", filtro: "meses",
    explica: "Qué prestaciones se realizaron en el período, cuántas veces y cuánto sumaron, con el descuento de cada plan." },
  { clave: "categorias", titulo: "Ventas por categoría", filtro: "meses",
    explica: "Lo realizado agrupado por categoría del arancel. La categoría sale del arancel; si una prestación no la tiene, se deduce de su código." },
  { clave: "diario", titulo: "Recaudación del día", filtro: "dia",
    explica: "El cierre del día: lo cobrado por medio de pago, cada cobro con su comprobante y los gastos pagados ese día." },
  { clave: "financiamientos", titulo: "Estado de financiamientos", filtro: "hoy",
    explica: "Lo que se espera cobrar en cuotas en los próximos 16 meses y lo que ya venció sin pagarse. Es el único reporte que mira hacia adelante." },
  { clave: "derivacion", titulo: "Derivación de pacientes", filtro: "meses",
    explica: "De dónde vienen los pacientes nuevos: el dato «Cómo nos conoció» de quienes tuvieron su primera cita en el período. Cuanto más se cargue ese dato en la ficha, mejor sale este reporte." },
  { clave: "morosos", titulo: "Pacientes morosos por antigüedad", filtro: "hoy",
    explica: "La deuda real (trabajo hecho y no pagado) por antigüedad: hasta 30 días, de 30 a 60 y más de 60, contando desde el día de la prestación. Los pagos cubren primero lo más viejo. Para los planes en cuotas, mirá «Estado de financiamientos»." },
];

export function ReportesGraficos() {
  const { db } = useStore();
  const hoy = fechaLocal();
  const [clave, setClave] = useState<Clave>("resultados");
  const [rango, setRango] = useState(() => rangoPorDefecto(hoy));
  const [base, setBase] = useState<BaseResultados>("realizado");
  const [dia, setDia] = useState(hoy);
  const info = CATALOGO.find((c) => c.clave === clave)!;
  const rangoOk = /^\d{4}-\d{2}$/.test(rango.desde) && /^\d{4}-\d{2}$/.test(rango.hasta) && rango.desde <= rango.hasta;
  const paciente = (id: string) => { const p = db.patients.find((x) => x.id === id); return p ? fullName(p) : "—"; };
  const rangoTxt = `${etiquetaMes(rango.desde)} a ${etiquetaMes(rango.hasta)}`;

  const vista = useMemo((): { grafico?: { d: string; v: number }[]; dosSeries?: { d: string; a: number; b: number }[]; dinero?: boolean; serie?: string; tabla: ReactNode; csv: (string | number)[][] } => {
    if (info.filtro === "meses" && !rangoOk) return { tabla: <p className="text-clinic-muted">Elegí un rango válido (desde no puede ser posterior a hasta).</p>, csv: [] };
    switch (clave) {
      case "resultados": {
        const filas = resultados(db, rango, base);
        const tot = filas.reduce((a, f) => ({ v: a.v + f.ventas, c: a.c + f.costos }), { v: 0, c: 0 });
        return {
          dosSeries: filas.map((f) => ({ d: etiquetaMes(f.mes), a: f.ventas, b: f.costos })),
          tabla: <Tabla cabeza={["Mes", "Ventas", "Costos", "Ganancia", "% sobre costos"]} der={[1, 2, 3, 4]}
            filas={filas.map((f) => [etiquetaMes(f.mes), fmtGs(f.ventas), fmtGs(f.costos), <span key="g" className={f.ganancia < 0 ? "text-state-err" : ""}>{fmtGs(f.ganancia)}</span>, f.pctSobreCostos === null ? "—" : `${f.pctSobreCostos}%`])}
            pie={["Total", fmtGs(tot.v), fmtGs(tot.c), fmtGs(tot.v - tot.c), tot.c > 0 ? `${Math.round(((tot.v - tot.c) / tot.c) * 100)}%` : "—"]} />,
          csv: [["Mes", "Ventas", "Costos", "Ganancia", "% sobre costos"], ...filas.map((f) => [f.mes, f.ventas, f.costos, f.ganancia, f.pctSobreCostos ?? ""])],
        };
      }
      case "profesionales": {
        const filas = eficienciaProfesional(db, rango);
        return {
          grafico: filas.map((f) => ({ d: f.nombre, v: f.ventasPorHora ?? 0 })), dinero: true, serie: "Ventas por hora",
          tabla: <Tabla cabeza={["Profesional", "Ventas", "Horas atendidas", "Ventas por hora", "Presupuestado"]} der={[1, 2, 3, 4]}
            filas={filas.map((f) => [f.nombre, fmtGs(f.ventas), f.horas.toLocaleString("es-PY"), f.ventasPorHora === null ? "—" : fmtGs(f.ventasPorHora), fmtGs(f.presupuestado)])} />,
          csv: [["Profesional", "Ventas", "Horas atendidas", "Ventas por hora", "Presupuestado"], ...filas.map((f) => [f.nombre, f.ventas, f.horas, f.ventasPorHora ?? "", f.presupuestado])],
        };
      }
      case "prestaciones":
      case "categorias": {
        const filas = clave === "prestaciones" ? ventasPorPrestacion(db.budgets, db.procedures, rango) : ventasPorCategoria(db.budgets, db.procedures, rango);
        const tot = filas.reduce((a, f) => ({ n: a.n + f.cantidad, t: a.t + f.total }), { n: 0, t: 0 });
        const titulo = clave === "prestaciones" ? "Prestación" : "Categoría";
        return {
          grafico: filas.slice(0, 12).map((f) => ({ d: f.nombre.length > 18 ? `${f.nombre.slice(0, 17)}…` : f.nombre, v: f.total })), dinero: true, serie: "Ventas",
          tabla: <Tabla cabeza={[titulo, "Cantidad", "Total", "% del total"]} der={[1, 2, 3]}
            filas={filas.map((f) => [clave === "prestaciones" ? <span key="n">{f.nombre} <span className="text-clinic-muted">{f.clave}</span></span> : f.nombre, f.cantidad, fmtGs(f.total), `${f.pct.toLocaleString("es-PY")}%`])}
            pie={["Total", tot.n, fmtGs(tot.t), "100%"]} vacio="No hay prestaciones realizadas en el período." />,
          csv: [[titulo, "Código", "Cantidad", "Total", "% del total"], ...filas.map((f) => [f.nombre, f.clave, f.cantidad, f.total, f.pct])],
        };
      }
      case "diario": {
        const r = recaudacionDiaria(db.payments, db.expenses, dia);
        return {
          grafico: r.porMedio.map((m) => ({ d: PAYMENT_METHOD_LABEL[m.method], v: m.total })), dinero: true, serie: "Cobrado",
          tabla: (
            <div className="space-y-4">
              <Tabla cabeza={["Medio de pago", "Cantidad", "Total"]} der={[1, 2]} filas={r.porMedio.map((m) => [PAYMENT_METHOD_LABEL[m.method], m.cantidad, fmtGs(m.total)])}
                pie={["Cobrado", r.pagos.length, fmtGs(r.cobrado)]} vacio="No hubo cobros ese día." />
              {r.pagos.length > 0 && <Tabla cabeza={["Hora", "Paciente", "Concepto", "Medio", "Comprobante", "Monto"]} der={[5]}
                filas={r.pagos.map((p) => [fmtTime(p.date), paciente(p.patientId), p.concept, PAYMENT_METHOD_LABEL[p.method], p.receiptNumber ? `N° ${p.receiptNumber}` : "—", fmtGs(p.amount)])} />}
              <Tabla cabeza={["Gastos pagados", "Categoría", "Monto"]} der={[2]} filas={r.gastos.map((e) => [e.description, e.category, fmtGs(e.amount)])}
                pie={["Neto del día (cobrado − gastos)", "", fmtGs(r.neto)]} vacio="Sin gastos pagados ese día." />
            </div>
          ),
          csv: [["Hora", "Paciente", "Concepto", "Medio", "Comprobante", "Monto"], ...r.pagos.map((p) => [fmtTime(p.date), paciente(p.patientId), p.concept, PAYMENT_METHOD_LABEL[p.method], p.receiptNumber ?? "", p.amount]), [], ["Gasto", "Categoría", "Monto"], ...r.gastos.map((e) => [e.description, e.category, e.amount])],
        };
      }
      case "financiamientos": {
        const e = estadoFinanciamientos(db.budgets, db.payments, hoy);
        const esperado = e.porMes.reduce((a, m) => a + m.monto, 0);
        return {
          grafico: e.porMes.map((m) => ({ d: etiquetaMes(m.mes), v: m.monto })), dinero: true, serie: "A cobrar",
          tabla: (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Dato label="Vencido sin pagar" valor={fmtGs(e.vencido)} sub={`${e.cuotasVencidas} cuota${e.cuotasVencidas === 1 ? "" : "s"}`} tono={e.vencido > 0 ? "err" : undefined} />
                <Dato label="A cobrar en 16 meses" valor={fmtGs(esperado)} sub={`${e.planes.length} plan${e.planes.length === 1 ? "" : "es"} con cuotas pendientes`} />
              </div>
              <Tabla cabeza={["Mes", "Cuotas", "A cobrar"]} der={[1, 2]} filas={e.porMes.map((m) => [etiquetaMes(m.mes), m.cuotas, fmtGs(m.monto)])} />
              <Tabla cabeza={["Paciente", "Plan", "Vencido", "Pendiente", "Próxima cuota"]} der={[2, 3]}
                filas={e.planes.map((p) => [paciente(p.budget.patientId), `#${p.budget.id}`, p.vencido > 0 ? <span key="v" className="font-bold text-state-err">{fmtGs(p.vencido)}</span> : "—", fmtGs(p.pendiente), p.proxima ? `${p.proxima.numero === 0 ? "Pie" : `#${p.proxima.numero}`} · ${fmtDate(p.proxima.dueDate)} · ${fmtGs(p.proxima.saldo)}` : "—"])}
                vacio="No hay planes con cuotas pendientes." />
            </div>
          ),
          csv: [["Mes", "Cuotas", "A cobrar"], ...e.porMes.map((m) => [m.mes, m.cuotas, m.monto]), [], ["Paciente", "Plan", "Vencido", "Pendiente"], ...e.planes.map((p) => [paciente(p.budget.patientId), p.budget.id, p.vencido, p.pendiente])],
        };
      }
      case "derivacion": {
        const filas = derivacion(db.patients, db.appointments, rango);
        const total = filas.reduce((a, f) => a + f.pacientes, 0);
        return {
          grafico: filas.map((f) => ({ d: f.origen.length > 18 ? `${f.origen.slice(0, 17)}…` : f.origen, v: f.pacientes })), serie: "Pacientes",
          tabla: <Tabla cabeza={["Cómo nos conoció", "Pacientes nuevos", "%"]} der={[1, 2]} filas={filas.map((f) => [f.origen, f.pacientes, `${f.pct.toLocaleString("es-PY")}%`])}
            pie={["Total", total, "100%"]} vacio="No hubo pacientes nuevos en el período." />,
          csv: [["Cómo nos conoció", "Pacientes nuevos", "%"], ...filas.map((f) => [f.origen, f.pacientes, f.pct])],
        };
      }
      case "morosos": {
        const filas = morososPorAntiguedad(db.patients, db.budgets, db.payments, hoy);
        const t = filas.reduce((a, f) => ({ a: a.a + f.hasta30, b: a.b + f.de30a60, c: a.c + f.mas60 }), { a: 0, b: 0, c: 0 });
        return {
          grafico: [{ d: "Hasta 30 días", v: t.a }, { d: "30 a 60 días", v: t.b }, { d: "Más de 60 días", v: t.c }], dinero: true, serie: "Deuda",
          tabla: <Tabla cabeza={["Paciente", "Mora (días)", "Hasta 30 días", "30 a 60 días", "Más de 60 días", "Total"]} der={[1, 2, 3, 4, 5]}
            filas={filas.map((f) => [fullName(f.patient), f.diasMora, f.hasta30 ? fmtGs(f.hasta30) : "—", f.de30a60 ? fmtGs(f.de30a60) : "—", f.mas60 ? <span key="m" className="font-bold text-state-err">{fmtGs(f.mas60)}</span> : "—", fmtGs(f.deuda)])}
            pie={["Total", "", fmtGs(t.a), fmtGs(t.b), fmtGs(t.c), fmtGs(t.a + t.b + t.c)]} vacio="Nadie debe trabajo realizado. 🎉" />,
          csv: [["Paciente", "Mora (días)", "Hasta 30 días", "30 a 60 días", "Más de 60 días", "Total"], ...filas.map((f) => [fullName(f.patient), f.diasMora, f.hasta30, f.de30a60, f.mas60, f.deuda])],
        };
      }
    }
  }, [clave, db, rango, rangoOk, base, dia, hoy, info.filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const clinic = db.clinics[0];
  const descargar = () => downloadCsv(`${clave}_${info.filtro === "dia" ? dia : info.filtro === "hoy" ? hoy : `${rango.desde}_${rango.hasta}`}.csv`, vista.csv);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Reporte">
            <select className={`${inputCls} min-w-[240px]`} value={clave} onChange={(e) => setClave(e.target.value as Clave)}>
              {CATALOGO.map((c) => <option key={c.clave} value={c.clave}>{c.titulo}</option>)}
            </select>
          </Field>
          {clave === "resultados" && (
            <Field label="En base a">
              <select className={inputCls} value={base} onChange={(e) => setBase(e.target.value as BaseResultados)}>
                <option value="realizado">Prestaciones realizadas (devengado)</option>
                <option value="cobrado">Pagos recibidos (percibido)</option>
              </select>
            </Field>
          )}
          {info.filtro === "meses" && (
            <>
              <Field label="Desde"><input type="month" className={inputCls} value={rango.desde} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))} /></Field>
              <Field label="Hasta"><input type="month" className={inputCls} value={rango.hasta} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))} /></Field>
            </>
          )}
          {info.filtro === "dia" && <Field label="Día"><input type="date" className={inputCls} value={dia} onChange={(e) => setDia(e.target.value || hoy)} /></Field>}
          <div className="ml-auto flex gap-2">
            {clave === "diario" && <Btn variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Btn>}
            <Btn variant="outline" disabled={vista.csv.length === 0} onClick={descargar}><Download className="h-4 w-4" /> Descargar CSV</Btn>
          </div>
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-clinic-text">{info.titulo}</h2>
          <p className="mt-1 max-w-3xl text-[13px] text-clinic-muted">{info.explica}</p>
          <p className="mt-1 text-[12px] text-clinic-muted">{info.filtro === "meses" ? rangoTxt : info.filtro === "dia" ? fmtDate(dia) : `Al ${fmtDate(hoy)}`}</p>
        </div>
      </Card>

      {vista.dosSeries && vista.dosSeries.some((x) => x.a !== 0 || x.b !== 0) && (
        <Card className="p-4"><DosSeriesBarsChart data={vista.dosSeries} nombres={["Ventas", "Costos"]} /></Card>
      )}
      {vista.grafico && vista.grafico.length > 0 && vista.grafico.some((x) => x.v !== 0) && (
        <Card className="p-4"><WeekBarsChart data={vista.grafico} money={vista.dinero} name={vista.serie ?? ""} /></Card>
      )}
      <Card className="overflow-x-auto p-4 text-[13px]">{vista.tabla}</Card>

      {clave === "diario" && clinic && (
        <PrintPortal>
          <div className="plan-print-root">
            <PrintLetterhead clinic={clinic} label={`RECAUDACIÓN DEL DÍA · ${fmtDate(dia)}`} />
            <div className="mt-6 text-[12px]">{vista.tabla}</div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}

function Tabla({ cabeza, filas, pie, der = [], vacio }: { cabeza: string[]; filas: ReactNode[][]; pie?: ReactNode[]; der?: number[]; vacio?: string }) {
  if (filas.length === 0 && vacio) return <p className="py-3 text-clinic-muted">{vacio}</p>;
  const al = (i: number) => (der.includes(i) ? "text-right tabular-nums" : "");
  return (
    <table className="w-full min-w-[520px]">
      <thead><tr className="border-b border-clinic-border text-left text-[13px] font-bold text-clinic-text">{cabeza.map((c, i) => <th key={c} className={`px-2 py-2 ${al(i)}`}>{c}</th>)}</tr></thead>
      <tbody className="divide-y divide-clinic-border">
        {filas.map((f, r) => <tr key={r}>{f.map((c, i) => <td key={i} className={`px-2 py-1.5 ${al(i)}`}>{c}</td>)}</tr>)}
      </tbody>
      {pie && <tfoot><tr className="border-t-2 border-clinic-border font-bold">{pie.map((c, i) => <td key={i} className={`px-2 py-2 ${al(i)}`}>{c}</td>)}</tr></tfoot>}
    </table>
  );
}

function Dato({ label, valor, sub, tono }: { label: string; valor: string; sub?: string; tono?: "err" }) {
  return (
    <div className="rounded border border-clinic-border p-3">
      <div className="text-[13px] font-semibold text-clinic-muted">{label}</div>
      <div className={`tabular-nums text-xl font-bold ${tono === "err" ? "text-state-err" : "text-clinic-text"}`}>{valor}</div>
      {sub && <div className="text-[12px] text-clinic-muted">{sub}</div>}
    </div>
  );
}
