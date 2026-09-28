import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const docs: Record<string, Record<string, unknown>> = {};
const createIfAbsent = vi.fn(async (path: string, data: Record<string, unknown>) => {
  if (docs[path]) return false;
  docs[path] = data;
  return true;
});
const getDocument = vi.fn(async (path: string) => docs[path] ?? null);
const listCollection = vi.fn(async (parent: string, col: string) =>
  Object.entries(docs)
    .filter(([path]) => path.startsWith(`${parent}/${col}/`))
    .map(([path, data]) => ({ id: path.split("/").pop()!, data }))
);
let actor = { uid: "admin_a", clinicId: "cl_a", role: "admin" };
let anonymous = false;

vi.mock("@/lib/server/firestore-rest", () => ({
  createIfAbsent: (...args: [string, Record<string, unknown>]) => createIfAbsent(...args),
  getDocument: (...args: [string]) => getDocument(...args),
  listCollection: (...args: [string, string]) => listCollection(...args),
  isServerFirestoreConfigured: () => true,
}));
vi.mock("@/lib/server/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/auth")>("@/lib/server/auth");
  return {
    AuthError: actual.AuthError,
    verifyIdToken: async () => ({ uid: actor.uid, email: "admin@clinic.test", isAnonymous: anonymous }),
  };
});
vi.mock("@/lib/server/require-feature", () => ({
  requireMiembro: async () => actor,
}));
vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: async () => ({ ok: true }),
  clientIp: () => "127.0.0.1",
  tooManyRequests: () => new Response("rate", { status: 429 }),
}));

import { POST } from "./route";

const body = {
  name: "Laura Recepción", email: "Laura@Ejemplo.com", password: "Temporal123",
  role: "receptionist", color: "#DB2777", phone: "+595981000000",
};
const req = (data: unknown = body) => new Request("http://localhost/api/team-users", {
  method: "POST", headers: { authorization: "Bearer admin-token", "content-type": "application/json" },
  body: JSON.stringify(data),
}) as never;

beforeEach(() => {
  for (const path of Object.keys(docs)) delete docs[path];
  docs["clinics/cl_a"] = { id: "cl_a", name: "Clínica A", plan: "solo" };
  docs["subscriptions/cl_a"] = { clinicId: "cl_a", plan: "clinica", status: "active", currentPeriodEndMs: Date.now() + 86_400_000 };
  docs["clinics/cl_a/users/admin_a"] = { id: "admin_a", clinicId: "cl_a", email: "admin@clinic.test", role: "admin", active: true };
  actor = { uid: "admin_a", clinicId: "cl_a", role: "admin" };
  anonymous = false;
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_WEB_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input.includes("accounts:signUp")) return Response.json({ localId: "user_new", idToken: "new-user-token" });
    throw new Error(`Endpoint no esperado: ${input}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("alta de usuarios del equipo", () => {
  it("crea cuenta, directorio y ficha en la clínica del admin sin usar el SDK de sesión", async () => {
    const response = await POST(req({ ...body, clinicId: "cl_otra" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.user).toMatchObject({ id: "user_new", clinicId: "cl_a", email: "laura@ejemplo.com", mustChangePassword: true });
    expect(docs["directory/user_new"]).toEqual({ clinicId: "cl_a", email: "laura@ejemplo.com" });
    expect(docs["clinics/cl_a/users/user_new"]).toMatchObject({ role: "receptionist", active: true });
    expect(Object.keys(docs)).not.toContain("clinics/cl_otra/users/user_new");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("accounts:signUp");
  });

  it("rechaza a no administradores y cuentas anónimas sin crear Auth", async () => {
    actor.role = "receptionist";
    expect((await POST(req())).status).toBe(403);
    actor.role = "admin";
    anonymous = true;
    expect((await POST(req())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("respeta el plan efectivo de la suscripción antes de crear la cuenta", async () => {
    docs["subscriptions/cl_a"].plan = "solo";
    docs["clinics/cl_a/users/assistant_a"] = { role: "assistant", active: true, email: "x@test.com" };
    docs["clinics/cl_a/users/cashier_a"] = { role: "cashier", active: true, email: "y@test.com" };
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("no permite dar de alta usuarios con suscripción vencida", async () => {
    docs["subscriptions/cl_a"].currentPeriodEndMs = Date.now() - 1;
    expect((await POST(req())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recupera un alta interrumpida tras crear Auth y conserva la clínica", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) =>
      input.includes("accounts:signUp")
        ? Response.json({ error: { message: "EMAIL_EXISTS" } }, { status: 400 })
        : Response.json({ localId: "user_partial" })
    ));
    docs["directory/user_partial"] = { clinicId: "cl_a", email: "laura@ejemplo.com" };
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect(docs["clinics/cl_a/users/user_partial"]).toMatchObject({ email: "laura@ejemplo.com" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("impide asignar a otra clínica una cuenta ya vinculada", async () => {
    docs["directory/user_new"] = { clinicId: "cl_otra", email: "laura@ejemplo.com" };
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(docs["clinics/cl_a/users/user_new"]).toBeUndefined();
  });

  it("rechaza datos inválidos antes de crear una cuenta", async () => {
    expect((await POST(req({ ...body, role: "owner" }))).status).toBe(400);
    expect((await POST(req({ ...body, password: "123" }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
