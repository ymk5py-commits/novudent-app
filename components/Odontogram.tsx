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
    />
  );
}
