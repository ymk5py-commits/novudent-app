# Odontograma — adopción de React-Odontogram-Modul (ZoliQua)

**Fecha:** 2026-07-19
**Origen:** https://github.com/ZoliQua/React-Odontogram-Modul (MIT, v1.30.0, demo: https://react-odontogram-modul.vercel.app)

## Motivación

El odontograma actual (`components/Odontogram.tsx`, ~410 líneas artesanales) cubre 7 condiciones
(caries/extracción/restaurado/corona/endodoncia/implante/ausente) con 2 vistas SVG por pieza
(elevación anatómica + oclusal por superficies M/D/V/L/O). El usuario pidió reemplazarlo por el
módulo de ZoliQua, que es visualmente más realista (encía/raíz renderizadas) y clínicamente mucho
más profundo (~30 campos por diente: ICDAS, CARS, diagnóstico pulpar AAE, diagnóstico apical,
estadificación de periimplantitis 2018, materiales de obturación por superficie, ortodoncia por
pieza, desgaste/decoloración tipados, export HL7 FHIR R4, 864 tests).

## Decisiones (confirmadas con el usuario)

1. **Adoptar ambas cosas**: el nivel visual Y la profundidad clínica del módulo — no es un simple
   reskin, es reemplazo real del motor.
2. **Reteñir a la paleta Dentalink** (navy/azure/rojo) usando el `themeConfig` propio del módulo
   (`--odon-*` custom properties) — mantenemos fidelidad visual 1:1 con Dentalink, no adoptamos su
   estilo colorido/realista original tal cual.
3. **Cutover limpio, sin migración**: no hay clínicas reales en producción con datos cargados en el
   odontograma actual, así que se reemplaza el campo `Patient.odontogram` sin lógica de
   compatibilidad con el formato viejo.
4. **Fase 1 con alcance acotado**: se instala el motor completo pero se expone en la UI un
   subconjunto curado de campos (más rico que los 7 actuales, no los ~30). El resto queda
   disponible en el motor para prender en fases siguientes sin tocar la integración de nuevo.

## Hallazgos técnicos clave

- **No es paquete de npm** (`package.json` tiene `"private": true`, 404 en el registro). Se
  vendoriza el código fuente (`src/*`) y se adapta a Next.js — no hay `npm install` posible.
- **Sin dependencia de React Router** en `App.tsx`/`main.tsx` (confirmado por grep) → el componente
  se puede embeber directo dentro de un árbol de componentes Next.js sin conflicto de routers.
- **El motor mantiene estado interno (Map `toothState`), no React state**, y manipula el DOM
  directamente para el layering SVG (decisión de performance de upstream, documentada en su README).
- **La API pública NO expone lectura/escritura de datos como objeto JS** — solo botones que
  descargan/suben un archivo JSON (`Export Status` / `Import Status`). Las funciones que SÍ hacen
  exactamente lo que necesitamos ya existen pero son privadas:
  - `collectExportPayload()` (línea ~4569 de `odontogram.ts`) — arma `{version, globals, teeth}`
    con el estado completo. Es la misma función que usan tanto el export a JSON como el export FHIR.
  - `importStatus(data)` (línea ~4862) — aplica un payload al `toothState` interno (con migración
    automática de versiones legacy 1.4–2.9).
  - **Parche:** agregar `export` a ambas (o envolverlas en `getOdontogramStatus()`/
    `loadOdontogramStatus(data)`). Es un diff de 2 líneas sobre funciones ya testeadas — no es un
    hack sobre internals frágiles (los únicos exports "privados" reales son los `__xForTest`,
    que no tocamos).
- **Assets**: 6 SVGs de dientes (~70-80KB c/u) + 5 íconos, importados vía Vite (`import x from
  "./assets/..."`). Se migran a `public/odontogram/` y se referencian por path string.
- **i18n**: `translations.ts` pesa 246KB (9 idiomas). Novudent es español-only — se fuerza
  `language="es"` vía prop controlada y no se renderiza el selector de idioma (no hace falta tocar
  el hook `useI18n` internamente).
- **Tamaño de payload por paciente**: unos pocos KB (enums/booleans, sin imágenes) — lejos del
  límite de 1MB por doc de Firestore.

## Arquitectura

### Estructura de archivos
- `components/odontogram-engine/` (nuevo) — copia adaptada de `src/*` del repo origen: motor
  (`odontogram.ts` parcheado), `App.tsx` (recortado), `theme.ts`, `registry/`, `SettingsModal.tsx`,
  `i18n/`, `plugin.ts`, `bridgeOverlay.ts`, `status_extras.ts`, tests (`__tests__/`,
  `registry/__tests__/`). Incluye el `LICENSE` MIT de origen + comentario de atribución a
  ZoliQua/React-Odontogram-Modul (requisito de la licencia MIT al redistribuir).
  - **Se excluye**: `src/fhir/` completo (sin consumidor hoy), `tour.ts` y su botón de disparo.
- `components/Odontogram.tsx` (reescrito) — wrapper fino que **mantiene el mismo contrato externo**
  de hoy: `{ value, editable, onChange, authorName }`. Internamente:
  - monta `<App>` del motor con `themeConfig` Dentalink, `language="es"`, `numberingSystem="FDI"`,
    `readOnly={!editable}`, `enableNotes`.
  - tras `initOdontogram()`, llama `loadOdontogramStatus(value)` para hidratar desde Firestore.
  - se suscribe con `onStateChange(cb)`; en cada cambio (debounced) llama `getOdontogramStatus()` y
    dispara `onChange(payload)`.
  - agrega auditoría a nivel de documento (no por diente, ver "Qué se pierde" abajo):
    `odontogramUpdatedBy` / `odontogramUpdatedAt` como campos hermanos del payload, seteados por el
    wrapper en cada guardado.
