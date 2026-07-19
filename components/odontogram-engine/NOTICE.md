# Atribución

El motor de este directorio (`odontogram.ts`, `App.tsx`, `SettingsModal.tsx`, `plugin.ts`,
`bridgeOverlay.ts`, `status_extras.ts`, `theme.ts`, `tour.ts`, `index.css`, `i18n/`, `utils/`,
`registry/`, `fhir/codesystems.ts`) es una copia adaptada de
[React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul) de Zoltán Dul,
licenciado MIT (ver `LICENSE` en este mismo directorio). Se removió toda la funcionalidad de
exportación/importación HL7 FHIR (sin consumidor en Novudent) y se agregaron: exports públicos de
`collectExportPayload`/`importStatus` (antes privados) y una prop `onReady` en `<App>`, para poder
conectar el motor a Firestore desde `components/Odontogram.tsx`.
