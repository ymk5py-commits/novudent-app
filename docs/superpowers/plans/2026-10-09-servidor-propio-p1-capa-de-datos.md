# Servidor propio · P1 — Capa de datos y exportación de Firestore · Plan de implementación

> **Estado (9-oct-2026): ejecutado en la rama `feat/capa-de-datos`. El código final es el del repositorio, no el de los bloques de abajo: durante la ejecución las revisiones cambiaron** `mezclarProfundo` (un mapa vacío en el parche vacía el mapa, como Firestore), la prueba de «una sola vez» de `carga.test.ts`, `aislamiento.test.ts` (ahora vigila también el envoltorio `lib/firebase` y las variantes del SDK), los ids de documento del exportador (la API los devuelve sin codificar: no se decodifican), la lectura del cuerpo dentro del reintento del cliente, la prueba de la contraseña, la guarda de «no exportar dentro del repo» (anclada a la raíz del repo y a rutas reales), el chequeo de programa principal (resuelve enlaces simbólicos) y las pruebas de la línea de comandos. Ver `git log feat/capa-de-datos` y el contrato en `lib/backend/contrato-de-datos.ts`.

> **Para quien ejecute este plan:** usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casillas (`- [ ]`). Todo el código de este plan **ya se escribió y se probó en una copia desechable** (1804 pruebas unitarias, 23 con el emulador de Firestore, `tsc` limpio, `npm run build` y 125 pruebas e2e sin fallas), así que los bloques de código son los definitivos: si algo no anda, sospechá primero del entorno o de que `main` haya cambiado.

**Objetivo:** que la tienda y las pantallas de Novudent hablen con una interfaz (`backendDeDatos`) y no con Firebase, y poder exportar todo Firestore (solo lectura) midiendo el volumen real. Cero cambios visibles para las clínicas.

**Arquitectura:** `lib/backend/` define dos interfaces (`DatosDeBackend` y `SesionDeBackend`), una implementación sobre Firestore (la lógica que hoy está dentro de `lib/store.tsx` y `lib/firebase.ts`) y otra en memoria para probar. Lo que decide la tienda al abrir una clínica (qué leer, cómo armar la `DB`, sembrar y poner al día la demo) pasa a `carga.ts`, que solo usa la interfaz. Una suite de contrato (`contrato-de-datos.ts`) corre contra toda implementación: contra la memoria en `npm test` y contra el emulador de Firestore en `npm run test:backend`. El exportador (`scripts/migracion/`) lee Firestore por la API REST con las credenciales del CLI de Firebase.

**Tecnologías:** TypeScript, Next.js 16, Firestore (SDK web), Vitest 4, `@firebase/rules-unit-testing`, emulador de Firestore (Java + `firebase-tools`), Node ≥ 22.18 para los scripts `.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md` (§9 capa de datos, §11.1 exportación, §13 aceptación de P1, §15 orden de trabajo).

## Restricciones globales

- **Nada visible cambia**: `NEXT_PUBLIC_BACKEND` por defecto es `firestore` y la app se comporta igual que hoy.
- **Solo `lib/firebase.ts` y `lib/backend/firestore.ts` importan `firebase/*`** (más las pruebas `*.emulador.test.ts`). Lo vigila `lib/backend/aislamiento.test.ts`.
- **`lib/server/*` y las rutas `/api` no se tocan** en P1 (el equivalente del lado servidor es de P3).
- Los textos, comentarios y mensajes van en español rioplatense (voseo), como el resto del repo.
- **Ningún secreto en el repositorio.** La exportación contiene datos de pacientes: se guarda **fuera** del repo (`~/novudent-export/…`, carpetas 700 y archivos 600), nunca se sube ni se manda a ningún servicio, y el script se niega a escribir dentro del repo.
- La exportación es de **solo lectura**: no se escribe, borra ni cambia nada en Firestore, y no se publican reglas.
- Cada tarea termina con un commit en la rama `feat/capa-de-datos`; el mensaje cierra con la línea `Co-Authored-By:` del modelo que lo hace.
- Antes de mergear: `npx tsc --noEmit && npx vitest run && npm run test:backend && npm run test:rules && npm run build` (ver CLAUDE.md del repo).
- Puertos de prueba propios (`E2E_PORT=3197`) y los comandos pesados bajo `flock -w 900 /tmp/novudent-pesado.lock …`.

## Refinamientos respecto del spec

El spec (§9) dibujó la interfaz en borrador; al armarla contra el código real quedó así (el spec se actualiza en la Tarea 10):

- `cargarClinica(cid, opciones): Promise<DB>` se parte en `leerClinica` (solo lee; devuelve `null` si no existe) y `cargarDB` en `carga.ts` (decide, arma la `DB`, siembra y actualiza la demo). Así la política se prueba sin base y no hay que reescribirla en P3.
- `escuchar(objetivo, …)` pasa a tres métodos explícitos: `escucharSuscripcion`, `escucharClinica` y `escucharColeccion` (con `ordenarPor` y `participante`).
- `lote(ops)` lleva operaciones `guardar`, `guardarClinica` (reemplaza) y `mezclarClinica` (fusiona).
- La sesión suma `esperarSesion()` y `iniciarSesionDeDemo()`, y los datos suman `clinicaDelUsuario(uid)` (el directorio del login multi-clínica).
- El manifiesto de colecciones es `lib/backend/colecciones.json` (y no `db/manifiesto.ts`): lo leen también los scripts de Node.

## Fuera de P1 (no lo hagas acá)

El adaptador de Supabase y su cliente de servidor (`DatosDeServidor`, reemplazo de `lib/server/firestore-rest.ts` y de `lib/server/auth.ts`), reemplazar Firebase Analytics, renombrar el estado `"firebase"` de la conexión de la tienda, el esquema SQL y los permisos (P2), el cargador a Postgres (P5), Botika (P6) y todo lo que necesita el servidor (P7).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/backend/colecciones.json` + `colecciones.ts` | Manifiesto: los nombres de las colecciones (clínica, primer nivel, no migradas, solo servidor) |
| `lib/backend/tipos.ts` | Interfaces `DatosDeBackend`, `SesionDeBackend`, `BackendDeDatos` y sus tipos |
| `lib/backend/documentos.ts` | `limpiar` y `mezclarProfundo` (fusión como la de Firestore con `merge: true`) |
| `lib/backend/memoria.ts` | Backend en memoria (referencia del contrato; para pruebas) |
| `lib/backend/contrato-de-datos.ts` | Suite de contrato que pasa toda implementación |
| `lib/backend/constantes.ts` | `CLINICA_DEMO` |
| `lib/backend/carga.ts` | `cargarDB`, `filtroDeDirectos`, `opsDeSemilla`, `armarDB`: la política de carga |
| `lib/backend/firestore.ts` | Implementación sobre Firestore (datos y sesión) |
| `lib/backend/index.ts` | `backendDeDatos` y `elegirBackend` (`NEXT_PUBLIC_BACKEND`) |
| `lib/backend/*.test.ts`, `*.emulador.test.ts` | Pruebas (las `.emulador.` necesitan el emulador) |
| `vitest.emulador.config.ts` | Configuración de las pruebas con el emulador |
| `scripts/migracion/*.mjs` | Exportador de Firestore: valores, cliente REST, credenciales, orquestación, informe, línea de comandos |
| `lib/store.tsx`, `app/login/page.tsx`, `app/app/chat/page.tsx`, 6 componentes, `lib/avisoCita.ts` | Pasan a usar `backendDeDatos` |

---

### Tarea 0: Preparar el terreno

**Archivos:** ninguno (solo repositorio y herramientas).

- [ ] **Paso 1: Partir de `main` limpio.**

```bash
cd ~/Escritorio/CROMAN/NOVUM/novudent-app
git status --short
```

Si aparecen cambios sin commitear (el 9-oct-2026 estaba el arreglo del aviso de cookies: `app/globals.css`, `components/Shell.tsx`, `components/landing/Consentimiento.tsx`, `e2e/cookies-panel.spec.ts`), **no los mezcles con este trabajo**: commitealos en su propia rama o guardalos con `git stash push -u -m cookies`. Después:

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feat/capa-de-datos
```

- [ ] **Paso 2: Verificar las herramientas.**

```bash
node --version        # 22.18 o más (los scripts .mjs corren con él)
java -version         # el emulador de Firestore lo necesita
firebase --version    # CLI global; hace falta una sesión iniciada: firebase login
```

- [ ] **Paso 3: Línea base verde.**

```bash
npx tsc --noEmit && npx vitest run
npm run test:rules
```

Esperado: sin errores ni fallas (el 9-oct-2026: 1720 pruebas unitarias). Si algo falla acá, no es de este plan: pará y avisá.

---

### Tarea 1: Manifiesto de colecciones

**Archivos:**
- Crear: `lib/backend/colecciones.json`, `lib/backend/colecciones.ts`
- Prueba: `lib/backend/colecciones.test.ts`

**Interfaces:**
- Produce: `COLECCIONES_DE_CLINICA`, `COLECCIONES_RAIZ`, `COLECCIONES_QUE_NO_SE_MIGRAN`, `COLECCIONES_SOLO_SERVIDOR`, `COLECCIONES_DE_LA_TIENDA` (todas `readonly string[]`). El JSON también lo lee el exportador (Tarea 9).

- [ ] **Paso 1: Escribir la prueba que falla.** Ata el manifiesto a `firestore.rules` y a la semilla: si se suma una colección en un lado y no en el otro, falla.

`lib/backend/colecciones.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  COLECCIONES_DE_CLINICA, COLECCIONES_DE_LA_TIENDA, COLECCIONES_QUE_NO_SE_MIGRAN, COLECCIONES_RAIZ, COLECCIONES_SOLO_SERVIDOR,
} from "./colecciones";
import { buildSeed } from "../seed";

const reglas = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const INICIO_CLINICA = reglas.indexOf("match /clinics/{cid} {");
const FIN_CLINICA = reglas.indexOf("match /{document=**}");
const nombresDeMatch = (texto: string) => [...texto.matchAll(/match \/([A-Za-z]+)\/\{[A-Za-z]+\}/g)].map((m) => m[1]);

describe("manifiesto de colecciones", () => {
  it("las subcolecciones de clinics/{cid} en firestore.rules son exactamente las del manifiesto", () => {
    expect(INICIO_CLINICA).toBeGreaterThan(0);
    expect(FIN_CLINICA).toBeGreaterThan(INICIO_CLINICA);
    const enReglas = nombresDeMatch(reglas.slice(INICIO_CLINICA + 10, FIN_CLINICA));
    expect([...new Set(enReglas)].sort()).toEqual([...COLECCIONES_DE_CLINICA].sort());
  });

  it("las colecciones de primer nivel en firestore.rules son las del manifiesto más las que no se migran", () => {
    // `match /databases/{database}/documents` es la raíz de Firestore, no una colección.
    const enReglas = ["clinics", ...nombresDeMatch(reglas.slice(0, INICIO_CLINICA)).filter((n) => n !== "databases")];
    expect([...new Set(enReglas)].sort()).toEqual([...COLECCIONES_RAIZ, ...COLECCIONES_QUE_NO_SE_MIGRAN].sort());
  });

  it("no hay nombres repetidos", () => {
    expect(new Set(COLECCIONES_DE_CLINICA).size).toBe(COLECCIONES_DE_CLINICA.length);
  });

  it("la tienda carga todas menos las que escribe solo el servidor", () => {
    expect(COLECCIONES_SOLO_SERVIDOR).toEqual(["slotLocks"]);
    expect([...COLECCIONES_DE_LA_TIENDA].sort()).toEqual(COLECCIONES_DE_CLINICA.filter((n) => n !== "slotLocks").sort());
  });

  it("coincide con las listas de la base (DB): cada colección de la tienda es una lista de la semilla, y al revés", () => {
    const semilla = buildSeed() as unknown as Record<string, unknown>;
    const listas = Object.keys(semilla).filter((k) => Array.isArray(semilla[k]) && k !== "clinics");
    expect(listas.sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
  });
});
```

- [ ] **Paso 2: Verla fallar.**

```bash
npx vitest run lib/backend/colecciones.test.ts
```

Esperado: FAIL (no se puede resolver `./colecciones`).

- [ ] **Paso 3: Escribir el manifiesto.**

`lib/backend/colecciones.json`:

```json
{
  "porClinica": [
    "users", "patients", "appointments", "billing", "procedures", "budgets",
    "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
    "slotLocks", "recoveryMonitors", "radiographs", "signatures", "crmCards",
    "campaigns", "labOrders", "settlements", "boxes", "patientNotes",
    "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages",
    "surveys", "surveyResponses", "mgmtTasks", "environmentalLogs", "eduVideos",
    "branches", "directMessages", "clinicalDocs", "routineChecks", "agendaBlocks"
  ],
  "raiz": ["clinics", "directory", "subscriptions", "webhookEvents", "leads", "checkoutTokens"],
  "noSeMigra": ["serviceAccounts"],
  "soloServidor": ["slotLocks"]
}
```

`lib/backend/colecciones.ts`:

```ts
/** Manifiesto de colecciones de Novudent: la única lista de qué guarda la base.
 *
 *  Los nombres viven en `colecciones.json` (JSON a propósito: lo leen también los scripts de Node sin pasar por TypeScript, como
 *  `scripts/migracion/exportar-firestore.mjs`, y después lo va a leer el generador del esquema de Postgres). `colecciones.test.ts` lo ata a
 *  `firestore.rules` y a la semilla: si se suma una colección en un lado y no en el otro, falla. */
import datos from "./colecciones.json";

/** Subcolecciones de `clinics/{cid}/…` (en Postgres: una tabla por cada una). */
export const COLECCIONES_DE_CLINICA: readonly string[] = datos.porClinica;

/** Colecciones de primer nivel que se migran (`clinics` es el documento de cada clínica). */
export const COLECCIONES_RAIZ: readonly string[] = datos.raiz;

/** Colecciones de primer nivel que NO se migran (`serviceAccounts`: la lista de usuarios de servicio de Firebase, que en Supabase no existe). */
export const COLECCIONES_QUE_NO_SE_MIGRAN: readonly string[] = datos.noSeMigra;

/** Las que escribe solo el servidor (la ruta de reservas online): la tienda no las carga. */
export const COLECCIONES_SOLO_SERVIDOR: readonly string[] = datos.soloServidor;

/** Las que carga la tienda al abrir una clínica. */
export const COLECCIONES_DE_LA_TIENDA: readonly string[] = datos.porClinica.filter((n) => !datos.soloServidor.includes(n));
```

- [ ] **Paso 4: Verla pasar.**

```bash
npx vitest run lib/backend/colecciones.test.ts
```

Esperado: 5 pruebas verdes.

- [ ] **Paso 5: Commit.**

```bash
git add lib/backend/colecciones.json lib/backend/colecciones.ts lib/backend/colecciones.test.ts
git commit -m "feat(backend): manifiesto de colecciones atado a firestore.rules y a la semilla"
```

---

### Tarea 2: Interfaces de la capa de datos y utilidades de documentos

**Archivos:**
- Crear: `lib/backend/tipos.ts`, `lib/backend/documentos.ts`
- Prueba: `lib/backend/documentos.test.ts`

**Interfaces:**
- Produce: los tipos `Doc`, `FiltroDeDirectos`, `LecturaDeClinica`, `OpcionesDeLectura`, `OperacionDeLote`, `Desuscribir`, `AlFallar`, `OpcionesDeEscucha`, `DatosDeBackend`, `SesionDeBackend`, `BackendDeDatos`; y `limpiar<T>(x: T): T`, `mezclarProfundo(base: Doc, parche: Doc): Doc`.

- [ ] **Paso 1: Escribir la prueba que falla** (la fusión tiene que ser la de Firestore con `merge: true`: mapas en profundidad, arreglos y valores simples reemplazados).

`lib/backend/documentos.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { limpiar, mezclarProfundo } from "./documentos";

describe("limpiar", () => {
  it("saca los undefined y devuelve una copia", () => {
    const original = { a: 1, b: undefined, c: { d: undefined, e: [1, undefined] } };
    const copia = limpiar(original);
    expect(copia).toStrictEqual({ a: 1, c: { e: [1, null] } });
    expect(copia).not.toBe(original);
  });
});

describe("mezclarProfundo (igual que setDoc con merge:true de Firestore)", () => {
  it("mezcla los mapas en profundidad y conserva lo que el parche no menciona", () => {
    const base = { name: "A", config: { a: { x: 1, y: 2 }, z: 9 } };
    expect(mezclarProfundo(base, { config: { a: { y: 20 } } })).toStrictEqual({ name: "A", config: { a: { x: 1, y: 20 }, z: 9 } });
  });
  it("reemplaza los arreglos enteros y los valores simples, incluido null", () => {
    const base = { lista: [1, 2, 3], n: 1, texto: "a" };
    expect(mezclarProfundo(base, { lista: [7], n: null })).toStrictEqual({ lista: [7], n: null, texto: "a" });
  });
  it("un valor simple pisa un mapa y un mapa pisa un valor simple", () => {
    expect(mezclarProfundo({ a: { x: 1 } }, { a: 5 })).toStrictEqual({ a: 5 });
    expect(mezclarProfundo({ a: 5 }, { a: { x: 1 } })).toStrictEqual({ a: { x: 1 } });
  });
  it("ignora los undefined del parche y no modifica los originales", () => {
    const base = { a: { x: 1 } };
    const parche = { a: { y: undefined }, b: undefined };
    const r = mezclarProfundo(base, parche);
    expect(r).toStrictEqual({ a: { x: 1 } });
    expect(base).toStrictEqual({ a: { x: 1 } });
    expect(parche.a).toStrictEqual({ y: undefined });
  });
});
```

- [ ] **Paso 2: Verla fallar.**

```bash
npx vitest run lib/backend/documentos.test.ts
```

Esperado: FAIL (no existe `./documentos`).

- [ ] **Paso 3: Escribir las interfaces y las utilidades.**

`lib/backend/tipos.ts`:

```ts
/** Contrato de la capa de datos de Novudent.
 *
 *  La tienda (`lib/store.tsx`) y las pantallas hablan con estas interfaces y no con Firebase: así se puede cambiar la base (Firestore hoy,
 *  Supabase después, ver docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md) sin tocarlas. Dos mitades:
 *  - `SesionDeBackend`: quién está adentro (login, token, recuperar contraseña);
 *  - `DatosDeBackend`: leer, guardar y escuchar los documentos de una clínica.
 *  Cada implementación tiene que pasar `contrato-de-datos.ts` (mismas pruebas para todas). */

/** Un documento tal como lo guarda la base: un objeto JSON (las fechas son texto ISO). */
export type Doc = Record<string, unknown>;

/** Qué parte de `directMessages` le toca a quien lee. La decide la tienda según el rol (ver `filtroDeDirectos` en carga.ts) y el backend la
 *  ejecuta: un directo es de sus dos participantes y del admin. */
export type FiltroDeDirectos = "todos" | "ninguno" | { participante: string };

export interface LecturaDeClinica {
  /** El documento `clinics/{cid}`. */
  clinica: Doc;
  /** `subscriptions/{cid}`; `null` si la clínica es anterior al cobro. */
  suscripcion: Doc | null;
  /** Una lista por cada colección de la tienda (`COLECCIONES_DE_LA_TIENDA`); `[]` si no hay documentos o si el rol no puede leerla. */
  colecciones: Record<string, Doc[]>;
}

export interface OpcionesDeLectura {
  /** Decide el filtro de `directMessages` con el padrón ya leído y el id del usuario de esta sesión (`null` si no hay sesión). */
  directos(usuarios: Doc[], usuarioId: string | null): FiltroDeDirectos;
}

export type OperacionDeLote =
  | { tipo: "guardar"; col: string; id: string; data: unknown }
  /** Reemplaza el documento `clinics/{cid}` entero. */
  | { tipo: "guardarClinica"; data: unknown }
  /** Fusiona en `clinics/{cid}` (mapas en profundidad, arreglos reemplazados). */
  | { tipo: "mezclarClinica"; data: unknown };

export type Desuscribir = () => void;
export type AlFallar = (error: unknown) => void;

export interface OpcionesDeEscucha {
  /** Campo por el que se ordena de menor a mayor. */
  ordenarPor?: string;
  /** Solo los documentos cuyo `participants` incluye este id (chat directo). */
  participante?: string;
}

export interface DatosDeBackend {
  readonly tipo: "firestore" | "supabase" | "memoria";

  /** Lee la clínica y todas sus colecciones. `null` si la clínica no existe. Una colección que el rol no puede leer da `[]` (no rompe la carga). */
  leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null>;
  /** A qué clínica pertenece un usuario (enrutamiento del login multi-clínica); `null` si no figura. Rechaza si no se pudo leer. */
  clinicaDelUsuario(uid: string): Promise<string | null>;

  /** Crea o REEMPLAZA el documento entero (lo que falte en `data` desaparece). Los `undefined` se descartan. */
  guardar(cid: string, col: string, id: string, data: unknown): Promise<void>;
  /** Borra el documento; si no existe no falla. */
  quitar(cid: string, col: string, id: string): Promise<void>;
  /** Cambia UN campo sin tocar el resto; `undefined` lo borra. Rechaza (`code: "not-found"`) si el documento no existe. */
  fijarCampo(cid: string, col: string, id: string, campo: string, valor: unknown): Promise<void>;
  /** Fusiona en `clinics/{cid}`: los mapas se mezclan en profundidad, los arreglos y valores simples se reemplazan, lo demás se conserva. */
  mezclarClinica(cid: string, data: unknown): Promise<void>;
  /** Aplica varias operaciones juntas (todas o ninguna). */
  lote(cid: string, ops: OperacionDeLote[]): Promise<void>;

  escucharSuscripcion(cid: string, alCambiar: (suscripcion: Doc | null) => void, alFallar?: AlFallar): Desuscribir;
  escucharClinica(cid: string, alCambiar: (clinica: Doc | null) => void, alFallar?: AlFallar): Desuscribir;
  escucharColeccion(cid: string, col: string, alCambiar: (docs: Doc[]) => void, opciones?: OpcionesDeEscucha, alFallar?: AlFallar): Desuscribir;
}

