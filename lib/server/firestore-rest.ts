/**
 * Firestore REST desde el servidor (route handlers) SIN service account.
 *
 * El proyecto novudent-664f3 no permite crear claves de service account
 * (org policy de Google en proyectos sin organización), así que el
 * servidor se autentica como un usuario de Firebase Auth dedicado —
 * mismo patrón validado en producción por el worker de Botika.
 *
 * Env (Vercel → novudent-app):
 *   FIREBASE_WEB_API_KEY    Clave web del proyecto (Configuración → General)
 *   SERVICE_USER_EMAIL      Usuario de servicio (puede ser el mismo
 *   SERVICE_USER_PASSWORD   botika-worker que ya existe)
 *   FIREBASE_PROJECT_ID     opcional, default novudent-664f3
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "novudent-664f3";
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export function isServerFirestoreConfigured(): boolean {
  return !!(
    process.env.FIREBASE_WEB_API_KEY &&
    process.env.SERVICE_USER_EMAIL &&
    process.env.SERVICE_USER_PASSWORD
  );
}

let _token: { idToken: string; expMs: number } | null = null;

async function getIdToken(): Promise<string> {
  if (_token && Date.now() < _token.expMs - 5 * 60 * 1000) return _token.idToken;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY!)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.SERVICE_USER_EMAIL,
        password: process.env.SERVICE_USER_PASSWORD,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.idToken) {
    throw new Error(`Sign-in de servicio falló: ${data?.error?.message || res.status}`);
  }
  _token = {
    idToken: data.idToken,
    expMs: Date.now() + parseInt(data.expiresIn || "3600", 10) * 1000,
  };
  return _token.idToken;
}

/* ---------- (de)codificación de valores Firestore REST ---------- */

type FsValue = Record<string, unknown>;

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === "object") {
    const fields: Record<string, FsValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined) continue;
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

export function decodeValue(v: FsValue | undefined): unknown {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(String(v.integerValue), 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const out: Record<string, unknown> = {};
    const fields = (v.mapValue as { fields?: Record<string, FsValue> }).fields || {};
    for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
    return out;
  }
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: FsValue[] }).values || [];
    return values.map(decodeValue);
  }
  return null;
}

export function decodeFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const fields: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = encodeValue(v);
  }
  return fields;
}

/* ---------- operaciones ---------- */

async function authedFetch(url: string, init?: RequestInit) {
  const idToken = await getIdToken();
  return fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init?.headers || {}),
    },
  });
}

/** GET de un documento. Devuelve null si no existe. */
export async function getDocument(path: string): Promise<Record<string, unknown> | null> {
  const res = await authedFetch(`${FS_BASE}/${path}`);
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`get ${path} falló (${res.status})`);
  return decodeFields(data.fields);
}

/** Lista documentos de una colección (sin filtros, hasta `limit`). */
export async function listCollection(
  parentPath: string,
  collectionId: string,
  limit = 300
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const res = await authedFetch(`${FS_BASE}/${parentPath}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId }], limit },
    }),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(`query ${collectionId} falló (${res.status})`);
  }
  return (Array.isArray(data) ? data : [])
    .filter((row) => row.document)
    .map((row) => ({
      id: String(row.document.name).split("/").pop()!,
      data: decodeFields(row.document.fields),
    }));
}

/** Crea (o reemplaza) un documento con id explícito. */
export async function setDocument(path: string, value: Record<string, unknown>): Promise<void> {
  const res = await authedFetch(`${FS_BASE}/${path}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(value) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`set ${path} falló (${res.status}): ${body.slice(0, 160)}`);
  }
}

/**
 * Crea un documento SOLO si no existe (precondición atómica `exists=false`).
 * Devuelve true si lo creó, false si ya existía (409) — sirve como lock para
 * evitar carreras (p. ej. doble reserva del mismo slot). Lanza en otros errores.
 */
export async function createIfAbsent(path: string, value: Record<string, unknown>): Promise<boolean> {
  const res = await authedFetch(`${FS_BASE}/${path}?currentDocument.exists=false`, {
    method: "PATCH",
    body: JSON.stringify({ fields: encodeFields(value) }),
  });
  if (res.ok) return true;
  if (res.status === 409 || res.status === 412) return false; // ya existe / precondición fallida
  const body = await res.text().catch(() => "");
  throw new Error(`createIfAbsent ${path} falló (${res.status}): ${body.slice(0, 160)}`);
}
