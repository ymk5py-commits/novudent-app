# Monitor de Recuperación Post-op — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tras un procedimiento quirúrgico, el bot contacta al paciente a 24/48/72h, triajea la respuesta (reglas duras + IA, la peor de ambas) y, ante una posible complicación, alerta al doctor con prioridad roja (dashboard + WhatsApp).

**Architecture:** Reusa el patrón outbox Botika ya validado. Novudent guarda un `RecoveryMonitor` con 3 touchpoints y refleja resultados; Botika materializa los touchpoints vencidos en tareas `postop`, envía por WhatsApp y triajea las respuestas. Una sola feature, dos tracks acoplados por el contrato outbox Firestore.

**Tech Stack:** Novudent: Next.js + TS, Firebase, **vitest** (nuevo, para los núcleos puros). Botika: Vercel serverless JS, **vitest** (ya existe), Gemini.

**Repos:**
- `NOVU` = `/Users/croman/Desktop/AGENCIA CROMAN/PAGINAS WEB/NOVUM/novudent-app`
- `BOT` = `/Users/croman/Downloads/botika`

---

## Mapa de archivos

**Novudent (`$NOVU`)**
- `lib/types.ts` (mod) — `User.phone?`, `Procedure.surgical?`, `OutboxTaskType` += `postop|postop_alert`, `OutboxResult` += `severity|pain|summary`, `RecoveryTouchpoint`, `RecoveryMonitor`, `DB.recoveryMonitors`.
- `lib/recovery.ts` (nuevo) — helpers puros: `SURGICAL_CPTS`, `isSurgicalProcedure`, `buildMonitor`, `worstSeverity`. **TDD.**
- `lib/recovery.test.ts` (nuevo) — tests vitest de los helpers.
- `package.json` (mod) — devDep `vitest` + script `test`.
- `firestore.rules` (mod) — subcolección `recoveryMonitors`.
- `test/firestore-rules.test.mjs` (mod) — acceso a `recoveryMonitors`.
- `lib/store.tsx` (mod) — `addRecoveryMonitor`, `resolveRecoveryMonitor`, `reflectOutbox` rama `postop`, carga + listener.
- `components/RecoveryCard.tsx` (nuevo) — bloque "Recuperación" en la ficha + sugerencia/botón de activación.
- `app/app/pacientes/[id]/page.tsx` (mod) — montar `RecoveryCard`.
- `app/app/page.tsx` (mod) — tarjeta roja en "Tareas críticas" para monitores escalados.
- `app/app/configuracion/page.tsx` (mod) — campo teléfono del doctor en el form de usuario.

**Botika (`$BOT`)**
- `api/_lib/postop-triage.js` (nuevo) — `triagePostop(text, declaredPain)` puro: reglas duras + merge. **TDD.**
- `api/_lib/postop-triage.test.js` (nuevo) — tests vitest (casos clínicos).
- `api/_lib/novudent.js` (mod) — rama `postop` en `detectNovudentOutcome` (triaje puro + Gemini) + `buildPostopOpening`.
- `api/cron-reminders.js` (mod) — materializar touchpoints vencidos + enviar `postop` + procesar `postop_alert`.

---

## Task 1: Novudent — vitest + tipos del dominio

**Files:**
- Modify: `$NOVU/package.json`
- Modify: `$NOVU/lib/types.ts`

- [ ] **Step 1: instalar vitest**

```bash
cd "$NOVU" && npm install -D vitest
```
Agregar a `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: agregar los tipos** (en `lib/types.ts`)

Añadir a `interface User` (junto a `mustChangePassword?`):
```ts
  /** WhatsApp del doctor para la alerta roja del monitor de recuperación */
  phone?: string;
```
Añadir a `interface Procedure`:
```ts
  /** Marca el arancel como quirúrgico (sugiere monitor de recuperación post-op) */
  surgical?: boolean;
