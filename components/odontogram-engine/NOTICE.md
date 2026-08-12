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

## Parches de diseño (integración Novudent, embebido en la ficha del paciente)

- `i18n/translations.ts`: `"app.title"` del locale `es` pasa de `"React Odontogram Modul"` (nombre
  del proyecto upstream) a `"Odontograma"` — Novudent solo usa el locale `es` (`language="es"`
  fijo), no se tocaron los otros 8 locales.
- `App.tsx`: se agregan 3 props opcionales (`showTourButton`, `showLanguageSelector`,
  `showDarkModeToggle`, todas default `true` — el comportamiento upstream no cambia si no se pasan)
  para poder ocultar botones del topbar que ya estaban fuera de alcance de la integración pero
  seguían renderizados: el tour interactivo de 12 pasos (explícitamente excluido en el spec de
  diseño), el selector de idioma (Novudent es español-only, controlado por prop) y el toggle
  claro/oscuro (Novudent no tiene modo oscuro a nivel app — el toggle deja el widget en un estado
  mitad-claro/mitad-oscuro real de baja legibilidad porque `themeConfig` solo cubre las variables
  `--odon-*` compartidas, no las reglas `.dark` propias del motor). `components/Odontogram.tsx` pasa
  los 3 en `false`.
- `index.css`: **no** se pone `overflow` en `.tooth-grid`. El scroll horizontal de rescate (para
  cuando las 16 columnas ×36px mín. ⇒ ~650px no entran en el ancho embebido) vive en `.chart`
  (`overflow:auto hidden`). Ponerlo también en la grilla hace que `overflow-y` compute a `auto`
  por spec, y eso recorta el anillo punteado + el `drop-shadow` del diente activo
  (`.tooth-tile:after{inset:-2px}`) en las piezas del borde; además el overlay de puentes
  (`position:absolute; inset:0`) pasaría a medir la caja visible en vez del contenido scrolleable.
  Hay un comentario en la regla para que no se vuelva a agregar.
