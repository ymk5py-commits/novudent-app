# Tareas automáticas de gestión — diseño

**Fecha:** 30-jul-2026
**Referencia:** [docs/dentalink/03-reportes-y-crm.md](../../dentalink/03-reportes-y-crm.md) §CRM → Tareas de gestión

## Problema

Novudent ya tiene `/app/tareas` con los cinco tipos de Dentalink (`cita`,
`captura`, `control`, `cobranza`, `personalizada`), filtros, asignación y cierre
por resolución. Lo que no tiene es lo que hace que el módulo sirva:

1. **No se generan solas.** Hay un botón "Generar automáticas" que alguien tiene
   que apretar. Si nadie lo aprieta, la bandeja está vacía y miente.
2. **No se cierran nunca.** Si el paciente paga, la tarea de cobranza sigue
   abierta. Una bandeja que no se vacía sola es peor que no tenerla: se llena de
   ruido y el equipo deja de mirarla.
3. **`cita` no existe en la práctica.** Está en el enum, ninguna regla la produce.
4. **No hay noción de vencimiento.** No hay "del día" ni "atrasadas", que es como
   Dentalink ordena el trabajo.
5. **Las reglas viven dentro del componente React** (`app/app/tareas/page.tsx`
   líneas 40-67). No son puras, no tienen tests, y contradicen la norma del
   proyecto: *"validadores clínicos = puros + TDD"*.

## Restricción que manda sobre el diseño

Novudent corre en **Firebase Spark sin Admin SDK**: no hay cron, no hay proceso
de servidor que recorra las clínicas de noche. Dentalink genera y cierra las
tareas del lado del servidor; nosotros no podemos copiar esa mecánica.

## Decisión: derivar en lectura

Las tareas automáticas **no se guardan: se calculan** desde el estado de la
clínica cada vez que se abre la bandeja, con funciones puras.

El auto-cierre sale gratis de esta decisión: si el paciente pagó, la condición
"tiene saldo > 0" deja de cumplirse y la tarea simplemente no se deriva más. No
hay proceso que la cierre porque no hay nada que cerrar.

Se descartaron:

- **Cron en Vercel** que materializa filas (lo que hace Dentalink): el plan Hobby
  limita los cron, el usuario de servicio tendría que iterar todas las clínicas, y
  habría que escribir *además* la lógica de cierre, que acá es implícita.
- **Materializar en cada escritura**: no puede disparar por paso del tiempo (un
  presupuesto que cumple 15 días sin aceptarse) y desparrama la lógica por todos
  los caminos de escritura del store.

### Costo aceptado

**El cierre manual queda en el historial; el automático no.** Loguear cada
auto-cierre exigiría escribir en cada lectura, que es justo lo que esta
arquitectura evita. Se podrá auditar *"Paola cerró esta cobranza como rechazó"*,
pero no *"esta cobranza se cerró sola porque el paciente pagó"* — ese hecho ya
queda registrado como el pago.

## Arquitectura

### Dos fuentes, una bandeja

**Derivadas** (`cobranza`, `captura`, `control`, `cita`) — calculadas, no
guardadas. Cada una tiene una **clave determinística** `derivedKey` con la forma
`${tipo}:${idDeLaEntidad}`:

```
cobranza:p_123      (por paciente)
captura:b_456       (por presupuesto)
control:p_123       (por paciente)
cita:a_012          (por cita)
```

`control` se indexa **por paciente y no por presupuesto** a propósito. Con la
clave por presupuesto, una clínica con años de historia derivaría una tarea de
control por cada tratamiento terminado alguna vez, todas vencidas: cientos de
tareas atrasadas el primer día. Con la clave por paciente hay **una sola tarea de
control por persona**, calculada desde su tratamiento completado más reciente —
que además es lo clínicamente correcto: al paciente se lo cita una vez, no una
vez por tratamiento histórico.

La clave es estable entre lecturas: es lo que permite que una decisión humana se
pegue a una tarea que no existe como fila.

**Persistidas** en la colección `mgmtTasks` que ya existe — dos sabores:

