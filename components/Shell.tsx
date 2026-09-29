"use client";
/** Shell estilo Dentalink: header de 2 filas — fila 1 (logo + buscador global +
 *  clínica + campana + ayuda + usuario), fila 2 (nav horizontal con desplegables). En
 *  móvil el nav colapsa en un drawer, que lleva también el usuario y la ayuda. CRM
 *  siempre visible (paridad Dentalink). */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays, Users, Receipt, Settings, LogOut, Search, FileText, ClipboardList, Bell, CreditCard,
  FileSpreadsheet, Wallet, Package, BarChart3, Bot, Menu, X, ChevronDown, Banknote, Handshake, Image as ImageIcon,
  Megaphone, FlaskConical, Coins, Armchair, ShieldCheck, MessageCircle, Star, ListChecks, Leaf, Video, MapPin, Headset,
} from "lucide-react";
import { useAlcance } from "@/lib/useAlcance";
import { useStore, fullName } from "@/lib/store";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";
import { planOf, type PlanFeature } from "@/lib/plan";
import { subscriptionPlanId } from "@/lib/subscription";
import ChangePasswordGate from "@/components/ChangePasswordGate";
import { PageTransition } from "@/components/motion";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import AvisoNoGuardado from "@/components/AvisoNoGuardado";
import AyudaNovum from "@/components/AyudaNovum";
import { sinLeer } from "@/lib/chat";
import { Logotipo } from "@/components/Marca";
import { SaltarAlContenido } from "@/components/SaltarAlContenido";

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
      { href: "/app/facturacion", label: "Facturación", icon: Receipt, perm: "money.view" },
      { href: "/app/presupuestos", label: "Presupuestos", icon: FileSpreadsheet, perm: "budgets.manage" },
      { href: "/app/caja", label: "Cuentas por cobrar", icon: Wallet, perm: "payments.manage", feature: "caja" },
      { href: "/app/liquidaciones", label: "Liquidaciones", icon: Coins, perm: "billing.reports", feature: "liquidaciones" },
      { href: "/app/reportes#desempeno", label: "Reporte de cobranza", icon: BarChart3, perm: "billing.reports", feature: "reportes" },
    ],
  },
  {
    label: "Administración", icon: Settings, children: [
      { href: "/app/gastos", label: "Gastos", icon: Banknote, perm: "expenses.manage", section: "Gestión" },
      { href: "/app/inventario", label: "Inventario", icon: Package, perm: "inventory.manage", feature: "inventario", section: "Gestión" },
      { href: "/app/laboratorios", label: "Laboratorios", icon: FlaskConical, perm: "labs.manage", feature: "laboratorios", section: "Gestión" },
      { href: "/app/liquidaciones", label: "Liquidaciones", icon: Coins, perm: "billing.reports", feature: "liquidaciones", section: "Gestión" },
      { href: "/app/box", label: "Box / Sillones", icon: Armchair, perm: "practice.config", feature: "boxes", section: "Gestión" },
      { href: "/app/esterilizacion", label: "Esterilización", icon: ShieldCheck, perm: "practice.config", section: "Gestión" },
      { href: "/app/encuestas", label: "Encuestas y NPS", icon: Star, perm: "practice.config", section: "Gestión" },
      { href: "/app/videos", label: "Videos 3D", icon: Video, perm: "practice.config", section: "Gestión" },
      { href: "/app/ambiental", label: "Registro ambiental", icon: Leaf, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#convenios", label: "Convenios", icon: Handshake, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#usuarios", label: "Usuarios y profesionales", icon: Users, perm: "practice.config", section: "Gestión" },
      { href: "/app/configuracion#sucursales", label: "Sucursales", icon: MapPin, perm: "practice.config", section: "Gestión" },
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
  { href: "/app/tareas", label: "Tareas", icon: ListChecks, perm: "tasks.use" },
  { href: "/app/crm", label: "CRM", icon: Megaphone, perm: "engagement.forms" },
  { href: "/app/chat", label: "Chat", icon: MessageCircle },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { session, ready, logout, db, backend } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [navOpen, setNavOpen] = useState(false); // drawer móvil
  const [ayuda, setAyuda] = useState(false); // panel «Ayuda de Novum»
  const alcance = useAlcance();
  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const t = q.toLowerCase();
    // Dentista y asistente buscan solo entre sus pacientes, y por nombre: el documento es dato personal.
    return db.patients
      .filter((p) => alcance.vePaciente(p.id))
      .filter((p) => fullName(p).toLowerCase().includes(t) || (alcance.puede("patients.personal") && p.document.includes(t)))
      .slice(0, 6);
  }, [q, db.patients, alcance]);

  const pendings = useMemo(() => {
    // Formularios pendientes: los gestiona la recepción. Retenciones de facturación: quien ve montos.
    const forms = alcance.puede("engagement.forms") ? db.patients.filter((p) => p.forms.some((f) => f.status === "pendiente")).length : 0;
    const hold = alcance.puede("money.view") ? db.billing.filter((b) => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD")).length : 0;
    return forms + hold;
  }, [db, alcance]);

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
          <p className="text-center font-mono text-[11px] font-bold uppercase tracking-widest text-clinic-muted">Cargando Novudent…</p>
        </div>
      </div>
    );
  }

  const me = db.users.find((u) => u.id === session.userId);
  if (me?.mustChangePassword) return <ChangePasswordGate />;
  // El plan sale de la suscripción (subscriptions/{cid}), no del doc de clínica:
  // ese lo escribe el admin de la propia clínica y podría forjar el gating del nav.
  const plan = planOf(subscriptionPlanId(db.subscription, db.clinics[0]));
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
  // Directos sin leer: el store los escucha en vivo, así el número se mueve en cualquier pantalla.
  const sinLeerChat = sinLeer(db.directMessages, session.userId);
  const badgeDe = (href: string) => (href === "/app/chat" ? sinLeerChat : 0);
  const abrirAyuda = () => { setNavOpen(false); setAyuda(true); };
  const salir = () => { logout(); router.replace("/login"); };

  return (
    <div className="app-workspace min-h-screen bg-clinic-bg">
      <SaltarAlContenido />
      {/* ===== Drawer móvil ===== */}
      {navOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} role="presentation" />}
      {/* `inert` cerrado: fuera de pantalla, sus enlaces no deben recibir el foco con Tab. */}
      <aside inert={!navOpen} aria-label="Menú" className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,88vw)] flex-col bg-white transition-transform duration-200 lg:hidden ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}>
        <div className="border-b border-white/10 bg-navy-800 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <Logotipo tono="blanco" className="h-8 w-auto" />
            <button onClick={() => setNavOpen(false)} aria-label="Cerrar menú" className="grid h-9 w-9 place-items-center rounded-[10px] text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 flex items-center gap-2.5 border-t border-white/10 pt-3">
            {logo && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white p-1"><img src={logo} alt="" width={28} height={28} className="max-h-7 max-w-7 object-contain" /></span>}
            <span className="min-w-0 truncate text-xs font-semibold text-white/80">{clinicName}</span>
            <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-azure-200">{plan.label}</span>
          </div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4">
          {nav.map((e) => e.children ? (
            <div key={e.label}>
              <div className="px-3 pb-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-clinic-muted/80">{e.label}</div>
              <div className="space-y-1">
                {e.children.map((it) => <DrawerLink key={it.href} {...it} active={isActive(it.href)} badge={badgeDe(it.href)} />)}
              </div>
            </div>
          ) : (
            <DrawerLink key={e.href} href={e.href!} label={e.label} icon={e.icon} active={isActive(e.href!)} badge={badgeDe(e.href!)} />
          ))}
        </nav>
        {/* En el celular el nombre no entra en la barra: va acá, y la ayuda al lado. */}
        <div className="flex items-center gap-3 border-t border-clinic-border px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-clinic-text">{session.name}</span>
            <span className="block truncate text-[11px] text-clinic-muted">{ROLE_LABEL[session.role]}</span>
          </span>
          <button type="button" onClick={abrirAyuda} aria-haspopup="dialog" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-clinic-border px-3 py-2 text-sm font-bold text-azure-700 transition-colors hover:bg-azure-50">
            <Headset className="h-4 w-4" aria-hidden /> Ayuda
          </button>
          <button type="button" onClick={salir} aria-label="Cerrar sesión" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-clinic-border text-clinic-muted transition-colors hover:bg-clinic-bg hover:text-clinic-text">
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </aside>

      {/* ===== Header 2 filas ===== */}
      <header className="sticky top-0 z-30 border-b border-clinic-border bg-white shadow-[0_2px_12px_-8px_rgba(5,23,53,0.2)]">
        {/* Fila 1 — barra navy de la marca (el diente en color se lee sobre navy) */}
        <div className="app-topbar bg-navy-800">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 sm:h-16 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0">
          <button onClick={() => setNavOpen(true)} aria-label="Abrir menú" className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-white/20 bg-white/10 text-white lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/app" aria-label="Novudent, inicio" className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <Logotipo tono="blanco" className="h-8 w-auto" />
            <span data-tip={`Plan ${plan.label}`} className="hidden rounded-md border border-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-azure-200 2xl:inline">{plan.label}</span>
          </Link>
          {/* En celular el buscador ocupa una segunda línea para que el logo no se comprima. */}
          <div className="relative order-last w-full sm:order-none sm:ml-1 sm:min-w-0 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar paciente…"
              className="w-full rounded-[10px] border border-white/20 bg-white/10 py-2.5 pl-9 pr-3 text-sm text-white transition-[background-color,border-color,box-shadow] placeholder:text-white/60 focus:border-azure-300 focus:bg-white/15 focus:ring-2 focus:ring-azure-300/20"
            />
            {results.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-clinic-border bg-white shadow-pop">
                {results.map((p) => (
                  <Link key={p.id} href={`/app/pacientes/${p.id}`} onClick={() => setQ("")} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-clinic-bg">
                    <span className="font-semibold text-clinic-text">{fullName(p)}</span>
                    <span className="flex items-center gap-2 text-clinic-muted">
                      {p.forms.some((f) => f.status === "pendiente") && <FileText className="h-3.5 w-3.5 text-state-warn" />}
                      {p.historyUpdatePending && <ClipboardList className="h-3.5 w-3.5 text-state-info" />}
                      {alcance.puede("patients.personal") && <>CI {p.document}</>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-[210px] items-center gap-2 truncate rounded-[10px] border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-white xl:inline-flex">
              {logo && <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white p-0.5"><img src={logo} alt="" width={22} height={22} className="max-h-[22px] max-w-[22px] object-contain" /></span>}
              <span className="truncate">{clinicName}</span>
            </span>
            <span
              data-tip={backend === "firebase" ? "Datos guardados en la nube" : "Sin conexión — datos solo en este navegador"}
              data-tip-pos="down"
              className={`hidden items-center gap-1.5 whitespace-nowrap rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider xl:inline-flex ${backend === "firebase" ? "text-emerald-200" : "text-amber-200"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backend === "firebase" ? "bg-emerald-300" : "bg-amber-300"}`} />
              {backend === "firebase" ? "En línea" : "Sin conexión"}
            </span>
            {/* Campana de pendientes. El aria-label pisa el contenido del link, así que
                el número del badge no se anunciaba: con lector de pantalla se oía
                "Notificaciones" sin saber cuántos hay. Va el conteo en la etiqueta, y
                dice "Ver pendientes" porque lleva a la lista de pacientes, no a un
                panel de notificaciones. */}
            <Link
              href={pendings > 0 ? "/app/pacientes" : "#"}
              data-tip={pendings > 0 ? `${pendings} pendiente(s): formularios y retenciones` : "Sin pendientes"}
              data-tip-pos="down-left"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={pendings > 0 ? `Ver pendientes (${pendings})` : "Sin pendientes"}
            >
              <Bell className="h-[18px] w-[18px]" />
              {pendings > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-state-err px-1 font-mono text-[11px] font-bold text-white">{pendings}</span>}
            </Link>
            {/* Ayuda de Novum («call center»): al lado del nombre. Desde md, que es donde
                entra en la barra (el texto, desde lg); en el celular está en el menú,
                junto al nombre. */}
            <button
              type="button"
              onClick={abrirAyuda}
              aria-haspopup="dialog"
              aria-label="Ayuda"
              data-tip="Hablá con Novum: WhatsApp, correo y horario"
              data-tip-pos="down-left"
              className="hidden h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-white/20 bg-white/10 px-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20 lg:inline-flex lg:px-3"
            >
              <Headset className="h-4 w-4" aria-hidden /> <span className="hidden lg:inline">Ayuda</span>
            </button>
            <span className="hidden text-right xl:block xl:whitespace-nowrap">
              <span className="block text-xs font-bold leading-tight text-white">{session.name}</span>
              <span className="block text-[11px] leading-tight text-white/75">{ROLE_LABEL[session.role]}</span>
            </span>
            <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-2 ring-white/40 sm:grid" style={{ background: me?.color ?? "#0369C9" }} aria-hidden>{initials}</span>
            <button onClick={salir} aria-label="Cerrar sesión" data-tip="Cerrar sesión" data-tip-pos="down-left" className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 transition-colors hover:bg-white/15 hover:text-white sm:grid">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>

        {/* Fila 2: nav horizontal (desktop) */}
        <div className="hidden border-t border-white/10 bg-white lg:block">
          <nav className="mx-auto flex max-w-[1440px] items-center gap-1 px-4 py-1.5 sm:px-6">
            {nav.map((e) => e.children
              ? <NavDropdown key={e.label} label={e.label} icon={e.icon} items={e.children} pathname={pathname} />
              : <NavLink key={e.href} href={e.href!} label={e.label} icon={e.icon} active={isActive(e.href!)} badge={badgeDe(e.href!)} />
            )}
          </nav>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 scroll-mt-36 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
        <SubscriptionBanner />
        <PageTransition>{children}</PageTransition>
      </main>

      {/* Fuera del <main> a propósito: es una barra fija al viewport. Dentro de
          PageTransition quedaría atrapada por su transform (contexto de
          apilamiento) y dejaría de posicionarse contra la ventana. */}
      <AvisoNoGuardado />
      {ayuda && <AyudaNovum clinica={clinicName} usuario={session.name} onClose={() => setAyuda(false)} />}
    </div>
  );
}

/** Contador de no leídos junto a un link del menú (hoy: los directos del Chat). */
function Contador({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-state-err px-1 font-mono text-[11px] font-bold leading-none text-white">
      <span aria-hidden>{n}</span>
      <span className="sr-only">{n === 1 ? ", 1 mensaje sin leer" : `, ${n} mensajes sin leer`}</span>
    </span>
  );
}

/* — Link de nav (nivel superior, desktop) — */
function NavLink({ href, label, icon: Icon, active, badge = 0 }: { href: string; label: string; icon: any; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-1.5 rounded-[9px] px-3.5 py-2.5 font-logo text-[14px] font-semibold transition-colors ${active ? "bg-azure-50 text-azure-700" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
    >
      <Icon className="h-4 w-4" /> {label}
      <Contador n={badge} />
    </Link>
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
        className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-2.5 font-logo text-[14px] font-semibold transition-colors ${active || open ? "bg-azure-50 text-azure-700" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
      >
        <Icon className="h-4 w-4" /> {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (() => {
        const renderItem = (it: NavLeaf) => {
          const a = pathname.startsWith(it.href.split(/[?#]/)[0]);
          return (
            <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${a ? "bg-azure-50 text-azure-700" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}>
              <it.icon className="h-4 w-4 shrink-0" /> {it.label}
            </Link>
          );
        };
        const grouped: [string, NavLeaf[]][] = [];
        if (items.some((it) => it.section)) for (const it of items) { const s = it.section ?? "Otros"; const g = grouped.find((x) => x[0] === s); if (g) g[1].push(it); else grouped.push([s, [it]]); }
        return grouped.length ? (
          <div className="absolute left-0 top-full z-50 mt-0.5 grid w-[460px] max-w-[92vw] grid-cols-2 gap-x-2 rounded-xl border border-clinic-border bg-white p-2 shadow-pop">
            {grouped.map(([title, its]) => (
              <div key={title}>
                <div className="px-3 pb-1 pt-1 text-[11px] font-extrabold uppercase tracking-wide text-clinic-muted/70">{title}</div>
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
function DrawerLink({ href, label, icon: Icon, active, badge = 0 }: { href: string; label: string; icon: any; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-azure-600 text-white" : "text-clinic-muted hover:bg-clinic-bg hover:text-clinic-text"}`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} /> {label}
      <Contador n={badge} />
    </Link>
  );
}
