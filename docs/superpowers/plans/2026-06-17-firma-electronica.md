# Firma Electrónica de Consentimientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** La clínica crea consentimientos desde plantillas y los hace firmar — en consultorio (pad en pantalla) o por QR/enlace desde el celular del paciente (página pública) — quedando guardados, firmados y imprimibles.

**Architecture:** Validador puro TDD (`lib/firma.ts`: token + `canSign` + `validateSignPayload`) + `SignaturePad` (canvas, reusado) + colección `clinics/{cid}/signatures` (patrón `radiographs`) + plantillas en `clinic.config.consentTemplates` + ruta pública `/api/firmar` (GET/POST por `cid`+`token`, escribe vía service-user como `/api/reservas`) + página pública `/firmar/[cid]/[token]` + tab Consentimientos en la ficha con QR.

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (web SDK + service-user para la ruta pública), vitest, Tailwind, `qrcode`.

**Spec:** `docs/superpowers/specs/2026-06-17-firma-electronica-design.md`

**Branch:** ya estás en `feat/firma-electronica` (rama desde `main`). No mergear hasta el final.

---

## File Structure

- Create `lib/firma.ts` + `lib/firma.test.ts` — token, `canSign`, `validateSignPayload` (TDD).
- Create `components/SignaturePad.tsx` — canvas de firma (draw → PNG base64).
- Create `app/api/firmar/route.ts` — ruta pública GET/POST por `cid`+`token`.
- Create `app/firmar/[cid]/[token]/page.tsx` — página pública de firma (mobile-first).
- Create `components/Consentimientos.tsx` — tab de la ficha (crear/firmar/QR/listar/imprimir).
- Modify `lib/types.ts` — `ConsentTemplate`, `SignatureDoc`, `SignatureStatus`, `DB.signatures`, `config.consentTemplates`.
- Modify `lib/seed.ts` — `signatures: []` + 1–2 `consentTemplates` por defecto en el config del clinic.
- Modify `lib/plan.ts` (+`lib/plan.test.ts`) — feature `firma_electronica` (Clínica+Cadena).
- Modify `lib/store.tsx` — cargar `signatures`, default `[]`, acciones `addSignature/updateSignature/deleteSignature`, y guardar `consentTemplates` (vía el save de config existente).
- Modify `app/app/pacientes/[id]/page.tsx` — tab `consentimientos`.
- Modify `app/app/configuracion/page.tsx` — CRUD de plantillas + tarjeta "Firma electrónica" en Servicios adicionales.
- Modify `firestore.rules` — reglas de `signatures`.
- Modify `package.json` — dep `qrcode` + `@types/qrcode`.

---

## Task 1: Domain types + seed

**Files:** Modify `lib/types.ts`, `lib/seed.ts`

- [ ] **Step 1: Add types** to `lib/types.ts` (cerca de `RadiographRec`):

```ts
/* ===== Firma electrónica / consentimientos ===== */
export interface ConsentTemplate {
  id: string;
  title: string;
  body: string;
}

export type SignatureStatus = "pendiente" | "firmado" | "anulado";

export interface SignatureDoc {
  id: string;
  patientId: string;
  templateId?: string;
  title: string;
  body: string;            // snapshot inmutable
  status: SignatureStatus;
  token: string;
  signatureImage?: string; // PNG base64
  signedAt?: string;
  signedByName?: string;
  channel?: "consultorio" | "remoto";
  createdBy: string;
  createdAt: string;
}
```

- [ ] **Step 2:** En la interfaz `DB` agregar `signatures: SignatureDoc[];`. En el tipo del `config` del clinic (donde está `reminderTemplate?: string`) agregar `consentTemplates?: ConsentTemplate[];`.

- [ ] **Step 3:** En `lib/seed.ts`: agregar `signatures: []` al DB del seed (junto a `radiographs: []`), y en el `config` del clinic sembrar un array `consentTemplates` con DOS plantillas reales y editables (un "Consentimiento informado general" y un "Consentimiento para tratamiento odontológico" con texto realista en español, cada uno con `id` estable). 

