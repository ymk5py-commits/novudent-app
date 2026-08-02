# Retención por medio de pago — diseño

**Fecha:** 01-ago-2026
**Referencia:** [docs/dentalink/04-agenda-crm-y-catalogos.md](../../dentalink/04-agenda-crm-y-catalogos.md) §Opciones de pago — *"Retención: el porcentaje que se queda el medio de pago (la comisión de la tarjeta). Sin esto, el 'Estado de Resultado' reporta ingresos inflados."*

## Problema

Hoy todos los números financieros de Novudent se calculan sobre el monto
**bruto** de cada pago. Si la tarjeta se queda el 5%, el widget "Resultado" de
`/app/reportes` (`cobrado − gastos`) reporta como ingreso plata que la clínica
nunca vio. Una clínica que cobra mucho con tarjeta cree que gana más de lo que
gana.

## Decisiones tomadas (confirmadas con el dueño)

1. **La comisión del profesional se calcula sobre el bruto, sin cambios.** El
   profesional cobra su % sobre lo que el paciente pagó; la retención es un
   costo que absorbe la clínica, no algo que le baja el sueldo a nadie por la
   forma en que el paciente eligió pagar. `Producción y comisiones` y
   Liquidaciones no cambian su matemática.
2. **La retención se recalcula siempre con la tasa vigente.** Vive en la config
   de la clínica; los reportes la aplican al vuelo sobre cualquier pago. No se
   congela ningún % en el `Payment` — no hay campo nuevo en pagos, no hay que
   decidir qué mostrar para pagos anteriores a la feature. Es el mismo patrón
   derivar-en-lectura de `checkStatus` y las tareas automáticas. Los reportes
   de Novudent son de ventana corta (30 días), así que el desfase práctico al
   renegociar una tasa es mínimo.
3. **El neto se ve solo en Reportes.** Caja/arqueo sigue en bruto: el cajero
   cuenta lo que efectivamente entró; la retención se la descuenta el banco
   después, no es parte del arqueo del día.

## Dónde vive la configuración

Mismo patrón que `taskDeadlines` y `onlineBooking`: un campo en `Clinic.config`,
**sin colección nueva, sin deploy de reglas**.

```ts
// lib/types.ts
/** Retención (comisión) que se queda cada medio de pago, en % 0-100.
 *  Sin entrada = 0%. La aplican los REPORTES al vuelo con la tasa vigente —
 *  nunca se congela en el Payment (decisión: derivar, no guardar). */
export type PaymentRetention = Partial<Record<PaymentMethod, number>>;

// Clinic.config +=
    /** Retención por medio de pago (módulo Reportes — ingreso neto). */
    paymentRetention?: PaymentRetention;
```

### UI de configuración

`/app/configuracion` (la página entera ya está gateada por `practice.config`,
admin-only) gana una `Card` **"Retención por medio de pago"**: un input numérico
de % por cada uno de los 5 medios (`efectivo`, `tarjeta`, `transferencia`,
`cheque`, `qr`), iterando `PAYMENT_METHOD_LABEL` para las etiquetas. Guarda con
el `updateClinicConfig(partial)` existente, mismo molde que la sección de
Reserva online.

- Input `type="number"`, `min=0`, `max=100`, `step=0.1`.
- Texto de ayuda: *"El % que se queda el medio de pago (ej.: comisión de la
  tarjeta). Los reportes muestran el ingreso neto descontándolo. La caja y el
  arqueo siguen en bruto."*
- Todos arrancan vacíos (= 0%): la clínica que no configura nada no ve ningún
  cambio en sus números.

## El cálculo — helpers puros en `lib/budgets.ts`

