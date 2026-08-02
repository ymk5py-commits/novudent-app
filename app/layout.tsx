import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Open_Sans, Jost, Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { StoreProvider } from "@/lib/store";

/** DOS SISTEMAS TIPOGRÁFICOS, a propósito.
 *
 *  1. EL PANEL (`/app/*`) usa **Open Sans**: es la tipografía del panel de
 *     Dentalink, verificada leyendo el CSS de la app real
 *     (`auradentalclinic.dentalink.cl`), no deducida de una captura:
 *     `body { font: 400 14px "Open Sans", sans-serif; color:#333 }`. Carlos la
 *     pidió idéntica para la paridad 1:1. Esa directiva manda sobre cualquier
 *     preferencia estética — no tocar.
 *
 *  2. LA LANDING y las páginas públicas son marketing propio y NO tienen por qué
 *     parecerse a Dentalink. Ahí va el par editorial: **Bricolage Grotesque**
 *     para display (variable, con carácter — sin Inter ni Geist) e **Instrument
 *     Sans** para cuerpo. JetBrains Mono queda para datos y etiquetas, que es
 *     donde un mono se gana el lugar (cifras tabulares, códigos FDI, estados).
 *
 *  Bricolage e Instrument son variables: next/font NO admite `weight` en fuentes
 *  variables — el eje se pide desde CSS con font-weight/font-variation-settings. */
const openSans = Open_Sans({ subsets: ["latin"], weight: ["300", "400", "600", "700"], variable: "--font-open-sans", display: "swap" });
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-jost", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Novudent — Software de gestión para clínicas dentales", template: "%s · Novudent" },
  description:
    "Agenda inteligente, odontograma interactivo FDI, ficha clínica, formularios y facturación con estados — todo en la nube. Software dental hecho para Paraguay, por NOVUM.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0F1F3D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${openSans.variable} ${jost.variable} ${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-sans">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
