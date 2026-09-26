/* ⚠️ BORRADOR sin revisión legal — ver components/landing/PaginaLegal.tsx. */
import type { Metadata } from "next";
import PaginaLegal, { Contacto } from "@/components/landing/PaginaLegal";
import { BotonConfigurarCookies } from "@/components/landing/Consentimiento";

export const metadata: Metadata = {
  title: "Cookies",
  description: "Qué cookies y almacenamiento local usa Novudent, cuáles son necesarias y cómo cambiar tu elección.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <PaginaLegal ruta="/cookies" titulo="Cookies">
      <p>
        Usamos cookies y el almacenamiento del navegador para dos cosas: que el sitio funcione (necesarias) y, solo si lo
        aceptás, saber qué páginas se visitan (analítica). Hasta que elijas, no se carga nada de analítica.
      </p>
      <div className="mt-6">
        <BotonConfigurarCookies />
      </div>

      <h2>Necesarias</h2>
      <p>Siempre activas: sin ellas no podés iniciar sesión ni guardar tu elección.</p>
      <table>
        <thead>
          <tr><th scope="col">Nombre</th><th scope="col">Para qué</th><th scope="col">Duración</th></tr>
        </thead>
        <tbody>
          <tr><td><code>novudent.consentimiento.v1</code></td><td>Recordar lo que elegiste en este aviso.</td><td>Hasta que borres los datos del navegador</td></tr>
          <tr><td><code>novudent.session.v1</code>, <code>novudent.db.v4</code></td><td>La sesión y una copia local para seguir trabajando si se corta internet.</td><td>Hasta cerrar sesión</td></tr>
          <tr><td>Firebase Authentication</td><td>Mantener tu sesión iniciada de forma segura.</td><td>Hasta cerrar sesión</td></tr>
        </tbody>
      </table>

      <h2>Analítica (opcional)</h2>
      <p>Solo con tu consentimiento. Nunca incluye datos de pacientes.</p>
      <table>
        <thead>
          <tr><th scope="col">Nombre</th><th scope="col">Para qué</th><th scope="col">Duración</th></tr>
        </thead>
        <tbody>
          <tr><td><code>_ga</code>, <code>_ga_*</code></td><td>Google Analytics: contar visitas y ver qué páginas se usan.</td><td>Hasta 2 años</td></tr>
        </tbody>
      </table>

      <h2>Cambiar de opinión</h2>
      <p>
        Podés cambiar tu elección cuando quieras con el botón de arriba o desde «Configurar cookies» al pie de cualquier
        página. Si la rechazás, la analítica deja de cargarse; las cookies que ya existan se borran al limpiar los datos del
        navegador.
      </p>
      <p>Consultas: <Contacto />.</p>
    </PaginaLegal>
  );
}
