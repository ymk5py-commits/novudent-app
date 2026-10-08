import type { Metadata } from "next";

/** El alta de clínicas de Novum: no se indexa. Es interno. robots.txt ya la saca del rastreo; esto lo repite en la página, por si la URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
