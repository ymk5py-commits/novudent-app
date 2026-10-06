# Documentos clínicos y consentimientos — plan de implementación

> **Para quien ejecute:** usar superpowers:executing-plans (inline) o superpowers:subagent-driven-development. Los pasos usan casillas (`- [ ]`). Cada tarea termina con un commit y con `npx tsc --noEmit && npx vitest run` en verde.

**Objetivo:** que la Ficha clínica tenga el menú **Documentos ▾** (Consentimientos + Documentos clínicos) como Dentalink, con la **Historia Clínica** completa de Aura, plantillas editables y textos de indicaciones.

**Arquitectura:** colección propia `clinics/{cid}/clinicalDocs` (no dentro del doc del paciente, que ya carga foto y EMR). Las plantillas viven en `Clinic.config.plantillasDocumento` (sin nada guardado se usan las de fábrica, como `estadosCita`). Cada documento guarda una **copia** de su plantilla, así editar la plantilla no cambia lo ya hecho. Lógica pura en `lib/documentosClinicos.ts` con tests; UI en componentes chicos.

**Stack:** Next.js (App Router, versión con cambios: leer `node_modules/next/dist/docs/` antes de tocar rutas), TypeScript, Firestore Web SDK, Tailwind, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-documentos-clinicos-design.md`

## Restricciones globales

- Firestore sin Admin SDK: el cliente escribe directo y **las reglas son la defensa**. Colección nueva ⇒ regla en `firestore.rules` y `firebase deploy --only firestore:rules` (lo hace Claude cuando Croman haga `firebase login`; el demo anda sin deploy por `isDemo`).
- Multi-tenant: todo en `clinics/{cid}/…`. El store escribe con `fsSave(col, id, data)`, nunca contra la global `CLINIC_ID`.
- Documentos de Firestore < 1 MB: los documentos clínicos **no** van dentro del doc del paciente.
- Fechas: para «hoy» usar `fechaLocal()`; mostrar con `fmtDate`/`parseFecha`. Nunca `toISOString().slice(0, 10)` para «hoy». Los timestamps guardados sí son ISO.
- Texto de la interfaz en español rioplatense (voseo: «Elegí», «Seleccioná»). Colores y tipografía de Novudent: no tocar tokens.
- Un documento clínico **no se borra**: se anula (registro clínico). Sin `delete` desde la app.
- Un cambio en `lib/rbac.ts` obliga a revisar `puedeEditarDocumentos` y la regla de Firestore (hay un test que los ata).
- Commits: terminar el mensaje con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No abrir PRs. Rama `feat/documentos-clinicos`; merge a `main` al final.
- Verificación de cada tarea: `npx tsc --noEmit && npx vitest run`. Al final: `npm run build` y E2E.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/types.ts` (mod) | tipos nuevos, `Clinic.config.plantillasDocumento`, `SignatureDoc.budgetId/dentistId`, `DB.clinicalDocs` |
| `lib/plantillasDocumento.ts` (nuevo) | solo datos: Historia Clínica + 3 textos de fábrica |
| `lib/documentosClinicos.ts` (nuevo, puro) | normalizar plantillas, crear/guardar/completar/anular, respuestas imprimibles, lista unificada, pendientes, permisos, HTML de correo, utilidades del editor |
| `lib/documentosClinicos.test.ts` (nuevo) | tests de todo lo anterior |
| `lib/store.tsx`, `lib/seed.ts` (mod) | colección, acciones, fusión de fichas, reiniciar demo, siembra |
| `firestore.rules`, `test/firestore-rules.test.mjs` (mod) | regla + pruebas |
| `components/CamposDocumento.tsx` (nuevo) | campos y secciones (editor) |
| `components/EditorDocumento.tsx` (nuevo) | pantalla de edición con barra Descartar / Guardar / Continuar |
| `components/DocumentoClinicoPrint.tsx` (nuevo) | visor + hoja de impresión + correo |
| `components/DocumentosClinicos.tsx` (nuevo) | lista, «Nuevo documento clínico», orquesta editor y visor |
| `components/MenuDocumentos.tsx` (nuevo) | botón «Documentos ▾» |
| `components/PlantillasDocumento.tsx` (nuevo) | editor de plantillas en Configuración |
| `components/Consentimientos.tsx`, `ConsentPrintDocument.tsx` (mod) | modal «Crear nuevo consentimiento» con plan y profesional |
| `app/app/pacientes/[id]/page.tsx` (mod) | pestañas, menú, alias de enlaces viejos, ícono de cabecera |
| `app/app/pacientes/nuevo/page.tsx`, `components/DarCita.tsx` (mod) | alta con Historia Clínica pendiente |
| `components/Shell.tsx`, `app/app/page.tsx`, `components/NovudentIA.tsx` (mod) | conteo de pendientes |
| `lib/historial.ts`, `components/Historial.tsx` (mod) | documento completado en el historial |
| `app/app/configuracion/page.tsx` (mod) | sección Documentos clínicos |
| `app/globals.css` (mod) | estilos de impresión `docclin-print-*` |
| `e2e/documentos-clinicos.spec.ts` (nuevo) | flujos de punta a punta |

---

### Tarea 1: tipos, plantillas de fábrica y normalización

**Archivos:** `lib/types.ts`, `lib/plantillasDocumento.ts` (nuevo), `lib/documentosClinicos.ts` (nuevo), `lib/documentosClinicos.test.ts` (nuevo).

