# Diaria global como grilla — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La Diaria global de la agenda pasa a ser una grilla de casilleros de 30 minutos con una columna por profesional, con el mismo menú por espacio que la Semanal (y el profesional de la columna ya elegido), y las horas fuera del horario de atención en gris.

**Architecture:** La lógica nueva (columnas, qué cita va en qué columna, fuera de horario) va pura en `lib/agendaGrilla.ts`. `components/agenda/GrillaSemanal.tsx` se generaliza en `components/agenda/GrillaAgenda.tsx`, que recibe sus columnas: la Semanal le pasa 7 días y la Diaria global, N profesionales. `app/app/agenda/page.tsx` usa la misma grilla en las dos vistas y pasa el profesional de la columna a «Dar cita» y «Bloquear espacio».

**Tech Stack:** Next 16 (App Router) + React 19 + TypeScript, Tailwind 3.4, vitest, Playwright (e2e contra la app COMPILADA).

**Spec:** `docs/superpowers/specs/2026-10-13-agenda-diaria-global-grilla-design.md`

## Global Constraints

- Repo `/home/croman/Escritorio/CROMAN/NOVUM/novudent-app`. Rama de trabajo: `feat/agenda-diaria-global`, creada desde `docs/agenda-diaria-global` (que trae la spec y este plan). NO mergear a `main` ni hacer `git push`: eso lo decide Croman.
- Node: `export PATH=/home/croman/.nvm/versions/node/v22.22.2/bin:$PATH`.
- **Los e2e corren contra la app compilada** (`playwright.config.ts`: `next start`). Antes de cada corrida de e2e: `npm run build`. Puerto propio: `E2E_PORT=3184` (los 3152/3199/3200/3210/3211 son de otros). Si `tsc` se queja de tipos viejos en `.next/types`, volver a compilar.
- Sin dependencias nuevas.
- Textos en español rioplatense con voseo, como el resto de la app. Nada de datos reales de pacientes.
- La **Diaria (tabla), la Mensual y la Reprogramación no cambian**.
- Fuera de horario: **gris, pero se puede tocar igual** (el menú se abre; «Dar cita» ya avisa «No entra en el horario»).
- Sin `agenda.create` ni `agenda.edit`: grilla de solo lectura (sin menú, sin «+», sin quitar bloqueos), como hoy.
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Antes de dar por terminada cada tarea: `npx tsc --noEmit` y `npx vitest run` en verde.

## Review Focus

1. **Un horario mal cargado** (`desde`/`hasta` vacíos o con otro formato, `dias` que no es una lista): la grilla no puede romperse; se usa el valor por defecto de ese dato. → test en la Tarea 1.
2. **Dos profesionales con espacios a la misma hora:** cada casillero tiene un nombre accesible distinto (lleva el nombre del profesional), para el lector de pantalla y para las pruebas. → tests en las Tareas 1 y 3.
3. **Un domingo (o un día en que el profesional no atiende):** toda su columna en gris, pero el menú se abre igual (decisión 2 de la spec). → test en la Tarea 3.
4. **Muchos profesionales en el celular:** la grilla se recorre de costado dentro de su tarjeta; la página no se ensancha. → test en la Tarea 3 (`sinScrollHorizontal`).
5. **Una cita cuyo profesional no tiene columna** (filtrado por el selector, o con un rol que no es dentista): no se dibuja ni rompe nada, igual que hoy con las tarjetas. → test en la Tarea 1 (`citaEnColumna` con otro profesional).

---

### Task 1: Lógica pura de columnas, fuera de horario y etiqueta con profesional

**Files:**
- Create: `lib/agendaGrilla.ts`
- Create: `lib/agendaGrilla.test.ts`
- Modify: `lib/agendaSemana.ts` (función `tituloDeEspacio`)
- Modify: `lib/agendaSemana.test.ts` (test de `tituloDeEspacio`)

**Interfaces:**
- Consumes: `HORARIO_POR_DEFECTO`, `type Horario` de `lib/disponibilidad.ts`; `TODOS_LOS_PROFESIONALES` (`"*"`) de `lib/bloqueos.ts`; `MINUTOS_CELDA` (30) de `lib/agendaSemana.ts`; tipos `Appointment`, `AgendaBlock`, `User` de `lib/types.ts`.
- Produces (los usan las Tareas 2 y 3):
  - `interface ColumnaDeAgenda { clave: string; titulo: string; subtitulo?: string; fecha: Date; dentistId?: string; color?: string; esHoy: boolean }`
  - `columnasDeLaSemana(lunes: Date, hoy?: Date): ColumnaDeAgenda[]`
  - `columnasDelDia(fecha: Date, profesionales: readonly Pick<User, "id" | "name" | "color" | "specialty">[], hoy?: Date): ColumnaDeAgenda[]`
  - `citaEnColumna(col: ColumnaDeAgenda, a: Pick<Appointment, "start" | "dentistId">): boolean`
  - `bloqueoEnColumna(col: ColumnaDeAgenda, b: Pick<AgendaBlock, "start" | "dentistId">): boolean`
  - `fueraDeHorario(horario: Horario | undefined, fecha: Date, hora: string, paso?: number): boolean`
  - `tituloDeEspacio(fecha: Date, hora: string, profesional?: string): string` (en `lib/agendaSemana.ts`)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/agendaGrilla.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { columnasDeLaSemana, columnasDelDia, citaEnColumna, bloqueoEnColumna, fueraDeHorario } from "./agendaGrilla";

/* La grilla de la agenda (pedido de Camila, 13-oct-2026): la Semanal tiene una columna por día y la Diaria global, una por profesional.
   Acá se decide qué columnas hay, qué cita y qué bloqueo va en cada una y qué celdas caen fuera del horario de atención (se ven en gris). */

const lunes = new Date(2026, 9, 12); // lunes 12 de octubre de 2026
const iso = (d: number, hh: number, mm = 0) => new Date(2026, 9, d, hh, mm).toISOString();
const sofia = { id: "u2", name: "Dra. Sofía Benítez", color: "#0E9F6E", specialty: "Ortodoncia" };
const diego = { id: "u4", name: "Dr. Diego Martínez", color: "#0D9488", specialty: undefined };

describe("columnasDeLaSemana", () => {
  it("siete días de lunes a domingo, con el nombre corto y el número del día", () => {
    const cols = columnasDeLaSemana(lunes, new Date(2026, 9, 14, 15, 0));
    expect(cols.map((c) => `${c.titulo} ${c.subtitulo}`)).toEqual(["Lun 12", "Mar 13", "Mié 14", "Jue 15", "Vie 16", "Sáb 17", "Dom 18"]);
    expect(cols.map((c) => c.esHoy)).toEqual([false, false, true, false, false, false, false]);
    expect(cols.every((c) => c.dentistId === undefined)).toBe(true);
    expect(cols[2].fecha.getHours()).toBe(0);
    expect(new Set(cols.map((c) => c.clave)).size).toBe(7);
  });

  it("aunque el lunes venga con hora, cada columna arranca a la medianoche", () => {
    const cols = columnasDeLaSemana(new Date(2026, 9, 12, 17, 45));
    expect(cols.every((c) => c.fecha.getHours() === 0 && c.fecha.getMinutes() === 0)).toBe(true);
  });
});

