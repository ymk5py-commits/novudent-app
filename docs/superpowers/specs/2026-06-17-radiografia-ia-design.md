# Análisis IA de Radiografías — Diseño (sub-proyecto A)

**Fecha:** 2026-06-17
**Tipo:** Feature de paridad con Dentalink (Novudent puro — no toca Botika)
**Programa:** Paridad Dentalink (A radiografía IA · B firma+documentos · C nav+home · D módulos CRM/Laboratorios/Liquidaciones/Box). Este spec cubre **solo A**.

## Objetivo

Que el profesional suba una radiografía (panorámica, bitewing o periapical), la
**IA la lea** y proponga hallazgos marcados **sobre la imagen** (cajas + etiqueta +
severidad), el profesional **corrige/agrega/borra** esas marcas de un vistazo, y se
genere una **explicación en lenguaje simple para el paciente**. Replica el servicio
"Análisis IA de radiografías" de Dentalink ("IA editable por el profesional", "explica
el diagnóstico al paciente", "no reemplaza el criterio").

## Decisiones (del brainstorming)

1. **Motor: híbrido, Gemini ahora, pluggable.** Arranca con Gemini Vision (que ya se
   usa para audio); el contrato de `findings[]` es agnóstico del modelo, así enchufar
   después una API dental dedicada (Pearl/Denti.AI/Roboflow) toca **solo la ruta**.
2. **Marcado: la IA propone cajas, el profesional ajusta.** Lienzo de anotación con
   cajas en coordenadas normalizadas; el profesional arrastra/redimensiona/borra/agrega.
   Es el modelo "editable" de Dentalink y el mismo lienzo sirve cuando lleguen cajas
   precisas del modelo dedicado.
3. **Almacenamiento: colección `clinics/{cid}/radiographs`** (un doc por estudio),
   imagen como **base64 JPEG redimensionado en el cliente** (no Firebase Storage —
   plan Spark). Mismo patrón que `recoveryMonitors`.
4. **Gating: feature de plan `radiografia_ia` en Clínica + Cadena** (no Solo —
   Dentalink lo vende como servicio adicional). **Confirmado.**

## Contexto (qué se reutiliza)

- **Ruta IA** (`app/api/ia/perio-voz/route.ts`): molde exacto — `verifyIdToken` +
  `rateLimit` + `GEMINI_API_KEY` server-only + `generateContent` con `inline_data`
  (audio→imagen) + parse JSON + validador puro. La key vive SOLO en el server.
- **Store** (`lib/store.tsx`): `loadFirestore()` lee cada colección con
  `col(name)=getDocs(collection(fsdb,"clinics",CLINIC_ID,name))`; `DB` tiene arrays
  tipados; `fsSave(col,id,data)`/`fsDelete(col,id)` persisten contra
  `clinicIdRef.current`. Se suma `radiographs` igual que `recoveryMonitors`.
- **Imágenes base64** (`components/PatientExtras.tsx`): ya se suben archivos con
  `FileReader.readAsDataURL`. El estudio se redimensiona antes de guardar.
- **Plan gating** (`components/PlanGate.tsx` + `lib/plan.ts`): `useClinicPlan()` +
  `<PlanLocked feature/>`; se agrega `radiografia_ia` a la matriz.
- **RBAC** (`lib/rbac.ts`): escritura clínica (EMR) solo dentista/admin (mismo gate
  que odontograma/periodoncia).
- **Ficha** (`app/app/pacientes/[id]/page.tsx`): tabs con `Tab` union + `TABS[]`; se
  agrega un tab `radiografias`. Componente nuevo en **archivo propio**
  `components/Radiografias.tsx` (export `RadiografiasTab`) — `PatientExtras.tsx` ya
  es grande; el lienzo de anotación merece su propio módulo.

## Modelo de datos (`lib/types.ts`)

```ts
export type RxKind = "panoramica" | "bitewing" | "periapical" | "otra";
export type RxSeverity = "observacion" | "leve" | "moderado" | "severo";

export interface RadiographFinding {
  id: string;
  /** Caja normalizada 0..1 sobre la imagen (escala con cualquier tamaño de render). */
  box: { x: number; y: number; w: number; h: number };
  label: string;            // "Caries oclusal", "Pérdida ósea", "Lesión periapical"…
  tooth?: string;           // FDI si la IA/el profesional lo ubica
  severity: RxSeverity;
  note?: string;            // nota del profesional
  source: "ia" | "profesional"; // procedencia (para auditoría y UI)
}

export interface RadiographRec {
  id: string;
  patientId: string;
  kind: RxKind;
  image: string;            // data URL base64 JPEG (redimensionado en cliente)
  takenAt?: string;         // fecha del estudio (ISO date)
  createdAt: string;
  createdBy: string;        // userId
  findings: RadiographFinding[];
  aiSummary?: string;       // resumen técnico para el profesional
  patientExplanation?: string; // explicación en lenguaje simple
  aiModel?: string;         // procedencia del análisis ("gemini-2.5-flash")
  status: "borrador" | "revisado"; // el profesional confirmó
  reviewedBy?: string;
  reviewedAt?: string;
}
```

`DB` (`lib/types.ts`) suma `radiographs: RadiographRec[]`.

## Almacenamiento e imagen

- Colección `clinics/{cid}/radiographs`, **un doc por estudio**. Cada doc bien por
  debajo del límite de 1 MB de Firestore.
- **Redimensionado en cliente** (`lib/image.ts` nuevo, puro/testeable):
  `resizeToDataUrl(file, { maxDim: 1400, quality: 0.8, mime: "image/jpeg" })` vía
  canvas. Una panorámica queda en ~150–400 KB base64. Rechaza si tras redimensionar
  sigue > ~900 KB (pide una imagen más liviana) — nunca escribe un doc que Firestore
  rechazaría.
- Store: `loadFirestore` agrega `col("radiographs")` al `Promise.all` y mapea a
  `db.radiographs`; acciones `addRadiograph/updateRadiograph/deleteRadiograph`
  (persist + `fsSave("radiographs", r.id, r)` / `fsDelete`).

## Flujo IA

Ruta nueva `app/api/ia/radiografia/route.ts` (molde perio-voz):

1. `verifyIdToken` → 401 si no hay sesión Firebase válida.
2. `rateLimit(ia:${uid}, {limit:20, windowMs:60000})`.
3. `GEMINI_API_KEY` server-only; modelo `GEMINI_VISION_MODEL || "gemini-2.5-flash"`.
4. Body `{ image: base64, mimeType, kind }`. Límite de tamaño (mismo patrón ~10 MB).
5. Prompt estricto → **SOLO** JSON:
   ```json
   {"findings":[{"box":{"x":0.12,"y":0.30,"w":0.08,"h":0.10},"label":"Caries oclusal","tooth":"16","severity":"moderado"}],
    "summary":"…técnico…","patientExplanation":"…lenguaje simple, rioplatense, sin alarmar…"}
   ```
   El prompt fija: coordenadas normalizadas 0..1; severidad ∈ {observacion,leve,moderado,severo};
   "no inventes; si no ubicás exacto, caja aproximada"; "esto es apoyo, no diagnóstico".
6. Validador puro **`lib/radiografia.ts`** (`validateRadiografiaAI(raw)`), **TDD** (es
   clínico): descarta findings malformados; **clampa** box a 0..1 (x,y,w,h, y x+w≤1);
   normaliza `severity` a la enum (default "observacion"); recorta strings; **cap** de
   findings (ej. 40); marca `source:"ia"`. Nunca corrompe el registro ni explota con
   basura del modelo. Devuelve `{ findings, summary, patientExplanation }` saneado.

## UI

Tab nuevo **"Radiografías"** en la ficha + componente `RadiografiasTab(patient)`:

- **Cargar**: input file (o elegir desde Archivos) → `resizeToDataUrl` → preview. Selector de `kind`.
- **Analizar con IA**: llama la ruta → pinta las cajas sobre la imagen (lienzo con
  coords normalizadas) + muestra `summary` y `patientExplanation` en paneles.
- **Editar (profesional)**: arrastrar/redimensionar/borrar cajas; agregar caja nueva
  (`source:"profesional"`); editar label/tooth/severity/nota; editar la explicación.
- **Guardar**: persiste `RadiographRec` (`status:"revisado"`, `reviewedBy/At`).
- **Mostrar al paciente**: vista limpia (imagen + marcas + explicación), sin controles
  de edición — para girar la pantalla y explicarle al paciente.
- **Disclaimer** obligatorio y visible: *"Herramienta de apoyo al diagnóstico — no
  reemplaza el criterio del profesional tratante."*
- Lista de estudios previos del paciente (por fecha) para reabrir/comparar visualmente.

Lienzo: SVG/`<div>` absolutos sobre la imagen con cajas en % (coords normalizadas →
no dependen del tamaño de render); handles de drag/resize. Sin dependencia nueva.

## RBAC, plan y configuración

- **RBAC**: crear/analizar/editar/firmar = escritura EMR (dentista/admin), igual gate
  que odontograma. Asistente: solo lectura. Validado con `can(role, "emr.write")`
  (o el permiso EMR existente que use el odontograma).
- **Plan**: `lib/plan.ts` suma feature `radiografia_ia` (propuesta Clínica+Cadena).
  El tab y la acción se envuelven con `PlanGate`/`<PlanLocked feature="radiografia_ia"/>`.
- **Configuración → "Servicios adicionales"** (sección nueva, espejo de Dentalink):
  tarjeta "Análisis IA de radiografías" (estado/uso) + las futuras Firma y WhatsApp.

## Reglas Firestore

Agregar `radiographs` a `firestore.rules`: `read` por miembros de la clínica
(`isMember`); `create/update/delete` por roles con escritura EMR (dentista/admin),
mismo molde que `recoveryMonitors`/EMR. La imagen es PHI → ya cae bajo el scope
member-only y la retención PII existente.

## Seguridad y compliance

- **Disclaimer** clínico siempre visible; el `patientExplanation` evita lenguaje
  diagnóstico categórico.
- **Procedencia**: `aiModel`, `source` por finding (ia vs profesional), `reviewedBy/At`
  — queda auditable que el profesional revisó.
- La key Gemini nunca sale del server. La imagen viaja por la ruta autenticada.

## Alcance

**v1 (IN):** subir panorámica/bitewing/periapical (redimensionada); análisis Gemini;
cajas editables (IA + profesional); `summary` + `patientExplanation`; guardar/listar;
modo "mostrar al paciente"; disclaimer; validador puro TDD; gating de plan; reglas
Firestore; sección "Servicios adicionales" en Configuración.

**Fuera de v1:** modelo CV dedicado (enchufable después, mismo contrato); DICOM;
herramientas de medición en mm; comparación temporal automática; numeración FDI
automática garantizada; impresión/PDF del informe (se evalúa reusar `print-area`).

## Criterio de éxito

El profesional sube una radiografía, en ~3–6 s ve hallazgos marcados sobre la imagen
con una explicación para el paciente; ajusta las marcas a mano y guarda; puede girar
la pantalla en modo paciente. Una imagen ilegible o una respuesta basura del modelo
**no** corrompe la ficha (el validador descarta y se puede marcar a mano). Solo planes
habilitados ven la feature; solo dentista/admin la editan.

## Riesgos / decisiones abiertas

- **Precisión de las cajas de Gemini**: aproximadas. Mitigación: el profesional es la
  fuente de verdad (edita), disclaimer, `source:"ia"` visible, y el contrato pluggable
  permite subir a un modelo dedicado sin reescribir la UI.
- **Tamaño de imagen**: mitigado con redimensionado + rechazo > ~900 KB.
- **Tier del plan**: `radiografia_ia` en **Clínica + Cadena** (confirmado).
- **Responsabilidad clínica**: disclaimer + edición obligatoria + nada de auto-diagnóstico.
```
