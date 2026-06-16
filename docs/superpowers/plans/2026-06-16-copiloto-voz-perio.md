# Copiloto de Voz Perio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El dentista dicta el periodontograma pieza por pieza (push-to-talk); Gemini parsea las 6 profundidades + sangrados + movilidad; un validador puro descarta basura; el `PerioEditor` pinta las celdas editables; el dentista corrige y guarda.

**Architecture:** Novudent puro. Botón de voz en el `PerioEditor` existente → ruta nueva `/api/ia/perio-voz` (molde `nota-voz`: auth + rate-limit + Gemini audio→JSON) → validador puro `lib/perio-voice.ts` (TDD) → aplica a las celdas con `setPd/toggleBop/setMobility` → `save()` existente.

**Tech Stack:** Next.js + TS, vitest, Gemini (audio), MediaRecorder.

**Repo:** `NOVU` = `/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app`

**⚠ Punto crítico (precisión):** el orden de los 6 sitios que el prompt de Gemini espera DEBE coincidir EXACTO con el orden `pd[0..5]` del `PerioEditor`. La Task 1 lee las etiquetas reales del componente y las fija como constante compartida.

---

## Task 1 (clínico, TDD): validador + orden de sitios `lib/perio-voice.ts`

**Files:** Create `$NOVU/lib/perio-voice.ts`, `$NOVU/lib/perio-voice.test.ts`

- [ ] **Step 1: leer el orden de sitios real** — abrir `components/Periodontogram.tsx` y mirar cómo se etiquetan/ordenan los 6 sitios de `pd` (índices 0..5: qué sitio es cada uno — p. ej. vestibular distal/central/mesial, palatino distal/central/mesial). Anotar el orden EXACTO para reusarlo en el prompt (Task 2) y documentarlo como `SITE_ORDER` en este archivo.

- [ ] **Step 2: test que falla** (`lib/perio-voice.test.ts`)
```ts
import { describe, it, expect } from "vitest";
import { validatePerioVoice, isValidFdi } from "./perio-voice";

describe("isValidFdi", () => {
  it("acepta piezas permanentes", () => { expect(isValidFdi("16")).toBe(true); expect(isValidFdi("48")).toBe(true); });
  it("rechaza inválidas", () => { expect(isValidFdi("19")).toBe(false); expect(isValidFdi("99")).toBe(false); expect(isValidFdi("1")).toBe(false); });
});

describe("validatePerioVoice", () => {
  it("acepta un dictado válido", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2], bop: [true, false, false, true, false, false], mobility: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.tooth).toBe("16"); expect(r.record.pd).toEqual([3, 2, 4, 5, 3, 2]); expect(r.record.mobility).toBe(1); }
  });
  it("rechaza pieza inválida", () => {
    expect(validatePerioVoice({ tooth: "99", pd: [3, 2, 4, 5, 3, 2], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("rechaza pd con largo != 6", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 4], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("rechaza profundidad fuera de rango (descarta un '30' mal oído)", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 30, 5, 3, 2], bop: [false, false, false, false, false, false] }).ok).toBe(false);
  });
  it("acepta null en un sitio no medido", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, null, 4, 5, 3, 2], bop: [false, false, false, false, false, false] });
    expect(r.ok).toBe(true);
  });
  it("rechaza mobility fuera de 0-3", () => {
    expect(validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2], bop: [false, false, false, false, false, false], mobility: 5 }).ok).toBe(false);
  });
  it("normaliza bop ausente a 6 falsos", () => {
    const r = validatePerioVoice({ tooth: "16", pd: [3, 2, 4, 5, 3, 2] } as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.bop).toEqual([false, false, false, false, false, false]);
  });
});
```

- [ ] **Step 3: correr y ver fallar** — `cd "$NOVU" && npx vitest run lib/perio-voice.test.ts` → FAIL.