**Produce (para las tareas siguientes):**
- Tipos `TipoCampoDocumento = "texto"|"parrafo"|"numero"|"seleccion"|"casillas"`, `CampoDocumento {id, etiqueta, tipo, opciones?, soloMujeres?}`, `SeccionDocumento {id, titulo, campos}`, `PlantillaDocumento {id, nombre, tipo:"formulario"|"texto", secciones?, cuerpo?, porRevisar?, inactiva?}`, `EstadoDocumento = "pendiente"|"completado"|"anulado"`, `DocumentoClinico {id, clinicId, patientId, plantillaId, nombre, tipo, secciones?, cuerpo?, valores?, dentistId?, porRevisar?, estado, createdAt, createdBy, createdByName, updatedAt?, completedAt?, completedBy?, voidedAt?, voidedBy?}` (`completedBy` y `voidedBy` guardan el **nombre**, como `voidedBy` de las recetas).
- `Clinic.config.plantillasDocumento?: PlantillaDocumento[]`, `SignatureDoc.budgetId?` y `.dentistId?`. (`DB.clinicalDocs` se agrega en la Tarea 3, junto con el store y el demo, para no dejar `tsc` roto entre commits.)
- `PLANTILLAS_DE_FABRICA: PlantillaDocumento[]` con ids `historia_clinica`, `cuidados_exodoncia`, `post_blanqueamiento`, `higiene_cepillado_adultos`.
- `normalizarPlantillas(lista)`, `plantillasDeClinica(config: {plantillasDocumento?} | undefined)`, `plantillasActivas(lista)`.

**Ids de la Historia Clínica** (los usan los tests y la demo): secciones `antecedentes_patologicos`, `aparatos_y_sistemas`, `antecedentes_hereditarios`, `signos_vitales`, `antecedentes_no_patologicos`, `antecedentes_odontologicos`, `parafunciones`, `exploracion_extraoral`, `exploracion_intraoral`. Campos que se usan fuera de la lista: `enfermedad_ultimos_anos`, `alergia`, `vacunas`, `refiere_padecido` (13 casillas), `obs_enfermedades`, `medicamentos`, `ap_digestivo`, `ap_respiratorio`, `ap_cardiovascular`, `sistema_nervioso`, `sistema_endocrino`, `sistema_hematico`, `ap_genitourinario`, `embarazada` y `embarazos_anteriores` (`soloMujeres`), `tension_arterial`, `pulso`, `frecuencia_respiratoria`, `peso_estatura`, `habitos`, `higiene_bucal`, `cepillado_dia`, `sangrado_encias`, `sensibilidad`, `parafunciones`, `molar_der`, `molar_izq`, `canina_izq`, `canina_der`. El resto de los ids sale del rótulo en minúsculas con guion bajo. Contenido y ortografía corregida: sección «Historia Clínica de fábrica» de la spec.

- [ ] **Paso 1: tests** (`lib/documentosClinicos.test.ts`): fábrica (4 plantillas en ese orden; 9 secciones con esos títulos; 3 textos `porRevisar` de más de 200 caracteres; ids de campo únicos; toda lista y casilla con más de 1 opción; `refiere_padecido` con 13 opciones y «Diabetes»; `ap_respiratorio` con «Sibilancias»; `sistema_endocrino` exacto `[Polifagia, Poliuria, Polidipsia, Irritabilidad al clima, SDP]`; `habitos` con «Bruxomanía»; `embarazada` y `embarazos_anteriores` con `soloMujeres`; `normalizarPlantillas(PLANTILLAS_DE_FABRICA)` es igual a la entrada). Normalización: descarta no-objetos, sin id o sin nombre, ids repetidos; formulario sin secciones válidas o sección sin campos válidos se descarta; selección/casillas sin opciones se descarta y las opciones se limpian (trim, sin vacías ni repetidas); tipo de campo inventado se descarta; texto sin cuerpo queda `cuerpo: ""`; no arrastra campos ajenos; `porRevisar`/`inactiva` solo si valen `true`; no comparte referencias con la entrada. `plantillasDeClinica`: sin nada → devuelve `PLANTILLAS_DE_FABRICA` (misma referencia); con lista → la normaliza. `plantillasActivas` saca las inactivas.
- [ ] **Paso 2:** `npx vitest run lib/documentosClinicos.test.ts` → falla (módulos no existen).
- [ ] **Paso 3:** agregar los tipos a `lib/types.ts` (después de `SignatureDoc`; `Clinic.config` junto a `consentTemplates`; `DB` después de `branches`), escribir `lib/plantillasDocumento.ts` con helpers `texto/parrafo/lista/casillas/seccion` y las cuatro plantillas, y `normalizarPlantillas`/`plantillasDeClinica`/`plantillasActivas` en `lib/documentosClinicos.ts`.
  - Textos de fábrica (`porRevisar: true`, con `{paciente}`, `{fecha}`, `{profesional}`, `{clinica}`): **cuidados postoperatorios de exodoncia** (gasa 30–45 min, no enjuagarse ni escupir 24 h, frío local, dieta blanda y fría/tibia, no fumar ni tomar alcohol 72 h ni usar pajita, solo la medicación indicada, cepillado suave sin pasar por la herida, reposo 24–48 h, y cuándo consultar: sangrado que no cede, fiebre, dolor intenso, hinchazón creciente al tercer día, mal olor persistente, dificultad para respirar o tragar); **indicaciones después del blanqueamiento** (48 h sin café, té, mate, vino tinto, gaseosas oscuras ni colorantes; no fumar; sensibilidad normal 1–2 días; pasta para sensibilidad; higiene; mantenimiento solo como se indicó; las restauraciones no cambian de color; cuándo consultar); **higiene y cepillado en adultos** (3 veces al día 2 minutos, cepillo suave cambiado cada 3 meses, técnica a 45°, lengua, hilo diario, pasta con flúor del tamaño de una arveja, enjuague solo si lo indicaron, azúcares, control cada 6 meses).
