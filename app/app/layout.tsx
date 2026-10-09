import type { Metadata, Viewport } from "next";
import Shell from "@/components/Shell";

/** El panel arranca con la barra navy de la marca: la barra del navegador del
 *  celular va del mismo color. La web pública es blanca (ver app/layout.tsx). */
export const viewport: Viewport = { themeColor: "#051735" };

/** El panel no se indexa: está detrás del login (un buscador no ve nada útil) y son datos de clínicas. robots.txt ya lo saca del rastreo
 *  (`disallow: /app`); esto lo dice también en cada página, por si alguna URL llega a un buscador por un enlace. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
