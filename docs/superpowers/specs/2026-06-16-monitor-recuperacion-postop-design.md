# Monitor de Recuperación Post-op — Diseño

**Fecha:** 2026-06-16
**Tipo:** Diferenciador de producto (feature nueva, toca Novudent + Botika)

## Objetivo

Convertir a Novudent de "secretario que anota citas" en "socio que garantiza la
recuperación de la salud": tras un procedimiento quirúrgico, el bot contacta al
paciente a las 24/48/72h, pregunta de forma empática por su evolución (dolor,
inflamación, sangrado), **triajea** la respuesta (verde/amarillo/rojo) y, ante una
posible complicación, **alerta al doctor de inmediato con prioridad roja**.

Es un diferenciador real porque el seguimiento post-quirúrgico es un dolor común
no resuelto por los competidores (a diferencia de la confirmación de citas o la
conversión de presupuestos, ya saturados), reutiliza la infraestructura de
integración Botika ya validada, y su "red de seguridad" clínica es difícil de
copiar bien.

## Contexto (qué ya existe y se reutiliza)

- **Integración Botika ↔ Novudent** vía outbox Firestore (contrato v1): tipos de
  tarea `confirmar_cita | nps | cobranza | reagendar`; el cron de Botika
  (`?job=novudent-outbox`) lee la outbox de la clínica, envía por WhatsApp e
  interpreta la respuesta (`detectNovudentOutcome` en `api/_lib/novudent.js`).
- **Novudent:** `lib/types.ts` (OutboxTaskType, OutboxTask, OutboxResult,
  BotikaConfig.automations), `lib/store.tsx` (`reflectOutbox`, `addOutboxTask`,
  listener en vivo), panel "Tareas críticas" en `app/app/page.tsx`, ficha del
  paciente `app/app/pacientes/[id]/page.tsx`, procedimientos con CPT
  (`Procedure`, ej. D7140 exodoncia, D3310 endodoncia).
- **Gemini** server-side en `app/api/ia/*` (clasificación/extracción de texto).

## Enfoque

**A — Reutilizar el patrón outbox.** Cada toque (24/48/72h) es una tarea outbox
`postop`; Novudent agenda, el cron de Botika envía, el inbound triajea y escribe
el resultado de vuelta, Novudent refleja y alerta. Es el camino más corto a un
diferenciador real y es consistente con la integración ya validada.

Descartados: **B** subsistema con máquina de estados propia (más limpio, más
código nuevo — innecesario para v1); **C** Novudent-only con links `wa.me`
manuales (mata lo "proactivo", que es la esencia del diferenciador).

## Arquitectura / componentes

Una sola feature acoplada por el contrato outbox, con dos tracks:

### Track Novudent (`novudent-app`)
- **Tipos** (`lib/types.ts`):
  - `User.phone?: string` — WhatsApp del doctor para la alerta roja.
  - `Procedure.surgical?: boolean` — marca un arancel como quirúrgico (default por
    CPT: D7140 exodoncia, D3310 endodoncia; editable).
  - `OutboxTaskType` suma `postop` y `postop_alert`.
  - `RecoveryMonitor`:
    ```ts
    interface RecoveryTouchpoint {
      offsetHours: 24 | 48 | 72;
      dueAt: string;                 // ISO absoluto
      status: "pendiente" | "enviado" | "respondido" | "vencido";
      severity?: "verde" | "amarillo" | "rojo";
      pain?: number;                 // 0-10 extraído
      reply?: string;                // texto del paciente
      summary?: string;              // resumen IA de 1 línea
      repliedAt?: string;
    }
    interface RecoveryMonitor {
      id: string; clinicId: string; patientId: string; dentistId: string;
      procedure: string;             // descripción + CPT
      startedAt: string;
      touchpoints: RecoveryTouchpoint[];
      status: "activo" | "completado" | "escalado"; // escalado = hubo un rojo
      worstSeverity?: "verde" | "amarillo" | "rojo";
      alertedAt?: string; resolvedAt?: string; resolvedBy?: string;
    }
    ```
- **Subcolección Firestore** `clinics/{cid}/recoveryMonitors/{id}` (+ regla:
  `read,write: if isMember(cid) || isService() || isDemo(cid)`; agregar a
  `firestore.rules` y a los tests).
- **Store** (`lib/store.tsx`): `addRecoveryMonitor`, `reflectOutbox` extendido para
  `postop` (escribe la severidad/dolor en el touchpoint del monitor y, si rojo,
  marca `status:"escalado"` + encola `postop_alert`).
- **Disparador (híbrido):** al guardar una nota/cita con un procedimiento
  `surgical`, la ficha sugiere "Activar monitor de recuperación" (1 clic → crea el
  monitor con 3 touchpoints en now+24/48/72h). Botón manual siempre disponible en
  la ficha/cita.
- **Agendado:** una tarea outbox `postop` se crea cuando `dueAt` llega. v1: el cron
  `novudent-outbox` de Botika, al pollear, materializa los touchpoints vencidos en
  tareas (o Novudent las crea al cargar). Decisión v1: **Botika las materializa**
  (lee `recoveryMonitors` activos, crea la tarea `postop` del touchpoint vencido) —
  centraliza el envío en el cron que ya corre.
