import type { Metadata } from "next";

/** El pago online de una clínica: no se indexa. Lleva datos del paciente en la URL. robots.txt ya la saca del rastreo; esto lo repite en la página, por si la URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
