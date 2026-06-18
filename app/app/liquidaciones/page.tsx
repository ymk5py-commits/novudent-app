"use client";
/** Liquidaciones — pago de producción/comisiones a cada profesional por período.
 *
 *  CÓMO SE CALCULA LA PRODUCCIÓN
 *  El modelo `Appointment` tiene `dentistId`, `amount`, `discount` y `status`.
 *  La producción de un profesional en el período = suma de (amount − discount)
 *  de sus citas con estado "completada" cuyo `start` cae dentro del rango
 *  [periodFrom, periodTo]. Es el dato más directo y fiel que soporta el modelo
 *  (citas realizadas y atribuidas al doctor), a diferencia de Reportes que mide
 *  producción *cobrada* (pagos ligados a presupuestos). Acá medimos producción
 *  *realizada* — lo correcto para liquidar el trabajo del profesional.
 *  La cifra calculada es el valor por defecto pero queda editable por fila
 *  (override manual) por si el cierre del mes exige un ajuste. La comisión
 *  arranca del `commissionPct` del usuario y también es editable.
 */
import { useMemo, useState } from "react";
import { ShieldAlert, Coins, HandCoins, History, Check, Percent, Calendar } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { Settlement } from "@/lib/types";
import { Card, Btn, Badge, Field, inputCls, Empty } from "@/components/ui";
import { PlanLocked, useClinicPlan } from "@/components/PlanGate";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