- **Tarea manual**: `type: "personalizada"`, sin `derivedKey`. Igual que hoy.
- **Override**: un doc con `derivedKey` cargado, que guarda la decisión humana
  sobre una derivada (postergarla, asignarla, cerrarla a mano).

**No se crea ninguna colección nueva**, así que no hace falta que Carlos
despliegue reglas de Firestore para esta feature.

### Cambios de tipo

En `lib/types.ts`:

```ts
export interface MgmtTask {
  // …campos actuales sin cambios…

  /** Clave de la tarea derivada sobre la que este doc actúa como override
   *  (`cobranza:p_123`). Vacío en las tareas manuales. */
  derivedKey?: string;
  /** Postergada hasta esta fecha (YYYY-MM-DD). Antes de ella no aparece en la
   *  bandeja del día ni cuenta como atrasada. */
  snoozedUntil?: string;
}

/** Plazo de una regla: cuánto pasa desde el evento hasta que la tarea vence. */
export type TaskDeadline =
  | { kind: "inmediato" }
  | { kind: "dias"; n: number };

/** Plazo por tipo de tarea automática. Vive en el doc de la clínica. */
export type TaskDeadlines = Partial<Record<
  Exclude<MgmtTaskType, "personalizada">,
  TaskDeadline
>>;
```

En `Clinic.config` se agrega `taskDeadlines?: TaskDeadlines`.

**Valores por defecto** (cuando la clínica no configuró nada):

| Tipo | Plazo | Por qué |
|---|---|---|
| `cobranza` | 7 días | Dar margen a que el pago entre por otra vía antes de perseguirlo |
| `captura` | 3 días | El presupuesto se enfría rápido |
| `control` | 180 días | Control semestral, el estándar odontológico |
| `cita` | inmediato | Una cita sin confirmar es trabajo de hoy |

### Motor de reglas — `lib/tareas.ts`

Módulo puro. No importa React, ni Firestore, ni el store.

```ts
/** Lo que una regla produce. Es un MgmtTask sin persistir: mismo shape para que
 *  la UI trate igual a derivadas y manuales. */
export interface DerivedTask {
  derivedKey: string;
  type: Exclude<MgmtTaskType, "personalizada">;
  patientId: string;
  title: string;
  detail?: string;
  budgetId?: string;
  /** Fecha del hecho que originó la tarea (ISO). */
  eventAt: string;
  /** eventAt + plazo. Antes de esta fecha la tarea no vence. */
  dueDate: string;
}

/** Datos mínimos que necesitan las reglas. Se pasa un objeto plano y no el `DB`
 *  entero para que el módulo sea testeable sin construir una base completa. */
export interface TareasInput {
  patients: Patient[];
  budgets: Budget[];
  payments: Payment[];
  appointments: Appointment[];
  deadlines?: TaskDeadlines;
}

export function derivarTareas(input: TareasInput, hoy: string): DerivedTask[];

/** Combina derivadas + guardadas en la lista final que ve la UI.
 *  - Una derivada con override cerrado NO aparece (salvo `verCerradas`).
 *  - Una derivada con override postergado aparece recién en `snoozedUntil`.
 *  - Un override cuya derivada ya no se produce se ignora (quedó huérfano).
 *  - Las manuales pasan tal cual. */
export function fusionarTareas(
  derivadas: DerivedTask[],
  guardadas: MgmtTask[],
  hoy: string,
): MgmtTask[];

/** Particiona para las vistas de Dentalink. */
export function clasificarTareas(tareas: MgmtTask[], hoy: string): {
  delDia: MgmtTask[];    // dueDate <= hoy, abiertas
  atrasadas: MgmtTask[]; // dueDate < hoy, abiertas
  futuras: MgmtTask[];   // dueDate > hoy
};

export function calcularVencimiento(eventAt: string, plazo: TaskDeadline): string;
```

### Las cuatro reglas

Cada una es una función pura con sus propios tests.

**`cobranza`** — una por paciente con saldo pendiente.

- Se abre: saldo del paciente > 0.
- `eventAt`: fecha del presupuesto aceptado/completado más antiguo con saldo.
- Se cierra sola: el saldo llega a 0 (o menos, si abonó de más).
- Título: `"Saldo pendiente de pago"`, detalle con el monto formateado.

