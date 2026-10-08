import { describe, it, expect } from "vitest";
import { completarCache } from "./cacheLocal";
import { buildSeed } from "./seed";
import type { DB } from "./types";

/* El modo local (sin Firestore) guarda toda la base en localStorage. Un caché guardado antes de que existiera una colección no la trae: si
   no se completa, la pantalla que la recorre (`db.agendaBlocks.filter(...)`) se rompe al abrir. */
describe("completarCache", () => {
  it("un caché guardado antes de los bloqueos de agenda, los documentos clínicos, la rutina o el chat directo se completa con listas vacías", () => {
    const { agendaBlocks: _a, clinicalDocs: _c, routineChecks: _r, directMessages: _d, ...viejo } = buildSeed();
    const db = completarCache(viejo as unknown as DB);
    expect(db.agendaBlocks).toEqual([]);
    expect(db.clinicalDocs).toEqual([]);
    expect(db.routineChecks).toEqual([]);
    expect(db.directMessages).toEqual([]);
    expect(db.appointments.length).toBeGreaterThan(0); // lo demás queda como estaba
  });

  it("lo que ya trae no se toca", () => {
    const seed = buildSeed();
    const conBloqueo = { ...seed, agendaBlocks: [{ id: "bl1", clinicId: "cl_demo", dentistId: "*", start: "x", end: "y", createdAt: "z", createdBy: "Laura" }] };
    expect(completarCache(conBloqueo).agendaBlocks).toHaveLength(1);
  });

  it("la demo arranca sin espacios bloqueados", () => {
    expect(buildSeed().agendaBlocks).toEqual([]);
  });
});
