import { describe, expect, it } from "vitest";
import { aSnake, crearAlmacenEnMemoria, nombreDeTabla } from "./almacen.mjs";
import { contratoDeAlmacen } from "./almacen.contrato";
import { COLECCIONES } from "./fixtures";

contratoDeAlmacen("en memoria", async ({ soloLectura }) => ({
  almacen: crearAlmacenEnMemoria({ colecciones: [...COLECCIONES.porClinica, ...COLECCIONES.raiz], soloLectura }),
  limpiar: async () => {},
}));

describe("nombres de tabla", () => {
  it("aSnake pasa camelCase a snake_case", () => {
    expect(aSnake("directMessages")).toBe("direct_messages");
    expect(aSnake("patients")).toBe("patients");
    expect(aSnake("mgmtTasks")).toBe("mgmt_tasks");
    expect(aSnake("eduVideos")).toBe("edu_videos");
  });
  it("nombreDeTabla usa el nombre tal cual si existe, y si no el snake_case; si no hay ninguno, null", () => {
    const tablas = new Set(["patients", "direct_messages", "mgmtTasks"]);
    expect(nombreDeTabla("patients", tablas)).toBe("patients");
    expect(nombreDeTabla("directMessages", tablas)).toBe("direct_messages");
    expect(nombreDeTabla("mgmtTasks", tablas)).toBe("mgmtTasks");
    expect(nombreDeTabla("labOrders", tablas)).toBeNull();
  });
});