describe("columnasDelDia", () => {
  it("una columna por profesional, en el orden en que llegan, con su nombre, especialidad y color", () => {
    const cols = columnasDelDia(new Date(2026, 9, 13, 11, 0), [sofia, diego], new Date(2026, 9, 13, 9, 0));
    expect(cols.map((c) => [c.clave, c.titulo, c.subtitulo, c.dentistId, c.color])).toEqual([
      ["p:u2", "Dra. Sofía Benítez", "Ortodoncia", "u2", "#0E9F6E"],
      ["p:u4", "Dr. Diego Martínez", undefined, "u4", "#0D9488"],
    ]);
    expect(cols.every((c) => c.fecha.getDate() === 13 && c.fecha.getHours() === 0 && c.esHoy)).toBe(true);
  });

  it("sin profesionales, sin columnas", () => {
    expect(columnasDelDia(lunes, [])).toEqual([]);
  });
});

describe("citaEnColumna y bloqueoEnColumna", () => {
  const [lun, mar] = columnasDeLaSemana(lunes);
  const [colSofia, colDiego] = columnasDelDia(new Date(2026, 9, 13), [sofia, diego]);

  it("Semanal: la cita va en la columna de su día, sea del profesional que sea", () => {
    expect(citaEnColumna(lun, { start: iso(12, 9), dentistId: "u4" })).toBe(true);
    expect(citaEnColumna(mar, { start: iso(12, 9), dentistId: "u4" })).toBe(false);
  });

  it("Diaria global: la cita va solo en la columna de su profesional y de ese día", () => {
    expect(citaEnColumna(colSofia, { start: iso(13, 9), dentistId: "u2" })).toBe(true);
    expect(citaEnColumna(colDiego, { start: iso(13, 9), dentistId: "u2" })).toBe(false);
    expect(citaEnColumna(colSofia, { start: iso(14, 9), dentistId: "u2" })).toBe(false);
  });

  it("una cita de un profesional que no tiene columna no va en ninguna", () => {
    const cita = { start: iso(13, 9), dentistId: "u1" };
    expect([colSofia, colDiego].some((c) => citaEnColumna(c, cita))).toBe(false);
  });

  it("un bloqueo de «Todos los profesionales» va en todas las columnas del día; uno de un profesional, solo en la suya", () => {
    expect(bloqueoEnColumna(colSofia, { start: iso(13, 12), dentistId: "*" })).toBe(true);
    expect(bloqueoEnColumna(colDiego, { start: iso(13, 12), dentistId: "*" })).toBe(true);
    expect(bloqueoEnColumna(colDiego, { start: iso(13, 12), dentistId: "u2" })).toBe(false);
    expect(bloqueoEnColumna(colSofia, { start: iso(14, 12), dentistId: "*" })).toBe(false);
    expect(bloqueoEnColumna(mar, { start: iso(13, 12), dentistId: "u2" })).toBe(true);
  });
});

describe("fueraDeHorario", () => {
  const horario = { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "13:00" };
  const martes = new Date(2026, 9, 13);

  it("adentro del horario no es gris; justo en «desde» tampoco; la última celda que termina en «hasta», tampoco", () => {
    expect(fueraDeHorario(horario, martes, "09:00")).toBe(false);
    expect(fueraDeHorario(horario, martes, "10:30")).toBe(false);
    expect(fueraDeHorario(horario, martes, "12:30")).toBe(false);
  });

  it("antes de «desde» y desde «hasta» en adelante es gris", () => {
    expect(fueraDeHorario(horario, martes, "08:30")).toBe(true);
    expect(fueraDeHorario(horario, martes, "13:00")).toBe(true);
    expect(fueraDeHorario(horario, martes, "23:30")).toBe(true);
  });

  it("un día en que no atiende es gris entero", () => {
    expect(fueraDeHorario(horario, new Date(2026, 9, 17), "10:00")).toBe(true); // sábado
  });

  it("sin horario cargado usa el de siempre: lunes a sábado de 08:00 a 18:00", () => {
    expect(fueraDeHorario(undefined, martes, "08:00")).toBe(false);
    expect(fueraDeHorario(undefined, martes, "17:30")).toBe(false);
    expect(fueraDeHorario(undefined, martes, "18:00")).toBe(true);
    expect(fueraDeHorario(undefined, new Date(2026, 9, 18), "10:00")).toBe(true); // domingo
  });

  it("un horario mal cargado no rompe: cada dato que no sirve toma el valor de siempre", () => {
    expect(fueraDeHorario({ dias: [1, 2, 3, 4, 5], desde: "", hasta: "9" }, martes, "08:00")).toBe(false);
    expect(fueraDeHorario({ dias: [1, 2, 3, 4, 5], desde: "", hasta: "9" }, martes, "18:00")).toBe(true);
    expect(fueraDeHorario({ dias: "lunes" as unknown as number[], desde: "09:00", hasta: "13:00" }, martes, "10:00")).toBe(false);
  });

  it("con un paso de 15 minutos mira la celda de 15", () => {
    expect(fueraDeHorario(horario, martes, "12:45", 15)).toBe(false);
    expect(fueraDeHorario(horario, martes, "12:45", 30)).toBe(true);
  });
});
```

En `lib/agendaSemana.test.ts`, dentro del `describe` que prueba `tituloDeEspacio` (el que tiene `"Lun 12 oct · 09:30"`), sumar este `it`:

```ts
  it("en la Diaria global lleva adelante el nombre del profesional, así dos columnas a la misma hora no se llaman igual", () => {
    expect(tituloDeEspacio(new Date(2026, 9, 13), "09:30", "Dra. Sofía Benítez")).toBe("Dra. Sofía Benítez · Mar 13 oct · 09:30");
    expect(tituloDeEspacio(new Date(2026, 9, 13), "09:30", "Dr. Diego Martínez")).not.toBe(tituloDeEspacio(new Date(2026, 9, 13), "09:30", "Dra. Sofía Benítez"));
    expect(tituloDeEspacio(new Date(2026, 9, 13), "09:30")).toBe("Mar 13 oct · 09:30");
  });
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `npx vitest run lib/agendaGrilla.test.ts lib/agendaSemana.test.ts`
Expected: FAIL — `lib/agendaGrilla.ts` no existe, y el test nuevo de `tituloDeEspacio` devuelve `"Mar 13 oct · 09:30"` sin el profesional.

- [ ] **Step 3: Implementar**

Crear `lib/agendaGrilla.ts`:

```ts
/* Columnas de la grilla de la agenda (components/agenda/GrillaAgenda): una por día en la Semanal y una por profesional en la Diaria global
 * (pedido de Camila, 13-oct-2026, como Dentalink). Qué cita y qué bloqueo va en cada columna y qué celdas caen fuera del horario de
 * atención (se pintan en gris, pero se pueden tocar igual). Todo en hora local, como el resto de la agenda. Tests en lib/agendaGrilla.test.ts. */
import type { AgendaBlock, Appointment, User } from "./types";
import { HORARIO_POR_DEFECTO, type Horario } from "./disponibilidad";
import { TODOS_LOS_PROFESIONALES } from "./bloqueos";
import { MINUTOS_CELDA } from "./agendaSemana";

/** Una columna de la grilla: un día (Semanal) o un profesional en un día (Diaria global). */
export interface ColumnaDeAgenda {
  /** Estable: «d:2026-10-13» o «p:u2». */
  clave: string;
  /** «Lun» o el nombre del profesional. */
  titulo: string;
  /** El número del día o la especialidad del profesional, si tiene. */
  subtitulo?: string;
  /** Medianoche local del día de la columna. */
  fecha: Date;
  /** Solo en la Diaria global: el profesional de la columna. */
  dentistId?: string;
  /** El color de agenda del profesional (el punto del encabezado). */
  color?: string;
  esHoy: boolean;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const dos = (n: number) => String(n).padStart(2, "0");
const medianoche = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const claveDia = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/** Los siete días de la semana que empieza en `lunes`. */
export function columnasDeLaSemana(lunes: Date, hoy: Date = new Date()): ColumnaDeAgenda[] {
  const inicio = medianoche(lunes);
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(inicio);
    fecha.setDate(inicio.getDate() + i);
    return { clave: `d:${claveDia(fecha)}`, titulo: DIAS[fecha.getDay()], subtitulo: String(fecha.getDate()), fecha, esHoy: mismoDia(fecha, hoy) };
  });
}

/** Una columna por profesional para el día `fecha`, en el orden en que llegan. */
export function columnasDelDia(fecha: Date, profesionales: readonly Pick<User, "id" | "name" | "color" | "specialty">[], hoy: Date = new Date()): ColumnaDeAgenda[] {
  const dia = medianoche(fecha);
  return profesionales.map((p) => ({
    clave: `p:${p.id}`, titulo: p.name, subtitulo: p.specialty || undefined, fecha: dia, dentistId: p.id, color: p.color, esHoy: mismoDia(dia, hoy),
  }));
}

/** ¿Va esta cita en esta columna? Semanal: mismo día. Diaria global: mismo día y mismo profesional. */
export function citaEnColumna(col: ColumnaDeAgenda, a: Pick<Appointment, "start" | "dentistId">): boolean {
  if (!mismoDia(new Date(a.start), col.fecha)) return false;
  return col.dentistId === undefined || a.dentistId === col.dentistId;
}

/** ¿Va este bloqueo en esta columna? Como una cita, pero uno de «Todos los profesionales» va en todas las columnas del día. */
export function bloqueoEnColumna(col: ColumnaDeAgenda, b: Pick<AgendaBlock, "start" | "dentistId">): boolean {
  if (!mismoDia(new Date(b.start), col.fecha)) return false;
  return col.dentistId === undefined || b.dentistId === TODOS_LOS_PROFESIONALES || b.dentistId === col.dentistId;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** ¿La celda [hora, hora + paso) cae fuera del horario de atención? Fuera = el día no está en `dias`, o la celda empieza antes de `desde` o
 *  termina después de `hasta`. Sin horario, el de siempre (`HORARIO_POR_DEFECTO`); un dato mal cargado toma su valor de siempre. */
export function fueraDeHorario(horario: Horario | undefined, fecha: Date, hora: string, paso: number = MINUTOS_CELDA): boolean {
  const h = horario ?? HORARIO_POR_DEFECTO;
  const dias = Array.isArray(h.dias) ? h.dias : HORARIO_POR_DEFECTO.dias;
  if (!dias.includes(fecha.getDay())) return true;
  const desde = minutos(HHMM.test(h.desde ?? "") ? h.desde : HORARIO_POR_DEFECTO.desde);
  const hasta = minutos(HHMM.test(h.hasta ?? "") ? h.hasta : HORARIO_POR_DEFECTO.hasta);
  const inicio = minutos(hora);
  return inicio < desde || inicio + paso > hasta;
}
```

En `lib/agendaSemana.ts`, reemplazar la función `tituloDeEspacio` entera por:

```ts
/** Título del menú de un espacio de la grilla: «Lun 12 oct · 09:30». En la Diaria global lleva adelante el profesional
 *  («Dra. Sofía Benítez · Mar 13 oct · 09:30»): así dos columnas a la misma hora no se llaman igual. */
export function tituloDeEspacio(fecha: Date, hora: string, profesional?: string): string {
  const espacio = `${DIAS[fecha.getDay()]} ${fecha.getDate()} ${MESES[fecha.getMonth()]} · ${hora}`;
  return profesional ? `${profesional} · ${espacio}` : espacio;
}
```

- [ ] **Step 4: Correr los tests y ver que pasan**

Run: `npx vitest run lib/agendaGrilla.test.ts lib/agendaSemana.test.ts && npx tsc --noEmit`
Expected: PASS y `tsc` sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/agendaGrilla.ts lib/agendaGrilla.test.ts lib/agendaSemana.ts lib/agendaSemana.test.ts
git commit -m "feat(agenda): columnas de la grilla por día o por profesional, y qué celdas caen fuera de horario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `GrillaAgenda` (la Semanal generalizada) y gris fuera de horario en la Semanal

**Files:**
- Create: `components/agenda/GrillaAgenda.tsx`
- Delete: `components/agenda/GrillaSemanal.tsx` (`git rm`)
- Modify: `app/app/agenda/page.tsx` (comentario de la línea 5, import de la línea 27, la Semanal en las líneas ~441-460)
- Test: `e2e/agenda-espacios.spec.ts`

**Interfaces:**
- Consumes (Tarea 1): `ColumnaDeAgenda`, `columnasDeLaSemana`, `citaEnColumna`, `bloqueoEnColumna`, `fueraDeHorario`, `tituloDeEspacio(fecha, hora, profesional?)`.
- Produces (la usa la Tarea 3):
  - `export type AccionEspacio = "presencial" | "video" | "multiples" | "sobreagendar" | "bloquear"` (ahora desde `@/components/agenda/GrillaAgenda`)
  - `export function GrillaAgenda(props: { columnas: ColumnaDeAgenda[]; citas: Appointment[]; bloqueos: AgendaBlock[]; gridRef: RefObject<HTMLDivElement | null>; puedeAgendar: boolean; puedeBloquear: boolean; fueraDeHorario?: (col: ColumnaDeAgenda, hora: string) => boolean; anchoMinimoColumna?: number; onVer: (a: Appointment) => void; onAccion: (accion: AccionEspacio, fecha: Date, hora: string, dentistId?: string) => void; onSobreagendar: (a: Appointment) => void; onQuitarBloqueos: (ids: string[]) => void })`
  - Nombre accesible de un casillero: `tituloDeEspacio(col.fecha, hora, col.dentistId ? col.titulo : undefined)` y, si está fuera de horario, `" · fuera de horario"` al final. El menú que abre se llama igual pero **sin** ese agregado.
  - Encabezado de una columna de profesional: un `div` con `title` = nombre del profesional.

- [ ] **Step 1: Escribir el e2e que falla**

En `e2e/agenda-espacios.spec.ts`, justo antes del comentario `/* ═══ Solo lectura ═══ */`, sumar:

```ts
/* ═══ Fuera de horario (13-oct-2026) ═══ */

test("con un profesional elegido, la Semanal pinta en gris lo que queda fuera de su horario, y ese espacio abre el menú igual", async ({ page }) => {
  await entrarDemo(page, USUARIOS_DEMO.recepcionista);
  await conDemo(page, (db: any) => {
    const u = db.users.find((x: any) => x.id === "u4");
    u.horario = { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "13:00" };
  });
  await semanaQueViene(page);
  // Con «Todos los profesionales» no se pinta nada: cada uno tiene su horario.
  await expect(main(page).getByRole("button", { name: /· fuera de horario$/ })).toHaveCount(0);

  await main(page).getByLabel("Filtrar por profesional").selectOption("u4");
  const lunes0830 = await etiquetaEspacio(page, 0, "08:30");
  await expect(main(page).getByRole("button", { name: `${lunes0830} · fuera de horario`, exact: true })).toHaveCount(1);
  await expect(main(page).getByRole("button", { name: await etiquetaEspacio(page, 0, "09:00"), exact: true })).toHaveCount(1);
  await expect(main(page).getByRole("button", { name: `${await etiquetaEspacio(page, 5, "10:00")} · fuera de horario`, exact: true })).toHaveCount(1); // sábado

  await main(page).getByRole("button", { name: `${lunes0830} · fuera de horario`, exact: true }).click();
  const menu = page.getByRole("menu", { name: lunes0830 });
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Dar cita presencial", "Dar cita por videoconsulta", "Dar múltiples citas", "Sobreagendar en este horario", "Bloquear espacio",
  ]);
});
```

- [ ] **Step 2: Compilar y ver que falla**

