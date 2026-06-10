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
        azure: {
          50: "#E9F2FF",
          100: "#CBE0FF",
          200: "#9AC4FF",
          300: "#5FA1FB",
          500: "#2E83F5",
          600: "#1769E0",
          700: "#1153B8",
        },
        // Superficie clínica clara
        clinic: {
          bg: "#F5F7FB",
          card: "#FFFFFF",
          border: "#E3E8F0",
          text: "#13233F",
          muted: "#5B6B85",
        },
        state: {
          ok: "#0E9F6E",
          okbg: "#DEF7EC",
          warn: "#B45309",
          warnbg: "#FEF3C7",
          err: "#C81E1E",
          errbg: "#FDE8E8",
          info: "#1769E0",
          infobg: "#E9F2FF",
          hold: "#92400E",
          holdbg: "#FFEDD5",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui"],
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