/** primer/último día del mes actual en formato YYYY-MM-DD (default del selector) */
function monthBounds() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default function LiquidacionesPage() {
  const store = useStore();
  const { db, session } = store;
  const bounds = monthBounds();
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  /** overrides por profesional (id → {pct?, prod?}); vacío = usa lo calculado */
  const [pctOverride, setPctOverride] = useState<Record<string, string>>({});
  const [prodOverride, setProdOverride] = useState<Record<string, string>>({});

  const plan = useClinicPlan();

  /* producción realizada por profesional en el período (citas completadas) */
  const rows = useMemo(() => {
    // rango inclusivo: desde 00:00 del día `from` hasta 23:59:59 del día `to`
    const start = new Date(from + "T00:00:00").getTime();
    const end = new Date(to + "T23:59:59.999").getTime();
    const dentists = db.users.filter((u) => u.role === "dentist" && u.active);
    return dentists.map((d) => {
      const computedProd = db.appointments
        .filter(
          (a) =>
            a.dentistId === d.id &&
            a.status === "completada" &&
            (() => {
              const t = new Date(a.start).getTime();
              return t >= start && t <= end;
            })()
        )
        .reduce((s, a) => s + (a.amount - a.discount), 0);
      const prodRaw = prodOverride[d.id];
      const production = prodRaw !== undefined && prodRaw !== "" ? Math.max(0, Number(prodRaw) || 0) : computedProd;
      const pctRaw = pctOverride[d.id];
      const pct = pctRaw !== undefined && pctRaw !== "" ? Math.max(0, Number(pctRaw) || 0) : d.commissionPct ?? 0;
      const amount = Math.round((production * pct) / 100);
      return { d, computedProd, production, pct, amount };
    });
  }, [db.users, db.appointments, from, to, pctOverride, prodOverride]);

  if (!session) return null;
  if (!plan.features.includes("liquidaciones")) return <PlanLocked feature="liquidaciones" />;
  if (!can(session.role, "billing.reports")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">
          Las liquidaciones a profesionales son del <b>Administrador</b> y la <b>Asistente</b>.
        </p>
      </Card>
    );
  }

  const proName = (id: string) => db.users.find((u) => u.id === id)?.name ?? "—";

  const liquidar = (r: (typeof rows)[number]) => {
    const s: Settlement = {
      id: crypto.randomUUID(),
      professionalId: r.d.id,
      periodFrom: from,
      periodTo: to,
      production: r.production,
      commissionPct: r.pct,
      amount: r.amount,
      status: "pendiente",
      createdAt: new Date().toISOString(),
    };
    store.addSettlement(s);
    // limpiar overrides de esa fila tras liquidar
    setPctOverride((o) => { const n = { ...o }; delete n[r.d.id]; return n; });
    setProdOverride((o) => { const n = { ...o }; delete n[r.d.id]; return n; });
  };

  const marcarPagado = (s: Settlement) =>
    store.updateSettlement({ ...s, status: "liquidado", paidAt: new Date().toISOString() });

  const history = [...db.settlements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const totalPeriodo = rows.reduce((s, r) => s + r.amount, 0);
  const pendientes = db.settlements.filter((s) => s.status === "pendiente");
  const totalPendiente = pendientes.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="space-y-5">
      <Reveal y={0}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-clinic-text">Liquidaciones</h1>
            <p className="text-sm text-clinic-muted">
              Pago de producción y comisiones a cada profesional por período.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-clinic-muted">
              <Calendar className="h-3.5 w-3.5" /> Desde
              <input type="date" className={inputCls + " !w-auto"} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-clinic-muted">
              Hasta
              <input type="date" className={inputCls + " !w-auto"} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </div>
      </Reveal>

      {/* KPIs del período */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StaggerItem className="block h-full">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-azure-600"><Coins className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Comisiones del período</span></div>
            <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(totalPeriodo)}</div>
            <div className="mt-1 text-[11px] text-clinic-muted">{rows.length} profesional{rows.length !== 1 && "es"} · {fmtDate(from + "T12:00:00")} → {fmtDate(to + "T12:00:00")}</div>
          </Card>
        </StaggerItem>
        <StaggerItem className="block h-full">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-state-warn"><HandCoins className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Pendiente de pago</span></div>
            <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{fmtGs(totalPendiente)}</div>
            <div className="mt-1 text-[11px] text-clinic-muted">{pendientes.length} liquidación{pendientes.length !== 1 && "es"} sin pagar</div>
          </Card>
        </StaggerItem>
        <StaggerItem className="block h-full">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-state-ok"><Check className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Histórico</span></div>
            <div className="mt-1 font-mono text-xl font-extrabold text-clinic-text">{db.settlements.length}</div>
            <div className="mt-1 text-[11px] text-clinic-muted">liquidaciones registradas</div>
          </Card>
        </StaggerItem>
      </Stagger>

      {/* cálculo por profesional */}
      <Reveal>
        <Card className="p-5">
          <h2 className="font-extrabold text-clinic-text">Producción por profesional</h2>
          <p className="text-[11px] text-clinic-muted">
            Suma de citas <b>completadas</b> (importe − descuento) atribuidas al profesional en el período.
            La producción y la comisión quedan editables antes de liquidar.
          </p>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">No hay profesionales activos para liquidar.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-clinic-border text-left text-[11px] font-semibold uppercase tracking-wide text-clinic-muted">
                    <th className="py-2 pr-3">Profesional</th>
                    <th className="py-2 pr-3 text-right">Producción</th>
                    <th className="py-2 pr-3 text-right">% Comisión</th>
                    <th className="py-2 pr-3 text-right">A liquidar</th>
                    <th className="py-2 pl-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {rows.map((r) => (
                    <tr key={r.d.id}>
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2 font-semibold text-clinic-text">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.d.color }} />
                          {r.d.name}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className={inputCls + " !w-36 text-right font-mono"}
                          value={prodOverride[r.d.id] ?? String(r.computedProd)}
                          onChange={(e) => setProdOverride((o) => ({ ...o, [r.d.id]: e.target.value }))}
                          title="Producción del período (editable)"
                        />
                        <div className="mt-1 text-[11px] text-clinic-muted">calc.: {fmtGs(r.computedProd)}</div>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <span className="relative inline-flex items-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            inputMode="decimal"
                            className={inputCls + " !w-20 pr-6 text-right font-mono"}
                            value={pctOverride[r.d.id] ?? String(r.d.commissionPct ?? 0)}
                            onChange={(e) => setPctOverride((o) => ({ ...o, [r.d.id]: e.target.value }))}
                            title="% de comisión sobre producción"
                          />
                          <Percent className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-clinic-muted" />
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono font-extrabold text-state-ok">{fmtGs(r.amount)}</td>
                      <td className="py-3 pl-3 text-right">
                        <Btn onClick={() => liquidar(r)} disabled={r.amount <= 0}>
                          <Coins className="h-3.5 w-3.5" /> Liquidar
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>

      {/* historial de liquidaciones */}
      <Reveal>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-azure-600" />
            <h2 className="font-extrabold text-clinic-text">Historial de liquidaciones</h2>
            <Badge tone={pendientes.length ? "warn" : "muted"}>{pendientes.length} pendiente{pendientes.length !== 1 && "s"}</Badge>
          </div>

          {history.length === 0 ? (
            <div className="mt-4">
              <Empty title="Aún no hay liquidaciones" desc="Liquidá la producción de un profesional para que aparezca acá." />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-clinic-border text-left text-[11px] font-semibold uppercase tracking-wide text-clinic-muted">
                    <th className="py-2 pr-3">Profesional</th>
                    <th className="py-2 pr-3">Período</th>
                    <th className="py-2 pr-3 text-right">Producción</th>
                    <th className="py-2 pr-3 text-right">%</th>
                    <th className="py-2 pr-3 text-right">Monto</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pl-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-clinic-border">
                  {history.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3 font-semibold text-clinic-text">{proName(s.professionalId)}</td>
                      <td className="py-3 pr-3 text-clinic-muted">
                        {fmtDate(s.periodFrom + "T12:00:00")} → {fmtDate(s.periodTo + "T12:00:00")}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-clinic-text">{fmtGs(s.production)}</td>
                      <td className="py-3 pr-3 text-right font-mono text-clinic-muted">{s.commissionPct}%</td>
                      <td className="py-3 pr-3 text-right font-mono font-extrabold text-clinic-text">{fmtGs(s.amount)}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={s.status === "liquidado" ? "ok" : "warn"}>
                          {s.status === "liquidado" ? "Liquidado" : "Pendiente"}
                        </Badge>
                        {s.status === "liquidado" && s.paidAt && (
                          <span className="ml-1.5 text-[11px] text-clinic-muted">{fmtDate(s.paidAt)}</span>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {s.status === "pendiente" ? (
                          <Btn variant="outline" onClick={() => marcarPagado(s)}>
                            <Check className="h-3.5 w-3.5" /> Marcar pagado
                          </Btn>
                        ) : (
                          <span className="text-[11px] text-state-ok">✓ Pagado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
