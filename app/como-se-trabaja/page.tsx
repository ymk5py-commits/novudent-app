import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionFlujo } from "@/components/Landing";

export const metadata: Metadata = {
  title: "Cómo se trabaja — de la agenda al control",
  description:
    "El recorrido de un paciente con Novudent: agenda y reservas online, ficha y odontograma por superficies, presupuesto y cobro en cuotas, recontacto y permisos por rol. Sin planillas.",
  alternates: { canonical: "/como-se-trabaja" },
};

export default function ComoSeTrabajaPage() {
  return (
    <PaginaSeccion
      activa="/como-se-trabaja"
      etiqueta="Cómo se trabaja"
      titulo="De que abrís la agenda a que el paciente vuelve."
      intro="Cinco etapas del recorrido de un paciente en la clínica, con Novudent de fondo: agendar, atender, cobrar, volver y controlar. Nada de planillas paralelas: cada cosa vive donde corresponde y queda registrada."
    >
      <SeccionFlujo />
    </PaginaSeccion>
  );
}
