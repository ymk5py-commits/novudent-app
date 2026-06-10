# Integración Novudent ↔ Botika — Contrato técnico v1

Botika (botika.lat) corre como **servicio independiente** y se comunica con Novudent
por el patrón **outbox/inbox sobre Firestore** (proyecto `novudent-664f3`).
No hay API REST que mantener: ambos lados leen/escriben la misma colección.

```
Novudent (UI)                 Firestore                    Botika (worker)
─────────────                 ─────────                    ───────────────
encola tarea ──────────▶ clinics/{id}/outbox ◀────────── onSnapshot(status=="pendiente")
                                │                              │ conversa por WhatsApp (IA)
refleja resultado ◀──────── escribe result ◀──────────────────┘
(cita confirmada / NPS
 en ficha del paciente)
```

## 1. Lo que necesita Botika para conectarse

1. **Service account** del proyecto Firebase `novudent-664f3`:
   Firebase Console → ⚙️ Configuración → Cuentas de servicio → *Generar nueva clave privada*.
   El worker la usa con `firebase-admin` (omite las reglas de seguridad).
2. Escuchar la colección:

```js
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

db.collection("clinics/cl_demo/outbox")
  .where("status", "==", "pendiente")
  .onSnapshot((snap) => {
    snap.docChanges().forEach(async (ch) => {
      if (ch.type !== "added") return;
      const task = ch.doc.data();           // ver esquema §2
      await ch.doc.ref.update({ status: "enviado" }); // claim
      const result = await conversar(task); // WhatsApp + IA de Botika
      await ch.doc.ref.update({ status: "respondido", result }); // ver §3
    });
  });
```

> Multi-tenant: una suscripción por clínica (`clinics/{clinicId}/outbox`). Cada clínica
> tiene su propio número de WhatsApp configurado en Botika; Novudent solo encola.

## 2. Esquema de la tarea (lo que escribe Novudent)

```jsonc
{
  "id": "t_1760000000000",
  "clinicId": "cl_demo",
  "type": "confirmar_cita",     // "confirmar_cita" | "nps" | "cobranza" | "reagendar"
  "patientId": "p1",
  "phone": "+595 981 111 111",  // destino WhatsApp (normalizar a dígitos)
  "message": "Hola María 👋 Te recordamos tu cita…",  // primer mensaje sugerido
  "refId": "a1",                // citaId (confirmar_cita/reagendar) o budgetId (nps/cobranza)
  "status": "pendiente",        // ciclo: pendiente → enviado → respondido | error
  "createdAt": "2026-06-10T12:00:00.000Z",
  "createdBy": "Paola Asistente"
}
```

`message` es el opening sugerido (sale de la plantilla configurada en Novudent).
Botika es libre de continuar la conversación con su propia IA — lo único contractual
es el **resultado** que escribe al final.

## 3. Esquema del resultado (lo que escribe Botika)

Actualizar el MISMO documento: `status: "respondido"` (o `"error"`) + campo `result`:

```jsonc
// confirmar_cita / reagendar
"result": { "at": "2026-06-10T12:24:00.000Z", "confirmed": true, "reply": "Sí, confirmo 👍" }

// nps  (score 0–10, comment opcional)
"result": { "at": "…", "nps": 9, "comment": "Muy buena atención" }

// cobranza  (resumen libre de la conversación)
"result": { "at": "…", "reply": "Paga mañana por la clínica" }

// error (número inválido, sin respuesta tras N reintentos, etc.)
"status": "error", "result": { "at": "…", "error": "Número sin WhatsApp" }
```

## 4. Qué refleja Novudent automáticamente

| type            | efecto al recibir `result`                                                     |
|-----------------|--------------------------------------------------------------------------------|
| confirmar_cita  | `confirmed:true` → la cita (`refId`) pasa a **confirmada**, `confirmedVia:"botika"` |
| reagendar       | igual que confirmar_cita sobre la cita nueva                                    |
| nps             | `nps` → se guarda en `patients/{patientId}.nps` y alimenta el widget de Reportes |
| cobranza        | el resumen queda visible en Integraciones → Cola de mensajería                  |

> Si Botika quiere **además** confirmar la cita directamente (sin esperar que la UI
> procese), puede escribir él mismo `appointments/{refId}.status = "confirmada"` y
> `confirmedVia = "botika"` — Novudent lo toma como fuente de verdad al recargar.

## 5. Cuándo encola Novudent (automatizaciones)

Config en `clinics/{id}.config.botika` (editable en /app/integraciones):

```jsonc
{ "connected": true,
  "automations": { "confirmCita": true, "nps": true, "cobranza": true, "reagendar": true } }
```

- **confirmCita**: al crear una cita nueva (no cancelada).
- **nps**: al pasar un presupuesto a **completado**.
- **cobranza**: botón "Botika" en Caja → Cuentas por cobrar.
- **reagendar**: (fase 2) al cancelar una cita.

## 6. Identidad y auditoría

Botika actúa con identidad de servicio: todo lo que escribe queda como
`createdBy/by: "Botika"` en historiales. No tiene usuario de UI ni rol RBAC —
no lo necesita y no debe tenerlo.

## 7. Seguridad

- La service account de Botika vive SOLO en el servidor del worker (nunca en el front).
- Reglas de Firestore actuales (`request.auth != null`) no afectan al worker (admin SDK).
- Si se quiere acotar: crear un usuario de Firebase Auth para Botika y reglas que limiten
  su `uid` a escribir únicamente `outbox/*`, `appointments/*.status` y `patients/*.nps`.

## 8. Roadmap fase 2

- `onSnapshot` en la UI de Novudent para reflejo en tiempo real (hoy: al recargar).
- Tareas `reagendar` automáticas al cancelar citas.
- Recordatorio de cuota mensual de ortodoncia (cron en el worker leyendo `patients.*.ortho`).
- Plantillas por tipo de tarea editables desde Integraciones.
