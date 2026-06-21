"use client";
/** Shell estilo Dentalink: header de 2 filas — fila 1 (logo + buscador global +
 *  clínica + campana + usuario), fila 2 (nav horizontal con desplegables). En móvil
 *  el nav colapsa en un drawer. CRM siempre visible (paridad Dentalink). */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays, Users, Receipt, Settings, LogOut, Search, FileText, ClipboardList, Bell, CreditCard,
  FileSpreadsheet, Wallet, Package, BarChart3, Bot, Menu, X, ChevronDown, Banknote, Handshake, Image as ImageIcon,
  Megaphone, FlaskConical, Coins, Armchair, ShieldCheck, MessageCircle, Star,
} from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";
import { planOf, type PlanFeature } from "@/lib/plan";
import ChangePasswordGate from "@/components/ChangePasswordGate";
import { PageTransition } from "@/components/motion";

type NavLeaf = { href: string; label: string; icon: any; perm?: Permission; feature?: PlanFeature; section?: string };
type NavTop = { label: string; href?: string; icon?: any; perm?: Permission; feature?: PlanFeature; children?: NavLeaf[] };

/** Agrupado igual a la barra superior de Dentalink. CRM no lleva gate de feature:
 *  aparece siempre (la página decide si está disponible según el plan). */
