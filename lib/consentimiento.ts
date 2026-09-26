/**
 * Consentimiento de cookies. Una sola fuente de verdad para el banner, la página de cookies y
 * Analytics: nada que no sea estrictamente necesario se carga antes de que la persona elija.
 *
 * - Necesarias: sesión, preferencias y este mismo consentimiento. Siempre activas.
 * - Analítica: Google Analytics (Firebase). Solo con consentimiento explícito.
 *
 * Se guarda en localStorage (no es una cookie, pero cumple el mismo rol y la ley pide lo mismo:
 * elección libre, igual de fácil aceptar que rechazar, y poder cambiarla después).
 */
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
