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
- `App.tsx`: se agregan 2 props opcionales más (`showApicalDiagnosis`, `showPeriImplantStaging`,
  ambas default `true`) para la curación "Fase 1" del spec de diseño. El motor ya traía props para
  casi todo lo que la Fase 1 apaga (`cariesDepthEnabled`, `pulpDetailLevel`, `wearDetailLevel`,
  `discolorationDetailLevel`, `secondaryCariesMode`, `showOrthoCard`), pero el **diagnóstico apical**
  (`#apicalDxRow` + su dependiente `#periapicalTypeRow`) y la **estadificación de periimplantitis
  2018** (`#periImplantRow`) no tenían ninguna — se renderizaban siempre. Se implementan igual que
  `showOrthoCard`: un `<div>` contenedor con clase `hidden`, en vez de tocar el código imperativo
  del motor, que sigue togglendo `hidden` sobre las filas mismas (`syncPeriImplantVisibility`,
  `periapicalRowVisible`). Las dos capas componen: la fila se ve solo si el motor Y el host lo
  permiten. Verificado en el navegador con el control negativo (diente puesto en "Implante": la
  fila mide 71px sin la prop y 0px con la prop en `false`).
- `index.css`: **no** se pone `overflow` en `.tooth-grid`. El scroll horizontal de rescate (para
  cuando las 16 columnas ×36px mín. ⇒ ~650px no entran en el ancho embebido) vive en `.chart`
  (`overflow:auto hidden`). Ponerlo también en la grilla hace que `overflow-y` compute a `auto`
  por spec, y eso recorta el anillo punteado + el `drop-shadow` del diente activo
  (`.tooth-tile:after{inset:-2px}`) en las piezas del borde; además el overlay de puentes
  (`position:absolute; inset:0`) pasaría a medir la caja visible en vez del contenido scrolleable.
  Hay un comentario en la regla para que no se vuelva a agregar.
- `public/odontogram/teeth-svgs/*.svg` (arte del upstream, oct-2026): las piezas dejan de ser una
  silueta gris plana. Esmalte marfil con degradé (más cálido en el cuello, translúcido en el borde
  incisal), raíz color dentina que oscurece hacia el ápice, unión amelocementaria, volumen y
  reflejos; las vistas oclusales con el mismo marfil y fisuras marrones. Cada silueta (natural,
  rota, radix, tallada, debajo de la encía, de leche) se pinta con un `<pattern>`, así el sombreado
  sigue a todas las variantes; el brillo de la corona natural (`tooth-base-beauty`) suma una sombra
  interior recortada al contorno. La resina y la obturación provisoria llevan un borde fino para
  leerse sobre el marfil. **No cambian** `viewBox`, ids ni `data-active`: el contrato lo cuida
  `lib/odontogram-svg.test.ts`. Los ids nuevos llevan prefijo por archivo (`og11-…`, `og14o-…`).
- `odontogram.ts` (`scopePaintServerIds`, llamado en `addTile`): ids de pintura únicos por clon.
  Cada plantilla se clona una vez por pieza, y `url(#id)` resuelve contra el **primer** elemento
  del documento con ese id; si ese clon queda dentro de un `display:none`, Chrome no lo pinta y las
  demás piezas se quedan sin relleno. Pasaba en el celular: el selector de arcada oculta la fila de
  arriba y las piezas de abajo (ya las oclusales de premolares y molares) perdían el degradé. Se
  renombran solo degradés, patrones, `clipPath`, `mask` y `filter` (sufijo `--<pieza><o|l>`) y sus
  referencias; los ids de capas que maneja el motor no se tocan. Lo cubre
  `e2e/odontograma-realista.spec.ts` (falla si se saca el llamado).
- Vistas incisales de incisivos y caninos (oct-2026). Las 12 casillas de la fila oclusal que el
  motor dejaba vacías (`addPlaceholderTile` para 13…23 y 43…33) ahora muestran la pieza vista
  desde incisal, con el mismo marfil y la misma escala que las oclusales: `public/odontogram/
  teeth-svgs/11_occl.svg` (incisivos) y `13_occl.svg` (caninos), assets propios de Novudent con la
  estructura de capas de `14_occl.svg` (base, variantes, `tooth-base`, leche, superficies, coronas,
  carillas, puentes, implante, planes; sin onlays, así el motor las compone como vista frontal).
  Vestibular arriba, mesial a la derecha: el motor las rota y espeja igual que su pieza. Una pieza
  ausente, extraída o debajo de la encía deja la casilla vacía; un implante muestra la plataforma,
  como en premolares y molares. En `odontogram.ts`: `TEMPLATES_OCCL`, `occlNos` y
  `occlTemplateForTooth` suman las plantillas 11 y 13, y los conjuntos de casillas vacías quedan
  sin piezas. Tocar la vista incisal elige la pieza y se resalta con ella, como la oclusal de una
  muela; no lleva `role`/`tabindex` (el control accesible sigue siendo la casilla lateral). Efecto
  colateral buscado: en el celular, las casillas vacías no tenían clase de arcada y al elegir una
  sola arcada corrían la fila de abajo 6 columnas. En `index.css`, una regla
  `.tooth-tile.occl-view.tpl-11/.tpl-13` les da 64×64 (si no, les ganaba la regla de su plantilla
  lateral, 60×102). Lo cubren `lib/odontogram-svg.test.ts` y `e2e/odontograma-realista.spec.ts`.
