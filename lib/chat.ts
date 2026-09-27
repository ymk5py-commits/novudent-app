/* Chat interno: directos de persona a persona y difusión general del admin
 * (pedido del cliente en el documento de revisión).
 *
 * Helpers puros —sin Firestore ni React— testeados en lib/chat.test.ts. La
 * privacidad de verdad vive en firestore.rules (colección `directMessages`): esto
 * arma los documentos para que la cumplan y decide qué muestra la pantalla. */
import type { DirectMessage, User } from "./types";

/** Tope de caracteres de un mensaje. El mismo número está en firestore.rules. */
export const MAX_TEXTO = 2000;

/** El texto listo para mandar, o `null` si no se puede (en blanco o demasiado largo). */
export function textoParaEnviar(texto: string): string | null {
  const t = texto.trim();
  return t.length > 0 && t.length <= MAX_TEXTO ? t : null;
}

/** Id opaco y al azar (128 bits). NO se deriva del destinatario ni del orden, a
 *  propósito: si la copia de una difusión se llamara `<difusionId>_<uid>`, quien
 *  recibió la suya podría armar la ruta de la copia de un compañero y probar un
 *  alta ahí (libre → la regla la deja pasar, ocupada → la rechaza): sabría si él
 *  también la recibió. `getRandomValues` y no `randomUUID` porque este último no
 *  existe fuera de https. */
export function idMensaje(prefijo: "dm" | "dif" = "dm"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefijo}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type Remitente = { id: string; name: string };

/** Un directo de `from` a `toId`. */
export function nuevoDirecto(p: {
  clinicId: string; from: Remitente; toId: string; text: string; createdAt: string; difusionId?: string;
}): DirectMessage {
  return {
    id: idMensaje(),
    clinicId: p.clinicId,
    fromId: p.from.id,
    fromName: p.from.name,
    toId: p.toId,
    participants: [p.from.id, p.toId],
    text: p.text,
    createdAt: p.createdAt,
    // Sin la clave cuando no es difusión: Firestore no acepta `undefined` y la
    // regla trabaja con lista blanca de campos.
    ...(p.difusionId ? { difusionId: p.difusionId } : {}),
  };
}

/** A quién le llega una difusión: todas las personas activas menos quien la manda. */
export function destinatariosDifusion<T extends Pick<User, "id" | "active">>(users: T[], remitenteId: string): T[] {
  return users.filter((u) => u.active !== false && u.id !== remitenteId);
}

/** La difusión como fan-out: una copia por destinatario, todas con el mismo
 *  `difusionId` y la misma hora. Cada copia tiene como participantes SOLO al admin
 *  y a esa persona, así la privacidad es de datos (las reglas le dejan leer su
 *  copia y ninguna otra) y no solo de pantalla. */
export function armarDifusion(p: {
  clinicId: string; from: Remitente; destinatarios: Pick<User, "id">[]; text: string; createdAt: string;
}): DirectMessage[] {
  const difusionId = idMensaje("dif");
  return p.destinatarios.map((u) =>
    nuevoDirecto({ clinicId: p.clinicId, from: p.from, toId: u.id, text: p.text, createdAt: p.createdAt, difusionId }),
  );
}

const cronologico = (a: DirectMessage, b: DirectMessage) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** ¿El mensaje es de la conversación entre `yo` y `otro`? */
const entre = (m: DirectMessage, yo: string, otro: string) =>
  (m.fromId === yo && m.toId === otro) || (m.fromId === otro && m.toId === yo);

/** La conversación entre dos personas, en orden cronológico. El store del admin y
 *  el de la demo traen todos los directos de la clínica: la pantalla igual muestra
 *  solo los propios. */
export function hilo(directos: DirectMessage[], yo: string, otro: string): DirectMessage[] {
  return directos.filter((m) => entre(m, yo, otro)).sort(cronologico);
}

/** Cuántos mensajes me mandaron (`de` esa persona, si se indica) que no abrí. */
export function sinLeer(directos: DirectMessage[], yo: string, de?: string): number {
  return directos.filter((m) => m.toId === yo && !m.readAt && (!de || m.fromId === de)).length;
}

/** Los ids a marcar como leídos al abrir la conversación con `otro`. */
export function idsPorMarcarLeidos(directos: DirectMessage[], yo: string, otro: string): string[] {
  return directos.filter((m) => m.toId === yo && m.fromId === otro && !m.readAt).map((m) => m.id);
}

export interface Conversacion<U> {
  user: U;
  ultimo?: DirectMessage;
  sinLeer: number;
}

/** Una conversación por cada persona activa de la clínica (menos yo), con su
 *  último mensaje y los no leídos. Primero las que tienen mensajes, de la más
 *  reciente a la más vieja; después el resto, por nombre. */
export function conversaciones<U extends Pick<User, "id" | "name" | "active">>(
  users: U[], directos: DirectMessage[], yo: string,
): Conversacion<U>[] {
  const lista = users
    .filter((u) => u.id !== yo && u.active !== false)
    .map((user) => {
      const propios = directos.filter((m) => entre(m, yo, user.id));
      const ultimo = propios.reduce<DirectMessage | undefined>((ult, m) => (!ult || cronologico(m, ult) > 0 ? m : ult), undefined);
      return { user, ultimo, sinLeer: sinLeer(propios, yo) };
    });
  return lista.sort((a, b) => {
    if (a.ultimo && b.ultimo) return cronologico(b.ultimo, a.ultimo);
    if (a.ultimo || b.ultimo) return a.ultimo ? -1 : 1;
    return a.user.name.localeCompare(b.user.name, "es");
  });
}

export interface Difusion {
  difusionId: string;
  fromId: string;
  fromName: string;
  text: string;
  createdAt: string;
  destinatarios: { toId: string; readAt?: string }[];
}

/** Las difusiones enviadas, juntando sus copias — la más nueva primero. Es la
 *  vista del admin: el único que lee todas las copias (a un destinatario le llega
 *  solo la suya, así que con sus datos esto le devuelve un único nombre: el suyo). */
export function difusiones(directos: DirectMessage[]): Difusion[] {
  const porId = new Map<string, Difusion>();
  for (const m of [...directos].sort(cronologico)) {
    if (!m.difusionId) continue;
    const d = porId.get(m.difusionId)
      ?? { difusionId: m.difusionId, fromId: m.fromId, fromName: m.fromName, text: m.text, createdAt: m.createdAt, destinatarios: [] };
    d.destinatarios.push({ toId: m.toId, readAt: m.readAt });
    porId.set(m.difusionId, d);
  }
  return [...porId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