export interface SesionDeBackend {
  /** Espera a que se termine de restaurar la sesión guardada (sin esto, una carga en frío ve «sin sesión» aunque la haya). No rechaza. */
  esperarSesion(): Promise<void>;
  /** Entra con email y contraseña; devuelve el id del usuario. Rechaza con `code` de Firebase Auth (`auth/invalid-credential`…): el
   *  adaptador de Supabase los traduce a esos mismos códigos, que son los que entiende `friendlyAuthError` en el login. */
  iniciarSesion(email: string, clave: string): Promise<string>;
  /** Abre la sesión anónima de la demo si no hay ninguna. Devuelve `true` si hay sesión. */
  iniciarSesionDeDemo(): Promise<boolean>;
  cerrarSesion(): Promise<void>;
  /** Id del usuario con sesión, o `null`. Espera a que se restaure la sesión guardada. */
  usuarioActual(): Promise<string | null>;
  /** Credencial para las rutas `/api/*` (`Authorization: Bearer …`); `null` si no hay sesión. */
  token(): Promise<string | null>;
  /** Manda el correo de «olvidé mi contraseña». */
  enviarRecuperacion(email: string): Promise<void>;
}

export type BackendDeDatos = DatosDeBackend & SesionDeBackend;
```

`lib/backend/documentos.ts`:

```ts
/** Operaciones puras sobre documentos JSON, las mismas para cualquier backend. */
import type { Doc } from "./tipos";

/** Copia sin `undefined` (Firestore no los acepta; en JSON no existen). */
export const limpiar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const esMapa = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

/** Fusión como la de Firestore con `{ merge: true }`: los mapas se mezclan en profundidad; los arreglos y los valores simples (incluido
 *  `null`) del parche REEMPLAZAN; lo que el parche no menciona se conserva. No modifica ninguno de los dos. */
export function mezclarProfundo(base: Doc, parche: Doc): Doc {
  const salida: Doc = { ...base };
  for (const [clave, valor] of Object.entries(parche)) {
    if (valor === undefined) continue;
    const actual = salida[clave];
    salida[clave] = esMapa(valor) && esMapa(actual) ? mezclarProfundo(actual, valor) : valor;
  }
  return salida;
}
```

- [ ] **Paso 4: Verla pasar y revisar los tipos.**

```bash
npx vitest run lib/backend/documentos.test.ts && npx tsc --noEmit
```

Esperado: 5 pruebas verdes y `tsc` sin errores.

- [ ] **Paso 5: Commit.**

```bash
git add lib/backend/tipos.ts lib/backend/documentos.ts lib/backend/documentos.test.ts
git commit -m "feat(backend): interfaces de la capa de datos y fusión de documentos como la de Firestore"
```

---

### Tarea 3: Backend en memoria y suite de contrato

**Archivos:**
- Crear: `lib/backend/contrato-de-datos.ts`, `lib/backend/memoria.ts`
- Prueba: `lib/backend/memoria.test.ts`

**Interfaces:**
- Consume: los tipos de la Tarea 2, `mezclarProfundo`/`limpiar` y `COLECCIONES_DE_LA_TIENDA`.
- Produce: `crearBackendEnMemoria(usuarioActual?: () => Promise<string | null>): BackendEnMemoria` (un `DatosDeBackend` más `sembrar(ruta, data)`, `leer(ruta)`, `ids(rutaDeColeccion)`, `vaciar()`); y `describeContratoDeDatos(nombre, abrir: () => Promise<BancoDePruebas>)` con `BancoDePruebas { backend; usuarioId; sembrar(ruta, data); vaciar(); cerrar?() }`.

- [ ] **Paso 1: Escribir la suite de contrato y la prueba que la corre contra la memoria.** La suite define cómo se comporta CUALQUIER backend (17 casos: lectura, escritura, escucha en vivo).

`lib/backend/contrato-de-datos.ts`:

```ts
/** Suite de contrato de `DatosDeBackend`: las mismas pruebas para TODA implementación (memoria, Firestore, y más adelante Supabase). Si una
 *  implementación nueva las pasa, la tienda se comporta igual con ella. Usa `vitest`, así que solo se importa desde archivos `*.test.ts`. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import type { DatosDeBackend, Doc, OpcionesDeLectura } from "./tipos";

export interface BancoDePruebas {
  backend: DatosDeBackend;
  /** El usuario con sesión que ve el backend (lo que devuelve su `usuarioActual`). */
  usuarioId: string | null;
  /** Escribe un documento de cualquier ruta (`clinics/cl1/patients/p1`, `directory/u1`) sin pasar por permisos: arma el escenario. */
  sembrar(ruta: string, data: Doc): Promise<void>;
  /** Borra todos los documentos. */
  vaciar(): Promise<void>;
  cerrar?(): Promise<void>;
}

const CID = "cl1";
const sinDirectos: OpcionesDeLectura = { directos: () => "ninguno" };
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperar(condicion: () => boolean, ms = 5000) {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error("se agotó la espera");
    await pausa(25);
  }
}

