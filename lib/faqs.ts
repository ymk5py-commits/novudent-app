/** FAQ del sitio público — fuente única para la sección visible (SeccionFaq)
 *  y el JSON-LD FAQPage (app/page.tsx).
 *
 *  Vive en módulo PLANO a propósito: importar un array desde un archivo
 *  "use client" (Landing.tsx) en un Server Component devuelve un client
 *  reference, no el valor — y `.map()` revienta en el build. */
export const FAQS = [
  {
    q: "¿Necesito instalar algo?",
    a: "No. Novudent es 100% web: funciona en el navegador de la computadora, la tablet o el celular, con tus datos guardados en la nube.",
  },
  {
    q: "¿El odontograma marca superficies?",
    a: "Sí: cada pieza tiene sus cinco superficies (mesial, distal, vestibular, lingual y oclusal). Marcás una caries en mesial o una restauración en vestibular y queda pintada en el tablero, con quién la registró y cuándo.",
  },
  {
    q: "¿Cómo evita errores en los cobros?",
    a: "Cada cobro pasa por estados fijos —enviado, retenido, facturado— y el sistema revisa los datos antes de enviarlo. Si algo no cierra, queda retenido con el motivo a la vista en vez de perderse.",
  },
  {
    q: "¿Quién ve los datos de mis pacientes?",
    a: "Solo tu equipo, y cada persona según su rol: la recepción cobra pero no ve los números del negocio, y el profesional escribe la ficha sin manejar la caja. Los usuarios los crea el administrador de la clínica.",
  },
  {
    q: "¿Cuánto tarda la puesta en marcha?",
    a: "Una semana hábil. Los días 1 y 2 relevamos cómo trabaja tu clínica y configuramos el sistema, y te entregamos el documento de configuración; los días 3 y 4 migramos tus datos, y el día 5 capacitamos a tu equipo.",
  },
  {
    q: "¿Puedo traer mis datos de otro sistema?",
    a: "Sí. Durante la puesta en marcha migramos tus pacientes desde otro sistema, planillas o papel, y capacitamos a tu equipo.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Pedís una demo desde el formulario. Te contactamos dentro de las 24 horas hábiles, te mostramos el sistema funcionando y, si te sirve, abrimos la cuenta de tu clínica.",
  },
] as const;