Run: `npm run build && E2E_PORT=3184 npx playwright test e2e/agenda-espacios.spec.ts -g "fuera de su horario" --project=escritorio --workers=1`
Expected: FAIL — no hay ningún botón con `· fuera de horario` (la Semanal de hoy no pinta horarios).

- [ ] **Step 3: Crear `components/agenda/GrillaAgenda.tsx` y borrar `GrillaSemanal.tsx`**

```tsx
"use client";
/** Grilla de la agenda (pedidos de Camila, 8 y 13-oct-2026, como Dentalink): una columna por día en la Semanal y una por profesional en la
 *  Diaria global, con celdas de 30 minutos. Tocar un espacio abre su menú («Lun 12 oct · 09:30»; en la Diaria global, con el profesional
 *  adelante): dar cita presencial o por videoconsulta, dar múltiples citas, sobreagendar y bloquear el espacio. En la Diaria global la
 *  acción sale con el profesional de la columna. Las citas y los bloqueos que caen en el mismo horario se reparten el ancho
 *  (`columnasSuperpuestas`); cada tarjeta trae un «+» para sobreagendar en su horario. Con `fueraDeHorario`, las celdas fuera del horario de
 *  atención se ven en gris, pero se pueden tocar igual. Sin permisos de agenda (dentista y asistente) la grilla es de solo lectura: sin menú,
 *  sin «+» y sin quitar bloqueos. Al imprimir no salen ni los «+» ni los menús. Cuentas puras: lib/agendaSemana.ts y lib/agendaGrilla.ts.
 *
 *  En el celular las columnas no entran: la grilla tiene un ancho mínimo y se recorre de costado, con la fila de los títulos fija arriba y las
 *  horas fijas a la izquierda. Todo vive en un solo contenedor con scroll (`gridRef`). */
import { useCallback, useRef, useState, type RefObject } from "react";
import { CalendarCheck, CalendarPlus, CalendarRange, Lock, Plus, Video } from "lucide-react";
import { useStore, fmtTime, fullName } from "@/lib/store";
import { ALTO_HORA, MINUTOS_CELDA, celdasDelDia, columnasSuperpuestas, posicionEnGrilla, tituloDeEspacio } from "@/lib/agendaSemana";
import { bloqueoEnColumna, citaEnColumna, type ColumnaDeAgenda } from "@/lib/agendaGrilla";
import { etiquetaDeBloqueo, rangoDeBloqueo } from "@/lib/bloqueos";
import type { AgendaBlock, Appointment, AppointmentStatus } from "@/lib/types";
import { Card } from "@/components/ui";
import { Desplegable, ItemMenu } from "@/components/Desplegable";
import { ComentarioCita } from "@/components/agenda/ComentarioCita";
import { MenuBloqueo, quienBloquea } from "@/components/agenda/MenuBloqueo";

/** Lo que se elige en el menú de un espacio. */
export type AccionEspacio = "presencial" | "video" | "multiples" | "sobreagendar" | "bloquear";

const CELDAS = celdasDelDia();
/** Una tarjeta se dibuja de al menos media hora de alto: para repartir el ancho cuenta así. */
const MINIMO_EN_PANTALLA = MINUTOS_CELDA * 60_000;

const STATUS_BG: Record<AppointmentStatus, string> = {
  confirmada: "bg-state-okbg border-state-ok/30 text-state-ok",
  en_atencion: "bg-azure-50 border-azure-400/50 text-azure-700",
  en_sala: "bg-violet-50 border-violet-300/60 text-violet-700",
  pendiente: "bg-state-warnbg border-state-warn/30 text-state-warn",
  completada: "bg-state-infobg border-azure-300/40 text-azure-700",
  cancelada: "bg-state-errbg border-state-err/30 text-state-err line-through",
  ausente: "bg-state-warnbg border-state-warn/30 text-state-warn",
};

/** Rayado gris de un espacio bloqueado. */
const RAYADO = "[background-image:repeating-linear-gradient(135deg,#eceff3_0,#eceff3_6px,#f7f8fa_6px,#f7f8fa_12px)]";
/** Gris liso de una celda fuera del horario de atención (distinto del rayado de un bloqueo). */
const FUERA = "bg-clinic-bg";

export function GrillaAgenda({ columnas, citas, bloqueos, gridRef, puedeAgendar, puedeBloquear, fueraDeHorario, anchoMinimoColumna, onVer, onAccion, onSobreagendar, onQuitarBloqueos }: {
  columnas: ColumnaDeAgenda[];
  /** Las citas a mostrar, ya filtradas. */
  citas: Appointment[];
  /** Los espacios bloqueados a mostrar, ya filtrados. */
  bloqueos: AgendaBlock[];
  gridRef: RefObject<HTMLDivElement | null>;
  /** agenda.create: dar cita (en todas sus variantes) y el «+» de cada tarjeta. */
  puedeAgendar: boolean;
  /** agenda.edit: bloquear espacios y quitarlos. */
  puedeBloquear: boolean;
  /** Si está, pinta en gris las celdas fuera del horario de atención de esa columna. */
  fueraDeHorario?: (col: ColumnaDeAgenda, hora: string) => boolean;
  /** Ancho mínimo de cada columna en px (Diaria global). Sin esto, el de la Semanal: unos tres días por pantalla en el celular. */
  anchoMinimoColumna?: number;
  onVer: (a: Appointment) => void;
  onAccion: (accion: AccionEspacio, fecha: Date, hora: string, dentistId?: string) => void;
  onSobreagendar: (a: Appointment) => void;
  onQuitarBloqueos: (ids: string[]) => void;
}) {
  const { db } = useStore();
  const interactivo = puedeAgendar || puedeBloquear;
  /** La columna de las horas y una por día o profesional (sin crecer por el contenido: el encabezado y la grilla quedan alineados). */
  const plantilla = `56px repeat(${Math.max(1, columnas.length)},minmax(0,1fr))`;

  // Un solo menú de espacio y uno de bloqueo para toda la grilla, anclados a lo que se tocó.
  const anclaEspacio = useRef<HTMLElement | null>(null);
  const [espacio, setEspacio] = useState<{ fecha: Date; hora: string; etiqueta: string; dentistId?: string } | null>(null);
  const cerrarEspacio = useCallback(() => setEspacio(null), []);
  const anclaBloqueo = useRef<HTMLElement | null>(null);
  const [bloqueoAbierto, setBloqueoAbierto] = useState<AgendaBlock | null>(null);
  const cerrarBloqueo = useCallback(() => setBloqueoAbierto(null), []);
  const elegir = (accion: AccionEspacio) => {
    if (!espacio) return;
    const { fecha, hora, dentistId } = espacio;
    setEspacio(null);
    onAccion(accion, fecha, hora, dentistId);
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div ref={gridRef} className="relative max-h-[560px] overflow-auto overscroll-x-contain print:max-h-none print:overflow-visible">
          <div
            className={anchoMinimoColumna ? "print:min-w-0" : "min-w-[840px] md:min-w-[680px] print:min-w-0"}
            style={anchoMinimoColumna ? { minWidth: 56 + columnas.length * anchoMinimoColumna } : undefined}
          >
            <div className="sticky top-0 z-30 grid border-b border-clinic-border bg-white print:static" style={{ gridTemplateColumns: plantilla }}>
              <div className="sticky left-0 z-10 bg-white print:static" />
              {columnas.map((col) =>
                col.dentistId ? (
                  <div key={col.clave} title={col.titulo} className="min-w-0 border-l border-clinic-border bg-white px-2 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {col.color && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: col.color }} />}
                      <span className="truncate text-[13px] font-bold text-clinic-text">{col.titulo}</span>
                    </div>
                    {col.subtitulo && <div className="truncate text-[11px] text-clinic-muted">{col.subtitulo}</div>}
                  </div>
                ) : (
                  <div key={col.clave} className={`border-l border-clinic-border px-2 py-2.5 text-center ${col.esHoy ? "bg-azure-50" : "bg-white"}`}>
                    <div className="text-[13px] font-semibold text-clinic-muted">{col.titulo}</div>
                    <div className={`text-lg font-bold ${col.esHoy ? "text-azure-600" : "text-clinic-text"}`}>{col.subtitulo}</div>
                  </div>
                ),
              )}
            </div>
            <div className="relative grid" style={{ gridTemplateColumns: plantilla }}>
              <div className="sticky left-0 z-20 bg-white print:static">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex items-start justify-end border-b border-clinic-border/60 pr-2 pt-1" style={{ height: ALTO_HORA }}>
                    <span className="tabular-nums text-[11px] text-clinic-muted">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {columnas.map((col) => {
                const deLaColumna = citas.filter((a) => citaEnColumna(col, a));
                const bloqueosDeLaColumna = bloqueos.filter((b) => bloqueoEnColumna(col, b));
                const reparto = columnasSuperpuestas(
                  [...bloqueosDeLaColumna.map((b) => ({ id: `b:${b.id}`, start: b.start, end: b.end })), ...deLaColumna.map((a) => ({ id: `c:${a.id}`, start: a.start, end: a.end }))],
                  { minimoMs: MINIMO_EN_PANTALLA },
                );
                /** Dónde va una tarjeta: su horario y su columna. A la derecha queda un canal libre para tocar el espacio de abajo. */
                const lugar = (clave: string, start: string, end: string) => {
                  const { top, height } = posicionEnGrilla(start, end);
                  const { col: c, cols } = reparto.get(clave) ?? { col: 0, cols: 1 };
                  return { top, height, left: `calc((100% - var(--canal)) * ${c / cols} + 2px)`, width: `calc((100% - var(--canal)) / ${cols} - 4px)` };
                };
                const tinte = !col.dentistId && col.esHoy ? "bg-azure-50/40" : "";
                return (
                  <div key={col.clave} className={`relative border-l border-clinic-border [--canal:8px] sm:[--canal:14px] ${tinte}`}>
                    {CELDAS.map((hora, i) => {
                      const borde = i % 2 === 0 ? "border-dashed border-clinic-border/40" : "border-clinic-border/60";
                      const fuera = fueraDeHorario?.(col, hora) ?? false;
                      if (!interactivo) return <div key={hora} className={`h-7 border-b ${borde} ${fuera ? FUERA : ""}`} />;
                      const etiqueta = tituloDeEspacio(col.fecha, hora, col.dentistId ? col.titulo : undefined);
                      const abierto = espacio?.etiqueta === etiqueta;
                      return (
                        <button
                          key={hora}
                          type="button"
                          aria-label={fuera ? `${etiqueta} · fuera de horario` : etiqueta}
                          aria-haspopup="menu"
                          aria-expanded={abierto}
                          onClick={(ev) => { anclaEspacio.current = ev.currentTarget; setEspacio({ fecha: col.fecha, hora, etiqueta, dentistId: col.dentistId }); }}
                          className={`block h-7 w-full border-b ${borde} transition-colors hover:bg-azure-50 focus-visible:bg-azure-50 ${abierto ? "bg-azure-100" : fuera ? FUERA : ""}`}
                        />
                      );
                    })}

                    {bloqueosDeLaColumna.map((b) => {
                      const box = b.boxId ? db.boxes.find((x) => x.id === b.boxId)?.name : undefined;
                      const etiqueta = etiquetaDeBloqueo(b, quienBloquea(b, db.users), box);
                      const contenido = (
                        <>
                          <span className="flex items-center gap-1 truncate font-semibold text-clinic-text"><Lock aria-hidden className="h-3 w-3 shrink-0" />{b.reason || "Bloqueado"}</span>
                          <span className="block truncate tabular-nums">{rangoDeBloqueo(b)}</span>
                        </>
                      );
                      // flex en columna: un <button> centra su contenido en vertical, y en un bloqueo de varias horas el motivo quedaba en el medio.
                      const cls = `flex h-full w-full flex-col justify-start overflow-hidden rounded-lg border border-clinic-border px-1.5 py-1 text-left text-[11px] text-clinic-muted ${RAYADO}`;
                      return (
                        <div key={b.id} style={lugar(`b:${b.id}`, b.start, b.end)} className="absolute">
                          {puedeBloquear ? (
                            <button
                              type="button"
                              aria-label={etiqueta}
                              title={etiqueta}
                              aria-haspopup="menu"
                              onClick={(ev) => { ev.stopPropagation(); anclaBloqueo.current = ev.currentTarget; setBloqueoAbierto(b); }}
                              className={`${cls} transition-colors hover:border-clinic-muted`}
                            >
                              {contenido}
                            </button>
                          ) : (
                            <div title={etiqueta} className={cls}>{contenido}</div>
                          )}
                        </div>
                      );
                    })}

                    {deLaColumna.map((a) => {
                      const p = db.patients.find((x) => x.id === a.patientId);
                      const dent = db.users.find((x) => x.id === a.dentistId);
                      // Lugar para el ícono del comentario, sin que el relleno haga a la tarjeta más ancha que su columna (dos o tres citas en el
                      // mismo horario dejan tarjetas angostas). El «+» va encima del texto: aparece al pasar el mouse y en pantallas táctiles.
                      const relleno = a.notes?.trim() ? "pr-[min(1.5rem,45%)]" : "";
                      return (
                        <div key={a.id} style={lugar(`c:${a.id}`, a.start, a.end)} className="group absolute hover:z-10 focus-within:z-10">
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); onVer(a); }}
                            className={`flex h-full w-full flex-col justify-start overflow-hidden rounded-lg border px-1 py-1 text-left text-[11px] font-semibold shadow-card transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150 hover:-translate-y-px hover:shadow-pop ${STATUS_BG[a.status]} ${relleno}`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              {/* En la Diaria global la columna ya dice de quién es la cita: el punto del profesional sobra. */}
                              {dent && !col.dentistId && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dent.color }} title={dent.name} />}
                              {a.sobrecupo && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">Sobrecupo</span>}
                              <span className="truncate">{fmtTime(a.start)} · {a.title || "Cita"}</span>
                            </div>
                            {p && <div className="truncate font-normal opacity-80">{fullName(p)}</div>}
                          </button>
                          {/* Los íconos no se salen de su tarjeta (con citas superpuestas la tarjeta es angosta): lo que no entra se recorta por
                              la izquierda. La barra deja pasar los toques a la tarjeta; solo los íconos los toman. */}
                          <div className="pointer-events-none absolute left-0.5 right-0.5 top-0.5 flex items-center justify-end gap-0.5 overflow-hidden print:hidden">
                            <ComentarioCita texto={a.notes} className="pointer-events-auto shrink-0 bg-white/80" />
                            {puedeAgendar && (
                              <button
                                type="button"
                                aria-label="Sobreagendar en este horario"
                                title="Sobreagendar en este horario"
                                onClick={(ev) => { ev.stopPropagation(); onSobreagendar(a); }}
                                className="pointer-events-auto grid h-5 w-5 shrink-0 place-items-center rounded bg-white/90 text-azure-700 opacity-0 shadow-card transition-opacity hover:bg-azure-50 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Desplegable ancla={anclaEspacio} abierto={!!espacio} onCerrar={cerrarEspacio} ancho={250} etiqueta={espacio?.etiqueta}>
        {espacio && (
          <>
            <p className="px-3 pb-1 pt-2 text-[12px] font-bold text-clinic-muted">{espacio.etiqueta}</p>
            {puedeAgendar && (
              <>
                <ItemMenu onClick={() => elegir("presencial")}><CalendarPlus aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar cita presencial</ItemMenu>
                <ItemMenu onClick={() => elegir("video")}><Video aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar cita por videoconsulta</ItemMenu>
                <ItemMenu onClick={() => elegir("multiples")}><CalendarRange aria-hidden className="h-3.5 w-3.5 text-azure-600" /> Dar múltiples citas</ItemMenu>
                <ItemMenu onClick={() => elegir("sobreagendar")}><CalendarCheck aria-hidden className="h-3.5 w-3.5 text-amber-600" /> Sobreagendar en este horario</ItemMenu>
              </>
            )}
            {puedeAgendar && puedeBloquear && <div className="my-1 border-t border-clinic-border" />}
            {puedeBloquear && <ItemMenu onClick={() => elegir("bloquear")}><Lock aria-hidden className="h-3.5 w-3.5 text-clinic-muted" /> Bloquear espacio</ItemMenu>}
          </>
        )}
      </Desplegable>
      <MenuBloqueo bloqueo={bloqueoAbierto} ancla={anclaBloqueo} onCerrar={cerrarBloqueo} onQuitar={onQuitarBloqueos} />
    </>
  );
}
```

