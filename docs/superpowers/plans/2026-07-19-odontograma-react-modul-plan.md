# Odontograma — adopción de React-Odontogram-Modul — Plan de Implementación

> **Para agentes:** usar **superpowers:subagent-driven-development** (recomendado) o
> **superpowers:executing-plans** para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Objetivo:** reemplazar `components/Odontogram.tsx` (motor artesanal, 7 condiciones) por el motor
vendorizado de `ZoliQua/React-Odontogram-Modul` (MIT), retineado a la paleta Dentalink, con un
subconjunto curado de campos clínicos en Fase 1.

**Arquitectura:** vendorizar `src/*` del repo origen (sin FHIR) a `components/odontogram-engine/`,
parchear 2 funciones privadas para exponerlas como API de datos, envolver todo en un componente
`components/Odontogram.tsx` que mantiene el contrato externo actual, y migrar `Patient.odontogram`
al payload nativo del motor.

**Stack:** Next.js 14 App Router + TypeScript + React 18 (ya en el proyecto). El motor vendorizado
no agrega dependencias npm nuevas (confirmado: cero uso real de `jspdf`/`nanoid`/`react-hook-form`/
`react-router-dom` en el código que se vendoriza).

**Spec:** `docs/superpowers/specs/2026-07-19-odontograma-react-modul-design.md`

---

## Estructura de archivos

```
components/
  odontogram-engine/                 [NUEVO — vendorizado + parcheado]
    LICENSE                          MIT original + atribución
    odontogram.ts                    motor (parcheado: sin FHIR, exporta collectExportPayload/importStatus)
    App.tsx                          shell (parcheado: sin FHIR, agrega prop onReady)
    SettingsModal.tsx                sin cambios
    plugin.ts                        sin cambios (dependencia estructural)
    bridgeOverlay.ts                 sin cambios (dependencia estructural)
    status_extras.ts                 sin cambios
    theme.ts                         sin cambios
    tour.ts                          sin cambios (no se expone el botón, pero se vendoriza intacto)
    index.css                        sin cambios
    i18n/
      useI18n.ts
      translations.ts
    utils/
      numbering.ts
    registry/
      types.ts axes.ts restorations.ts svgActivate.ts svgLayers.ts uiOptions.ts validate.ts
      __tests__/  (sin los 2 archivos FHIR)
    fhir/
      codesystems.ts                 ÚNICO archivo de fhir/ que se conserva (dependencia de axes/validate)
    __tests__/  (sin los 4 archivos FHIR-only, con ~15 podados)
    dentalink-theme.ts               [NUEVO, nuestro] — themeConfig con colores Novudent
  Odontogram.tsx                     [REESCRITO] wrapper fino, mismo contrato { value, editable, onChange, authorName }
  OdontogramShowcase.tsx             [NUEVO] extracción liviana del SVG artesanal viejo, solo para Landing/dashboard
public/
  odontogram/
    teeth-svgs/  11.svg 13.svg 14.svg 14_occl.svg 16.svg 16_occl.svg
    icon-svgs/   icon_8.svg icon_gum.svg icon_no_selection.svg icon_occl.svg icon_pulp.svg
lib/
  types.ts                           [MODIFICADO] quita ToothRecord/ToothCondition/ToothSurface, agrega OdontogramStatus/OdontogramToothState
  store.tsx                          [MODIFICADO] setTooth → setOdontogram + mergeOdontogramTooth
  seed.ts                            [MODIFICADO] datos demo en esquema nuevo
  odontogram-findings.ts             [NUEVO] mapeo puro hallazgo-IA → campos del payload (TDD)
  odontogram-findings.test.ts        [NUEVO]
components/
  ClinicalCopilot.tsx                [MODIFICADO] usa el mapeo nuevo
```

---

### Task 1: Vendorizar el árbol externo (clone + copia selectiva)

**Files:**
- Create: `components/odontogram-engine/**` (decenas de archivos, ver script)
- Create: `public/odontogram/teeth-svgs/*.svg`, `public/odontogram/icon-svgs/*.svg`

- [ ] **Paso 1: clonar el repo origen a un directorio temporal**

```bash
rm -rf /tmp/odonto-src && git clone --depth 1 https://github.com/ZoliQua/React-Odontogram-Modul.git /tmp/odonto-src
```

Expected: `Cloning into '/tmp/odonto-src'...` seguido de `done.` sin errores.

- [ ] **Paso 2: crear la estructura de destino y copiar el motor + shell + módulos de soporte**

```bash
cd "novudent-app"
mkdir -p components/odontogram-engine/i18n components/odontogram-engine/utils components/odontogram-engine/registry components/odontogram-engine/fhir
mkdir -p public/odontogram/teeth-svgs public/odontogram/icon-svgs

cp /tmp/odonto-src/LICENSE components/odontogram-engine/LICENSE
cp /tmp/odonto-src/src/odontogram.ts components/odontogram-engine/odontogram.ts
cp /tmp/odonto-src/src/App.tsx components/odontogram-engine/App.tsx
cp /tmp/odonto-src/src/SettingsModal.tsx components/odontogram-engine/SettingsModal.tsx
cp /tmp/odonto-src/src/plugin.ts components/odontogram-engine/plugin.ts
cp /tmp/odonto-src/src/bridgeOverlay.ts components/odontogram-engine/bridgeOverlay.ts
cp /tmp/odonto-src/src/status_extras.ts components/odontogram-engine/status_extras.ts
cp /tmp/odonto-src/src/theme.ts components/odontogram-engine/theme.ts
cp /tmp/odonto-src/src/tour.ts components/odontogram-engine/tour.ts
cp /tmp/odonto-src/src/index.css components/odontogram-engine/index.css

cp /tmp/odonto-src/src/i18n/useI18n.ts components/odontogram-engine/i18n/useI18n.ts
cp /tmp/odonto-src/src/i18n/translations.ts components/odontogram-engine/i18n/translations.ts
cp /tmp/odonto-src/src/utils/numbering.ts components/odontogram-engine/utils/numbering.ts

cp /tmp/odonto-src/src/registry/types.ts components/odontogram-engine/registry/types.ts
cp /tmp/odonto-src/src/registry/axes.ts components/odontogram-engine/registry/axes.ts
cp /tmp/odonto-src/src/registry/restorations.ts components/odontogram-engine/registry/restorations.ts
cp /tmp/odonto-src/src/registry/svgActivate.ts components/odontogram-engine/registry/svgActivate.ts
cp /tmp/odonto-src/src/registry/svgLayers.ts components/odontogram-engine/registry/svgLayers.ts
cp /tmp/odonto-src/src/registry/uiOptions.ts components/odontogram-engine/registry/uiOptions.ts
cp /tmp/odonto-src/src/registry/validate.ts components/odontogram-engine/registry/validate.ts
# NOTA: registry/fhir.ts y registry/fromFhir.ts NO se copian (solo los usan fhir/toFhir.ts y
# fhir/fromFhir.ts, que tampoco se copian — build FHIR real, sin consumidor fuera de FHIR).

cp /tmp/odonto-src/src/fhir/codesystems.ts components/odontogram-engine/fhir/codesystems.ts
# NOTA: fhir/toFhir.ts, fhir/fromFhir.ts, fhir/primitives.ts, fhir/types.ts, fhir/fieldMappings.ts
# NO se copian — codesystems.ts es el único archivo de fhir/ usado fuera de la propia FHIR
# (lo importan registry/axes.ts y registry/validate.ts para LOCAL_VALUE_MAPS).

cp /tmp/odonto-src/src/assets/teeth-svgs/{11,13,14,14_occl,16,16_occl}.svg public/odontogram/teeth-svgs/
cp /tmp/odonto-src/src/assets/icon-svgs/{icon_8,icon_gum,icon_no_selection,icon_occl,icon_pulp}.svg public/odontogram/icon-svgs/
```

