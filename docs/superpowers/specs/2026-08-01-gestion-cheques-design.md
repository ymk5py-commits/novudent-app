# Gestión de cheques — diseño

**Fecha:** 01-ago-2026
**Referencia:** [docs/dentalink/04-agenda-crm-y-catalogos.md](../../dentalink/04-agenda-crm-y-catalogos.md) §Pagos anulados y pendientes — *"el módulo de cheques es una ausencia completa en Novudent"*.

## Problema

`cheque` existe como valor de `PaymentMethod` desde siempre, pero está **muerto**:
`PAYMENT_METHOD_LABEL` (lo que alimenta el desplegable de Caja) no tiene entrada
para él, y `RecibirPago.tsx` —el flujo principal de cobro, desde la ficha del
paciente— ni siquiera lo lista. Hoy es **imposible** registrar un pago con cheque
desde la UI, aunque el tipo lo permita.

En Paraguay y buena parte de LATAM el cheque diferido sigue siendo medio de pago
corriente en tratamientos largos. Sin seguimiento por estado, un cheque que no se
deposita a tiempo o que rebota se pierde en la nada — no hay forma de saber qué
falta cobrar.

## Decisión: extender `Payment`, no crear colección nueva

Mismo criterio que en tareas automáticas: la colección `payments` ya permite
escribir cualquier campo (`firestore.rules`: `isStaff(cid) && subActive(cid)`),
así que un bloque `check` opcional alcanza. **Cero colecciones nuevas, cero
deploy de reglas.**

### El estado del cheque se deriva, no se guarda

```ts
export type CheckStatus = "pendiente" | "cobrado" | "anulado";

export interface Payment {
  // …los campos actuales, sin tocar…
  /** Motivo de anulación (libre: "Rebotó", "El paciente lo retiró"…). Aplica a
   *  cualquier pago anulado, no solo cheques — hoy `voidPayment` no guarda por
   *  qué se anuló un pago, y esto lo corrige de paso. */
  voidReason?: string;
  /** Datos del cheque. Presente únicamente cuando `method === "cheque"`. */
  check?: {
    number: string;
    bank: string;
    /** Fecha en que se puede cobrar (YYYY-MM-DD) — el "vencimiento" del cheque. */
    cashDate: string;
    /** Cuándo se confirmó que el banco lo acreditó. Ausente = todavía pendiente. */
    cobradoAt?: string;
    cobradoBy?: string;
  };
}

/** Deriva el estado a partir de lo que ya existe — nunca un campo `status`
 *  propio. Guardarlo aparte permitiría el estado imposible "`voidedAt` seteado
 *  pero `check.status: pendiente`"; derivarlo lo hace irrepresentable. */
export function checkStatus(p: Payment): CheckStatus {
  if (p.voidedAt) return "anulado";
  if (p.check?.cobradoAt) return "cobrado";
  return "pendiente";
}
```

**Anular un cheque es literalmente `voidPayment`, sin mecanismo nuevo.** La
plata vuelve a la deuda del paciente por el mismo camino que ya usa toda la
app — `patientBalance`, `budgetBalance` y `sessionTotals` en `lib/budgets.ts` y
`app/app/caja/page.tsx` ya filtran `!voidedAt`, así que **no se toca ninguno**.
Y el cheque anulado aparece solo, gratis, en "Pagos eliminados" del paciente
(`components/FacturacionPaciente.tsx`) — correcto: un cheque que rebota *es* un
pago eliminado, no un concepto aparte.

`voidPayment(id, by)` gana un tercer parámetro opcional:
`voidPayment(id, by, reason?)`. Retrocompatible — todo lo que ya lo llama sigue
compilando sin cambios.

### Cuándo baja la deuda del paciente

Al **recibir** el cheque, no al cobrarlo — igual que cualquier otro pago hoy: se
registra el `Payment` y `patientBalance` baja en el acto. `cobrado`/`anulado` son
el estado del cheque *en el banco*, y no vuelven a tocar la deuda salvo que se
anule (ahí sí, como cualquier `voidPayment`). Es como opera una clínica real: no
se le vuelve a cobrar al paciente presente solo porque el cheque tarda en
acreditarse.

## Dónde se registra

Dos lugares ganan la opción, hoy ausente en ambos:

1. **`components/RecibirPago.tsx`** — el flujo principal. El `<select>` de medio
   (hoy: efectivo/tarjeta/transferencia/qr) suma `<option value="cheque">`. Al
   elegirlo aparecen tres campos: N° de cheque, Banco, Fecha de cobro. Tanto
   `pagar()` (multi-plan) como `pagarCuota()` (una cuota) arman el `Payment` con
   el mismo bloque `check` cuando `method === "cheque"`.
