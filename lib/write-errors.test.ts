import { describe, it, expect, beforeEach } from "vitest";
import {
  clasificarError, mensajeDe, registrarFallo, resolverFallo, limpiarFallos,
  fallosActuales, suscribirFallos, reintentarTodo,
} from "./write-errors";

const err = (code: string) => Object.assign(new Error(code), { code });
const AHORA = Date.UTC(2026, 7, 11);

beforeEach(() => limpiarFallos());

describe("clasificarError", () => {
  it("permission-denied es de permiso: reintentar NO lo arregla", () => {
    expect(clasificarError(err("permission-denied"))).toBe("permiso");
  });

  it("los errores de red se agrupan como conexión", () => {
    for (const c of ["unavailable", "deadline-exceeded", "resource-exhausted", "aborted", "cancelled"]) {
      expect(clasificarError(err(c))).toBe("conexion");
    }
  });

  it("lo que no reconoce no se disfraza de red — queda desconocido", () => {
    expect(clasificarError(err("invalid-argument"))).toBe("desconocido");
    expect(clasificarError(new Error("boom"))).toBe("desconocido");
    expect(clasificarError(null)).toBe("desconocido");
  });
});

describe("mensajeDe", () => {
  it("ante falta de permiso NO invita a reintentar: dice que no lo va a resolver", () => {
    const m = mensajeDe("permiso");
    expect(m.ayuda).toMatch(/no lo va a resolver/i);
  });

  it("ante corte de conexión sí invita a reintentar y tranquiliza", () => {
    const m = mensajeDe("conexion");
    expect(m.ayuda).toMatch(/reintent/i);
    expect(m.ayuda).toMatch(/sigue en pantalla/i);
  });
});

describe("registro de fallos", () => {
  const unFallo = (over: Partial<Parameters<typeof registrarFallo>[0]> = {}) => ({
    coleccion: "patients", docId: "p1", causa: "conexion" as const, detalle: "unavailable", ...over,
  });

  it("registra el fallo con sus datos", () => {
    registrarFallo(unFallo(), AHORA);
    const [f] = fallosActuales();
    expect(f.clave).toBe("patients/p1");
    expect(f.intentos).toBe(1);
    expect(f.cuando).toBe(AHORA);
  });

  it("la MISMA fila que falla de nuevo suma un intento, no duplica la entrada", () => {
    registrarFallo(unFallo(), AHORA);
    registrarFallo(unFallo(), AHORA + 1000);
    registrarFallo(unFallo(), AHORA + 2000);
    const fs = fallosActuales();
    expect(fs).toHaveLength(1);
    expect(fs[0].intentos).toBe(3);
    expect(fs[0].cuando).toBe(AHORA + 2000);
  });

  it("filas distintas son problemas distintos", () => {
    registrarFallo(unFallo({ docId: "p1" }), AHORA);
    registrarFallo(unFallo({ docId: "p2" }), AHORA);
    registrarFallo(unFallo({ coleccion: "payments", docId: "p1" }), AHORA);
    expect(fallosActuales()).toHaveLength(3);
  });

  it("al reintentar, la causa se actualiza: la red vuelve pero falta permiso", () => {
    registrarFallo(unFallo({ causa: "conexion" }), AHORA);
    registrarFallo(unFallo({ causa: "permiso", detalle: "permission-denied" }), AHORA + 500);
    expect(fallosActuales()[0].causa).toBe("permiso");
  });

  it("resolver saca solo esa fila", () => {
    registrarFallo(unFallo({ docId: "p1" }), AHORA);
    registrarFallo(unFallo({ docId: "p2" }), AHORA);
    resolverFallo("patients/p1");
    expect(fallosActuales().map((f) => f.clave)).toEqual(["patients/p2"]);
  });
});

describe("suscripción", () => {
  it("avisa al suscribirse y en cada cambio", () => {
    const vistos: number[] = [];
    const cortar = suscribirFallos((fs) => vistos.push(fs.length));
    registrarFallo({ coleccion: "c", docId: "1", causa: "conexion", detalle: "x" }, AHORA);
    registrarFallo({ coleccion: "c", docId: "2", causa: "conexion", detalle: "x" }, AHORA);
    resolverFallo("c/1");
    cortar();
    registrarFallo({ coleccion: "c", docId: "3", causa: "conexion", detalle: "x" }, AHORA);
    expect(vistos).toEqual([0, 1, 2, 1]); // tras cortar ya no recibe
  });

  it("entrega una copia: mutarla afuera no corrompe el registro", () => {
    registrarFallo({ coleccion: "c", docId: "1", causa: "conexion", detalle: "x" }, AHORA);
    const copia = fallosActuales();
    copia.pop();
    expect(fallosActuales()).toHaveLength(1);
  });
});

describe("reintentarTodo", () => {
  it("saca lo que se pudo guardar y deja lo que volvió a fallar", async () => {
    registrarFallo({ coleccion: "c", docId: "ok", causa: "conexion", detalle: "x", reintentar: async () => {} }, AHORA);
    registrarFallo({
      coleccion: "c", docId: "mal", causa: "conexion", detalle: "x",
      reintentar: async () => { throw err("unavailable"); },
    }, AHORA);

    const r = await reintentarTodo();
    expect(r).toEqual({ ok: 1, fallaron: 1 });
    expect(fallosActuales().map((f) => f.clave)).toEqual(["c/mal"]);
  });

  it("un fallo sin forma de reintentar no se toca ni se cuenta", async () => {
    registrarFallo({ coleccion: "c", docId: "sinretry", causa: "permiso", detalle: "x" }, AHORA);
    const r = await reintentarTodo();
    expect(r).toEqual({ ok: 0, fallaron: 0 });
    expect(fallosActuales()).toHaveLength(1);
  });
});