export function describeContratoDeDatos(nombre: string, abrir: () => Promise<BancoDePruebas>): void {
  describe(`contrato de datos · ${nombre}`, () => {
    let banco: BancoDePruebas;
    const b = () => banco.backend;
    const leer = async (opciones: OpcionesDeLectura = sinDirectos) => (await b().leerClinica(CID, opciones))!;

    beforeAll(async () => { banco = await abrir(); }, 60_000);
    afterAll(async () => { await banco.cerrar?.(); });
    beforeEach(async () => {
      await banco.vaciar();
      await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", plan: "clinica", config: { moneda: "PYG" } });
    });

    describe("lectura", () => {
      it("devuelve null si la clínica no existe", async () => {
        expect(await b().leerClinica("otra", sinDirectos)).toBeNull();
      });

      it("trae el documento de la clínica, la suscripción (o null) y una lista por cada colección de la tienda", async () => {
        const l = await leer();
        expect(l.clinica).toMatchObject({ id: CID, name: "Clínica" });
        expect(l.suscripcion).toBeNull();
        expect(Object.keys(l.colecciones).sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
        for (const lista of Object.values(l.colecciones)) expect(lista).toEqual([]);
        await banco.sembrar(`subscriptions/${CID}`, { plan: "clinica", status: "active" });
        expect((await leer()).suscripcion).toEqual({ plan: "clinica", status: "active" });
      });

      it("no mezcla documentos de otra clínica", async () => {
        await banco.sembrar(`clinics/otra`, { id: "otra" });
        await banco.sembrar(`clinics/otra/patients/p9`, { id: "p9" });
        await banco.sembrar(`clinics/${CID}/patients/p1`, { id: "p1" });
        expect((await leer()).colecciones.patients).toEqual([{ id: "p1" }]);
      });

      it("pasa a `directos` el padrón de usuarios y el usuario de la sesión, y aplica el filtro que devuelve", async () => {
        await banco.sembrar(`clinics/${CID}/users/u1`, { id: "u1", role: "admin" });
        await banco.sembrar(`clinics/${CID}/directMessages/m1`, { id: "m1", participants: ["u1", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m2`, { id: "m2", participants: ["u3", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m3`, { id: "m3", participants: ["u1", "u3"] });
        const directos = vi.fn(() => "todos" as const);
        const todos = await leer({ directos });
        expect(directos).toHaveBeenCalledWith([{ id: "u1", role: "admin" }], banco.usuarioId);
        expect(todos.colecciones.directMessages.map((d) => d.id)).toEqual(["m1", "m2", "m3"]);
        expect((await leer({ directos: () => "ninguno" })).colecciones.directMessages).toEqual([]);
        const mios = await leer({ directos: () => ({ participante: "u1" }) });
        expect(mios.colecciones.directMessages.map((d) => d.id)).toEqual(["m1", "m3"]);
      });

      it("clinicaDelUsuario devuelve la clínica del directorio, o null si el usuario no figura", async () => {
        await banco.sembrar("directory/u1", { clinicId: CID, email: "a@b.c" });
        expect(await b().clinicaDelUsuario("u1")).toBe(CID);
        expect(await b().clinicaDelUsuario("nadie")).toBeNull();
      });
    });

    describe("escritura", () => {
      it("guardar crea el documento y, si ya existe, lo REEMPLAZA entero", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana", telefono: "123" });
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana María" });
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", nombre: "Ana María" }]);
      });

      it("guardar descarta los undefined", async () => {
        await b().guardar(CID, "patients", "p2", { id: "p2", a: 1, b: undefined });
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p2", a: 1 }]);
      });

      it("quitar borra el documento, y borrar uno que no existe no falla", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1" });
        await b().guardar(CID, "patients", "p2", { id: "p2" });
        await b().quitar(CID, "patients", "p1");
        await b().quitar(CID, "patients", "no-existe");
        expect((await leer()).colecciones.patients).toEqual([{ id: "p2" }]);
      });

      it("fijarCampo cambia solo ese campo, y con undefined lo borra", async () => {
        await b().guardar(CID, "patients", "p1", { id: "p1", nombre: "Ana", seguimiento: { motivo: "x" } });
        await b().fijarCampo(CID, "patients", "p1", "nombre", "Ana María");
        await b().fijarCampo(CID, "patients", "p1", "seguimiento", undefined);
        expect((await leer()).colecciones.patients).toStrictEqual([{ id: "p1", nombre: "Ana María" }]);
      });

      it("fijarCampo sobre un documento que no existe rechaza con code not-found", async () => {
        await expect(b().fijarCampo(CID, "patients", "no-existe", "a", 1)).rejects.toMatchObject({ code: "not-found" });
      });

      it("mezclarClinica fusiona: mapas en profundidad, arreglos reemplazados, el resto se conserva", async () => {
        await banco.sembrar(`clinics/${CID}`, { id: CID, name: "Clínica", config: { a: { x: 1, y: 2 }, lista: [1, 2, 3], z: 9 } });
        await b().mezclarClinica(CID, { config: { a: { y: 20 }, lista: [7] } });
        expect((await leer()).clinica).toStrictEqual({ id: CID, name: "Clínica", config: { a: { x: 1, y: 20 }, lista: [7], z: 9 } });
      });

      it("lote aplica guardar, guardarClinica y mezclarClinica juntos", async () => {
        await b().lote(CID, [
          { tipo: "guardar", col: "users", id: "u1", data: { id: "u1", name: "Ana" } },
          { tipo: "guardar", col: "procedures", id: "D01", data: { cpt: "D01", price: 10 } },
          { tipo: "guardarClinica", data: { id: CID, name: "Nueva" } },
          { tipo: "mezclarClinica", data: { extra: 1 } },
        ]);
        const l = await leer();
        expect(l.clinica).toStrictEqual({ id: CID, name: "Nueva", extra: 1 });
        expect(l.colecciones.users).toEqual([{ id: "u1", name: "Ana" }]);
        expect(l.colecciones.procedures).toEqual([{ cpt: "D01", price: 10 }]);
      });
    });

    describe("escucha en vivo", () => {
      it("escucharColeccion entrega el estado actual y cada cambio, y deja de hacerlo al desuscribir", async () => {
        const vistos: Doc[][] = [];
        const parar = b().escucharColeccion(CID, "outbox", (docs) => vistos.push(docs));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toEqual([]);
        await b().guardar(CID, "outbox", "t1", { id: "t1", status: "pendiente" });
        await esperar(() => vistos.at(-1)?.length === 1);
        parar();
        const cantidad = vistos.length;
        await b().guardar(CID, "outbox", "t2", { id: "t2" });
        await pausa(300);
        expect(vistos.length).toBe(cantidad);
      });

      it("escucharColeccion con participante entrega solo los suyos", async () => {
        await banco.sembrar(`clinics/${CID}/directMessages/m1`, { id: "m1", participants: ["u1", "u2"] });
        await banco.sembrar(`clinics/${CID}/directMessages/m2`, { id: "m2", participants: ["u3", "u2"] });
        let ultimo: Doc[] = [];
        const parar = b().escucharColeccion(CID, "directMessages", (docs) => { ultimo = docs; }, { participante: "u1" });
        await esperar(() => ultimo.length === 1);
        expect(ultimo[0].id).toBe("m1");
        await b().guardar(CID, "directMessages", "m3", { id: "m3", participants: ["u1", "u9"] });
        await esperar(() => ultimo.length === 2);
        parar();
        expect(ultimo.map((d) => d.id).sort()).toEqual(["m1", "m3"]);
      });

      it("escucharColeccion con ordenarPor entrega de menor a mayor", async () => {
        await banco.sembrar(`clinics/${CID}/teamMessages/a`, { id: "a", createdAt: "2026-01-02" });
        await banco.sembrar(`clinics/${CID}/teamMessages/b`, { id: "b", createdAt: "2026-01-01" });
        await banco.sembrar(`clinics/${CID}/teamMessages/c`, { id: "c", createdAt: "2026-01-03" });
        let ultimo: Doc[] = [];
        const parar = b().escucharColeccion(CID, "teamMessages", (docs) => { ultimo = docs; }, { ordenarPor: "createdAt" });
        await esperar(() => ultimo.length === 3);
        parar();
        expect(ultimo.map((d) => d.id)).toEqual(["b", "a", "c"]);
      });

      it("escucharClinica entrega el documento y sus cambios", async () => {
        const vistos: Array<Doc | null> = [];
        const parar = b().escucharClinica(CID, (c) => vistos.push(c));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toMatchObject({ id: CID, name: "Clínica" });
        await b().mezclarClinica(CID, { config: { moneda: "USD" } });
        await esperar(() => (vistos.at(-1) as Doc | null)?.config !== vistos[0]?.config);
        parar();
        expect((vistos.at(-1) as Doc).config).toEqual({ moneda: "USD" });
      });

      it("escucharSuscripcion entrega null si no hay y el documento cuando aparece", async () => {
        const vistos: Array<Doc | null> = [];
        const parar = b().escucharSuscripcion(CID, (s) => vistos.push(s));
        await esperar(() => vistos.length >= 1);
        expect(vistos[0]).toBeNull();
        await banco.sembrar(`subscriptions/${CID}`, { plan: "cadena" });
        await esperar(() => vistos.at(-1) !== null);
        parar();
        expect(vistos.at(-1)).toEqual({ plan: "cadena" });
      });
    });
  });
}
```

`lib/backend/memoria.test.ts`:

```ts
import { describeContratoDeDatos } from "./contrato-de-datos";
import { crearBackendEnMemoria } from "./memoria";

describeContratoDeDatos("memoria", async () => {
  const usuarioId = "u-sesion";
  const memoria = crearBackendEnMemoria(async () => usuarioId);
  return {
    backend: memoria,
    usuarioId,
    sembrar: async (ruta, data) => memoria.sembrar(ruta, data),
    vaciar: async () => memoria.vaciar(),
  };
});
```

- [ ] **Paso 2: Verla fallar.**

```bash
npx vitest run lib/backend/memoria.test.ts
```

Esperado: FAIL (no existe `./memoria`).

- [ ] **Paso 3: Escribir el backend en memoria.**

`lib/backend/memoria.ts`:

```ts
/** Backend en memoria: la misma interfaz que Firestore, sin red. Sirve para probar la lógica que usa la capa de datos (carga de la clínica,
 *  semilla de la demo…) y es la implementación de referencia del contrato (`contrato-de-datos.ts`). No se usa en la app. */
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { limpiar, mezclarProfundo } from "./documentos";
import type {
  DatosDeBackend, Desuscribir, Doc, FiltroDeDirectos, LecturaDeClinica, OperacionDeLote, OpcionesDeEscucha, OpcionesDeLectura,
} from "./tipos";

export interface BackendEnMemoria extends DatosDeBackend {
  /** Escribe un documento en cualquier ruta (`clinics/cl1/patients/p1`) sin pasar por ninguna regla: para armar el escenario de una prueba. */
  sembrar(ruta: string, data: Doc): void;
  /** Lee un documento de cualquier ruta; `undefined` si no existe. */
  leer(ruta: string): Doc | undefined;
  /** Los ids de los documentos de una colección (`clinics/cl1/patients`), ordenados. */
  ids(rutaDeColeccion: string): string[];
  vaciar(): void;
}

const noEncontrado = (ruta: string) => Object.assign(new Error(`No existe el documento ${ruta}`), { code: "not-found" });

function filtrarDirectos(lista: Doc[], filtro: FiltroDeDirectos): Doc[] {
  if (filtro === "todos") return lista;
  if (filtro === "ninguno") return [];
  return lista.filter((d) => Array.isArray(d.participants) && d.participants.includes(filtro.participante));
}

export function crearBackendEnMemoria(usuarioActual: () => Promise<string | null> = async () => null): BackendEnMemoria {
  const docs = new Map<string, Doc>();
  const oyentes = new Set<() => void>();
  const avisar = () => queueMicrotask(() => { for (const o of [...oyentes]) o(); });

  const copia = (d: Doc | undefined): Doc | null => (d ? limpiar(d) : null);
  const ids = (coleccion: string) =>
    [...docs.keys()].filter((r) => r.startsWith(`${coleccion}/`) && !r.slice(coleccion.length + 1).includes("/")).map((r) => r.slice(coleccion.length + 1)).sort();
  const listar = (coleccion: string): Doc[] => ids(coleccion).map((id) => limpiar(docs.get(`${coleccion}/${id}`)!));
  const rutaDe = (cid: string, col: string, id: string) => `clinics/${cid}/${col}/${id}`;

  function consultar(cid: string, col: string, opciones?: OpcionesDeEscucha): Doc[] {
    let lista = listar(`clinics/${cid}/${col}`);
    if (opciones?.participante) lista = filtrarDirectos(lista, { participante: opciones.participante });
    const campo = opciones?.ordenarPor;
    // Como `orderBy` de Firestore: los documentos que no tienen el campo no aparecen.
    if (campo) lista = lista.filter((d) => d[campo] !== undefined).sort((a, b) => String(a[campo]).localeCompare(String(b[campo])));
    return lista;
  }

  function escuchar<T>(leer: () => T, alCambiar: (valor: T) => void): Desuscribir {
    let ultimo: string | undefined;
    let activo = true;
    const revisar = () => {
      if (!activo) return;
      const valor = leer();
      const huella = JSON.stringify(valor);
      if (huella === ultimo) return;
      ultimo = huella;
      alCambiar(valor);
    };
    oyentes.add(revisar);
    queueMicrotask(revisar); // el estado inicial llega después, de forma asíncrona, como en Firestore
    return () => { activo = false; oyentes.delete(revisar); };
  }

  const aplicar = (cid: string, op: OperacionDeLote) => {
    if (op.tipo === "guardar") docs.set(rutaDe(cid, op.col, op.id), limpiar(op.data as Doc));
    else if (op.tipo === "guardarClinica") docs.set(`clinics/${cid}`, limpiar(op.data as Doc));
    else docs.set(`clinics/${cid}`, mezclarProfundo(docs.get(`clinics/${cid}`) ?? {}, limpiar(op.data as Doc)));
  };

  return {
    tipo: "memoria",

    async leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null> {
      const clinica = copia(docs.get(`clinics/${cid}`));
      if (!clinica) return null;
      const lista = (col: string) => listar(`clinics/${cid}/${col}`);
      const filtro = opciones.directos(lista("users"), await usuarioActual());
      const colecciones: Record<string, Doc[]> = {};
      for (const col of COLECCIONES_DE_LA_TIENDA) colecciones[col] = col === "directMessages" ? filtrarDirectos(lista(col), filtro) : lista(col);
      return { clinica, suscripcion: copia(docs.get(`subscriptions/${cid}`)), colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      const clinicId = docs.get(`directory/${uid}`)?.clinicId;
      return typeof clinicId === "string" ? clinicId : null;
    },

    async guardar(cid, col, id, data) {
      docs.set(rutaDe(cid, col, id), limpiar(data as Doc));
      avisar();
    },
    async quitar(cid, col, id) {
      docs.delete(rutaDe(cid, col, id));
      avisar();
    },
    async fijarCampo(cid, col, id, campo, valor) {
      const ruta = rutaDe(cid, col, id);
      const actual = docs.get(ruta);
      if (!actual) throw noEncontrado(ruta);
      const nuevo: Doc = { ...actual };
      if (valor === undefined) delete nuevo[campo];
      else nuevo[campo] = limpiar(valor);
      docs.set(ruta, nuevo);
      avisar();
    },
    async mezclarClinica(cid, data) {
      aplicar(cid, { tipo: "mezclarClinica", data });
      avisar();
    },
    async lote(cid, ops) {
      for (const op of ops) aplicar(cid, op);
      avisar();
    },

    escucharSuscripcion: (cid, alCambiar) => escuchar(() => copia(docs.get(`subscriptions/${cid}`)), alCambiar),
    escucharClinica: (cid, alCambiar) => escuchar(() => copia(docs.get(`clinics/${cid}`)), alCambiar),
    escucharColeccion: (cid, col, alCambiar, opciones) => escuchar(() => consultar(cid, col, opciones), alCambiar),

    sembrar(ruta, data) { docs.set(ruta, limpiar(data)); avisar(); },
    leer: (ruta) => copia(docs.get(ruta)) ?? undefined,
    ids,
    vaciar() { docs.clear(); avisar(); },
  };
}
```

- [ ] **Paso 4: Verla pasar.**

```bash
npx vitest run lib/backend/memoria.test.ts && npx tsc --noEmit
```

Esperado: 17 pruebas verdes y `tsc` sin errores.

- [ ] **Paso 5: Commit.**

```bash
git add lib/backend/contrato-de-datos.ts lib/backend/memoria.ts lib/backend/memoria.test.ts
git commit -m "feat(backend): backend en memoria y suite de contrato de datos"
```

---

### Tarea 4: Carga de la clínica (la política, fuera de la tienda)

**Archivos:**
- Crear: `lib/backend/constantes.ts`, `lib/backend/carga.ts`
- Prueba: `lib/backend/carga.test.ts`

**Interfaces:**
- Consume: `DatosDeBackend`, `crearBackendEnMemoria` (solo en la prueba), `buildSeed` (`lib/seed.ts`), `can` (`lib/rbac.ts`), `DB` y los tipos de documentos de `lib/types.ts`.
- Produce: `CLINICA_DEMO = "cl_demo"`; `filtroDeDirectos(cid, usuarios: Doc[], usuarioId: string | null): FiltroDeDirectos`; `opsDeSemilla(seed: DB): OperacionDeLote[]`; `armarDB(cid, lectura: LecturaDeClinica): DB`; `cargarDB(backend: DatosDeBackend, cid: string): Promise<DB>` (rechaza con `Error("CLINICA_NO_ENCONTRADA")` si una clínica real no existe).

Esta tarea reemplaza a `loadFirestore` y `seedFirestore` de `lib/store.tsx`, que se retiran en la Tarea 6.

- [ ] **Paso 1: Escribir la prueba que falla.**

`lib/backend/carga.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { armarDB, cargarDB, filtroDeDirectos, opsDeSemilla } from "./carga";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { CLINICA_DEMO } from "./constantes";
import { crearBackendEnMemoria } from "./memoria";
import { buildSeed } from "../seed";

const usuarios = [
  { id: "admin1", role: "admin", active: true },
  { id: "dent1", role: "dentist", active: true },
  { id: "baja1", role: "assistant", active: false },
];

describe("filtroDeDirectos", () => {
  it("la demo lee todos los directos, con o sin sesión", () => {
    expect(filtroDeDirectos(CLINICA_DEMO, [], null)).toBe("todos");
  });
  it("el admin lee todos; el resto, solo los suyos", () => {
    expect(filtroDeDirectos("cl1", usuarios, "admin1")).toBe("todos");
    expect(filtroDeDirectos("cl1", usuarios, "dent1")).toEqual({ participante: "dent1" });
  });
  it("sin sesión, sin figurar en el padrón o dado de baja: ninguno", () => {
    expect(filtroDeDirectos("cl1", usuarios, null)).toBe("ninguno");
    expect(filtroDeDirectos("cl1", usuarios, "desconocido")).toBe("ninguno");
    expect(filtroDeDirectos("cl1", usuarios, "baja1")).toBe("ninguno");
  });
});

describe("opsDeSemilla", () => {
  it("guarda el documento de la clínica con su onboarding y un documento por cada elemento de la semilla (procedimientos por su cpt)", () => {
    const seed = buildSeed();
    const ops = opsDeSemilla(seed);
    expect(ops[0]).toEqual({ tipo: "guardarClinica", data: { ...seed.clinics[0], onboarding: seed.onboarding } });
    const guardados = ops.filter((o) => o.tipo === "guardar") as Array<{ col: string; id: string }>;
    expect(guardados.filter((o) => o.col === "procedures").map((o) => o.id)).toEqual(seed.procedures.map((p) => p.cpt));
    expect(guardados.filter((o) => o.col === "patients").map((o) => o.id)).toEqual(seed.patients.map((p) => p.id));
    expect(guardados.length).toBe(
      ["users", "patients", "appointments", "billing", "procedures", "budgets", "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
        "patientNotes", "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages", "directMessages", "surveys", "surveyResponses",
        "mgmtTasks", "environmentalLogs", "eduVideos", "branches", "clinicalDocs", "routineChecks", "agendaBlocks"]
        .reduce((n, c) => n + (seed as unknown as Record<string, unknown[]>)[c].length, 0),
    );
  });
});

describe("armarDB", () => {
  it("devuelve una lista (vacía si no vino nada) por cada colección de la tienda, el onboarding por defecto y la suscripción", () => {
    const db = armarDB("cl1", { clinica: { id: "cl1", name: "Real", plan: "clinica", config: { currency: "PYG" } }, suscripcion: null, colecciones: {} });
    const listas = Object.keys(db).filter((k) => Array.isArray((db as unknown as Record<string, unknown>)[k]) && k !== "clinics");
    expect(listas.sort()).toEqual([...COLECCIONES_DE_LA_TIENDA].sort());
    expect(db.clinics).toEqual([{ id: "cl1", name: "Real", plan: "clinica", config: { currency: "PYG" } }]);
    expect(db.onboarding).toEqual({ usersCreated: false, servicesDefined: false, tourDone: false });
    expect(db.subscription).toBeNull();
  });
});

describe("cargarDB", () => {
  it("una clínica real que no existe rechaza con CLINICA_NO_ENCONTRADA y no escribe nada", async () => {
    const memoria = crearBackendEnMemoria();
    await expect(cargarDB(memoria, "cl_real")).rejects.toThrow("CLINICA_NO_ENCONTRADA");
    expect(memoria.ids("clinics")).toEqual([]);
  });

  it("la demo que no existe se siembra y se devuelve la semilla", async () => {
    const memoria = crearBackendEnMemoria();
    const db = await cargarDB(memoria, CLINICA_DEMO);
    const seed = buildSeed();
    expect(db.users.length).toBe(seed.users.length);
    expect(memoria.ids("clinics/cl_demo/users").length).toBe(seed.users.length);
    expect(memoria.ids("clinics/cl_demo/procedures").sort()).toEqual(seed.procedures.map((p) => p.cpt).sort());
    expect(memoria.leer("clinics/cl_demo")).toMatchObject({ id: "cl_demo", onboarding: seed.onboarding });
  });

  it("una clínica real se arma con lo que hay: sin tocar nada ni sembrar nada, con su suscripción", async () => {
    const memoria = crearBackendEnMemoria(async () => "admin1");
    memoria.sembrar("clinics/cl_real", { id: "cl_real", name: "Real", plan: "clinica", config: { currency: "PYG" } });
    memoria.sembrar("clinics/cl_real/users/admin1", { id: "admin1", role: "admin", active: true });
    memoria.sembrar("clinics/cl_real/patients/p1", { id: "p1" });
    memoria.sembrar("clinics/cl_real/directMessages/m1", { id: "m1", participants: ["x", "y"] });
    memoria.sembrar("subscriptions/cl_real", { plan: "clinica", status: "active" });
    const antes = memoria.ids("clinics/cl_real/budgets");
    const db = await cargarDB(memoria, "cl_real");
    expect(db.clinics[0]).toMatchObject({ id: "cl_real", name: "Real" });
    expect(db.patients).toEqual([{ id: "p1" }]);
    expect(db.directMessages.map((d) => d.id)).toEqual(["m1"]); // es admin: los ve todos
    expect(db.subscription).toEqual({ plan: "clinica", status: "active" });
    expect(db.budgets).toEqual([]);
    expect(memoria.ids("clinics/cl_real/budgets")).toEqual(antes); // las mejoras de la demo no tocan a una clínica real
    expect(memoria.ids("clinics/cl_real/outbox")).toEqual([]);
  });

  it("un no-admin recibe solo sus directos", async () => {
    const memoria = crearBackendEnMemoria(async () => "dent1");
    memoria.sembrar("clinics/cl_real", { id: "cl_real", name: "Real", plan: "clinica", config: {} });
    memoria.sembrar("clinics/cl_real/users/dent1", { id: "dent1", role: "dentist", active: true });
    memoria.sembrar("clinics/cl_real/directMessages/m1", { id: "m1", participants: ["dent1", "admin1"] });
    memoria.sembrar("clinics/cl_real/directMessages/m2", { id: "m2", participants: ["admin1", "x"] });
    expect((await cargarDB(memoria, "cl_real")).directMessages.map((d) => d.id)).toEqual(["m1"]);
  });

  it("la demo a la que le faltan los módulos nuevos (presupuestos, inventario, Botika) los recibe una sola vez", async () => {
    const memoria = crearBackendEnMemoria();
    memoria.sembrar("clinics/cl_demo", { id: "cl_demo", name: "Demo", plan: "clinica", config: {} });
    const seed = buildSeed();
    const db = await cargarDB(memoria, CLINICA_DEMO);
    expect(db.budgets.length).toBe(seed.budgets.length);
    expect(db.stock.length).toBe(seed.stock.length);
    expect(db.outbox.length).toBe(seed.outbox.length);
    expect(memoria.ids("clinics/cl_demo/budgets").length).toBe(seed.budgets.length);
    expect(memoria.ids("clinics/cl_demo/outbox").length).toBe(seed.outbox.length);
    expect(memoria.leer("clinics/cl_demo")?.config).toHaveProperty("botika");
    expect(db.clinics[0].config).toHaveProperty("botika");
    // La segunda vez ya no hay nada que agregar: la base devuelve lo que se escribió.
    const otra = await cargarDB(memoria, CLINICA_DEMO);
    expect(otra.budgets.length).toBe(seed.budgets.length);
  });
});
```

- [ ] **Paso 2: Verla fallar.**

```bash
npx vitest run lib/backend/carga.test.ts
```

Esperado: FAIL (no existen `./carga` ni `./constantes`).

- [ ] **Paso 3: Escribir la constante y la política de carga.**

`lib/backend/constantes.ts`:

```ts
/** Id de la clínica de ejemplo (sandbox de ventas): datos publicados a propósito, se lee sin cuenta y se escribe con la sesión anónima. */
export const CLINICA_DEMO = "cl_demo";
```

`lib/backend/carga.ts`:

```ts
/** Carga de una clínica: qué lee la tienda al abrirla, cómo arma la `DB` y qué siembra o actualiza en la demo.
 *
 *  Antes vivía dentro de `lib/store.tsx` mezclada con las llamadas a Firestore (`loadFirestore` y `seedFirestore`). Acá solo hay decisiones y
 *  armado de datos: todo el acceso a la base pasa por `DatosDeBackend`, así que se prueba con el backend en memoria y sirve igual con cualquier
 *  otro. Pruebas: carga.test.ts. */
import type {
  AgendaBlock, Appointment, BillingRecord, Box, Branch, Budget, Campaign, CashSession, CrmCard, DB, DirectMessage, DocumentoClinico, EduVideo,
  EnvironmentalLog, Expense, FiscalDoc, LabOrder, MgmtTask, OutboxTask, Patient, PatientNote, Payment, Procedure, RadiographRec,
  RecoveryMonitor, RutinaCheck, Settlement, SignatureDoc, StockItem, StockMove, SterilizationCycle, Subscription, Survey, SurveyResponse,
  TeamMessage, User, WaitlistEntry,
} from "../types";
import { buildSeed } from "../seed";
import { can } from "../rbac";
import { CLINICA_DEMO } from "./constantes";
import type { DatosDeBackend, Doc, FiltroDeDirectos, LecturaDeClinica, OperacionDeLote } from "./tipos";

/** Qué parte de `directMessages` lee cada uno.
 *
 *  Un directo es de sus dos participantes y del admin (firestore.rules), y como las reglas NO son filtros, pedir la colección entera siendo
 *  recepcionista no devuelve «lo suyo»: Firestore rechaza la consulta ENTERA. Por eso cada uno pide sus conversaciones
 *  (`participants` contiene su id); la colección completa es para el admin y para la demo, que es pública. El rol sale del padrón que se está
 *  cargando —la misma fuente que usan las reglas— y no de la sesión de localStorage, que se edita a mano. */
export function filtroDeDirectos(cid: string, usuarios: Doc[], usuarioId: string | null): FiltroDeDirectos {
  if (cid === CLINICA_DEMO) return "todos";
  const yo = usuarioId ? (usuarios as unknown as User[]).find((u) => u.id === usuarioId) : undefined;
  if (!usuarioId || !yo || yo.active === false) return "ninguno";
  return can(yo.role, "users.manage") ? "todos" : { participante: usuarioId };
}

/** Las colecciones que trae la semilla de la demo (las otras —radiografías, firmas, CRM…— nacen vacías). */
const COLECCIONES_SEMBRADAS = [
  "users", "patients", "appointments", "billing", "procedures", "budgets", "payments", "expenses", "stock", "stockMoves", "waitlist", "outbox",
  "patientNotes", "fiscalDocs", "cashSessions", "sterilizationCycles", "teamMessages", "directMessages", "surveys", "surveyResponses",
  "mgmtTasks", "environmentalLogs", "eduVideos", "branches", "clinicalDocs", "routineChecks", "agendaBlocks",
] as const;

/** Las operaciones que escriben la semilla de la demo (el documento de la clínica y cada documento de las colecciones sembradas). */
export function opsDeSemilla(seed: DB): OperacionDeLote[] {
  const ops: OperacionDeLote[] = [{ tipo: "guardarClinica", data: { ...seed.clinics[0], onboarding: seed.onboarding } }];
  const listas = seed as unknown as Record<string, Array<Record<string, unknown>>>;
  for (const col of COLECCIONES_SEMBRADAS) {
    for (const x of listas[col]) ops.push({ tipo: "guardar", col, id: String(col === "procedures" ? x.cpt : x.id), data: x });
  }
  return ops;
}

const filas = <T,>(docs: Doc[] | undefined) => (docs ?? []) as unknown as T[];

/** Arma la `DB` de la tienda con lo que devolvió el backend. */
export function armarDB(cid: string, lectura: LecturaDeClinica): DB {
  const meta = lectura.clinica as any;
  const c = lectura.colecciones;
  return {
    clinics: [{ id: cid, name: meta.name, plan: meta.plan, config: meta.config }],
    users: filas<User>(c.users),
    patients: filas<Patient>(c.patients),
    appointments: filas<Appointment>(c.appointments),
    billing: filas<BillingRecord>(c.billing),
    procedures: filas<Procedure>(c.procedures),
    budgets: filas<Budget>(c.budgets),
    payments: filas<Payment>(c.payments),
    expenses: filas<Expense>(c.expenses),
    stock: filas<StockItem>(c.stock),
    stockMoves: filas<StockMove>(c.stockMoves),
    waitlist: filas<WaitlistEntry>(c.waitlist),
    outbox: filas<OutboxTask>(c.outbox),
    recoveryMonitors: filas<RecoveryMonitor>(c.recoveryMonitors),
    radiographs: filas<RadiographRec>(c.radiographs),
    signatures: filas<SignatureDoc>(c.signatures),
    crmCards: filas<CrmCard>(c.crmCards),
    campaigns: filas<Campaign>(c.campaigns),
    labOrders: filas<LabOrder>(c.labOrders),
    settlements: filas<Settlement>(c.settlements),
    boxes: filas<Box>(c.boxes),
    patientNotes: filas<PatientNote>(c.patientNotes),
    fiscalDocs: filas<FiscalDoc>(c.fiscalDocs),
    cashSessions: filas<CashSession>(c.cashSessions),
    sterilizationCycles: filas<SterilizationCycle>(c.sterilizationCycles),
    teamMessages: filas<TeamMessage>(c.teamMessages),
    directMessages: filas<DirectMessage>(c.directMessages),
    clinicalDocs: filas<DocumentoClinico>(c.clinicalDocs),
    routineChecks: filas<RutinaCheck>(c.routineChecks),
    agendaBlocks: filas<AgendaBlock>(c.agendaBlocks),
    surveys: filas<Survey>(c.surveys),
    surveyResponses: filas<SurveyResponse>(c.surveyResponses),
    mgmtTasks: filas<MgmtTask>(c.mgmtTasks),
    environmentalLogs: filas<EnvironmentalLog>(c.environmentalLogs),
    eduVideos: filas<EduVideo>(c.eduVideos),
    branches: filas<Branch>(c.branches),
    onboarding: meta.onboarding ?? { usersCreated: false, servicesDefined: false, tourDone: false },
    subscription: (lectura.suscripcion as Subscription | null) ?? null,
  };
}

/** Pone al día la demo (SOLO la demo: una clínica real recién creada está vacía a propósito). Modifica `db` y escribe lo que agrega. */
async function actualizarDemo(backend: DatosDeBackend, cid: string, db: DB): Promise<void> {
  if (cid !== CLINICA_DEMO) return;

  /* Upgrade v3: bases creadas antes de los módulos nuevos — sembramos presupuestos/caja/inventario/espera demo una sola vez. */
  if (db.budgets.length === 0 && db.stock.length === 0) {
    const seed = buildSeed();
    const ops: OperacionDeLote[] = [];
    for (const g of seed.budgets) ops.push({ tipo: "guardar", col: "budgets", id: g.id, data: g });
    for (const p of seed.payments) ops.push({ tipo: "guardar", col: "payments", id: p.id, data: p });
    for (const e of seed.expenses) ops.push({ tipo: "guardar", col: "expenses", id: e.id, data: e });
    for (const s of seed.stock) ops.push({ tipo: "guardar", col: "stock", id: s.id, data: s });
    for (const m of seed.stockMoves) ops.push({ tipo: "guardar", col: "stockMoves", id: m.id, data: m });
    for (const w of seed.waitlist) ops.push({ tipo: "guardar", col: "waitlist", id: w.id, data: w });
    /* enriquecer config (convenios/plantilla) y pacientes demo (recetas/ortodoncia) si faltan */
    const cfg = { ...seed.clinics[0].config, ...db.clinics[0].config };
    if (!db.clinics[0].config?.convenios) {
      ops.push({ tipo: "mezclarClinica", data: { config: cfg } });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (!sp) return p;
      const upgraded = { ...p, prescriptions: p.prescriptions ?? sp.prescriptions, ortho: p.ortho ?? sp.ortho };
      if (upgraded !== p && (sp.prescriptions || sp.ortho)) ops.push({ tipo: "guardar", col: "patients", id: p.id, data: upgraded });
      return upgraded;
    });
    db.users = db.users.map((u) => {
      const su = seed.users.find((x) => x.id === u.id);
      if (su?.commissionPct && u.commissionPct === undefined) {
        const up = { ...u, commissionPct: su.commissionPct };
        ops.push({ tipo: "guardar", col: "users", id: u.id, data: up });
        return up;
      }
      return u;
    });
    await backend.lote(cid, ops).catch((e) => console.warn("upgrade v3", e));
    db.budgets = seed.budgets; db.payments = seed.payments; db.expenses = seed.expenses;
    db.stock = seed.stock; db.stockMoves = seed.stockMoves; db.waitlist = seed.waitlist;
  }

  /* Upgrade v4: integración Botika (outbox + NPS + config) */
  if (db.outbox.length === 0) {
    const seed = buildSeed();
    const ops: OperacionDeLote[] = [];
    for (const t of seed.outbox) ops.push({ tipo: "guardar", col: "outbox", id: t.id, data: t });
    if (!db.clinics[0].config?.botika) {
      const cfg = { ...db.clinics[0].config, botika: seed.clinics[0].config.botika };
      ops.push({ tipo: "mezclarClinica", data: { config: cfg } });
      db.clinics[0].config = cfg;
    }
    db.patients = db.patients.map((p) => {
      const sp = seed.patients.find((x) => x.id === p.id);
      if (sp?.nps && !p.nps) {
        const up = { ...p, nps: sp.nps };
        ops.push({ tipo: "guardar", col: "patients", id: p.id, data: up });
        return up;
      }
      return p;
    });
    await backend.lote(cid, ops).catch((e) => console.warn("upgrade v4", e));
    db.outbox = seed.outbox;
  }
}

/** Carga la clínica `cid` desde el backend y devuelve la `DB` de la tienda.
 *  - Si no existe y es la demo, la siembra. Si no existe y es una clínica real, rechaza con `CLINICA_NO_ENCONTRADA` (sesión huérfana: quien
 *    llama limpia y vuelve a la demo).
 *  - Una colección que el rol no puede leer llega vacía (que una asistente no vea los gastos ES la regla de negocio; la interfaz ya esconde
 *    esas pantallas por `can(role, …)`).
 *  - Los errores de red, de cuota o de configuración sí rechazan. */
export async function cargarDB(backend: DatosDeBackend, cid: string): Promise<DB> {
  const lectura = await backend.leerClinica(cid, { directos: (usuarios, usuarioId) => filtroDeDirectos(cid, usuarios, usuarioId) });
  if (!lectura) {
    if (cid !== CLINICA_DEMO) throw new Error("CLINICA_NO_ENCONTRADA");
    const seed = buildSeed();
    await backend.lote(cid, opsDeSemilla(seed));
    return seed;
  }
  const db = armarDB(cid, lectura);
  await actualizarDemo(backend, cid, db);
  return db;
}
```

- [ ] **Paso 4: Verla pasar.**

```bash
npx vitest run lib/backend/carga.test.ts && npx tsc --noEmit
```

Esperado: 10 pruebas verdes y `tsc` sin errores. (Si `tsc` se queja de un tipo importado de `../types`, es que cambió su nombre: usá el que exporte `lib/types.ts`.)

- [ ] **Paso 5: Commit.**

```bash
git add lib/backend/constantes.ts lib/backend/carga.ts lib/backend/carga.test.ts
git commit -m "feat(backend): la carga de la clínica y la semilla de la demo salen de la tienda y se prueban sin base"
```

---

### Tarea 5: Implementación sobre Firestore y pruebas con el emulador

**Archivos:**
- Crear: `lib/backend/firestore.ts`, `vitest.emulador.config.ts`
- Modificar: `vitest.config.ts`, `package.json`
- Pruebas: `lib/backend/firestore.contrato.emulador.test.ts`, `lib/backend/firestore.reglas.emulador.test.ts`

**Interfaces:**
- Consume: `lib/firebase.ts` (`app`, `fsdb`, `signInEmail`, `currentIdToken`, `signOutUser`, `currentAuthUid`, `signInAnonymousIfNeeded`, `sendPasswordReset`), el manifiesto, `limpiar` y los tipos.
- Produce: `crearDatosFirestore(db: Firestore, usuarioActual: () => Promise<string | null>): DatosDeBackend`; `sesionFirebase: SesionDeBackend`; `backendFirestore: BackendDeDatos`.

- [ ] **Paso 1: Configuración de las pruebas con el emulador.** `npm test` no las corre (necesitan Java y el CLI); `npm run test:backend` sí.

`vitest.emulador.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Las pruebas que necesitan el emulador de Firestore (`*.emulador.test.ts`): `npm run test:backend`. `npm test` no las corre. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["**/*.emulador.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
    fileParallelism: false, // un solo emulador: un archivo a la vez
  },
});
```

En `vitest.config.ts`, sumá la exclusión (reemplazá esta línea):

```ts
    exclude: ["**/node_modules/**", "**/.next/**", "components/odontogram-engine/**"],
```

por:

```ts
    exclude: ["**/node_modules/**", "**/.next/**", "components/odontogram-engine/**", "**/*.emulador.test.ts"],
```

y en `package.json`, en `scripts`, agregá justo debajo de `"test:rules"`:

```json
    "test:backend": "firebase emulators:exec --only firestore \"vitest run -c vitest.emulador.config.ts\"",
```

- [ ] **Paso 2: Escribir las pruebas que fallan.** La primera corre el contrato de datos contra Firestore de verdad (reglas abiertas); la segunda lee la clínica con las **reglas reales** y comprueba lo que recibe cada rol.

`lib/backend/firestore.contrato.emulador.test.ts`:

```ts
/** Corre el contrato de datos contra Firestore de verdad (el emulador). Requiere Java y el CLI de Firebase: `npm run test:backend`. */
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { describeContratoDeDatos } from "./contrato-de-datos";
import { crearDatosFirestore } from "./firestore";

const REGLAS_ABIERTAS = "rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if true; } } }";

describeContratoDeDatos("Firestore (emulador)", async () => {
  const usuarioId = "u-sesion";
  const entorno = await initializeTestEnvironment({ projectId: "novudent-backend-contrato", firestore: { rules: REGLAS_ABIERTAS } });
  const db = entorno.unauthenticatedContext().firestore() as unknown as Firestore;
  return {
    backend: crearDatosFirestore(db, async () => usuarioId),
    usuarioId,
    sembrar: (ruta, data) => setDoc(doc(db, ruta), data),
    vaciar: () => entorno.clearFirestore(),
    cerrar: () => entorno.cleanup(),
  };
});
```

`lib/backend/firestore.reglas.emulador.test.ts`:

```ts
/** La lectura de la clínica con las reglas REALES de firestore.rules: lo que cada rol recibe de verdad. Requiere el emulador: `npm run test:backend`. */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, type Firestore } from "firebase/firestore";
import { filtroDeDirectos } from "./carga";
import { crearDatosFirestore } from "./firestore";

