import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionFlujo } from "@/components/Landing";

export const metadata: Metadata = {
  title: "Cómo se trabaja — de la agenda al cobro",
  description:
    "Un día con Novudent: la mañana arranca con la agenda confirmada por WhatsApp, el hallazgo queda marcado en la pieza del odontograma y el cobro sale con estados auditados. Sin planillas, sin limbo.",
  alternates: { canonical: "/como-se-trabaja" },
};

export default function ComoSeTrabajaPage() {
  return (
    <PaginaSeccion
      activa="/como-se-trabaja"
      etiqueta="Cómo se trabaja"
      titulo={<>De que abrís la agenda a que cobrás, <span className="text-sv-mint">sin fricción</span>.</>}
      intro="Tres momentos de un día cualquiera en la clínica, con Novudent de fondo. Nada de procesos paralelos en planillas: cada cosa vive donde corresponde y queda registrada."
    >
      <SeccionFlujo />
    </PaginaSeccion>
  );
}