Después: `git rm components/agenda/GrillaSemanal.tsx`.

- [ ] **Step 4: Usar `GrillaAgenda` en la Semanal (`app/app/agenda/page.tsx`)**

1. En el comentario del principio del archivo (línea 5), cambiar `components/agenda/GrillaSemanal` por `components/agenda/GrillaAgenda`.
2. Reemplazar la línea 27 (`import { GrillaSemanal, type AccionEspacio } from "@/components/agenda/GrillaSemanal";`) por:

```ts
import { GrillaAgenda, type AccionEspacio } from "@/components/agenda/GrillaAgenda";
import { columnasDeLaSemana, fueraDeHorario, type ColumnaDeAgenda } from "@/lib/agendaGrilla";
```

3. Debajo de `const weekEnd = addDays(weekStart, 7);` (bloque `/* — Semanal — */`), sumar:

```ts
  const columnasSemana = useMemo(() => columnasDeLaSemana(weekStart), [weekStart]);
  /** Con un profesional elegido, la Semanal pinta en gris lo que queda fuera de su horario (con «Todos», cada uno tiene el suyo). */
  const fueraEnLaSemana = useMemo(() => {
    const pro = proFilter !== "all" ? db.users.find((u) => u.id === proFilter) : undefined;
    return pro ? (col: ColumnaDeAgenda, hora: string) => fueraDeHorario(pro.horario, col.fecha, hora) : undefined;
  }, [proFilter, db.users]);
```