- [ ] **Paso 4:** `npx vitest run lib/documentosClinicos.test.ts` → pasa; `npx tsc --noEmit` → sin errores.
- [ ] **Paso 5: commit** `feat(documentos): tipos, plantillas de fábrica y normalización`.

---

### Tarea 2: lógica pura de documentos

**Archivos:** `lib/documentosClinicos.ts`, `lib/documentosClinicos.test.ts`.

**Consume:** tipos de la Tarea 1, `can` de `lib/rbac.ts`, `escapeHtml` de `lib/html.ts`.

**Produce (firmas exactas):**
```ts
export type Sexo = "M" | "F";
export interface DatosCuerpo { paciente: string; documento: string; fecha: string; profesional: string; clinica: string }
export const sexoDe: (p: Pick<Patient, "sex" | "gender">) => Sexo | undefined;           // sex, y si no hay, gender M/F
export const camposVisibles: (s: SeccionDocumento, sexo?: Sexo) => CampoDocumento[];     // oculta soloMujeres si sexo === "M"
export const cuerpoConDatos: (cuerpo: string, d: Partial<DatosCuerpo>) => string;       // reemplaza {paciente}… ; los desconocidos quedan
export type Valores = Record<string, string | string[]>;
export const limpiarValores: (v: Valores) => Valores;                                    // saca vacíos
export const valorVacio: (v: string | string[] | undefined) => boolean;
export function nuevoDocumento(o: { id: string; clinicId: string; patientId: string; plantilla: PlantillaDocumento; dentistId?: string; by: { id: string; name: string }; now: string; datos?: Partial<DatosCuerpo> }): DocumentoClinico; // copia profunda; texto → cuerpo con datos; porRevisar heredado; estado "pendiente"
export function guardarCambios(doc: DocumentoClinico, c: { valores?: Valores; cuerpo?: string; now: string }): DocumentoClinico;             // mantiene el estado; anulado no cambia; cuerpo solo en tipo texto
export function completarDocumento(doc: DocumentoClinico, c: { valores?: Valores; cuerpo?: string; now: string; by: { id: string; name: string } }): DocumentoClinico; // completedAt/By solo la primera vez
export function anularDocumento(doc: DocumentoClinico, o: { now: string; by: string }): DocumentoClinico;                                     // idempotente
export function respuestasParaImprimir(doc: DocumentoClinico, sexo?: Sexo): { titulo: string; filas: { etiqueta: string; valor: string }[] }[]; // solo lo respondido; casillas "a, b"; sin secciones vacías; [] si es texto
export interface ItemDocumento { id: string; origen: "clinico" | "formulario"; nombre: string; estado: EstadoDocumento; fecha: string; doc?: DocumentoClinico; form?: PatientForm }
export function documentosDelPaciente(p: Pick<Patient, "id" | "forms">, docs: readonly DocumentoClinico[], mostrarAnulados?: boolean): ItemDocumento[]; // une clinicalDocs + Patient.forms; pendientes primero, después fecha descendente
export function pendientesPorPaciente(patients: readonly Pick<Patient, "id" | "forms">[], docs: readonly DocumentoClinico[]): Map<string, number>; // solo > 0; ignora docs de pacientes que no están; no cuenta anulados ni completados
export function historiaClinicaPendiente(o: { id: string; clinicId: string; patientId: string; plantillas: readonly PlantillaDocumento[]; by: { id: string; name: string }; now: string }): DocumentoClinico | null; // plantilla `historia_clinica` activa, o null
export const puedeVerDocumentos: (role: Role) => boolean;     // engagement.forms || emr.read
export const puedeEditarDocumentos: (role: Role) => boolean;  // engagement.forms || emr.write
export const etiquetaPlan: (b: Pick<Budget, "id" | "name">) => string; // "#id — nombre" (sin nombre: "Plan de tratamiento")
export function documentoHtml(doc: DocumentoClinico, o: { clinica: string; paciente: string; fecha: string; profesional?: string; sexo?: Sexo }): string; // todo escapado; aviso si porRevisar
export const slug: (t: string) => string;
export const idUnico: (base: string, usados: Iterable<string>) => string;  // slug, y _2, _3… si ya existe; base vacía → "item"
export const mover: <T>(lista: readonly T[], i: number, delta: -1 | 1) => T[]; // fuera de rango → copia igual
```

- [ ] **Paso 1: tests** de cada función (casos arriba entre comentarios). Además: `puedeEditarDocumentos` es verdadero **exactamente** para `admin, cashier, receptionist, dentist` (espejo de la regla de Firestore: si cambia, el test avisa), `puedeVerDocumentos` suma `assistant`; `documentoHtml` escapa `<script>` en nombre, paciente y respuestas.
- [ ] **Paso 2:** correr → falla. **Paso 3:** implementar. **Paso 4:** correr → pasa.
- [ ] **Paso 5: commit** `feat(documentos): lógica pura (crear, completar, anular, imprimir, pendientes, permisos)`.

