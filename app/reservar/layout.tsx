import type { Metadata } from "next";

/** La reserva online de cada clínica: no se indexa. Lleva el id de la clínica en la URL. robots.txt ya la saca del rastreo; esto lo repite en la página, por si la URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
