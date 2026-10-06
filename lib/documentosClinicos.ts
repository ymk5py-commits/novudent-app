import { PLANTILLAS_DE_FABRICA } from "./plantillasDocumento";
import type { CampoDocumento, PlantillaDocumento, SeccionDocumento, TipoCampoDocumento } from "./types";

/* Documentos clínicos de la Ficha clínica (Documentos ▾ › Documentos clínicos): plantillas
 * que la clínica ofrece (la Historia Clínica, textos de indicaciones) y los documentos que se
 * hacen con ellas para un paciente. Todo lo de acá es puro y testeado: nada toca el store.
 * Spec: docs/superpowers/specs/2026-10-06-documentos-clinicos-design.md */

/* ═══ Plantillas ═══ */

const TIPOS_DE_CAMPO: readonly TipoCampoDocumento[] = ["texto", "parrafo", "numero", "seleccion", "casillas"];

const limpio = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function normalizarCampo(raw: unknown, usados: Set<string>): CampoDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = limpio(r.id);
  const etiqueta = limpio(r.etiqueta);
  const tipo = r.tipo as TipoCampoDocumento;
  if (!id || !etiqueta || usados.has(id) || !TIPOS_DE_CAMPO.includes(tipo)) return null;
  let opciones: string[] | undefined;
  if (tipo === "seleccion" || tipo === "casillas") {
    opciones = [...new Set((Array.isArray(r.opciones) ? r.opciones : []).map(limpio).filter(Boolean))];
    if (opciones.length === 0) return null; // una lista sin opciones no se puede responder
  }
  usados.add(id);
  return { id, etiqueta, tipo, ...(opciones ? { opciones } : {}), ...(r.soloMujeres === true ? { soloMujeres: true } : {}) };
}

function normalizarSeccion(raw: unknown, ids: Set<string>, camposUsados: Set<string>): SeccionDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = limpio(r.id);
  const titulo = limpio(r.titulo);
  if (!id || !titulo || ids.has(id)) return null;
  const campos = (Array.isArray(r.campos) ? r.campos : [])
    .map((c) => normalizarCampo(c, camposUsados))
    .filter((c): c is CampoDocumento => c !== null);
  if (campos.length === 0) return null;
  ids.add(id);
  return { id, titulo, campos };
}

/** Limpia una lista de plantillas que puede venir rota (edición a medias, datos viejos): descarta
 *  lo que no se puede usar y nunca lanza. Devuelve objetos nuevos, sin compartir referencias
 *  con la entrada. Los ids de campo son únicos en toda la plantilla porque son la clave bajo la
 *  que se guardan los valores. */
export function normalizarPlantillas(lista: readonly PlantillaDocumento[]): PlantillaDocumento[] {
  const vistos = new Set<string>();
  const out: PlantillaDocumento[] = [];
  for (const raw of Array.isArray(lista) ? lista : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as unknown as Record<string, unknown>;
    const id = limpio(r.id);
    const nombre = limpio(r.nombre);
    if (!id || !nombre || vistos.has(id)) continue;
    const base = {
      id,
      nombre,
      ...(r.porRevisar === true ? { porRevisar: true as const } : {}),
      ...(r.inactiva === true ? { inactiva: true as const } : {}),
    };
    if (r.tipo === "texto") {
      vistos.add(id);
      out.push({ ...base, tipo: "texto", cuerpo: typeof r.cuerpo === "string" ? r.cuerpo : "" });
    } else if (r.tipo === "formulario") {
      const idsDeSecciones = new Set<string>();
      const camposUsados = new Set<string>();
      const secciones = (Array.isArray(r.secciones) ? r.secciones : [])
        .map((s) => normalizarSeccion(s, idsDeSecciones, camposUsados))
        .filter((s): s is SeccionDocumento => s !== null);
      if (secciones.length === 0) continue;
      vistos.add(id);
      out.push({ ...base, tipo: "formulario", secciones });
    }
  }
  return out;
}

/** Las plantillas de la clínica: las que guardó en Configuración (limpias) o, si nunca las
 *  tocó, las de fábrica. Una lista guardada vacía es una decisión suya y se respeta. */
export function plantillasDeClinica(config: { plantillasDocumento?: PlantillaDocumento[] } | undefined): PlantillaDocumento[] {
  const guardadas = config?.plantillasDocumento;
  return Array.isArray(guardadas) ? normalizarPlantillas(guardadas) : PLANTILLAS_DE_FABRICA;
}

/** Las que se ofrecen al crear un documento. */
export const plantillasActivas = (lista: readonly PlantillaDocumento[]): PlantillaDocumento[] => lista.filter((p) => !p.inactiva);