Expected: sin errores de `cp`. `ls components/odontogram-engine` debe listar 10 archivos/carpetas
en el nivel raíz (`LICENSE, odontogram.ts, App.tsx, SettingsModal.tsx, plugin.ts, bridgeOverlay.ts,
status_extras.ts, theme.ts, tour.ts, index.css, i18n, utils, registry, fhir`).

- [ ] **Paso 3: copiar los tests vendorizables (se podan de FHIR en Task 4)**

```bash
mkdir -p components/odontogram-engine/__tests__/parity components/odontogram-engine/registry/__tests__
cp -r /tmp/odonto-src/src/__tests__/. components/odontogram-engine/__tests__/
cp -r /tmp/odonto-src/src/registry/__tests__/. components/odontogram-engine/registry/__tests__/
```

Expected: `find components/odontogram-engine/__tests__ -name '*.test.*' | wc -l` → 84,
`find components/odontogram-engine/registry/__tests__ -name '*.test.*' | wc -l` → 11.

- [ ] **Paso 4: agregar atribución MIT al motor**

Crear `components/odontogram-engine/NOTICE.md`:
```markdown
# Atribución

El motor de este directorio (`odontogram.ts`, `App.tsx`, `SettingsModal.tsx`, `plugin.ts`,
`bridgeOverlay.ts`, `status_extras.ts`, `theme.ts`, `tour.ts`, `index.css`, `i18n/`, `utils/`,
`registry/`, `fhir/codesystems.ts`) es una copia adaptada de
[React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul) de Zoltán Dul,
licenciado MIT (ver `LICENSE` en este mismo directorio). Se removió toda la funcionalidad de
exportación/importación HL7 FHIR (sin consumidor en Novudent) y se agregaron: exports públicos de
`collectExportPayload`/`importStatus` (antes privados) y una prop `onReady` en `<App>`, para poder
conectar el motor a Firestore desde `components/Odontogram.tsx`.
```

- [ ] **Paso 5: commit**

```bash
git add components/odontogram-engine public/odontogram
git commit -m "vendor: copia de React-Odontogram-Modul (ZoliQua, MIT) sin FHIR"
```

---

### Task 2: Parchear `odontogram.ts` — quitar FHIR, exponer `collectExportPayload`/`importStatus`, agregar hook de ready

**Files:**
- Modify: `components/odontogram-engine/odontogram.ts`
- Test: `components/odontogram-engine/__tests__/status-bridge.test.ts` (nuevo, nuestro)

- [ ] **Paso 1: escribir el test que falla (verifica que el "puente de datos" existe y hace round-trip)**

```ts
// components/odontogram-engine/__tests__/status-bridge.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { initOdontogram, destroyOdontogram, collectExportPayload, importStatus } from "../odontogram";

describe("puente de datos del motor (collectExportPayload/importStatus públicas)", () => {
  beforeEach(async () => {
    document.body.innerHTML = '<div id="toothGrid"></div><div id="root"></div>';
    await initOdontogram();
  });

  it("collectExportPayload devuelve {version, globals, teeth} con las 32 piezas permanentes", () => {
    const payload = collectExportPayload();
    expect(payload.version).toBe("2.10");
    expect(Object.keys(payload.teeth).length).toBeGreaterThanOrEqual(32);
  });

  it("importStatus + collectExportPayload hacen round-trip de un hallazgo simple", () => {
    const before = collectExportPayload();
    before.teeth["16"] = { ...before.teeth["16"], caries: ["O"], toothSelection: "permanent" };
    importStatus(before);
    const after = collectExportPayload();
    expect(after.teeth["16"].caries).toEqual(["O"]);
  });
});
```

- [ ] **Paso 2: correr el test, verificar que falla**

Run: `npx vitest run components/odontogram-engine/__tests__/status-bridge.test.ts`
Expected: FAIL — `collectExportPayload`/`importStatus` no están exportadas (`SyntaxError` o
`undefined is not a function`, según cómo Vite/Vitest resuelva el import nombrado inexistente).

- [ ] **Paso 3: quitar los imports de FHIR (líneas 5-7)**

En `components/odontogram-engine/odontogram.ts`, eliminar:
```ts
import { buildFhirBundle } from "./fhir/toFhir";
import { parseFhirBundle } from "./fhir/fromFhir";
import type { FhirExportOptions } from "./fhir/types";
```

- [ ] **Paso 4: exportar `collectExportPayload`**

Cambiar (línea ~4569):
```ts
function collectExportPayload(){
```
a:
```ts
export function collectExportPayload(){
```

- [ ] **Paso 5: eliminar `exportFhir()` completa**

Eliminar el bloque (docblock + función, ~9 líneas antes de `function importStatus`):
```ts
export function exportFhir(options?: FhirExportOptions){
  const bundle = buildFhirBundle(collectExportPayload(), options);
  downloadJson(bundle, "odontogram-fhir");
}
```

- [ ] **Paso 6: exportar `importStatus`**

Cambiar:
```ts
function importStatus(data: Any){
```
a:
```ts
export function importStatus(data: Any){
```

- [ ] **Paso 7: eliminar `importFhirBundle()` completa**

Eliminar (docblock + función, justo después de `importStatus`):
```ts
/** Import a FHIR R4 Bundle (object or JSON string) produced by this module. */
export function importFhirBundle(input: Any){
  let bundle = input;
  if(typeof input === "string"){
    try{ bundle = JSON.parse(input); }catch(e){ console.error("Invalid FHIR JSON", e); return; }
  }
  const payload = parseFhirBundle(bundle);
  importStatus(payload);
}
```

- [ ] **Paso 8: eliminar `setImportFormat`/`pendingImportFormat` y simplificar el handler de import**

Eliminar la declaración de `pendingImportFormat` y la función `setImportFormat` (~5 líneas, cerca de
la línea 5218). Ubicar el handler de import de archivo (~línea 5836-5852) que hoy hace:
```ts
const format = pendingImportFormat;
if(format === "fhir"){ importFhirBundle(data); } else { importStatus(data); }
pendingImportFormat = "status";
```
y reemplazarlo por:
```ts
importStatus(data);
```

- [ ] **Paso 9: eliminar el wiring del botón oculto FHIR**

Eliminar (~línea 5810):
```ts
const fhirBtn = $("#btnStatusFhirExport") as HTMLButtonElement | null;
```
y (~líneas 5816-5818):
```ts
if(fhirBtn){
  fhirBtn.onclick = () => exportFhir();
}
```

- [ ] **Paso 10: agregar el hook `onReady` — el wrapper de Novudent necesita saber cuándo terminó `initOdontogram()` para hidratar los datos del paciente sin pisar una carga en curso**