```ts
/** % de retención vigente para un medio. Sanea basura: un valor negativo, no
 *  numérico o mayor a 100 no puede producir un neto negativo ni inflar el
 *  ingreso — se acota a [0, 100]. */
export function retentionPct(method: PaymentMethod, cfg: PaymentRetention | undefined): number {
  const v = cfg?.[method];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

/** Monto que efectivamente entra a la clínica después de la retención del
 *  medio, redondeado a los decimales REALES de la moneda de la clínica.
 *
 *  ⚠️ `budgetTotal` (lib/budgets.ts) redondea siempre a entero — está bien
 *  ahí porque nació pensando en PYG. Copiarle ese `Math.round` acá sería un
 *  bug real: de las 17 monedas de `lib/currency.ts` solo PYG/CLP/COP/CRC son
 *  zero-decimal, las otras 13 (USD, ARS, BRL, MXN…) tienen 2 decimales. Un
 *  pago de USD 50 con 5% de retención tiene que dar 47.50, no redondearse a
 *  48 — la clínica pierde precisión en el número que esta misma feature
 *  promete que sirve para exportar a contabilidad. */
export function netAmount(
  p: Pick<Payment, "amount" | "method">,
  cfg: PaymentRetention | undefined,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): number {
  const factor = 10 ** CURRENCIES[currency].decimals;
  return Math.round(p.amount * (1 - retentionPct(p.method, cfg) / 100) * factor) / factor;
}
```

Import nuevo en `lib/budgets.ts`: `CURRENCIES`, `CurrencyCode`, `DEFAULT_CURRENCY`
desde `./currency` (ya existe, ya lo usa `formatMoney`).

Todo caller pasa la moneda de la clínica: `netAmount(p, cfg, db.clinics[0]?.config.currency)`
— `Clinic.config.currency` es un campo requerido, no hace falta fallback en la
práctica, pero el parámetro por defecto (`DEFAULT_CURRENCY = "PYG"`) cubre el
caso raro de que `clinics[0]` todavía no cargó.

`Pick<Payment, "amount" | "method">` y no `Payment` entero: los tests no
necesitan construir un pago completo, y la firma documenta exactamente de qué
depende el cálculo.

## Dónde se ve — `app/app/reportes/page.tsx`

Los cambios se limitan al tab **Panel de desempeño** y al CSV de Pagos.

### 1. El `useMemo` de `data` suma dos agregados

Sobre los mismos `pays` (ya filtrados por ventana y `!voidedAt`):

```ts
const currency = db.clinics[0]?.config.currency;
const cfg = db.clinics[0]?.config?.paymentRetention;
const collectedNet = pays.reduce((s, p) => s + netAmount(p, cfg, currency), 0);
const retention = collected - collectedNet;
```

### 2. La tarjeta "Resultado" pasa a neto

- Valor principal: `collectedNet − spent` (antes `collected − spent`).
- La línea de detalle de abajo (hoy dice "cobrado − gastos") pasa a:
  `cobrado neto − gastos · retención {fmtGs(retention)}`.
- Cuando `retention === 0` (clínica sin configurar), la línea queda como está
  hoy — cero ruido para quien no usa la feature.

### 3. La tarjeta "Cobrado 30d" NO cambia

Dice "cobrado" y eso es lo que el paciente pagó: bruto. La retención se ve en
"Resultado", que es donde se promete el número real del negocio.

### 4. El gráfico "Flujo de caja" NO cambia

Es flujo de caja: lo que físicamente entró y salió por día. Mismo argumento que
el arqueo — bruto a propósito.

### 5. "Producción y comisiones" no cambia el cálculo, pero lo dice

La comisión sigue sobre bruto (decisión 1). Se agrega una línea de aclaración
al subtítulo: *"Comisiones calculadas sobre el monto bruto cobrado (la
retención del medio de pago la absorbe la clínica)."* — para que nadie lea el
neto en "Resultado" y piense que la comisión de al lado está mal.

### 6. El payload de Reportes IA se actualiza

`iaDatos` alimenta el panel de IA con agregados. Si "Resultado" en pantalla es
neto pero la IA recibe el bruto, la IA contradice lo que el usuario tiene
adelante. Cambios en `iaDatos`:

```ts
cobradoBrutoGs: data.collected,
retencionMediosGs: data.retention,
cobradoNetoGs: data.collectedNet,
resultadoGs: data.collectedNet - data.spent,   // antes: collected - spent
```

### 7. El CSV "Pagos" suma dos columnas

