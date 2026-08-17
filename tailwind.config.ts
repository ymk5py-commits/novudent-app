import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marca NOVUM (sidebar, acentos)
        navy: {
          700: "#15294A",
          800: "#0F1F3D",
          900: "#0B1D3D",
          950: "#07142C",
        },
        // Acento cyan/teal (acercado a Dentalink, manteniendo identidad Novudent)
        azure: {
          50: "#E7F6F9",
          100: "#C3E9F0",
          200: "#93D6E2",
          300: "#4FBED2",
          500: "#14A6C0",
          600: "#0D8199",
          700: "#0B6B80",
        },
        // Superficie clínica clara
        clinic: {
          bg: "#F5F7FB",
          card: "#FFFFFF",
          border: "#E3E8F0",
          text: "#13233F",
          muted: "#5B6B85",
        },
        /* Identidad de la LANDING (referencia: la propuesta de several.).
         * Va aparte a propósito: el panel `/app/*` es el clon 1:1 de Dentalink y
         * usa navy/azure/clinic — si se reescribieran esos tokens, el panel
         * cambiaría de color con él. Estos solo los usa la web pública. */
        sv: {
          ink: "#0A1240",     // navy profundo: hero, píldoras, titulares
          ink2: "#131C55",    // navy un punto más claro, para degradés
          mint: "#2FE3AE",    // acento. SOLO sobre navy o en trazos/áreas grandes:
                              // sobre blanco no llega a 4.5:1, no sirve para texto chico
          mintInk: "#0B7A5B", // el menta legible: texto y links sobre claro (~5:1)
          paper: "#E9E9E9",   // fondo de página: gris cálido, NO blanco (clave del look)
          paper2: "#F1F1F1",  // bandas alternas
          line: "#D5D5D8",    // reglas finas y bordes de tarjeta
          muted: "#545B6B",   // texto secundario que sí pasa AA sobre paper
        },
        state: {
          ok: "#0B7E57",
          okbg: "#DEF7EC",
          warn: "#B45309",
          warnbg: "#FEF3C7",
          err: "#C81E1E",
          errbg: "#FDE8E8",
          info: "#0C7A91",
          infobg: "#E7F6F9",
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
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.06)",
        pop: "0 8px 24px -8px rgba(16,24,40,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
