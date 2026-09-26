import type { Metadata } from "next";
import { PaginaSeccion } from "@/components/landing/Chrome";
import { SeccionFlujo, SeccionOdontograma } from "@/components/Landing";

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
      titulo="Cómo trabaja una clínica con Novudent, de la agenda al control"
      intro="Cinco etapas del recorrido de un paciente en la clínica, con Novudent de fondo: agendar, atender, cobrar, volver y controlar. Nada de planillas paralelas: cada cosa vive donde corresponde y queda registrada."
    >
      <SeccionFlujo />

      <section className="mt-24 sm:mt-32" aria-labelledby="titulo-probalo">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-lp-primary">Probalo acá mismo</p>
          <h2 id="titulo-probalo" className="text-[clamp(1.8rem,3.6vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-lp-ink">
            El odontograma de Novudent, en tu navegador
          </h2>
        </div>
        <SeccionOdontograma />
      </section>
    </PaginaSeccion>
  );
}
