# Análisis IA de Radiografías — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El profesional sube una radiografía, Gemini propone hallazgos en cajas sobre la imagen, el profesional las edita y guarda, y se genera una explicación para el paciente — replicando el "Análisis IA de radiografías" de Dentalink.

**Architecture:** Validador puro TDD (`lib/radiografia.ts`) + helper de imagen puro (`lib/image.ts`) + ruta Gemini Vision autenticada (`/api/ia/radiografia`, molde de `perio-voz`) + colección Firestore `clinics/{cid}/radiographs` (base64 redimensionado, patrón `recoveryMonitors`) + lienzo de cajas editables (`components/Radiografias.tsx`) en un tab nuevo de la ficha. Contrato `findings[]` agnóstico del modelo (pluggable a CV dedicado después).

**Tech Stack:** Next.js 14 App Router, TypeScript, Firestore (web SDK, base64), Gemini Vision (`gemini-2.5-flash`), vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-17-radiografia-ia-design.md`

**Branch:** trabajar en `feat/radiografia-ia` (no `main`) para no auto-desplegar WIP a prod. Crear al inicio.

---

## File Structure

- Create `lib/radiografia.ts` — validador puro de la respuesta de la IA (clínico, TDD).
- Create `lib/radiografia.test.ts` — tests del validador.
- Create `lib/image.ts` — `fitDimensions` (puro) + `resizeToDataUrl` (canvas, thin wrapper).
- Create `lib/image.test.ts` — tests de `fitDimensions`.
- Create `app/api/ia/radiografia/route.ts` — ruta Gemini Vision (auth + rate-limit).
- Create `components/Radiografias.tsx` — `RadiografiasTab`: subir/analizar/editar/guardar/mostrar.
- Modify `lib/types.ts` — tipos `RxKind/RxSeverity/RadiographFinding/RadiographRec` + `DB.radiographs`.
- Modify `lib/plan.ts` — feature `radiografia_ia` en Clínica + Cadena.
- Modify `lib/store.tsx` — cargar `radiographs`, default `[]`, acciones add/update/delete.
- Modify `app/app/pacientes/[id]/page.tsx` — tab `radiografias` + render.
- Modify `app/app/configuracion/page.tsx` — sección "Servicios adicionales" con la tarjeta de radiografía.
- Modify `firestore.rules` — reglas de `radiographs`.

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch**

```bash
cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app"
git checkout -b feat/radiografia-ia
```

Nota: si hay cambios sin commitear de otra tarea (polish de motion), NO los incluyas en los commits de esta feature — usá `git add` solo de los archivos de cada task.

---

## Task 1: Domain types

**Files:**
- Modify: `lib/types.ts` (agregar tipos + campo en `DB`)

- [ ] **Step 1: Add the radiograph types**

En `lib/types.ts`, cerca del bloque "Archivos clínicos del paciente" (donde está `PatientFileRec`, ~línea 318), agregar:

```ts
/* ===== Análisis IA de radiografías ===== */
export type RxKind = "panoramica" | "bitewing" | "periapical" | "otra";
export type RxSeverity = "observacion" | "leve" | "moderado" | "severo";

export interface RadiographFinding {
  id: string;
  /** Caja normalizada 0..1 sobre la imagen. */
  box: { x: number; y: number; w: number; h: number };
  label: string;
  tooth?: string;            // FDI si aplica
  severity: RxSeverity;
  note?: string;
  source: "ia" | "profesional";
}

export interface RadiographRec {
  id: string;
  patientId: string;
  kind: RxKind;
  image: string;             // data URL base64 JPEG (redimensionado)
  takenAt?: string;
  createdAt: string;
  createdBy: string;
  findings: RadiographFinding[];
  aiSummary?: string;
  patientExplanation?: string;
  aiModel?: string;
  status: "borrador" | "revisado";
  reviewedBy?: string;
  reviewedAt?: string;
}
```

- [ ] **Step 2: Add `radiographs` to the `DB` interface**

En la interfaz `DB` (~línea 447), junto a `recoveryMonitors: RecoveryMonitor[];`, agregar:

```ts
  radiographs: RadiographRec[];
