import type { OdontogramToothState, RxSeverity } from "./types";

/**
 * Condición devuelta por el Copiloto IA (app/api/ia/copilot/route.ts, prompt de
 * Gemini, const CONDITIONS) — mismas 7 claves; la ruta ya valida que `condition`
 * sea una de éstas antes de incluir el finding en la respuesta.
 */
export type FindingCondition =
  | "caries"
  | "restaurado"
  | "corona"
  | "endodoncia"
  | "extraccion"
  | "ausente"
  | "implante";

/**
 * Superficie dental — mismos tokens que el value group `fillingSurfaces` del
 * registry del motor (components/odontogram-engine/fhir/codesystems.ts), NO
 * letras sueltas ("O"/"M"/"V" de un borrador previo de este mapeo, que no
 * corresponden a ningún id real).
 *
 * ⚠️ app/api/ia/copilot/route.ts HOY NO le pide `surface` a Gemini: el prompt
 * (línea ~58) y el mapeo de findings (líneas ~92-101) sólo producen
 * {tooth, condition, severity, confidence, note}. Este parámetro queda listo
 * para cuando (si) se extienda ese prompt — por ahora ClinicalCopilot.tsx
 * siempre llama a `findingToToothFields` sin `surface` (los branches "sin
 * superficie" de abajo son los que corren en producción hoy).
 */
export type ToothSurface = "buccal" | "lingual" | "mesial" | "distal" | "occlusal";

/** Severidad clínica (RxSeverity, ya normalizada por la ruta del Copiloto antes
 *  de llegar acá) -> score ICDAS (componente `caries.cariesSeverity`, 1..6 según
 *  VALID_ICDAS en components/odontogram-engine/odontogram.ts). */
const SEVERITY_ICDAS: Record<RxSeverity, number> = {
  observacion: 1,
  leve: 2,
  moderado: 3,
  severo: 5,
};

/**
 * Convierte UN hallazgo del Copiloto IA (condición + severidad/superficie
 * opcionales) en los campos del payload del motor de odontograma nuevo a
 * mergear sobre UNA pieza (vía `mergeOdontogramTooth`). Puro — sin efectos,
 * testeable sin Firestore ni el motor cargado.
 *
 * Todos los ids de valor usados acá (toothSelection/caries/fillingMaterial/
 * restorationType/restorationMaterial/endo) están verificados contra
 * components/odontogram-engine/fhir/codesystems.ts (LOCAL_VALUE_MAPS) +
 * components/odontogram-engine/registry/axes.ts (AXES), y coinciden con el
 * precedente ya usado en lib/seed.ts (Task 10).
 */
export function findingToToothFields(finding: {
  condition: FindingCondition;
  severity?: RxSeverity;
  surface?: ToothSurface;
}): Partial<OdontogramToothState> {
  const { condition, severity, surface } = finding;
  switch (condition) {
    case "caries": {
      const sev = SEVERITY_ICDAS[severity ?? "moderado"] ?? SEVERITY_ICDAS.moderado;
      if (!surface) return { toothSelection: "tooth-base", caries: [], cariesSeverity: {} };
      // `caries` guarda el id con prefijo ("caries-{surface}"); `cariesSeverity`
      // se indexa por la superficie PELADA (sin prefijo) — así lo lee/escribe
      // el motor (odontogram.ts: applyRecurrentCariesScore / picker de profundidad).
      return {
        toothSelection: "tooth-base",
        caries: [`caries-${surface}`],
        cariesSeverity: { [surface]: sev },
      };
    }
    case "restaurado": {
      const fields: Partial<OdontogramToothState> = { toothSelection: "tooth-base", fillingMaterial: "composite" };
      // Sin `surface` conocida no seteamos fillingSurfaces: a diferencia de
      // "caries" (donde el test exige devolver [] explícito), acá escribir un
      // array vacío pisaría — vía el merge shallow de mergeOdontogramTooth —
      // cualquier superficie ya cargada en esa pieza, sin aportar información
      // nueva. Omitir la clave y dejar el campo tal como estaba es más seguro.
      if (surface) fields.fillingSurfaces = [surface];
      return fields;
    }
    case "corona":
      return { toothSelection: "tooth-base", restorationType: "crown", restorationMaterial: "metal-ceramic" };
    case "endodoncia":
      return { toothSelection: "tooth-base", endo: "endo-filling" };
    case "extraccion":
      // No toca toothSelection: es una extracción PLANIFICADA, la pieza sigue
      // presente en boca — deja lo que ya haya en la ficha.
      return { extractionPlan: true };
    case "ausente":
      // Único id del registry para "pieza ausente" (no existe uno separado
      // para "ausente sin contexto de extracción"); ya usado así en lib/seed.ts.
      return { toothSelection: "no-tooth-after-extraction" };
    case "implante":
      return { toothSelection: "implant" };
    default:
      return {};
  }
}