---

### Tarea 3: store, demo, reglas de Firestore

**Archivos:** `lib/store.tsx`, `lib/seed.ts`, `firestore.rules`, `test/firestore-rules.test.mjs`, `lib/documentosClinicos.test.ts` (test del demo).

**Primero:** en `lib/types.ts` agregar `clinicalDocs: DocumentoClinico[];` a `DB` (después de `branches`).

**Puntos de cableado en `lib/store.tsx`** (buscados con la colección `branches`/`directMessages` como molde):
1. `import type { … }` de la línea ~49: agregar `DocumentoClinico`. Importar `historiaClinicaPendiente`, `plantillasDeClinica` de `./documentosClinicos`.
2. `loadLocal()` (línea ~82): `return { ...guardada, directMessages: guardada.directMessages ?? [], clinicalDocs: guardada.clinicalDocs ?? [] }`.
3. `loadFirestore()`: sumar `col("clinicalDocs")` después de `directosP,` en el `Promise.all`, `clinicalDocs` después de `directMessages` en la desestructuración, y `clinicalDocs: filas<DocumentoClinico>(clinicalDocs),` después de `directMessages: filas<DirectMessage>(directMessages),`. (Si las reglas todavía no se publicaron, `col()` ya trata `permission-denied` como vacío.)
4. `seedFirestore`: `for (const cd of seed.clinicalDocs) batch.set(doc(fsdb, "clinics", CLINIC_ID, "clinicalDocs", cd.id), clean(cd));`
5. `resetDemo`: `delExtras("clinicalDocs", db.clinicalDocs.map((x) => x.id), seed.clinicalDocs.map((x) => x.id));` junto a `directMessages`.
6. `mergePatients`: `const clinicalDocs = reassign("clinicalDocs", db.clinicalDocs);` e incluirlo en el `persist`.
7. Interfaz y acciones: `addClinicalDoc(d)`, `updateClinicalDoc(d)` (molde `addSignature`/`updateSignature`; sin delete) y `crearPaciente(p: Patient, por: { id: string; name: string })`, que guarda el paciente (upsert) y, si `historiaClinicaPendiente({ id: \`cd_${p.id}_hc\`, … plantillas: plantillasDeClinica(db.clinics[0]?.config) })` no es null, también el documento (`persist` + `fsSave("clinicalDocs", …)`).

**`lib/seed.ts`:** quitar los formularios pendientes viejos de p1 (`f1`, queda `f2` completado) y p2 (`f3` → `forms: []`); dejar `f4` de p4 como ejemplo de formulario viejo. Agregar `clinicalDocs` (junto a `signatures: []`): `cd_demo_p1` y `cd_demo_p2` pendientes (Historia Clínica, profesional `u2`), y `cd_demo_p3` **completado** con respuestas (p3 es F: `enfermedad_ultimos_anos: "No"`, `alergia: "Penicilina"`, `vacunas: "Sí"`, `refiere_padecido: ["Anemia"]`, `tension_arterial: "110/70"`, `embarazada: "No"`, `higiene_bucal: "Buena"`, `parafunciones: ["Apretamiento nocturno"]`, `molar_der: "Clase I"`, `completedAt/By`). Se arma con `nuevoDocumento({ plantilla: PLANTILLAS_DE_FABRICA[0], … })` y `at(-4, 9)`. Resultado: pacientes con pendientes = p1, p2 (docs) y p4 (formulario viejo) = los mismos tres de antes.

**`firestore.rules`** (después de `signatures`):
```
// Documentos clínicos (Historia Clínica y demás). Los edita quien gestiona formularios
// (admin, caja, recepción) o escribe la ficha (dentista); el asistente solo lee.
// No se borran desde el cliente: se anulan. (isDemoRW/isService para "Reiniciar demo".)
match /clinicalDocs/{docId} {
  allow read: if isMember(cid) || isService() || isDemo(cid);
  allow create, update: if isService() || isDemoRW(cid)
    || (isMember(cid) && subActive(cid)
        && get(/databases/$(database)/documents/clinics/$(cid)/users/$(request.auth.uid)).data.role
           in ['admin', 'cashier', 'receptionist', 'dentist']);
  allow delete: if isService() || isDemoRW(cid);
}
```
**`test/firestore-rules.test.mjs`:** sumar `"clinicalDocs"` a `COLECCIONES_DE_CLINICA` (entra al barrido de aislamiento); fixtures `clinics/clA/clinicalDocs/cdSeed` y `clinics/clV/clinicalDocs/cdV`; pruebas: admin, caja, recepción y dentista escriben, el asistente no; todos los miembros leen; nadie borra (ni el admin); suscripción vencida (`adminV`) lee y no escribe.

- [ ] **Paso 1:** test del demo en `lib/documentosClinicos.test.ts`: `buildSeed().clinicalDocs` — ids únicos, cada `patientId` existe, el completado tiene `valores` y `completedAt`, `pendientesPorPaciente(seed.patients, seed.clinicalDocs)` tiene exactamente `p1`, `p2` y `p4`, y las respuestas de p3 referencian ids que existen en la plantilla.
- [ ] **Paso 2:** correrlo → falla. **Paso 3:** editar store, seed, reglas y pruebas de reglas. **Paso 4:** `npx tsc --noEmit && npx vitest run` → verde.
- [ ] **Paso 5:** `npm run test:rules` (necesita Java y el emulador; ya están en esta máquina). Si el emulador no arranca, anotarlo y seguir (se corre antes del merge).
- [ ] **Paso 6: commit** `feat(documentos): colección clinicalDocs (store, demo y reglas)`.