`Retención % · Monto neto` después de "Monto Gs" — mismo dato, exportable a
la contabilidad. Usa `retentionPct`/`netAmount` con la config y la moneda
vigentes (`netAmount(p, cfg, db.clinics[0]?.config.currency)`), **no** hardcodea
"Gs" en el nombre de columna del neto — la cabecera ya existente "Monto Gs" es
deuda de una época sin multi-moneda; no se toca en esta feature, pero la
columna nueva no repite el error.

## Qué queda en bruto, a propósito (lista cerrada)

| Superficie | Por qué queda en bruto |
|---|---|
| Caja: arqueo, movimientos, `sessionTotals` | El cajero cuenta lo que entró; el banco descuenta después |
| Tarjeta "Cobrado 30d" | "Cobrado" = lo que pagó el paciente |
| Gráfico "Flujo de caja" | Flujo físico de dinero por día |
| Producción y comisiones / Liquidaciones | Decisión 1: comisión sobre bruto |
| `patientBalance` / `budgetBalance` / deuda del paciente | La deuda del paciente no depende de cómo paga |
| Dashboard home ("producción semanal") | Es producción, no resultado |
| Tareas automáticas (cobranza) | Persiguen la deuda del paciente, que es bruta |

Cualquier superficie futura que quiera neto usa `netAmount` — no se duplica la
fórmula.

## RBAC

Nada nuevo. La config es admin-only por el gate existente de
`/app/configuracion`; los reportes ya son `billing.reports`. El % de retención
en sí queda legible para cualquier miembro de la clínica (vive en el doc de la
clínica, que los miembros leen) — aceptable: es la comisión pactada con el
banco, no un dato de pacientes ni un número del negocio derivado.

## Testing — `lib/budgets.test.ts`

TDD puro:

- `retentionPct`: medio configurado devuelve su %; medio sin entrada → 0;
  config `undefined` → 0; negativo → 0; >100 → 100; `NaN`/no numérico → 0.
- `netAmount` en PYG (0 decimales, el caso por defecto): 5% sobre 1.000.000 →
  950.000; 0% → idéntico al bruto; redondeo entero (5% sobre 333 → 316, no
  316.35); 100% → 0.
- **`netAmount` en una moneda de 2 decimales — el caso que motivó el fix de
  redondeo:** `netAmount({amount: 50, method: "tarjeta"}, {tarjeta: 5}, "USD")`
  → **47.5**, no 48. Sin el parámetro `currency` (o con un `Math.round` a
  entero como el de `budgetTotal`), este test falla — es la prueba de que el
  bug de redondeo no puede reaparecer en silencio.
- Nota explícita: **no** se agrega un test de "consistencia interna"
  (`Σ netAmount = Σ amount − retención total`) porque sería tautológico —
  `retention` se define en el propio `useMemo` de reportes como
  `collected - collectedNet`, así que la igualdad es cierta por construcción y
  no prueba nada del redondeo real.

## Archivos

| Archivo | Cambio |
|---|---|
| `lib/types.ts` | `PaymentRetention`, `Clinic.config.paymentRetention` |
| `lib/budgets.ts` | `retentionPct()`, `netAmount()` |
| `lib/budgets.test.ts` | tests de ambos |
| `app/app/reportes/page.tsx` | agregados neto/retención, tarjeta Resultado, aclaración comisiones, `iaDatos`, CSV |
| `app/app/configuracion/page.tsx` | Card de retención por medio |

Sin cambios en `firestore.rules`, `lib/store.tsx` (usa `updateClinicConfig`
existente), Caja, Liquidaciones ni el motor de tareas.

## Fuera de alcance

- **Neto pago por pago en Caja** — decidido explícitamente: solo agregados en
  Reportes. Si se pide, `netAmount` ya existe y es un cambio de UI puro.
- **Congelar la tasa histórica en cada pago** — decidido: se recalcula con la
  vigente. Si algún día hace falta un estado de resultados auditable a años,
  se revisa (implicaría `Payment.retentionPctAtPayment`).
- **Retención con monto fijo** (ej. Gs 2.000 por transacción además del %) —
  Dentalink tampoco lo tiene; solo %.
- **"Permite devolución" por medio de pago** — el otro campo que Dentalink tiene
  en Opciones de pago. Es otra feature (devoluciones), no esta.
