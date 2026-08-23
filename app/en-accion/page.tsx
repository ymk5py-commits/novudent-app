import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionAccion } from "@/components/Landing";

export const metadata: Metadata = {
  title: "El producto en acción — consultorio y app en un loop",
  description:
    "Una animación con el producto real: la cita se agenda, el dentista atiende, el hallazgo se marca en la pieza 16 y el cobro pasa a facturado. Catorce segundos del día completo de una consulta en Novudent.",
  alternates: { canonical: "/en-accion" },
};

export default function EnAccionPage() {
  return (
    <PaginaSeccion
      activa="/en-accion"
      etiqueta="En acción"
      titulo={<>Mirá Novudent <span className="text-sv-mint">trabajando solo</span>.</>}
      intro="El día completo de una consulta, en un loop de catorce segundos: la cita se agenda, el hallazgo se marca en la pieza, el cobro se factura. No hay maquillaje — el tablero es el odontograma real del sistema."
    >
      <SeccionAccion />
    </PaginaSeccion>
  );
}
