import type { Clinic } from "./types";

/* Configuración › Datos de la clínica: el nombre, la dirección y el teléfono que salen en la cabecera, en los
 * impresos y en los mensajes a los pacientes. Antes los cargaba Novum al dar de alta y la clínica no los podía corregir. */

export const MAX_NOMBRE_CLINICA = 100;
export const MAX_DIRECCION = 160;
export const MAX_TELEFONO = 40;

export interface DatosClinica {
  name: string;
  address: string;
  phone: string;
}

export type RevisionDatosClinica = { ok: true; datos: DatosClinica } | { ok: false; error: string };

/** Sin caracteres de control, con los espacios (y saltos) repetidos en uno solo y sin espacios en los costados. */
const limpio = (s: string): string => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

/** Revisa lo que escribió el administrador. El nombre es obligatorio; la dirección y el teléfono pueden quedar vacíos
 *  (y entonces se guardan como «», no ausentes: `setDoc(..., { merge: true })` no borra un campo que falta). */
export function revisarDatosClinica(entrada: DatosClinica): RevisionDatosClinica {
  const datos = { name: limpio(entrada.name), address: limpio(entrada.address), phone: limpio(entrada.phone) };
  if (!datos.name) return { ok: false, error: "Escribí el nombre de la clínica." };
  if (datos.name.length > MAX_NOMBRE_CLINICA) return { ok: false, error: `El nombre es demasiado largo (máximo ${MAX_NOMBRE_CLINICA} caracteres).` };
  if (datos.address.length > MAX_DIRECCION) return { ok: false, error: `La dirección es demasiado larga (máximo ${MAX_DIRECCION} caracteres).` };
  if (datos.phone.length > MAX_TELEFONO) return { ok: false, error: `El teléfono es demasiado largo (máximo ${MAX_TELEFONO} caracteres).` };
  return { ok: true, datos };
}

/** La clínica con sus datos nuevos. El nombre vive en el documento de la clínica; la dirección y el teléfono, en su
 *  configuración. Todo lo demás (moneda, logotipo, plantillas…) queda como estaba. */
export function aplicarDatosClinica(clinica: Clinic, d: DatosClinica): Clinic {
  return { ...clinica, name: d.name, config: { ...clinica.config, address: d.address, phone: d.phone } };
}
