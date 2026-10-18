/** Google Analytics con gtag.js directo, sin el SDK de Firebase (el ID de medición es el mismo de siempre: es el flujo de datos de la web, no
 *  depende de dónde esté la base).
 *
 *  Analytics SOLO con consentimiento (lib/consentimiento.ts) y SOLO en el sitio público (`rutaConAnalitica`). Google recibe la URL entera de
 *  cada página que mide: en el panel lleva ids de pacientes y en los enlaces del paciente, su credencial (`/confirmar/…`, `/firmar/…`). Fuera
 *  del sitio público queda prendida `ga-disable-<id>`, la bandera oficial de Google para no enviar nada: así tampoco sale nada cuando se pasa
 *  del sitio al panel sin recargar, que es cuando Analytics, ya cargado, mide solo cada cambio de página. Arranca recién cuando la persona
 *  aceptó Y está en una página pública. */
import type { Consentimiento } from "./consentimiento";

/** El ID de medición de Google Analytics 4 de Novudent. */
export const ID_DE_MEDICION = "G-DZWVBDNFEP";

interface Consentimientos {
  leerConsentimiento(): Consentimiento | null;
  alCambiarConsentimiento(fn: (c: Consentimiento) => void): () => void;
  rutaConAnalitica(ruta: string): boolean;
}
type Ventana = Window & Record<string, unknown> & { dataLayer?: unknown[] };

/** Conecta Analytics a una ventana (el navegador; en las pruebas, una falsa). */
export function conectarAnalitica({ ventana, documento, consentimiento }: { ventana: Ventana; documento: Document; consentimiento: Consentimientos }): void {
  const apagada = `ga-disable-${ID_DE_MEDICION}`;
  ventana[apagada] = true; // hasta saber en qué página está
  let iniciado = false;
  let consentida = !!consentimiento.leerConsentimiento()?.analitica;

  function cargarGtag() {
    ventana.dataLayer = ventana.dataLayer ?? [];
    // gtag.js espera objetos `arguments` en la capa de datos, no arreglos.
    const gtag = function (this: unknown, ..._args: unknown[]) { ventana.dataLayer!.push(arguments); };
    (ventana as Record<string, unknown>).gtag = gtag;
    gtag("js", new Date());
    gtag("config", ID_DE_MEDICION);
    const script = documento.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${ID_DE_MEDICION}`;
    documento.head.appendChild(script);
  }

  const ajustar = (ruta: string) => {
    const publica = consentimiento.rutaConAnalitica(ruta);
    // Fuera del sitio público, o sin consentimiento (también si se revocó con Analytics ya cargado), queda prendida la bandera oficial para no enviar nada.
    ventana[apagada] = !publica || !consentida;
    if (!consentida || !publica || iniciado) return;
    iniciado = true;
    cargarGtag();
  };

  // Las navegaciones de Next no recargan la página: se ajusta ANTES de cambiar la URL (lo que mida ese cambio ya ve la bandera) y con «atrás».
  for (const metodo of ["pushState", "replaceState"] as const) {
    const original = ventana.history[metodo];
    ventana.history[metodo] = function (this: History, datos: unknown, sinUso: string, url?: string | URL | null) {
      ajustar(url == null ? ventana.location.pathname : new URL(String(url), ventana.location.href).pathname);
      return original.call(this, datos, sinUso, url);
    };
  }
  ventana.addEventListener("popstate", () => ajustar(ventana.location.pathname));
  consentimiento.alCambiarConsentimiento((c) => { consentida = c.analitica; ajustar(ventana.location.pathname); });
  ajustar(ventana.location.pathname);
}

if (typeof window !== "undefined") {
  const ventana = window as unknown as Ventana;
  ventana[`ga-disable-${ID_DE_MEDICION}`] = true; // apagada mientras se carga el módulo del consentimiento
  import("./consentimiento")
    .then((consentimiento) => conectarAnalitica({ ventana, documento: document, consentimiento }))
    .catch(() => {});
}