- **Alerta roja:**
  - Dashboard: nueva tarjeta en "Tareas críticas" (`app/app/page.tsx`), tono rojo,
    "🔴 Recuperación: <paciente> reporta posible complicación", linkea a la ficha.
  - WhatsApp al doctor: tarea `postop_alert` → `dentist.phone`.
- **Vista:** bloque "Recuperación" en la ficha del paciente — timeline de los 3
  toques con semáforo, dolor y resumen; botón "Marcar resuelto".

### Track Botika (`botika`)
- **`api/_lib/novudent.js`** `detectNovudentOutcome`: agrega rama `postop`:
  1. **Reglas duras (deterministas, primero):** si el texto matchea señales de
     alarma → `severity:"rojo"` sin importar la IA. Patrones (es): sangrado que no
     para / abundante, fiebre, pus / secreción, hinchazón que crece / empeora, "no
     puedo" tragar|respirar|abrir la boca, dolor declarado ≥ 8.
  2. **IA (Gemini):** clasifica `verde|amarillo|rojo`, extrae `pain` 0-10 y un
     `summary` de 1 línea.
  3. **Severidad final = la peor de (reglas, IA).** Nunca se baja un rojo duro.
  Escribe el resultado en la tarea (`severity`, `pain`, `summary`).
- **Cron `novudent-outbox`:** materializa los touchpoints vencidos de los monitores
  activos en tareas `postop` y las envía; procesa `postop_alert` enviando el
  WhatsApp al doctor.
- **Mensajes (es, empáticos):** opening por toque ("Hola {paciente} 👋 Pasaron
  {horas}h de tu {procedimiento}. ¿Cómo venís? Contame del 0 al 10 cuánto dolor
  tenés y si notás algo raro (sangrado, hinchazón, fiebre)."); la respuesta del bot
  siempre cierra con la línea de seguridad (ver abajo).

## Seguridad clínica (no es opcional)

- El bot **no diagnostica**: es un triaje asistido. Todo toque incluye una línea de
  seguridad: *"Si tenés sangrado que no para, fiebre alta o dificultad para
  respirar/tragar, no esperes: comunicate con la clínica o acudí a una guardia."*
- Ante `rojo`, además de alertar al doctor, el bot le dice al paciente que un
  profesional lo va a contactar a la brevedad.
- Las reglas duras priman sobre la IA (un falso negativo es el riesgo a evitar).
- Registro: cada touchpoint guarda la respuesta cruda + severidad + quién/qué la
  determinó (regla vs IA) para auditoría clínica.

## Datos / flujo (resumen)

1. Dentista registra procedimiento quirúrgico → ficha sugiere activar → 1 clic →
   `RecoveryMonitor` con 3 touchpoints (now+24/48/72h, status `pendiente`).
2. Cron Botika: touchpoint vencido → tarea `postop` → WhatsApp empático al paciente.
3. Paciente responde → Botika triajea (reglas → IA → peor de ambas) → escribe
   `severity/pain/summary` en la tarea.
4. Listener de Novudent refleja en el touchpoint; si `rojo` → monitor `escalado` +
   tarjeta roja en el dashboard + tarea `postop_alert` → WhatsApp al doctor.
5. Monitor `completado` tras el último toque (o `resuelto` por el doctor).

## Alcance

**v1 (IN):** disparador híbrido (sugerencia por CPT quirúrgico + botón manual); 3
touchpoints 24/48/72h (ajustables al activar); pregunta empática vía Botika;
triaje reglas-duras + IA; severidad/dolor por toque; tarjeta roja en dashboard +
WhatsApp al doctor; bloque "Recuperación" en la ficha; línea de seguridad clínica.

**Fuera de v1 (después):** umbrales de triaje configurables por clínica;
conversaciones con ramas (re-preguntar si la respuesta es ambigua); analítica de
recuperación (tasa de complicaciones por procedimiento/profesional); link con el
scoring de adherencia; i18n.

## Criterio de éxito

Tras un procedimiento quirúrgico, el dentista activa el monitor en 1 clic; el
paciente recibe 3 mensajes empáticos por WhatsApp en 24/48/72h; una respuesta con
señal de alarma (p. ej. "me sangra mucho y tengo fiebre") **siempre** dispara una
alerta roja en el dashboard y un WhatsApp al doctor en la siguiente corrida del
cron; el dentista ve el timeline del paciente y puede marcar el caso resuelto.

## Riesgos / decisiones

- **Dos repos:** la feature se entrega en dos tracks acoplados por el contrato
  outbox; el plan tendrá tareas Novudent y Botika. Se prueba E2E como la
  integración ya validada.
- **Reglas estrictas de Firestore:** la nueva subcolección `recoveryMonitors`
  necesita su regla + el service user de Botika la lee → ya cubierto por el
  allowlist `serviceAccounts` (Fase 3 del plan de validación). Agregar tests.
- **Número del doctor:** `User.phone` es nuevo y opcional; si falta, la alerta roja
  cae solo al dashboard (degradación segura) y se avisa al admin para que lo cargue.
- **Responsabilidad clínica:** triaje asistido, no diagnóstico; la línea de
  seguridad y la escalada humana son obligatorias.
