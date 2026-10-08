/**
 * Path traversal en la capa REST de Firestore.
 *
 * El id de clínica de estas rutas es PÚBLICO y llega sin autenticación, y las
 * consultas las hace el usuario de servicio, que puede leer y escribir todo el
 * proyecto. Un `#` o un `..` en ese id sacaba la consulta del path pretendido:
 * pedir una encuesta terminaba leyendo la ficha clínica de un paciente de otra
 * clínica. Estos tests fijan el comportamiento del encodeo para que no vuelva.
 *
 * Se ejercita a través de `getDocument` con `fetch` mockeado: lo que importa es
 * la URL que efectivamente sale, que es donde estaba el bug.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDocument, setDocument, patchFields, queryRange, queryIn } from "./firestore-rest";

const DOCS = "https://firestore.googleapis.com/v1/projects/novudent-664f3/databases/(default)/documents";

/** URL que recibió el fetch de datos (el primero es el sign-in del usuario de servicio). */
let urls: string[] = [];

beforeEach(() => {
  urls = [];
  vi.stubEnv("FIREBASE_WEB_API_KEY", "k");
  vi.stubEnv("SERVICE_USER_EMAIL", "svc@novudent.test");
  vi.stubEnv("SERVICE_USER_PASSWORD", "secreto");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    if (String(url).includes("identitytoolkit")) {
      return new Response(JSON.stringify({ idToken: "t", expiresIn: "3600" }), { status: 200 });
    }
    return new Response(JSON.stringify({ fields: {} }), { status: 200 });
  }));
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

/** El path REAL que viaja: lo que sigue a un `#` es fragmento y nunca se envía. */
const pathEnviado = () => {
  const u = new URL(urls[urls.length - 1]);
  return u.pathname.replace("/v1/projects/novudent-664f3/databases/(default)/documents", "");
};

describe("encodeo de paths (anti path traversal)", () => {
  it("el path normal no se altera", async () => {
    await getDocument("clinics/cl_aura/surveys/s1");
    expect(pathEnviado()).toBe("/clinics/cl_aura/surveys/s1");
  });

  it("un `#` NO trunca el path — se escapa y la petición ya no cae en el doc ajeno", async () => {
    // Antes, pedir la encuesta de "cl_x/patients/p_1#" mandaba el path cortado
    // en el `#` y devolvía la FICHA DEL PACIENTE. Ahora el `#` viaja escapado,
    // así que apunta a un documento que no existe (404) en vez de filtrar.
    // Las barras son estructura y se conservan a propósito: de que el `cid` no
    // traiga ninguna se encarga `isValidId` en cada route handler.
    await getDocument("clinics/cl_x/patients/p_1#/surveys/s1");
    expect(pathEnviado()).toBe("/clinics/cl_x/patients/p_1%23/surveys/s1");
    expect(pathEnviado()).not.toBe("/clinics/cl_x/patients/p_1");
  });

  it("`..` se rechaza en vez de escalar a una colección raíz", async () => {
    // Antes esto llegaba a `subscriptions/{cid}`, que solo escribe el webhook.
    await expect(getDocument("clinics/../subscriptions/cl_x")).rejects.toThrow(/inválido/i);
  });

  it("un segmento vacío se rechaza", async () => {
    await expect(getDocument("clinics//surveys/s1")).rejects.toThrow(/inválido/i);
  });

  it("setDocument también escapa (era escritura a documento ajeno)", async () => {
    await setDocument("clinics/cl_x#/surveyResponses/r1", { a: 1 });
    expect(pathEnviado()).toBe("/clinics/cl_x%23/surveyResponses/r1");
  });

  it("patchFields conserva su updateMask (el `#` se la comía y reemplazaba el doc entero)", async () => {
    await patchFields("clinics/cl_x#/users/u1", { mustChangePassword: false });
    const u = new URL(urls[urls.length - 1]);
    expect(u.searchParams.get("updateMask.fieldPaths")).toBe("mustChangePassword");
    expect(u.pathname).toContain("cl_x%23");
  });
});

describe("consultas filtradas EN Firestore (no dependen de los primeros N documentos de la colección)", () => {
  /** El cuerpo del runQuery que salió (el primer fetch es el sign-in del usuario de servicio). */
  let consultas: { url: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  beforeEach(() => {
    consultas = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("identitytoolkit")) return new Response(JSON.stringify({ idToken: "t", expiresIn: "3600" }), { status: 200 });
      consultas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify([{ document: { name: "projects/p/databases/(default)/documents/clinics/c1/appointments/a1", fields: { start: { stringValue: "2026-10-08T12:00:00.000Z" } } } }, { readTime: "x" }]), { status: 200 });
    }));
  });

  it("queryRange pide un rango [desde, hasta) sobre UN solo campo (no necesita índice compuesto)", async () => {
    const filas = await queryRange("clinics/c1", "appointments", "start", "2026-10-07", "2026-10-10", 300);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].url).toContain("/clinics/c1:runQuery");
    const q = consultas[0].body.structuredQuery;
    expect(q.from).toEqual([{ collectionId: "appointments" }]);
    expect(q.limit).toBe(300);
    expect(q.where.compositeFilter.op).toBe("AND");
    expect(q.where.compositeFilter.filters).toEqual([
      { fieldFilter: { field: { fieldPath: "start" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: "2026-10-07" } } },
      { fieldFilter: { field: { fieldPath: "start" }, op: "LESS_THAN", value: { stringValue: "2026-10-10" } } },
    ]);
    expect(filas).toEqual([{ id: "a1", data: { start: "2026-10-08T12:00:00.000Z" } }]);
  });

  it("queryIn pide field IN [valores]", async () => {
    await queryIn("clinics/c1", "patients", "document", ["4123456", "4.123.456"], 5);
    const q = consultas[0].body.structuredQuery;
    expect(q.from).toEqual([{ collectionId: "patients" }]);
    expect(q.limit).toBe(5);
    expect(q.where.fieldFilter).toEqual({
      field: { fieldPath: "document" }, op: "IN",
      value: { arrayValue: { values: [{ stringValue: "4123456" }, { stringValue: "4.123.456" }] } },
    });
  });

  it("los valores viajan como datos, nunca dentro del path", async () => {
    await queryRange("clinics/c1", "appointments", "start", "../../x", "y#z");
    expect(consultas[0].url).not.toContain("..");
    expect(consultas[0].url).not.toContain("y#z");
  });
});