const CID = "clA";
let entorno: RulesTestEnvironment;

const como = (uid: string) => {
  const db = entorno.authenticatedContext(uid).firestore() as unknown as Firestore;
  return crearDatosFirestore(db, async () => uid);
};
const politica = { directos: (usuarios: Parameters<typeof filtroDeDirectos>[1], id: string | null) => filtroDeDirectos(CID, usuarios, id) };

beforeAll(async () => {
  entorno = await initializeTestEnvironment({ projectId: "novudent-backend-reglas", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `clinics/${CID}`), { id: CID, name: "A", plan: "clinica", config: {} });
    await setDoc(doc(db, `clinics/${CID}/users/adminA`), { id: "adminA", role: "admin", active: true, clinicId: CID });
    await setDoc(doc(db, `clinics/${CID}/users/dentA`), { id: "dentA", role: "dentist", active: true, clinicId: CID });
    await setDoc(doc(db, `clinics/${CID}/patients/p1`), { id: "p1", firstName: "Ana" });
    await setDoc(doc(db, `clinics/${CID}/expenses/e1`), { id: "e1", amount: 100 });
    await setDoc(doc(db, `clinics/${CID}/directMessages/m1`), { id: "m1", participants: ["dentA", "adminA"] });
    await setDoc(doc(db, `clinics/${CID}/directMessages/m2`), { id: "m2", participants: ["adminA", "otro"] });
  });
}, 60_000);
afterAll(async () => { await entorno.cleanup(); });

describe("leerClinica con las reglas reales", () => {
  it("el administrador recibe todo: gastos y todos los directos", async () => {
    const l = (await como("adminA").leerClinica(CID, politica))!;
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
    expect(l.colecciones.expenses.map((d) => d.id)).toEqual(["e1"]);
    expect(l.colecciones.directMessages.map((d) => d.id).sort()).toEqual(["m1", "m2"]);
  });

  it("un dentista recibe lo suyo: sin gastos (permission-denied → vacío, no rompe) y solo sus directos", async () => {
    const l = (await como("dentA").leerClinica(CID, politica))!;
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
    expect(l.colecciones.expenses).toEqual([]);
    expect(l.colecciones.directMessages.map((d) => d.id)).toEqual(["m1"]);
  });

  it("pedir todos los directos siendo dentista no rompe la carga: llega vacío (por eso el filtro se arma por rol)", async () => {
    const l = (await como("dentA").leerClinica(CID, { directos: () => "todos" }))!;
    expect(l.colecciones.directMessages).toEqual([]);
    expect(l.colecciones.patients.map((d) => d.id)).toEqual(["p1"]);
  });

  it("alguien que no es de la clínica no lee nada de ella", async () => {
    await expect(como("intruso").leerClinica(CID, politica)).rejects.toMatchObject({ code: "permission-denied" });
  });
});
```

- [ ] **Paso 3: Verlas fallar.**

```bash
npm run test:backend
```

Esperado: FAIL (no existe `./firestore`). Tarda unos 10 s: arranca el emulador.

- [ ] **Paso 4: Escribir la implementación.** Es la lógica de `loadFirestore`, `fsSave`, `fsDelete`, `fsCampo`, `fsMeta` y los `onSnapshot` de la tienda, y las funciones de sesión de `lib/firebase.ts`, detrás de las interfaces. Conserva los comentarios de por qué cada cosa es como es.

`lib/backend/firestore.ts`:

```ts
/** Implementación de la capa de datos sobre Firestore: lo que hacía `lib/store.tsx` con el SDK de Firebase (leer la clínica, `fsSave`,
 *  `fsDelete`, `fsCampo`, `fsMeta`, los `onSnapshot`) y `lib/firebase.ts` (la sesión), detrás de las interfaces de `tipos.ts`.
 *
 *  Es el ÚNICO archivo, junto con `lib/firebase.ts`, que puede importar `firebase/*` (lo vigila `aislamiento.test.ts`). */
import {
  collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch,
  type Firestore, type Query,
} from "firebase/firestore";
import { app, currentAuthUid, currentIdToken, fsdb, sendPasswordReset, signInAnonymousIfNeeded, signInEmail, signOutUser } from "../firebase";
import { COLECCIONES_DE_LA_TIENDA } from "./colecciones";
import { limpiar } from "./documentos";
import type { BackendDeDatos, DatosDeBackend, Doc, LecturaDeClinica, OpcionesDeLectura, SesionDeBackend } from "./tipos";

type Instantanea = { docs: { data: () => unknown }[] } | null;
const filas = (snap: Instantanea): Doc[] => (snap ? snap.docs.map((d) => d.data() as Doc) : []);

/** Los datos sobre una instancia de Firestore cualquiera (en las pruebas, la del emulador). `usuarioActual` es el id del usuario con sesión. */
export function crearDatosFirestore(db: Firestore, usuarioActual: () => Promise<string | null>): DatosDeBackend {
  const docDe = (cid: string, col: string, id: string) => doc(db, "clinics", cid, col, id);

  /* Una colección que el ROL no tiene permiso de leer devuelve vacío, no rompe.
   *
   * Esto no es defensa preventiva: sin el catch, Novudent queda INUTILIZABLE para dentistas y asistentes en cuanto se despliegan las reglas
   * de RBAC. Las colecciones se piden en un solo `Promise.all`, que rechaza al primer error; `expenses` y `settlements` son admin-only por
   * regla, así que el permission-denied de un dentista tumbaba el arranque ENTERO y lo mandaba a "modo local". O sea: la clínica compra el
   * sistema y solo el dueño puede entrar.
   *
   * Devolver vacío es lo correcto, no un parche: que una asistente no vea los gastos ES la regla de negocio. La interfaz ya esconde esas
   * pantallas por `can(role, …)`, así que una lista vacía es exactamente lo que corresponde. */
  const leer = async (ref: Query) => {
    try {
      return await getDocs(ref);
    } catch (e) {
      if ((e as { code?: string })?.code === "permission-denied") return null;
      throw e; // red caída, cuota, config rota: eso sí tiene que explotar
    }
  };

  return {
    tipo: "firestore",

    async leerClinica(cid: string, opciones: OpcionesDeLectura): Promise<LecturaDeClinica | null> {
      const clinicaSnap = await getDoc(doc(db, "clinics", cid));
      if (!clinicaSnap.exists()) return null;
      /* Suscripción SaaS: colección RAÍZ, solo-lectura para el cliente (la escribe el webhook con el usuario de servicio). Si no existe, la
       * clínica es anterior al cobro → grandfathered (ver lib/subscription.ts). */
      const subSnap = await getDoc(doc(db, "subscriptions", cid)).catch(() => null);
      const col = (nombre: string) => leer(collection(db, "clinics", cid, nombre));
      const usuariosP = col("users");
      /* Mensajes directos: la ÚNICA colección de la clínica que un miembro no lee entera (ver `filtroDeDirectos` en carga.ts). El filtro
       * necesita el padrón de usuarios, por eso espera `usuariosP`; en paralelo con el resto de las lecturas. */
      const directosP = (async () => {
        const ref = collection(db, "clinics", cid, "directMessages");
        const filtro = opciones.directos(filas(await usuariosP), await usuarioActual());
        if (filtro === "ninguno") return null;
        return leer(filtro === "todos" ? ref : query(ref, where("participants", "array-contains", filtro.participante)));
      })();
      const otras = COLECCIONES_DE_LA_TIENDA.filter((n) => n !== "users" && n !== "directMessages");
      const [usuarios, directos, ...resto] = await Promise.all([usuariosP, directosP, ...otras.map(col)]);
      const colecciones: Record<string, Doc[]> = { users: filas(usuarios), directMessages: filas(directos) };
      otras.forEach((nombre, i) => { colecciones[nombre] = filas(resto[i]); });
      return { clinica: clinicaSnap.data() as Doc, suscripcion: subSnap?.exists() ? (subSnap.data() as Doc) : null, colecciones };
    },

    async clinicaDelUsuario(uid: string) {
      const snap = await getDoc(doc(db, "directory", uid));
      const clinicId = snap.exists() ? (snap.data() as { clinicId?: unknown }).clinicId : null;
      return typeof clinicId === "string" ? clinicId : null;
    },

    guardar: (cid, col, id, data) => setDoc(docDe(cid, col, id), limpiar(data as Doc)),
    quitar: (cid, col, id) => deleteDoc(docDe(cid, col, id)),
    // `limpiar` pasa el valor por JSON (saca los `undefined`) y rompería el marcador de `deleteField()`: por eso se lo aplica solo al valor.
    fijarCampo: (cid, col, id, campo, valor) => updateDoc(docDe(cid, col, id), { [campo]: valor === undefined ? deleteField() : limpiar(valor) }),
    mezclarClinica: (cid, data) => setDoc(doc(db, "clinics", cid), limpiar(data as Doc), { merge: true }),
    async lote(cid, ops) {
      const lote = writeBatch(db);
      for (const op of ops) {
        if (op.tipo === "guardar") lote.set(docDe(cid, op.col, op.id), limpiar(op.data as Doc));
        else if (op.tipo === "guardarClinica") lote.set(doc(db, "clinics", cid), limpiar(op.data as Doc));
        else lote.set(doc(db, "clinics", cid), limpiar(op.data as Doc), { merge: true });
      }
      await lote.commit();
    },

    escucharSuscripcion: (cid, alCambiar, alFallar) =>
      onSnapshot(doc(db, "subscriptions", cid), (snap) => alCambiar(snap.exists() ? (snap.data() as Doc) : null), alFallar),
    escucharClinica: (cid, alCambiar, alFallar) =>
      onSnapshot(doc(db, "clinics", cid), (snap) => alCambiar(snap.exists() ? (snap.data() as Doc) : null), alFallar),
    escucharColeccion: (cid, col, alCambiar, opciones, alFallar) => {
      const ref = collection(db, "clinics", cid, col);
      const restricciones = [
        ...(opciones?.participante ? [where("participants", "array-contains", opciones.participante)] : []),
        ...(opciones?.ordenarPor ? [orderBy(opciones.ordenarPor, "asc")] : []),
      ];
      return onSnapshot(restricciones.length ? query(ref, ...restricciones) : ref, (snap) => alCambiar(snap.docs.map((d) => d.data() as Doc)), alFallar);
    },
  };
}

/** La sesión sobre Firebase Auth (las funciones viven en `lib/firebase.ts`, con la explicación de cada decisión). */
export const sesionFirebase: SesionDeBackend = {
  /** Espera a que Firebase Auth termine de restaurar la sesión guardada.
   *
   *  ⚠️ NO HAY QUE REPONER UN `signInAnonymously` ACÁ. Existía porque las reglas desplegadas eran las de por defecto de Firebase y hacía falta
   *  CUALQUIER sesión para leer algo; con las reglas reales (`isDemo(cid)` no pide sesión) ya no aplica, y hacía daño: la restauración es
   *  asíncrona, así que en una carga fría `auth.currentUser` es `null` aunque haya sesión válida y la anónima le PISABA la sesión real (el
   *  «entro y no guarda nada»), además de dejar una cuenta anónima por visita (213 de 216 usuarios del proyecto). Lo que sí hace falta es
   *  ESPERAR a que la restauración termine antes de consultar. */
  async esperarSesion() {
    try {
      const { getAuth } = await import("firebase/auth");
      await getAuth(app).authStateReady();
    } catch (e) {
      console.warn("No se pudo esperar el estado de sesión:", e);
    }
  },
  iniciarSesion: signInEmail,
  iniciarSesionDeDemo: signInAnonymousIfNeeded,
  cerrarSesion: signOutUser,
  usuarioActual: currentAuthUid,
  token: currentIdToken,
  enviarRecuperacion: sendPasswordReset,
};

/** El backend de la app cuando `NEXT_PUBLIC_BACKEND` es `firestore` (el valor por defecto). */
export const backendFirestore: BackendDeDatos = { ...crearDatosFirestore(fsdb, currentAuthUid), ...sesionFirebase };
```

- [ ] **Paso 5: Verlas pasar.**

```bash
npx tsc --noEmit && npm run test:backend
```

Esperado: `tsc` limpio y 21 pruebas verdes (17 del contrato + 4 con las reglas reales: el administrador recibe todo; un dentista recibe lo suyo, sin gastos y solo sus directos; pedir «todos» los directos siendo dentista llega vacío sin romper; un intruso es rechazado).

- [ ] **Paso 6: Commit.**

```bash
git add lib/backend/firestore.ts lib/backend/firestore.contrato.emulador.test.ts lib/backend/firestore.reglas.emulador.test.ts vitest.emulador.config.ts vitest.config.ts package.json
git commit -m "feat(backend): implementación sobre Firestore, probada con el contrato y con las reglas reales en el emulador"
```

---

### Tarea 6: La tienda y las pantallas pasan a la interfaz

**Archivos:**
- Crear: `lib/backend/index.ts`
- Modificar: `lib/store.tsx`, `app/login/page.tsx`, `app/app/chat/page.tsx`, `components/SmileSimulator.tsx`, `components/EmailButton.tsx`, `components/ClinicalCopilot.tsx`, `components/Radiografias.tsx`, `components/NovudentIA.tsx`, `components/Periodontogram.tsx`, `lib/avisoCita.ts`
- Pruebas: `lib/backend/index.test.ts`, `lib/backend/aislamiento.test.ts`

**Interfaces:**
- Consume: `backendFirestore` (Tarea 5), `cargarDB` / `opsDeSemilla` / `CLINICA_DEMO` (Tarea 4).
- Produce: `elegirBackend(nombre: string | undefined): BackendDeDatos` y `backendDeDatos: BackendDeDatos`. El nombre `backendDeDatos` (y no `backend`) es a propósito: la tienda ya expone `backend` como el estado de la conexión.

- [ ] **Paso 1: Escribir las pruebas que fallan.** La de aislamiento es la que cumple el criterio «la tienda no importa `firebase/*`»: falla hoy porque `lib/store.tsx` y otros archivos lo importan.

`lib/backend/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { elegirBackend } from "./index";

describe("elegirBackend", () => {
  it("por defecto (sin valor, vacío o «Firestore») es Firestore", () => {
    for (const v of [undefined, "", "  ", "firestore", "Firestore"]) expect(elegirBackend(v).tipo).toBe("firestore");
  });
  it("supabase todavía no está disponible y lo dice", () => {
    expect(() => elegirBackend("supabase")).toThrow(/P3/);
  });
  it("un valor desconocido falla en vez de caer en Firestore sin avisar", () => {
    expect(() => elegirBackend("mongo")).toThrow(/desconocido/);
  });
});
```

`lib/backend/aislamiento.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

/** Solo estos archivos pueden hablar con el SDK de Firebase (más las pruebas con el emulador, que arman una instancia de Firestore para
 *  probar la implementación). El resto de la app usa `lib/backend` (la interfaz), así el día que la base sea otra (Supabase) no hay que
 *  tocar pantallas ni la tienda. */
const PERMITIDOS = new Set(["lib/firebase.ts", "lib/backend/firestore.ts"]);
const esPruebaConEmulador = (ruta: string) => ruta.startsWith("lib/backend/") && ruta.endsWith(".emulador.test.ts");
const RAIZ = join(__dirname, "..", "..");
const CARPETAS = ["app", "components", "lib"];
const IMPORTA_FIREBASE = /(from\s+["']firebase(\/[a-z-]+)?["'])|(import\(\s*["']firebase(\/[a-z-]+)?["']\s*\))|(require\(\s*["']firebase)/;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (nombre === "node_modules" || nombre === ".next") return [];
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

describe("aislamiento de Firebase", () => {
  it("solo lib/firebase.ts y lib/backend/firestore.ts (y sus pruebas con el emulador) importan el SDK de Firebase", () => {
    const infractores = CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))
      .map((ruta) => relative(RAIZ, ruta).split(sep).join("/"))
      .filter((ruta) => !PERMITIDOS.has(ruta) && !esPruebaConEmulador(ruta))
      .filter((ruta) => IMPORTA_FIREBASE.test(readFileSync(join(RAIZ, ruta), "utf8")));
    expect(infractores).toEqual([]);
  });

  it("la lista de permitidos existe (si se renombra un archivo, este test lo avisa)", () => {
    for (const ruta of PERMITIDOS) expect(() => statSync(join(RAIZ, ruta))).not.toThrow();
  });
});
```

- [ ] **Paso 2: Verlas fallar.**

```bash
npx vitest run lib/backend/index.test.ts lib/backend/aislamiento.test.ts
```

Esperado: `index.test.ts` falla (no existe `./index`) y `aislamiento.test.ts` falla listando `lib/store.tsx`, `app/login/page.tsx`, `app/app/chat/page.tsx`, los 6 componentes y `lib/avisoCita.ts`.

- [ ] **Paso 3: Escribir el selector.**

`lib/backend/index.ts`:

```ts
/** El backend de la app: lo que usan la tienda y las pantallas para hablar con la base y la sesión.
 *
 *  `NEXT_PUBLIC_BACKEND` elige cuál (se fija al compilar). Por defecto `firestore`. `supabase` todavía no existe: lo trae el adaptador de la
 *  parte P3 del plan del servidor propio (docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md). */
import { backendFirestore } from "./firestore";
import type { BackendDeDatos } from "./tipos";

export function elegirBackend(nombre: string | undefined): BackendDeDatos {
  const n = (nombre ?? "").trim().toLowerCase();
  if (n === "" || n === "firestore") return backendFirestore;
  if (n === "supabase") throw new Error("NEXT_PUBLIC_BACKEND=supabase todavía no está disponible: falta el adaptador de Supabase (parte P3 del plan del servidor propio).");
  throw new Error(`NEXT_PUBLIC_BACKEND desconocido: «${nombre}». Valores válidos: firestore.`);
}

/** El backend elegido. (No se llama `backend` porque la tienda ya expone `backend` como el estado de la conexión: «connecting» | «firebase» | «local».) */
export const backendDeDatos: BackendDeDatos = elegirBackend(process.env.NEXT_PUBLIC_BACKEND);
```

- [ ] **Paso 4: Migrar la tienda.** Este script reescribe `lib/store.tsx` (imports, las dos funciones de carga, los cuatro `onSnapshot`, `fsSave`/`fsDelete`/`fsCampo`/`fsMeta`, el login multi-clínica, la semilla de la demo y las llamadas de sesión). **Cada reemplazo verifica cuántas coincidencias encuentra y aborta sin escribir nada si no son las esperadas**, así que si `lib/store.tsx` cambió desde el 9-oct-2026, te lo dice en vez de romperlo. Guardalo fuera del repo y corrélo desde la raíz del repo:

```bash
mkdir -p /tmp/p1 && cat > /tmp/p1/refactor_store.py <<'PYEOF'
import re, sys
ruta = "lib/store.tsx"
s = open(ruta, encoding="utf-8").read()

def una(old, new):
    global s
    n = s.count(old)
    assert n == 1, f"se esperaba 1 coincidencia y hay {n}: {old[:90]!r}"
    s = s.replace(old, new)

def todas(old, new, esperadas):
    global s
    n = s.count(old)
    assert n == esperadas, f"se esperaban {esperadas} y hay {n}: {old[:90]!r}"
    s = s.replace(old, new)

def cortar(desde, hasta_exclusivo, reemplazo):
    """Reemplaza desde la línea que empieza con `desde` hasta la que empieza con `hasta_exclusivo` (esa no se toca)."""
    global s
    i = s.index(desde); j = s.index(hasta_exclusivo, i)
    s = s[:i] + reemplazo + s[j:]

# 1. imports
una('''import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, writeBatch, onSnapshot, query, where, type Query,
} from "firebase/firestore";
import { app, fsdb, signInEmail, currentIdToken, signOutUser, currentAuthUid, signInAnonymousIfNeeded } from "./firebase";
''', '''import { backendDeDatos } from "./backend";
import { cargarDB, opsDeSemilla } from "./backend/carga";
import { CLINICA_DEMO } from "./backend/constantes";
''')

# 2. ensureAuth (comentario y función) -> vive en backend.esperarSesion()
cortar("/** Espera a que Firebase Auth termine de restaurar la sesión guardada.", "import type {\n  DB, Session,", "")

# 3. constante de la demo
una('const DEMO_CLINIC_ID = "cl_demo";', 'const DEMO_CLINIC_ID = CLINICA_DEMO;')

# 4. seedFirestore + loadFirestore -> loadRemote
cortar("async function seedFirestore(seed: DB) {", "const withTimeout = <T,>", '''/** Carga la clínica activa (`CLINIC_ID`) desde la base y deja lista su moneda. Qué se lee, cómo se arma la `DB` y qué se siembra o se pone al
 *  día en la demo: lib/backend/carga.ts (`cargarDB`). */
async function loadRemote(): Promise<DB> {
  const remota = await cargarDB(backendDeDatos, CLINIC_ID);
  ACTIVE_CURRENCY = (remota.clinics[0]?.config?.currency as CurrencyCode) ?? DEFAULT_CURRENCY;
  return remota;
}

''')

# 5. llamadas sueltas
todas("await withTimeout(ensureAuth(), 6000)", "await withTimeout(backendDeDatos.esperarSesion(), 6000)", 2)
todas("loadFirestore()", "loadRemote()", 4)
todas("currentAuthUid()", "backendDeDatos.usuarioActual()", 2)
una("await signInAnonymousIfNeeded();", "await backendDeDatos.iniciarSesionDeDemo();")
una("const uid = await signInEmail(email, password);", "const uid = await backendDeDatos.iniciarSesion(email, password);")
todas("await currentIdToken();", "await backendDeDatos.token();", 2)
todas("signOutUser()", "backendDeDatos.cerrarSesion()", 3)

# 6. escuchas en vivo
una('''    const unsub = onSnapshot(
      doc(fsdb, "subscriptions", cid),
      (snap) => {
        setDb((prev) => {
          // La clínica activa ya cambió (login multi-clínica): ignorar snapshot tardío.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          const subscription = snap.exists() ? (snap.data() as Subscription) : null;
          const next = { ...prev, subscription };''', '''    return backendDeDatos.escucharSuscripcion(
      cid,
      (suscripcion) => {
        setDb((prev) => {
          // La clínica activa ya cambió (login multi-clínica): ignorar snapshot tardío.
          if ((prev.clinics[0]?.id ?? cid) !== cid) return prev;
          const next = { ...prev, subscription: suscripcion as Subscription | null };''')