---

### Tarea 4: campos y editor

**Archivos:** `components/CamposDocumento.tsx`, `components/EditorDocumento.tsx` (nuevos).

**Produce:**
```ts
export function SeccionesEditor(p: { secciones: SeccionDocumento[]; valores: Valores; onChange: (v: Valores) => void; sexo?: Sexo; disabled?: boolean }): JSX.Element
export function EditorDocumento(p: {
  doc: DocumentoClinico; paciente: Patient; puedeEditar: boolean;
  onGuardar: (c: { valores?: Valores; cuerpo?: string }) => void;
  onContinuar: (c: { valores?: Valores; cuerpo?: string }) => void;
  onVolver: () => void;
}): JSX.Element
```
- Cada sección: `<section aria-labelledby>` con `h3` (barra azul `border-l-4 border-azure-600`, mayúsculas) y grilla `sm:grid-cols-2 lg:grid-cols-4`; solo los campos de `camposVisibles(s, sexo)`.
- Campos: texto/número → `<input>`; párrafo → `<textarea rows=2>`; selección → `<select>` con «Seleccionar»; casillas → `<fieldset>` + `<legend>` (rol `group` con ese nombre, para los tests) y un `<label>` con checkbox por opción. Cada `label` asociado con `useId`/`htmlFor`.
- Editor: título «Nuevo documento clínico» (o «Documento clínico» si ya está completado) + nombre; insignias «Por revisar» y «Completado»; aviso `role="note"` si `porRevisar`; formulario → `SeccionesEditor`, texto → `<textarea aria-label="Texto del documento">`; barra `sticky bottom-0 … pr-20` (espacio para el botón flotante de ayuda) con **Descartar y volver** (`window.confirm` si hay cambios), **Guardar borrador** (o «Guardar cambios» si ya está completado; deshabilitado sin cambios) y **Continuar**. «Hay cambios» compara `limpiarValores(valores)` y `cuerpo` contra el doc (no queda «sucio» tras guardar). `beforeunload` mientras hay cambios. Sin `puedeEditar`: campos deshabilitados y sin Guardar/Continuar.
- [ ] **Paso 1:** escribirlos; **Paso 2:** `npx tsc --noEmit`; **Paso 3: commit** `feat(documentos): campos y editor`. (Se prueban de punta a punta en la Tarea 11.)

---

### Tarea 5: lista, nuevo documento, visor, impresión y correo

**Archivos:** `components/DocumentoClinicoPrint.tsx`, `components/DocumentosClinicos.tsx` (nuevos), `app/globals.css` (mod).

**Consume:** `useStore()` → `db, session, addClinicalDoc, updateClinicalDoc`; `PrintLetterhead`/`PrintPortal` de `components/PrintDocument.tsx`; `EmailButton`; `useDialogA11y`, `Modal`, `Field`, `Btn`, `Badge`, `Card`, `Empty` de `components/ui.tsx`.

**Produce:**
```ts
export function VisorDocumentoClinico(p: { doc: DocumentoClinico; clinic: Clinic; paciente: Patient; profesional?: string; onClose: () => void }): JSX.Element
export function DocumentosClinicos(p: { patient: Patient; onCompletarFormulario: (f: PatientForm) => void }): JSX.Element
```
- **Visor:** mismo patrón que `PrintViewer` de `Consentimientos.tsx` (overlay `print:static`, `dialogProps`), diálogo con nombre **«Documento clínico»**; botones **Enviar por correo** (`EmailButton`, asunto `${doc.nombre} — ${clinic.name}`, `html = documentoHtml(...)`), **Imprimir** (`window.print()`) y Cerrar; contenido: membrete (`PrintLetterhead label="DOCUMENTO CLÍNICO"`), título, paciente, profesional, fecha y solo lo respondido (secciones con sus filas, o el cuerpo si es texto). Hoja impresa en `PrintPortal` con `data-testid="docclin-print-document"`, clases `docclin-print-*` y, si `porRevisar`, la línea «BORRADOR — pendiente de revisión por un odontólogo».
- **CSS** en el bloque `@media print` de `app/globals.css` (después de `.consent-print-ending …`): `.docclin-print-intro`, `-meta`, `-seccion h2` (barra azul, 8.5pt, mayúsculas), `-filas` (tabla de dos columnas 42%/58%, `break-inside: avoid` por fila), `-cuerpo` (`white-space: pre-wrap`, 9pt), `-borrador` (borde y texto ámbar).
- **Lista** (`DocumentosClinicos`): encabezado «Documentos clínicos», casilla «Mostrar anulados», botón **Nuevo documento clínico** (solo `puedeEditarDocumentos`); filas con `documentosDelPaciente`: nombre, insignias («Por revisar», estado), creado/completado, profesional; acciones: pendiente → **Completar** y **Anular**; completado → **Ver / imprimir**, **Editar**, **Anular**; formulario viejo pendiente → **Completar** (llama `onCompletarFormulario`); anulado → solo insignia. **Anular** pide `window.confirm`.
- **Modal «Nuevo documento clínico»:** «Seleccioná el tipo de documento clínico que querés crear» (plantillas activas, en un `select` con la etiqueta «Tipo de documento clínico»; las «por revisar» muestran un aviso), «Profesional a cargo» (dentistas activos; por defecto el usuario si es dentista). Aceptar → `nuevoDocumento` (con `datos` para los textos: paciente, CI, fecha larga local, profesional, clínica) → `addClinicalDoc` → abre el editor.
- **Orquestación:** estado `editandoId` (muestra `EditorDocumento` en lugar de la lista) y `viendoId` (muestra el visor). `onGuardar` → `updateClinicalDoc(guardarCambios(doc, …))`; `onContinuar` → `updateClinicalDoc(completarDocumento(doc, …))`, vuelve a la lista y abre el visor.
- [ ] **Paso 1:** escribir ambos y el CSS; **Paso 2:** `npx tsc --noEmit`; **Paso 3: commit** `feat(documentos): lista, visor, impresión y correo`.

