import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionOdontograma } from "@/components/Landing";

export const metadata: Metadata = {
  title: "Odontograma digital por superficies FDI",
  description:
    "Odontograma interactivo: 32 piezas FDI con 5 superficies cada una. Caries, coronas, endodoncias e implantes con autor y fecha. Probalo acá mismo.",
  alternates: { canonical: "/odontograma" },
};

export default function OdontogramaPage() {
  return (
    <PaginaSeccion
      activa="/odontograma"
      etiqueta="Odontograma"
      titulo="El diente entero, marcado donde corresponde."
      intro="No un dibujito con colores: 32 piezas FDI con morfología real y cinco superficies por pieza. Tocá el tablero de abajo — es el odontograma de verdad, corriendo en tu navegador."
    >
      <div className="pb-4">
        <SeccionOdontograma />
      </div>

      {/* copy único de la página (la home no lo tiene): SEO sin duplicar contenido */}
      <div className="mt-14 grid gap-6 sm:grid-cols-3">
        {[
          { t: "5 superficies por pieza", d: "Mesial, distal, vestibular, lingual y oclusal. La caries se marca en la cara que está, no en el diente entero." },
          { t: "Auditoría completa", d: "Cada marca guarda quién la hizo y cuándo. El historial del hallazgo no se pisa ni se pierde." },
          { t: "Estados clínicos reales", d: "Caries, restaurado, corona, endodoncia, implante, extracción indicada y ausente — con el código de color del consultorio." },
        ].map((x) => (
          <div key={x.t} className="border-t border-lp-ink pt-4">
            <h2 className="text-[20px] font-bold text-lp-ink">{x.t}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-lp-muted">{x.d}</p>
          </div>
        ))}
      </div>
    </PaginaSeccion>
  );
}
