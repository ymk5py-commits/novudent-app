import { documentosDelPaciente } from "./documentosClinicos";
import type { BillingRecord, DocumentoClinico, Patient } from "./types";

/* Lo que muestra el panel de la campana: qué está pendiente y A DÓNDE hay que ir a resolverlo.
 * Antes la campana solo decía «3 pendientes» y llevaba a la lista de pacientes sin decir cuáles
 * (revisión de Novum, 6-oct-2026). Puro y con tests: el panel solo lo dibuja. */

/** «Ver todos» de los documentos pendientes: la lista de pacientes ya filtrada. */
export const HREF_DOCUMENTOS_PENDIENTES = "/app/pacientes?pendientes=documentos";
/** «Ver todos» de las retenciones: Facturación ya filtrada por «En retención». */
export const HREF_RETENCIONES = "/app/facturacion?filtro=en-retencion";

export interface FilaPendiente {
  /** Estable, para usarlo de `key`. */
  id: string;
  tipo: "documentos" | "retencion";
  /** El paciente. */
  titulo: string;
  /** Qué falta: los documentos pendientes o el motivo de la retención. */
  detalle: string;
  href: string;
}

export interface ListaPendientes {
  documentos: FilaPendiente[];
  retenciones: FilaPendiente[];
  /** Pacientes con documentos pendientes + reclamos en retención: el número de la campana. */
  total: number;
}

/** Un reclamo de facturación frenado (HOLD automático o MGRHOLD manual). */
export const enRetencion = (b: Pick<BillingRecord, "flags">): boolean => b.flags.includes("HOLD") || b.flags.includes("MGRHOLD");

const nombreCompleto = (p: Pick<Patient, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`;

/** «Uno» · «Uno y Dos» · «Uno, Dos y 2 más». */
function resumenDeNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`;
}

export function listaPendientes(o: {
  patients: readonly Pick<Patient, "id" | "firstName" | "lastName" | "forms">[];
  docs: readonly DocumentoClinico[];
  billing: readonly Pick<BillingRecord, "id" | "patientId" | "flags" | "holdReason">[];
  /** Quien gestiona documentos (`engagement.forms`). */
  verDocumentos: boolean;
  /** Quien ve montos (`money.view`): las retenciones son plata. */
  verRetenciones: boolean;
}): ListaPendientes {
  const documentos: FilaPendiente[] = o.verDocumentos
    ? o.patients
        .flatMap((p) => {
          const pendientes = documentosDelPaciente(p, o.docs).filter((i) => i.estado === "pendiente");
          if (pendientes.length === 0) return [];
          return [{
            id: `doc_${p.id}`,
            tipo: "documentos" as const,
            titulo: nombreCompleto(p),
            detalle: resumenDeNombres(pendientes.map((i) => i.nombre)),
            href: `/app/pacientes/${p.id}?tab=documentos`,
          }];
        })
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "es"))
    : [];

  const nombreDe = new Map(o.patients.map((p) => [p.id, nombreCompleto(p)]));
  const retenciones: FilaPendiente[] = o.verRetenciones
    ? o.billing.filter(enRetencion).map((b) => ({
        id: `ret_${b.id}`,
        tipo: "retencion" as const,
        titulo: nombreDe.get(b.patientId) ?? "Paciente sin ficha",
        detalle: b.holdReason || "En retención",
        href: HREF_RETENCIONES,
      }))
    : [];

  return { documentos, retenciones, total: documentos.length + retenciones.length };
}