`initOdontogram` hoy es:
```ts
export async function initOdontogram(){
  if(initialized) return;
  ...
}
```
Se llama sin `await` desde el `useEffect` de montaje de `App.tsx` (Task 3) — no hay forma externa de
saber cuándo terminó. Se agrega un callback opcional. Cambiar la firma a:
```ts
export async function initOdontogram(onReady?: () => void){
  if(initialized) return;
  initialized = true;
  const token = ++initToken;
  wireControls();
  await buildGrid(token);
  if(!initialized || token !== initToken) return;
  if(!i18nUnsubscribe){
    i18nUnsubscribe = onI18nChange(()=>refreshLocalizedContent());
  }
  refreshLocalizedContent();
  if(activeTooth != null){
    const state = toothState.get(activeTooth);
    if(state){
      syncControlsFromState(state);
    }
  }
  onReady?.();
}
```
(La única adición real es el parámetro `onReady?` y la llamada `onReady?.();` al final del cuerpo
existente — el resto del cuerpo no cambia.)

- [ ] **Paso 11: correr el test de nuevo, verificar que pasa**

Run: `npx vitest run components/odontogram-engine/__tests__/status-bridge.test.ts`
Expected: PASS (2 tests).

- [ ] **Paso 12: correr TODO el test suite vendorizado, verificar que el parche no rompió nada de FHIR-adyacente**

Run: `npx vitest run components/odontogram-engine/__tests__ components/odontogram-engine/registry/__tests__ 2>&1 | tail -30`
Expected: fallan SOLO los archivos que todavía tienen referencias a FHIR sin podar (se resuelve en
Task 4) — anotar cuántos fallan para comparar después de esa tarea.

- [ ] **Paso 13: commit**

```bash
git add components/odontogram-engine/odontogram.ts components/odontogram-engine/__tests__/status-bridge.test.ts
git commit -m "feat(odontograma): parche del motor — sin FHIR, expone collectExportPayload/importStatus/onReady"
```

---

### Task 3: Parchear `App.tsx` — quitar FHIR, exponer `onReady`

**Files:**
- Modify: `components/odontogram-engine/App.tsx`

- [ ] **Paso 1: en la línea 2 (import desde `./odontogram`), quitar `exportFhir` y `setImportFormat` de la lista** (el resto de los ~35 símbolos importados queda igual). Agregar `initOdontogram` sigue igual (ya está en la lista) — no hace falta tocar su posición.

- [ ] **Paso 2: en la línea 3 (re-export con el mismo shape), quitar los mismos dos tokens `exportFhir` y `setImportFormat`.**

- [ ] **Paso 3: eliminar la línea 7 completa**
```ts
export type { FhirExportOptions } from "./fhir/types";
```

- [ ] **Paso 4: eliminar el botón oculto de export FHIR (línea ~451)**
```tsx
<button id="btnStatusFhirExport" hidden aria-hidden="true" tabIndex={-1}>{t("topbar.exportFhir")}</button>
```

- [ ] **Paso 5: eliminar el ítem del dropdown de export que dispara FHIR (línea ~462)** — el `<button>`/`<div>` del menú "Export" cuyo `onClick` llama a `exportFhir()` o hace click sobre `#btnStatusFhirExport`, con label `{t("export.menu.fhir")}`.

- [ ] **Paso 6: en el ítem de import "status" (línea ~476), quitar la sub-llamada a `setImportFormat("status")`** dejando solo el `.click()` sobre `#btnStatusImport` (o el input file correspondiente).

- [ ] **Paso 7: eliminar el ítem completo del dropdown de import FHIR (línea ~477)** — el que llama `setImportFormat("fhir")` antes de disparar el input file.

- [ ] **Paso 8: agregar la prop `onReady` al tipo `AppProps` y pasarla a `initOdontogram`**

En el bloque `type AppProps = { ... }`, agregar:
```ts
  /** Se dispara una vez que initOdontogram() terminó de construir la grilla — recién ahí es
   *  seguro llamar loadOdontogramStatus() para hidratar datos sin pisar una carga en curso. */
  onReady?: () => void;
```
Destructurar `onReady` de los props del componente (junto al resto), y en el `useEffect` de montaje
(~línea 253-257), cambiar:
```ts
useEffect(() => {
  initOdontogram();
  return () => {
    destroyOdontogram();
  };
}, []);
```
a:
```ts
useEffect(() => {
  initOdontogram(onReady);
  return () => {
    destroyOdontogram();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```
(deps vacío intencional — se mantiene igual que el original, `onReady` se lee vía closure del
primer render, consistente con que el resto de los props de configuración inicial de este mismo
efecto tampoco están en el arreglo de deps).

- [ ] **Paso 9: verificar que compila sin referencias colgantes**

Run: `npx tsc --noEmit -p . 2>&1 | grep odontogram-engine`
Expected: sin salida (0 errores) referida a `components/odontogram-engine/App.tsx`. Es esperable que
en este punto SÍ haya errores de otros archivos del motor si algo más quedó mal — anotar y resolver
antes de continuar si aparecen.

- [ ] **Paso 10: commit**

```bash
git add components/odontogram-engine/App.tsx
git commit -m "feat(odontograma): parche de App.tsx — sin FHIR, agrega prop onReady"
```

---

### Task 4: Podar FHIR de los tests vendorizados

**Files:**
- Delete: 4 archivos + 2 fixtures (ver tabla)
- Modify: ~15 archivos (ver tabla)

- [ ] **Paso 1: borrar los archivos 100% FHIR + sus fixtures doradas**

```bash
rm components/odontogram-engine/__tests__/fhir.test.ts
rm components/odontogram-engine/__tests__/fhir-import.test.ts
rm components/odontogram-engine/registry/__tests__/fhir-registry.test.ts
rm components/odontogram-engine/registry/__tests__/fromfhir-registry.test.ts
rm components/odontogram-engine/__tests__/parity/fhir-golden.json
rm components/odontogram-engine/__tests__/parity/roundtrip-golden.json
```

- [ ] **Paso 2: excluir también `fhir/fieldMappings.ts`** (decisión: consistencia total — cero
  superficie FHIR en el vendorizado, ni siquiera datos declarativos sin código ejecutable). Esto NO
  se copió en Task 1 (no estaba en la lista de `cp`), así que no hay nada que borrar — solo implica
  que en el Paso 3 los tests que lo referencian pierden esa aserción puntual, no el archivo completo.

- [ ] **Paso 3: editar los archivos mixtos.** Para cada uno: abrir el archivo, ubicar por el título
  EXACTO (string literal del primer argumento de `it(...)`/`describe(...)`, es único y greppable —
  usar `grep -n "<título>" <archivo>` para confirmar la línea antes de borrar), eliminar ese bloque
  completo (desde el `it(`/`describe(` hasta su `}` de cierre) y los imports que quedan sin uso.

