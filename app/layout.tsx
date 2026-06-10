import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Manrope, Jost, JetBrains_Mono } from "next/font/google";
import { StoreProvider } from "@/lib/store";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-jost", display: "swap" });
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
    <html lang="es" className={`${manrope.variable} ${jost.variable} ${mono.variable}`}>
      <body className="font-sans">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
