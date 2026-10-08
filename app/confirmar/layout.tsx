import type { Metadata } from "next";

/** La confirmación de una cita por link: no se indexa. El token de la URL es la credencial del paciente. robots.txt ya la saca del rastreo; esto lo repite en la página, por si la URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