| Archivo | Imports a quitar (líneas orig.) | Bloque(s) a eliminar (título exacto) |
|---|---|---|
| `__tests__/crown-leakage.test.ts` | 12-14 | `describe("crown-leakage axis: FHIR round-trip")` |
| `__tests__/radiographic-depth-badge.test.ts` | 20-22 | `describe(...FHIR round-trip...)` (grep `"FHIR"` en el archivo para el título literal) |
| `__tests__/payload-2-4-roundtrip.test.ts` | 15-16 | los 2 `it(...)` con "FHIR" en el título (líneas orig. 37 y 67) |
| `__tests__/sp10-filling-defect.test.ts` | 3-4 | `it("FHIR round-trips fillingDefect")` |
| `__tests__/sp7-payload-version.test.ts` | 11-12 | `it(...)` con "FHIR" en el título (línea orig. 20) |
| `__tests__/sp18-periimplant-roundtrip.test.ts` | 4-5 | SOLO `it("FHIR export -> import round-trips...")` — el archivo tiene 6 `it()`, los otros 5 (vía JSON nativo) quedan intactos |
| `__tests__/parity/restoration-behavior.test.ts` | 14 | helper `findCoding()` (línea orig. 23, usado solo en 142-143) + `it(...)` línea orig. 137 |
| `__tests__/parity/capture.ts` | 8-9 | líneas orig. 35-36 (escritura de `fhir-golden.json`) + 38-39 (`roundtrip-golden.json`) + recortar el `console.log` de línea 42 — **no** tocar las líneas 20-33 (captura de `svg-fingerprints.json`, independiente) |
| `__tests__/sp11-wear.test.ts` | 5-6 | dentro de `it("migration + modern-wins + FHIR/JSON round-trip")` (línea orig. 39), borrar SOLO las ~5 líneas finales del roundtrip FHIR (diente 13) — conservar las aserciones de migración legacy (diente 11) y "modern wins" (diente 12) |
| `__tests__/parity.test.ts` | 6-7 (siempre), 9 (`FIELD_MAPPINGS`) | `it("FHIR bundles match")` (línea orig. 36) + `it("round-trips match")` (línea orig. 40) + `it("...FIELD_MAPPINGS...")` (línea orig. 47) — conservar `it("SVG fingerprints match")` y el `it` de `LOCAL_VALUE_MAPS` |
| `__tests__/sp12-discoloration.test.ts` | 5-6 (siempre), 3 (`FIELD_MAPPINGS`) | `it("FHIR round-trips discoloration")` (línea orig. 34) + `it("...FIELD_MAPPINGS row")` (línea orig. 15) |
| `__tests__/sp14-orthodontics.test.ts` | 6-7 (siempre), 3 (`FIELD_MAPPINGS`) | `it("FHIR round-trips")` (línea orig. 34) + `it("4 axes + FIELD_MAPPINGS rows")` (línea orig. 16) |
| `registry/__tests__/caries-fields.test.ts` | 11-14 | `describe("SP5 Task 1: FHIR round-trip")` (línea orig. 62) + `describe("FIX 1... legacy secondary-caries FHIR import")` (línea orig. 131) |
| `registry/__tests__/prosthesis.test.ts` | 4-7 | `describe("prosthesis axis FHIR round-trip...")` (línea orig. 53) |
| `registry/__tests__/diagnosis-axes.test.ts` | 10 (`FIELD_MAPPINGS`) | `it("AXES.length === FIELD_MAPPINGS.length")` (línea orig. 40) + `it("each new axis has a matching FIELD_MAPPINGS row...")` (línea orig. 44) |
| `registry/__tests__/peri-implant-axis.test.ts` | 3 (`FIELD_MAPPINGS`) | `it("has a matching FIELD_MAPPINGS row (parity)")` (línea orig. 17) |

- [ ] **Paso 4: los archivos "triviales" (mock de `exportFhir` en `vi.mock`) — quitar solo la línea del mock, sin más cambios**

Archivos: `sp11-wear-ui.test.ts`, `sp12-discoloration-ui.test.ts`, `sp13-wear-layout.test.ts`,
`sp14-ortho-ui.test.ts`, `sp8-peri-implant-ui.test.ts`, `sp7-card-merge.test.ts`, `App.test.tsx`.
En cada uno, dentro del `vi.mock("../odontogram", () => ({ ... }))`, quitar la entrada
`exportFhir: vi.fn(),` (y `setImportFormat: vi.fn(),` si está presente en ese mismo mock).

- [ ] **Paso 5: correr el suite completo, verificar 0 referencias a FHIR y 0 fallos**

```bash
grep -rln "fhir\|Fhir\|FHIR" components/odontogram-engine/__tests__ components/odontogram-engine/registry/__tests__ 2>/dev/null
```
Expected: sin salida (o solo `diagnosis-ui.test.ts`, que tiene la palabra en un título de test sin
código FHIR real — confirmado en la investigación previa, no requiere cambios).

```bash
npx vitest run components/odontogram-engine/__tests__ components/odontogram-engine/registry/__tests__
```
Expected: todos los tests PASS (compara contra el conteo de fallos anotado al final de Task 2 —
debería haber bajado a 0 fallos relacionados a imports de FHIR faltantes).

- [ ] **Paso 6: commit**

```bash
git add components/odontogram-engine/__tests__ components/odontogram-engine/registry/__tests__
git commit -m "test(odontograma): poda funcionalidad/tests de FHIR del motor vendorizado"
```

---

### Task 5: Adaptar los imports de SVG (Vite → Next.js)

**Files:**
- Modify: `components/odontogram-engine/odontogram.ts` (imports de teeth-svgs)
- Modify: `components/odontogram-engine/App.tsx` (imports de icon-svgs)

- [ ] **Paso 1: en `odontogram.ts`, ubicar los imports de SVG de dientes** (cerca de la línea 25-30,
  patrón `import tooth11Url from "./assets/teeth-svgs/11.svg";` × 6) y reemplazarlos por constantes
  de path string apuntando a `/public`:

```ts
// Antes (× 6, una por archivo: 11, 13, 14, 14_occl, 16, 16_occl):
import tooth11Url from "./assets/teeth-svgs/11.svg";

// Después:
const tooth11Url = "/odontogram/teeth-svgs/11.svg";
```

- [ ] **Paso 2: en `App.tsx`, ubicar los imports de íconos** (líneas 18-22) y aplicar el mismo
  reemplazo:

```ts
// Antes:
import icon8Url from "./assets/icon-svgs/icon_8.svg";
import iconGumUrl from "./assets/icon-svgs/icon_gum.svg";
import iconNoSelectionUrl from "./assets/icon-svgs/icon_no_selection.svg";
import iconOcclUrl from "./assets/icon-svgs/icon_occl.svg";
import iconPulpUrl from "./assets/icon-svgs/icon_pulp.svg";

// Después:
const icon8Url = "/odontogram/icon-svgs/icon_8.svg";
const iconGumUrl = "/odontogram/icon-svgs/icon_gum.svg";
const iconNoSelectionUrl = "/odontogram/icon-svgs/icon_no_selection.svg";
const iconOcclUrl = "/odontogram/icon-svgs/icon_occl.svg";
const iconPulpUrl = "/odontogram/icon-svgs/icon_pulp.svg";
```

- [ ] **Paso 3: verificar que no quedan imports de `.svg` en el motor**

```bash
grep -rn "from \"\./assets" components/odontogram-engine/
```
Expected: sin salida.

- [ ] **Paso 4: correr el test `svg-assets.test.ts` vendorizado (verifica que las URLs resuelven)**

Run: `npx vitest run components/odontogram-engine/__tests__/svg-assets.test.ts`
Expected: PASS (si el test asume un import de módulo en vez de una constante string, ajustar el
test para que compare contra el path string — es un test QUE NOSOTROS mantenemos, no hay problema
en adaptarlo).

- [ ] **Paso 5: commit**

```bash
git add components/odontogram-engine/odontogram.ts components/odontogram-engine/App.tsx components/odontogram-engine/__tests__/svg-assets.test.ts
git commit -m "fix(odontograma): assets SVG servidos desde /public en vez de imports de Vite"
```

---

### Task 6: Checkpoint — el motor vendorizado compila y sus tests pasan de punta a punta

**Files:** ninguno (solo verificación)

