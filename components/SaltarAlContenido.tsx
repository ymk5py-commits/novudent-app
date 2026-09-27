/** Enlace «Saltar al contenido»: invisible hasta que llega el foco con Tab. Lleva al
 *  <main id="contenido"> de la página y evita recorrer todo el menú con el teclado. */
export function SaltarAlContenido() {
  return (
    <a
      href="#contenido"
      className="sr-only rounded-xl bg-navy-800 px-4 py-2.5 text-sm font-bold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:outline-none focus-visible:ring-2 focus-visible:ring-azure-300"
    >
      Saltar al contenido
    </a>
  );
}