una('''      (e) => console.warn("listener subscription:", e)
    );
    return unsub;
''', '''      (e) => console.warn("listener subscription:", e)
    );
''')

una('''    const unsub = onSnapshot(
      doc(fsdb, "clinics", cid),
      (snap) => {
        const remota = (snap.data() as { config?: { permisos?: unknown; rolesPropios?: unknown; nombresDeRoles?: unknown } } | undefined)?.config;''', '''    return backendDeDatos.escucharClinica(
      cid,
      (clinicaRemota) => {
        const remota = (clinicaRemota as { config?: { permisos?: unknown; rolesPropios?: unknown; nombresDeRoles?: unknown } } | null)?.config;''')
una('''      (e) => console.warn("listener roles:", e)
    );
    return unsub;
''', '''      (e) => console.warn("listener roles:", e)
    );
''')

una('''    const unsub = onSnapshot(
      collection(fsdb, "clinics", cid, "outbox"),
      (snap) => {
        const incoming = snap.docs
          .map((d) => d.data() as OutboxTask)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));''', '''    return backendDeDatos.escucharColeccion(
      cid,
      "outbox",
      (docs) => {
        const incoming = [...(docs as unknown as OutboxTask[])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));''')
una('''            r.saves.forEach(([c, i, d]) =>
              setDoc(doc(fsdb, "clinics", cid, c, i), clean(d)).catch(() => {})
            );''', '''            r.saves.forEach(([c, i, d]) =>
              backendDeDatos.guardar(cid, c, i, d).catch(() => {})
            );''')
una('''      (e) => console.warn("listener outbox:", e)
    );
    return unsub;
''', '''      undefined,
      (e) => console.warn("listener outbox:", e)
    );
''')

una('''   * chat. Misma consulta que loadFirestore (ver ahí por qué un no-admin NO puede
   * pedir la colección entera).''', '''   * chat. Misma consulta que `cargarDB` (ver `filtroDeDirectos` en lib/backend/carga.ts por qué un
   * no-admin NO puede pedir la colección entera).''')
una('''    const ref = collection(fsdb, "clinics", cid, "directMessages");
    const todos = cid === DEMO_CLINIC_ID || can(sesionRol, "users.manage");
    const unsub = onSnapshot(
      todos ? ref : query(ref, where("participants", "array-contains", sesionUid)),
      (snap) => {
        const directMessages = snap.docs.map((d) => d.data() as DirectMessage);''', '''    const todos = cid === DEMO_CLINIC_ID || can(sesionRol, "users.manage");
    return backendDeDatos.escucharColeccion(
      cid,
      "directMessages",
      (docs) => {
        const directMessages = docs as unknown as DirectMessage[];''')
una('''      (e) => console.warn("listener directMessages:", e)
    );
    return unsub;
''', '''      todos ? undefined : { participante: sesionUid },
      (e) => console.warn("listener directMessages:", e)
    );
''')

# 7. escrituras
una('''    const escribir = () =>
      setDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id), clean(data));''', '''    const escribir = () => backendDeDatos.guardar(clinicIdRef.current, colName, id, data);''')
una('''    const borrar = () => deleteDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id));''', '''    const borrar = () => backendDeDatos.quitar(clinicIdRef.current, colName, id);''')
una('''    // `clean` pasa el valor por JSON (saca los `undefined`) y rompería el marcador de `deleteField()`: por eso se lo aplica solo al valor.
    const escribir = () => updateDoc(doc(fsdb, "clinics", clinicIdRef.current, colName, id), { [campo]: valor === undefined ? deleteField() : clean(valor) });''', '''    const escribir = () => backendDeDatos.fijarCampo(clinicIdRef.current, colName, id, campo, valor);''')
una('''    const cuerpo = (d: DB) => clean({ ...d.clinics[0], onboarding: d.onboarding });''', '''    const cuerpo = (d: DB) => ({ ...d.clinics[0], onboarding: d.onboarding });''')
una('''      escribir: () => setDoc(doc(fsdb, "clinics", c.id), cuerpo(dbNow), { merge: true }),
      reintentar: () => (dbRef.current.clinics[0] ? setDoc(doc(fsdb, "clinics", c.id), cuerpo(dbRef.current), { merge: true }) : Promise.resolve()),''', '''      escribir: () => backendDeDatos.mezclarClinica(c.id, cuerpo(dbNow)),
      reintentar: () => (dbRef.current.clinics[0] ? backendDeDatos.mezclarClinica(c.id, cuerpo(dbRef.current)) : Promise.resolve()),''')

# 8. login multi-clínica y demo
una('''          const dir = await getDoc(doc(fsdb, "directory", uid)).catch((e) => { dirErr = e; return null; });
          const clinicId = dir?.exists() ? (dir.data() as any).clinicId : null;''', '''          const clinicId = await backendDeDatos.clinicaDelUsuario(uid).catch((e) => { dirErr = e; return null; });''')
una('''if (backendRef.current === "firebase") await seedFirestore(seed).catch((e) => console.warn("seedDemo", e));''', '''if (backendRef.current === "firebase") await backendDeDatos.lote(DEMO_CLINIC_ID, opsDeSemilla(seed)).catch((e) => console.warn("seedDemo", e));''')


# 9. «Reiniciar demo» vuelve a sembrar, y los comentarios que nombraban las funciones que ya no existen
una("          seedFirestore(seed).catch(() => {});", "          backendDeDatos.lote(DEMO_CLINIC_ID, opsDeSemilla(seed)).catch(() => {});")
una("CLINIC_ID = DEMO_CLINIC_ID; // seedFirestore escribe en CLINIC_ID — lo forzamos a demo", "CLINIC_ID = DEMO_CLINIC_ID; // la clínica activa pasa a ser la demo")
una("CLINIC_ID = DEMO_CLINIC_ID; // seedFirestore/fsDelete operan sobre demo", "CLINIC_ID = DEMO_CLINIC_ID; // la clínica activa pasa a ser la demo")
una("La setea `loadFirestore` al cargar y", "La setea `loadRemote` al cargar y")
una("   * loadFirestore y quedaba congelada en memoria", "   * cargarDB y quedaba congelada en memoria")
una("de cargar Firestore; cambia al iniciar sesión", "de cargar la base; cambia al iniciar sesión")

# 10. `clean` ya no se usa en la tienda (lo aplica cada backend al guardar)
una("/* Firestore no acepta `undefined` → sanitizamos vía JSON */\nconst clean = <T,>(x: T): T => JSON.parse(JSON.stringify(x));\n\n", "")

open(ruta, "w", encoding="utf-8").write(s)
print("ok; quedan:", {k: s.count(k) for k in ["seedFirestore", "loadFirestore", "ensureAuth", "fsdb", "clean(", "firebase/"]})
PYEOF
python3 /tmp/p1/refactor_store.py
```

Esperado: `ok; quedan: {'seedFirestore': 0, 'loadFirestore': 0, 'ensureAuth': 0, 'fsdb': 0, 'clean(': 0, 'firebase/': 0}`.

- [ ] **Paso 5: Migrar las pantallas** (las que piden el token para `/api/*`, el «olvidé mi contraseña» y el canal del equipo del chat). Mismo criterio: aborta si no encuentra lo esperado.

```bash
cat > /tmp/p1/refactor_consumidores.py <<'PYEOF'
import re
def editar(ruta, pares):
    s = open(ruta, encoding="utf-8").read()
    for old, new, n in pares:
        assert s.count(old) == n, f"{ruta}: se esperaban {n} y hay {s.count(old)}: {old[:80]!r}"
        s = s.replace(old, new)
    open(ruta, "w", encoding="utf-8").write(s)

# Quienes piden el token para las rutas /api/*
for ruta in ["components/SmileSimulator.tsx", "components/EmailButton.tsx", "components/ClinicalCopilot.tsx", "components/Radiografias.tsx",
             "components/NovudentIA.tsx", "components/Periodontogram.tsx"]:
    editar(ruta, [
        ('import { currentIdToken } from "@/lib/firebase";', 'import { backendDeDatos } from "@/lib/backend";', 1),
        ("await currentIdToken()", "await backendDeDatos.token()", 1),
    ])
editar("lib/avisoCita.ts", [
    ('import { currentIdToken } from "./firebase";', 'import { backendDeDatos } from "./backend";', 1),
    ("await currentIdToken()", "await backendDeDatos.token()", 1),
])

# «Olvidé mi contraseña»
editar("app/login/page.tsx", [
    ('import { sendPasswordReset } from "@/lib/firebase";', 'import { backendDeDatos } from "@/lib/backend";', 1),
    ("await sendPasswordReset(recEmail.trim());", "await backendDeDatos.enviarRecuperacion(recEmail.trim());", 1),
])

# Canal del equipo en vivo (chat)
editar("app/app/chat/page.tsx", [
    ('import { collection, onSnapshot, query, orderBy } from "firebase/firestore";\nimport { fsdb } from "@/lib/firebase";\n', 'import { backendDeDatos } from "@/lib/backend";\n', 1),
    ('''    const qy = query(collection(fsdb, "clinics", cid, "teamMessages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => setLiveEquipo(snap.docs.map((d) => d.data() as TeamMessage)), () => setLiveEquipo(null));
    return () => unsub();''', '''    return backendDeDatos.escucharColeccion(cid, "teamMessages", (docs) => setLiveEquipo(docs as unknown as TeamMessage[]), { ordenarPor: "createdAt" }, () => setLiveEquipo(null));''', 1),
])
print("ok")
PYEOF
python3 /tmp/p1/refactor_consumidores.py
```

Esperado: `ok`.

- [ ] **Paso 6: Revisar el cambio.**

```bash
git diff --stat
git diff lib/store.tsx | head -150
```

Esperado: `lib/store.tsx` pierde unas 330 líneas (las dos funciones de carga y sus comentarios largos, que ya viven en `lib/backend/`), y en cada pantalla cambian 2 líneas. En la tienda no queda ninguna mención a `fsdb`, `firebase/`, `loadFirestore` ni `seedFirestore`.

- [ ] **Paso 7: Tipos y pruebas unitarias.**

```bash
npx tsc --noEmit && npx vitest run
```

Esperado: `tsc` limpio y todo verde (el 9-oct-2026: 1762 pruebas en este punto), incluidas las de aislamiento y del selector.

- [ ] **Paso 8: Compilar y probar en el navegador (modo local).** Los e2e cortan Firebase, así que corren la tienda en modo local: comprueban que nada se rompió al migrar y que los imports funcionan en Next. La ruta contra Firestore real la cubren el contrato (Tarea 5) y la prueba en producción de la Tarea 10.

```bash
ss -ltnp | grep :3197 || echo "3197 libre"
flock -w 900 /tmp/novudent-pesado.lock npm run build
E2E_PORT=3197 flock -w 900 /tmp/novudent-pesado.lock npx playwright test e2e/flujos.spec.ts e2e/chat.spec.ts e2e/roles.spec.ts e2e/agenda.spec.ts e2e/pantallas-y-flujos.spec.ts e2e/usuarios.spec.ts e2e/acceso.spec.ts --reporter=list
```

Esperado: el build termina bien y las pruebas pasan sin fallas (el 9-oct-2026: 125 pasaron, 23 saltadas por proyecto).

- [ ] **Paso 9: Commit.**

```bash
git add lib/backend/index.ts lib/backend/index.test.ts lib/backend/aislamiento.test.ts lib/store.tsx app/login/page.tsx app/app/chat/page.tsx components/SmileSimulator.tsx components/EmailButton.tsx components/ClinicalCopilot.tsx components/Radiografias.tsx components/NovudentIA.tsx components/Periodontogram.tsx lib/avisoCita.ts
git commit -m "refactor: la tienda y las pantallas hablan con backendDeDatos y no con Firebase

Sin cambios visibles: NEXT_PUBLIC_BACKEND es firestore por defecto. La carga
de la clínica y la semilla de la demo salen de la tienda (lib/backend/carga.ts)
y el único código que importa firebase/* queda en lib/firebase.ts y
lib/backend/firestore.ts, vigilado por aislamiento.test.ts."
```

---

### Tarea 7: Exportador — decodificar valores y cliente REST

**Archivos:**
- Crear: `scripts/migracion/valores.mjs`, `scripts/migracion/cliente.mjs`
- Pruebas: `scripts/migracion/valores.test.ts`, `scripts/migracion/cliente.test.ts`

**Interfaces:**
- Produce: `nuevosHallazgos()`, `decodificarValor(v, hallazgos)`, `decodificarCampos(campos, hallazgos)`, `decodificarDocumento(documento, hallazgos): { id, data, fantasma }`; `ErrorDeLectura` (`estado`, `ruta`, `permiso`); `crearCliente({ proyecto, token, base?, fetch?, esperar?, reintentos? })` con `listarDocumentos(rutaPadre, coleccion, tamanoDePagina?)` (generador asíncrono) y `listarColecciones(rutaDocumento?)`.

- [ ] **Paso 1: Escribir las pruebas que fallan.**

`scripts/migracion/valores.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodificarDocumento, decodificarValor, nuevosHallazgos } from "./valores.mjs";

describe("decodificarValor", () => {
  it("texto, números, booleanos y null", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ stringValue: "Ana" }, h)).toBe("Ana");
    expect(decodificarValor({ integerValue: "30" }, h)).toBe(30);
    expect(decodificarValor({ doubleValue: 1.7 }, h)).toBe(1.7);
    expect(decodificarValor({ booleanValue: false }, h)).toBe(false);
    expect(decodificarValor({ nullValue: null }, h)).toBeNull();
    expect(h).toEqual(nuevosHallazgos());
  });

  it("mapas y arreglos anidados", () => {
    const h = nuevosHallazgos();
    const v = { mapValue: { fields: { lista: { arrayValue: { values: [{ integerValue: "1" }, { stringValue: "a" }] } }, vacio: { mapValue: {} }, sinValores: { arrayValue: {} } } } };
    expect(decodificarValor(v, h)).toEqual({ lista: [1, "a"], vacio: {}, sinValores: [] });
  });

  it("los tipos que no son JSON puro se decodifican y se cuentan", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ timestampValue: "2026-01-02T03:04:05Z" }, h)).toBe("2026-01-02T03:04:05Z");
    expect(decodificarValor({ geoPointValue: { latitude: 1, longitude: 2 } }, h)).toEqual({ latitude: 1, longitude: 2 });
    expect(decodificarValor({ referenceValue: "projects/p/databases/(default)/documents/clinics/c1" }, h)).toContain("clinics/c1");
    expect(decodificarValor({ bytesValue: "AAEC" }, h)).toBe("AAEC");
    expect(h).toMatchObject({ timestamp: 1, geopoint: 1, referencia: 1, bytes: 1 });
  });

  it("un entero que no entra en un número se conserva como texto y se cuenta", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ integerValue: "9007199254740993" }, h)).toBe("9007199254740993");
    expect(decodificarValor({ doubleValue: "NaN" }, h)).toBe("NaN");
    expect(h).toMatchObject({ enteroGrande: 1, decimalEspecial: 1 });
  });

  it("un tipo desconocido da null y se cuenta", () => {
    const h = nuevosHallazgos();
    expect(decodificarValor({ algoNuevoValue: 1 }, h)).toBeNull();
    expect(h.desconocido).toBe(1);
  });
});

describe("decodificarDocumento", () => {
  it("saca el id del nombre y decodifica los campos", () => {
    const d = decodificarDocumento({ name: "projects/p/databases/(default)/documents/clinics/c1/patients/p%201", createTime: "x", fields: { n: { integerValue: "5" } } }, nuevosHallazgos());
    expect(d).toEqual({ id: "p 1", data: { n: 5 }, fantasma: false });
  });
  it("un documento vacío que existe no es fantasma; uno sin createTime ni campos sí", () => {
    const h = nuevosHallazgos();
    expect(decodificarDocumento({ name: "a/b/x", createTime: "t" }, h).fantasma).toBe(false);
    expect(decodificarDocumento({ name: "a/b/y" }, h)).toEqual({ id: "y", data: {}, fantasma: true });
  });
});
```

`scripts/migracion/cliente.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { crearCliente, ErrorDeLectura } from "./cliente.mjs";

const respuesta = (cuerpo: unknown, estado = 200) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo }) as unknown as Response;
const sinEspera = async () => {};
const doc = (nombre: string) => ({ name: `projects/p/databases/(default)/documents/${nombre}`, createTime: "t", fields: {} });
async function todos<T>(it: AsyncIterable<T>) { const salida: T[] = []; for await (const x of it) salida.push(x); return salida; }

describe("listarDocumentos", () => {
  it("sigue la paginación hasta que no hay más páginas y manda el token y showMissing", async () => {
    const pedidos: Array<{ url: string; auth: string }> = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      pedidos.push({ url, auth: (init.headers as Record<string, string>).Authorization });
      if (!url.includes("pageToken")) return respuesta({ documents: [doc("clinics/a"), doc("clinics/b")], nextPageToken: "T1" });
      if (url.includes("pageToken=T1")) return respuesta({ documents: [doc("clinics/c")], nextPageToken: "T2" });
      return respuesta({ documents: [doc("clinics/d")] });
    });
    const cliente = crearCliente({ proyecto: "p", token: "secreto", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const nombres = (await todos(cliente.listarDocumentos("", "clinics"))).map((d: { name: string }) => d.name.split("/").pop());
    expect(nombres).toEqual(["a", "b", "c", "d"]);
    expect(pedidos).toHaveLength(3);
    expect(pedidos.every((p) => p.auth === "Bearer secreto")).toBe(true);
    expect(pedidos[0].url).toContain("/documents/clinics?");
    expect(pedidos[0].url).toContain("showMissing=true");
  });

  it("codifica cada tramo de la ruta (ids con espacios o barras no se escapan de su colección)", async () => {
    const fetch = vi.fn(async () => respuesta({}));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    await todos(cliente.listarDocumentos("clinics/cl 1", "patients"));
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("/documents/clinics/cl%201/patients?");
  });

  it("reintenta con espera creciente ante 503 y cortes de red, y sigue", async () => {
    const esperas: number[] = [];
    const fetch = vi.fn()
      .mockResolvedValueOnce(respuesta({}, 503))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(respuesta({ documents: [doc("clinics/a")] }));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: async (ms) => { esperas.push(ms); } });
    expect(await todos(cliente.listarDocumentos("", "clinics"))).toHaveLength(1);
    expect(esperas).toEqual([500, 1000]);
  });

  it("un 403 es un error de permiso (no se reintenta)", async () => {
    const fetch = vi.fn(async () => respuesta({}, 403));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const error = await todos(cliente.listarDocumentos("clinics/c1", "directMessages")).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeLectura);
    expect(error).toMatchObject({ estado: 403, permiso: true, ruta: "clinics/c1/directMessages" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("después de agotar los reintentos falla sin marcar permiso", async () => {
    const fetch = vi.fn(async () => respuesta({}, 500));
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera, reintentos: 2 });
    const error = await todos(cliente.listarDocumentos("", "clinics")).catch((e) => e);
    expect(error).toMatchObject({ estado: 500, permiso: false });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("el mensaje de error no incluye el token", async () => {
    const fetch = vi.fn(async () => respuesta({}, 403));
    const cliente = crearCliente({ proyecto: "p", token: "TOKEN-SECRETO", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    const error = await todos(cliente.listarDocumentos("", "clinics")).catch((e) => e);
    expect(String(error.message)).not.toContain("TOKEN-SECRETO");
  });
});

describe("listarColecciones", () => {
  it("lista las colecciones de primer nivel y las de un documento, con paginación", async () => {
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const cuerpo = JSON.parse(String(init.body));
      if (url.endsWith("/documents:listCollectionIds")) return respuesta({ collectionIds: ["clinics", "directory"] });
      return cuerpo.pageToken ? respuesta({ collectionIds: ["patients"] }) : respuesta({ collectionIds: ["users"], nextPageToken: "T" });
    });
    const cliente = crearCliente({ proyecto: "p", token: "t", fetch: fetch as unknown as typeof globalThis.fetch, esperar: sinEspera });
    expect(await cliente.listarColecciones()).toEqual(["clinics", "directory"]);
    expect(await cliente.listarColecciones("clinics/c1")).toEqual(["users", "patients"]);
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toContain("/documents/clinics/c1:listCollectionIds");
  });
});
```

- [ ] **Paso 2: Verlas fallar.**

```bash
npx vitest run scripts/migracion/valores.test.ts scripts/migracion/cliente.test.ts
```

Esperado: FAIL (no existen los módulos).

- [ ] **Paso 3: Escribir el decodificador y el cliente.**

`scripts/migracion/valores.mjs`:

```js
/** Decodifica los valores de la API REST de Firestore (`{ stringValue: "…" }`, `{ integerValue: "30" }`, …) a JSON puro, y cuenta lo que no es
 *  JSON puro (fechas, puntos, referencias, bytes) para que el informe de la exportación lo muestre: la app guarda fechas como texto ISO, así
 *  que lo esperado es que esos contadores den 0. Solo lectura, sin dependencias: lo usa `exportar-firestore.mjs`. */

export function nuevosHallazgos() {
  return { timestamp: 0, geopoint: 0, referencia: 0, bytes: 0, enteroGrande: 0, decimalEspecial: 0, desconocido: 0 };
}

/** @param {Record<string, any> | undefined} v @param {ReturnType<typeof nuevosHallazgos>} hallazgos */
export function decodificarValor(v, hallazgos) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) {
    const n = Number(v.integerValue);
    if (Number.isSafeInteger(n)) return n;
    hallazgos.enteroGrande++; // no entra en un número de JSON sin perder dígitos: se conserva como texto
    return String(v.integerValue);
  }
  if ("doubleValue" in v) {
    if (typeof v.doubleValue === "number") return v.doubleValue;
    hallazgos.decimalEspecial++; // «NaN», «Infinity»: no existen en JSON
    return String(v.doubleValue);
  }
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) { hallazgos.timestamp++; return v.timestampValue; }
  if ("geoPointValue" in v) { hallazgos.geopoint++; return { latitude: v.geoPointValue.latitude ?? 0, longitude: v.geoPointValue.longitude ?? 0 }; }
  if ("referenceValue" in v) { hallazgos.referencia++; return v.referenceValue; }
  if ("bytesValue" in v) { hallazgos.bytes++; return v.bytesValue; }
  if ("mapValue" in v) return decodificarCampos(v.mapValue?.fields, hallazgos);
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map((x) => decodificarValor(x, hallazgos));
  hallazgos.desconocido++;
  return null;
}

