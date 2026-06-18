# Firma Electrónica de Consentimientos — Diseño (sub-proyecto B)

**Fecha:** 2026-06-17
**Tipo:** Feature de paridad con Dentalink (Novudent puro — no toca Botika)
**Programa:** Paridad Dentalink. Este spec cubre **solo B** (firma electrónica + documentos/consentimientos).

## Objetivo

Que la clínica haga firmar consentimientos **digitalmente**: el paciente firma con el
dedo/mouse en el dispositivo de la clínica (pad en pantalla) **o** escanea un **QR /
abre un enlace** y firma desde su propio celular. La firma se incrusta en el documento
de consentimiento, que queda guardado con fecha/hora y datos del firmante, listo para
imprimir/descargar. Replica el servicio "Firma electrónica" de Dentalink y cubre además
su "Documentos clínicos / Consentimientos Informados".

## Decisiones (del brainstorming)

1. **Alcance v1: pad en pantalla + QR/enlace público** para firmar desde el celular
   (confirmado por el usuario).
2. **Gating: feature de plan `firma_electronica` en Clínica + Cadena** (no Solo —
   servicio adicional, consistente con `radiografia_ia`). **Confirmado.**
3. **Plantillas de consentimiento** definidas por la clínica (editables); se siembran
   1–2 por defecto (consentimiento informado general + consentimiento de tratamiento).
4. **Dependencia nueva:** `qrcode` (+ `@types/qrcode`) para generar el QR del enlace.

## Contexto (qué se reutiliza)

- **Ruta pública** (`app/api/reservas/route.ts` + `app/reservar/[clinicId]/page.tsx`):
  molde de una página pública sin login que opera por parámetro de URL, valida en el
  server y escribe vía el acceso server-side. `/api/firmar` y `/firmar/[token]` lo copian.
- **Almacenamiento base64** (patrón ya usado): la firma es un PNG base64 chico (pocos KB)
  → cabe holgado en un doc Firestore.
- **Colección por clínica** (patrón `recoveryMonitors`/`radiographs`): nueva
  `clinics/{cid}/signatures`. Plantillas en `clinic.config` (como `reminderTemplate`).
- **Impresión** (`globals.css` `@media print .print-area`): el consentimiento firmado
  se imprime/descarga reusando el área imprimible.
- **Plan/RBAC/Config**: `PlanGate` + `lib/plan.ts` (feature nueva); `can(...)` para quién
  crea/gestiona; sección "Servicios adicionales" de Configuración (ya tiene el hueco).
- **Ficha** (`app/app/pacientes/[id]/page.tsx`): se agrega un tab `consentimientos`.

## Modelo de datos (`lib/types.ts`)

```ts
export interface ConsentTemplate {
  id: string;
  title: string;
  body: string;            // texto del consentimiento (puede tener \n; render como párrafos)
}

export type SignatureStatus = "pendiente" | "firmado" | "anulado";

export interface SignatureDoc {
  id: string;
  patientId: string;
  templateId?: string;
  title: string;
  body: string;            // snapshot del texto al momento de crear (no cambia si editan la plantilla)
  status: SignatureStatus;
  token: string;           // capability para firma remota (random, no adivinable)
  signatureImage?: string; // PNG base64 de la firma
  signedAt?: string;
  signedByName?: string;   // nombre con el que firmó el paciente
  channel?: "consultorio" | "remoto";
  createdBy: string;
  createdAt: string;
}
```

- `DB` suma `signatures: SignatureDoc[]`.
- `clinic.config` suma `consentTemplates?: ConsentTemplate[]` (el seed crea 1–2).

## Almacenamiento

- Colección `clinics/{cid}/signatures`, un doc por consentimiento. Docs chicos (firma PNG
  ~pocos KB). Store: cargar como las demás colecciones (`col("signatures")`), default `[]`,
  acciones `addSignature/updateSignature/deleteSignature` (persist + `fsSave`/`fsDelete`).
- Plantillas viven en `clinic.config.consentTemplates` (se guardan con el config existente).

## Flujos

### A. Firma en consultorio (pad)
1. En la ficha → tab **Consentimientos** → "Nuevo consentimiento" → elige plantilla
   (snapshot de `title`+`body`) → crea `SignatureDoc` (`status:"pendiente"`, `token`).
2. "Firmar ahora" abre el **pad** (`components/SignaturePad.tsx`): el paciente firma en
   la pantalla → PNG base64 → `updateSignature` (`status:"firmado"`, `signatureImage`,
   `signedAt`, `signedByName`, `channel:"consultorio"`).

### B. Firma remota (QR / enlace)
1. Igual hasta crear el `SignatureDoc` pendiente.
2. "Firmar desde el celular" muestra un **QR** (y enlace copiable) que codifica
   `https://<host>/firmar/<cid>/<token>` (el `cid` no es secreto — igual que en
   `/reservar/[clinicId]`; el secreto es el `token`).