---

### Tarea 6: Ficha clínica › Documentos ▾

**Archivos:** `components/MenuDocumentos.tsx` (nuevo), `app/app/pacientes/[id]/page.tsx` (mod).

**`MenuDocumentos`:** `({ opciones: {key,label}[]; actual: string; onElegir: (key: string) => void; pendientes: number })`. Botón «Documentos» + insignia de pendientes + chevron, activo si `actual` está en `opciones`; abre `Desplegable`/`ItemMenu` (de `components/Desplegable.tsx`, API por ancla). Sin opciones no renderiza.

**Cambios en la ficha** (anclas del archivo actual):
1. `SubTab` y `TODAS_LAS_PESTANAS`: sacar `"formularios"`, sumar `"documentos"`.
2. `GROUPS`: `datos-personales` pierde `formularios` y `consentimientos`; `ficha-clinica` suma al final `{ key: "documentos", label: "Documentos clínicos", icon: FileText }` y `{ key: "consentimientos", label: "Consentimientos", icon: FileSignature }`.
3. Módulo: `const PESTANAS_DE_DOCUMENTOS = new Set<SubTab>(["documentos", "consentimientos"]);` y `const clavePestana = (k: string) => (k === "formularios" ? "documentos" : k);`.
4. Los dos `useEffect` de enlaces (`?tab=` y `#`): pasar el valor por `clavePestana`.
5. `puedeVerPestana`: `case "documentos": return puedeVerDocumentos(session.role); case "consentimientos": return alcance.puede("engagement.forms");` (reemplaza la línea de `formularios`/`consentimientos`).
6. `pendingForms` → `const nPendientes = pendientesPorPaciente([p], db.clinicalDocs).get(p.id) ?? 0;` y `const verDocumentos = puedeVerDocumentos(session.role);` (va después de los `return` tempranos: sin hooks).
7. Ícono de la cabecera: condición `nPendientes > 0 && verDocumentos`, `setTab("documentos")`, tooltip «Documentos clínicos pendientes — clic para gestionar».
8. Barra de subpestañas: las pestañas normales sin las de `PESTANAS_DE_DOCUMENTOS`, y después `<MenuDocumentos opciones={…} actual={tab} onElegir={(k) => setTab(k as SubTab)} pendientes={nPendientes} />`.
9. Contenido: reemplazar (con un script que corta entre los marcadores `{/* ===== FORMULARIOS (Engagement) ===== */}` y `{/* ===== FACTURACIÓN del paciente ===== */}`) el bloque de formularios por `{tab === "documentos" && <Reveal><DocumentosClinicos patient={p} onCompletarFormulario={setFillingForm} /></Reveal>}`. `FormFill` sigue para los formularios viejos.
10. Si `tsc` marca imports sin usar (`CheckCircle2`, `Lock`…), quitarlos.

- [ ] **Paso 1:** aplicar los cambios; **Paso 2:** `npx tsc --noEmit && npx vitest run`; **Paso 3:** mirar la ficha en el navegador (demo, como admin y como recepcionista); **Paso 4: commit** `feat(ficha): menú Documentos con Documentos clínicos y Consentimientos`.

---

### Tarea 7: Consentimientos — «Crear nuevo consentimiento»

**Archivos:** `components/Consentimientos.tsx`, `components/ConsentPrintDocument.tsx`.

- Quitar la tarjeta «Nuevo consentimiento» y el estado `tplId`. Encabezado «Consentimiento informado» + casilla «Mostrar anulados» + botón **Nuevo consentimiento informado** (solo `canManage`).
- Modal **«Crear nuevo consentimiento»** (`NuevoConsentimientoModal`): **Tipo de consentimiento \*** (plantillas; ayuda «Si querés agregar una plantilla nueva, hacelo desde Configuración»), **Plan de tratamiento** (los planes del paciente, `etiquetaPlan`, más nuevos primero; al elegir uno y no haber profesional se sugiere el del plan), **Profesional a cargo \*** (dentistas activos). Botones **Cerrar** y **Crear consentimiento** (deshabilitado sin tipo y profesional).
- El documento guarda `budgetId?` y `dentistId`. La lista muestra «· {profesional} · {plan}» y filtra anulados salvo «Mostrar anulados». Texto vacío: «Este paciente no cuenta con ningún consentimiento informado.»
- `ConsentPrintDocument` y el visor reciben `profesional?` y `plan?` y los muestran en `consent-print-meta` solo si existen (los consentimientos viejos se imprimen igual).
- [ ] **Pasos:** editar; `npx tsc --noEmit && npx vitest run`; el E2E `e2e/consent-impresion.spec.ts` sigue pasando en la Tarea 11; **commit** `feat(consentimientos): crear con plan de tratamiento y profesional a cargo`.

