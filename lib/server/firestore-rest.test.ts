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
import { getDocument, setDocument, patchFields } from "./firestore-rest";

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
