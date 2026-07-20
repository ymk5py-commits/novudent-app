/** Reteñido del motor vendorizado a la paleta Dentalink de Novudent (tailwind.config.ts).
 *  Cubre las 8 variables de "cromado" del motor (fondo, panel, texto, bordes, acento) vía su
 *  propio themeConfig — NO cubre los colores de material por restauración (amalgama/composite/
 *  oro/etc., definidos en registry/restorations.ts), que mantienen la paleta realista original
 *  del motor: es la parte visual que motivó adoptarlo, no un desvío de la fidelidad Dentalink. */
import type { OdontogramThemeConfig } from "./theme";

export const DENTALINK_ODONTOGRAM_THEME: OdontogramThemeConfig = {
  colors: {
    background: "#F5F7FB", // clinic-bg
    panel: "#FFFFFF",      // clinic-card
    card: "#FFFFFF",       // clinic-card
    text: "#13233F",       // clinic-text
    muted: "#5B6B85",      // clinic-muted
    line: "#E3E8F0",       // clinic-border
    accent: "#0E8AA3",     // azure-600
    accent2: "#0E9F6E",    // state-ok
  },
};
