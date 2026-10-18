/**
 * Consentimiento de cookies. Una sola fuente de verdad para el banner, la página de cookies y
 * Analytics: nada que no sea estrictamente necesario se carga antes de que la persona elija.
 *
 * - Necesarias: sesión, preferencias y este mismo consentimiento. Siempre activas.
 * - Analítica: Google Analytics (gtag.js, ver lib/analitica.ts). Solo con consentimiento explícito.
 *
 * Se guarda en localStorage (no es una cookie, pero cumple el mismo rol y la ley pide lo mismo:
 * elección libre, igual de fácil aceptar que rechazar, y poder cambiarla después).
 */
import { PAGINAS_PUBLICAS } from "./seo";

export const CLAVE_CONSENTIMIENTO = "novudent.consentimiento.v1";
/** Subir si cambian las categorías: vuelve a preguntar. */
export const VERSION_CONSENTIMIENTO = 1;

export interface Consentimiento {
  version: number;
  analitica: boolean;
  fecha: string; // ISO
}

const EVENTO = "novudent:consentimiento";
const EVENTO_ABRIR = "novudent:abrir-preferencias";

export function leerConsentimiento(): Consentimiento | null {
  if (typeof window === "undefined") return null;
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CONSENTIMIENTO) || "null") as Consentimiento | null;
    return c && c.version === VERSION_CONSENTIMIENTO ? c : null;
  } catch {
    return null;
  }
}

export function guardarConsentimiento(analitica: boolean): Consentimiento {
  const c: Consentimiento = { version: VERSION_CONSENTIMIENTO, analitica, fecha: new Date().toISOString() };
  try { localStorage.setItem(CLAVE_CONSENTIMIENTO, JSON.stringify(c)); } catch {}
  window.dispatchEvent(new CustomEvent<Consentimiento>(EVENTO, { detail: c }));
  return c;
}

/** Avisa cada vez que la persona decide (o cambia de opinión). Devuelve la función para desuscribirse. */
export function alCambiarConsentimiento(fn: (c: Consentimiento) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<Consentimiento>).detail);
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}

/** El enlace «Configurar cookies» del pie y de /cookies abre el panel desde cualquier página. */
export function abrirPreferencias() {
  window.dispatchEvent(new Event(EVENTO_ABRIR));
}
export function alAbrirPreferencias(fn: () => void): () => void {
  window.addEventListener(EVENTO_ABRIR, fn);
  return () => window.removeEventListener(EVENTO_ABRIR, fn);
}

/** Las únicas páginas que mide Analytics: las del sitio público (las mismas del sitemap). Google recibe la URL entera de cada página
 *  que mide, y en el panel esa URL lleva ids de pacientes (`/app/pacientes/<id>/planes`) y en los enlaces del paciente, su credencial
 *  (`/confirmar/<cid>/<token>`, `/firmar/<token>`, `/videoconsulta/<token>`). Por eso es una lista cerrada: una página nueva arranca sin
 *  analítica hasta que se suma a `PAGINAS_PUBLICAS`. */
const RUTAS_CON_ANALITICA = new Set(PAGINAS_PUBLICAS.map((p) => p.ruta));

export function rutaConAnalitica(ruta: string): boolean {
  const camino = ruta.split(/[?#]/)[0];
  return RUTAS_CON_ANALITICA.has(camino.length > 1 ? camino.replace(/\/+$/, "") : camino);
}