4. En el bloque `{tab === "semanal" ? (`, cambiar el comentario `/* ===== SEMANAL (grilla de 30 minutos, components/agenda/GrillaSemanal) ===== */` por `/* ===== SEMANAL (grilla de 30 minutos, components/agenda/GrillaAgenda) ===== */` y reemplazar el elemento `<GrillaSemanal … />` entero por:

```tsx
          <GrillaAgenda
            columnas={columnasSemana}
            citas={weekAppointments}
            bloqueos={weekBlocks}
            gridRef={gridRef}
            puedeAgendar={puedeAgendar}
            puedeBloquear={puedeEditar}
            fueraDeHorario={fueraEnLaSemana}
            onVer={setViewing}
            onAccion={accionEspacio}
            onSobreagendar={sobreagendarDesde}
            onQuitarBloqueos={quitarBloqueos}
          />
```

- [ ] **Step 5: Correr las pruebas de la Semanal**

Run: `npx tsc --noEmit && npx vitest run && npm run build && E2E_PORT=3184 npx playwright test e2e/agenda-espacios.spec.ts e2e/agenda.spec.ts --workers=1`
Expected: todo PASS, incluida la prueba nueva «con un profesional elegido…» y todas las que ya existían de la Semanal (sus etiquetas no cambian).

- [ ] **Step 6: Commit**

```bash
git add components/agenda/GrillaAgenda.tsx app/app/agenda/page.tsx e2e/agenda-espacios.spec.ts
git commit -m "refactor(agenda): la grilla de la Semanal pasa a GrillaAgenda, con columnas como dato y gris fuera de horario

Con un profesional elegido, la Semanal pinta en gris las horas en que no atiende; el espacio abre el menú igual.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(El `git rm` del paso 3 ya dejó el borrado de `GrillaSemanal.tsx` listo para este commit.)

---

### Task 3: La Diaria global como grilla por profesional

**Files:**
- Modify: `app/app/agenda/page.tsx` (tipo `ItemGlobal` línea 58, estado `bloqueando` línea ~154, efecto de scroll línea ~176, `accionEspacio` línea ~276, la Diaria global líneas ~543-596, `BloquearEspacio` línea ~805, comentario del `MenuBloqueo` línea ~819)
- Test: `e2e/agenda-espacios.spec.ts`

**Interfaces:**
- Consumes (Tareas 1 y 2): `GrillaAgenda` (con `anchoMinimoColumna`, `fueraDeHorario`, `onAccion(accion, fecha, hora, dentistId?)`), `columnasDelDia`, `fueraDeHorario`, `ColumnaDeAgenda`. Nombre de un casillero de la Diaria global: `"<Profesional> · Mar 13 oct · 09:30"` (y `" · fuera de horario"` al final si corresponde). Encabezado de columna: `div` con `title` = nombre del profesional.
- Produces: nada que use otra tarea.

- [ ] **Step 1: Escribir los e2e que fallan**

En `e2e/agenda-espacios.spec.ts`, después del helper `menuDeEspacio`, sumar:

```ts
/** Abre la Diaria global en el día `dia` (0 = lunes) de la semana que viene. */
async function diariaGlobal(page: Page, dia: number) {
  await page.goto("/app/agenda");
  await main(page).getByRole("button", { name: "Diaria global" }).click();
  await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, dia));
}

/** El nombre de un espacio de la Diaria global: «Dr. Diego Martínez · Mar 13 oct · 10:00». */
const espacioDe = async (page: Page, profesional: string, dia: number, hora: string) => `${profesional} · ${await etiquetaEspacio(page, dia, hora)}`;
```

Y, antes del comentario `/* ═══ Solo lectura ═══ */`, este bloque:

```ts
/* ═══ Diaria global como grilla (13-oct-2026) ═══ */