2. **Pago libre en Cajas** (`app/app/caja/page.tsx`) — ya recorre
   `Object.entries(PAYMENT_METHOD_LABEL)`, así que sumarle
   `cheque: "Cheque"` a esa constante (en `lib/budgets.ts`) lo habilita solo en
   el desplegable. Se le agregan los mismos tres campos condicionales al modal
   de "Nuevo pago".

Ningún campo es obligatorio a nivel tipo — `check` completo es opcional — pero
la UI exige los tres cuando el medio elegido es "cheque" (N° de cheque vacío no
tiene sentido operativo).

## La pantalla — 4° tab en Cajas

`Cajas` (`app/app/caja/page.tsx`) gana un tab **Cheques**, mismo look que
Tareas: tres vistas — **Por cobrar** (con badge de atrasados: `cashDate < hoy`,
mismo patrón visual que "Atrasadas" en Tareas) · **Cobrados** · **Anulados**.

Columnas: paciente (link a la ficha) · N° de cheque · banco · fecha de cobro ·
monto · quién lo recibió y cuándo.

Acciones sobre un cheque "por cobrar": **Marcar cobrado** (setea
`cobradoAt`/`cobradoBy`) · **Anular** (pide motivo, llama `voidPayment` con
`reason`).

**RBAC:** `payments.manage` (admin + asistente) — el mismo que ya gatea toda la
página de Cajas. Sin permiso nuevo. **Plan:** mismo gate que Cajas
(`plan.features.includes("caja")`) — el tab vive adentro, no necesita gate propio.

## La 5ª regla de tareas automáticas

`MgmtTaskType` suma `"cheque"`. Se deriva de los `Payment` con
`method === "cheque"` y `checkStatus(p) === "pendiente"`; `dueDate` es
**directamente `check.cashDate`** — no hay ventana artificial como en `cita`
(cada cheque ya trae una fecha natural y única, no hay riesgo de inundar la
bandeja) y **no pasa por `plazoDe`/`calcularVencimiento`**, a diferencia de las
otras cuatro reglas.

Se auto-cierra en cuanto `checkStatus(p)` deja de ser `"pendiente"` — se marcó
cobrado o se anuló.

`derivedKey: cheque:<paymentId>` — instancia trivialmente estable (cada cheque
es su propio `Payment`, a diferencia de `cobranza`/`control` que tuvieron que
colapsar N presupuestos en una tarea por paciente). **Esta regla es más simple
que las otras cuatro**, no hereda ninguna de las correcciones que aplicamos en
la revisión anterior (C1 no aplica: no hay reuso de clave entre situaciones
distintas).

```ts
title: "Cheque por cobrar"
detail: `${p.check.bank} · N° ${p.check.number}`
amount: p.amount   // crudo — la página formatea con fmtGs, ver nota abajo
patientId: p.patientId
eventAt: p.date
dueDate: p.check.cashDate
```

### Corrección de tipo necesaria — separar "tipos con plazo" de "tipos automáticos"

Hoy `AutoTaskType = Exclude<MgmtTaskType, "personalizada">` alimenta
`DEFAULT_DEADLINES: Required<TaskDeadlines>`. Si `"cheque"` se agrega a
`MgmtTaskType` sin más, TypeScript **exige** un `DEFAULT_DEADLINES.cheque` — un
plazo configurable que la regla nunca usa, y que aparecería como un selector
muerto en Configuración. Antes de tocar la regla hay que separar:

```ts
// lib/types.ts
export type MgmtTaskType = "cita" | "captura" | "control" | "cobranza" | "cheque" | "personalizada";

// Los 4 tipos cuyo vencimiento es "evento + plazo configurable". "cheque" queda
// afuera a propósito: su vencimiento YA es una fecha absoluta (cashDate), no un
// plazo que sumar. Agregarlo acá obligaría a un default sin uso real.
export type TaskDeadlines = Partial<Record<"cita" | "captura" | "control" | "cobranza", TaskDeadline>>;
```

Y en `lib/tareas.ts`, `AutoTaskType` deja de derivarse por exclusión — pasa a
ser la unión explícita de los 5 tipos automáticos:

```ts
// Los 4 con vencimiento configurable. Es el mismo conjunto que las claves de
// TaskDeadlines — se nombra aparte para que la firma de plazoDe() quede
// explícita y no dependa de un keyof indirecto.
export type PlazoTaskType = "cita" | "captura" | "control" | "cobranza";
export type AutoTaskType = PlazoTaskType | "cheque";

// El parámetro es PlazoTaskType, no AutoTaskType: llamar plazoDe("cheque", …)
// tiene que ser un error de compilación, no algo que "funcione" devolviendo
// undefined en runtime. Es lo que impide que alguien cablee por error la regla
// de cheque a través del mecanismo de plazos que no le corresponde.
export function plazoDe(type: PlazoTaskType, cfg: TaskDeadlines | undefined): TaskDeadline {
  return cfg?.[type] ?? DEFAULT_DEADLINES[type];
}
```

Las cuatro reglas existentes pasan a llamar `plazoDe` con `PlazoTaskType`
literal (`"cobranza"`, `"captura"`, etc.) — ya lo hacían, así que no cambian.
La regla `cheque` simplemente **no llama a `plazoDe` en ningún punto**.

`app/app/configuracion/page.tsx` **no gana un 5° selector** — la sección
"Plazos de tareas automáticas" sigue mostrando los mismos 4 tipos.

`app/app/tareas/page.tsx`: `TYPE_LABEL` suma `cheque: "Cheque"`, `TYPE_TONE`
suma `cheque: "warn"` (mismo tono que `captura`, por ser plata que todavía no
se puede dar por perdida pero tampoco por segura).

## Testing

- `checkStatus` — puro, con tests: sin `voidedAt` ni `cobradoAt` → pendiente;
  con `cobradoAt` → cobrado; con `voidedAt` (con o sin `cobradoAt` seteado
  también, para probar que anulado gana) → anulado.
- La regla `cheque` en `lib/tareas.test.ts`, mismo TDD que las otras cuatro: abre
  cuando hay un cheque pendiente; no abre si ya está cobrado; no abre si está
  anulado; el `dueDate` es exactamente `cashDate`, no `cashDate + nada`; dos
  cheques del mismo paciente derivan dos tareas con `derivedKey` distintas (a
  diferencia de `control`, acá SÍ debe haber una por cheque).
- `voidPayment` con y sin `reason` — retrocompatibilidad.
- Test de tipos (implícito, vía `tsc --noEmit`): que `DEFAULT_DEADLINES` **no**
  acepte ni requiera una clave `cheque` — si algún cambio futuro rompe esta
  separación, el build falla ahí, no en producción.

## Archivos

| Archivo | Cambio |
|---|---|
| `lib/types.ts` | `Payment.check`, `Payment.voidReason`, `MgmtTaskType` += `"cheque"`, `TaskDeadlines` acotado a los 4 tipos con plazo |
| `lib/budgets.ts` | `checkStatus()`, `PAYMENT_METHOD_LABEL` += `cheque` |
| `lib/budgets.test.ts` | tests de `checkStatus` |
| `lib/tareas.ts` | `AutoTaskType` explícito, 5ª regla, `voidPayment` no vive acá — ver `store.tsx` |
| `lib/tareas.test.ts` | tests de la regla `cheque` |
| `lib/store.tsx` | `voidPayment` += parámetro `reason`; acción para marcar cobrado |
| `components/RecibirPago.tsx` | opción "Cheque" + campos condicionales, en `pagar()` y `pagarCuota()` |
| `app/app/caja/page.tsx` | tab **Cheques** (3 sub-vistas), campos condicionales en "Nuevo pago" |
| `app/app/tareas/page.tsx` | `TYPE_LABEL`/`TYPE_TONE` += `cheque` |

Sin cambios en `firestore.rules` ni en `app/app/configuracion/page.tsx`.

## Fuera de alcance

- **Catálogo de bancos.** Campo de texto libre — decidido explícitamente. Se
  puede agregar después si hace falta filtrar/reportar por banco.
- **Ventana de aviso configurable antes de `cashDate`.** La tarea aparece con
  `dueDate = cashDate` tal cual; no hay "avisar N días antes" configurable como
  en las otras reglas. Si se pide, es una iteración aparte (ver la sección de
  corrección de tipos: agregarla ahí sería mezclar los dos tipos de vencimiento).
- **Reportes específicos de cheques** (los que Dentalink lista: "Cheques por
  cobrar", etc. como Excel exportable). El tab de Cajas cubre la necesidad
  operativa; un reporte formal queda para cuando exista el módulo de reportes
  exportables en general.