Usa **la misma definición de saldo** que `patientBalance` de `lib/budgets.ts`
(presupuestos `aceptado`/`completado` menos pagos no anulados), para que la
bandeja y la ficha del paciente no puedan discrepar nunca.

> **No se llama `patientBalance` en un bucle.** Esa función recorre budgets y
> payments completos en cada llamada; invocarla por paciente da O(P × (B + Pg)),
> que en una clínica con 2.000 pacientes y miles de pagos congela el render en
> cada apertura de la bandeja. `derivarTareas` construye **un mapa de saldos en
> una sola pasada** por budgets y otra por payments, y consulta ese mapa.
> El test de equivalencia contra `patientBalance` es obligatorio: si alguien
> cambia la regla de saldo en `lib/budgets.ts` y no acá, el test lo caza.

**`captura`** — una por presupuesto presentado que no avanzó.

- Se abre: `budget.status === "presentado"`.
- `eventAt`: `budget.createdAt`.
- Se cierra sola: el estado pasa a `aceptado`, `completado`, `anulado` o vuelve a
  `borrador`.

**`control`** — una por **paciente** con tratamiento terminado y sin próxima visita.

- Se abre: el paciente tiene al menos un presupuesto `completado` **y** no tiene
  ninguna cita futura con estado distinto de `cancelada`.
- `eventAt`: fecha de la última cita `completada` del paciente; si no hay,
  `createdAt` de su presupuesto completado **más reciente**.
- Se cierra sola: se agenda una cita futura.
- Se deriva **una sola** por paciente, aunque tenga diez tratamientos terminados.

**`cita`** — una por cita próxima sin confirmar. **Nueva.**

- Se abre: cita con `start` entre hoy y hoy + 2 días, con
  `status === "pendiente"`.
- `eventAt`: hoy (es trabajo del día por definición).
- Se cierra sola: la cita pasa a `confirmada`, `en_atencion`, `completada`,
  `cancelada` o `ausente`; o la fecha ya pasó.

> Nota sobre `AppointmentStatus`: los valores reales del proyecto son
> `"confirmada" | "en_atencion" | "pendiente" | "completada" | "cancelada" | "ausente"`.
> La regla considera "sin confirmar" únicamente a `"pendiente"`.

### Regla de convivencia

Una derivada **nunca** pisa una decisión humana, y un override **nunca** revive
una tarea cuya condición ya no se cumple. En concreto:

| Situación | Resultado |
|---|---|
| Derivada sin override | Aparece |
| Derivada + override `cerrada` | No aparece (salvo "Ver cerradas") |
| Derivada + override con `snoozedUntil` futuro | No aparece hasta esa fecha |
| Derivada + override con `assigneeId` | Aparece asignada |
| Override sin derivada (la condición se resolvió) | Se ignora: queda huérfano |
| Manual (`personalizada`) | Aparece siempre hasta que se cierre |

El caso del override huérfano es importante: si el paciente paga, la cobranza
deja de derivarse y su override (por ejemplo, "asignada a Paola") deja de tener
efecto. No se borra el doc — no hace falta, y borrarlo en una lectura sería
escribir donde no corresponde.

## UI — `app/app/tareas/page.tsx`

Reescritura siguiendo el layout de Dentalink: **lista a la izquierda, panel de
detalle a la derecha**.

**Cabecera:** título, contador de abiertas, botón `Nueva tarea`. Se elimina
`Generar automáticas` — deja de tener sentido.

**Vistas (tabs):**

- `Tareas del día` — vencidas o que vencen hoy.
- `Atrasadas` **con el número en un badge**, como el `720` de Dentalink.
- `Todas`.

**Filtros:** por tipo (los 5 chips que ya están) · **`Sólo mías`** (nuevo, filtra
por `assigneeId === session.userId`) · `Ver cerradas`.

**Panel de detalle:** al seleccionar una tarea muestra paciente (link a la ficha),
tipo, detalle, fecha del evento, vencimiento, y las acciones. Con nada
seleccionado: *"Seleccione una tarea para ver su detalle"*, igual que Dentalink.

