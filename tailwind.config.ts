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
        // Papel editorial — SOLO landing y páginas públicas, no el panel.
        // Nada de blanco puro: el papel se entinta hacia el navy de marca, que
        // es lo que hace que la página se lea impresa y no "por defecto".
        paper: {
          DEFAULT: "#FAFBFC",  // oklch(98.4% 0.003 260) — papel base
          2: "#F2F4F8",        // oklch(96.2% 0.006 260) — banda alterna
          3: "#E8EBF1",        // oklch(93.2% 0.008 260) — reposo/hover
          rule: "#D8DEE8",     // hairline, más presente que clinic-border
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
        // `logo` = Jost. Sigue viva porque la usan 33 lugares, varios DENTRO del
        // panel (Shell, configuración, presupuestos, ficha). Cambiarla acá
        // reescribiría el panel en silencio y rompería la paridad Dentalink.
        logo: ["var(--font-jost)", "ui-sans-serif"],
        // Par editorial — landing y páginas públicas, nada del panel.
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
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
