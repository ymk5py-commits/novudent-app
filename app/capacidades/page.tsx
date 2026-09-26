import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { CAPACIDADES } from "@/lib/capacidades";

export const metadata: Metadata = {
  title: "Capacidades — agenda, odontograma, cobros y más",
  description:
    "Las ocho herramientas que mueven una clínica dental: agenda con confirmación por WhatsApp, odontograma por superficies, presupuestos, caja, inventario, comisiones, ortodoncia, informes y facturación con estados.",
  alternates: { canonical: "/capacidades" },
};

export default function CapacidadesPage() {
  return (
    <PaginaSeccion
      activa="/capacidades"
      etiqueta="Capacidades"
      titulo="Ocho herramientas, cero relleno."
      intro="Novudent no se vende por módulos: son las ocho herramientas que mueven una clínica dental, integradas entre sí y pulidas hasta el detalle. Recorré la lista completa."
    >
      <ol className="divide-y divide-lp-rule border-y border-lp-rule">
        {CAPACIDADES.map((c) => (
          <li key={c.n} className="grid gap-x-6 gap-y-1 py-6 sm:grid-cols-12">
            <span className="text-[14px] font-semibold text-lp-primary sm:col-span-1">{c.n}</span>
            <h2 className="text-[20px] font-semibold leading-snug text-lp-ink sm:col-span-4">{c.t}</h2>
            <p className="text-[15px] leading-relaxed text-lp-muted sm:col-span-7">{c.d}</p>
          </li>
        ))}
      </ol>
    </PaginaSeccion>
  );
}