**Acciones sobre una tarea:**

| Acción | Efecto |
|---|---|
| Asignar | Escribe/actualiza el override con `assigneeId` |
| Postergar | Override con `snoozedUntil` (chips: 1 día · 1 semana · 1 mes) |
| Cerrar | Override `status: "cerrada"` + `resolution` (aceptó / contacto posterior / rechazó) |
| WhatsApp | Como hoy: abre `waLink` con el teléfono del paciente |

Para una tarea **manual**, las mismas acciones actualizan el doc directamente.

### Configuración de plazos

Vive en `/app/configuracion`, no en la bandeja: es ajuste de clínica y requiere
`practice.config`. Un select por tipo con las opciones de Dentalink
(`Inmediato · 1 día · 1 semana · 1 mes · 1 año · Otro`), que escribe
`clinic.config.taskDeadlines`.

## RBAC

La bandeja sigue con `engagement.forms` (admin + asistente), como hoy. Es
correcto: la recepción es quien trabaja captura y cobranza, y ya tiene
`payments.manage`. Las tareas de cobranza muestran **el saldo de un paciente**,
no números del negocio, así que no cae bajo la restricción de `billing.reports`
que dejamos como admin-only.

La configuración de plazos sí requiere `practice.config` (solo admin).

## Testing — `lib/tareas.test.ts`

TDD, funciones puras, sin mocks de Firestore.

**Por regla** (cada una: se abre cuando corresponde / no se abre cuando no):

- cobranza: saldo > 0 abre; saldo 0 no abre; saldo negativo (abonó de más) no abre.
  **Y un test de equivalencia**: para un set de datos dado, el saldo que calcula
  `derivarTareas` coincide con `patientBalance` paciente por paciente.
- captura: `presentado` abre; los otros cuatro estados no.
- control: `completado` sin cita futura abre; con cita futura no; una cita futura
  `cancelada` no cuenta como cita futura. **Un paciente con tres tratamientos
  completados deriva UNA sola tarea de control**, no tres.
- cita: `pendiente` dentro de la ventana abre; `confirmada` no; fuera de la
  ventana no; una cita pasada no.

**Auto-cierre** (el corazón del diseño): dado un estado donde la tarea existía y
otro donde la condición se resolvió, `derivarTareas` no la produce en el segundo.

**Fusión:**

- override cerrado oculta la derivada;
- override postergado la oculta hasta `snoozedUntil` y la muestra en esa fecha;
- override huérfano se ignora;
- la manual pasa intacta;
- el `assigneeId` del override se aplica a la derivada.

**Vencimientos:** `calcularVencimiento` con `inmediato` y con cada plazo en días;
los defaults se aplican cuando la clínica no configuró nada.

**Claves:** `derivedKey` es estable entre dos llamadas con el mismo input
(idempotencia — es lo que sostiene todo el mecanismo de override).

## Archivos

| Archivo | Cambio |
|---|---|
| `lib/tareas.ts` | **Nuevo.** Motor de reglas puro |
| `lib/tareas.test.ts` | **Nuevo.** Tests TDD |
| `lib/types.ts` | `MgmtTask` += `derivedKey`, `snoozedUntil`; `TaskDeadline`/`TaskDeadlines`; `Clinic.config.taskDeadlines` |
| `app/app/tareas/page.tsx` | Reescritura: usa el motor, vistas del día/atrasadas, panel de detalle, "Sólo mías", postergar |
| `app/app/configuracion/page.tsx` | Sección de plazos por tipo |
| `lib/seed.ts` | Datos demo que disparen al menos una tarea de cada tipo |

Sin cambios en `firestore.rules` ni en el store: `mgmtTasks` ya existe con sus
acciones `addMgmtTask` / `updateMgmtTask` / `deleteMgmtTask`.

## Fuera de alcance

- **Mensajes automáticos al paciente.** Decidido explícitamente: esta etapa es
  bandeja interna. El enganche al outbox de Botika queda para una segunda etapa.
- **Historial de tareas auto-cerradas**, por la razón explicada arriba.
- **Reasignación masiva** y plantillas de tareas: no están en el módulo de
  Dentalink relevado.