---

### Tarea 8: alta de paciente con Historia Clínica pendiente

**Archivos:** `lib/camposPaciente.ts`, `app/app/pacientes/nuevo/page.tsx`, `components/DarCita.tsx`.

- `nuevoPaciente`: `forms: []` (ya no crea «Anamnesis inicial»).
- `nuevo/page.tsx`: `const { db, session, crearPaciente } = useStore();` y `crearPaciente(p, { id: session.userId, name: session.name })` en lugar de `upsertPatient(p)`; el aviso pasa a «Se asigna automáticamente la **Historia Clínica** como documento clínico pendiente.»
- `DarCita.tsx` (línea ~35 y ~288): `const { db, session, crearPaciente } = useStore();` y `onCreado={(p) => { if (session) crearPaciente(p, { id: session.userId, name: session.name }); setPacienteId(p.id); setCreandoPaciente(false); }}`.
- La reserva online (`app/api/reservas/route.ts`) no cambia: crea el paciente con `forms: []` desde el servidor.
- [ ] **Pasos:** editar; `npx tsc --noEmit && npx vitest run`; **commit** `feat(pacientes): el alta deja una Historia Clínica pendiente`.

---

### Tarea 9: pendientes y historial

**Archivos:** `components/Shell.tsx`, `app/app/page.tsx`, `components/NovudentIA.tsx`, `lib/historial.ts`, `lib/historial.test.ts`, `components/Historial.tsx`.

- `Shell.tsx`: junto al memo `pendings` (antes del `return` temprano) crear `const conPendientes = useMemo(() => pendientesPorPaciente(db.patients, db.clinicalDocs), [db.patients, db.clinicalDocs]);`; `forms = alcance.puede("engagement.forms") ? conPendientes.size : 0`; en el buscador `p.forms.some(...)` → `conPendientes.has(p.id)`; tooltip de la campana «… pendiente(s): documentos y retenciones».
- `app/app/page.tsx`: `const conPendientes = pendientesPorPaciente(db.patients, db.clinicalDocs); const pendingForms = conPendientes.size;`; contralor `formulariosPendientes` filtra con `conPendientes.has(p.id)`; el indicador pasa a «Documentos pendientes».
- `NovudentIA.tsx` (`PatientBriefButton`): `formulariosPendientes` usa `pendientesPorPaciente([patient], db.clinicalDocs).get(patient.id) ?? 0` (agregar `useStore`).
- `lib/historial.ts`: `HistorialKind` suma `"documento"`; `buildHistorial` acepta `documentos?: DocumentoClinico[]` y agrega los **completados** (`id: doc_${id}`, `at: completedAt ?? createdAt`, título «Documento clínico», detalle el nombre, `by: completedBy ?? createdByName`). Test nuevo: se agregan los completados, no los pendientes ni anulados; el orden sigue siendo descendente.
- `Historial.tsx`: `KIND_META.documento` (ícono `FileText`, `bg-azure-700`), opción «Documentos» en el filtro y `documentos: db.clinicalDocs.filter((d) => d.patientId === patient.id)` en la llamada.
- [ ] **Pasos:** test de historial → falla → implementar → pasa; editar el resto; `npx tsc --noEmit && npx vitest run`; **commit** `feat(documentos): pendientes en campana, inicio e historial`.

---

### Tarea 10: Configuración › Documentos clínicos (editor de plantillas)

**Archivos:** `components/PlantillasDocumento.tsx` (nuevo), `app/app/configuracion/page.tsx` (mod).

