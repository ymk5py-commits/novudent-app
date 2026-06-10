"use client";
/** Shell estilo "Spike admin" adaptado: sidebar blanca con secciones y pill activo,
 *  topbar con buscador global (Patient Finder), campana y avatar. */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays, Users, Receipt, Settings, LogOut, Search, FileText, ClipboardList, LayoutDashboard, Bell, CreditCard,
  FileSpreadsheet, Wallet, Package, BarChart3, Bot,
} from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";

const SECTIONS: { label: string; items: { href: string; label: string; icon: any; perm?: Permission }[] }[] = [
  {
    label: "Principal",
    items: [
      { href: "/app", label: "Inicio", icon: LayoutDashboard },
      { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/app/pacientes", label: "Pacientes", icon: Users },
      { href: "/app/presupuestos", label: "Presupuestos", icon: FileSpreadsheet, perm: "budgets.manage" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/app/caja", label: "Caja", icon: Wallet, perm: "payments.manage" },
      { href: "/app/facturacion", label: "Facturación", icon: Receipt },
      { href: "/app/inventario", label: "Inventario", icon: Package, perm: "inventory.manage" },
      { href: "/app/reportes", label: "Reportes", icon: BarChart3, perm: "billing.reports" },
      { href: "/app/integraciones", label: "Integraciones", icon: Bot, perm: "practice.config" },
      { href: "/app/suscripcion", label: "Suscripción", icon: CreditCard, perm: "practice.config" },
      { href: "/app/configuracion", label: "Configuración", icon: Settings, perm: "practice.config" },
    ],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, ready, logout, db, backend } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const t = q.toLowerCase();
    return db.patients.filter((p) => fullName(p).toLowerCase().includes(t) || p.document.includes(t)).slice(0, 6);
  }, [q, db.patients]);

  const pendings = useMemo(() => {
    const forms = db.patients.filter((p) => p.forms.some((f) => f.status === "pendiente")).length;
    const hold = db.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length;
    return forms + hold;
  }, [db]);

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-[232px] border-r border-clinic-border bg-white md:block" />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-6xl space-y-5">
            <div className="h-9 w-56 animate-pulse rounded-xl bg-clinic-border/60" />
            <div className="grid gap-4 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-clinic-border/50" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
            <div className="h-72 animate-pulse rounded-2xl bg-clinic-border/40" />
            <p className="text-center font-mono text-[10px] font-bold uppercase tracking-widest text-clinic-muted">Cargando Novudent…</p>
          </div>
        </div>
      </div>
    );
  }

  const me = db.users.find((u) => u.id === session.userId);

  return (
    <div className="flex min-h-screen bg-clinic-bg">
      {/* ===== Sidebar blanca (Spike) ===== */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-clinic-border bg-white">
        <div className="px-5 pb-2 pt-6">
          <a href="/app" className="flex items-baseline gap-2">
            <span className="font-logo text-xl tracking-[0.16em] text-navy-800">NOVUdent</span>
          </a>
          <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.3em] text-clinic-muted">gestión dental</div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pt-4">
          {SECTIONS.map((sec) => {
            const items = sec.items.filter((it) => !it.perm || can(session.role, it.perm));
            if (items.length === 0) return null;
            return (
              <div key={sec.label}>
                <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-clinic-muted/80">{sec.label}</div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                          active
                            ? "bg-azure-600 text-white shadow-[0_6px_16px_-6px_rgba(46,131,245,0.55)]"
                            : "text-clinic-muted hover:translate-x-0.5 hover:bg-clinic-bg hover:text-clinic-text"
                        }`}
                      >
                        <item.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        {/* usuario */}
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-clinic-bg p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: me?.color ?? "#1769E0" }}>
              {session.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-clinic-text">{session.name}</span>
              <span className="block text-[10px] text-clinic-muted">{ROLE_LABEL[session.role]}</span>
            </span>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              aria-label="Cerrar sesión"
              data-tip="Cerrar sesión"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-clinic-muted transition-colors hover:bg-white hover:text-state-err"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Área principal ===== */}
      <div className="ml-[232px] flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-clinic-border bg-white/85 backdrop-blur">
          <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
            {/* Patient Finder */}
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar paciente… (Patient Finder)"
                className="w-full rounded-xl border border-clinic-border bg-clinic-bg py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-azure-500 focus:bg-white focus:outline-none"
              />
              {results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-clinic-border bg-white shadow-pop">
                  {results.map((p) => (
                    <a key={p.id} href={`/app/pacientes/${p.id}`} onClick={() => setQ("")} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-clinic-bg">
                      <span className="font-semibold text-clinic-text">{fullName(p)}</span>
                      <span className="flex items-center gap-2 text-clinic-muted">
                        {p.forms.some((f) => f.status === "pendiente") && <FileText className="h-3.5 w-3.5 text-state-warn" />}
                        {p.historyUpdatePending && <ClipboardList className="h-3.5 w-3.5 text-state-info" />}
                        CI {p.document}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* estado backend */}
              <span
                data-tip={backend === "firebase" ? "Datos sincronizados con Firestore" : "Firestore no disponible — datos locales del navegador"}
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide sm:inline-flex ${
                  backend === "firebase" ? "bg-state-okbg text-state-ok" : "bg-state-warnbg text-state-warn"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${backend === "firebase" ? "bg-state-ok" : "bg-state-warn"}`} />
                {backend === "firebase" ? "Firebase" : "Local"}
              </span>
              {/* campana */}
              <a
                href={pendings > 0 ? "/app/pacientes" : "#"}
                data-tip={pendings > 0 ? `${pendings} pendiente(s): formularios y retenciones` : "Sin pendientes"}
                className="relative grid h-10 w-10 place-items-center rounded-xl border border-clinic-border bg-white text-clinic-muted transition-colors hover:text-azure-600"
                aria-label="Notificaciones"
              >
                <Bell className="h-[18px] w-[18px]" />
                {pendings > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-state-err px-1 font-mono text-[9.5px] font-bold text-white">
                    {pendings}
                  </span>
                )}
              </a>
              {/* avatar */}
              <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: me?.color ?? "#1769E0" }}>
                {session.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
