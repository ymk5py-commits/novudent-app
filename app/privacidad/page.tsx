/* ⚠️ BORRADOR sin revisión legal — ver components/landing/PaginaLegal.tsx. */
import type { Metadata } from "next";
import PaginaLegal, { Contacto } from "@/components/landing/PaginaLegal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos junta Novudent, para qué los usa, con quién los comparte y cómo pedir que los corrijan o borren.",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacidadPage() {
  return (
    <PaginaLegal ruta="/privacidad" titulo="Política de privacidad">
      <p>
        Novudent es un software de gestión para clínicas dentales, producto de NOVUM Holding, con domicilio en Asunción,
        Paraguay. Esta política explica qué datos personales tratamos, para qué y qué podés hacer con ellos.
      </p>

      <h2>Dos tipos de datos, dos responsables</h2>
      <ul>
        <li>
          <strong>Datos de quien visita este sitio o nos pide una demo.</strong> Los decidimos y cuidamos nosotros.
        </li>
        <li>
          <strong>Datos de los pacientes que carga cada clínica.</strong> La responsable es la clínica: Novudent los guarda y
          los procesa por cuenta de ella, solo para prestarle el servicio. No los usamos para nada más ni los vendemos.
        </li>
      </ul>

      <h2>Qué datos juntamos en el sitio</h2>
      <ul>
        <li>Lo que escribís en el formulario de demo: nombre, clínica, email, teléfono, plan de interés y tu mensaje.</li>
        <li>La dirección IP desde la que se envía, para frenar envíos masivos. No se muestra en ningún lado.</li>
        <li>Datos de navegación (páginas visitadas, dispositivo), solo si aceptás la analítica en el aviso de cookies.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>
        Para responderte, coordinar la demo y, si contratás, abrir y administrar la cuenta de tu clínica. La analítica,
        si la aceptás, sirve para saber qué partes del sitio funcionan. No vendemos ni cedemos tus datos a terceros para
        publicidad.
      </p>

      <h2>Con quién los compartimos</h2>
      <p>Solo con los proveedores que hacen funcionar el servicio, bajo sus propias condiciones de seguridad:</p>
      <ul>
        <li>Google Firebase (base de datos, autenticación y, si la aceptás, analítica).</li>
        <li>Vercel (servidores donde corre el sitio).</li>
        <li>Resend (envío de correos, por ejemplo el aviso de un pedido de demo).</li>
        <li>Lemon Squeezy (cobro de las suscripciones de las clínicas).</li>
      </ul>
      <p>Algunos de estos proveedores guardan información fuera de Paraguay.</p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Los pedidos de demo, mientras sigamos en contacto o hasta que nos pidas borrarlos. Los datos de una clínica, mientras
        su cuenta esté activa; al cerrarla, la clínica puede pedir una copia antes de que se eliminen.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés pedir ver, corregir o borrar tus datos, o dejar de recibir comunicaciones, escribiendo a <Contacto />. Si sos
        paciente de una clínica que usa Novudent, hacé el pedido a tu clínica: ella decide sobre tu ficha, y nosotros la
        ayudamos a cumplirlo.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, lo vas a ver en esta página con la fecha de actualización de arriba.</p>
    </PaginaLegal>
  );
}
