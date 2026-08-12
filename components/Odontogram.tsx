"use client";
/** Odontograma clínico — wrapper de React-Odontogram-Modul vendorizado (components/odontogram-engine).
 *  Mantiene el contrato externo del componente anterior: value/editable/onChange/authorName.
 *  El motor maneja su estado internamente (no es un componente controlado React clásico) — se
 *  hidrata una vez que termina de inicializar (prop onReady) y se reporta hacia afuera con
 *  debounce en cada cambio (onStateChange). */
import { useCallback, useEffect, useRef } from "react";
import App from "./odontogram-engine/App";
import { onStateChange, collectExportPayload, importStatus } from "./odontogram-engine/odontogram";
import { DENTALINK_ODONTOGRAM_THEME } from "./odontogram-engine/dentalink-theme";
import type { OdontogramStatus } from "@/lib/types";
import "./odontogram-engine/index.css";

const SAVE_DEBOUNCE_MS = 800;

/** Curación de campos clínicos — "Fase 1" del spec de diseño
 *  (docs/superpowers/specs/2026-07-19-odontograma-react-modul-design.md).
 *
 *  El motor vendorizado expone ~30 campos por pieza; acá se prende el subconjunto
 *  que un dentista general necesita para la ficha (presente/ausente, caries por
 *  superficie, obturaciones, coronas, endodoncia, implante, notas) y se apaga el
 *  resto. Apagar es SOLO de UI: los campos siguen existiendo en el motor y un
 *  valor ya guardado hace round-trip por importStatus/collectExportPayload sin
 *  perderse, así que prender cualquiera de estos en una fase siguiente es cambiar
 *  una línea acá — no hay migración de datos de por medio. */
const FASE_1 = {
  /** Pulpa: vital vs. tratado. Apaga los 4 diagnósticos AAE y los 9 subtipos latinos. */
  pulpDetailLevel: "simple",
  /** Sin profundidad de caries por superficie (ICDAS): apaga la fila, el popup
   *  de profundidad y el tramado visual por profundidad en el SVG. */
  cariesDepthEnabled: false,
  /** Caries secundaria (CARS) en su escala mínima. */
  secondaryCariesMode: "simple",
  /** Desgaste y decoloración como sí/no, sin tipar la causa clínica. */
  wearDetailLevel: "simple",
  discolorationDetailLevel: "simple",
  /** Diagnóstico apical y estadificación de periimplantitis 2018: fuera de alcance. */
  showApicalDiagnosis: false,
  showPeriImplantStaging: false,
  /** Ortodoncia por pieza: Novudent ya tiene módulo de Ortodoncia dedicado
   *  (tab "Ortodoncia" del plan de tratamiento) — no se duplica acá. */
  showOrthoCard: false,
} as const;

export default function Odontogram({
  value, editable, onChange, authorName,
}: {
  value: OdontogramStatus;
  editable: boolean;
  onChange: (status: OdontogramStatus) => void;
  authorName: string;
}) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const loadedRef = useRef(false);
  const suppressRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleReady = useCallback(() => {
    suppressRef.current = true;
    importStatus(valueRef.current);
    suppressRef.current = false;
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    const unsubscribe = onStateChange(() => {
      if (!loadedRef.current || suppressRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChangeRef.current(collectExportPayload() as OdontogramStatus);
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <App
      onReady={handleReady}
      themeConfig={DENTALINK_ODONTOGRAM_THEME}
      language="es"
      numberingSystem="FDI"
      readOnly={!editable}
      enableNotes
      showTourButton={false}
      showLanguageSelector={false}
      showDarkModeToggle={false}
      {...FASE_1}
    />
  );
}