- `public/odontogram/` (nuevo) — SVGs de dientes e íconos vendorizados.

### Datos (`lib/types.ts`, Firestore)
- `Patient.odontogram` cambia de `Record<string, ToothRecord>` al payload nativo del módulo
  (`{version, globals, teeth}`, tipo importado desde `components/odontogram-engine`).
- Se eliminan `ToothRecord`, `ToothCondition`, `ToothSurface` de `lib/types.ts` (sin usos fuera del
  odontograma tras el cutover).
- `lib/seed.ts`: los datos demo (`cl_demo`) que hoy siembran `ToothRecord` para pacientes de
  ejemplo se reescriben en el payload nuevo.
- **Sin cambios en `firestore.rules`**: `patientClinicalFields()` (blindaje RBAC de campo agregado
  en la sesión de seguridad, commit `4edd545`) ya incluye `'odontogram'` por nombre de campo, no por
  forma de dato — sigue protegiendo igual sin deploy de reglas adicional.

### Alcance de campos — Fase 1
**Prendido:** diente presente/ausente, superficies cariadas (M/D/V/L/O), obturaciones,
coronas/restauraciones básicas, endodoncia simple (`pulpDetailLevel: "simple"` — vital vs.
tratado), implante, notas por diente (`enableNotes`).

**Apagado (motor instalado, no expuesto en UI todavía):** ICDAS/CARS detallado
(`cariesDepthEnabled`), diagnóstico pulpar AAE/Latín (`pulpDetailLevel` más allá de `"simple"`),
diagnóstico apical y estadificación de periimplantitis, desgaste/decoloración tipados por causa
(`wearDetailLevel`/`discolorationDetailLevel: "simple"` o directamente ocultos), ortodoncia por
pieza (Novudent ya tiene módulo de Ortodoncia dedicado — evita duplicar), export/import FHIR,
selector de idioma, tour interactivo, sistema de plugins.

### Qué se pierde (trade-off aceptado)
Hoy cada `ToothRecord` tiene `updatedAt`/`updatedBy` individual. El payload nuevo es un blob único
por boca (`collectExportPayload()` no trackea por-campo quién tocó qué). La auditoría pasa a ser a
nivel de todo el odontograma ("última vez que se tocó, por quién"), vía los campos hermanos
`odontogramUpdatedBy/At` que agrega el wrapper — mismo patrón que ya usa el resto de la app para
documentos sin auditoría por-campo.

## Impacto en consumidores existentes

- **`app/app/pacientes/[id]/page.tsx`** (tab Odontograma de la ficha): sin cambios de integración
  más allá del wrapper (mismo contrato de props).
- **`components/PlanTratamiento.tsx`** (tab Odontograma del plan): ídem.
- **`components/ClinicalCopilot.tsx`** (`aplicarOdontograma` — IA de radiografías aplica hallazgos
  al odontograma): se actualiza la función de mapeo hallazgo→campo para escribir en el esquema
  nuevo, **solo para el subconjunto Fase 1**. El prompt de Gemini (`app/api/ia/radiografia/route.ts`,
  `app/api/ia/copilot/route.ts`) no cambia — devuelve hallazgos clínicos genéricos, es la función de
  aplicación la que mapea a campos concretos.
- **`components/Landing.tsx`** (vitrina pública, marketing): **no** se monta el motor completo ahí —
  pesa sensiblemente más (motor + assets + i18n) que el SVG artesanal actual, y es una página
  pública sin autenticar. Se mantiene una versión liviana solo-visual (reutilizando el
  `Elevation`/`ToothGlyph` actual, renombrado, no conectado a datos reales) exclusivamente para la
  landing.
- **`app/app/page.tsx`** (dashboard, usa `ToothGlyph`): idem — sigue apuntando al componente liviano
  de marketing, no al motor clínico.

## Testing

- El motor vendorizado trae sus propios 864 tests (Vitest + Testing Library) — se vendorizan junto
  con el código y corren en nuestro `npm run test` (cobertura gratis del motor + garantía de que el
  parche de 2 líneas no rompió nada).
- Tests propios nuevos para el wrapper (`components/odontogram-engine` adapter): round-trip
  `loadOdontogramStatus`→`getOdontogramStatus` preserva datos, `editable=false` mapea a
  `readOnly=true`, `themeConfig` aplica los tokens Dentalink esperados, la config de Fase 1
  (`pulpDetailLevel`, paneles ocultos, etc.) es la que se pretende.
- Tests existentes que dependían de `ToothRecord`/`ToothCondition` (si los hay en `lib/*.test.ts`)
  se migran o eliminan según corresponda.

## Explícitamente fuera de alcance (Fase 1)

Export/import FHIR R4, selector de idioma (multi-idioma), tour interactivo de 12 pasos, sistema de
plugins de terceros, ICDAS/CARS completo, diagnóstico pulpar AAE/Latín, estadificación de
periimplantitis, ortodoncia por pieza dentro del odontograma, desgaste/decoloración tipados por
causa clínica. Todo esto queda disponible en el motor vendorizado para fases futuras sin re-trabajo
de integración.