```

- [ ] **Step 3: Verify it compiles**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit`
Expected: PASS (puede haber errores en `store.tsx`/seed por el campo nuevo faltante — se resuelven en Task 6; si aparecen SOLO ahí, continuar).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(radiografia): tipos de dominio RadiographRec + DB.radiographs"
```

---

## Task 2: Image dimension helper (TDD)

**Files:**
- Create: `lib/image.ts`
- Test: `lib/image.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/image.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fitDimensions } from "./image";

describe("fitDimensions", () => {
  it("no agranda si ya entra en maxDim", () => {
    expect(fitDimensions(800, 600, 1400)).toEqual({ w: 800, h: 600 });
  });
  it("escala por el lado más largo (landscape)", () => {
    expect(fitDimensions(2800, 1400, 1400)).toEqual({ w: 1400, h: 700 });
  });
  it("escala por el lado más largo (portrait)", () => {
    expect(fitDimensions(1400, 2800, 1400)).toEqual({ w: 700, h: 1400 });
  });
  it("redondea a enteros", () => {
    const r = fitDimensions(1000, 333, 500);
    expect(Number.isInteger(r.w)).toBe(true);
    expect(Number.isInteger(r.h)).toBe(true);
  });
  it("devuelve 0x0 ante dimensiones inválidas", () => {
    expect(fitDimensions(0, 100, 1400)).toEqual({ w: 0, h: 0 });
    expect(fitDimensions(NaN, 100, 1400)).toEqual({ w: 0, h: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/image.test.ts`
Expected: FAIL ("Cannot find module './image'").

- [ ] **Step 3: Write minimal implementation**

`lib/image.ts`:

```ts
/** Calcula el tamaño destino encajando el lado más largo en maxDim (sin agrandar). Puro. */
export function fitDimensions(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: 0, h: 0 };
  const longest = Math.max(w, h);
  if (longest <= maxDim) return { w: Math.round(w), h: Math.round(h) };
  const scale = maxDim / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Lee un File de imagen, lo redimensiona en canvas y devuelve un data URL JPEG.
 *  Wrapper fino sobre fitDimensions (no testeado: usa APIs del browser). */
export async function resizeToDataUrl(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<string> {
  const { maxDim = 1400, quality = 0.8 } = opts;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("Imagen inválida"));
    im.src = dataUrl;
  });
  const { w, h } = fitDimensions(img.naturalWidth, img.naturalHeight, maxDim);
  if (!w || !h) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Tamaño aproximado en bytes de un data URL base64. Puro. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor(b64.length * 0.75);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/image.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/image.ts lib/image.test.ts
git commit -m "feat(radiografia): helper de redimensionado de imagen (TDD fitDimensions)"
```

---

## Task 3: AI response validator (TDD — clinical safety)

**Files:**
- Create: `lib/radiografia.ts`
- Test: `lib/radiografia.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/radiografia.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clampBox, normalizeSeverity, validateRadiografiaAI } from "./radiografia";

describe("clampBox", () => {
  it("acepta una caja válida", () => {
    expect(clampBox({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });
  it("clampa origen fuera de rango y recorta el ancho al borde", () => {
    const b = clampBox({ x: 0.9, y: 0.2, w: 0.5, h: 0.2 });
    expect(b).not.toBeNull();
    expect(b!.x).toBe(0.9);
    expect(b!.x + b!.w).toBeLessThanOrEqual(1);
  });
  it("rechaza caja con ancho/alto no positivo o no numérico", () => {
    expect(clampBox({ x: 0.1, y: 0.1, w: 0, h: 0.2 })).toBeNull();
    expect(clampBox({ x: 0.1, y: 0.1, w: "a", h: 0.2 })).toBeNull();
    expect(clampBox(null)).toBeNull();
  });
});

describe("normalizeSeverity", () => {
  it("mantiene una severidad válida", () => {
    expect(normalizeSeverity("severo")).toBe("severo");
  });
  it("cae a 'observacion' ante basura", () => {
    expect(normalizeSeverity("urgente")).toBe("observacion");
    expect(normalizeSeverity(undefined)).toBe("observacion");
  });
});

describe("validateRadiografiaAI", () => {
  it("devuelve vacío ante basura", () => {
    expect(validateRadiografiaAI(null)).toEqual({ findings: [], summary: "", patientExplanation: "" });
    expect(validateRadiografiaAI("nope").findings).toEqual([]);
  });
  it("conserva hallazgos válidos y los marca source=ia", () => {
    const r = validateRadiografiaAI({
      findings: [{ box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label: "Caries oclusal", tooth: "16", severity: "moderado" }],
      summary: "ok",
      patientExplanation: "explicación",
    });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].source).toBe("ia");
    expect(r.findings[0].label).toBe("Caries oclusal");
    expect(r.findings[0].tooth).toBe("16");
    expect(r.summary).toBe("ok");
    expect(r.patientExplanation).toBe("explicación");
  });
  it("descarta hallazgos sin label o con caja inválida", () => {
    const r = validateRadiografiaAI({
      findings: [
        { box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, label: "" },
        { box: { x: 0.1, y: 0.1, w: 0, h: 0.2 }, label: "X" },
        { label: "sin caja" },
      ],
    });
    expect(r.findings).toHaveLength(0);
  });
  it("limita la cantidad de hallazgos a 40", () => {
    const many = Array.from({ length: 60 }, () => ({ box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, label: "C" }));
    expect(validateRadiografiaAI({ findings: many }).findings.length).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/radiografia.test.ts`
Expected: FAIL ("Cannot find module './radiografia'").

- [ ] **Step 3: Write minimal implementation**

`lib/radiografia.ts`:

```ts
import type { RadiographFinding, RxSeverity } from "./types";

const SEVERITIES: RxSeverity[] = ["observacion", "leve", "moderado", "severo"];
const MAX_FINDINGS = 40;

/** Caja normalizada 0..1 saneada, o null si es inválida. Recorta al borde. Puro. */
export function clampBox(box: any): { x: number; y: number; w: number; h: number } | null {
  if (!box || typeof box !== "object") return null;
  let x = Number(box.x), y = Number(box.y), w = Number(box.w), h = Number(box.h);
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  x = Math.min(Math.max(x, 0), 1);
  y = Math.min(Math.max(y, 0), 1);
  w = Math.min(Math.max(w, 0), 1);
  h = Math.min(Math.max(h, 0), 1);
  if (w <= 0 || h <= 0) return null;
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Severidad válida o 'observacion'. Puro. */
export function normalizeSeverity(s: any): RxSeverity {
  const v = String(s ?? "").toLowerCase().trim();
  return (SEVERITIES as string[]).includes(v) ? (v as RxSeverity) : "observacion";
}

export interface RadiografiaAIResult {
  findings: RadiographFinding[];
  summary: string;
  patientExplanation: string;
}

/** Sanea la respuesta cruda de la IA. Nunca explota ni mete basura en la ficha. Puro. */
export function validateRadiografiaAI(raw: any): RadiografiaAIResult {
  const out: RadiografiaAIResult = { findings: [], summary: "", patientExplanation: "" };
  if (!raw || typeof raw !== "object") return out;
  out.summary = String(raw.summary ?? "").slice(0, 4000);
  out.patientExplanation = String(raw.patientExplanation ?? "").slice(0, 4000);
  const arr = Array.isArray(raw.findings) ? raw.findings : [];
  let i = 0;
  for (const f of arr) {
    if (out.findings.length >= MAX_FINDINGS) break;
    if (!f || typeof f !== "object") continue;
    const box = clampBox(f.box);
    if (!box) continue;
    const label = String(f.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const tooth = f.tooth != null ? String(f.tooth).trim().slice(0, 4) : "";
    out.findings.push({
      id: `ia-${i++}`,
      box,
      label,
      severity: normalizeSeverity(f.severity),
      source: "ia",
      ...(tooth ? { tooth } : {}),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/radiografia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/radiografia.ts lib/radiografia.test.ts
git commit -m "feat(radiografia): validador puro de la respuesta IA (TDD, clinical safety)"
```

---

## Task 4: Plan feature flag (TDD)

**Files:**
- Modify: `lib/plan.ts` (agregar `radiografia_ia` a Clínica y Cadena)
- Test: `lib/plan.test.ts` (crear si no existe; si existe, agregar el `describe`)

- [ ] **Step 1: Read the current plan matrix**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && sed -n '1,80p' lib/plan.ts`
Identificá el tipo `PlanFeature` y los arrays `features` de cada plan (solo/clinica/cadena) y la función `planHas`.

- [ ] **Step 2: Write the failing test**

`lib/plan.test.ts` (agregar este `describe`; si el archivo no existe, créalo con los imports):

```ts
import { describe, it, expect } from "vitest";
import { planHas } from "./plan";

describe("radiografia_ia gating", () => {
  it("está en Clínica y Cadena", () => {
    expect(planHas("clinica", "radiografia_ia")).toBe(true);
    expect(planHas("cadena", "radiografia_ia")).toBe(true);
  });
  it("NO está en Solo", () => {
    expect(planHas("solo", "radiografia_ia")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/plan.test.ts`
Expected: FAIL (`radiografia_ia` no es un `PlanFeature` / planHas false en clinica).

- [ ] **Step 4: Add the feature**

En `lib/plan.ts`: (a) agregar `"radiografia_ia"` al union `PlanFeature`; (b) agregar `"radiografia_ia"` al array `features` de los planes **clinica** y **cadena** (NO en solo).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx vitest run lib/plan.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/plan.ts lib/plan.test.ts
git commit -m "feat(radiografia): feature de plan radiografia_ia (Clínica+Cadena, TDD)"
```

---

## Task 5: Gemini Vision route

**Files:**
- Create: `app/api/ia/radiografia/route.ts`

- [ ] **Step 1: Write the route (molde perio-voz)**

`app/api/ia/radiografia/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, AuthError } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { validateRadiografiaAI } from "@/lib/radiografia";

/**
 * Análisis IA de radiografías — Novudent IA.
 * POST { image: base64, mimeType, kind } → { ok, findings, summary, patientExplanation, aiModel }
 * La key de Gemini vive SOLO acá (server). Es apoyo, no diagnóstico.
 * Env: GEMINI_API_KEY, GEMINI_VISION_MODEL (default gemini-2.5-flash).
 */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const PROMPT = `Sos un asistente de lectura radiográfica para una clínica dental en Paraguay.
Te paso UNA radiografía dental (panorámica, bitewing o periapical). Detectá hallazgos
visibles (caries, pérdida ósea, lesión periapical, resto radicular, cálculo, etc.).

Respondé SOLO este JSON (sin markdown, sin texto extra):
{"findings":[{"box":{"x":0.12,"y":0.30,"w":0.08,"h":0.10},"label":"Caries oclusal","tooth":"16","severity":"moderado"}],
 "summary":"resumen técnico breve para el odontólogo",
 "patientExplanation":"explicación en lenguaje simple para el paciente, en español rioplatense, clara y sin alarmar"}

Reglas:
- "box": coordenadas NORMALIZADAS 0..1 sobre la imagen (x,y = esquina sup-izq; w,h = ancho/alto). Si no ubicás exacto, dá una caja aproximada.
- "label": nombre corto del hallazgo.
- "tooth": pieza FDI si la podés ubicar (ej "16"); omitir si no.
- "severity": uno de "observacion","leve","moderado","severo".
- No inventes hallazgos. Si la imagen no es una radiografía dental legible: {"findings":[],"summary":"","patientExplanation":""}.
- Esto es APOYO al diagnóstico, no reemplaza al profesional.`;

export async function POST(req: NextRequest) {
  let _user;
  try {
    _user = await verifyIdToken(req);
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 401;
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status });
  }

  const _rl = rateLimit(`ia:${_user.uid}`, { limit: 20, windowMs: 60_000 });
  if (!_rl.ok) return tooManyRequests(_rl.retryAfterSec);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY no configurada en el servidor" }, { status: 500 });
  }

  let body: { image?: string; mimeType?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const image = body.image || "";
  if (!image) return NextResponse.json({ ok: false, error: "image requerida" }, { status: 400 });
  // Acepta data URL (data:image/...;base64,XXXX) o base64 pelado.
  const b64 = image.includes(",") ? image.slice(image.indexOf(",") + 1) : image;
  if (b64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ ok: false, error: "Imagen demasiado grande (máx ~8MB)" }, { status: 413 });
  }
  const mime = String(body.mimeType || "image/jpeg").split(";")[0].trim();

  const model = process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[Radiografia] Gemini error:", data?.error?.message || res.status);
      return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
    }
    const raw: string =
      data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[Radiografia] JSON parse error. Raw:", cleaned.slice(0, 300));
      return NextResponse.json({ ok: false, error: "No se pudo interpretar el análisis. Intentá de nuevo." }, { status: 422 });
    }
    const result = validateRadiografiaAI(parsed);
    return NextResponse.json({ ok: true, ...result, aiModel: model });
  } catch (e) {
    console.error("[Radiografia] error:", e);
    return NextResponse.json({ ok: false, error: "El asistente de IA no está disponible. Probá de nuevo en unos minutos." }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit`
Expected: PASS (los errores de `store.tsx` por `radiographs` se resuelven en Task 6).

- [ ] **Step 3: Commit**

```bash
git add app/api/ia/radiografia/route.ts
git commit -m "feat(radiografia): ruta Gemini Vision /api/ia/radiografia (auth + rate-limit + validador)"
```

---

## Task 6: Store integration

**Files:**
- Modify: `lib/store.tsx` (cargar `radiographs`, default `[]`, acciones)

- [ ] **Step 1: Load the collection in `loadFirestore`**

En `lib/store.tsx`, dentro de `loadFirestore()` (~línea 96): agregar `col("radiographs")` al `Promise.all`, sumar `radiographs` al destructuring, y mapear en el objeto devuelto:

```ts
// en el Promise.all, sumar al final:  col("radiographs")
// en el destructuring, sumar al final:  , radiographs
// en el objeto devuelto, junto a recoveryMonitors:
    radiographs: radiographs.docs.map((d) => d.data() as RadiographRec),
```

Importar el tipo: agregá `RadiographRec` al import de `@/lib/types` en `store.tsx`.

- [ ] **Step 2: Default `[]` in the local/empty DB**

Buscá dónde se arma el DB local/vacío (p.ej. `loadLocal()` o un `emptyDB`/seed). Agregá `radiographs: []` para que el shape de `DB` esté completo sin Firestore.

Run para ubicarlo: `grep -nE "recoveryMonitors: \[\]|loadLocal|recoveryMonitors:" lib/store.tsx lib/seed.ts`
Agregá `radiographs: []` donde aparezca `recoveryMonitors: []`.

- [ ] **Step 3: Add store actions**

Junto a las acciones existentes (donde está `addRecoveryMonitor`/`fsSave`), agregar y exponer en el value del provider y en el tipo del contexto:

```ts
    addRadiograph: (r: RadiographRec) => {
      persist({ ...db, radiographs: [r, ...db.radiographs] });
      fsSave("radiographs", r.id, r);
    },
    updateRadiograph: (r: RadiographRec) => {
      persist({ ...db, radiographs: db.radiographs.map((x) => (x.id === r.id ? r : x)) });
      fsSave("radiographs", r.id, r);
    },
    deleteRadiograph: (id: string) => {
      persist({ ...db, radiographs: db.radiographs.filter((x) => x.id !== id) });
      fsDelete("radiographs", id);
    },
```

Agregá las tres firmas al tipo del contexto del store (donde están `addRecoveryMonitor`, etc.).

- [ ] **Step 4: Verify it compiles and tests pass**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit && npx vitest run`
Expected: PASS (tsc limpio, todos los tests verdes).

- [ ] **Step 5: Commit**

```bash
git add lib/store.tsx lib/seed.ts
git commit -m "feat(radiografia): store carga/persiste radiographs + acciones add/update/delete"
```

---

## Task 7: Radiografías UI component

**Files:**
- Create: `components/Radiografias.tsx`

- [ ] **Step 1: Write the component**

`components/Radiografias.tsx` — `RadiografiasTab({ patient })`. Requisitos:
- Gate de plan: si `!plan.features.includes("radiografia_ia")` → `<PlanLocked feature="radiografia_ia" />` (patrón de `components/PlanGate.tsx`).
- Gate RBAC: edición/guardado solo si el rol puede escribir EMR (mismo `can(...)` que usa el odontograma en la ficha — revisá `app/app/pacientes/[id]/page.tsx` para el permiso exacto, p.ej. `canWriteEmr`). Asistente: solo ver.
- Subir imagen: `<input type="file" accept="image/*">` → `resizeToDataUrl(file,{maxDim:1400,quality:0.8})` (de `@/lib/image`); si `dataUrlBytes(url) > 900_000` avisar y pedir otra. Selector de `kind`.
- "Analizar con IA": `POST /api/ia/radiografia` con `{ image, mimeType:"image/jpeg", kind }` y el header `Authorization: Bearer <idToken>` (mismo patrón que las otras llamadas IA del front — revisá `components/NovudentIA.tsx` para cómo obtienen el idToken). Respuesta → set `findings` (cada uno con `id` único, p.ej. `crypto.randomUUID()`), `aiSummary`, `patientExplanation`.
- Lienzo de cajas: contenedor `relative` con `<img>` y, encima, cada finding como `<div style={{position:'absolute', left:`${box.x*100}%`, top:`${box.y*100}%`, width:`${box.w*100}%`, height:`${box.h*100}%`}}>` con borde por severidad (observacion=azure, leve=info, moderado=warn, severo=err) y etiqueta. En modo edición: drag para mover, handle esquina para redimensionar (convertí px↔fracción usando `getBoundingClientRect()` del contenedor), botón borrar. Botón "Agregar marca" crea un finding `source:"profesional"` centrado.
- Editar finding: label (input), tooth (input FDI corto), severity (select), note (input). Editar `patientExplanation` (textarea).
- "Guardar": arma el `RadiographRec` (`status:"revisado"`, `reviewedBy=session.userId`, `reviewedAt=ISO`, `aiModel`) y llama `addRadiograph` (nuevo) o `updateRadiograph` (existente) del store.
- Lista de estudios previos del paciente (`db.radiographs.filter(r=>r.patientId===patient.id)` ordenados por `createdAt` desc) para reabrir.
- "Mostrar al paciente": toggle a una vista limpia (solo imagen + cajas + `patientExplanation`, sin controles).
- Banner disclaimer SIEMPRE visible: "Herramienta de apoyo al diagnóstico — no reemplaza el criterio del profesional tratante."
- Estilo: usar los tokens existentes (`Card`, `Badge`, clases `clinic-*`, `state-*`, `rounded-2xl`, `btn-shine`) consistente con el resto de la ficha. Sin dependencias nuevas.

Nota de fechas: usar `new Date().toISOString()` (esto es código de app, no un workflow script — `new Date()` está permitido acá).

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/Radiografias.tsx
git commit -m "feat(radiografia): componente RadiografiasTab (subir/analizar/editar cajas/guardar/mostrar)"
```

---

## Task 8: Wire the tab into the patient ficha

**Files:**
- Modify: `app/app/pacientes/[id]/page.tsx`

- [ ] **Step 1: Add the tab**

- Importá: `import { RadiografiasTab } from "@/components/Radiografias";`
- Agregá `"radiografias"` al union `Tab` (~línea 23).
- Agregá una entrada a `TABS[]` (~línea 46): `{ key: "radiografias", label: "Radiografías", icon: <ícono lucide, p.ej. ScanLine o Image> }` (importá el ícono de `lucide-react`). Colocala cerca de "odontograma"/"archivos".
- Agregá el render junto a los otros: `{tab === "radiografias" && <Reveal><RadiografiasTab patient={p} /></Reveal>}`.

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/app/pacientes/[id]/page.tsx"
git commit -m "feat(radiografia): tab Radiografías en la ficha del paciente"
```

---

## Task 9: Configuración → "Servicios adicionales"

**Files:**
- Modify: `app/app/configuracion/page.tsx`

- [ ] **Step 1: Add the section**

Agregá una sección/`Card` nueva **"Servicios adicionales"** (envuelta en `<Reveal>` como el resto de la página) con una tarjeta para "Análisis IA de radiografías": ícono, descripción breve ("Lectura asistida por IA de panorámicas, bitewing y periapicales — editable por el profesional"), y un badge de estado según el plan (`plan.features.includes("radiografia_ia") ? "Activo" : "No incluido en tu plan"`). Dejá lugar (comentario `{/* Próximamente: Firma electrónica · WhatsApp */}`) para las próximas. No agregues lógica de pago — es informativo + el gate real está en la ficha.

- [ ] **Step 2: Verify it compiles**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/app/configuracion/page.tsx
git commit -m "feat(radiografia): sección Servicios adicionales en Configuración"
```

---

## Task 10: Firestore rules

**Files:**
- Modify: `firestore.rules` (agregar `radiographs`)

- [ ] **Step 1: Add the rule**

En `firestore.rules`, dentro de `match /clinics/{cid}` junto a la regla de `recoveryMonitors`, agregar el mismo molde para `radiographs`:

```
      match /radiographs/{rid} {
        allow read: if isMember(cid);
        allow create, update, delete: if isStaffEmr(cid);  // usar el MISMO helper/condición que usa recoveryMonitors / la escritura clínica (dentista|admin)
      }
```

Importante: usar EXACTAMENTE el helper de rol que ya gobierna la escritura EMR (revisá la regla de `recoveryMonitors`/odontograma en `firestore.rules` y replicá esa condición; no inventes un helper nuevo si ya existe).

- [ ] **Step 2: Sanity check the rules syntax (si hay test de reglas)**

Run: `cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app" && ls test/firestore-rules.test.mjs 2>/dev/null && echo "hay test de reglas (corre en CI con emulador+Java)" || echo "sin test local de reglas"`
Si existe y hay emulador/Java, corré la suite; si no, verificación manual de sintaxis (paréntesis/llaves balanceadas).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(radiografia): reglas Firestore para la colección radiographs (member read, EMR write)"
```

Nota operativa: las reglas recién aplican tras `firebase deploy --only firestore:rules` (paso manual de Carlos).

---

## Task 11: Final verification

- [ ] **Step 1: Full typecheck + tests + build**

```bash
cd "/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app"
npx tsc --noEmit && npx vitest run && npm run build
```
Expected: tsc limpio, todos los tests verdes, build EXIT=0.

- [ ] **Step 2: Smoke de la ruta (sin auth → 401)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/ia/radiografia -H "Content-Type: application/json" -d '{}'
```
Expected: `401` (sin token). (Requiere `npm run dev` corriendo.)

- [ ] **Step 3: Commit any fixes and finish the branch**

Seguir `superpowers:finishing-a-development-branch` para decidir merge a `main` (auto-deploy a prod) o PR.

---

## Self-Review (completado al escribir el plan)

- **Cobertura del spec:** tipos (T1) ✓, almacenamiento+resize (T2) ✓, validador (T3) ✓, gating de plan (T4) ✓, ruta Gemini (T5) ✓, store (T6) ✓, UI lienzo+explicación+mostrar+disclaimer (T7) ✓, tab ficha (T8) ✓, Servicios adicionales (T9) ✓, reglas (T10) ✓, verificación (T11) ✓. "Mostrar al paciente", disclaimer y procedencia cubiertos en T7. Fuera de v1 (CV dedicado/DICOM/medición) correctamente NO incluido.
- **Placeholders:** los pasos de helpers puros (T2/T3/T4) traen test + código completos. T7/T6/T9/T10 describen edits sobre archivos existentes con el snippet exacto + dónde; el agente lee el archivo para el contexto circundante (patrón válido para modificaciones).
- **Consistencia de tipos:** `RadiographRec`/`RadiographFinding`/`RxSeverity` definidos en T1 y usados igual en T3/T5/T6/T7; acciones `addRadiograph/updateRadiograph/deleteRadiograph` definidas en T6 y consumidas en T7; `validateRadiografiaAI` en T3 y usada en T5; `resizeToDataUrl/dataUrlBytes/fitDimensions` en T2 y usadas en T7.
