import type { SignatureDoc } from "./types";

const MAX_SIG_BYTES = 1_500_000; // ~1.5MB de PNG base64 (firma simple es chica)

/** Token aleatorio url-safe (~180 bits). Usa WebCrypto (browser y edge/runtime). */
export function newSignToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Solo se puede firmar un doc pendiente. */
export function canSign(doc: Pick<SignatureDoc, "status"> | null | undefined): boolean {
  return !!doc && doc.status === "pendiente";
}

export type SignPayload =
  | { ok: true; signatureImage: string; signedByName: string }
  | { ok: false; error: string };

/** Sanea el payload de firma de la página pública. Rechaza basura. Puro. */
export function validateSignPayload(raw: any): SignPayload {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Datos inválidos" };
  const img = String(raw.signatureImage ?? "");
  if (!/^data:image\/png;base64,/.test(img)) return { ok: false, error: "Firma inválida" };
  if (img.length * 0.75 > MAX_SIG_BYTES) return { ok: false, error: "Firma demasiado grande" };
  const name = String(raw.signedByName ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Falta el nombre de quien firma" };
  return { ok: true, signatureImage: img, signedByName: name };
}