export function decodificarCampos(campos, hallazgos) {
  const salida = {};
  for (const [clave, valor] of Object.entries(campos ?? {})) salida[clave] = decodificarValor(valor, hallazgos);
  return salida;
}

/** Un documento de la lista de la API → `{ id, data, fantasma }`. «Fantasma» = el documento no existe pero tiene subcolecciones (la API lo
 *  devuelve con `showMissing=true`, solo con su nombre). */
export function decodificarDocumento(documento, hallazgos) {
  const id = decodeURIComponent(String(documento.name).split("/").pop());
  const fantasma = !documento.createTime && !documento.fields;
  return { id, data: fantasma ? {} : decodificarCampos(documento.fields, hallazgos), fantasma };
}
```

`scripts/migracion/cliente.mjs`:

```js
/** Cliente de solo lectura de la API REST de Firestore para exportar: lista documentos con paginación y descubre subcolecciones. Sin
 *  dependencias; `fetch` y la espera se inyectan para probarlo sin red. Nunca imprime el token ni el contenido de los documentos. */

export class ErrorDeLectura extends Error {
  /** @param {string} mensaje @param {{ estado?: number, ruta?: string, permiso?: boolean }} datos */
  constructor(mensaje, { estado, ruta, permiso = false } = {}) {
    super(mensaje);
    this.name = "ErrorDeLectura";
    this.estado = estado;
    this.ruta = ruta;
    /** `true` si la base negó la lectura (credencial sin permiso o reglas): se informa y se sigue con lo demás. */
    this.permiso = permiso;
  }
}

const REINTENTABLES = new Set([429, 500, 502, 503, 504]);
const segmentos = (ruta) => ruta.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/**
 * @param {{ proyecto: string, token: string, base?: string, fetch?: typeof fetch, esperar?: (ms: number) => Promise<void>, reintentos?: number }} opciones
 */
export function crearCliente({ proyecto, token, base, fetch: pedir = fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), reintentos = 5 }) {
  const BASE = base ?? `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents`;
  const cabeceras = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  /** GET/POST con reintentos (límite de cuota, errores del servidor y cortes de red) y espera creciente. */
  async function solicitar(url, init, ruta) {
    for (let intento = 0; ; intento++) {
      let res;
      try {
        res = await pedir(url, { ...init, headers: cabeceras });
      } catch (e) {
        if (intento >= reintentos) throw new ErrorDeLectura(`sin conexión leyendo ${ruta}: ${e?.message ?? e}`, { ruta });
        await esperar(Math.min(8000, 500 * 2 ** intento));
        continue;
      }
      if (res.ok) return res.json();
      if (REINTENTABLES.has(res.status) && intento < reintentos) {
        await esperar(Math.min(8000, 500 * 2 ** intento));
        continue;
      }
      throw new ErrorDeLectura(`la base respondió ${res.status} leyendo ${ruta}`, { estado: res.status, ruta, permiso: res.status === 401 || res.status === 403 });
    }
  }

  return {
    /** Todos los documentos de una colección (`rutaPadre` vacío = de primer nivel), de a páginas. Incluye los «fantasma». */
    async *listarDocumentos(rutaPadre, coleccion, tamanoDePagina = 300) {
      const ruta = [rutaPadre, coleccion].filter(Boolean).join("/");
      let pagina;
      do {
        const params = new URLSearchParams({ pageSize: String(tamanoDePagina), showMissing: "true" });
        if (pagina) params.set("pageToken", pagina);
        const datos = await solicitar(`${BASE}/${segmentos(ruta)}?${params}`, { method: "GET" }, ruta);
        for (const documento of datos.documents ?? []) yield documento;
        pagina = datos.nextPageToken;
      } while (pagina);
    },

    /** Los nombres de las subcolecciones de un documento (`rutaDocumento` vacío = las colecciones de primer nivel). */
    async listarColecciones(rutaDocumento = "") {
      const url = `${BASE}${rutaDocumento ? `/${segmentos(rutaDocumento)}` : ""}:listCollectionIds`;
      const nombres = [];
      let pagina;
      do {
        const datos = await solicitar(url, { method: "POST", body: JSON.stringify({ pageSize: 100, ...(pagina ? { pageToken: pagina } : {}) }) }, rutaDocumento || "(raíz)");
        nombres.push(...(datos.collectionIds ?? []));
        pagina = datos.nextPageToken;
      } while (pagina);
      return nombres;
    },
  };
}
```

- [ ] **Paso 4: Verlas pasar.**

```bash
npx vitest run scripts/migracion && npx tsc --noEmit
```

Esperado: 14 pruebas verdes y `tsc` limpio (importar `.mjs` desde TypeScript anda porque `tsconfig.json` tiene `allowJs`).

- [ ] **Paso 5: Commit.**

```bash
git add scripts/migracion/valores.mjs scripts/migracion/cliente.mjs scripts/migracion/valores.test.ts scripts/migracion/cliente.test.ts
git commit -m "feat(migracion): decodificador de valores y cliente REST de solo lectura de Firestore"
```

---

### Tarea 8: Exportador — credenciales, exportación y informe

**Archivos:**
- Crear: `scripts/migracion/credenciales.mjs`, `scripts/migracion/exportar.mjs`, `scripts/migracion/informe.mjs`
- Pruebas: `scripts/migracion/credenciales.test.ts`, `scripts/migracion/exportar.test.ts`

**Interfaces:**
- Consume: `crearCliente`, `ErrorDeLectura`, `decodificarDocumento`, `nuevosHallazgos` (Tarea 7).
- Produce: `resolverToken({ modo, env?, fetch?, cargarAuth? }): Promise<{ token, cuenta }>` con los modos `firebase-cli`, `servicio` y `entorno`; `crearEscritorDeArchivos(raiz)`, `escritorNulo`, `exportarFirestore({ cliente, colecciones, escritor, clinicas?, alAvanzar?, ahora? }): Promise<Manifiesto>`; `armarInforme(manifiesto, { proyecto?, credencial?, objetivo? })`, `proyectar(manifiesto, objetivo?)`, `clinicasReales(manifiesto)`.

El modo `firebase-cli` (el de siempre) usa la sesión del CLI de Firebase de la máquina —la cuenta dueña del proyecto— y **es el único que lee los mensajes directos del chat**: las reglas no se los dejan leer ni al usuario de servicio. Pide el token con el propio `firebase-tools` instalado (no guarda ni imprime nada).

- [ ] **Paso 1: Escribir las pruebas que fallan.**

`scripts/migracion/credenciales.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { resolverToken, tokenDeEntorno, tokenDeFirebaseCli, tokenDeServicio } from "./credenciales.mjs";

const authFalso = (cuenta: unknown, token: unknown = { access_token: "TOKEN-RENOVADO" }) => () => ({
  getGlobalDefaultAccount: () => cuenta,
  getAccessToken: vi.fn(async () => token),
});

describe("firebase-cli", () => {
  it("renueva el token con la sesión del CLI y dice de qué cuenta es", async () => {
    const r = await tokenDeFirebaseCli({ cargarAuth: authFalso({ user: { email: "dueno@x.com" }, tokens: { refresh_token: "r" } }) });
    expect(r).toEqual({ token: "TOKEN-RENOVADO", cuenta: "dueno@x.com" });
  });
  it("sin sesión iniciada explica qué hacer", async () => {
    await expect(tokenDeFirebaseCli({ cargarAuth: authFalso(undefined) })).rejects.toThrow(/firebase login/);
  });
  it("si no se puede renovar, lo dice", async () => {
    await expect(tokenDeFirebaseCli({ cargarAuth: authFalso({ tokens: { refresh_token: "r" } }, {}) })).rejects.toThrow(/reauth/);
  });
});

describe("servicio", () => {
  const env = { FIREBASE_WEB_API_KEY: "k", SERVICE_USER_EMAIL: "svc@x.com", SERVICE_USER_PASSWORD: "p" };
  it("inicia sesión con el usuario de servicio y devuelve el idToken", async () => {
    const pedir = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ idToken: "ID" }) }) as unknown as Response);
    expect(await tokenDeServicio(env, pedir as unknown as typeof fetch)).toEqual({ token: "ID", cuenta: "svc@x.com" });
    expect((pedir.mock.calls[0] as unknown as [string])[0]).toContain("accounts:signInWithPassword?key=k");
  });
  it("avisa qué variables faltan, sin llamar a la red", async () => {
    const pedir = vi.fn();
    await expect(tokenDeServicio({ FIREBASE_WEB_API_KEY: "k" }, pedir as unknown as typeof fetch)).rejects.toThrow(/SERVICE_USER_EMAIL, SERVICE_USER_PASSWORD/);
    expect(pedir).not.toHaveBeenCalled();
  });
  it("si el inicio de sesión falla, no repite la contraseña en el mensaje", async () => {
    const pedir = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "INVALID_PASSWORD" } }) }) as unknown as Response;
    const error = await tokenDeServicio(env, pedir as unknown as typeof fetch).catch((e) => e);
    expect(error.message).toContain("INVALID_PASSWORD");
    expect(error.message).not.toContain(env.SERVICE_USER_PASSWORD + "x");
  });
});

describe("entorno y resolverToken", () => {
  it("lee GOOGLE_OAUTH_ACCESS_TOKEN", () => {
    expect(tokenDeEntorno({ GOOGLE_OAUTH_ACCESS_TOKEN: "owner" }).token).toBe("owner");
    expect(() => tokenDeEntorno({})).toThrow(/GOOGLE_OAUTH_ACCESS_TOKEN/);
  });
  it("elige el modo y rechaza uno desconocido", async () => {
    expect((await resolverToken({ modo: "entorno", env: { GOOGLE_OAUTH_ACCESS_TOKEN: "t" } })).token).toBe("t");
    await expect(resolverToken({ modo: "otro" })).rejects.toThrow(/desconocida/);
  });
});
```

`scripts/migracion/exportar.test.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorDeLectura } from "./cliente.mjs";
import { crearEscritorDeArchivos, escritorNulo, exportarFirestore } from "./exportar.mjs";
import { armarInforme, proyectar } from "./informe.mjs";

const COLECCIONES = { porClinica: ["users", "patients", "directMessages"], raiz: ["clinics", "directory", "subscriptions"], noSeMigra: ["serviceAccounts"] };

type Fs = Record<string, unknown>;
const documento = (ruta: string, campos: Fs | null) => ({ name: `projects/p/databases/(default)/documents/${ruta}`, ...(campos ? { createTime: "t", fields: campos } : {}) });
const s = (v: string) => ({ stringValue: v });
const i = (v: number) => ({ integerValue: String(v) });

/** Un cliente falso con una base en memoria: `base["clinics/c1/patients"] = [documentos…]`. */
function clienteFalso(base: Record<string, unknown[]>, opciones: { colecciones?: Record<string, string[]>; falla?: Record<string, ErrorDeLectura> } = {}) {
  return {
    async *listarDocumentos(padre: string, coleccion: string) {
      const ruta = [padre, coleccion].filter(Boolean).join("/");
      if (opciones.falla?.[ruta]) throw opciones.falla[ruta];
      for (const d of base[ruta] ?? []) yield d;
    },
    async listarColecciones(ruta = "") { return opciones.colecciones?.[ruta] ?? []; },
  };
}

const carpetas: string[] = [];
const temporal = () => { const d = mkdtempSync(join(tmpdir(), "export-")); carpetas.push(d); return d; };
afterEach(() => { while (carpetas.length) rmSync(carpetas.pop()!, { recursive: true, force: true }); });

const baseDeEjemplo = () => ({
  clinics: [documento("clinics/c1", { name: s("Clínica Uno") }), documento("clinics/cl_demo", { name: s("Demo") })],
  "clinics/c1/users": [documento("clinics/c1/users/u1", { name: s("Ana") })],
  "clinics/c1/patients": [documento("clinics/c1/patients/p1", { nombre: s("Luis"), edad: i(40) }), documento("clinics/c1/patients/p 2", { nombre: s("Eva") })],
  "clinics/cl_demo/patients": [documento("clinics/cl_demo/patients/d1", { nombre: s("Demo") })],
  directory: [documento("directory/u1", { clinicId: s("c1") })],
});
const coleccionesDeLaBase = { "": ["clinics", "directory", "serviceAccounts"], "clinics/c1": ["users", "patients"], "clinics/cl_demo": ["patients"] };

describe("exportarFirestore", () => {
  it("escribe un JSONL por colección y clínica, con id y datos decodificados", async () => {
    const salida = temporal();
    await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida) });
    const lineas = readFileSync(join(salida, "clinicas/c1/patients.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lineas).toEqual([{ id: "p1", data: { nombre: "Luis", edad: 40 } }, { id: "p 2", data: { nombre: "Eva" } }]);
    expect(JSON.parse(readFileSync(join(salida, "raiz/directory.jsonl"), "utf8").trim())).toEqual({ id: "u1", data: { clinicId: "c1" } });
    expect(readdirSync(join(salida, "raiz")).sort()).toEqual(["clinics.jsonl", "directory.jsonl"]);
  });

  it("el manifiesto trae cantidades, bytes y el SHA-256 de cada archivo", async () => {
    const salida = temporal();
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida) });
    const e = m.clinicas.c1.colecciones.patients;
    expect(e.docs).toBe(2);
    expect(e.bytes).toBe(statSync(join(salida, "clinicas/c1/patients.jsonl")).size);
    expect(e.sha256).toBe(createHash("sha256").update(readFileSync(join(salida, "clinicas/c1/patients.jsonl"))).digest("hex"));
    expect(m.clinicas.c1.documentos).toBe(3);
    expect(m.totales.documentos).toBe(7); // clínicas (2) + directory (1) + users de c1 (1) + patients de c1 (2) + patients de la demo (1)
  });

  it("no migra serviceAccounts, y avisa de las colecciones que no conoce (pero las exporta igual)", async () => {
    const base = { ...baseDeEjemplo(), "clinics/c1/inventado": [documento("clinics/c1/inventado/x", { a: s("1") })], nueva: [documento("nueva/n1", { a: s("1") })] };
    const salida = temporal();
    const m = await exportarFirestore({
      cliente: clienteFalso(base, { colecciones: { ...coleccionesDeLaBase, "": [...coleccionesDeLaBase[""], "nueva"], "clinics/c1": ["users", "patients", "inventado"] } }),
      colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida),
    });
    expect(m.noMigradas).toEqual(["serviceAccounts"]);
    expect(m.desconocidas).toEqual({ raiz: ["nueva"], clinicas: { c1: ["inventado"] } });
    expect(readFileSync(join(salida, "clinicas/c1/inventado.jsonl"), "utf8")).toContain('"id":"x"');
    expect(readFileSync(join(salida, "raiz/nueva.jsonl"), "utf8")).toContain('"id":"n1"');
  });

  it("una colección que la base niega queda anotada como no leída y la exportación sigue", async () => {
    const falla = { "clinics/c1/directMessages": new ErrorDeLectura("denegado", { estado: 403, ruta: "clinics/c1/directMessages", permiso: true }) };
    const m = await exportarFirestore({
      cliente: clienteFalso(baseDeEjemplo(), { colecciones: { ...coleccionesDeLaBase, "clinics/c1": ["users", "directMessages", "patients"] }, falla }),
      colecciones: COLECCIONES, escritor: escritorNulo,
    });
    expect(m.noLeidas).toEqual([{ ruta: "clinics/c1/directMessages", estado: 403, permiso: true }]);
    expect(m.clinicas.c1.colecciones.directMessages.incompleta).toBe(true);
    expect(m.clinicas.c1.colecciones.patients.docs).toBe(2);
  });

  it("una clínica sin documento (solo subcolecciones) se exporta y queda marcada", async () => {
    const base = { clinics: [{ name: "projects/p/databases/(default)/documents/clinics/huerfana" }], "clinics/huerfana/patients": [documento("clinics/huerfana/patients/p1", { n: s("x") })] };
    const m = await exportarFirestore({ cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/huerfana": ["patients"] } }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.documentosFantasma).toEqual(["clinics/huerfana"]);
    expect(m.clinicas.huerfana).toMatchObject({ sinDocumento: true, documentos: 1 });
    expect(m.raiz.clinics.docs).toBe(0);
  });

  it("--clinica limita las subcolecciones a las clínicas pedidas", async () => {
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo, clinicas: ["c1"] });
    expect(Object.keys(m.clinicas)).toEqual(["c1"]);
  });

  it("--solo-medir cuenta y calcula el SHA-256 sin escribir ningún archivo", async () => {
    const salida = temporal();
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.clinicas.c1.colecciones.patients.sha256).toHaveLength(64);
    expect(readdirSync(salida)).toEqual([]);
  });

  it("anota los documentos más grandes y los tipos que no son JSON puro", async () => {
    const base = { clinics: [documento("clinics/c1", { f: { timestampValue: "2026-01-02T03:04:05Z" } })], "clinics/c1/patients": [documento("clinics/c1/patients/p1", { x: s("a".repeat(500)) }), documento("clinics/c1/patients/p2", { x: s("b") })] };
    const m = await exportarFirestore({ cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/c1": ["patients"] } }), colecciones: COLECCIONES, escritor: escritorNulo });
    expect(m.mayores[0]).toMatchObject({ ruta: "clinics/c1/patients", id: "p1" });
    expect(m.hallazgos.timestamp).toBe(1);
  });

  it("los ids con caracteres raros no se escapan de su carpeta", async () => {
    const salida = temporal();
    const base = { clinics: [documento("clinics/..%2Fafuera", { n: s("x") })], "clinics/../afuera/patients": [documento("clinics/..%2Fafuera/patients/p", { n: s("x") })] };
    await exportarFirestore({ cliente: clienteFalso(base, { colecciones: { "": ["clinics"], "clinics/../afuera": ["patients"] } }), colecciones: COLECCIONES, escritor: crearEscritorDeArchivos(salida) });
    expect(readdirSync(join(salida, "clinicas"))).toEqual(["..%2Fafuera"]);
  });
});

describe("informe", () => {
  const manifiesto = async () => exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: coleccionesDeLaBase }), colecciones: COLECCIONES, escritor: escritorNulo });

  it("proyecta el tamaño con 30 clínicas a partir del promedio de las reales (sin contar la demo)", async () => {
    const m = await manifiesto();
    const p = proyectar(m, 30)!;
    expect(p.clinicasReales).toBe(1);
    expect(p.promedioPorClinica).toBe(m.clinicas.c1.bytes);
    expect(p.exportado).toBe(m.clinicas.c1.bytes * 30);
    expect(p.enPostgres).toBe(p.exportado * 1.5);
  });

  it("sin clínicas reales no hay proyección", () => {
    expect(proyectar({ clinicas: { cl_demo: { bytes: 10 } } } as never)).toBeNull();
  });

  it("el informe resume, lista las clínicas y no incluye ningún dato de pacientes", async () => {
    const texto = armarInforme(await manifiesto(), { proyecto: "novudent-664f3", credencial: "dueno@x.com" });
    expect(texto).toContain("# Informe de volumen de Firestore");
    expect(texto).toContain("`c1`");
    expect(texto).toContain("Proyección para 30 clínicas");
    expect(texto).toContain("No se migran");
    expect(texto).not.toMatch(/Luis|Eva|Ana/);
  });

  it("si algo no se pudo leer, el informe lo dice y avisa que la exportación está incompleta", async () => {
    const falla = { "clinics/c1/directMessages": new ErrorDeLectura("denegado", { estado: 403, ruta: "clinics/c1/directMessages", permiso: true }) };
    const m = await exportarFirestore({ cliente: clienteFalso(baseDeEjemplo(), { colecciones: { ...coleccionesDeLaBase, "clinics/c1": ["directMessages"] }, falla }), colecciones: COLECCIONES, escritor: escritorNulo });
    const texto = armarInforme(m);
    expect(texto).toContain("Lo que NO se pudo leer");
    expect(texto).toContain("incompleta");
  });
});
```

- [ ] **Paso 2: Verlas fallar.**

```bash
npx vitest run scripts/migracion/credenciales.test.ts scripts/migracion/exportar.test.ts
```

Esperado: FAIL (no existen `./credenciales.mjs`, `./exportar.mjs` ni `./informe.mjs`).

- [ ] **Paso 3: Escribir las credenciales, la exportación y el informe.**

`scripts/migracion/credenciales.mjs`:

```js
/** De dónde sale la credencial con la que se lee Firestore para exportar. Tres modos (`--credencial`):
 *
 *  - `firebase-cli` (el de siempre): la sesión del CLI de Firebase de esta máquina (`firebase login`). Es la cuenta dueña del proyecto, así que
 *    lee TODO, incluidos los mensajes directos del chat (que las reglas no dejan leer ni al usuario de servicio). Usa el propio CLI para
 *    renovar el token, sin guardar nada ni pedir claves.
 *  - `servicio`: el usuario de servicio que ya usa el servidor (`FIREBASE_WEB_API_KEY`, `SERVICE_USER_EMAIL`, `SERVICE_USER_PASSWORD`). Lee lo
 *    que las reglas le permiten (todo menos `directMessages`): sirve para medir, no para migrar.
 *  - `entorno`: un token ya generado en `GOOGLE_OAUTH_ACCESS_TOKEN` (por ejemplo, el de `gcloud auth print-access-token`, o «owner» contra
 *    el emulador).
 *
 *  Nunca imprime el token. */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export const MODOS = ["firebase-cli", "servicio", "entorno"];

/** Carga `lib/auth` del firebase-tools instalado (el que corre `firebase` en esta máquina). */
export function cargarAuthDelCli() {
  let binario;
  try {
    binario = realpathSync(execFileSync("which", ["firebase"], { encoding: "utf8" }).trim());
  } catch {
    throw new Error("No encuentro el CLI de Firebase en esta máquina. Instalalo (npm i -g firebase-tools) e iniciá sesión con: firebase login");
  }
  const corte = binario.indexOf("/firebase-tools");
  if (corte < 0) throw new Error(`No pude ubicar el paquete firebase-tools desde ${binario}.`);
  return createRequire(import.meta.url)(`${binario.slice(0, corte + "/firebase-tools".length)}/lib/auth`);
}

