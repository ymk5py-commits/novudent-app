/* ⚠️ BORRADOR sin revisión legal — ver components/landing/PaginaLegal.tsx. */
import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal, { Contacto } from "@/components/landing/PaginaLegal";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Las condiciones para usar el sitio y el servicio de Novudent: cuentas, pagos, datos de la clínica y responsabilidades.",
  alternates: { canonical: "/terminos" },
};

export default function TerminosPage() {
  return (
    <PaginaLegal ruta="/terminos" titulo="Términos de uso">
      <p>
        Estos términos rigen el uso del sitio y del servicio Novudent, de NOVUM Holding (Asunción, Paraguay). Al usar el
        sitio o abrir una cuenta, los aceptás.
      </p>

      <h2>El servicio</h2>
      <p>
        Novudent es un software web para gestionar clínicas dentales: agenda, ficha clínica, odontograma, presupuestos,
        cobros y reportes, según el plan contratado. Lo que incluye cada plan está en <Link href="/precios">precios</Link>.
      </p>

      <h2>Cuentas y usuarios</h2>
      <p>
        La cuenta de una clínica la abre Novudent. El administrador de la clínica crea los usuarios de su equipo y es
        responsable de quién accede y con qué rol. Cada persona debe cuidar su contraseña y no compartirla.
      </p>

      <h2>Precios y pagos</h2>
      <p>
        Los precios publicados están en guaraníes. La puesta en marcha se paga una sola vez; la suscripción, por mes o por
        año según elijas. Si un pago no se acredita, podemos limitar la cuenta a solo lectura hasta regularizarlo: tus
        datos no se borran por eso.
      </p>

      <h2>Los datos de la clínica</h2>
      <p>
        La información que carga la clínica —incluida la de sus pacientes— es de la clínica. Novudent la trata solo para
        prestar el servicio, como se explica en la <Link href="/privacidad">política de privacidad</Link>. La clínica es
        responsable de contar con el consentimiento de sus pacientes cuando corresponda.
      </p>

      <h2>Uso correcto</h2>
      <p>
        No está permitido usar Novudent para fines ilegales, intentar acceder a datos de otra clínica, ni interferir con el
        funcionamiento del servicio.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que el servicio esté siempre disponible, pero puede haber interrupciones por
        mantenimiento o por fallas de proveedores. Novudent es una herramienta de gestión: las decisiones clínicas son de los
        profesionales, incluidas las que usen funciones de inteligencia artificial.
      </p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por las leyes de la República del Paraguay.</p>

      <h2>Contacto</h2>
      <p>Por cualquier consulta sobre estos términos, escribinos a <Contacto />.</p>
    </PaginaLegal>
  );
}
