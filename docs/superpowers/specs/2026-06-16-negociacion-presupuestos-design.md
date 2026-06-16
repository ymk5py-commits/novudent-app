# Negociación de Presupuestos Abandonados — Diseño

**Fecha:** 2026-06-16
**Tipo:** Diferenciador de producto (feature nueva, toca Novudent + Botika)

## Objetivo

La pata de **"recuperación de la inversión"** (complementa al Monitor de
Recuperación post-op, que es la de la salud). Hoy los presupuestos quedan en
estado `presentado` y se pierden en silencio. Este diferenciador hace que el bot
**reenganche automáticamente** los presupuestos abandonados por WhatsApp:
resuelve dudas de costo, ofrece opciones de financiación (dentro de una política
de la clínica) y **calienta el lead hasta dejarlo listo para cerrar** — el humano
confirma las condiciones y el compromiso de plata.

No es un recordatorio más (eso ya existe como la tarea de "captura" en el
dashboard): es un **motor de recupero** que actúa solo sobre lo que el equipo
olvida.

## Contexto (qué ya existe y se reutiliza)

- **Presupuestos** (`lib/types.ts` Budget): estados `borrador → presentado
  (captura) → aceptado → completado → anulado`; campos de financiación
  `installments`, `discountPct`, `convenio`; ítems con precios; `budgetTotal`.
- **Integración Botika ↔ Novudent** vía outbox: tipos `confirmar_cita | nps |
  cobranza | reagendar | postop`; el cron `novudent-outbox` materializa/envía;
  `detectNovudentOutcome` interpreta respuestas. Ya hay `cobranza` con
  `refId=budgetId`.
- **Bot conversacional** (Botika `api/_lib/kimi.js`): `callKimi({systemPrompt,
  history, userMessage})` ya conversa multi-turno con RAG; `buildSystemPrompt`
  permite inyectar contexto (como el `novudentSection` de la integración). **La
  negociación es sobre todo inyectar el contexto correcto en el system prompt.**

## Enfoque

**A — Reusar el outbox + el bot conversacional.** El cron materializa el disparo
(presupuesto presentado ≥ N días → tarea `negociacion`); al responder el paciente,
el bot recibe en su system prompt el contexto del presupuesto + la política de
financiación + la meta; conversa multi-turno (lo que ya hace); una detección suave
marca "listo para cerrar" y hace handoff al humano.

Descartados: **B** máquina de estados con pasos guionados (rígido, no es
"negociación"); **C** solo recordatorio + FAQ (no recupera, ya existe la captura).

## Arquitectura / componentes (dos tracks acoplados por el outbox)

### Track Novudent (`novudent-app`)
- **Tipos** (`lib/types.ts`):
  - `BotikaConfig.automations.negociacion: boolean` (toggle).
  - `NegociacionConfig` (en la config de la clínica): `{ diasGatillo: number,
    maxIntentos: number, financiacion: { maxCuotas: number, sinInteres: boolean,
    anticipoMinPct: number } }`. Defaults: `diasGatillo: 5, maxIntentos: 2,
    financiacion: { maxCuotas: 3, sinInteres: true, anticipoMinPct: 0 }`.
  - `Budget.negociacion?: { status: "en_curso" | "listo_para_cerrar" |
    "sin_respuesta" | "rechazado", intentos: number, ultimoContactoAt: string,
    financiacionElegida?: string, resumen?: string }`.
  - `OutboxTaskType += "negociacion" | "negociacion_listo"`.
- **Store** (`lib/store.tsx`): `reflectOutbox` rama `negociacion` (escribe
  `budget.negociacion`; si `listo_para_cerrar` encola `negociacion_listo` para la
  clínica). Helpers puros para los cálculos (en `lib/negociacion.ts`, testeable).
- **UI**:
  - Configuración → bloque "Negociación de presupuestos": toggle + política de
    financiación + N días.
  - Dashboard "Tareas críticas": tarjeta *"X presupuestos listos para cerrar —
    confirmar"* (cuando hay `listo_para_cerrar`).
  - Ficha/Presupuestos: badge del estado de negociación + botón "Confirmar y
    aceptar" (mueve a `aceptado` con la financiación acordada) — el humano cierra.