const NAV: NavTop[] = [
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/pacientes", label: "Pacientes", icon: Users },
  { href: "/app/caja", label: "Cajas", icon: Wallet, perm: "payments.manage", feature: "caja" },
  {
    label: "Cobranza", icon: Receipt, children: [
      { href: "/app/facturacion", label: "Facturación", icon: Receipt },
      { href: "/app/presupuestos", label: "Presupuestos", icon: FileSpreadsheet, perm: "budgets.manage" },
      { href: "/app/caja", label: "Cuentas por cobrar", icon: Wallet, perm: "payments.manage", feature: "caja" },
      { href: "/app/liquidaciones", label: "Liquidaciones", icon: Coins, perm: "billing.reports", feature: "liquidaciones" },
      { href: "/app/reportes#desempeno", label: "Reporte de cobranza", icon: BarChart3, perm: "billing.reports", feature: "reportes" },
    ],
  },
  {
    label: "Administración", icon: Settings, children: [
      { href: "/app/gastos", label: "Gastos", icon: Banknote, perm: "payments.manage", section: "Gestión" },
      { href: "/app/inventario", label: "Inventario", icon: Package, perm: "inventory.manage", feature: "inventario", section: "Gestión" },
      { href: "/app/laboratorios", label: "Laboratorios", icon: FlaskConical, feature: "laboratorios", section: "Gestión" },
      { href: "/app/liquidaciones", label: "Liquidaciones", icon: Coins, perm: "billing.reports", feature: "liquidaciones", section: "Gestión" },
      { href: "/app/box", label: "Box / Sillones", icon: Armchair, perm: "practice.config", feature: "boxes", section: "Gestión" },
      { href: "/app/esterilizacion", label: "Esterilización", icon: ShieldCheck, perm: "practice.config", section: "Gestión" },
      { href: "/app/encuestas", label: "Encuestas y NPS", icon: Star, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#convenios", label: "Convenios", icon: Handshake, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#usuarios", label: "Usuarios y profesionales", icon: Users, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#fusion", label: "Fusión de fichas", icon: Users, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#arancel", label: "Arancel de precios", icon: FileSpreadsheet, perm: "practice.config", section: "Configuración" },
      { href: "/app/configuracion#consentimientos", label: "Documentos y consentimientos", icon: FileText, perm: "practice.config", section: "Configuración" },
      { href: "/app/configuracion#logotipo", label: "Logotipo", icon: ImageIcon, perm: "practice.config", section: "Configuración" },
      { href: "/app/configuracion#campos", label: "Campos del paciente", icon: ClipboardList, perm: "practice.config", section: "Configuración" },
      { href: "/app/integraciones", label: "Integraciones", icon: Bot, perm: "practice.config", feature: "integraciones", section: "Configuración" },
      { href: "/app/suscripcion", label: "Suscripción", icon: CreditCard, perm: "practice.config", section: "Configuración" },
      { href: "/app/configuracion", label: "Configuración general", icon: Settings, perm: "practice.config", section: "Configuración" },
    ],
  },
  {
    label: "Reportes", icon: BarChart3, children: [
      { href: "/app/reportes#desempeno", label: "Panel de desempeño", icon: BarChart3, perm: "billing.reports", feature: "reportes" },
      { href: "/app/reportes#analisis", label: "Análisis de pacientes", icon: Users, perm: "billing.reports", feature: "reportes" },
      { href: "/app/reportes#excel", label: "Reportes Excel", icon: FileSpreadsheet, perm: "billing.reports", feature: "reportes" },
    ],
  },
  { href: "/app/crm", label: "CRM", icon: Megaphone },
  { href: "/app/chat", label: "Chat", icon: MessageCircle },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, ready, logout, db, backend } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [navOpen, setNavOpen] = useState(false); // drawer móvil
  useEffect(() => { setNavOpen(false); }, [pathname]);

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
      <div className="min-h-screen bg-clinic-bg">
        <div className="h-[104px] border-b border-clinic-border bg-white" />
        <div className="mx-auto max-w-6xl space-y-5 p-8">
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
    );
  }

  const me = db.users.find((u) => u.id === session.userId);
  if (me?.mustChangePassword) return <ChangePasswordGate />;
  const plan = planOf(db.clinics[0]);
  const clinicName = db.clinics[0]?.name ?? "Novudent";
  const logo = db.clinics[0]?.config.logo;

  // Filtrar por rol/plan; un grupo sin hijos visibles se oculta entero.
  const nav: NavTop[] = NAV.map((e) => {
    if (e.children) {
      const kids = e.children.filter((it) => (!it.perm || can(session.role, it.perm)) && (!it.feature || plan.features.includes(it.feature)));
      return kids.length ? { ...e, children: kids } : null;
    }
    const ok = (!e.perm || can(session.role, e.perm)) && (!e.feature || plan.features.includes(e.feature));
    return ok ? e : null;
  }).filter(Boolean) as NavTop[];

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  const initials = session.name.split(" ").map((w) => w[0]).slice(0, 2).join("");

  return (
    <div className="min-h-screen bg-clinic-bg">
      {/* ===== Drawer móvil ===== */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setNavOpen(false)} role="presentation" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white transition-transform duration-200 md:hidden ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 pt-5">
          {logo ? <img src={logo} alt={clinicName} className="h-8 w-auto max-w-[150px] object-contain" /> : <span className="font-logo text-xl tracking-[0.16em] text-navy-800">NOVUdent</span>}
          <button onClick={() => setNavOpen(false)} aria-label="Cerrar menú" className="grid h-9 w-9 place-items-center rounded-xl text-clinic-muted hover:bg-clinic-bg"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {nav.map((e) => e.children ? (
            <div key={e.label}>
              <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-clinic-muted/80">{e.label}</div>
              <div className="space-y-1">
                {e.children.map((it) => <DrawerLink key={it.href} {...it} active={isActive(it.href)} />)}
              </div>
            </div>
          ) : (
            <DrawerLink key={e.href} href={e.href!} label={e.label} icon={e.icon} active={isActive(e.href!)} />
          ))}
        </nav>
      </aside>

      {/* ===== Header 2 filas ===== */}
      <header className="sticky top-0 z-30 border-b border-clinic-border bg-white">
        {/* Fila 1 — barra celeste estilo Dentalink */}
        <div className="bg-azure-600">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button onClick={() => setNavOpen(true)} aria-label="Abrir menú" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/30 bg-white/10 text-white md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <a href="/app" className="flex shrink-0 items-baseline gap-2">
            {logo ? <img src={logo} alt={clinicName} className="h-8 w-auto max-w-[150px] object-contain" /> : <span className="font-logo text-xl tracking-[0.16em] text-white">NOVUdent</span>}
            <span data-tip={`Plan ${plan.label}`} className="hidden rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase tracking-wide text-white sm:inline">{plan.label}</span>
          </a>
          {/* Patient Finder */}
          <div className="relative ml-1 min-w-0 w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar paciente…"
              className="w-full rounded-xl border border-white/25 bg-white/15 py-2.5 pl-9 pr-3 text-sm text-white transition-colors placeholder:text-white/65 focus:border-white focus:bg-white focus:text-clinic-text focus:outline-none focus:placeholder:text-clinic-muted"
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
            <span className="hidden max-w-[180px] truncate text-sm font-bold text-white lg:block">{clinicName}</span>
            <span
              data-tip={backend === "firebase" ? "Datos guardados en la nube" : "Sin conexión — datos solo en este navegador"}
              data-tip-pos="down"
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide sm:inline-flex ${backend === "firebase" ? "bg-state-okbg text-state-ok" : "bg-state-warnbg text-state-warn"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backend === "firebase" ? "bg-state-ok" : "bg-state-warn"}`} />
              {backend === "firebase" ? "En línea" : "Sin conexión"}
            </span>
            <a
              href={pendings > 0 ? "/app/pacientes" : "#"}
              data-tip={pendings > 0 ? `${pendings} pendiente(s): formularios y retenciones` : "Sin pendientes"}
              data-tip-pos="down-left"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="Notificaciones"
            >
              <Bell className="h-[18px] w-[18px]" />
              {pendings > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-state-err px-1 font-mono text-[9.5px] font-bold text-white">{pendings}</span>}
            </a>
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-bold leading-tight text-white">{session.name}</span>
              <span className="block text-[10px] leading-tight text-white/75">{ROLE_LABEL[session.role]}</span>
            </span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-white/40" style={{ background: me?.color ?? "#0E8AA3" }}>{initials}</span>
            <button onClick={() => { logout(); router.replace("/login"); }} aria-label="Cerrar sesión" data-tip="Cerrar sesión" data-tip-pos="down-left" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>

        {/* Fila 2: nav horizontal (desktop) */}
        <div className="hidden border-t border-clinic-border bg-white md:block">
          <nav className="mx-auto flex max-w-6xl items-center gap-0.5 px-3 sm:px-5">
            {nav.map((e) => e.children
              ? <NavDropdown key={e.label} label={e.label} icon={e.icon} items={e.children} pathname={pathname} />
              : <NavLink key={e.href} href={e.href!} label={e.label} icon={e.icon} active={isActive(e.href!)} />
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-7">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}

/* — Link de nav (nivel superior, desktop) — */
function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: any; active: boolean }) {
  return (
    <a
      href={href}
      className={`relative flex items-center gap-1.5 px-3.5 py-3 text-sm font-bold transition-colors ${active ? "text-azure-700" : "text-clinic-muted hover:text-clinic-text"}`}
    >
      <Icon className="h-4 w-4" /> {label}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-azure-600" />}
    </a>
  );
}

/* — Desplegable de nav (Recaudación / Administración) — */
function NavDropdown({ label, icon: Icon, items, pathname }: { label: string; icon: any; items: NavLeaf[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const active = items.some((it) => pathname.startsWith(it.href.split(/[?#]/)[0]));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-bold transition-colors ${active || open ? "text-azure-700" : "text-clinic-muted hover:text-clinic-text"}`}
      >
        <Icon className="h-4 w-4" /> {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-azure-600" />}
      </button>
      {open && (() => {
        const renderItem = (it: NavLeaf) => {
          const a = pathname.startsWith(it.href.split(/[?#]/)[0]);
          return (
            <a key={it.href} href={it.href} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${a ? "bg-azure-50 text-azure-700" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              <it.icon className="h-4 w-4 shrink-0" /> {it.label}
            </a>
          );
        };
        const grouped: [string, NavLeaf[]][] = [];
        if (items.some((it) => it.section)) for (const it of items) { const s = it.section ?? "Otros"; const g = grouped.find((x) => x[0] === s); if (g) g[1].push(it); else grouped.push([s, [it]]); }
        return grouped.length ? (
          <div className="absolute left-0 top-full z-50 mt-0.5 grid w-[460px] max-w-[92vw] grid-cols-2 gap-x-2 rounded-xl border border-clinic-border bg-white p-2 shadow-pop">
            {grouped.map(([title, its]) => (
              <div key={title}>
                <div className="px-3 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-clinic-muted/70">{title}</div>
                {its.map(renderItem)}
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[220px] rounded-xl border border-clinic-border bg-white p-1 shadow-pop">
            {items.map(renderItem)}
          </div>
        );
      })()}
    </div>
  );
}

/* — Link del drawer móvil — */
function DrawerLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: any; active: boolean }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} /> {label}
    </a>
  );
}
