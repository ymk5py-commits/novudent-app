# Atribución

El motor de este directorio (`odontogram.ts`, `App.tsx`, `SettingsModal.tsx`, `plugin.ts`,
`bridgeOverlay.ts`, `status_extras.ts`, `theme.ts`, `tour.ts`, `index.css`, `i18n/`, `utils/`,
`registry/`, `fhir/codesystems.ts`) es una copia adaptada de
[React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul) de Zoltán Dul,
licenciado MIT (ver `LICENSE` en este mismo directorio). Esta copia deja fuera toda la
funcionalidad de exportación/importación HL7 FHIR (sin consumidor en Novudent); los parches que
conectan el motor a Firestore desde `components/Odontogram.tsx` se aplican en commits posteriores
de este mismo directorio — ver el historial de commits para el detalle.
