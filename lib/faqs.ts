/** FAQ del sitio público — fuente única para la sección visible (SeccionFaq)
 *  y el JSON-LD FAQPage (app/page.tsx).
 *
 *  Vive en módulo PLANO a propósito: importar un array desde un archivo
 *  "use client" (Landing.tsx) en un Server Component devuelve un client
 *  reference, no el valor — y `.map()` revienta en el build. */
export const FAQS = [
  {
    q: "¿Necesito instalar algo?",
    a: "No. Novudent es 100% web: navegador de computadora, tablet o celular, con tus datos seguros en la nube (Firebase).",
  },
  {
    q: "¿El odontograma marca superficies?",
    a: "Sí: cada pieza tiene su vista oclusal de 5 superficies (M·D·V·L·O). Marcás caries en mesial o una restauración en vestibular y queda pintado en el tablero, con autor y fecha.",
  },
  {
    q: "¿Cómo evita errores de facturación?",
    a: "Con una máquina de estados estricta y validación de emparejamientos CPT-DX, POS-CPT y modificadores antes de cada envío. Las retenciones (HOLD/MGRHOLD) se asignan solas.",
  },
  {
    q: "¿Quién crea los usuarios?",
    a: "Solo el administrador de la clínica, desde Configuración. Cada usuario entra con su email y contraseña, con los permisos de su rol.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Pedís tu acceso desde el formulario de la página de acceso. Te contactamos dentro de las 24 horas hábiles, te mostramos el sistema funcionando y te abrimos la cuenta con 30 días de prueba. Migramos tus datos sin costo.",
  },
] as const;
