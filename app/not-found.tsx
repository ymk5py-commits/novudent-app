import Link from "next/link";
import { Logotipo } from "@/components/Marca";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-clinic-bg px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-clinic-border bg-white p-8 text-center shadow-card">
        <Logotipo className="mx-auto h-10 w-auto" />
        <h1 className="mt-8 text-2xl font-extrabold text-clinic-text">Página no encontrada</h1>
        <p className="mt-2 text-sm text-clinic-muted">Revisá la dirección o volvé al inicio.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-azure-600 px-5 py-3 text-sm font-bold text-white hover:bg-azure-700">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
