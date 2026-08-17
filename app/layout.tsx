import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Open_Sans, Jost, JetBrains_Mono } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import HydrationGuard from "@/components/HydrationGuard";
/** OJO: estas constantes se importan del módulo PLANO, no de HydrationGuard.
 *  Este archivo es un Server Component; importarlas de un módulo `"use client"`
 *  las convierte en proxies y el script inline sale con `[object Object]`. */
import { MOTION_FALLBACK_CLASS, HYDRATION_GRACE_MS } from "@/lib/motion-fallback";
import { SITE_URL } from "@/lib/site";

/** TIPOGRAFÍA.
 *
 *  El PANEL (`/app/*`) usa **Open Sans**: es la del panel de Dentalink,
 *  verificada leyendo el CSS de la app real (`auradentalclinic.dentalink.cl`),
 *  no deducida de una captura: `body { font: 400 14px "Open Sans", sans-serif }`.
 *  Carlos la pidió idéntica para la paridad 1:1 — no tocar.
 *
 *  La landing y las páginas públicas usan **Jost** para display (`font-logo`) y
 *  **JetBrains Mono** para datos y etiquetas. */
const openSans = Open_Sans({ subsets: ["latin"], weight: ["300", "400", "600", "700"], variable: "--font-open-sans", display: "swap" });
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-jost", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  // metadataBase = dominio propio: sin esto Next.js no emitía canonical ni
  // og:url absolutos y Google indexaba la URL de Vercel en vez del dominio.
  metadataBase: new URL(SITE_URL),
  title: { default: "Novudent — Software de gestión para clínicas dentales", template: "%s · Novudent" },
  description:
    "Agenda inteligente, odontograma interactivo FDI, ficha clínica, formularios y facturación con estados — todo en la nube. Software dental hecho para Paraguay, por NOVUM.",
  applicationName: "Novudent",
  keywords: ["software dental", "gestión de clínica dental", "odontograma", "agenda odontológica", "ficha clínica dental", "software odontológico Paraguay", "Dentalink alternativa"],
  authors: [{ name: "NOVUM Holding" }],
  // Canonical al dominio propio en TODAS las páginas — también en las que
  // responden por la .vercel.app — para que Google consolide todo en un lugar.
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Novudent",
    locale: "es_PY",
    url: SITE_URL,
    title: "Novudent — Software de gestión para clínicas dentales",
    description:
      "La clínica entera, en una sola pantalla. Agenda, odontograma por superficies, ficha clínica y facturación con estados. Hecho para Paraguay.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Novudent — Software de gestión para clínicas dentales",
    description: "Agenda, odontograma FDI, ficha clínica y facturación con estados. Software dental para Paraguay, por NOVUM.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0F1F3D",
  width: "device-width",
  initialScale: 1,
};

/** Arranca el temporizador anti-página-en-blanco ANTES de que corra nada de
 *  React. Si el bundle no hidrata, a los 4 s marca <html> y el CSS revela todo
 *  lo que framer-motion dejó en opacity:0 en el HTML del servidor.
 *  `HydrationGuard` lo cancela cuando React efectivamente hidrata.
 *  Ver components/HydrationGuard.tsx para el razonamiento completo. */
const MOTION_FALLBACK_BOOT = `window.__novudentMotionTimer=setTimeout(function(){document.documentElement.classList.add("${MOTION_FALLBACK_CLASS}")},${HYDRATION_GRACE_MS})`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${openSans.variable} ${jost.variable} ${mono.variable}`}>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: MOTION_FALLBACK_BOOT }} />
        <HydrationGuard />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
