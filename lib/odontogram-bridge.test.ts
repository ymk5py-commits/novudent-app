import { describe, it, expect, afterEach } from "vitest";
import {
  collectExportPayload,
  __setToothStateForTest,
} from "../components/odontogram-engine/odontogram";

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
