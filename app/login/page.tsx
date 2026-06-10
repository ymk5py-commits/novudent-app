"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, Stethoscope, Headset } from "lucide-react";
import { useStore } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/rbac";

const ICON = { admin: ShieldCheck, dentist: Stethoscope, assistant: Headset } as const;

export default function Login() {
  const { db, login, ready } = useStore();
  const router = useRouter();

  return (
    <div className="grid min-h-screen place-items-center bg-navy-900 p-6" style={{ background: "linear-gradient(160deg,#0F1F3D 0%,#07142C 70%)" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <div className="font-logo text-4xl tracking-[0.25em]">NOVUdent</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.4em] text-white/40">gestión dental · by NOVUM</div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-pop">
          <h1 className="text-lg font-extrabold text-clinic-text">Iniciar sesión (demo)</h1>
          <p className="mt-1 text-sm text-clinic-muted">
            Elegí un usuario para entrar. Cada rol ve y puede hacer cosas distintas (RBAC).
          </p>
          <div className="mt-5 space-y-2.5">
            {ready &&
              db.users.map((u) => {
                const Icon = ICON[u.role];
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      login(u.id);
                      router.replace("/app");
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-clinic-border p-3.5 text-left transition-colors hover:border-azure-300 hover:bg-azure-50"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: u.color }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-clinic-text">{u.name}</span>
                      <span className="block text-xs text-clinic-muted">{ROLE_LABEL[u.role]} · {u.email}</span>
                    </span>
                  </button>
                );
              })}
          </div>
          <p className="mt-5 text-center text-[11px] leading-relaxed text-clinic-muted">
            Demo con datos de ejemplo en tu navegador. En producción: autenticación con
            contraseña/SSO y aislamiento por clínica (multi-tenant).
          </p>
        </div>
      </motion.div>
    </div>
  );
}
