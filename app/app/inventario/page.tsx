"use client";
/** Inventario (bodega virtual): stock con alertas de reposición,
 *  entradas/salidas con motivo y valorización. */
import { useState } from "react";
import { ShieldAlert, Plus, PackagePlus, PackageMinus, Pencil, AlertTriangle, Package, Coins, History } from "lucide-react";
import { useStore, fmtGs, fmtDate } from "@/lib/store";
import { can } from "@/lib/rbac";
import type { StockItem, StockMove } from "@/lib/types";
import { Card, Btn, Badge, Modal, Field, inputCls, Empty } from "@/components/ui";

export default function InventoryPage() {
  const store = useStore();
  const { db, session } = store;
  const [editing, setEditing] = useState<StockItem | "new" | null>(null);
  const [moving, setMoving] = useState<{ item: StockItem; type: "entrada" | "salida" } | null>(null);

  if (!session) return null;
  if (!can(session.role, "inventory.manage")) {
    return (
      <Card className="p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-state-warn" />
        <h1 className="mt-3 text-lg font-extrabold text-clinic-text">Acceso denegado</h1>
        <p className="mt-1 text-sm text-clinic-muted">El inventario lo gestionan el <b>Administrador</b> y la <b>Asistente</b>.</p>
      </Card>
    );
  }

  const low = db.stock.filter((s) => s.stock <= s.minStock);
  const totalValue = db.stock.reduce((s, x) => s + x.stock * x.cost, 0);
  const recentMoves = [...db.stockMoves].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-clinic-text">Inventario</h1>
          <p className="text-sm text-clinic-muted">Bodega virtual con alertas de reposición.</p>
        </div>
        <Btn onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nuevo ítem</Btn>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-azure-600"><Package className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Ítems</span></div>
          <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{db.stock.length}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-warn"><AlertTriangle className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Stock bajo</span></div>
          <div className={`mt-1 font-mono text-2xl font-extrabold ${low.length ? "text-state-err" : "text-clinic-text"}`}>{low.length}</div>
          {low.length > 0 && <div className="mt-1 truncate text-[11px] text-clinic-muted">{low.map((s) => s.name.split(" ")[0]).join(", ")}</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-state-ok"><Coins className="h-4 w-4" /><span className="text-xs font-extrabold uppercase tracking-wide">Valorización</span></div>
          <div className="mt-1 font-mono text-2xl font-extrabold text-clinic-text">{fmtGs(totalValue)}</div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-x-auto lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-clinic-border text-left text-[11px] font-bold uppercase tracking-wide text-clinic-muted">
                <th className="px-5 py-3">Ítem</th>
                <th className="px-5 py-3 text-right">Stock</th>
                <th className="px-5 py-3 text-right">Mínimo</th>
                <th className="px-5 py-3 text-right">Costo unit.</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-clinic-border">
              {db.stock.map((s) => {
                const isLow = s.stock <= s.minStock;
                return (
                  <tr key={s.id} className={isLow ? "bg-state-warnbg/40" : "hover:bg-clinic-bg/60"}>
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-clinic-text">{s.name}</span>
                      <span className="text-[11px] text-clinic-muted">{s.category} · {s.unit}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-mono text-sm font-extrabold ${isLow ? "text-state-err" : "text-clinic-text"}`}>{s.stock}</span>
                      {isLow && <Badge tone="err" tip="Stock en o por debajo del mínimo — reponer">Reponer</Badge>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-clinic-muted">{s.minStock}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs">{fmtGs(s.cost)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => setMoving({ item: s, type: "entrada" })} className="grid h-8 w-8 place-items-center rounded-lg bg-state-okbg text-state-ok hover:opacity-80" title="Registrar entrada">
                          <PackagePlus className="h-4 w-4" />
                        </button>
                        <button onClick={() => setMoving({ item: s, type: "salida" })} className="grid h-8 w-8 place-items-center rounded-lg bg-state-errbg text-state-err hover:opacity-80" title="Registrar salida">
                          <PackageMinus className="h-4 w-4" />
                        </button>
                        <button onClick={() => setEditing(s)} className="grid h-8 w-8 place-items-center rounded-lg text-clinic-muted hover:bg-clinic-bg" title="Editar ítem">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {db.stock.length === 0 && <p className="py-10 text-center text-sm text-clinic-muted">Sin ítems. Agregá el primero.</p>}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-azure-600" /><h2 className="font-extrabold text-clinic-text">Movimientos recientes</h2></div>
          {recentMoves.length === 0 ? (
            <p className="py-8 text-center text-sm text-clinic-muted">Sin movimientos.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recentMoves.map((m) => {
                const item = db.stock.find((s) => s.id === m.itemId);
                return (
                  <li key={m.id} className="rounded-xl bg-clinic-bg p-3">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs font-bold text-clinic-text">{item?.name ?? "—"}</span>
                      <span className={`font-mono text-xs font-extrabold ${m.type === "entrada" ? "text-state-ok" : "text-state-err"}`}>
                        {m.type === "entrada" ? "+" : "−"}{m.qty}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-clinic-muted">{fmtDate(m.date)} · {m.reason} · {m.by}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {editing && (
        <ItemForm
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(s) => { store.upsertStockItem(s); setEditing(null); }}
        />
      )}
      {moving && <MoveForm item={moving.item} type={moving.type} onClose={() => setMoving(null)} />}
    </div>
  );
}

function ItemForm({ item, onClose, onSave }: { item: StockItem | null; onClose: () => void; onSave: (s: StockItem) => void }) {
  const { db } = useStore();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "Insumos");
  const [unit, setUnit] = useState(item?.unit ?? "unidad");
  const [stock, setStock] = useState(item?.stock ?? 0);
  const [minStock, setMinStock] = useState(item?.minStock ?? 1);
  const [cost, setCost] = useState(item?.cost ?? 0);
  return (
    <Modal title={item ? "Editar ítem" : "Nuevo ítem"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría"><input className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
          <Field label="Unidad"><input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unidad, caja x50…" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Stock"><input type="number" min={0} className={inputCls} value={stock} onChange={(e) => setStock(Number(e.target.value))} /></Field>
          <Field label="Mínimo"><input type="number" min={0} className={inputCls} value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} /></Field>
          <Field label="Costo (Gs)"><input type="number" min={0} className={inputCls} value={cost} onChange={(e) => setCost(Number(e.target.value))} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: item?.id ?? `s_${Date.now()}`, clinicId: db.clinics[0].id,
                name: name.trim(), category: category.trim() || "Insumos", unit: unit.trim() || "unidad",
                stock, minStock, cost,
              })
            }
          >
            Guardar
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function MoveForm({ item, type, onClose }: { item: StockItem; type: "entrada" | "salida"; onClose: () => void }) {
  const store = useStore();
  const { db, session } = store;
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const max = type === "salida" ? item.stock : 9999;
  return (
    <Modal title={`${type === "entrada" ? "Entrada" : "Salida"} — ${item.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-clinic-bg p-3 text-sm">
          Stock actual: <b className="font-mono">{item.stock}</b> {item.unit} · mínimo <b className="font-mono">{item.minStock}</b>
        </div>
        <Field label="Cantidad">
          <input type="number" min={1} max={max} className={inputCls} value={qty} onChange={(e) => setQty(Math.min(max, Math.max(1, Number(e.target.value))))} />
        </Field>
        <Field label="Motivo">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "entrada" ? "Compra proveedor…" : "Consumo consultorio…"} />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
          <Btn
            disabled={qty < 1 || !reason.trim() || (type === "salida" && qty > item.stock)}
            onClick={() => {
              const m: StockMove = {
                id: `m_${Date.now()}`, clinicId: db.clinics[0].id, itemId: item.id,
                date: new Date().toISOString(), type, qty, reason: reason.trim(), by: session!.name,
              };
              store.addStockMove(m);
              onClose();
            }}
          >
            Registrar {type}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