- [ ] **Step 4: implementar** (`lib/perio-voice.ts`)
```ts
import type { PerioToothRecord } from "./types";

/** Orden de los 6 sitios = pd[0..5] del PerioEditor (ver Step 1; ajustar si el chart difiere). */
export const SITE_ORDER = ["vestibular-distal", "vestibular-central", "vestibular-mesial", "palatino-distal", "palatino-central", "palatino-mesial"] as const;

const FDI = new Set<string>();
for (const q of [10, 20, 30, 40]) for (let i = 1; i <= 8; i++) FDI.add(String(q + i));

export function isValidFdi(t: string): boolean {
  return FDI.has(String(t).trim());
}

type Result = { ok: true; tooth: string; record: PerioToothRecord } | { ok: false; error: string };

function validPd(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 15) return NaN; // NaN = inválido (sentinela)
  return n;
}

export function validatePerioVoice(raw: any): Result {
  const tooth = String(raw?.tooth ?? "").trim();
  if (!isValidFdi(tooth)) return { ok: false, error: `Pieza inválida: ${tooth || "(vacía)"}` };
  if (!Array.isArray(raw?.pd) || raw.pd.length !== 6) return { ok: false, error: "pd debe tener 6 valores" };
  const pd: (number | null)[] = [];
  for (const v of raw.pd) {
    const n = validPd(v);
    if (Number.isNaN(n as number)) return { ok: false, error: "profundidad fuera de rango (1-15)" };
    pd.push(n);
  }
  let bop: boolean[];
  if (raw?.bop === undefined || raw?.bop === null) bop = [false, false, false, false, false, false];
  else if (Array.isArray(raw.bop) && raw.bop.length === 6) bop = raw.bop.map((x: unknown) => x === true);
  else return { ok: false, error: "bop debe tener 6 valores" };
  let mobility: PerioToothRecord["mobility"];
  if (raw?.mobility !== undefined && raw?.mobility !== null) {
    const m = Number(raw.mobility);
    if (![0, 1, 2, 3].includes(m)) return { ok: false, error: "movilidad debe ser 0-3" };
    mobility = m as 0 | 1 | 2 | 3;
  }
  return { ok: true, tooth, record: { pd, bop, ...(mobility !== undefined ? { mobility } : {}) } };
}
```

