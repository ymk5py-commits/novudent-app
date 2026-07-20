# Atribución

El motor de este directorio (`odontogram.ts`, `App.tsx`, `SettingsModal.tsx`, `plugin.ts`,
`bridgeOverlay.ts`, `status_extras.ts`, `theme.ts`, `tour.ts`, `index.css`, `i18n/`, `utils/`,
`registry/`, `fhir/codesystems.ts`) es una copia adaptada de
[React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul) de Zoltán Dul,
licenciado MIT (ver `LICENSE` en este mismo directorio). Esta copia deja fuera toda la
funcionalidad de exportación/importación HL7 FHIR (sin consumidor en Novudent); los parches que
conectan el motor a Firestore desde `components/Odontogram.tsx` se aplican en commits posteriores
de este mismo directorio — ver el historial de commits para el detalle.

## Tipado y tests

Todos los `.ts`/`.tsx` de este directorio llevan `// @ts-nocheck` (el motor upstream no se escribió
contra el `strict: true` de Novudent) y el directorio está excluido del `tsc` del repo
(`tsconfig.json`). Se lo trata como dependencia vendorizada, no como código propio — no reescribir
para satisfacer el linter; mantenerlo cerca del origen facilita re-sincronizar con upstream.

Los ~800 tests propios del motor (`__tests__/`, `registry/__tests__/`) **están excluidos del
`vitest run` de Novudent** (`vitest.config.ts`): asumen un harness `jsdom` + `@testing-library` +
`@vitejs/plugin-react` del upstream que pelea con vitest 4/rolldown y agota memoria con ~90 archivos
jsdom en un solo fork. Su correctitud la cubre el CI del upstream. El **límite de integración** que
sí le importa a Novudent —el puente de datos `collectExportPayload`/`importStatus` que usa
`components/Odontogram.tsx`— se testea en `lib/odontogram-bridge.test.ts` (DOM-free, entorno node).
Para correr el suite del motor a mano (requiere instalar `jsdom @testing-library/react
@testing-library/dom @testing-library/jest-dom @vitejs/plugin-react vite` y un `vitest.config` con
environment jsdom + `plugins: [react()]`), ver el `README.md` del repo origen.