/** @returns {Promise<{ token: string, cuenta: string }>} */
export async function tokenDeFirebaseCli({ cargarAuth = cargarAuthDelCli } = {}) {
  const auth = cargarAuth();
  const cuenta = auth.getGlobalDefaultAccount?.();
  const renovar = cuenta?.tokens?.refresh_token;
  if (!renovar) throw new Error("El CLI de Firebase no tiene una sesión iniciada. Corré: firebase login");
  const nuevo = await auth.getAccessToken(renovar, ["https://www.googleapis.com/auth/cloud-platform"]);
  if (!nuevo?.access_token) throw new Error("El CLI de Firebase no pudo renovar la sesión. Corré: firebase login --reauth");
  return { token: nuevo.access_token, cuenta: cuenta.user?.email ?? "(sin email)" };
}

export async function tokenDeServicio(env, pedir = fetch) {
  const faltan = ["FIREBASE_WEB_API_KEY", "SERVICE_USER_EMAIL", "SERVICE_USER_PASSWORD"].filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan variables para el usuario de servicio: ${faltan.join(", ")}`);
  const res = await pedir(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SERVICE_USER_EMAIL, password: env.SERVICE_USER_PASSWORD, returnSecureToken: true }),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || !datos.idToken) throw new Error(`No se pudo iniciar sesión con el usuario de servicio (${datos?.error?.message ?? res.status}).`);
  return { token: datos.idToken, cuenta: env.SERVICE_USER_EMAIL };
}

export function tokenDeEntorno(env) {
  if (!env.GOOGLE_OAUTH_ACCESS_TOKEN) throw new Error("Falta la variable GOOGLE_OAUTH_ACCESS_TOKEN.");
  return { token: env.GOOGLE_OAUTH_ACCESS_TOKEN, cuenta: "(token de la variable de entorno)" };
}

/** @param {{ modo?: string, env?: Record<string, string | undefined>, fetch?: typeof fetch, cargarAuth?: () => any }} opciones */
export async function resolverToken({ modo = "firebase-cli", env = process.env, fetch: pedir = fetch, cargarAuth } = {}) {
  if (modo === "firebase-cli") return tokenDeFirebaseCli({ cargarAuth });
  if (modo === "servicio") return tokenDeServicio(env, pedir);
  if (modo === "entorno") return tokenDeEntorno(env);
  throw new Error(`Credencial desconocida: «${modo}». Opciones: ${MODOS.join(", ")}.`);
}
```

`scripts/migracion/exportar.mjs`:

```js
/** Exporta Firestore a archivos JSONL (uno por colección y clínica) y arma el manifiesto con cantidades, tamaños y SHA-256. Solo lectura.
 *  La lógica está acá, sin tocar el disco ni la red directamente, para probarla; `exportar-firestore.mjs` es la línea de comandos. */
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { ErrorDeLectura } from "./cliente.mjs";
import { decodificarDocumento, nuevosHallazgos } from "./valores.mjs";

/** Escribe los archivos de la exportación (permisos 700/600: son datos de pacientes). */
export function crearEscritorDeArchivos(raiz) {
  return {
    abrir(rutaRelativa) {
      const ruta = join(raiz, rutaRelativa);
      mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
      const fd = openSync(ruta, "w", 0o600);
      return { escribir: (texto) => writeSync(fd, texto), cerrar: () => closeSync(fd) };
    },
  };
}

/** No escribe nada (`--solo-medir`): cuenta y calcula igual. */
export const escritorNulo = { abrir: () => ({ escribir() {}, cerrar() {} }) };

/**
 * @typedef {{ archivo: string, docs: number, bytes: number, sha256: string, mayor: { id: string, bytes: number } | null, incompleta: boolean }} EstadisticaDeColeccion
 * @typedef {{ sinDocumento: boolean, documentos: number, bytes: number, colecciones: Record<string, EstadisticaDeColeccion> }} RegistroDeClinica
 * @typedef {{
 *   generado: string,
 *   totales: { documentos: number, bytes: number },
 *   raiz: Record<string, EstadisticaDeColeccion>,
 *   clinicas: Record<string, RegistroDeClinica>,
 *   desconocidas: { raiz: string[], clinicas: Record<string, string[]> },
 *   noLeidas: Array<{ ruta: string, estado: number | null, permiso: boolean }>,
 *   noMigradas: string[],
 *   documentosFantasma: string[],
 *   mayores: Array<{ ruta: string, id: string, bytes: number }>,
 *   hallazgos: ReturnType<typeof nuevosHallazgos>,
 * }} Manifiesto
 */

const segura = (nombre) => encodeURIComponent(nombre);
const MAYORES = 10;

/**
 * @param {{
 *   cliente: ReturnType<typeof import("./cliente.mjs").crearCliente>,
 *   colecciones: { porClinica: string[], raiz: string[], noSeMigra: string[] },
 *   escritor: { abrir(ruta: string): { escribir(t: string): void, cerrar(): void } },
 *   clinicas?: string[] | null,
 *   alAvanzar?: (mensaje: string) => void,
 *   ahora?: () => Date,
 * }} opciones
 * @returns {Promise<Manifiesto>}
 */
export async function exportarFirestore({ cliente, colecciones, escritor, clinicas = null, alAvanzar = () => {}, ahora = () => new Date() }) {
  const hallazgos = nuevosHallazgos();
  /** @type {Manifiesto} */
  const manifiesto = {
    generado: ahora().toISOString(),
    totales: { documentos: 0, bytes: 0 },
    raiz: {},
    clinicas: {},
    desconocidas: { raiz: [], clinicas: {} },
    noLeidas: [],
    noMigradas: [],
    documentosFantasma: [],
    mayores: [],
    hallazgos,
  };

  const anotarMayor = (ruta, id, bytes) => {
    manifiesto.mayores.push({ ruta, id, bytes });
    manifiesto.mayores.sort((a, b) => b.bytes - a.bytes);
    manifiesto.mayores.length = Math.min(manifiesto.mayores.length, MAYORES);
  };

  /** Una lectura que la base niega o que no se puede completar se anota y se sigue con lo demás (el informe la muestra). */
  async function leerOAnotar(accion, ruta, porDefecto) {
    try {
      return await accion();
    } catch (e) {
      if (!(e instanceof ErrorDeLectura)) throw e;
      manifiesto.noLeidas.push({ ruta, estado: e.estado ?? null, permiso: e.permiso });
      return porDefecto;
    }
  }

  /** Vuelca una colección a un archivo. Devuelve sus números y los documentos que encontró (también los «fantasma»). */
  async function volcar(rutaPadre, coleccion, archivo) {
    const ruta = [rutaPadre, coleccion].filter(Boolean).join("/");
    const salida = escritor.abrir(archivo);
    const hash = createHash("sha256");
    /** @type {EstadisticaDeColeccion} */
    const estadistica = { archivo, docs: 0, bytes: 0, sha256: "", mayor: null, incompleta: false };
    const encontrados = [];
    try {
      for await (const documento of cliente.listarDocumentos(rutaPadre, coleccion)) {
        const d = decodificarDocumento(documento, hallazgos);
        encontrados.push({ id: d.id, fantasma: d.fantasma });
        if (d.fantasma) { manifiesto.documentosFantasma.push(`${ruta}/${d.id}`); continue; }
        const linea = `${JSON.stringify({ id: d.id, data: d.data })}\n`;
        const bytes = Buffer.byteLength(linea);
        salida.escribir(linea);
        hash.update(linea);
        estadistica.docs++;
        estadistica.bytes += bytes;
        if (!estadistica.mayor || bytes > estadistica.mayor.bytes) estadistica.mayor = { id: d.id, bytes };
        anotarMayor(ruta, d.id, bytes);
      }
    } catch (e) {
      // Una lectura que la base niega o que no se puede completar se anota y se sigue con lo demás (el informe la muestra).
      if (!(e instanceof ErrorDeLectura)) throw e;
      manifiesto.noLeidas.push({ ruta, estado: e.estado ?? null, permiso: e.permiso });
      estadistica.incompleta = true;
    } finally {
      salida.cerrar();
    }
    estadistica.sha256 = hash.digest("hex");
    manifiesto.totales.documentos += estadistica.docs;
    manifiesto.totales.bytes += estadistica.bytes;
    alAvanzar(`${ruta}: ${estadistica.docs} documentos${estadistica.incompleta ? " (INCOMPLETA)" : ""}`);
    return { estadistica, encontrados };
  }

  // 1. Colecciones de primer nivel.
  const enLaBase = await leerOAnotar(() => cliente.listarColecciones(""), "(raíz)", []);
  const conocidas = new Set([...colecciones.raiz, ...colecciones.noSeMigra]);
  manifiesto.desconocidas.raiz = enLaBase.filter((c) => !conocidas.has(c));
  manifiesto.noMigradas = enLaBase.filter((c) => colecciones.noSeMigra.includes(c));
  const deLaRaiz = [...colecciones.raiz.filter((c) => c !== "clinics" && enLaBase.includes(c)), ...manifiesto.desconocidas.raiz];
  for (const coleccion of deLaRaiz) manifiesto.raiz[coleccion] = (await volcar("", coleccion, `raiz/${segura(coleccion)}.jsonl`)).estadistica;

  // 2. Las clínicas: su documento y cada una de sus subcolecciones.
  const { estadistica: docsDeClinicas, encontrados } = await volcar("", "clinics", "raiz/clinics.jsonl");
  manifiesto.raiz.clinics = docsDeClinicas;
  for (const { id: cid, fantasma } of encontrados) {
    if (clinicas && !clinicas.includes(cid)) continue;
    const subcolecciones = await leerOAnotar(() => cliente.listarColecciones(`clinics/${cid}`), `clinics/${cid}`, []);
    const desconocidas = subcolecciones.filter((c) => !colecciones.porClinica.includes(c));
    if (desconocidas.length) manifiesto.desconocidas.clinicas[cid] = desconocidas;
    /** @type {RegistroDeClinica} */
    const registro = { sinDocumento: fantasma, documentos: 0, bytes: 0, colecciones: {} };
    for (const coleccion of subcolecciones) {
      const { estadistica } = await volcar(`clinics/${cid}`, coleccion, `clinicas/${segura(cid)}/${segura(coleccion)}.jsonl`);
      registro.colecciones[coleccion] = estadistica;
      registro.documentos += estadistica.docs;
      registro.bytes += estadistica.bytes;
    }
    manifiesto.clinicas[cid] = registro;
  }
  return manifiesto;
}
```

`scripts/migracion/informe.mjs`:

```js
/** El informe de volumen de la exportación (Markdown): cuánto pesan los datos hoy y cuánto se espera con 30 clínicas, para decidir el
 *  tamaño del servidor. No incluye datos de pacientes: solo cantidades, tamaños e ids. */

const mb = (bytes) => (bytes / 1024 / 1024).toLocaleString("es-PY", { maximumFractionDigits: 2 });
const gb = (bytes) => (bytes / 1024 / 1024 / 1024).toLocaleString("es-PY", { maximumFractionDigits: 2 });
const fila = (...celdas) => `| ${celdas.join(" | ")} |`;
const tabla = (cabecera, filas) => [fila(...cabecera), fila(...cabecera.map(() => "---")), ...filas.map((f) => fila(...f))].join("\n");

/** Cuánto ocupa en Postgres respecto del JSON exportado (índices, relleno y versiones internas). Estimación gruesa a propósito. */
export const FACTOR_POSTGRES = 1.5;
export const CLINICAS_OBJETIVO = 30;
const CLINICA_DEMO = "cl_demo";

/** Las clínicas de verdad: todas menos la demo. */
/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function clinicasReales(manifiesto) {
  return Object.entries(manifiesto.clinicas).filter(([cid]) => cid !== CLINICA_DEMO);
}

/** Proyección del tamaño de la base con `objetivo` clínicas, a partir del promedio de las reales. `null` si todavía no hay ninguna. */
/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function proyectar(manifiesto, objetivo = CLINICAS_OBJETIVO) {
  const reales = clinicasReales(manifiesto);
  if (reales.length === 0) return null;
  const promedio = reales.reduce((n, [, c]) => n + c.bytes, 0) / reales.length;
  const exportado = promedio * objetivo;
  return { clinicasReales: reales.length, promedioPorClinica: promedio, exportado, enPostgres: exportado * FACTOR_POSTGRES };
}

/** @param {import("./exportar.mjs").Manifiesto} manifiesto */
export function armarInforme(manifiesto, { proyecto = "(sin nombre)", credencial = "(sin dato)", objetivo = CLINICAS_OBJETIVO } = {}) {
  const t = manifiesto.totales;
  const clinicas = Object.entries(manifiesto.clinicas);
  const porColeccion = {};
  for (const [, c] of clinicas) {
    for (const [nombre, e] of Object.entries(c.colecciones)) {
      const acum = (porColeccion[nombre] ??= { docs: 0, bytes: 0, mayor: 0 });
      acum.docs += e.docs; acum.bytes += e.bytes; acum.mayor = Math.max(acum.mayor, e.mayor?.bytes ?? 0);
    }
  }
  const proyeccion = proyectar(manifiesto, objetivo);
  const h = manifiesto.hallazgos;
  const hallazgos = Object.entries(h).filter(([, n]) => n > 0);

  const partes = [
    `# Informe de volumen de Firestore`,
    `Generado el ${manifiesto.generado} · proyecto \`${proyecto}\` · credencial: ${credencial}`,
    `## Resumen`,
    tabla(["Qué", "Cantidad"], [
      ["Clínicas (con la demo)", String(clinicas.length)],
      ["Clínicas reales", String(clinicasReales(manifiesto).length)],
      ["Documentos exportados", t.documentos.toLocaleString("es-PY")],
      ["Tamaño exportado (JSON)", `${mb(t.bytes)} MB`],
      ["Documento más grande", manifiesto.mayores[0] ? `${manifiesto.mayores[0].ruta}/${manifiesto.mayores[0].id} — ${mb(manifiesto.mayores[0].bytes)} MB` : "—"],
    ]),
    `## Por clínica`,
    tabla(["Clínica", "Usuarios", "Pacientes", "Documentos", "Tamaño (MB)"], clinicas
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([cid, c]) => [`\`${cid}\`${c.sinDocumento ? " (sin documento)" : ""}`, String(c.colecciones.users?.docs ?? 0), String(c.colecciones.patients?.docs ?? 0), String(c.documentos), mb(c.bytes)])),
    `## Por colección (todas las clínicas)`,
    tabla(["Colección", "Documentos", "Tamaño (MB)", "Documento más grande (MB)"], Object.entries(porColeccion)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([nombre, e]) => [`\`${nombre}\``, String(e.docs), mb(e.bytes), mb(e.mayor)])),
    `## Proyección para ${objetivo} clínicas`,
    proyeccion
      ? [
        `Con el promedio de las ${proyeccion.clinicasReales} clínicas reales (${mb(proyeccion.promedioPorClinica)} MB cada una):`,
        tabla(["", "Tamaño"], [
          [`Datos exportados (JSON) con ${objetivo} clínicas`, `${gb(proyeccion.exportado)} GB`],
          [`En Postgres (×${FACTOR_POSTGRES}: índices y relleno; estimación)`, `${gb(proyeccion.enPostgres)} GB`],
        ]),
        `Los 160 GB del servidor mínimo del spec alcanzan si el total en Postgres queda bien por debajo; los 240 GB recomendados dejan lugar a los respaldos locales y al crecimiento.`,
      ].join("\n\n")
      : `Todavía no hay clínicas reales (solo la demo): no hay promedio para proyectar.`,
    `## Tipos de dato que no son JSON puro`,
    hallazgos.length
      ? tabla(["Tipo", "Veces"], hallazgos.map(([tipo, n]) => [tipo, String(n)]))
      : `Ninguno: todo es texto, números, booleanos, mapas y arreglos (lo esperado: la app guarda las fechas como texto ISO).`,
  ];

  if (manifiesto.noLeidas.length) {
    partes.push(`## ⚠️ Lo que NO se pudo leer`, tabla(["Ruta", "Respuesta", "Por permiso"], manifiesto.noLeidas.map((n) => [`\`${n.ruta}\``, String(n.estado ?? "sin conexión"), n.permiso ? "sí" : "no"])),
      `La exportación está **incompleta**: no sirve para migrar hasta que esto quede vacío (probá con \`--credencial firebase-cli\`).`);
  }
  const desconocidas = [...manifiesto.desconocidas.raiz.map((c) => `\`${c}\` (primer nivel)`), ...Object.entries(manifiesto.desconocidas.clinicas).flatMap(([cid, cs]) => cs.map((c) => `\`clinics/${cid}/${c}\``))];
  if (desconocidas.length) partes.push(`## Colecciones que no están en el manifiesto`, `Se exportaron igual, pero hay que decidir qué hacer con ellas (¿falta sumarlas a \`lib/backend/colecciones.json\`?): ${desconocidas.join(", ")}.`);
  if (manifiesto.documentosFantasma.length) partes.push(`## Documentos que no existen pero tienen subcolecciones`, manifiesto.documentosFantasma.map((r) => `- \`${r}\``).join("\n"));
  if (manifiesto.noMigradas.length) partes.push(`## No se migran`, manifiesto.noMigradas.map((c) => `- \`${c}\` (la lista de usuarios de servicio de Firebase: en Supabase no existe)`).join("\n"));
  if (manifiesto.mayores.length) partes.push(`## Los ${manifiesto.mayores.length} documentos más grandes`, tabla(["Documento", "Tamaño (MB)"], manifiesto.mayores.map((m) => [`\`${m.ruta}/${m.id}\``, mb(m.bytes)])));
  return `${partes.join("\n\n")}\n`;
}
```

- [ ] **Paso 4: Verlas pasar.**

```bash
npx vitest run scripts/migracion && npx tsc --noEmit
```

Esperado: 35 pruebas verdes en `scripts/migracion` y `tsc` limpio.

- [ ] **Paso 5: Commit.**

```bash
git add scripts/migracion/credenciales.mjs scripts/migracion/exportar.mjs scripts/migracion/informe.mjs scripts/migracion/credenciales.test.ts scripts/migracion/exportar.test.ts
git commit -m "feat(migracion): credenciales del CLI de Firebase, exportación a JSONL con manifiesto y SHA-256, e informe de volumen"
```

---

### Tarea 9: Exportador — línea de comandos y prueba completa con el emulador

**Archivos:**
- Crear: `scripts/migracion/exportar-firestore.mjs`
- Modificar: `package.json`
- Pruebas: `scripts/migracion/exportar-firestore.test.ts`, `scripts/migracion/exportar.emulador.test.ts`

**Interfaces:**
- Consume: todo lo de las Tareas 7 y 8, y `lib/backend/colecciones.json`.
- Produce: `leerArgumentos(argv, env?)`, `carpetaDeSalida(salida, opciones?)` y el programa `node scripts/migracion/exportar-firestore.mjs` (`npm run migracion:exportar`). Códigos de salida: 0 completa, 2 hay colecciones que no se pudieron leer, 1 error.

- [ ] **Paso 1: Escribir las pruebas que fallan.** La del emulador corre el exportador completo contra Firestore de verdad con reglas cerradas y el token «owner»: más de 300 documentos (obliga a paginar), tipos que no son JSON (fecha y punto), una subcolección que no está en el manifiesto, una clínica sin documento y `serviceAccounts`.

`scripts/migracion/exportar-firestore.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { carpetaDeSalida, leerArgumentos } from "./exportar-firestore.mjs";

describe("leerArgumentos", () => {
  it("los valores por defecto", () => {
    expect(leerArgumentos([], {})).toMatchObject({ credencial: "firebase-cli", proyecto: "novudent-664f3", soloMedir: false, permitirIncompleto: false, clinicas: [], salida: null, base: null });
  });
  it("lee cada opción, y --clinica se repite", () => {
    const o = leerArgumentos(["--salida", "/x", "--credencial", "servicio", "--proyecto", "otro", "--base", "http://h", "--clinica", "a", "--clinica", "b", "--solo-medir", "--permitir-incompleto"], {});
    expect(o).toMatchObject({ salida: "/x", credencial: "servicio", proyecto: "otro", base: "http://h", clinicas: ["a", "b"], soloMedir: true, permitirIncompleto: true });
  });
  it("el proyecto por defecto sale de FIREBASE_PROJECT_ID", () => {
    expect(leerArgumentos([], { FIREBASE_PROJECT_ID: "mi-proyecto" }).proyecto).toBe("mi-proyecto");
  });
  it("una opción desconocida, un valor que falta o una credencial inválida fallan con un mensaje claro", () => {
    expect(() => leerArgumentos(["--rara"], {})).toThrow(/Opción desconocida/);
    expect(() => leerArgumentos(["--salida"], {})).toThrow(/Falta el valor de --salida/);
    expect(() => leerArgumentos(["--salida", "--solo-medir"], {})).toThrow(/Falta el valor/);
    expect(() => leerArgumentos(["--credencial", "magia"], {})).toThrow(/--credencial debe ser/);
  });
});

describe("carpetaDeSalida", () => {
  const base = { directorioActual: "/home/yo/proyecto", casa: "/home/yo", hoy: new Date("2026-10-09T12:00:00Z") };
  it("por defecto va a ~/novudent-export/<fecha>", () => {
    expect(carpetaDeSalida(null, base)).toBe("/home/yo/novudent-export/2026-10-09");
  });
  it("no deja guardar dentro del repositorio (ni en el propio directorio)", () => {
    expect(() => carpetaDeSalida("/home/yo/proyecto/salida", base)).toThrow(/dentro del repositorio/);
    expect(() => carpetaDeSalida("salida", base)).not.toThrow(); // relativa al cwd real de la prueba, que no es /home/yo/proyecto
    expect(() => carpetaDeSalida("/home/yo/proyecto", base)).toThrow(/dentro del repositorio/);
  });
  it("una carpeta hermana del repositorio sí vale", () => {
    expect(carpetaDeSalida("/home/yo/proyecto-export", base)).toBe("/home/yo/proyecto-export");
  });
});
```

`scripts/migracion/exportar.emulador.test.ts`:

```ts
/** El exportador completo contra Firestore de verdad (el emulador), con la API REST y el token «owner» (que se salta las reglas, como el CLI
 *  de Firebase en producción). Requiere Java y el CLI de Firebase: `npm run test:backend`. */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, GeoPoint, setDoc, Timestamp, writeBatch, type Firestore } from "firebase/firestore";
import { crearCliente } from "./cliente.mjs";
import { crearEscritorDeArchivos, exportarFirestore } from "./exportar.mjs";
import colecciones from "../../lib/backend/colecciones.json";

const PROYECTO = "novudent-exportar";
const REGLAS_CERRADAS = "rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if false; } } }";
let entorno: RulesTestEnvironment;
let carpeta: string;

