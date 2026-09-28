import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Navy de la marca Novudent (identidad del 27/9/2026, ver lib/marca.ts)
        navy: {
          700: "#0B2A5B",
          800: "#051735",
          900: "#041230",
          950: "#020B20",
        },
        // Azul de la marca: el del diente del isologo. 600 = botones y links (5,4:1 sobre blanco)
        azure: {
          50: "#EBF6FE",
          100: "#D2ECFC",
          200: "#A6D9F8",
          300: "#5CBDF2",
          500: "#04A9F2",
          600: "#0369C9",
          700: "#0550A8",
        },
        // Superficie clínica clara
        clinic: {
          bg: "#F3F6FB",
          card: "#FFFFFF",
          border: "#DDE5F0",
          text: "#102747",
          muted: "#586A82",
        },
        /* Identidad de la LANDING (referencia: la propuesta de several.).
         * Va aparte a propósito: el panel `/app/*` es el clon 1:1 de Dentalink y
         * usa navy/azure/clinic — si se reescribieran esos tokens, el panel
         * cambiaría de color con él. Estos solo los usa la web pública. */
        sv: {
          ink: "#051735",     // navy profundo: hero, píldoras, titulares
          ink2: "#0A2A5E",    // navy un punto más claro, para degradés
          mint: "#36D2FF",    // celeste del diente (antes menta). SOLO sobre navy o en trazos/áreas grandes:
                              // sobre blanco no llega a 4.5:1, no sirve para texto chico
          mintInk: "#0550A8", // el menta legible: texto y links sobre claro (~5:1)
          paper: "#E9E9E9",   // fondo de página: gris cálido, NO blanco (clave del look)
          paper2: "#F1F1F1",  // bandas alternas
          line: "#D5D5D8",    // reglas finas y bordes de tarjeta
          muted: "#545B6B",   // texto secundario que sí pasa AA sobre paper
        },
        /* Landing (Hallmark): cada color apunta a un token OKLCH de app/globals.css. */
        lp: {
          surface: "var(--lp-surface)", paper: "var(--lp-paper)", paper2: "var(--lp-paper-2)", paper3: "var(--lp-paper-3)",
          rule: "var(--lp-rule)", rule2: "var(--lp-rule-strong)", neutral: "var(--lp-neutral)", muted: "var(--lp-muted)",
          ink: "var(--lp-ink)", ink2: "var(--lp-ink-2)", onink: "var(--lp-on-ink)", oninkmuted: "var(--lp-on-ink-muted)",
          accent: "var(--lp-accent)", accentink: "var(--lp-accent-ink)", accentwash: "var(--lp-accent-wash)",
          focus: "var(--lp-focus)", alert: "var(--lp-alert)", alertwash: "var(--lp-alert-wash)",
          primary: "var(--lp-primary)", primaryhover: "var(--lp-primary-hover)", primarywash: "var(--lp-primary-wash)", primarysoft: "var(--lp-primary-soft)",
        },
        state: {
          ok: "#0B7E57",
          okbg: "#DEF7EC",
          warn: "#B45309",
          warnbg: "#FEF3C7",
          err: "#C81E1E",
          errbg: "#FDE8E8",
          info: "#0550A8",
          infobg: "#EBF6FE",
          hold: "#92400E",
          holdbg: "#FFEDD5",
        },
      },
      fontFamily: {
        // `sans` = la del panel, igual a Dentalink (verificado en su CSS). No tocar.
        sans: ["var(--font-open-sans)", "ui-sans-serif", "system-ui"],
        // `logo` = Jost, para display de la landing y el logotipo del producto.
        logo: ["var(--font-jost)", "ui-sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace"],
        // `lp` = Inter, texto y títulos de la web pública.
        lp: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(5,23,53,0.035), 0 8px 24px -18px rgba(5,23,53,0.18)",
        pop: "0 20px 48px -24px rgba(5,23,53,0.28), 0 4px 16px -8px rgba(5,23,53,0.1)",
      },
    },
  },
  plugins: [],
};
export default config;
