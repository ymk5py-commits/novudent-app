"use client";
/** Shell autenticado: sidebar fija (sec. 5.1) + topbar con buscador global. */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays, Users, Receipt, Settings, LogOut, Search, FileText, ClipboardList, LayoutDashboard,
} from "lucide-react";
import { useStore, fullName } from "@/lib/store";
import { can, ROLE_LABEL } from "@/lib/rbac";

const NAV = [
  { href: "/app", label: "Inicio", icon: LayoutDashboard },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/pacientes", label: "Pacientes", icon: Users },
  { href: "/app/facturacion", label: "Facturación", icon: Receipt },
  { href: "/app/configuracion", label: "Configuración", icon: Settings, perm: "practice.config" as const },
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

  if (!ready || !session) {
    return <div className="grid min-h-screen place-items-center text-sm text-clinic-muted">Cargando Novudent…</div>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar fija */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[218px] flex-col bg-navy-800 text-white">
        <div className="flex items-center gap-2 px-5 pb-6 pt-6">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-azure-500/20 ring-1 ring-azure-300/40 font-logo text-sm text-azure-200">N</span>
          <div className="leading-tight">
            <div className="font-logo text-lg tracking-[0.18em]">NOVUdent</div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">gestión dental</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            if (item.perm && !can(session.role, item.perm)) return null;
            const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "bg-azure-500/20 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4" strokeWidth={2} />
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="text-sm font-bold">{session.name}</div>
          <div className="text-[11px] text-white/50">{ROLE_LABEL[session.role]} · {db.clinics[0]?.name}</div>
          <button onClick={() => { logout(); router.replace("/login"); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Área principal */}
      <div className="ml-[218px] flex min-h-screen flex-1 flex-col">
        {/* Topbar con Patient Finder global */}
        <header className="sticky top-0 z-30 border-b border-clinic-border bg-white/85 backdrop-blur">
          <div className="relative mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar paciente por nombre o CI… (Patient Finder)"
                className="w-full rounded-xl border border-clinic-border bg-clinic-bg py-2 pl-9 pr-3 text-sm focus:border-azure-500 focus:bg-white focus:outline-none"
              />
              {results.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-clinic-border bg-white shadow-pop">
                  {results.map((p) => (
                    <a
                      key={p.id}
                      href={`/app/pacientes/${p.id}`}
                      onClick={() => setQ("")}
                      className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-clinic-bg"
                    >
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
            <span
              data-tip={
                backend === "firebase"
                  ? "Datos sincronizados con Firestore (proyecto novudent-664f3)"
                  : "Firestore no disponible — trabajando con datos locales del navegador.\nCreá la base en Firebase Console → Firestore Database."
              }
              className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
                backend === "firebase" ? "bg-state-okbg text-state-ok" : "bg-state-warnbg text-state-warn"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backend === "firebase" ? "bg-state-ok" : "bg-state-warn"}`} />
              {backend === "firebase" ? "Firebase" : "Local"}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
