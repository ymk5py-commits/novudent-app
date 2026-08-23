import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionOdontograma } from "@/components/Landing";

export const metadata: Metadata = {
  title: "Odontograma digital por superficies FDI",
  description:
    "32 piezas FDI con morfología real y 5 superficies marcables por pieza (M·D·V·L·O). Caries, coronas, endodoncia e implantes con autor y fecha: el odontograma de Novudent es interactivo — probalo acá mismo.",
  alternates: { canonical: "/odontograma" },
};

export default function OdontogramaPage() {
  return (
    <PaginaSeccion
      activa="/odontograma"
      etiqueta="Odontograma"
      titulo={<>El diente entero, marcado <span className="text-sv-mint">donde corresponde</span>.</>}
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
          <div key={x.t} className="rounded-[1.25rem] bg-white p-6 shadow-card">
            <h2 className="font-logo text-[1.3rem] font-light text-sv-ink">{x.t}</h2>
            <p className="mt-2 text-[14.5px] font-light leading-relaxed text-sv-muted">{x.d}</p>
          </div>
        ))}
      </div>
    </PaginaSeccion>
  );
}
