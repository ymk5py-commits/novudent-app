/** @type {import('next').NextConfig} */

// Cabeceras de seguridad aplicadas a TODA respuesta. Cierran clickjacking de las
// páginas públicas (firmar/pagar/encuestas), MIME-sniffing y fuga de Referer.
//
// CSP: `frame-ancestors` es la mitigación principal de clickjacking. Además se
// fijan directivas que NO dependen de nonces y por lo tanto no rompen nada:
//   - object-src 'none'      → mata <object>/<embed> (plugins, viejo vector XSS)
//   - base-uri 'self'        → un HTML inyectado no puede reescribir los URLs
//                              relativos con <base href="//atacante.com">
//   - form-action 'self'     → ningún formulario puede POSTear credenciales a
//                              otro dominio (no hay forms con action externa)
//   - upgrade-insecure-requests → subrecursos http:// ascienden a https://
// El script-src con nonces (para cerrar el XSS del todo) sigue como hardening
// posterior: Firebase, Recharts, framer-motion y el iframe de Jitsi exigen
// revisarlo con cuidado.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
  },
];

// Un solo dominio (SEO, 8-oct-2026): las páginas que se abren por la URL de Vercel van al dominio propio con una redirección permanente,
// así buscadores y personas consolidan todo en un lugar (el canonical ya apuntaba ahí). La API NO se redirige: hay integraciones que la
// llaman directo y un POST redirigido se pierde. Las URLs de preview de Vercel (otros hosts) no se tocan. Test: lib/dominioPropio.test.ts.
const DOMINIO_PROPIO = (process.env.NEXT_PUBLIC_SITE_URL || "https://novudent.novumholding.lat").replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/:path((?!api(?:/|$)).*)",
        has: [{ type: "host", value: "novudent-app.vercel.app" }],
        destination: `${DOMINIO_PROPIO}/:path`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
