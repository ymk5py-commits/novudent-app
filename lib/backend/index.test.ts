import { describe, it, expect } from "vitest";
import { elegirBackend } from "./index";

describe("elegirBackend", () => {
  it("por defecto (sin valor, vacío o «Firestore») es Firestore", () => {
    for (const v of [undefined, "", "  ", "firestore", "Firestore"]) expect(elegirBackend(v).tipo).toBe("firestore");
  });
  it("«supabase» (con cualquier mayúscula o espacios) elige Supabase, sin necesitar las variables hasta el primer uso", () => {
    for (const v of ["supabase", " Supabase ", "SUPABASE"]) expect(elegirBackend(v).tipo).toBe("supabase");
  });
  it("el backend de Supabase expone TODA la interfaz (también la recuperación de contraseña), con el cliente sin crear todavía", () => {
    const b = elegirBackend("supabase");
    for (const nombre of ["leerClinica", "clinicaDelUsuario", "guardar", "quitar", "fijarCampo", "mezclarClinica", "lote", "escucharSuscripcion", "escucharClinica", "escucharColeccion",
      "esperarSesion", "iniciarSesion", "iniciarSesionDeDemo", "cerrarSesion", "usuarioActual", "token", "enviarRecuperacion", "hayEnlaceDeRecuperacion", "fijarClaveNueva"]) {
      expect(typeof (b as unknown as Record<string, unknown>)[nombre], nombre).toBe("function");
    }
  });
  it("un valor desconocido falla en vez de caer en Firestore sin avisar, y dice cuáles valen", () => {
    expect(() => elegirBackend("mongo")).toThrow(/desconocido/);
    expect(() => elegirBackend("mongo")).toThrow(/firestore, supabase/);
  });
});