test.describe("Diaria global como grilla por profesional", () => {
  test.beforeEach(async ({ page }) => { await entrarDemo(page, USUARIOS_DEMO.recepcionista); });

  test("una columna por profesional; tocar un espacio abre el menú y «Dar cita presencial» sale con ese profesional y esa hora", async ({ page }) => {
    await diariaGlobal(page, 1);
    await expect(main(page).getByTitle("Dra. Sofía Benítez", { exact: true })).toBeVisible();
    await expect(main(page).getByTitle("Dr. Diego Martínez", { exact: true })).toBeVisible();
    const nombre = await espacioDe(page, "Dr. Diego Martínez", 1, "10:00");
    await main(page).getByRole("button", { name: nombre, exact: true }).click();
    const menu = page.getByRole("menu", { name: nombre });
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Dar cita presencial", "Dar cita por videoconsulta", "Dar múltiples citas", "Sobreagendar en este horario", "Bloquear espacio",
    ]);
    await menu.getByRole("menuitem", { name: "Dar cita presencial" }).click();
    const cita = dialogo(page, "Dar cita");
    await expect(cita.getByLabel("Profesional")).toHaveValue("u4");
    await expect(cita.getByRole("status")).toContainText("10:00");
    await sinScrollHorizontal(page);
  });

  test("«Bloquear espacio» desde la columna de un profesional sale con ese profesional y el bloqueo queda solo en su columna", async ({ page }) => {
    await diariaGlobal(page, 2);
    const nombre = await espacioDe(page, "Dra. Sofía Benítez", 2, "12:00");
    await main(page).getByRole("button", { name: nombre, exact: true }).click();
    await page.getByRole("menu", { name: nombre }).getByRole("menuitem", { name: "Bloquear espacio" }).click();
    const modal = dialogo(page, "Bloquear espacio");
    await expect(modal.getByLabel("Profesional")).toHaveValue("u2");
    await modal.getByLabel("Hasta", { exact: true }).selectOption("13:00");
    await modal.getByRole("button", { name: "Almuerzo", exact: true }).click();
    await modal.getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(modal).toHaveCount(0);
    const bloqueos = (await leerDB(page)).agendaBlocks;
    expect(bloqueos).toHaveLength(1);
    expect(bloqueos[0].dentistId).toBe("u2");
    await expect(main(page).getByRole("button", { name: /^Bloqueado 12:00–13:00 · Almuerzo/ })).toHaveCount(1);
  });

  test("un bloqueo de «Todos los profesionales» aparece en todas las columnas", async ({ page }) => {
    const ini = await enSemana(page, 3, 13);
    const fin = await enSemana(page, 3, 14);
    await conDemo(page, (db: any, a: { ini: string; fin: string }) => {
      db.agendaBlocks.push({ id: "bl_todos", clinicId: db.clinics[0].id, dentistId: "*", start: a.ini, end: a.fin, reason: "Reunión", createdAt: a.ini, createdBy: "Laura Recepción" });
    }, { ini, fin });
    await diariaGlobal(page, 3);
    const columnas = await page.evaluate(() => JSON.parse(localStorage.getItem("novudent.db.v4")!).users.filter((u: any) => u.role === "dentist").length);
    await expect(main(page).getByRole("button", { name: /^Bloqueado 13:00–14:00 · Reunión/ })).toHaveCount(columnas);
  });

  test("fuera de horario: gris por profesional, y el espacio abre el menú igual; un domingo, toda la columna", async ({ page }) => {
    await conDemo(page, (db: any) => {
      const u = db.users.find((x: any) => x.id === "u4");
      u.horario = { dias: [1, 2, 3, 4, 5], desde: "09:00", hasta: "13:00" };
    });
    await diariaGlobal(page, 1);
    const diego0830 = await espacioDe(page, "Dr. Diego Martínez", 1, "08:30");
    await expect(main(page).getByRole("button", { name: `${diego0830} · fuera de horario`, exact: true })).toHaveCount(1);
    // La Dra. Sofía tiene el horario de siempre (08 a 18): a las 08:30 atiende.
    await expect(main(page).getByRole("button", { name: await espacioDe(page, "Dra. Sofía Benítez", 1, "08:30"), exact: true })).toHaveCount(1);
    await main(page).getByRole("button", { name: `${diego0830} · fuera de horario`, exact: true }).click();
    await expect(page.getByRole("menu", { name: diego0830 }).getByRole("menuitem", { name: "Dar cita presencial" })).toBeVisible();
    await page.keyboard.press("Escape"); // los menús (no las ventanas) se cierran con Escape

    await page.getByLabel("Elegir fecha").fill(await fechaEnSemana(page, 6)); // domingo
    await expect(main(page).getByRole("button", { name: `${await espacioDe(page, "Dra. Sofía Benítez", 6, "10:00")} · fuera de horario`, exact: true })).toHaveCount(1);
  });

  test("la cita se ve en la columna de su profesional y su «+» sobreagenda con ese profesional", async ({ page }) => {
    await conCitas(page, [{ id: "a_global", dia: 1, desde: [11, 0], hasta: [11, 30], dentistId: "u4", title: "Control global" }]);
    await diariaGlobal(page, 1);
    const tarjeta = main(page).getByRole("button", { name: /Control global/ });
    await expect(tarjeta).toBeVisible();
    await tarjeta.hover();
    await tarjeta.locator("..").getByRole("button", { name: "Sobreagendar en este horario" }).click();
    await expect(dialogo(page, "Dar cita").getByLabel("Profesional")).toHaveValue("u4");
  });
});

test("el dentista ve la Diaria global como grilla de solo lectura: sin menú en los espacios", async ({ page }) => {
  await entrarDemo(page, USUARIOS_DEMO.dentista);
  await conCitas(page, [{ id: "a_ro_global", dia: 1, desde: [10, 0], hasta: [10, 30], title: "Cita para mirar" }]);
  await diariaGlobal(page, 1);
  await expect(main(page).getByRole("button", { name: /Cita para mirar/ })).toBeVisible();
  await expect(main(page).getByRole("button", { name: await espacioDe(page, "Dra. Sofía Benítez", 1, "09:00"), exact: true })).toHaveCount(0);
  await expect(main(page).getByRole("note").filter({ hasText: "Agenda en solo lectura" })).toBeVisible();
});
```

- [ ] **Step 2: Compilar y ver que fallan**

Run: `npm run build && E2E_PORT=3184 npx playwright test e2e/agenda-espacios.spec.ts -g "Diaria global" --project=escritorio --workers=1`
Expected: FAIL — la Diaria global de hoy no tiene casilleros (no existe el botón «Dr. Diego Martínez · … · 10:00») ni encabezados con `title`.

- [ ] **Step 3: Pasar el profesional de la columna a «Dar cita» y a «Bloquear espacio»**

En `app/app/agenda/page.tsx`:

1. El estado de la línea ~154 pasa a:

```ts
  const [bloqueando, setBloqueando] = useState<{ fecha: Date; hora: string; dentistId?: string } | null>(null);
```

2. `accionEspacio` (línea ~276) entero pasa a:

```ts
  /** Una opción del menú de un espacio de la grilla. En la Diaria global trae el profesional de la columna; si no, vale el del filtro. */
  function accionEspacio(accion: AccionEspacio, fecha: Date, hora: string, dentistId?: string) {
    if (accion === "bloquear") { setBloqueando({ fecha, hora, dentistId }); return; }
    setPreseleccion({ fecha, hora });
    setAbrirCon({ sobreagendar: accion === "sobreagendar", multiconsulta: accion === "multiples" });
    setEditing(citaBase({ ...(dentistId ? { dentistId } : {}), ...(accion === "video" ? { telemed: true } : {}) }));
  }
```

3. En `<BloquearEspacio` (línea ~805), la prop `dentistId` pasa a:

```tsx
          dentistId={bloqueando.dentistId ?? (proFilter !== "all" ? proFilter : undefined)}
```

y el comentario de arriba, `{/* Modal BLOQUEAR ESPACIO (desde el menú de un espacio de la semanal) */}`, pasa a `{/* Modal BLOQUEAR ESPACIO (desde el menú de un espacio de la Semanal o de la Diaria global) */}`.

- [ ] **Step 4: La Diaria global usa `GrillaAgenda`**

1. Sumar `columnasDelDia` al import de `@/lib/agendaGrilla` (queda `import { columnasDeLaSemana, columnasDelDia, fueraDeHorario, type ColumnaDeAgenda } from "@/lib/agendaGrilla";`).

2. Debajo de la definición de `bloqueosDelDia` (el `useMemo` que filtra `bloqueosVisibles` por `selKey`), sumar:

```ts
  /* — Diaria global: una columna por profesional del día, con las citas de los filtros de la izquierda — */
  const profesionalesDelDia = dentists.filter((d) => proFilter === "all" || d.id === proFilter);
  const columnasDelDiaGlobal = columnasDelDia(day, profesionalesDelDia);
  const citasDelDiaGlobal = dayAll.filter((a) => statusFilter.has(estadoDe(a).id) && (!soloOnline || a.source === "online") && pasaFiltros(a));
  const fueraEnElDia = (col: ColumnaDeAgenda, hora: string) => fueraDeHorario(db.users.find((u) => u.id === col.dentistId)?.horario, col.fecha, hora);