- [ ] **Paso 1: typecheck aislado del motor**

Run: `npx tsc --noEmit 2>&1 | grep odontogram-engine`
Expected: sin salida.

- [ ] **Paso 2: suite completa del motor**

Run: `npx vitest run components/odontogram-engine`
Expected: todos PASS (el motor trae ~850 tests propios menos los ~4 archivos FHIR eliminados en
Task 4 — un número alto, tres dígitos, sin fallos).

Si algo falla acá, NO seguir a la Task 7 — el motor tiene que estar sano por sí solo antes de
conectarlo a Novudent (evita debuggear 2 capas de problemas a la vez).

---

### Task 7: Tipos — `OdontogramStatus` reemplaza `ToothRecord`/`ToothCondition`/`ToothSurface`

**Files:**
- Modify: `lib/types.ts`

- [ ] **Paso 1: en `lib/types.ts`, eliminar las definiciones viejas** (verificar líneas exactas con
  `grep -n "ToothCondition\|ToothSurface\|interface ToothRecord" lib/types.ts` antes de editar,
  pueden haberse corrido por ediciones previas en la sesión):

```ts
// ELIMINAR:
export type ToothCondition =
  | "caries" | "extraccion" | "restaurado" | "corona" | "endodoncia" | "ausente" | "implante";
export type ToothSurface = "M" | "D" | "V" | "L" | "O";
export interface ToothRecord {
  condition: ToothCondition;
  surfaces?: ToothSurface[];
  note?: string;
  updatedAt: string;
  updatedBy: string;
}
```

- [ ] **Paso 2: agregar los tipos nuevos en el mismo lugar**

```ts
/** Estado de UNA pieza en el payload del motor de odontograma (React-Odontogram-Modul,
 *  vendorizado en components/odontogram-engine). El motor mismo trata estos campos como
 *  `any` internamente (ver registry/ = fuente de verdad declarativa de los ~30 campos posibles:
 *  toothSelection, caries, fillingSurfaces, restorationType, endo, mobility, note, etc.) — tiparlo
 *  campo por campo acá duplicaría esa fuente de verdad y se desincronizaría. Se usa
 *  Record<string, unknown> deliberadamente; el código propio de Novudent que lee/escribe campos
 *  puntuales (lib/odontogram-findings.ts, lib/seed.ts) los referencia por nombre con comentario. */
export interface OdontogramToothState {
  [field: string]: unknown;
}

/** Payload completo del odontograma de un paciente — mismo shape que
 *  collectExportPayload()/importStatus() del motor vendorizado. */
export interface OdontogramStatus {
  version: string;
  globals: {
    wisdomVisible?: boolean;
    showBase?: boolean;
    occlusalVisible?: boolean;
    showHealthyPulp?: boolean;
    edentulous?: boolean;
  };
  teeth: Record<string, OdontogramToothState>;
}
```

- [ ] **Paso 3: actualizar el campo en `Patient`**

Cambiar:
```ts
odontogram?: Record<string, ToothRecord>;
```
a:
```ts
odontogram?: OdontogramStatus;
/** Auditoría a nivel de documento (el motor no trackea por-diente quién tocó qué). */
odontogramUpdatedBy?: string;
odontogramUpdatedAt?: string;
```

- [ ] **Paso 4: verificar que no queda ningún uso de los tipos viejos fuera de los archivos que se
  tocan en tareas siguientes**

```bash
grep -rn "\bToothCondition\b\|\bToothSurface\b\|: ToothRecord\b" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```
Expected: coincidencias SOLO en `components/Odontogram.tsx`, `components/Landing.tsx`,
`components/ClinicalCopilot.tsx`, `lib/store.tsx`, `lib/seed.ts` — todos se resuelven en las Tasks 8-11.
Si aparece algún OTRO archivo no contemplado, agregar una task para ese archivo antes de continuar.

- [ ] **Paso 5: commit**

```bash
git add lib/types.ts
git commit -m "refactor(tipos): OdontogramStatus reemplaza ToothRecord/ToothCondition/ToothSurface"
```

(El proyecto no compilará limpio hasta terminar las Tasks 8-11 — es esperado, `tsc` se corre recién
al final de la Task 12.)

---

### Task 8: `OdontogramShowcase.tsx` (extracción liviana) + reescritura de `components/Odontogram.tsx`

**Files:**
- Create: `components/OdontogramShowcase.tsx`
- Create: `components/odontogram-engine/dentalink-theme.ts`
- Rewrite: `components/Odontogram.tsx`

- [ ] **Paso 1: extraer el SVG artesanal viejo a un componente de marketing, ANTES de sobreescribir
  `Odontogram.tsx`**

Copiar de la versión actual de `components/Odontogram.tsx` (la que existe HOY, antes de este plan)
las funciones `Elevation`, `Occlusal`, `ToothCol`, las constantes `UPPER`/`LOWER`/`ANAT`/`SEG`/`RED`/
`BLUE`/`CONDITIONS`, y crear:

```tsx
// components/OdontogramShowcase.tsx
"use client";
/** Vitrina visual del odontograma para la landing pública y el dashboard — SVG artesanal
 *  desconectado de datos reales de pacientes. No usar para el flujo clínico real: ver
 *  components/Odontogram.tsx (motor React-Odontogram-Modul vendorizado). */
import { useMemo } from "react";

// [pegar acá, sin modificar, el contenido de: tipos ToothType/ANAT, función toothType,
//  componente Elevation, tipo SEG/ALL_SURFACES, componente Occlusal, componente ToothCol —
//  tal cual están hoy en components/Odontogram.tsx, líneas 24-207 de la versión actual]

export type ShowcaseToothCondition =
  | "caries" | "extraccion" | "restaurado" | "corona" | "endodoncia" | "ausente" | "implante";
export type ShowcaseToothSurface = "M" | "D" | "V" | "L" | "O";
export interface ShowcaseToothRecord {
  condition: ShowcaseToothCondition;
  surfaces?: ShowcaseToothSurface[];
}

// [renombrar los usos de ToothRecord/ToothCondition/ToothSurface dentro del código pegado a
//  ShowcaseToothRecord/ShowcaseToothCondition/ShowcaseToothSurface — son solo anotaciones de tipo
//  locales a este archivo, no dependen de lib/types.ts]

export { Elevation as ToothGlyph };
```

Este componente queda 100% autocontenido — no importa nada de `lib/types.ts` ni de
`components/odontogram-engine`.

- [ ] **Paso 2: armar el tema Dentalink**

```ts
// components/odontogram-engine/dentalink-theme.ts
/** Reteñido del motor vendorizado a la paleta Dentalink de Novudent (tailwind.config.ts).
 *  Cubre las 8 variables de "cromado" del motor (fondo, panel, texto, bordes, acento) vía su
 *  propio themeConfig — NO cubre los colores de material por restauración (amalgama/composite/
 *  oro/etc., definidos en registry/restorations.ts), que mantienen la paleta realista original
 *  del motor: es la parte visual que motivó adoptarlo, no un desvío de la fidelidad Dentalink. */
import type { OdontogramThemeConfig } from "./theme";

export const DENTALINK_ODONTOGRAM_THEME: OdontogramThemeConfig = {
  colors: {
    background: "#F5F7FB", // clinic-bg
    panel: "#FFFFFF",      // clinic-card
    card: "#FFFFFF",       // clinic-card
    text: "#13233F",       // clinic-text
    muted: "#5B6B85",      // clinic-muted
    line: "#E3E8F0",       // clinic-border
    accent: "#0E8AA3",     // azure-600
    accent2: "#0E9F6E",    // state-ok
  },
};
```