3. El paciente abre la **página pública** `app/firmar/[cid]/[token]/page.tsx` (sin login,
   mobile-first): lee el doc vía `GET /api/firmar?cid=…&token=…` (server-side: busca en
   `clinics/{cid}/signatures` el doc cuyo token coincide — sin collection-group query),
   muestra el consentimiento + el **pad**, el paciente firma y envía
   `POST /api/firmar { token, signatureImage, signedByName }`.
4. El server valida y **firma solo si está `pendiente`** (no re-firma, no enumera otros
   tokens), escribe `signatureImage`/`signedAt`/`signedByName`/`channel:"remoto"`.
5. La UI de la clínica refleja el cambio (al recargar / vía el snapshot del store).

## Componentes

1. **`components/SignaturePad.tsx`** (nuevo): canvas de firma con Pointer Events
   (dibuja líneas), botón "Borrar", export a PNG base64. Reusado en consultorio y en la
   página pública.
2. **`lib/firma.ts`** (nuevo, puro, **TDD**): `newSignToken()` (token aleatorio no
   adivinable vía `crypto.getRandomValues`), `canSign(doc)` (true solo si
   `status==="pendiente"`), `validateSignPayload(raw)` (sanea `{ signatureImage (data URL
   PNG, tope de tamaño), signedByName (string acotado) }`, rechaza basura). Núcleo de
   seguridad de la firma.
3. **`app/api/firmar/route.ts`** (nuevo, público): GET por `cid`+`token` → `{ title, body,
   status, patientName? }` del doc (solo lo necesario para firmar; nada sensible extra).
   POST → `validateSignPayload` + `canSign` + escribe la firma (acceso server-side como
   reservas, vía el service-user → la regla `signatures` permite `isService()`).
   Rate-limit por token/IP. Sin auth (el token ES la credencial).
4. **`app/firmar/[cid]/[token]/page.tsx`** (nuevo, público): página mobile-first que consume la
   ruta y muestra consentimiento + pad + confirmación ("¡Gracias! Documento firmado").
5. **`components/Consentimientos.tsx`** (nuevo): tab de la ficha — crear desde plantilla,
   firmar (pad) o mostrar QR, lista de docs (pendiente/firmado/anulado), ver/imprimir el
   firmado, anular.
6. **Config**: gestión de `consentTemplates` (CRUD simple) + tarjeta "Firma electrónica"
   en Servicios adicionales (reemplaza el placeholder dejado en A).

## Seguridad y compliance

- **Token** no adivinable (`crypto.getRandomValues`, ≥128 bits); es la única credencial
  de la página pública. La ruta pública NO expone datos sensibles de más (solo título,
  cuerpo y estado; el nombre del paciente solo para mostrar "firmás como X").
- **Idempotencia/anti-fraude**: `canSign` exige `pendiente`; firmar un doc ya firmado o
  anulado se rechaza. No se puede enumerar tokens (cada uno abre solo su doc).
- **Rate-limit** en `/api/firmar` (anti-abuso).
- **Auditoría/legal**: `signedAt`, `signedByName`, `channel`, `createdBy`; el cuerpo es un
  snapshot inmutable. Consentimiento = dato personal sensible → cae bajo la retención PII
  y las reglas member-scoped existentes.
- **Reglas Firestore**: `signatures` con read/write por miembros (molde `recoveryMonitors`).
  La firma remota se escribe por el server (service) → no depende de reglas de cliente.

## Alcance

**v1 (IN):** plantillas de consentimiento (config, con seed) ; crear consentimiento desde
plantilla; pad de firma en consultorio; QR + página pública `/firmar/[cid]/[token]` + ruta
`/api/firmar`; validador puro TDD (`lib/firma.ts`); colección `signatures` + store +
reglas; tab Consentimientos en la ficha; imprimir el firmado; gating de plan; tarjeta en
Servicios adicionales; dependencia `qrcode`.

**Fuera de v1:** firma con validez legal avanzada (certificados/eIDAS/firma digital
cualificada); envío automático del enlace por WhatsApp (se puede sumar después vía el
outbox de Botika — gancho natural pero no en v1); versionado de plantillas; multi-firmante.

## Criterio de éxito

La clínica crea un consentimiento desde una plantilla y lo hace firmar — en consultorio
(pad) o por QR desde el celular del paciente — en menos de un minuto; el documento queda
firmado, con fecha/hora y nombre, imprimible. Un intento de firmar un doc ya firmado o un
token inválido se rechaza sin filtrar datos. Solo los planes habilitados ven la feature.

## Riesgos / decisiones abiertas

- **Tier del plan**: `firma_electronica` en **Clínica + Cadena** (confirmado).
- **Host del enlace público**: el QR usa el origin de la request (o `NEXT_PUBLIC_APP_URL`
  si está) — verificar que en prod resuelva al dominio correcto.
- **Validez legal**: v1 es firma electrónica simple (no cualificada); el texto del
  consentimiento + auditoría alcanzan para el uso clínico habitual, pero NO equivale a
  firma digital con certificado. Dejarlo claro al usuario.
