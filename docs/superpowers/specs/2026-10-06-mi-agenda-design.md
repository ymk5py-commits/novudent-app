# Mi agenda (Inicio) — diseño

**Fecha:** 6-oct-2026 · **Pedido de:** Camila y Angel (grupo Novum) · **Decide:** Croman

> «Una agenda propia donde cada uno vea sus tareas del día y de la semana, y que se vayan
> tachando solas.» · «Poder dictar la semana con IA.»

## Qué es

Una tarjeta en **Inicio** (la ven los 5 roles: todos tienen `tasks.use`) con lo que le toca
a la persona que entró, hoy o esta semana:

1. **Mis tareas**: alta rápida, tildar, vista Hoy / Semana, pendientes y hechas, barra de avance.
2. **Rutina que se tacha sola**: confirmar las citas de mañana, documentos clínicos pendientes,
   cerrar la caja, stock bajo, reservas online por validar. Salen del estado de la clínica: cuando
   se resuelven, quedan tildadas sin que nadie haga nada.
3. **Las automáticas de la bandeja que me toquen** (las que tienen `assigneeId` = yo). Solo se
   muestran con link a la bandeja; ahí se trabajan con «Finalizar ▾» (no se tildan desde acá: cada
   cierre de una derivada tiene un significado —aceptó, rechazó— que acá no se puede elegir).
4. **Tareas vinculadas a un paciente que se tachan solas**: «cuando acepte el presupuesto»,
   «cuando pague», «cuando agende una cita».
5. **IA** (plan `ia`): **dictar la semana** (voz o texto → la IA lo separa en tareas con día y
   paciente; se revisa antes de guardar) y **resumen semanal**.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Dónde se guardan las tareas propias | `MgmtTask` tipo `personalizada` y `useTareas()`; **no hay una segunda lista** | La bandeja, la ficha del paciente y los reportes ya las leen |
| Quién ve una tarea propia | creada por mí y sin responsable, o con `assigneeId` = yo. Si la delegué (responsable = otra persona) deja de ser mía | Mi agenda es lo que **yo** tengo que hacer |
| Tildar | `gestionar(fila, "cerrar")` → «se ejecutó». Destildar saca esa gestión y la reabre | No inventar un segundo modelo de cierre |
| «Se tacha sola» | Se **deriva al leer**, no se escribe. `MgmtTask.autoCierre` dice qué espera; el motor compara con citas / presupuestos / pagos | Igual que las automáticas: «no hay nada que cerrar». Sin escrituras desde la lectura ni carreras entre dos pantallas abiertas |
| Si la condición se revierte | La tarea vuelve a pendiente (pago anulado, cita cancelada) | Es lo cierto: lo que esperaba ya no está |
| Rutina | Se calcula al leer, **solo para hoy**. Cada ítem tiene permiso y plan: sin permiso o sin la función, no aparece | Mismos gates que Inicio y la campana |
| Rutina sin nada que hacer | Se muestra tildada si hay base (hay citas mañana, hay insumos, la clínica usa reservas online); si no hay base, no aparece | Una lista de «Sin citas mañana ✓» es ruido |
| IA: qué se manda a Gemini | Solo el dictado (texto o audio) y la fecha de hoy. **Ningún nombre de paciente sale del navegador**: la IA devuelve el nombre dictado y el emparejamiento con la ficha se hace local | Datos personales |
| IA: guardado | Nunca guarda sola: devuelve propuestas que se revisan, editan y tildan antes de crear las tareas | Un modelo se equivoca con las fechas |
| Resumen semanal | Recibe conteos (no nombres de pacientes). Los montos solo viajan si el rol tiene `billing.reports` | Roles v3 |

## Modelo

```ts
// lib/types.ts
interface MgmtTask { …; autoCierre?: AutoCierre }
interface AutoCierre {
  evento: "cita" | "presupuesto" | "pago";
  desde: string;        // día local (YYYY-MM-DD) en que se creó la tarea
  budgetId?: string;    // evento "presupuesto": el plan que tiene que aceptar
  previas?: string[];   // evento "cita": las citas de hoy en adelante que ya tenía (no cuentan)
}
```

Se cumple cuando:

- **presupuesto**: el plan `budgetId` está `aceptado` o `completado`.
- **pago**: hay un pago del paciente, no anulado, con fecha (día local) ≥ `desde`.
- **cita**: hay una cita del paciente, ni cancelada ni ausente, que empieza ≥ `desde` y cuyo id
  no estaba en `previas`. Sigue cumplida cuando la cita pasa (no depende de que sea futura).

`filasDeTareas(derivadas, guardadas, hoy, cumplidas?)` emite una fila `estado: "sistema"` (con el
mismo id que la manual) en lugar de la pendiente. `lineasDeTareas` (reportes) la marca «Completada
por el sistema». Solo aplica a manuales abiertas con paciente: una tarea cerrada a mano no se toca.

## Lógica pura (con tests)

- `lib/tareasAuto.ts` — `crearAutoCierre`, `autoCierreCumplido`, `tareasCumplidas`, `motivoSistema`,
  `reabrirTarea`.
- `lib/miAgenda.ts` — `rangoDe(ambito, hoy)`, `itemsDeTareas`, `rutinaDeHoy`, `armarAgenda`
  (pendientes, hechas, avance, por día), `esMia`.
- `lib/agendaIA.ts` — `parsearPropuestas(raw, hoy)`, `emparejarPaciente(nombre, pacientes)`,
  `resumenSemanaDatos(...)`.

## UI

- `components/MiAgenda.tsx` — en Inicio, después de los indicadores y antes del Contralor IA.
  Encabezado con fecha, pestañas **Hoy / Semana**, barra de avance (`role="progressbar"`),
  alta rápida (texto + día + «Con paciente…» que abre `NuevaTareaModal`), lista de pendientes y
  hechas (en Semana, agrupadas por día), botones de IA si el plan la incluye.
- `NuevaTareaModal` gana «Se tacha sola cuando…» (solo con paciente): nada · agenda una cita ·
  acepta el presupuesto (elige cuál, solo los presentados) · registra un pago.
- `AgendaDictado` (modal): grabar o escribir → «Armar tareas» → revisar → «Guardar N tareas».
- `ResumenSemana` (panel): botón «Resumen de la semana» → texto de la IA.
- Cada ítem de rutina y automática lleva link a donde se resuelve. Teclado y lectores: cada
  casillero es un `button` con `aria-pressed` y el nombre de la tarea.

## Rutas IA

`/api/ia/agenda-semana` y `/api/ia/agenda-resumen`, con el molde de `nota-voz` / `contralor`:
`verifyIdToken` → `rateLimit` (usuario + IP) → `requireFeature("ia")` **antes** de `generativelanguage`
→ Gemini (`GEMINI_TEXT_MODEL` / `GEMINI_AUDIO_MODEL`, por defecto `gemini-2.5-flash`) → parser tolerante.
`ia-gating.exploits.test.ts` suma las dos rutas a la lista exacta.

## Fuera de alcance

Recordatorios por WhatsApp/push de la agenda, tareas que se repiten, editar la rutina por clínica,
tildar desde acá las automáticas de la bandeja, y agenda de otra persona del equipo.