- [ ] **Step 4: Verify** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit` — los únicos errores deben ser en `store.tsx` por `signatures` faltante (se resuelve en Task 5). vitest verde.

- [ ] **Step 5: Commit** `git add lib/types.ts lib/seed.ts && git commit -m "feat(firma): tipos ConsentTemplate/SignatureDoc + seed de plantillas"`

---

## Task 2: Pure helpers (TDD — security core)

**Files:** Create `lib/firma.ts`, `lib/firma.test.ts`

- [ ] **Step 1: Write failing test** `lib/firma.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { newSignToken, canSign, validateSignPayload } from "./firma";

describe("newSignToken", () => {
  it("genera tokens largos, únicos y url-safe", () => {
    const a = newSignToken(), b = newSignToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("canSign", () => {
  it("solo permite firmar documentos pendientes", () => {
    expect(canSign({ status: "pendiente" } as any)).toBe(true);
    expect(canSign({ status: "firmado" } as any)).toBe(false);
    expect(canSign({ status: "anulado" } as any)).toBe(false);
    expect(canSign(null as any)).toBe(false);
  });
});

describe("validateSignPayload", () => {
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  it("acepta un payload válido", () => {
    const r = validateSignPayload({ signatureImage: png, signedByName: "Juan Pérez" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.signedByName).toBe("Juan Pérez"); expect(r.signatureImage).toBe(png); }
  });
  it("rechaza imagen que no es PNG data URL", () => {
    expect(validateSignPayload({ signatureImage: "http://x/a.png", signedByName: "X" }).ok).toBe(false);
    expect(validateSignPayload({ signatureImage: "", signedByName: "X" }).ok).toBe(false);
  });
  it("rechaza nombre vacío y recorta nombres largos", () => {
    expect(validateSignPayload({ signatureImage: png, signedByName: "  " }).ok).toBe(false);
    const long = validateSignPayload({ signatureImage: png, signedByName: "a".repeat(300) });
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.signedByName.length).toBeLessThanOrEqual(120);
  });
  it("rechaza imágenes gigantes", () => {
    const huge = "data:image/png;base64," + "A".repeat(3_000_000);
    expect(validateSignPayload({ signatureImage: huge, signedByName: "X" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail.** `npx vitest run lib/firma.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implement** `lib/firma.ts`:

```ts
import type { SignatureDoc } from "./types";

const MAX_SIG_BYTES = 1_500_000; // ~1.5MB de PNG base64 (firma simple es chica)

/** Token aleatorio url-safe (~180 bits). Usa WebCrypto (browser y edge/runtime). */
export function newSignToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Solo se puede firmar un doc pendiente. */
export function canSign(doc: Pick<SignatureDoc, "status"> | null | undefined): boolean {
  return !!doc && doc.status === "pendiente";
}

export type SignPayload =
  | { ok: true; signatureImage: string; signedByName: string }
  | { ok: false; error: string };

/** Sanea el payload de firma de la página pública. Rechaza basura. Puro. */
export function validateSignPayload(raw: any): SignPayload {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Datos inválidos" };
  const img = String(raw.signatureImage ?? "");
  if (!/^data:image\/png;base64,/.test(img)) return { ok: false, error: "Firma inválida" };
  if (img.length * 0.75 > MAX_SIG_BYTES) return { ok: false, error: "Firma demasiado grande" };
  const name = String(raw.signedByName ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Falta el nombre de quien firma" };
  return { ok: true, signatureImage: img, signedByName: name };
}
```

- [ ] **Step 4: Run, confirm pass.** `npx vitest run lib/firma.test.ts` → PASS.

- [ ] **Step 5: Commit** `git add lib/firma.ts lib/firma.test.ts && git commit -m "feat(firma): helpers puros token/canSign/validateSignPayload (TDD)"`

---

## Task 3: Plan feature flag (TDD)

**Files:** Modify `lib/plan.ts`, `lib/plan.test.ts`

- [ ] **Step 1: Add failing test** (append a `lib/plan.test.ts`):

```ts
describe("firma_electronica gating", () => {
  it("está en Clínica y Cadena, no en Solo", () => {
    expect(planHas("clinica", "firma_electronica")).toBe(true);
    expect(planHas("cadena", "firma_electronica")).toBe(true);
    expect(planHas("solo", "firma_electronica")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail.** `npx vitest run lib/plan.test.ts` → FAIL.

- [ ] **Step 3: Implement.** En `lib/plan.ts`: agregar `"firma_electronica"` al union `PlanFeature` y al array `features` de **clinica** y **cadena**. Agregar la entrada exhaustiva en el `Record<PlanFeature,string>` de `components/PlanGate.tsx` (`firma_electronica: "Firma electrónica"`).

- [ ] **Step 4: Run, confirm pass.** `npx vitest run lib/plan.test.ts` → PASS.

- [ ] **Step 5: Commit** `git add lib/plan.ts lib/plan.test.ts components/PlanGate.tsx && git commit -m "feat(firma): feature de plan firma_electronica (Clínica+Cadena, TDD)"`

---

## Task 4: SignaturePad component

**Files:** Create `components/SignaturePad.tsx`

- [ ] **Step 1: Implement** `components/SignaturePad.tsx` — `"use client"`. Un `<canvas>` (ej. 600×220, responsive con `w-full`) donde se dibuja con Pointer Events: `pointerdown` inicia un trazo, `pointermove` traza líneas (`lineTo`+`stroke`, `lineWidth ~2.5`, color navy), `pointerup`/`pointerleave` cierra el trazo; `setPointerCapture` para no perder el trazo al salir. Maneja el devicePixelRatio (escala el canvas para nitidez). Props: `onChange?(dataUrl: string)` (emite el PNG en cada trazo terminado) y un ref/método o botón "Borrar" que limpia. Export `toDataURL()` vía un `useImperativeHandle` o exponé un botón "Borrar" interno + un prop `onChange`. Incluí estado "vacío" (no permitir firmar si no se dibujó nada — trackear si hubo al menos un trazo). Sin dependencias nuevas.

- [ ] **Step 2: Verify** `npx tsc --noEmit` (solo errores esperados de `store.tsx` por `signatures`). 

- [ ] **Step 3: Commit** `git add components/SignaturePad.tsx && git commit -m "feat(firma): componente SignaturePad (canvas de firma)"`

---

## Task 5: Store integration

**Files:** Modify `lib/store.tsx`

- [ ] **Step 1:** En `loadFirestore()`: agregar `col("signatures")` al `Promise.all`, al destructuring, y mapear `signatures: signatures.docs.map((d) => d.data() as SignatureDoc)`. Importar `SignatureDoc`. Default `signatures: []` donde corresponda (ya cubierto por el seed de Task 1 si `loadLocal` usa el seed).

- [ ] **Step 2:** Agregar acciones (junto a `addRadiograph`): `addSignature(s)`, `updateSignature(s)`, `deleteSignature(id)` (persist + `fsSave("signatures", s.id, s)` / `fsDelete`). Para las plantillas: usá el guardado de config existente (el clinic se persiste con `setDoc(... clinics/{id}, { merge:true })`); agregá una acción `saveConsentTemplates(list: ConsentTemplate[])` que actualiza `db.clinics[0].config.consentTemplates` y persiste el clinic (mirá cómo se guarda hoy `reminderTemplate`/config). Declarar las firmas en el tipo `Ctx`.

- [ ] **Step 3: Verify** `npx tsc --noEmit` → **CERO errores**. `npx vitest run` → verde.

- [ ] **Step 4: Commit** `git add lib/store.tsx && git commit -m "feat(firma): store carga/persiste signatures + plantillas de consentimiento"`

---

## Task 6: Public sign route

**Files:** Create `app/api/firmar/route.ts`

- [ ] **Step 1: Implement.** READ `app/api/reservas/route.ts` para copiar EXACTAMENTE cómo accede a Firestore del lado server (service-user / cliente que usa). Implementá:
  - **GET** `?cid=&token=`: valida params; busca en `clinics/{cid}/signatures` el doc con ese `token` (igual mecanismo de lectura server que usa reservas para leer la clínica). Devuelve SOLO `{ ok:true, title, body, status, patientName }` (el `patientName` se arma del paciente para mostrar "firmás como X"; nada más sensible). Si no existe → 404 `{ ok:false }`. Rate-limit por IP/token.
  - **POST** `{ cid, token, signatureImage, signedByName }`: `validateSignPayload` (de `@/lib/firma`); buscar el doc; `canSign(doc)` (si no → 409 "El documento ya fue firmado o no está disponible"); escribir `signatureImage`, `status:"firmado"`, `signedAt`, `signedByName`, `channel:"remoto"` (mismo mecanismo de escritura server que reservas). Rate-limit. Nunca exponer otros docs ni permitir re-firma.
  - Sin `verifyIdToken` (es pública; el token ES la credencial). Manejo de errores como las otras rutas (`{ ok:false, error }` + status).

- [ ] **Step 2: Verify** `npx tsc --noEmit` → cero errores.

- [ ] **Step 3: Commit** `git add app/api/firmar/route.ts && git commit -m "feat(firma): ruta pública /api/firmar (GET/POST por cid+token, service-side)"`

---

## Task 7: Public signing page

**Files:** Create `app/firmar/[cid]/[token]/page.tsx`

- [ ] **Step 1: Implement** — `"use client"`, mobile-first, SIN el Shell (es pública, no usa sesión). Lee `cid`/`token` de los params, hace `GET /api/firmar?cid=&token=`:
  - estado de carga; si `status!=="pendiente"` → mensaje "Este documento ya fue firmado / no está disponible".
  - si pendiente: muestra el `title` + `body` (párrafos), un input "Tu nombre" (prefill con `patientName`), el `<SignaturePad onChange=…>`, y un botón "Firmar" (deshabilitado si no dibujó o falta nombre).
  - al enviar: `POST /api/firmar { cid, token, signatureImage, signedByName }`; on success → pantalla "¡Gracias! Documento firmado ✓". Maneja errores (409/inválido) con mensaje claro.
  - Estética: marca Novudent (logo/navy), limpia y clara en celular. Reusá tokens existentes; sin Shell.

- [ ] **Step 2: Verify** `npx tsc --noEmit` + `npm run build` (la ruta pública debe compilar).

- [ ] **Step 3: Commit** `git add "app/firmar/[cid]/[token]/page.tsx" && git commit -m "feat(firma): página pública /firmar/[cid]/[token]"`

---

## Task 8: Consentimientos tab + QR

**Files:** Modify `package.json` (dep), Create `components/Consentimientos.tsx`

- [ ] **Step 1: Add dependency.** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npm install qrcode && npm install -D @types/qrcode`

- [ ] **Step 2: Implement** `components/Consentimientos.tsx` — `RadiografiasTab`-style. `ConsentimientosTab({ patient })`:
  - Plan gate `firma_electronica` (`<PlanLocked>` si no).
  - RBAC: crear/firmar/anular requiere el permiso de gestión (mismo criterio que usa la ficha para gestionar; si dudás, `can(session.role, "practice.config")` o el que use formularios — leé la ficha). Lectura para todos.
  - "Nuevo consentimiento": elegir una `consentTemplates` del config → crea `SignatureDoc` (`status:"pendiente"`, `token: newSignToken()`, snapshot `title`/`body`, `createdBy/At`) vía `addSignature`.
  - Por cada doc pendiente: botón "Firmar acá" → abre el `<SignaturePad>` + input nombre (prefill nombre del paciente) → al confirmar `updateSignature` (`status:"firmado"`, `signatureImage`, `signedAt`, `signedByName`, `channel:"consultorio"`). Y botón "Firmar desde el celular" → muestra el **QR** (generá el data URL con `import QRCode from "qrcode"; QRCode.toDataURL(url)`) del enlace `${location.origin}/firmar/${cid}/${token}` + enlace copiable.
  - Lista de docs (pendiente/firmado/anulado) con estado; ver el firmado (imagen de la firma + texto) en un panel `print-area` con botón "Imprimir"; botón "Anular" (status `anulado`).
  - Disclaimer legal breve: "Firma electrónica simple — válida para consentimiento clínico."
  - Estilo consistente con la ficha (Card/Badge/tokens). 

- [ ] **Step 3: Verify** `npx tsc --noEmit` → cero errores.

- [ ] **Step 4: Commit** `git add package.json package-lock.json components/Consentimientos.tsx && git commit -m "feat(firma): tab Consentimientos (crear/firmar/QR/imprimir) + dep qrcode"`

---

## Task 9: Wire tab into ficha

**Files:** Modify `app/app/pacientes/[id]/page.tsx`

- [ ] **Step 1:** Importar `ConsentimientosTab`; agregar `"consentimientos"` al union `Tab`; entrada en `TABS[]` (label "Consentimientos", icono lucide `FileSignature` o `PenLine`); render `{tab === "consentimientos" && <Reveal><ConsentimientosTab patient={p} /></Reveal>}`.

- [ ] **Step 2: Verify** `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 3: Commit** `git add "app/app/pacientes/[id]/page.tsx" && git commit -m "feat(firma): tab Consentimientos en la ficha"`

---

## Task 10: Config — templates CRUD + service card

**Files:** Modify `app/app/configuracion/page.tsx`

- [ ] **Step 1:** En "Servicios adicionales", reemplazar el placeholder de Firma por una tarjeta "Firma electrónica" con badge de estado por plan (`plan.features.includes("firma_electronica")`). Agregar una sección/Card "Plantillas de consentimiento" (envuelta en `<Reveal>`): listar `config.consentTemplates`, editar título/cuerpo, agregar y borrar, guardando con `saveConsentTemplates(...)`. Solo `practice.config`. 

- [ ] **Step 2: Verify** `npx tsc --noEmit` + `npm run build`.

- [ ] **Step 3: Commit** `git add app/app/configuracion/page.tsx && git commit -m "feat(firma): plantillas de consentimiento + tarjeta Firma en Configuración"`

---

## Task 11: Firestore rules

**Files:** Modify `firestore.rules`

- [ ] **Step 1:** Agregar `match /signatures/{sid}` dentro de `match /clinics/{cid}` con la MISMA condición que `recoveryMonitors`/`radiographs` (`allow read, write: if isMember(cid) || isService() || isDemo(cid)`). La firma remota se escribe por el service-user → cubierta por `isService()`. READ la regla existente y replicala. 

- [ ] **Step 2:** Sanity de sintaxis (llaves/paréntesis balanceados); si hay emulador+Java, corré `npm run test:rules`.

- [ ] **Step 3: Commit** `git add firestore.rules && git commit -m "feat(firma): reglas Firestore para signatures (member/service/demo)"`

Nota: aplica tras `firebase deploy --only firestore:rules` (paso manual de Carlos).

---

## Task 12: Final verification

- [ ] **Step 1:** `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run && npm run build` → todo verde, build EXIT 0.
- [ ] **Step 2: Smoke** (con `npm run dev`): `curl -s "http://localhost:3100/api/firmar?cid=cl_demo&token=inexistente"` → `{ ok:false }` 404 (token inválido, no filtra nada). `GET /firmar/cl_demo/inexistente` (página) → carga con mensaje "no disponible".
- [ ] **Step 3:** Seguir `superpowers:finishing-a-development-branch` para mergear a `main`.

---

## Self-Review

- **Cobertura del spec:** plantillas+seed (T1), helpers token/canSign/validate (T2), gating (T3), pad (T4), store+templates (T5), ruta pública (T6), página pública (T7), tab+QR+imprimir (T8), ficha (T9), config CRUD+tarjeta (T10), reglas (T11), verificación (T12). Pad reusado en T7 y T8. Anular, imprimir, disclaimer legal en T8.
- **Placeholders:** helpers puros (T2/T3) con test+código completos; la ruta pública (T6) especifica la lógica de seguridad (validate+canSign+no-reenum) y delega el mecanismo service-side a "como reservas" (el agente lo lee). UI (T4/T7/T8/T10) con requisitos detallados (patrón validado en sub-proyecto A).
- **Consistencia de tipos:** `SignatureDoc`/`ConsentTemplate`/`SignatureStatus` (T1) usados igual en T2/T5/T6/T7/T8; `newSignToken`/`canSign`/`validateSignPayload` (T2) consumidos en T6/T8; acciones `addSignature/updateSignature/deleteSignature`/`saveConsentTemplates` (T5) usadas en T8/T10; `SignaturePad` (T4) en T7/T8.