- [ ] **Paso 3: reescribir el wrapper**

```tsx
// components/Odontogram.tsx
"use client";
/** Odontograma clínico — wrapper de React-Odontogram-Modul vendorizado (components/odontogram-engine).
 *  Mantiene el contrato externo del componente anterior: value/editable/onChange/authorName.
 *  El motor maneja su estado internamente (no es un componente controlado React clásico) — se
 *  hidrata una vez que termina de inicializar (prop onReady) y se reporta hacia afuera con
 *  debounce en cada cambio (onStateChange). */
import { useCallback, useEffect, useRef } from "react";
import App, { onStateChange, collectExportPayload, importStatus } from "./odontogram-engine/App";
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
```

Nota: `authorName` no se usa dentro del wrapper — la auditoría a nivel de documento
(`odontogramUpdatedBy`/`odontogramUpdatedAt`) la setea quien LLAMA a `onChange` (la página de ficha
del paciente, Task 9 del store), no el wrapper, siguiendo el mismo patrón que usan otros campos del
`Patient` que no llevan auditoría por-campo.

- [ ] **Paso 4: verificar que compila (aislado, aunque el resto del repo todavía no)**

Run: `npx tsc --noEmit 2>&1 | grep -E "components/Odontogram.tsx|components/OdontogramShowcase.tsx|dentalink-theme.ts"`
Expected: sin salida.

- [ ] **Paso 5: commit**

```bash
git add components/Odontogram.tsx components/OdontogramShowcase.tsx components/odontogram-engine/dentalink-theme.ts
git commit -m "feat(odontograma): wrapper del motor nuevo + vitrina liviana separada para marketing"
```

---

### Task 9: `lib/store.tsx` — `setTooth` → `setOdontogram` + `mergeOdontogramTooth`

**Files:**
- Modify: `lib/store.tsx`

- [ ] **Paso 1: en la interfaz de acciones del store, reemplazar la firma de `setTooth`** (línea ~347):

```ts
// Antes:
setTooth: (patientId: string, tooth: string, rec: ToothRecord | null) => void;

// Después:
/** Reemplaza el odontograma completo del paciente (lo llama el wrapper Odontogram.tsx en cada
 *  guardado — el motor reporta el payload entero, no diffs por diente). */
setOdontogram: (patientId: string, status: OdontogramStatus, by: string) => void;
/** Mezcla campos puntuales en UNA pieza sin necesitar el motor cargado (lo usa el Copiloto IA al
 *  aplicar hallazgos de una radiografía). Crea el odontograma si el paciente no tenía uno. */
mergeOdontogramTooth: (patientId: string, tooth: string, fields: Partial<OdontogramToothState>, by: string) => void;
```

- [ ] **Paso 2: actualizar el import de tipos en la cabecera del archivo** (línea ~28):

```ts
// Antes:
  DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote, ToothRecord,

// Después:
  DB, Session, Appointment, Patient, BillingRecord, User, Procedure, EmrNote,
  OdontogramStatus, OdontogramToothState,
```

- [ ] **Paso 3: reemplazar la implementación de `setTooth`** (línea ~768-773):

```ts
// Antes:
setTooth: (patientId, tooth, rec) =>
  patchPatient(patientId, (p) => {
    const od = { ...(p.odontogram ?? {}) };
    if (rec) od[tooth] = rec; else delete od[tooth];
    return { ...p, odontogram: od };
  }),

// Después:
setOdontogram: (patientId, status, by) =>
  patchPatient(patientId, (p) => ({
    ...p,
    odontogram: status,
    odontogramUpdatedBy: by,
    odontogramUpdatedAt: new Date().toISOString(),
  })),
mergeOdontogramTooth: (patientId, tooth, fields, by) =>
  patchPatient(patientId, (p) => {
    const base: OdontogramStatus = p.odontogram ?? {
      version: "2.10",
      globals: {},
      teeth: {},
    };
    const teeth = { ...base.teeth, [tooth]: { ...(base.teeth[tooth] ?? {}), ...fields } };
    return {
      ...p,
      odontogram: { ...base, teeth },
      odontogramUpdatedBy: by,
      odontogramUpdatedAt: new Date().toISOString(),
    };
  }),
```

- [ ] **Paso 4: verificar que no queda ningún otro llamador de `setTooth` sin actualizar**

```bash
grep -rn "setTooth\b" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```
Expected: sin salida (el único llamador, `ClinicalCopilot.tsx`, se actualiza en la Task 11 — si esta
task se ejecuta antes que la 9, va a fallar `tsc` transitoriamente hasta la 11, es esperado).

- [ ] **Paso 5: commit**

```bash
git add lib/store.tsx
git commit -m "refactor(store): setTooth -> setOdontogram + mergeOdontogramTooth (payload del motor nuevo)"
```

---

### Task 10: `lib/seed.ts` — datos demo en el esquema nuevo

**Files:**
- Modify: `lib/seed.ts`

- [ ] **Paso 1: reemplazar el bloque de la paciente `p1` (Ana/caries+restaurado+corona+ausente)**

```ts
// Antes:
odontogram: {
  "16": { condition: "caries", surfaces: ["O"], note: "Oclusal, sensibilidad al frío", updatedAt: at(-7, 10), updatedBy: "Dra. Sofía Benítez" },
  "24": { condition: "caries", surfaces: ["M"], note: "Interproximal mesial", updatedAt: at(-7, 10), updatedBy: "Dra. Sofía Benítez" },
  "11": { condition: "restaurado", surfaces: ["V"], note: "Resina 2024", updatedAt: at(-30, 9), updatedBy: "Dra. Sofía Benítez" },
  "26": { condition: "corona", note: "Corona cerámica", updatedAt: at(-60, 9), updatedBy: "Dra. Sofía Benítez" },
  "28": { condition: "ausente", updatedAt: at(-90, 9), updatedBy: "Dra. Sofía Benítez" },
},

// Después:
odontogram: {
  version: "2.10",
  globals: {},
  teeth: {
    "16": { toothSelection: "permanent", caries: ["O"], cariesSeverity: { O: 3 }, note: "Oclusal, sensibilidad al frío" },
    "24": { toothSelection: "permanent", caries: ["M"], cariesSeverity: { M: 2 }, note: "Interproximal mesial" },
    "11": { toothSelection: "permanent", restorationType: "none", fillingMaterial: "composite", fillingSurfaces: ["V"], note: "Resina 2024" },
    "26": { toothSelection: "permanent", restorationType: "crown", restorationMaterial: "metal-ceramic", note: "Corona cerámica" },
    "28": { toothSelection: "missing", note: "Ausente" },
  },
},
odontogramUpdatedBy: "Dra. Sofía Benítez",
odontogramUpdatedAt: at(-7, 10),
```

- [ ] **Paso 2: reemplazar el bloque de la paciente `p4` (Andrés/extracción+endodoncia+implante)**

