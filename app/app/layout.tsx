import type { Viewport } from "next";
import Shell from "@/components/Shell";

/** El panel arranca con la barra navy de la marca: la barra del navegador del
 *  celular va del mismo color. La web pública es blanca (ver app/layout.tsx). */
export const viewport: Viewport = { themeColor: "#051735" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