- `PlantillasDocumento`: tabla (nombre, tipo, estado Activa/Inactiva/**Por revisar**) con **Editar**, **Duplicar** (`idUnico`, nombre «… (copia)»), **Activar/Desactivar**, **Marcar como revisada** (quita `porRevisar`; solo si lo tiene), **Eliminar** (`window.confirm`; los documentos ya creados no se tocan), **Nueva plantilla**, **Restablecer de fábrica** (`window.confirm`) y **Guardar** (visible con cambios; `updateClinicConfig({ plantillasDocumento: normalizarPlantillas(lista) })`).
- Editor (modal): nombre; tipo (solo al crear); formulario → secciones (título, subir/bajar, borrar, **Agregar sección**) con campos (rótulo, tipo, opciones una por línea, «Solo mujeres», subir/bajar, borrar, **Agregar campo**; al cambiar a lista o casillas sin opciones se siembran `Opción 1`/`Opción 2`); texto → cuerpo con la ayuda de `{paciente} {documento} {fecha} {profesional} {clinica}`. Al guardar pasa por `normalizarPlantillas([p])`: si queda vacía, error «La plantilla necesita un nombre y, si es un formulario, al menos una sección con un campo.»; los campos sin rótulo se descartan. Los ids de campo no cambian al renombrar el rótulo.
- `configuracion/page.tsx`: antes de `<span id="usuarios" …/>` agregar `<span id="documentos-clinicos" className="block scroll-mt-24" aria-hidden="true" />` y una `Card` «Documentos clínicos» con la explicación y `<PlantillasDocumento />` (importar `FileText` si falta). Sumar «Documentos clínicos» (`/app/configuracion#documentos-clinicos`, solo `practice.config`) junto a «Estados de cita» en el menú de `components/Shell.tsx`.
- [ ] **Pasos:** escribir; `npx tsc --noEmit && npx vitest run`; **commit** `feat(config): editor de plantillas de documentos clínicos`.

---

### Tarea 11: E2E

**Archivo:** `e2e/documentos-clinicos.spec.ts` (nuevo). Usa `entrarDemo`, `leerDB`, `USUARIOS_DEMO` de `e2e/soporte.ts`; la demo corre sin Firebase (localStorage).

- [ ] **Casos:**
  1. **Menú:** `/app/pacientes/p3` → grupo «Ficha clínica» → «Documentos» → «Documentos clínicos» (título visible) → «Documentos» → «Consentimientos» (título «Consentimiento informado»).
  2. **Completar la Historia Clínica de p2** (hombre): `?tab=documentos` → «Completar» → no aparecen las preguntas de embarazo → elegir «Sí» en la primera pregunta, marcar «Diabetes» dentro del grupo «El paciente refiere haber padecido:», escribir `120/80` en «Tensión arterial:» → «Continuar» → diálogo «Documento clínico» con «Diabetes» y «120/80» y **sin** «Hepatitis» → `window.print` se llama y en modo `print` se ve `docclin-print-document` → cerrar → la fila queda «Completado» y `leerDB` muestra `estado: "completado"` con `valores.tension_arterial === "120/80"`.
  3. **Borrador:** nuevo documento para p1 desde «Nuevo documento clínico» → llenar un campo → «Guardar borrador» → volver → sigue «Pendiente».
  4. **Texto por revisar:** crear «Cuidados postoperatorios de exodoncia» → aviso «Por revisar» en el editor y «BORRADOR — pendiente de revisión por un odontólogo» en la hoja impresa; el texto lleva el nombre del paciente.
  5. **Enlace viejo:** `/app/pacientes/p4?tab=formularios` abre Documentos clínicos con «Historia médica (actualización)»; «Completar» abre el modal viejo «Completar: Historia médica (actualización)».
  6. **Recepción:** como `USUARIOS_DEMO.recepcionista`, `/app/pacientes/p3?tab=documentos` abre la lista y la ficha **no** ofrece «Odontograma» ni «Evoluciones».
  7. **Consentimiento:** como admin, `?tab=consentimientos` → «Nuevo consentimiento informado» → «Crear nuevo consentimiento» (Tipo, Plan, Profesional) → crear con la primera plantilla y «Dra. Sofía Benítez» → aparece en la lista con el profesional; `leerDB` tiene `dentistId: "u2"`.
  8. **Alta:** crear un paciente (como en `e2e/campos-paciente.spec.ts`, `completarObligatorios`) → `leerDB().clinicalDocs` tiene su Historia Clínica pendiente y el paciente tiene `forms: []`.
  9. **Campana:** el conteo de pendientes de la campana es 3 (p1, p2, p4) y baja a 2 al completar el de p2.
  10. **Configuración:** como admin, `/app/configuracion#documentos-clinicos` → desactivar «Higiene y cepillado en adultos» → Guardar → ya no aparece en «Nuevo documento clínico»; «Marcar como revisada» en «Cuidados postoperatorios de exodoncia» → un documento nuevo desde ella ya no lleva «Por revisar».
- [ ] **Correr:** `npm run build` y luego `E2E_PORT=3300 npx playwright test --project=escritorio --project=celular --grep-invert @visual` (los snapshots visuales se regeneran aparte).
- [ ] **Commit** `test(documentos): E2E de documentos clínicos y consentimientos`.

---

### Tarea 12: verificación final, documentación, merge y publicación

- [ ] `npx tsc --noEmit && npx vitest run && npm run build`; toda la suite E2E en escritorio y celular (sin `@visual`); `npm run test:rules`.
- [ ] Mirar en el navegador (demo): Ficha clínica › Documentos ▾ en escritorio y en celular (390 px), completar la Historia Clínica, imprimir (vista previa), enviar por correo (mensaje claro mientras falte `RESEND_API_KEY`), consentimiento nuevo, editor de plantillas.
- [ ] `CLAUDE.md` del proyecto: párrafo «Documentos clínicos (oct-2026)» (colección `clinicalDocs`, snapshot de plantilla, `plantillasDeClinica`, nunca borrar, `puedeEditarDocumentos` ↔ regla, `pendientesPorPaciente` para todo conteo de pendientes) y el paso manual **`firebase deploy --only firestore:rules`** (ahora también `clinicalDocs`).
- [ ] `docs/dentalink/05-videos-identidad-y-funciones.md`: cerrar el pedido del 6-oct (Documentos ▾, Historia Clínica, consentimiento con plan y profesional).
- [ ] Merge: `git checkout main && git merge --no-ff feat/documentos-clinicos` y `git push origin main` (deploy key); verificar el deploy en Vercel (conector, proyecto `novudent-app`) hasta `READY`.
- [ ] **Reglas en producción:** pedir a Croman `firebase login` en una terminal y correr `firebase deploy --only firestore:rules` (proyecto `novudent-664f3`). Hasta entonces las clínicas reales **no guardan** documentos clínicos (el demo sí).
- [ ] Avisar a Camila/Angel qué quedó y qué no (próximos pedidos: campanita con panel y links, «Mi agenda» con IA, manual de procedimientos con capturas).