```ts
// Antes:
odontogram: {
  "28": { condition: "extraccion", note: "Resto radicular — exodoncia programada", updatedAt: at(-3, 11), updatedBy: "Dra. Sofía Benítez" },
  "36": { condition: "endodoncia", note: "Endodoncia 2023, asintomática", updatedAt: at(-120, 9), updatedBy: "Dra. Sofía Benítez" },
  "46": { condition: "implante", note: "Implante + corona 2022", updatedAt: at(-200, 9), updatedBy: "Dra. Sofía Benítez" },
},

// Después:
odontogram: {
  version: "2.10",
  globals: {},
  teeth: {
    "28": { toothSelection: "permanent", extractionPlan: true, note: "Resto radicular — exodoncia programada" },
    "36": { toothSelection: "permanent", endo: "root-canal-filling", note: "Endodoncia 2023, asintomática" },
    "46": { toothSelection: "implant", restorationType: "crown", restorationMaterial: "zircon", note: "Implante + corona 2022" },
  },
},
odontogramUpdatedBy: "Dra. Sofía Benítez",
odontogramUpdatedAt: at(-3, 11),
```

- [ ] **Paso 3: verificar que no quedan literales `condition:`/`surfaces:` de odontograma en el archivo**

```bash
grep -n "odontogram" lib/seed.ts
```
Expected: solo las 2 apariciones editadas arriba (más `odontogramUpdatedBy`/`odontogramUpdatedAt`),
ninguna con `condition:`.

- [ ] **Paso 4: commit**

```bash
git add lib/seed.ts
git commit -m "feat(demo): datos de odontograma sembrados en el esquema del motor nuevo"
```

---

### Task 11: Mapeo puro IA→odontograma (TDD) + actualizar `ClinicalCopilot.tsx`

**Files:**
- Create: `lib/odontogram-findings.ts`
- Create: `lib/odontogram-findings.test.ts`
- Modify: `components/ClinicalCopilot.tsx`

- [ ] **Paso 1: escribir el test que falla**

```ts
// lib/odontogram-findings.test.ts
import { describe, it, expect } from "vitest";
import { findingToToothFields } from "./odontogram-findings";

describe("findingToToothFields", () => {
  it("caries -> marca la superficie con severidad moderada por defecto", () => {
    expect(findingToToothFields({ condition: "caries", severity: "moderado" }))
      .toEqual({ toothSelection: "permanent", caries: [], cariesSeverity: {} });
  });

  it("caries con superficie conocida la agrega a caries[] y cariesSeverity", () => {
    expect(findingToToothFields({ condition: "caries", severity: "severo", surface: "O" }))
      .toEqual({ toothSelection: "permanent", caries: ["O"], cariesSeverity: { O: 5 } });
  });

  it("restaurado -> fillingMaterial composite + superficie", () => {
    expect(findingToToothFields({ condition: "restaurado", surface: "V" }))
      .toEqual({ toothSelection: "permanent", fillingMaterial: "composite", fillingSurfaces: ["V"] });
  });

  it("corona -> restorationType crown", () => {
    expect(findingToToothFields({ condition: "corona" }))
      .toEqual({ toothSelection: "permanent", restorationType: "crown", restorationMaterial: "metal-ceramic" });
  });

  it("endodoncia -> endo root-canal-filling", () => {
    expect(findingToToothFields({ condition: "endodoncia" }))
      .toEqual({ toothSelection: "permanent", endo: "root-canal-filling" });
  });

  it("extraccion -> extractionPlan true, sin tocar toothSelection (todavía presente)", () => {
    expect(findingToToothFields({ condition: "extraccion" }))
      .toEqual({ extractionPlan: true });
  });

  it("ausente -> toothSelection missing", () => {
    expect(findingToToothFields({ condition: "ausente" }))
      .toEqual({ toothSelection: "missing" });
  });

  it("implante -> toothSelection implant", () => {
    expect(findingToToothFields({ condition: "implante" }))
      .toEqual({ toothSelection: "implant" });
  });

  it("severidad leve/observacion -> cariesSeverity baja", () => {
    expect(findingToToothFields({ condition: "caries", severity: "leve", surface: "M" }).cariesSeverity)
      .toEqual({ M: 2 });
  });
});
```

- [ ] **Paso 2: correr, verificar que falla**

Run: `npx vitest run lib/odontogram-findings.test.ts`
Expected: FAIL — `./odontogram-findings` no existe.

- [ ] **Paso 3: implementación**

```ts
// lib/odontogram-findings.ts
import type { OdontogramToothState } from "./types";

/** Hallazgo del Copiloto IA (app/api/ia/copilot/route.ts) — mismo shape que usaba el
 *  odontograma viejo: la IA no necesita conocer el esquema nuevo, solo emite una condición
 *  clínica genérica en español; esta función la traduce a los campos del payload del motor
 *  (Fase 1: solo los campos habilitados en la UI — ver spec). */
export type FindingCondition =
  | "caries" | "extraccion" | "restaurado" | "corona" | "endodoncia" | "ausente" | "implante";

const SEVERITY_ICDAS: Record<string, number> = {
  observacion: 1,
  leve: 2,
  moderado: 3,
  severo: 5,
};

/** Convierte un hallazgo de IA (condición + severidad opcional + superficie opcional) en los
 *  campos del payload del motor a aplicar sobre UNA pieza. Puro — sin efectos, testeable sin
 *  Firestore ni el motor cargado. */
export function findingToToothFields(finding: {
  condition: FindingCondition;
  severity?: string;
  surface?: string;
}): Partial<OdontogramToothState> {
  const { condition, severity, surface } = finding;
  switch (condition) {
    case "caries": {
      const sev = SEVERITY_ICDAS[severity ?? "moderado"] ?? SEVERITY_ICDAS.moderado;
      return surface
        ? { toothSelection: "permanent", caries: [surface], cariesSeverity: { [surface]: sev } }
        : { toothSelection: "permanent", caries: [], cariesSeverity: {} };
    }
    case "restaurado":
      return {
        toothSelection: "permanent",
        fillingMaterial: "composite",
        ...(surface ? { fillingSurfaces: [surface] } : {}),
      };
    case "corona":
      return { toothSelection: "permanent", restorationType: "crown", restorationMaterial: "metal-ceramic" };
    case "endodoncia":
      return { toothSelection: "permanent", endo: "root-canal-filling" };
    case "extraccion":
      return { extractionPlan: true };
    case "ausente":
      return { toothSelection: "missing" };
    case "implante":
      return { toothSelection: "implant" };
  }
}
```

- [ ] **Paso 4: correr, verificar que pasa**

Run: `npx vitest run lib/odontogram-findings.test.ts`
Expected: PASS (9 tests).

- [ ] **Paso 5: actualizar `components/ClinicalCopilot.tsx`**

```ts
// Cambiar el import de tipos (línea 12):
// Antes: import type { Patient, ToothCondition, Budget } from "@/lib/types";
// Después:
import type { Patient, Budget } from "@/lib/types";
import { findingToToothFields, type FindingCondition } from "@/lib/odontogram-findings";

// Cambiar el tipo Finding (línea 14):
// Antes: type Finding = { tooth: string; condition: ToothCondition; severity: string; confidence: number; note: string };
// Después:
type Finding = { tooth: string; condition: FindingCondition; severity: string; confidence: number; note: string };
```

Y dentro del componente, cambiar la desestructuración del store y `aplicarOdontograma`:

