/** Cliente de solo lectura de la API REST de Firestore para exportar: lista documentos con paginación y descubre subcolecciones. Sin
 *  dependencias; `fetch` y la espera se inyectan para probarlo sin red. Nunca imprime el token ni el contenido de los documentos. */

export class ErrorDeLectura extends Error {
  /** @param {string} mensaje @param {{ estado?: number, ruta?: string, permiso?: boolean }} datos */
  constructor(mensaje, { estado, ruta, permiso = false } = {}) {
    super(mensaje);
    this.name = "ErrorDeLectura";
    this.estado = estado;
    this.ruta = ruta;
    /** `true` si la base negó la lectura (credencial sin permiso o reglas): se informa y se sigue con lo demás. */
    this.permiso = permiso;
  }
}

const REINTENTABLES = new Set([429, 500, 502, 503, 504]);
const segmentos = (ruta) => ruta.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/**
 * @param {{ proyecto: string, token: string, base?: string, fetch?: typeof fetch, esperar?: (ms: number) => Promise<void>, reintentos?: number }} opciones
 */
export function crearCliente({ proyecto, token, base, fetch: pedir = fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 5 }) {
  const BASE = base ?? `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents`;
  const cabeceras = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  /** GET/POST con reintentos (límite de cuota, errores del servidor y cortes de red) y espera creciente. */
  async function solicitar(url, init, ruta) {
    for (let intento = 0; ; intento++) {
      let res;
      try {
        res = await pedir(url, { ...init, headers: cabeceras });
        if (res.ok) return await res.json();
        if (REINTENTABLES.has(res.status) && intento < reintentos) {
          await esperar(Math.min(8000, 500 * 2 ** intento));
          continue;
        }
        throw new ErrorDeLectura(`la base respondió ${res.status} leyendo ${ruta}`, { estado: res.status, ruta, permiso: res.status === 401 || res.status === 403 });
      } catch (e) {
        if (e instanceof ErrorDeLectura) throw e;
        if (intento >= reintentos) throw new ErrorDeLectura(`sin conexión leyendo ${ruta} (${e?.cause?.code ?? e?.name ?? "error"})`, { ruta });
        await esperar(Math.min(8000, 500 * 2 ** intento));
      }
    }
  }

  /** Cada página trae el token de la siguiente. Si la base devuelve uno que ya se usó (el mismo de recién, o uno que da la vuelta), pedir esa
   *  página otra vez no terminaría nunca: se corta con un error (la lectura queda como incompleta) en vez de dar vueltas para siempre.
   *  @param {Set<string>} usados @param {string | undefined} siguiente @param {string} ruta */
  function siguientePagina(usados, siguiente, ruta) {
    if (siguiente && usados.has(siguiente)) throw new ErrorDeLectura(`la base repitió el token de página leyendo ${ruta}`, { ruta });
    if (siguiente) usados.add(siguiente);
    return siguiente;
  }

  return {
    /** Todos los documentos de una colección (`rutaPadre` vacío = de primer nivel), de a páginas. Incluye los «fantasma». */
    async *listarDocumentos(rutaPadre, coleccion, tamanoDePagina = 300) {
      const ruta = [rutaPadre, coleccion].filter(Boolean).join("/");
      const usados = new Set();
      let pagina;
      do {
        const params = new URLSearchParams({ pageSize: String(tamanoDePagina), showMissing: "true" });
        if (pagina) params.set("pageToken", pagina);
        const datos = await solicitar(`${BASE}/${segmentos(ruta)}?${params}`, { method: "GET" }, ruta);
        pagina = siguientePagina(usados, datos.nextPageToken, ruta); // antes de entregar: si el token se repite, esta página tampoco es de fiar (duplicaría líneas)
        for (const documento of datos.documents ?? []) yield documento;
      } while (pagina);
    },

    /** Los nombres de las subcolecciones de un documento (`rutaDocumento` vacío = las colecciones de primer nivel). */
    async listarColecciones(rutaDocumento = "") {
      const url = `${BASE}${rutaDocumento ? `/${segmentos(rutaDocumento)}` : ""}:listCollectionIds`;
      const ruta = rutaDocumento || "(raíz)";
      const nombres = [];
      const usados = new Set();
      let pagina;
      do {
        const datos = await solicitar(url, { method: "POST", body: JSON.stringify({ pageSize: 100, ...(pagina ? { pageToken: pagina } : {}) }) }, ruta);
        pagina = siguientePagina(usados, datos.nextPageToken, ruta);
        nombres.push(...(datos.collectionIds ?? []));
      } while (pagina);
      return nombres;
    },
  };
}
