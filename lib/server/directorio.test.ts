import { beforeEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.fn();
vi.mock("./datos", () => ({ getDocument: (...a: unknown[]) => getDocument(...a) }));
import { directorioDe } from "./directorio";

beforeEach(() => { getDocument.mockReset(); });

describe("directorioDe", () => {
  it("Firestore: el documento de usuario se llama como el uid", async () => {
    getDocument.mockResolvedValue({ clinicId: "cl_a", email: "a@b.c" });
    expect(await directorioDe("uid1")).toEqual({ clinicId: "cl_a", userId: "uid1", email: "a@b.c" });
    expect(getDocument).toHaveBeenCalledWith("directory/uid1");
  });

  it("Supabase: el documento de usuario puede tener otro id (usuarios migrados)", async () => {
    getDocument.mockResolvedValue({ clinicId: "cl_a", userId: "u_viejo", email: "a@b.c" });
    expect(await directorioDe("uuid-nuevo")).toEqual({ clinicId: "cl_a", userId: "u_viejo", email: "a@b.c" });
  });

  it("null si no hay entrada o no trae clínica", async () => {
    getDocument.mockResolvedValue(null);
    expect(await directorioDe("x")).toBeNull();
    getDocument.mockResolvedValue({ email: "a@b.c" });
    expect(await directorioDe("x")).toBeNull();
    getDocument.mockResolvedValue({ clinicId: "" });
    expect(await directorioDe("x")).toBeNull();
  });

  it("nunca devuelve la demo (defensa en profundidad: la capa de datos ya la excluye)", async () => {
    getDocument.mockResolvedValue({ clinicId: "cl_demo", userId: "plantado", email: "x@x.test" });
    expect(await directorioDe("uid-anonimo")).toBeNull();
  });

  it("propaga el error de lectura (quien llama decide)", async () => {
    getDocument.mockImplementation(async () => { throw new Error("caído"); });
    await expect(directorioDe("x")).rejects.toThrow("caído");
  });
});
