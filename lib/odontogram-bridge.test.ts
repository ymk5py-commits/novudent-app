import { describe, it, expect, afterEach } from "vitest";
import {
  collectExportPayload,
  __setToothStateForTest,
} from "../components/odontogram-engine/odontogram";
import { toLabel, toDisplayLabel } from "../components/odontogram-engine/utils/numbering";

/** Límite de integración Novudent ↔ motor vendorizado (React-Odontogram-Modul).
 *
 *  components/Odontogram.tsx (nuestro wrapper) GUARDA el odontograma del paciente
 *  a Firestore con `collectExportPayload()` — la función que en la Task 2
 *  expusimos como pública (antes era privada del motor). Este test blinda ESE
 *  contrato: que sigue exportada, que devuelve el shape {version, globals, teeth}
 *  con las 32 piezas, y que refleja fielmente el estado del motor.
 *
 *  Es DOM-free a propósito: `collectExportPayload` lee el `toothState` a nivel de
 *  módulo (mapa puro) y `__setToothStateForTest` lo escribe vía `hydrateState`
 *  (validación pura contra el registry) — ninguno necesita el shell imperativo del
 *  motor, así que corre en el entorno `node` de la suite de Novudent sin jsdom. La
 *  otra mitad del puente (`importStatus`, que carga Firestore→motor en `onReady`)
 *  requiere el DOM de controles completo del motor y se verifica en el navegador,
 *  no acá (ver components/odontogram-engine/NOTICE.md). */
type TeethPayload = { version: string; globals: Record<string, boolean>; teeth: Record<string, Record<string, unknown>> };
const payloadOf = () => collectExportPayload() as unknown as TeethPayload;

describe("puente de datos odontograma (collectExportPayload — path de guardado)", () => {
  afterEach(() => {
    // toothState es estado a nivel de módulo: reseteá la pieza tocada.
    __setToothStateForTest(16, {});
  });

  it("devuelve {version 2.10, globals, teeth} con al menos las 32 piezas permanentes", () => {
    const payload = payloadOf();
    expect(payload.version).toBe("2.10");
    expect(typeof payload.globals).toBe("object");
    expect(Object.keys(payload.teeth).length).toBeGreaterThanOrEqual(32);
  });

  it("refleja un hallazgo cargado en el motor (caries oclusal en diente permanente)", () => {
    // "caries-occlusal" y "tooth-base" son los ids reales del registry
    // (fhir/codesystems.ts LOCAL_VALUE_MAPS) — hydrateState descarta cualquier
    // valor no reconocido, así que este test también falla si esos ids cambian.
    __setToothStateForTest(16, { toothSelection: "tooth-base", caries: ["caries-occlusal"] });
    const payload = payloadOf();
    expect(payload.teeth["16"].caries).toEqual(["caries-occlusal"]);
    expect(payload.teeth["16"].toothSelection).toBe("tooth-base");
  });

  it("un valor de superficie inválido se descarta (no corrompe el payload guardado)", () => {
    __setToothStateForTest(16, { toothSelection: "tooth-base", caries: ["O"] });
    const payload = payloadOf();
    expect(payload.teeth["16"].caries).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Curación de campos "Fase 1" (components/Odontogram.tsx → FASE_1).
   Apagamos controles de UI del motor (diagnóstico apical, estadificación de
   periimplantitis, ortodoncia por pieza, profundidad ICDAS…). Esto blinda que
   apagar la UI es SOLO UI: un valor ya guardado en esos campos sigue viajando
   en el payload. Si alguna vez el motor empezara a descartar los campos que no
   tienen control visible, este test se cae y nos enteramos ANTES de perderle
   datos clínicos a un paciente — que es lo que hace que prender un campo en la
   fase siguiente no necesite migración.
   ───────────────────────────────────────────────────────────────────────── */
describe("curación Fase 1 — ocultar el control no borra el dato guardado", () => {
  afterEach(() => {
    __setToothStateForTest(16, {});
    __setToothStateForTest(46, {});
  });

  it("el diagnóstico apical sobrevive al payload aunque su fila esté oculta", () => {
    __setToothStateForTest(16, {
      toothSelection: "tooth-base",
      apicalDx: "chronic-apical-abscess",
    });
    expect(payloadOf().teeth["16"].apicalDx).toBe("chronic-apical-abscess");
  });

  it("la estadificación de periimplantitis sobrevive al payload aunque su fila esté oculta", () => {
    __setToothStateForTest(46, {
      toothSelection: "implant",
      periImplant: "peri-implantitis-moderate",
    });
    expect(payloadOf().teeth["46"].periImplant).toBe("peri-implantitis-moderate");
  });

  it("los campos apagados conviven con los prendidos en la misma pieza", () => {
    __setToothStateForTest(16, {
      toothSelection: "tooth-base",
      caries: ["caries-occlusal"],   // prendido en Fase 1
      apicalDx: "condensing-osteitis", // apagado en Fase 1
    });
    const t = payloadOf().teeth["16"];
    expect(t.caries).toEqual(["caries-occlusal"]);
    expect(t.apicalDx).toBe("condensing-osteitis");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
   Numeración visible — Dentalink escribe la pieza con punto (1.8, 2.1, 4.6).
   `toDisplayLabel` es la capa de presentación; `toLabel` sigue siendo el
   contrato interno del motor (export/import) y NO debe cambiar de forma.
   ───────────────────────────────────────────────────────────────────────── */
describe("toDisplayLabel — notación FDI puntuada", () => {
  it("separa cuadrante y pieza con punto en FDI", () => {
    expect(toDisplayLabel(18, "FDI")).toBe("1.8");
    expect(toDisplayLabel(11, "FDI")).toBe("1.1");
    expect(toDisplayLabel(21, "FDI")).toBe("2.1");
    expect(toDisplayLabel(46, "FDI")).toBe("4.6");
    expect(toDisplayLabel(38, "FDI")).toBe("3.8");
  });

  it("también puntúa la dentición temporal (5x-8x)", () => {
    expect(toDisplayLabel(55, "FDI")).toBe("5.5");
    expect(toDisplayLabel(81, "FDI")).toBe("8.1");
  });

  it("acepta el número como string, igual que toLabel", () => {
    expect(toDisplayLabel("14", "FDI")).toBe("1.4");
  });

  it("un número fuera de rango se devuelve tal cual (no inventa cuadrante)", () => {
    expect(toDisplayLabel(99, "FDI")).toBe("99");
    expect(toDisplayLabel("x", "FDI")).toBe("x");
  });

  it("Universal y Palmer pasan sin tocar: ya traen su propio formato", () => {
    expect(toDisplayLabel(14, "UNIVERSAL")).toBe(toLabel(14, "UNIVERSAL"));
    expect(toDisplayLabel(14, "PALMER")).toBe(toLabel(14, "PALMER"));
    expect(toDisplayLabel(14, "PALMER")).toBe("UR-4");
  });

  it("NO cambia toLabel: el motor sigue exportando FDI sin punto", () => {
    expect(toLabel(18, "FDI")).toBe("18");
    expect(toLabel(46, "FDI")).toBe("46");
  });
});
