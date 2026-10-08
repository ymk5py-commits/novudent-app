/** URLs limpias del panel (frente E, pedido de Croman del 8-oct-2026: «veo que tiene #, mejorar el vanity url»).
 *
 *  Las secciones del panel eran saltos con `#` (`/app/configuracion#permisos`): no llegan al servidor, no se pueden abrir de nuevo con
 *  la sección elegida y el botón «atrás» no las respeta. Ahora son rutas reales (`/app/configuracion/permisos`, `/app/reportes/graficos`,
 *  `/app/pacientes/<id>/planes`). Los enlaces viejos con `#` o `?tab=` (el manual en PDF, marcadores) siguen andando: `rutaLimpia` dice a
 *  dónde mandarlos. El panel igual NO se indexa (`noindex` en app/app/layout.tsx): esto es para las personas, no para los buscadores.
 *  Módulo puro: tests en lib/rutasPanel.test.ts. */

export type AreaDelPanel = "configuracion" | "reportes" | "pacientes" | "tareas";

/** La sección que abre cada área sin nada más en la URL. Configuración no tiene: es una página larga con secciones. */
const POR_DEFECTO: Record<AreaDelPanel, string> = { configuracion: "", reportes: "desempeno", pacientes: "lista", tareas: "bandeja" };

/** Nombre en la URL → id de la sección en la pantalla (el `id` del HTML en Configuración; la pestaña en las demás). */
const SECCIONES: Record<AreaDelPanel, Record<string, string>> = {
  configuracion: {
    usuarios: "usuarios", permisos: "permisos", sucursales: "sucursales", "fusion-de-fichas": "fusion", convenios: "convenios",
    arancel: "arancel", bancos: "bancos", consentimientos: "consentimientos", logotipo: "logotipo", "agenda-online": "agendamiento",
    "estados-de-cita": "estados-cita", "documentos-clinicos": "documentos-clinicos",
  },
  reportes: { desempeno: "desempeno", graficos: "graficos", "analisis-de-pacientes": "analisis", excel: "excel" },
  pacientes: { analisis: "analisis", estudios: "estudios", configuracion: "configuracion" },
  tareas: { estadisticas: "estadisticas", plazos: "configuracion" },
};

/** Las pestañas de la ficha del paciente (`/app/pacientes/<id>/<pestaña>`). */
export const PESTANAS_DE_FICHA = [
  "datos", "citas", "comentarios", "tareas", "emails", "archivos", "consentimientos", "documentos",
  "resumen", "evoluciones", "antecedentes", "odontograma", "periodoncia", "historial", "radiografias", "copilot", "recetas",
  "planes", "facturacion", "recibir-pago",
] as const;

/** Segundos tramos de `/app/pacientes/…` que son pantallas y no la ficha de un paciente. */
const NO_SON_PACIENTES = new Set(["nuevo", ...Object.keys(SECCIONES.pacientes)]);

const sinBarraFinal = (p: string) => p.replace(/\/+$/, "") || "/";
const decodificar = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** «formularios» es el nombre viejo de «documentos». */
const normalizarPestana = (k: string) => (k === "formularios" ? "documentos" : k);
const esPestana = (k: string) => (PESTANAS_DE_FICHA as readonly string[]).includes(k);
const conConsulta = (ruta: string, params: URLSearchParams) => { const q = params.toString(); return q ? `${ruta}?${q}` : ruta; };

/** La ruta de una sección. La sección por defecto (o una que no existe) es la raíz del área. */
export function rutaDeSeccion(area: AreaDelPanel, id: string): string {
  if (id === POR_DEFECTO[area]) return `/app/${area}`;
  const nombre = Object.entries(SECCIONES[area]).find(([, v]) => v === id)?.[0];
  return nombre ? `/app/${area}/${nombre}` : `/app/${area}`;
}

/** Qué sección pide la URL: el área y el id de la sección (la raíz = la sección por defecto). `null` si no es una de estas pantallas o la
 *  sección no existe. La ficha de un paciente no es una sección (ver `pestanaDeRuta`). */
export function seccionDeRuta(pathname: string): { area: AreaDelPanel; id: string } | null {
  const m = /^\/app\/(configuracion|reportes|pacientes|tareas)(?:\/([^/]+))?$/.exec(sinBarraFinal(pathname));
  if (!m) return null;
  const area = m[1] as AreaDelPanel;
  if (!m[2]) return { area, id: POR_DEFECTO[area] };
  const id = SECCIONES[area][decodificar(m[2])];
  return id ? { area, id } : null;
}

/** La ruta de la ficha de un paciente, en una pestaña si existe. */
export function rutaDeFicha(pacienteId: string, pestana?: string): string {
  const base = `/app/pacientes/${encodeURIComponent(pacienteId)}`;
  const t = pestana ? normalizarPestana(pestana) : "";
  return t && esPestana(t) ? `${base}/${t}` : base;
}

/** La pestaña de la ficha que pide la URL (`/app/pacientes/<id>/<pestaña>`), o `null`. */
export function pestanaDeRuta(pathname: string): string | null {
  const m = /^\/app\/pacientes\/([^/]+)\/([^/]+)$/.exec(sinBarraFinal(pathname));
  if (!m || NO_SON_PACIENTES.has(decodificar(m[1]))) return null;
  const t = normalizarPestana(decodificar(m[2]));
  return esPestana(t) ? t : null;
}

/** A dónde mandar un enlace viejo: una sección con `#` (`/app/configuracion#permisos`) o una pestaña de la ficha con `#` o `?tab=`. El
 *  resto de la consulta se conserva (la fecha de la bandeja, los filtros). `null` si no hay nada que cambiar. */
export function rutaLimpia(pathname: string, search: string, hash: string): string | null {
  const ruta = sinBarraFinal(pathname);
  const params = new URLSearchParams(search);
  const pedido = decodificar((hash || "").replace(/^#/, ""));

  const area = /^\/app\/(configuracion|reportes|pacientes|tareas)$/.exec(ruta)?.[1] as AreaDelPanel | undefined;
  if (area) {
    if (!pedido) return null;
    const destino = rutaDeSeccion(area, pedido);
    return destino === ruta ? null : conConsulta(destino, params);
  }

  const ficha = /^\/app\/pacientes\/([^/]+)$/.exec(ruta);
  if (ficha && !NO_SON_PACIENTES.has(decodificar(ficha[1]))) {
    const pestana = normalizarPestana(pedido || params.get("tab") || "");
    if (pestana && esPestana(pestana)) {
      params.delete("tab");
      return conConsulta(`${ruta}/${pestana}`, params);
    }
  }
  return null;
}

/** De los enlaces del menú, el que corresponde a la URL: el que más se parece, cortando en las barras («/app/configuracionx» no es
 *  «/app/configuracion»). `null` si ninguno. */
export function hrefActivo(pathname: string, hrefs: readonly string[]): string | null {
  const ruta = sinBarraFinal(pathname);
  let mejor: string | null = null;
  let largo = -1;
  for (const h of hrefs) {
    const base = sinBarraFinal(h.split(/[?#]/)[0]);
    if ((ruta === base || ruta.startsWith(`${base}/`)) && base.length > largo) { mejor = h; largo = base.length; }
  }
  return mejor;
}