```

3. Reemplazar TODO el contenido de la rama `{tab === "global" ? ( … ) : (<>` —desde `<div className="overflow-x-auto pb-1">` (línea ~544) hasta el `</div>` que cierra esa rama justo antes de `) : (<>` (línea ~596)— por:

```tsx
              columnasDelDiaGlobal.length === 0 ? (
                <Empty title="No hay profesionales para mostrar con estos filtros." desc="Elegí «Todos los profesionales» arriba a la izquierda." />
              ) : (
                <GrillaAgenda
                  columnas={columnasDelDiaGlobal}
                  citas={citasDelDiaGlobal}
                  bloqueos={bloqueosDelDia}
                  gridRef={gridRef}
                  puedeAgendar={puedeAgendar}
                  puedeBloquear={puedeEditar}
                  fueraDeHorario={fueraEnElDia}
                  anchoMinimoColumna={150}
                  onVer={setViewing}
                  onAccion={accionEspacio}
                  onSobreagendar={sobreagendarDesde}
                  onQuitarBloqueos={quitarBloqueos}
                />
              )
```

4. Borrar el tipo `ItemGlobal` (línea 58), que deja de usarse. Si `tsc` marca otra variable o import sin uso por este cambio, borrarlo también; no tocar lo que la Diaria sigue usando (`RAYADO`, `abrirMenuBloqueo`, `etiquetaBloqueo`, `nombreDeBox`).

5. El efecto de scroll de la línea ~176 pasa a:

```ts
  // Al entrar a una grilla (Semanal o Diaria global) o cambiar de semana o de día, arranca a las 08:00.
  useEffect(() => { if (tab === "semanal" || tab === "global") gridRef.current?.scrollTo({ top: 8 * 56 - 8 }); }, [tab, weekStart, day]);
```

6. El comentario del `<MenuBloqueo` del final, `{/* Menú de un bloqueo en la Diaria y la Diaria global (la semanal tiene el suyo) */}`, pasa a `{/* Menú de un bloqueo en la Diaria (las grillas tienen el suyo) */}`.

- [ ] **Step 5: Adaptar la prueba vieja de la Diaria global, si hace falta**

La prueba «la Diaria global muestra el bloqueo como tarjeta gris en la columna del profesional» busca `getByRole("button", { name: /^Bloqueado 09:00–10:00 · Vacaciones/ })`. La grilla nombra el bloqueo con `etiquetaDeBloqueo`, igual que antes, así que debería pasar sin cambios. Si falla solo por el nombre, ajustar únicamente la expresión a lo que muestra la grilla, y cambiar el título de la prueba a «la Diaria global muestra el bloqueo rayado en la columna del profesional».

- [ ] **Step 6: Correr las pruebas**

Run: `npx tsc --noEmit && npx vitest run && npm run build && E2E_PORT=3184 npx playwright test e2e/agenda-espacios.spec.ts e2e/agenda.spec.ts e2e/mi-agenda.spec.ts --workers=1`
Expected: todo PASS en escritorio y celular (incluye `sinScrollHorizontal` en el celular).

- [ ] **Step 7: Commit**

```bash
git add app/app/agenda/page.tsx e2e/agenda-espacios.spec.ts
git commit -m "feat(agenda): la Diaria global es una grilla por profesional con menú en cada espacio

Pedido de Camila (13-oct-2026): como en Dentalink, tocar un espacio libre de la Diaria global abre el menú (dar cita, sobreagendar, bloquear) con el profesional de esa columna ya elegido. Las horas fuera de su horario se ven en gris y se pueden tocar igual.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Manual, CLAUDE.md y verificación completa

**Files:**
- Modify: `docs/manual/contenido/recepcion.ts` (paso de la Diaria global, línea ~476; `tip` de los bloqueos)
- Modify: `CLAUDE.md` (párrafo «Pedidos de Camila del 8-oct-2026», línea ~281)

**Interfaces:**
- Consumes: el comportamiento de las Tareas 2 y 3.
- Produces: nada.

- [ ] **Step 1: Manual**

En `docs/manual/contenido/recepcion.ts`, reemplazar:

```ts
      { texto: "En **Diaria global** ves el día con una columna por profesional, para comparar las agendas de un vistazo.", captura: "global" },
```

por:

```ts
      { texto: "En **Diaria global** ves el día en una grilla de media hora con una columna por profesional, para ver de un vistazo quién tiene hueco. Tocá un espacio libre para dar cita, sobreagendar o bloquear con ese profesional ya elegido. En gris quedan las horas en que ese profesional no atiende (igual se pueden tocar).", captura: "global" },
```

Si en el mismo archivo hay un `tip` que dice que los espacios bloqueados salen «rayados en gris en la Semanal», cambiar ese tramo a «rayados en gris en la Semanal y en la Diaria global». No tocar el resto del manual.

- [ ] **Step 2: CLAUDE.md**

En el párrafo que empieza con `**Pedidos de Camila del 8-oct-2026 (agenda, …`, después de la oración que termina en `lo dice arriba de todas las vistas** (antes el clic no hacía nada y parecía un error).`, agregar estas líneas:

```
**Diaria global como grilla (13-oct-2026)** — spec en `docs/superpowers/specs/2026-10-13-agenda-diaria-global-grilla-design.md`: la Semanal y la
Diaria global usan la misma `components/agenda/GrillaAgenda` (antes `GrillaSemanal`), que recibe sus columnas (`lib/agendaGrilla.ts`:
`columnasDeLaSemana`, `columnasDelDia`, `citaEnColumna`, `bloqueoEnColumna`). En la Diaria global cada columna es un profesional y el menú del
espacio sale con ese profesional (`accionEspacio(…, dentistId)`). Las horas fuera del horario de atención (`fueraDeHorario`: `User.horario` o
`HORARIO_POR_DEFECTO`) se pintan en gris y se pueden tocar igual; en la Semanal, solo con un profesional elegido. La Diaria (tabla) no cambió.
```

- [ ] **Step 3: Capturas del manual**

Run: `npm run build && npm run manual:capturas`
Expected: PASS. Si una captura falla porque ya no encuentra su botón en la Diaria global, ajustar SOLO el selector de esa captura en `docs/manual/contenido/*.ts` para que apunte a la grilla nueva (por ejemplo, el encabezado con `title` del profesional). Las PNG quedan en `docs/manual/salida/` (git-ignorada): no se commitean.

- [ ] **Step 4: Verificación completa**

Run:
```bash
npx tsc --noEmit && npx vitest run && npm run build && E2E_PORT=3184 npx playwright test e2e/agenda.spec.ts e2e/agenda-espacios.spec.ts e2e/mi-agenda.spec.ts e2e/roles.spec.ts e2e/permisos.spec.ts e2e/pantallas-y-flujos.spec.ts e2e/app-paginas.spec.ts e2e/visual.spec.ts --workers=1
```
Expected: todo PASS (los `skipped` por proyecto que ya existían siguen igual). Anotar en el reporte la cantidad de pasadas, salteadas y fallidas.

- [ ] **Step 5: Commit**

```bash
git add docs/manual/contenido/recepcion.ts CLAUDE.md
git commit -m "docs: la Diaria global como grilla en el manual de recepción y en CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