- [ ] **Step 5: correr y ver verde** — `npx vitest run lib/perio-voice.test.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 6: commit** — `git add lib/perio-voice.ts lib/perio-voice.test.ts && git commit -m "feat(perio-voz): validador puro + orden de sitios + tests"`

---

## Task 2: ruta `/api/ia/perio-voz`

**Files:** Create `$NOVU/app/api/ia/perio-voz/route.ts`

- [ ] **Step 1: leer el molde** — `app/api/ia/nota-voz/route.ts`: copiar su estructura (export const config si la tiene; `verifyIdToken` + `AuthError`; `rateLimit`/`tooManyRequests` por uid; lectura de `{ audio, mimeType }`; cap de tamaño; llamada a Gemini con audio inline; parseo del JSON sin markdown). Reusar EXACTAMENTE ese patrón.

- [ ] **Step 2: implementar** la ruta con un prompt ESTRICTO. El prompt debe:
  - Pedir que extraiga UNA pieza dental y sus mediciones del audio (en español, Paraguay).
  - FIJAR el orden de los 6 sitios = `SITE_ORDER` de `lib/perio-voice.ts` (importarlo y enumerarlo en el prompt), para que `pd[0]`..`pd[5]` caigan en el sitio correcto.
  - Devolver SOLO JSON: `{"tooth":"16","pd":[3,2,4,5,3,2],"bop":[true,false,false,true,false,false],"mobility":1,"transcript":"..."}`. `pd` usa null para sitios no dictados; `bop` 6 booleanos (true donde dijo que sangra); `mobility` 0-3 o ausente; `transcript` literal para auditoría.
  - Si es inaudible/ambiguo: `{"tooth":"","pd":[],"bop":[],"transcript":""}`.
  Devolver al cliente `{ ok: true, ...json }` (el cliente valida con `validatePerioVoice`). Mensajes de error genéricos (no filtrar detalle de Gemini), igual que nota-voz.

- [ ] **Step 3: verificar** — `npx tsc --noEmit` clean; build incluye la ruta:
```bash
npx next build 2>&1 | grep -E "perio-voz|Compiled|error" | head
```
Esperado: `✓ Compiled` y la ruta `/api/ia/perio-voz` listada. Smoke sin token → 401 (igual que las otras IA): probar tras `npx next start` con curl `-X POST .../api/ia/perio-voz` sin Authorization → 401 (o 503 si falta la key local; lo importante: NO procesa).

- [ ] **Step 4: commit** — `git add app/api/ia/perio-voz/route.ts && git commit -m "feat(perio-voz): ruta de transcripción de dictado perio (auth + rate-limit)"`

---

## Task 3: voz en el `PerioEditor`

**Files:** Modify `$NOVU/components/Periodontogram.tsx` (+ reusar el patrón de grabación de `components/NovudentIA.tsx` `VoiceNoteButton`)

- [ ] **Step 1: leer** `components/NovudentIA.tsx` `VoiceNoteButton` (cómo graba con MediaRecorder, arma base64, llama con `iaFetch`/Authorization, maneja estados idle/recording/processing/error) y el `PerioEditor` en `Periodontogram.tsx` (su estado `teeth`, `setPd/toggleBop/setMobility`, la pieza activa/seleccionada).

- [ ] **Step 2: agregar un botón "Dictar pieza"** en el `PerioEditor` (por pieza activa, o un modo dictado que resalta la pieza en foco). Al tocar: graba (MediaRecorder) → al parar (botón o auto-stop por silencio simple, lo que sea más simple y confiable) → base64 → `POST /api/ia/perio-voz` con `Authorization: Bearer` (reusar `currentIdToken` de `@/lib/firebase`, como `iaFetch`) → `validatePerioVoice(json)`:
  - si `ok`: aplicar a la pieza dictada con `setPd(tooth, i, String(pd[i]))` para i 0..5, `toggleBop` donde corresponda (cuidando el estado actual), `setMobility(tooth, String(mobility))`. Mostrar feedback ("Pieza 16 cargada ✓").
  - si `!ok`: toast/inline "No te entendí bien — repetí la pieza" (no aplica nada).
- Estados de carga + error claros. Gatear por `can(session.role, "emr.write")` (solo dentista/admin cargan perio).

- [ ] **Step 3: verificar build + qa** —
```bash
cd "$NOVU" && npx tsc --noEmit && npx next build 2>&1 | grep -E "Compiled|error" | head
lsof -ti:3100 | xargs kill -9 2>/dev/null; pkill -9 -f next-server 2>/dev/null; sleep 1
nohup npx next start -p 3100 >/tmp/n.log 2>&1 & disown
for i in $(seq 1 25); do sleep 1; curl -s -o /dev/null http://localhost:3100/login && break; done
node qa-flow.mjs 2>&1 | tail -3
```
Esperado: tsc clean, build ✓, qa-flow 🟢.

- [ ] **Step 4: commit + push** — `git add -A && git commit -m "feat(perio-voz): dictado por voz en el PerioEditor" && git push origin <branch>`

---

## Task 4: validación E2E (interactivo)

- [ ] Abrir el periodontograma de un paciente, modo dictado, decir "pieza 16: 3 2 4 5 3 2, sangra mesial" → verificar que los 6 valores caen en los sitios correctos de la pieza 16 y el sangrado en el sitio dicho.
- [ ] Decir un valor absurdo ("pieza 16, treinta") → no se aplica, pide repetir.
- [ ] Corregir una celda a mano y guardar → la sesión queda guardada (chart + %BOP).

---

## Self-review

**Cobertura del spec:** validador puro + orden de sitios → Task 1 ✓; ruta perio-voz (auth/rate-limit/prompt) → Task 2 ✓; voz en el PerioEditor (graba→valida→pinta→corrige) → Task 3 ✓; seguridad clínica (validador descarta fuera de rango; error no corrompe) → Task 1 + Task 3 ✓; guardado con save() existente → Task 3 ✓; E2E → Task 4 ✓.

**Consistencia de tipos:** `SITE_ORDER` (Task 1) se reusa en el prompt (Task 2). `validatePerioVoice` (Task 1) consume el JSON de la ruta (Task 2) y su salida `{tooth, record}` alimenta `setPd/toggleBop/setMobility` (Task 3). `PerioToothRecord` (pd[6], bop[6], mobility) consistente en todo.

**Sin placeholders:** el núcleo clínico (validador) lleva código completo + tests; ruta y UI con archivos exactos + el patrón a reusar (nota-voz / VoiceNoteButton) + verificación por build/qa. El orden de sitios se ancla leyendo el componente real (Task 1 Step 1), que es el punto crítico de precisión.