```
Extender los tipos de outbox:
```ts
export type OutboxTaskType = "confirmar_cita" | "nps" | "cobranza" | "reagendar" | "postop" | "postop_alert";
```
Añadir a `interface OutboxResult` (los campos que escribe el triaje):
```ts
  severity?: "verde" | "amarillo" | "rojo";
  pain?: number;     // 0-10
  summary?: string;  // resumen IA de 1 línea
```
Añadir los nuevos tipos + `DB.recoveryMonitors`:
```ts
export interface RecoveryTouchpoint {
  offsetHours: 24 | 48 | 72;
  dueAt: string;
  status: "pendiente" | "enviado" | "respondido" | "vencido";
  severity?: "verde" | "amarillo" | "rojo";
  pain?: number;
  reply?: string;
  summary?: string;
  repliedAt?: string;
}
export interface RecoveryMonitor {
  id: string;
  clinicId: string;
  patientId: string;
  dentistId: string;
  procedure: string;
  startedAt: string;
  touchpoints: RecoveryTouchpoint[];
  status: "activo" | "completado" | "escalado";
  worstSeverity?: "verde" | "amarillo" | "rojo";
  alertedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}
```
En `interface DB` añadir: `recoveryMonitors: RecoveryMonitor[];`

- [ ] **Step 3: verificar typecheck**

Run: `cd "$NOVU" && npx tsc --noEmit`
Expected: PASS (puede fallar en seed.ts por falta de `recoveryMonitors` en el DB seed — se arregla en Step 4).

- [ ] **Step 4: agregar `recoveryMonitors: []` al seed**

En `lib/seed.ts`, dentro del objeto que devuelve `buildSeed()`, añadir `recoveryMonitors: [],` junto a `outbox: [...]`.
Run: `cd "$NOVU" && npx tsc --noEmit` → Expected: PASS.

- [ ] **Step 5: commit**

```bash
cd "$NOVU" && git add -A && git commit -m "feat(recovery): tipos del monitor post-op + vitest"
```

---

## Task 2: Novudent — helpers puros `lib/recovery.ts` (TDD)

**Files:**
- Create: `$NOVU/lib/recovery.ts`
- Create: `$NOVU/lib/recovery.test.ts`

- [ ] **Step 1: test que falla** (`lib/recovery.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { isSurgicalProcedure, buildMonitor, worstSeverity, SURGICAL_CPTS } from "./recovery";

describe("isSurgicalProcedure", () => {
  it("marca exodoncia (D7140) como quirúrgica", () => {
    expect(isSurgicalProcedure({ cpt: "D7140", description: "Exodoncia", price: 0 } as any)).toBe(true);
  });
  it("respeta el flag surgical explícito sobre el CPT", () => {
    expect(isSurgicalProcedure({ cpt: "D0120", description: "Consulta", price: 0, surgical: true } as any)).toBe(true);
    expect(isSurgicalProcedure({ cpt: "D7140", description: "x", price: 0, surgical: false } as any)).toBe(false);
  });
  it("no quirúrgica una consulta común", () => {
    expect(isSurgicalProcedure({ cpt: "D0120", description: "Consulta", price: 0 } as any)).toBe(false);
  });
});

describe("buildMonitor", () => {
  it("crea 3 touchpoints a +24/48/72h desde now", () => {
    const now = new Date("2026-06-16T10:00:00.000Z");
    const m = buildMonitor({ id: "m1", clinicId: "c", patientId: "p", dentistId: "d", procedure: "Exodoncia (D7140)", now });
    expect(m.touchpoints.map((t) => t.offsetHours)).toEqual([24, 48, 72]);
    expect(m.touchpoints[0].dueAt).toBe("2026-06-17T10:00:00.000Z");
    expect(m.touchpoints[2].dueAt).toBe("2026-06-19T10:00:00.000Z");
    expect(m.status).toBe("activo");
    expect(m.touchpoints.every((t) => t.status === "pendiente")).toBe(true);
  });
});