```ts
// Antes:
const { db, session, setTooth, upsertBudget } = useStore();
...
const aplicarOdontograma = () => {
  if (!res || !session) return;
  const now = new Date().toISOString();
  res.findings.forEach((f, i) => {
    if (!fSel.has(i)) return;
    setTooth(patient.id, f.tooth, { condition: f.condition, surfaces: [], note: f.note || `Copilot IA (${Math.round(f.confidence * 100)}%)`, updatedAt: now, updatedBy: session.name });
  });
  setDone("odontograma");
};

// Después:
const { db, session, mergeOdontogramTooth, upsertBudget } = useStore();
...
const aplicarOdontograma = () => {
  if (!res || !session) return;
  res.findings.forEach((f, i) => {
    if (!fSel.has(i)) return;
    const fields = findingToToothFields({ condition: f.condition, severity: f.severity });
    mergeOdontogramTooth(patient.id, f.tooth, { ...fields, note: f.note || `Copilot IA (${Math.round(f.confidence * 100)}%)` }, session.name);
  });
  setDone("odontograma");
};
```

(`COND_LABEL` no cambia — sigue mapeando las 7 claves de `FindingCondition`, que son las mismas 7
que ya tenía, a etiquetas en español para la UI de revisión de hallazgos.)

- [ ] **Paso 6: verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -E "ClinicalCopilot|odontogram-findings"`
Expected: sin salida.

- [ ] **Paso 7: commit**

```bash
git add lib/odontogram-findings.ts lib/odontogram-findings.test.ts components/ClinicalCopilot.tsx
git commit -m "feat(copiloto-ia): mapeo puro hallazgo->campos del odontograma nuevo (TDD)"
```

---

### Task 12: Actualizar consumidores de la vitrina (`Landing.tsx`, dashboard)

**Files:**
- Modify: `components/Landing.tsx`
- Modify: `app/app/page.tsx`

- [ ] **Paso 1: en `components/Landing.tsx`, cambiar el import** (línea 12-13):

```ts
// Antes:
import type { ToothRecord } from "@/lib/types";
import Odontogram, { ToothGlyph } from "./Odontogram";

// Después:
import OdontogramShowcase, { ToothGlyph, type ShowcaseToothRecord } from "./OdontogramShowcase";
```

Y renombrar los usos de `ToothRecord` en ese archivo (`DEMO_TEETH`, `MARQUEE_TEETH`,
`useState<Record<string, ToothRecord>>`) a `ShowcaseToothRecord`. Renombrar el uso JSX de
`<Odontogram .../>` (línea ~143, la vitrina de la landing, NO conectada a datos reales) a
`<OdontogramShowcase .../>`, con el mismo shape de props que ya tenía (son props locales del
componente viejo, no cambian).

- [ ] **Paso 2: en `app/app/page.tsx`, cambiar el import de `ToothGlyph`**

```ts
// Antes:
import { ToothGlyph } from "@/components/Odontogram";
// Después:
import { ToothGlyph } from "@/components/OdontogramShowcase";
```

- [ ] **Paso 3: verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -E "Landing.tsx|app/app/page.tsx"`
Expected: sin salida.

- [ ] **Paso 4: commit**

```bash
git add components/Landing.tsx app/app/page.tsx
git commit -m "refactor(marketing): landing y dashboard usan OdontogramShowcase, no el motor clínico"
```

---

### Task 13: Verificación final

**Files:** ninguno

- [ ] **Paso 1: typecheck completo**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Paso 2: suite completa (motor vendorizado + tests propios de Novudent)**

Run: `npx vitest run`
Expected: todos PASS — el conteo total sube por los ~850 tests del motor vendorizado (menos los
FHIR podados) más los 9+ tests nuevos de `odontogram-findings.test.ts` y `status-bridge.test.ts`.

- [ ] **Paso 3: build de producción**

Run: `npm run build`
Expected: build exitoso, sin errores. Prestar atención al tamaño del bundle de las páginas que
incluyen `Odontogram` (ficha de paciente, Plan de Tratamiento) — el motor + `translations.ts`
(246KB sin gzip) es sustancialmente más pesado que el componente viejo; si el build reporta un
warning de tamaño de página, es esperado y no bloqueante, pero anotarlo.

- [ ] **Paso 4: smoke test manual en el navegador (demo)**

- Levantar `npm run dev`, entrar a `/login` → "Ver demo" → abrir un paciente con datos de
  odontograma (p1 "Ana" o p4 "Andrés") → tab Odontograma.
- Verificar: el motor carga con la paleta Dentalink (fondo `#F5F7FB`, acento `#0E8AA3`), muestra
  los hallazgos sembrados (16 y 24 con caries, 11 restaurada, 26 con corona, 28 ausente para Ana),
  permite click en una pieza y editar, y el cambio persiste (recargar la página y verificar que
  sigue ahí).
- Probar con un usuario `assistant` (RBAC) que el odontograma se abre en modo `readOnly` — el
  blindaje de `patientClinicalFields()` en `firestore.rules` (commit `4edd545`, sesión de
  seguridad) sigue aplicando SIN cambios porque el campo se sigue llamando `odontogram`.
- Probar el Copiloto IA (`Clinical Copilot`, sube una radiografía, aplicar hallazgos al
  odontograma) y confirmar que los hallazgos aparecen correctamente marcados en el motor nuevo.
- Confirmar visualmente que la landing pública (`/`) sigue mostrando la vitrina liviana (SVG
  artesanal), no el motor completo.

- [ ] **Paso 5: revisar que no queda código muerto**

```bash
grep -rn "ToothCondition\|ToothSurface\|: ToothRecord\b\|setTooth\b" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "components/OdontogramShowcase.tsx"
```
Expected: sin salida.

---

## Auto-revisión del plan (placeholders, consistencia, tipos)

- **Placeholders:** ningún paso usa "TBD"/"completar después" — las ediciones de texto libre más
  grandes (Task 4, poda de tests FHIR) están ancladas a títulos de test literales y greppables, no a
  descripciones vagas.
- **Consistencia de tipos:** `OdontogramStatus`/`OdontogramToothState` (Task 7) se usan idénticos en
  Task 8 (wrapper), Task 9 (store), Task 10 (seed), Task 11 (findings helper) — mismo nombre, mismo
  shape en los 5 lugares.
- **Orden de dependencias verificado:** 1→2→3→4→5→6 (motor solo) antes de 7→8→9→10→11→12 (integración
  Novudent) antes de 13 (verificación). Task 8 extrae `OdontogramShowcase` ANTES de sobreescribir
  `Odontogram.tsx` en el mismo paso — no hay ventana donde se pierda el componente viejo.
- **Cobertura del spec:** visual+clínico (motor completo vendorizado) ✓, paleta Dentalink
  (`dentalink-theme.ts`, con nota honesta de que NO cubre colores de material) ✓, cutover limpio sin
  migración (Task 10 reescribe seed, no hay lógica de compatibilidad con el formato viejo) ✓, alcance
  Fase 1 (el mapeo de Task 11 solo cubre los 7 hallazgos que el Copiloto IA ya emitía — el resto de
  los ~30 campos del motor quedan disponibles pero sin UI de Novudent que los dispare todavía, tal
  como especifica el diseño) ✓, sin cambios en `firestore.rules` (mismo nombre de campo `odontogram`,
  verificado en Task 13 paso 4) ✓.

---

## Siguiente paso

Plan completo y guardado en `docs/superpowers/plans/2026-07-19-odontograma-react-modul-plan.md`.
Dos opciones de ejecución:

1. **Subagent-Driven (recomendado)** — despacho un subagente fresco por tarea, reviso entre tareas,
   iteración rápida.
2. **Ejecución inline** — ejecuto las tareas en esta misma sesión con checkpoints de revisión.

¿Cuál preferís?
