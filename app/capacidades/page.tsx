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
      titulo={<>Ocho herramientas, <span className="text-sv-mint">cero relleno</span>.</>}
      intro="Novudent no se vende por módulos: son las ocho herramientas que mueven una clínica dental, integradas entre sí y pulidas hasta el detalle. Recorré la lista completa."
    >
      <div className="rounded-[1.5rem] bg-white py-2">
        {CAPACIDADES.map((c, i) => (
          <div
            key={c.n}
            className={`lp-row group grid grid-cols-12 items-baseline gap-x-5 gap-y-2 px-6 py-7 transition-colors duration-300 hover:bg-sv-paper2 sm:px-8 ${
              i > 0 ? "border-t border-sv-line/70" : ""
            }`}
          >
            <div className="col-span-2 sm:col-span-1">
              <span className="font-logo text-lg font-extralight text-sv-mintInk">{c.n}</span>
              <span className="lp-num-rule mt-1 hidden sm:block" />
            </div>
            <div className="col-span-10 sm:col-span-5">
              <h2 className="font-logo text-[1.4rem] font-light leading-snug text-sv-ink transition-transform duration-300 ease-out group-hover:translate-x-1.5">
                {c.t}
              </h2>
            </div>
            <div className="col-span-12 text-[15px] font-light leading-relaxed text-sv-muted transition-colors duration-300 group-hover:text-sv-ink/80 sm:col-span-6">
              {c.d}
            </div>
          </div>
        ))}
      </div>
    </PaginaSeccion>
  );
}
