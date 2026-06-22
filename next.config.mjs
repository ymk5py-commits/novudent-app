/** @type {import('next').NextConfig} */

// Cabeceras de seguridad aplicadas a TODA respuesta. Cierran clickjacking de las
// páginas públicas (firmar/pagar/encuestas), MIME-sniffing y fuga de Referer.
// NOTA: no fijamos un CSP de recursos (script-src/connect-src) acá porque la app
// carga Firebase, Recharts, framer-motion y el iframe de Jitsi; un CSP estricto
// con nonces queda como hardening posterior. `frame-ancestors` sí es seguro y es
// la mitigación principal de clickjacking.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
