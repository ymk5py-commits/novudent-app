"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

export default function Root() {
  const { ready, session } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(session ? "/app" : "/login");
  }, [ready, session, router]);
  return <div className="grid min-h-screen place-items-center text-sm text-clinic-muted">Novudent…</div>;
}
