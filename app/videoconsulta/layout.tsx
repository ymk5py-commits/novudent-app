import type { Metadata } from "next";

/** La sala de videoconsulta: no se indexa. Lleva la cita y su token en la URL. robots.txt ya la saca del rastreo; esto lo repite en la página, por si la URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