beforeAll(async () => {
  carpeta = mkdtempSync(join(tmpdir(), "export-emu-"));
  entorno = await initializeTestEnvironment({ projectId: PROYECTO, firestore: { rules: REGLAS_CERRADAS } });
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, "clinics/c1"), { name: "Clínica Uno", plan: "clinica", config: { moneda: "PYG" } });
    await setDoc(doc(db, "clinics/cl_demo"), { name: "Demo" });
    await setDoc(doc(db, "clinics/c1/users/u1"), { name: "Ana", role: "admin" });
    await setDoc(doc(db, "clinics/c1/patients/p1"), { nombre: "Luis", fecha: Timestamp.fromDate(new Date("2026-01-02T03:04:05Z")), lugar: new GeoPoint(-25.3, -57.6), lista: [1, "a", { x: true }] });
    await setDoc(doc(db, "clinics/c1/directMessages/m1"), { participants: ["u1", "u2"], text: "hola" });
    await setDoc(doc(db, "clinics/c1/inventada/x"), { a: 1 });
    await setDoc(doc(db, "clinics/fantasma/patients/p9"), { nombre: "Sin clínica" });
    await setDoc(doc(db, "directory/u1"), { clinicId: "c1" });
    await setDoc(doc(db, "serviceAccounts/svc"), { x: 1 });
    // Más de 300 documentos: obliga a pasar de página (el tamaño de página de la exportación es 300).
    for (const desde of [0, 350]) {
      const lote = writeBatch(db);
      for (let n = desde; n < desde + 350; n++) lote.set(doc(db, `clinics/c1/stock/s${String(n).padStart(4, "0")}`), { n });
      await lote.commit();
    }
  });
}, 60_000);

afterAll(async () => {
  await entorno.cleanup();
  rmSync(carpeta, { recursive: true, force: true });
});

describe("exportarFirestore contra el emulador", () => {
  it("exporta todo, pasa de página y reconoce lo raro", async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    expect(host, "falta FIRESTORE_EMULATOR_HOST: corré `npm run test:backend`").toBeTruthy();
    const cliente = crearCliente({ proyecto: PROYECTO, token: "owner", base: `http://${host}/v1/projects/${PROYECTO}/databases/(default)/documents` });
    const m = await exportarFirestore({ cliente, colecciones, escritor: crearEscritorDeArchivos(carpeta) });

    expect(m.noLeidas).toEqual([]); // el token «owner» se salta las reglas cerradas, incluido directMessages
    expect(m.clinicas.c1.colecciones.stock.docs).toBe(700);
    expect(m.clinicas.c1.colecciones.directMessages.docs).toBe(1);
    expect(m.hallazgos).toMatchObject({ timestamp: 1, geopoint: 1 });
    expect(m.noMigradas).toEqual(["serviceAccounts"]);
    expect(m.desconocidas.clinicas).toEqual({ c1: ["inventada"] });
    expect(m.documentosFantasma).toEqual(["clinics/fantasma"]);
    expect(m.clinicas.fantasma).toMatchObject({ sinDocumento: true, documentos: 1 });
    expect(m.raiz.clinics.docs).toBe(2);
    expect(m.raiz.directory.docs).toBe(1);

    const archivo = join(carpeta, "clinicas/c1/patients.jsonl");
    expect(JSON.parse(readFileSync(archivo, "utf8").trim())).toEqual({
      id: "p1",
      data: { nombre: "Luis", fecha: "2026-01-02T03:04:05Z", lugar: { latitude: -25.3, longitude: -57.6 }, lista: [1, "a", { x: true }] },
    });
    expect(m.clinicas.c1.colecciones.patients.sha256).toBe(createHash("sha256").update(readFileSync(archivo)).digest("hex"));
    const ids = readFileSync(join(carpeta, "clinicas/c1/stock.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).id);
    expect(new Set(ids).size).toBe(700);
  });

  it("sin credencial válida el emulador (con reglas cerradas) niega y queda anotado", async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    const cliente = crearCliente({ proyecto: PROYECTO, token: "cualquiera", base: `http://${host}/v1/projects/${PROYECTO}/databases/(default)/documents`, esperar: async () => {}, reintentos: 0 });
    const m = await exportarFirestore({ cliente, colecciones, escritor: { abrir: () => ({ escribir() {}, cerrar() {} }) } });
    expect(m.noLeidas.length).toBeGreaterThan(0);
    expect(m.totales.documentos).toBe(0);
  });
});
```

- [ ] **Paso 2: Verlas fallar.**

```bash
npx vitest run scripts/migracion/exportar-firestore.test.ts
```

Esperado: FAIL (no existe `./exportar-firestore.mjs`).

- [ ] **Paso 3: Escribir la línea de comandos y el script de `package.json`.**

`scripts/migracion/exportar-firestore.mjs`:

```js
#!/usr/bin/env node
/** Exporta TODO Firestore (solo lectura) a archivos JSONL y entrega el informe de volumen que decide el tamaño del servidor.
 *
 *    npm run migracion:exportar -- --solo-medir                      # mide, no guarda datos de pacientes
 *    npm run migracion:exportar -- --salida ~/novudent-export/hoy    # exporta (los archivos tienen datos de pacientes: 700/600)
 *
 *  Opciones: --salida DIR · --credencial firebase-cli|servicio|entorno · --proyecto ID · --base URL (el emulador) · --clinica ID (repetible)
 *            --solo-medir · --permitir-incompleto · --ayuda
 *  Código de salida: 0 completa · 2 hay colecciones que no se pudieron leer (la exportación NO sirve para migrar) · 1 error. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crearCliente } from "./cliente.mjs";
import { MODOS, resolverToken } from "./credenciales.mjs";
import { crearEscritorDeArchivos, escritorNulo, exportarFirestore } from "./exportar.mjs";
import { armarInforme } from "./informe.mjs";

const AYUDA = `Uso: node scripts/migracion/exportar-firestore.mjs [opciones]
  --salida DIR            carpeta de la exportación (por defecto ~/novudent-export/<fecha>; no puede estar dentro del repositorio)
  --credencial MODO       ${MODOS.join(" | ")} (por defecto firebase-cli)
  --proyecto ID           proyecto de Firebase (por defecto FIREBASE_PROJECT_ID o novudent-664f3)
  --base URL              API de Firestore alternativa (el emulador)
  --clinica ID            solo las subcolecciones de esa clínica (se puede repetir)
  --solo-medir            cuenta y mide sin guardar los datos
  --permitir-incompleto   no fallar si alguna colección no se pudo leer
  --ayuda                 esta ayuda`;

/** @param {string[]} argv @param {Record<string, string | undefined>} [env] */
export function leerArgumentos(argv, env = process.env) {
  const opciones = {
    salida: null, credencial: "firebase-cli", proyecto: env.FIREBASE_PROJECT_ID || "novudent-664f3", base: null,
    clinicas: [], soloMedir: false, permitirIncompleto: false, ayuda: false,
  };
  const valor = (i, nombre) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`Falta el valor de ${nombre}.\n${AYUDA}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--salida") opciones.salida = valor(i++, a);
    else if (a === "--credencial") opciones.credencial = valor(i++, a);
    else if (a === "--proyecto") opciones.proyecto = valor(i++, a);
    else if (a === "--base") opciones.base = valor(i++, a);
    else if (a === "--clinica") opciones.clinicas.push(valor(i++, a));
    else if (a === "--solo-medir") opciones.soloMedir = true;
    else if (a === "--permitir-incompleto") opciones.permitirIncompleto = true;
    else if (a === "--ayuda" || a === "-h") opciones.ayuda = true;
    else throw new Error(`Opción desconocida: ${a}\n${AYUDA}`);
  }
  if (!MODOS.includes(opciones.credencial)) throw new Error(`--credencial debe ser una de: ${MODOS.join(", ")}.`);
  return opciones;
}

/** La exportación tiene datos de pacientes: no puede terminar dentro del repositorio (se subiría con un `git add .`). */
export function carpetaDeSalida(salida, { hoy = new Date(), directorioActual = process.cwd(), casa = homedir() } = {}) {
  const carpeta = resolve(salida ?? join(casa, "novudent-export", hoy.toISOString().slice(0, 10)));
  const relativa = relative(directorioActual, carpeta);
  if (relativa === "" || (!relativa.startsWith("..") && !isAbsolute(relativa))) {
    throw new Error(`La exportación contiene datos de pacientes: no la guardes dentro del repositorio (${carpeta}). Usá una carpeta fuera, por ejemplo ~/novudent-export.`);
  }
  return carpeta;
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda) { console.log(AYUDA); return 0; }
  const carpeta = carpetaDeSalida(opciones.salida);
  const colecciones = JSON.parse(readFileSync(new URL("../../lib/backend/colecciones.json", import.meta.url), "utf8"));

  const { token, cuenta } = await resolverToken({ modo: opciones.credencial });
  console.error(`Proyecto ${opciones.proyecto} · credencial ${opciones.credencial} (${cuenta})${opciones.soloMedir ? " · solo medir" : ""}`);
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });

  const cliente = crearCliente({ proyecto: opciones.proyecto, token, base: opciones.base ?? undefined });
  const manifiesto = await exportarFirestore({
    cliente,
    colecciones,
    escritor: opciones.soloMedir ? escritorNulo : crearEscritorDeArchivos(carpeta),
    clinicas: opciones.clinicas.length ? opciones.clinicas : null,
    alAvanzar: (mensaje) => console.error(mensaje),
  });

  writeFileSync(join(carpeta, "manifiesto.json"), `${JSON.stringify({ proyecto: opciones.proyecto, credencial: cuenta, soloMedir: opciones.soloMedir, ...manifiesto }, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(carpeta, "informe-de-volumen.md"), armarInforme(manifiesto, { proyecto: opciones.proyecto, credencial: cuenta }), { mode: 0o600 });
  console.error(`\nListo: ${manifiesto.totales.documentos} documentos, ${(manifiesto.totales.bytes / 1024 / 1024).toFixed(1)} MB → ${carpeta}`);

  if (manifiesto.noLeidas.length && !opciones.permitirIncompleto) {
    console.error(`\n⚠️  ${manifiesto.noLeidas.length} colección(es) NO se pudieron leer: la exportación está incompleta (mirá el informe).`);
    return 2;
  }
  return 0;
}

// Solo corre como programa (no cuando lo importan las pruebas).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().then((codigo) => process.exit(codigo), (e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
```

En `package.json`, en `scripts`, agregá justo debajo de `"test:backend"`:

```json
    "migracion:exportar": "node scripts/migracion/exportar-firestore.mjs",
```

- [ ] **Paso 4: Verlas pasar.**

```bash
npx vitest run scripts/migracion && npx tsc --noEmit && npm run test:backend
```

Esperado: 42 pruebas verdes en `scripts/migracion` (las del emulador no entran en `npm test`), `tsc` limpio y `npm run test:backend` con 23 pruebas verdes.

- [ ] **Paso 5: Prueba de humo de la línea de comandos contra el emulador** (opcional pero recomendada: valida los permisos de los archivos, el código de salida y el informe). En una terminal:

```bash
firebase emulators:start --only firestore --project demo-cli
```

En otra, cargá unos documentos y corré el exportador con el token «owner» del emulador:

```bash
B="http://127.0.0.1:8080/v1/projects/demo-cli/databases/(default)/documents"
mk() { curl -s -X POST -H "Authorization: Bearer owner" -H "Content-Type: application/json" "$B/$1?documentId=$2" -d "$3" >/dev/null; }
mk clinics c1 '{"fields":{"name":{"stringValue":"Clinica Uno"}}}'
mk clinics/c1/patients p1 '{"fields":{"nombre":{"stringValue":"Luis"}}}'
GOOGLE_OAUTH_ACCESS_TOKEN=owner node scripts/migracion/exportar-firestore.mjs --credencial entorno --proyecto demo-cli --base "$B" --salida ~/novudent-export-prueba
echo "código de salida: $?"; ls -l ~/novudent-export-prueba ~/novudent-export-prueba/clinicas/c1
```

Esperado: código de salida 0; carpeta `drwx------` y archivos `-rw-------`; `informe-de-volumen.md` con el resumen. Después borrá `~/novudent-export-prueba` y detené el emulador (Ctrl+C).

- [ ] **Paso 6: Commit.**

```bash
git add scripts/migracion/exportar-firestore.mjs scripts/migracion/exportar-firestore.test.ts scripts/migracion/exportar.emulador.test.ts package.json
git commit -m "feat(migracion): npm run migracion:exportar — exporta Firestore (solo lectura) y arma el informe de volumen"
```

---

### Tarea 10: Documentación, verificación completa y publicación

**Archivos:**
- Modificar: `CLAUDE.md` (del repo), `docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md`

- [ ] **Paso 1: Documentar la capa en `CLAUDE.md`.** Agregá este párrafo justo antes de «## Diferenciadores (cross-repo con Botika)»:

```markdown
**Capa de datos (9-oct-2026, parte P1 del servidor propio)** — `lib/backend/`. La tienda y las pantallas ya no hablan con Firebase: usan
`backendDeDatos` (`lib/backend/index.ts`), que cumple `DatosDeBackend` (leer la clínica, `guardar`, `quitar`, `fijarCampo`, `mezclarClinica`,
`lote`, `escuchar*`) y `SesionDeBackend` (login, token para `/api`, recuperar contraseña) de `tipos.ts`. Hoy la única implementación es
`firestore.ts`; `NEXT_PUBLIC_BACKEND` (por defecto `firestore`) la elige y `supabase` todavía no existe (parte P3, ver
`docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md`). **Solo `lib/firebase.ts` y `lib/backend/firestore.ts` pueden importar
`firebase/*`** (lo exige `aislamiento.test.ts`): una pantalla que necesite algo de la base se lo pide a la interfaz. Qué se lee al abrir una clínica,
cómo se arma la `DB` y la semilla y puesta al día de la demo viven en `carga.ts` (`cargarDB`), probadas con el backend en memoria (`memoria.ts`).
**Para sumar una colección:** agregala a `lib/backend/colecciones.json` (`colecciones.test.ts` la ata a `firestore.rules` y a la semilla) además de lo de
siempre. **Toda implementación pasa el mismo contrato** (`contrato-de-datos.ts`): `npm test` lo corre contra la memoria y `npm run test:backend` (necesita
Java y el CLI de Firebase) contra el emulador de Firestore, incluida la lectura con las reglas reales. El `backend` del store
(`"connecting" | "firebase" | "local"`) es otra cosa —el estado de la conexión—; por eso el objeto se llama `backendDeDatos`.
**Exportar Firestore (solo lectura):** `npm run migracion:exportar -- --solo-medir` cuenta y mide todo sin guardar datos de pacientes y deja
`informe-de-volumen.md` (con la proyección para 30 clínicas); sin `--solo-medir` guarda un JSONL por colección y clínica, con `manifiesto.json` (cantidades,
bytes y SHA-256). La credencial por defecto es la sesión del CLI de Firebase (`firebase login`), la única que lee los mensajes directos del chat. **La
exportación tiene datos de pacientes: va fuera del repo (`~/novudent-export`), el script se niega a escribir adentro.** Código de salida 2 = quedó algo sin leer.
```

- [ ] **Paso 2: Poner el spec al día con lo que quedó.** En `docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md`:

1. En §5.1, reemplazá `(`db/manifiesto.ts`: nombre, permiso de lectura, permiso de escritura, índices extra)` por `(hoy `lib/backend/colecciones.json`, solo con los nombres; P2 le suma permisos e índices)`.
2. En §9, justo debajo del bloque de código de la interfaz, agregá: `> La interfaz que quedó (P1) es más fina y está en `lib/backend/tipos.ts`: `cargarClinica` se partió en `leerClinica` + `cargarDB` (`lib/backend/carga.ts`), `escuchar` en `escucharSuscripcion` / `escucharClinica` / `escucharColeccion`, y se sumaron `esperarSesion`, `iniciarSesionDeDemo` y `clinicaDelUsuario`.`
3. En §11.1, agregá: `La credencial por defecto es la sesión del CLI de Firebase (`firebase login`), porque es la única que lee `directMessages` (las reglas no se lo permiten al usuario de servicio); el comando es `npm run migracion:exportar`.`

- [ ] **Paso 3: Verificación completa.**

```bash
npx tsc --noEmit
npx vitest run
npm run test:backend
npm run test:rules
flock -w 900 /tmp/novudent-pesado.lock npm run build
E2E_PORT=3197 flock -w 900 /tmp/novudent-pesado.lock npx playwright test --reporter=list
```

Esperado: todo verde (el 9-oct-2026 la batería e2e completa daba 929 pasadas y 45 saltadas, 9 minutos).

- [ ] **Paso 4: Commit y publicación.** P1 no cambia nada visible, así que va directo a `main`, como los demás cambios de este repo:

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md
git commit -m "docs: capa de datos y exportación de Firestore (P1 del servidor propio)"
git checkout main && git merge --no-ff feat/capa-de-datos -m "Merge feat/capa-de-datos: la tienda habla con una interfaz y no con Firebase (P1 del servidor propio)"
git push origin main
```

- [ ] **Paso 5: Esperar el deploy.** `get_deployment` del conector de Vercel (equipo `croman-mvp-s-projects`, proyecto `novudent-app`) hasta `READY` (unos 50 s), o `vercel ls` con la config del equipo (ver la memoria `novudent-e2e-contra-produccion`).

- [ ] **Paso 6: Prueba en producción sobre la demo** (la única que toca Firestore real con el código nuevo; las clínicas reales no se tocan). Abrí `https://novudent.novumholding.lat/login?demo=1`, «Ver demo» y entrá como **Carlos Admin**. Verificá, en este orden:

1. El encabezado dice **«En línea»** (con el punto verde): la tienda leyó la clínica por `leerClinica` y no cayó al modo local. Si dice «Sin conexión», **revertí el merge** (`git revert -m 1 <merge>`) y avisá: es lo que esta tarea existe para atrapar.
2. Agenda → Semanal → tocá un espacio libre → «Bloquear espacio» → guardá: aparece el bloqueo rayado (escribe con `lote`/`guardar`).
3. Recargá la página: el bloqueo sigue ahí (se leyó de Firestore).
4. Tocá el bloqueo → «Quitar este bloqueo»: desaparece (`quitar`). Recargá: sigue sin estar.
5. En «Olvidé mi contraseña» del login, el formulario se abre sin errores en la consola.
6. La consola del navegador no muestra errores nuevos.

La demo queda como estaba (el bloqueo se quitó). Si algo falla: `git revert -m 1 <merge>`, push, y arreglalo en la rama.

- [ ] **Paso 7: Memoria.** Actualizá la memoria `novum-migracion-supabase-propio-9-oct-2026` con el estado: P1 publicado, rama, qué falta.

---

### Tarea 11: Medir el Firestore real (necesita el OK de Croman)

**Archivos:** ninguno en el repo (el informe va a `~/novudent-export/<fecha>/`). Después se actualiza el spec con los números.

**Antes de empezar, pedile el OK a Croman por chat:** esta tarea **lee todos los documentos de producción** (incluidas fichas de pacientes) con la sesión del CLI de Firebase, solo de lectura. Con `--solo-medir` nada se guarda en disco salvo `manifiesto.json` e `informe-de-volumen.md` (cantidades, tamaños e ids; ningún nombre ni dato clínico). Las lecturas cuentan para la cuota de Firestore (50.000 diarias gratis; después unos USD 0,06 cada 100.000): para unas pocas clínicas es centavos.

- [ ] **Paso 1: Medir.**

```bash
firebase login:list        # confirmá que la cuenta activa es la dueña del proyecto novudent-664f3
npm run migracion:exportar -- --solo-medir
```

Esperado: avanza imprimiendo cada colección y termina con `Listo: N documentos, X MB → ~/novudent-export/<fecha>` y código de salida 0. Si termina con código 2, hay colecciones que no se pudieron leer: mirá la sección «Lo que NO se pudo leer» del informe antes de seguir.

- [ ] **Paso 2: Leer el informe.**

```bash
cat ~/novudent-export/$(date +%F)/informe-de-volumen.md
```

Anotá: cantidad de clínicas reales y de usuarios, tamaño total, el documento más grande (los de base64 se acercan al tope de 1 MB), si aparecen tipos que no son JSON puro, colecciones que no están en el manifiesto y documentos «fantasma».

- [ ] **Paso 3: Poner el spec al día.** En §10.2 («Servidor»), reemplazá la estimación por los números medidos (tamaño actual, proyección para 30 clínicas del informe y si alcanzan los 160 GB mínimos o los 240 GB recomendados) y en §17 («Verificaciones que quedan abiertas») marcá como cerradas las que el informe responde. Commit:

```bash
git add docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md
git commit -m "docs(spec): volumen real de Firestore medido con npm run migracion:exportar"
```

- [ ] **Paso 4: Decidir con Croman** si hace falta una exportación completa ahora. No hace falta para P1 (es de P5/P7: ahí se hace el simulacro y la carga a Postgres). Si la quiere de todos modos, `npm run migracion:exportar` (sin `--solo-medir`) guarda los datos en `~/novudent-export/<fecha>` con permisos 700/600: **cifrá o borrá esa carpeta cuando termine** y no la copies a ningún otro lado.

---

## Cobertura del spec (autocontrol)

| Requisito del spec | Dónde |
|---|---|
| §9 interfaz de la capa de datos; la tienda no importa `firebase/*` | Tareas 2, 3, 5, 6 (`aislamiento.test.ts`) |
| §9 `NEXT_PUBLIC_BACKEND`, por defecto `firestore` | Tarea 6 (`index.ts`, `index.test.ts`) |
| §13 P1: `tsc`, pruebas unitarias y e2e siguen verdes | Tareas 6 y 10 |
| §13 P1: el script de exportación corre contra Firestore real y entrega el informe de volumen | Tareas 9 y 11 |
| §11.1 exportar: JSONL por colección y clínica, manifiesto con cantidades, bytes y SHA-256; tamaño total, documentos más grandes, tipos que no son JSON, usuarios y clínicas reales; solo lectura | Tareas 7 a 9 |
| §14 riesgo «pérdida de datos»: exportación de solo lectura | Tareas 7 a 9 |
| §17 verificaciones abiertas (volumen, tipos, clínicas, otros sistemas) | Tarea 11 (los «otros sistemas» no los responde este plan: preguntar a Croman) |
| §9 lado servidor (`DatosDeServidor`) y Analytics | **Fuera de P1** (P3) |
| §11.1 «usuarios reales frente a anónimos» | El informe cuenta los usuarios que figuran en cada clínica (`users`). Las cuentas anónimas de Firebase Auth no se pueden contar por REST sin ser administrador de Auth y no hacen falta para migrar; la lista de usuarios reales con sus emails se baja en P5 con `firebase auth:export` |