describe("worstSeverity", () => {
  it("rojo gana sobre amarillo y verde", () => {
    expect(worstSeverity([{ severity: "verde" }, { severity: "rojo" }, { severity: "amarillo" }] as any)).toBe("rojo");
  });
  it("undefined si no hay severidades", () => {
    expect(worstSeverity([{}, {}] as any)).toBeUndefined();
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `cd "$NOVU" && npx vitest run lib/recovery.test.ts`
Expected: FAIL ("Cannot find module './recovery'").

- [ ] **Step 3: implementar `lib/recovery.ts`**

```ts
import type { Procedure, RecoveryMonitor, RecoveryTouchpoint } from "./types";

/** CPTs quirúrgicos por default (el dentista puede marcar otros con surgical) */
export const SURGICAL_CPTS = new Set(["D7140", "D7210", "D3310", "D3320", "D3330", "D6010"]);

export function isSurgicalProcedure(p: Pick<Procedure, "cpt" | "surgical">): boolean {
  if (typeof p.surgical === "boolean") return p.surgical; // el flag explícito manda
  return SURGICAL_CPTS.has(p.cpt);
}

const SEV_RANK = { verde: 0, amarillo: 1, rojo: 2 } as const;

export function worstSeverity(
  tps: Pick<RecoveryTouchpoint, "severity">[]
): RecoveryTouchpoint["severity"] | undefined {
  const sevs = tps.map((t) => t.severity).filter(Boolean) as ("verde" | "amarillo" | "rojo")[];
  if (!sevs.length) return undefined;
  return sevs.reduce((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a));
}

export function buildMonitor(args: {
  id: string; clinicId: string; patientId: string; dentistId: string;
  procedure: string; now: Date;
}): RecoveryMonitor {
  const offsets: (24 | 48 | 72)[] = [24, 48, 72];
  const touchpoints: RecoveryTouchpoint[] = offsets.map((offsetHours) => ({
    offsetHours,
    dueAt: new Date(args.now.getTime() + offsetHours * 3600 * 1000).toISOString(),
    status: "pendiente",
  }));
  return {
    id: args.id, clinicId: args.clinicId, patientId: args.patientId, dentistId: args.dentistId,
    procedure: args.procedure, startedAt: args.now.toISOString(), touchpoints, status: "activo",
  };
}
```

- [ ] **Step 4: correr y ver verde**

Run: `cd "$NOVU" && npx vitest run lib/recovery.test.ts`
Expected: PASS (los 6 tests).

- [ ] **Step 5: commit**

```bash
cd "$NOVU" && git add lib/recovery.ts lib/recovery.test.ts && git commit -m "feat(recovery): helpers puros buildMonitor/isSurgical/worstSeverity + tests"
```

---

## Task 3: Novudent — Firestore rules `recoveryMonitors`

**Files:**
- Modify: `$NOVU/firestore.rules`
- Modify: `$NOVU/test/firestore-rules.test.mjs`

- [ ] **Step 1: agregar el test que falla** (en `test/firestore-rules.test.mjs`, junto a los demás `test(...)`)

```js
test("recoveryMonitors: un miembro lee/escribe los de su clínica; otra clínica NO", async () => {
  await assertSucceeds(setDoc(doc(authed("dentA"), "clinics/clA/recoveryMonitors/m1"), { id: "m1", patientId: "p1" }));
  await assertFails(getDoc(doc(authed("adminA"), "clinics/clB/recoveryMonitors/x")));
});
```

- [ ] **Step 2: agregar la regla** (en `firestore.rules`, junto a `slotLocks`)

```
      // Monitor de recuperación post-op (lo escriben miembros y el service user)
      match /recoveryMonitors/{docId} { allow read, write: if isMember(cid) || isService() || isDemo(cid); }
```

- [ ] **Step 3: verificar (si hay Java) o saltar**

Run: `cd "$NOVU" && npm run test:rules` (si hay Java) → Expected: el test nuevo PASS.
Si no hay Java: saltar — se valida en el deploy. Confirmar al menos que el archivo `firestore.rules` parsea visualmente (estructura de llaves correcta).

- [ ] **Step 4: commit**

```bash
cd "$NOVU" && git add firestore.rules test/firestore-rules.test.mjs && git commit -m "feat(recovery): regla Firestore recoveryMonitors + test"
```

---

## Task 4: Novudent — store (crear monitor + reflejar `postop`)

**Files:**
- Modify: `$NOVU/lib/store.tsx`

- [ ] **Step 1: cargar `recoveryMonitors` en `loadFirestore`**

En `loadFirestore`, agregar `recoveryMonitors` al `Promise.all` de `col(...)` y al objeto `db`:
```ts
// en el array de col(...): col("recoveryMonitors")
recoveryMonitors: recoveryMonitors.docs.map((d) => d.data() as RecoveryMonitor),
```
(y en modo local/seed ya viene `[]` de Task 1 Step 4). Importar `RecoveryMonitor` arriba.

- [ ] **Step 2: extender `reflectOutbox` con la rama `postop`** (en la función `reflectOutbox`, antes del `return`)

```ts
  if (task.type === "postop" && r.severity && task.refId) {
    // refId = `${monitorId}#${offsetHours}` (lo setea Botika al materializar)
    const [monitorId, offsetStr] = String(task.refId).split("#");
    const mon = next.recoveryMonitors.find((m) => m.id === monitorId);
    if (mon) {
      const tps = mon.touchpoints.map((tp) =>
        String(tp.offsetHours) === offsetStr && tp.status !== "respondido"
          ? { ...tp, status: "respondido" as const, severity: r.severity, pain: r.pain, summary: r.summary, reply: r.comment, repliedAt: r.at }
          : tp
      );
      const worst = worstSeverity(tps);
      const escalated = tps.some((t) => t.severity === "rojo");
      const allDone = tps.every((t) => t.status === "respondido" || t.status === "vencido");
      const up: RecoveryMonitor = {
        ...mon, touchpoints: tps, worstSeverity: worst,
        status: escalated ? "escalado" : allDone ? "completado" : "activo",
        ...(escalated && !mon.alertedAt ? { alertedAt: r.at } : {}),
      };
      next = { ...next, recoveryMonitors: next.recoveryMonitors.map((m) => (m.id === up.id ? up : m)) };
      saves.push(["recoveryMonitors", up.id, up]);
      // si escaló por primera vez, encolar la alerta al doctor
      if (escalated && !mon.alertedAt) {
        const dentist = next.users.find((u) => u.id === mon.dentistId);
        const pat = next.patients.find((p) => p.id === mon.patientId);
        if (dentist?.phone) {
          const alertId = `postopalert_${monitorId}`;
          const alert = {
            id: alertId, clinicId: mon.clinicId, type: "postop_alert" as const,
            patientId: mon.patientId, phone: dentist.phone,
            message: `🔴 ALERTA recuperación: ${pat ? pat.firstName + " " + pat.lastName : "paciente"} reporta posible complicación tras ${mon.procedure}. "${(r.summary || r.comment || "").slice(0, 140)}". Contactá al paciente.`,
            refId: monitorId, status: "pendiente" as const, createdAt: r.at, createdBy: "Monitor recuperación",
          };
          saves.push(["outbox", alertId, alert]);
        }
      }
    }
  }
```
Importar `worstSeverity` de `./recovery` y `RecoveryMonitor` de `./types` arriba.

- [ ] **Step 3: agregar acciones al `Ctx`** (interfaz + value): `addRecoveryMonitor` y `resolveRecoveryMonitor`

En la interfaz `Ctx`:
```ts
  addRecoveryMonitor: (m: RecoveryMonitor) => void;
  resolveRecoveryMonitor: (id: string, by: string) => void;
```
En el `value`:
```ts
      addRecoveryMonitor: (m) => {
        persist({ ...db, recoveryMonitors: [m, ...db.recoveryMonitors] });
        fsSave("recoveryMonitors", m.id, m);
      },
      resolveRecoveryMonitor: (id, by) => {
        const mon = db.recoveryMonitors.find((m) => m.id === id);
        if (!mon) return;
        const up = { ...mon, status: "completado" as const, resolvedAt: new Date().toISOString(), resolvedBy: by };
        persist({ ...db, recoveryMonitors: db.recoveryMonitors.map((m) => (m.id === id ? up : m)) });
        fsSave("recoveryMonitors", id, up);
      },
```
Añadir `recoveryMonitors` al listener de outbox NO hace falta (el listener ya re-refleja). Pero agregar un listener/getDocs de `recoveryMonitors` si se quiere tiempo real (v1: se cargan en loadFirestore + se actualizan vía reflectOutbox del listener de outbox; suficiente).

- [ ] **Step 4: verificar**

Run: `cd "$NOVU" && npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
cd "$NOVU" && git add lib/store.tsx && git commit -m "feat(recovery): store crea monitor + refleja postop + encola alerta roja"
```

---

## Task 5: Novudent — UI (bloque en la ficha + activación + tarjeta roja en dashboard)

**Files:**
- Create: `$NOVU/components/RecoveryCard.tsx`
- Modify: `$NOVU/app/app/pacientes/[id]/page.tsx`
- Modify: `$NOVU/app/app/page.tsx`
- Modify: `$NOVU/app/app/configuracion/page.tsx`

- [ ] **Step 1: `components/RecoveryCard.tsx`** — bloque "Recuperación"

Componente que recibe `patient` y, del store, los `recoveryMonitors` de ese paciente. Muestra:
- Si NO hay monitor activo y el paciente tuvo un procedimiento quirúrgico reciente (heurística: existe alguna nota/cita con CPT en `SURGICAL_CPTS`, o siempre): botón **"Activar monitor de recuperación"** → `addRecoveryMonitor(buildMonitor({ id: 'rm_'+Date.now(), clinicId, patientId, dentistId: session.userId, procedure, now: new Date() }))`.
- Si hay monitor: timeline de los 3 touchpoints con semáforo (verde/amarillo/rojo/gris-pendiente), dolor y `summary`; botón "Marcar resuelto" → `resolveRecoveryMonitor(id, session.name)`.

Usar tonos del design system (`state-ok/warn/err`) y `Card` de `@/components/ui`. Gateado por `can(session.role, "emr.write")` (dentista/admin activan).

- [ ] **Step 2: montar en la ficha** (`app/app/pacientes/[id]/page.tsx`)

Importar y renderizar `<RecoveryCard patient={p} />` dentro del bloque de la ficha (junto a Periodoncia/Ortodoncia).

- [ ] **Step 3: tarjeta roja en el dashboard** (`app/app/page.tsx`)

En el cómputo de `criticalTasks`, agregar:
```ts
    ...db.recoveryMonitors
      .filter((m) => m.status === "escalado" && !m.resolvedAt)
      .map((m) => {
        const p = db.patients.find((x) => x.id === m.patientId);
        return {
          icon: AlertTriangle, tone: "bg-state-errbg text-state-err",
          label: `🔴 Recuperación: ${p ? p.firstName + " " + p.lastName : "paciente"} reporta posible complicación`,
          hint: m.touchpoints.find((t) => t.severity === "rojo")?.summary || "Revisar y contactar",
          href: `/app/pacientes/${m.patientId}`,
        };
      }),
```
(insertarlo en el array `criticalTasks` antes del `.filter(Boolean)`).

- [ ] **Step 4: teléfono del doctor en Configuración** (`app/app/configuracion/page.tsx`)

En el form "Agregar usuario" (`NewUser`), agregar un campo opcional **Teléfono (WhatsApp)** que setee `phone` en el `User` creado (pasarlo por `createTeamUser` → extender su firma con `phone?`). Mostrar el teléfono en la lista de usuarios. (Para usuarios existentes, se puede editar vía `upsertUser`.)

- [ ] **Step 5: verificar build + qa visual**

Run:
```bash
cd "$NOVU" && npx tsc --noEmit && npx next build 2>&1 | grep -E "Compiled|error" | head
```
Expected: "✓ Compiled successfully".
Luego levantar y correr qa-flow para no regresionar (matar server viejo primero):
```bash
cd "$NOVU" && lsof -ti:3100 | xargs kill -9 2>/dev/null; pkill -9 -f next-server; nohup npx next start -p 3100 >/tmp/n.log 2>&1 & sleep 5; node qa-flow.mjs | tail -3
```
Expected: 🟢 Flujo completo sin errores.

- [ ] **Step 6: commit + push**

```bash
cd "$NOVU" && git add -A && git commit -m "feat(recovery): UI ficha + tarjeta roja dashboard + teléfono doctor" && git push origin main
```

---

## Task 6: Botika — motor de triaje puro `postop-triage.js` (TDD)

**Files:**
- Create: `$BOT/api/_lib/postop-triage.js`
- Create: `$BOT/api/_lib/postop-triage.test.js`

- [ ] **Step 1: test que falla** (`api/_lib/postop-triage.test.js`)

```js
import { describe, it, expect } from "vitest";
import { redFlag, mergeSeverity } from "./postop-triage.js";

describe("redFlag (reglas duras)", () => {
  it("sangrado que no para → rojo", () => {
    expect(redFlag("me sangra mucho y no para")).toBe("rojo");
  });
  it("fiebre → rojo", () => {
    expect(redFlag("tengo fiebre de 38.5")).toBe("rojo");
  });
  it("dificultad para respirar/tragar → rojo", () => {
    expect(redFlag("no puedo tragar bien")).toBe("rojo");
  });
  it("pus/secreción → rojo", () => {
    expect(redFlag("sale como pus de la herida")).toBe("rojo");
  });
  it("molestia leve → null (sin bandera dura)", () => {
    expect(redFlag("un poco de dolor nomás, ya casi nada")).toBeNull();
  });
});

describe("mergeSeverity (peor de las dos, nunca baja un rojo duro)", () => {
  it("regla rojo gana aunque la IA diga verde", () => {
    expect(mergeSeverity("rojo", "verde")).toBe("rojo");
  });
  it("sin regla, manda la IA", () => {
    expect(mergeSeverity(null, "amarillo")).toBe("amarillo");
  });
  it("default verde si no hay nada", () => {
    expect(mergeSeverity(null, null)).toBe("verde");
  });
});
```

- [ ] **Step 2: correr y ver fallar**

Run: `cd "$BOT" && npx vitest run api/_lib/postop-triage.test.js`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar `api/_lib/postop-triage.js`**

```js
// Reglas duras de triaje post-op (es). Priman SIEMPRE sobre la IA: un falso
// negativo clínico es el riesgo a evitar. Devuelve "rojo" o null.
const RED_PATTERNS = [
  /sangr\w*\s+(much|abundante|que no para|sin parar|no para)/i,
  /no\s+(deja|para)\s+de\s+sangrar/i,
  /fiebre|temperatura\s+(alta|de\s*3[89])|3[89](\.\d)?\s*°?\s*c/i,
  /\bpus\b|secrec\w+|supura/i,
  /no\s+puedo\s+(tragar|respirar|abrir)/i,
  /dificultad\s+para\s+(tragar|respirar)/i,
  /hinchaz\w+\s+(crece|empeora|cada vez)/i,
];

export function redFlag(text) {
  const t = String(text || "");
  return RED_PATTERNS.some((re) => re.test(t)) ? "rojo" : null;
}

const RANK = { verde: 0, amarillo: 1, rojo: 2 };
export function mergeSeverity(ruleSeverity, aiSeverity) {
  const cands = [ruleSeverity, aiSeverity].filter(Boolean);
  if (!cands.length) return "verde";
  return cands.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}
```

- [ ] **Step 4: correr y ver verde**

Run: `cd "$BOT" && npx vitest run api/_lib/postop-triage.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: commit**

```bash
cd "$BOT" && git add api/_lib/postop-triage.js api/_lib/postop-triage.test.js && git commit -m "feat(novudent): motor de triaje post-op (reglas duras + merge) + tests"
```

---

## Task 7: Botika — rama `postop` en `detectNovudentOutcome` + opening

**Files:**
- Modify: `$BOT/api/_lib/novudent.js`

- [ ] **Step 1: importar el triaje + agregar `buildPostopOpening`**

Arriba de `novudent.js`:
```js
import { redFlag, mergeSeverity } from './postop-triage.js';
```
Función de mensaje (junto a las otras de opening):
```js
export function buildPostopOpening(paciente, procedimiento, horas) {
  return `Hola ${paciente} 👋 Pasaron ${horas}h de tu ${procedimiento}. ¿Cómo venís con la recuperación? ` +
    `Contame del 0 al 10 cuánto dolor tenés y si notás algo raro (sangrado, hinchazón, fiebre). ` +
    `\n\n⚠️ Si tenés sangrado que no para, fiebre alta o dificultad para respirar/tragar, no esperes: ` +
    `comunicate con la clínica o acudí a una guardia.`;
}
```

- [ ] **Step 2: agregar la rama `postop` en `detectNovudentOutcome`**

Dentro de `detectNovudentOutcome(task, text)` (sigue el patrón de las ramas `confirmar_cita`/`nps`):
```js
  if (task.type === 'postop') {
    const rule = redFlag(text);
    let aiSeverity = null, pain = null, summary = '';
    try {
      const ai = await classifyPostop(text); // Gemini: { severity, pain, summary }
      aiSeverity = ai.severity; pain = ai.pain; summary = ai.summary;
    } catch (_) { /* si la IA falla, la regla manda */ }
    const severity = mergeSeverity(rule, aiSeverity);
    return { severity, pain: pain ?? declaredPain(text), summary: summary || text.slice(0, 140), comment: text, at: new Date().toISOString() };
  }
```
Helper `declaredPain` (extrae "X/10" o "dolor X" del texto) y `classifyPostop` (llama a Gemini con un prompt estricto que devuelve JSON `{severity, pain, summary}`; reusar el patrón de llamada a Gemini que ya existe en el repo para clasificar). Si no hay `GEMINI`/`KIMI` configurado, `classifyPostop` lanza y la regla dura sigue cubriendo el caso peligroso.

- [ ] **Step 3: test de integración del triaje** (extender `postop-triage.test.js` o un test nuevo)

```js
it("caso peligroso: aunque la IA no responda, la regla dura escala", () => {
  // simula classifyPostop fallando → severity = redFlag
  expect(mergeSeverity(redFlag("me sangra mucho, no para"), null)).toBe("rojo");
});
```
Run: `cd "$BOT" && npx vitest run api/_lib/postop-triage.test.js` → PASS.

- [ ] **Step 4: verificar suite Botika**

Run: `cd "$BOT" && npm test 2>&1 | tail -15`
Expected: todos los tests PASS (incluidos los existentes).

- [ ] **Step 5: commit**

```bash
cd "$BOT" && git add api/_lib/novudent.js && git commit -m "feat(novudent): triaje postop en detectNovudentOutcome + opening con línea de seguridad"
```

---

## Task 8: Botika — cron: materializar touchpoints + enviar + alerta

**Files:**
- Modify: `$BOT/api/cron-reminders.js` (job `novudent-outbox`)

- [ ] **Step 1: materializar touchpoints vencidos**

En el job `novudent-outbox`, por cada link de clínica, además de pollear la outbox: leer `clinics/{cid}/recoveryMonitors` con `status == "activo"`, y por cada touchpoint `status: "pendiente"` con `dueAt <= now`: crear una tarea outbox `postop` con `refId = ${monitorId}#${offsetHours}`, `phone` = teléfono del paciente (del monitor/paciente), `message = buildPostopOpening(...)`, y marcar el touchpoint `status: "enviado"` (patch del monitor). Usar los helpers REST de `_lib/novudent.js` (listCollection/setDocument/patch) con el service user.

- [ ] **Step 2: procesar `postop_alert`**

Las tareas `postop_alert` (las encola Novudent al escalar) se envían como cualquier opening: WhatsApp al `phone` (del doctor) con el `message`. Reusar el mismo path de envío del cron (YCloud del tenant).

- [ ] **Step 3: verificar suite + smoke local**

Run: `cd "$BOT" && npm test 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 4: commit + push (ambos repos)**

```bash
cd "$BOT" && git add api/cron-reminders.js && git commit -m "feat(novudent): cron materializa touchpoints postop + procesa alerta al doctor" && git push origin main
```

---

## Task 9: Validación E2E (manual + curl)

- [ ] **Step 1: datos de prueba**

Usar la clínica linkeada de la validación previa (con dentista + Botika conectado). En la ficha de un paciente con un WhatsApp real, activar el monitor (botón). Verificar en Firestore que se creó `recoveryMonitors/{id}` con 3 touchpoints.

- [ ] **Step 2: forzar el primer toque**

Para no esperar 24h, setear manualmente el `dueAt` del primer touchpoint a "ahora" (o agregar un parámetro de test). Disparar el cron. **Gate:** llega el WhatsApp empático al número de prueba.

- [ ] **Step 3: probar el triaje rojo**

Responder con un caso peligroso ("me sangra mucho y no para, tengo fiebre"). **Gate:** a la siguiente corrida del cron, el monitor pasa a `escalado`, aparece la **tarjeta roja en el dashboard** de Novudent, y (si el dentista tiene `phone`) llega el **WhatsApp de alerta al doctor**.

- [ ] **Step 4: probar el triaje verde**

Responder "todo bien, casi no me duele". **Gate:** el touchpoint queda `verde`, sin alerta.

- [ ] **Step 5: documentar**

Anotar resultados; si algún gate falla → Task F (TDD) del plan de validación general.

---

## Self-review

**Cobertura del spec:**
- Modelo de datos (RecoveryMonitor, postop, User.phone, Procedure.surgical) → Task 1. ✓
- Helpers (buildMonitor/isSurgical/worstSeverity) → Task 2. ✓
- Regla Firestore recoveryMonitors → Task 3. ✓
- Disparador híbrido + activación → Task 5 (RecoveryCard) + isSurgical (Task 2). ✓
- Reflejo + escalada + alerta → Task 4. ✓
- UI ficha + tarjeta roja + teléfono doctor → Task 5. ✓
- Triaje reglas duras + IA (la peor) → Tasks 6-7. ✓
- Línea de seguridad clínica → Task 7 (buildPostopOpening). ✓
- Cron materializa + envía + alerta → Task 8. ✓
- E2E → Task 9. ✓

**Consistencia de tipos:** `refId = monitorId#offsetHours` se setea en Task 8 y se parsea en Task 4 (mismo formato). `OutboxResult.severity/pain/summary` (Task 1) se escriben en Task 7 y se leen en Task 4. `postop`/`postop_alert` consistentes en Tasks 1/4/7/8. ✓

**Sin placeholders:** los núcleos (helpers, triaje, reflectOutbox) llevan código completo; las tareas de UI/cron especifican archivos exactos + el código clave + verificación por build/qa (las partes mecánicas se ejecutan siguiendo el patrón existente del repo).