### Track Botika (`botika`)
- **Disparo** (`api/cron-reminders.js`, job `novudent-outbox`): por clínica con
  `negociacion` ON, lee `budgets` con `status==presentado` cuyo `createdAt`/
  presentación ≥ `diasGatillo` días, sin `negociacion` activa y con `intentos <
  maxIntentos` → crea tarea outbox `negociacion` (refId=budgetId, phone del
  paciente, opening). Marca `budget.negociacion.intentos++` + `ultimoContactoAt`.
- **Conversación** (`api/_lib/kimi.js` / el path de respuesta del bot): cuando el
  contacto tiene una negociación activa, inyectar en el system prompt una sección
  con: ítems + total del presupuesto, las cuotas del dentista, las opciones de la
  política de financiación, y la instrucción de negociar (resolver dudas de costo,
  ofrecer las opciones, acercar al cierre SIN prometer fuera de la política, y
  ofrecer hablar con la clínica si el paciente quiere otra cosa).
- **Detección de resultado** (`api/_lib/novudent.js` `detectNovudentOutcome`, rama
  `negociacion`): clasifica la respuesta (LLM) en `listo_para_cerrar`
  (acepta, con la financiación elegida si la dijo) / `negociando` (sigue) /
  `rechazado` (no le interesa). Escribe el resultado. **Suave**: ante duda, NO
  marca cerrado — deja "negociando" o deriva.

## Política de financiación (lo que el bot puede ofrecer)

El bot ofrece SOLO dentro de `NegociacionConfig.financiacion` (definida por la
clínica). No promete términos fuera de regla. Si el paciente pide algo fuera de la
política (más cuotas, descuento extra), el bot lo trata como objeción y deriva a la
clínica ("dejame consultarlo con el equipo y te confirmo"), marcando el caso.

## Anti-spam / cap

Tope `maxIntentos` (default 2): apertura + 1 seguimiento si no responde, después
para (`status: sin_respuesta`). Respeta cualquier opt-out del paciente
("no me escribas más" → para y marca). Patrón del CLAUDE.md: todo loop que
re-pregunta necesita un tope.

## Flujo (resumen)

1. Cron: presupuesto presentado ≥ 5 días sin negociación → tarea `negociacion` →
   WhatsApp de apertura al paciente. `intentos=1`.
2. Paciente responde → el bot conversa con el contexto del presupuesto +
   financiación inyectado (resuelve dudas, ofrece cuotas).
3. Detección: `listo_para_cerrar` → escribe `budget.negociacion` + encola
   `negociacion_listo`; `rechazado`/`sin_respuesta` → marca y para.
4. Dashboard de Novudent: tarjeta "listos para cerrar" → el humano confirma →
   presupuesto `aceptado` con la financiación acordada.

## Alcance

**v1 (IN):** disparo automático tras N días (toggle + N configurable + cap);
política de financiación configurable; negociación conversacional con el bot
existente (contexto inyectado); detección suave "listo para cerrar"; handoff al
humano (tarjeta dashboard + confirmar→aceptado); badge de estado en el presupuesto.

**Fuera de v1 (después):** cierre 100% autónomo (mover a aceptado sin humano);
A/B de tono/copy; analítica de tasa de conversión por profesional/tratamiento;
descuentos dinámicos; multi-idioma.

## Criterio de éxito

Un presupuesto que lleva 5 días presentado sin aceptar recibe un WhatsApp del bot
que resuelve dudas de costo y ofrece las cuotas de la política; cuando el paciente
acepta, aparece en el dashboard como "listo para cerrar" con la financiación
elegida y un humano lo confirma en 1 clic; si el paciente no responde tras 2
intentos, el caso se cierra como `sin_respuesta` sin spamear.

## Riesgos / decisiones

- **Detección conversacional difusa:** a diferencia del triaje post-op (regla
  determinista), aceptar/rechazar sale de una conversación libre. Mitigación:
  detección SUAVE (ante duda no cierra) + el humano confirma siempre el cierre.
- **Outreach no solicitado:** el bot escribe sin que el paciente lo pida. Tono
  profesional, opt-out respetado, cap de 2, toggle de la clínica.
- **Compromiso de plata:** el bot NUNCA promete fuera de la política; el humano
  confirma las condiciones. La financiación del bot es informativa hasta la
  confirmación.
- **Dos repos** acoplados por el outbox; se prueba E2E como la integración ya
  validada.
