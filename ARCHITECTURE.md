# Arquitectura — Novudent

SaaS de gestión para clínicas dentales (LATAM). Multi-tenant, en producción en
`novudent-app.vercel.app`. Este documento describe **cómo está construido y por qué**,
incluidas las decisiones raras y sus consecuencias.

> Para las convenciones de trabajo (cómo agregar una feature, cómo pushear) ver
> `CLAUDE.md`. Para el modelo de amenaza ver `SECURITY.md`.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend + backend | **Next.js 14 (App Router)** + TypeScript, desplegado en Vercel |
| Base de datos | **Cloud Firestore** (Firebase Web SDK, plan Spark) |
| Autenticación | Firebase Auth (email/contraseña + anónima para la demo) |
| IA | Google **Gemini** (visión, texto, voz, generación de imagen) |
| Cobro | **Lemon Squeezy** (Merchant of Record) |
| UI | Tailwind CSS · framer-motion · lucide-react · Recharts |
| Tests | Vitest (unitarios) + `@firebase/rules-unit-testing` (reglas, contra emulador) |

Solo 8 dependencias de producción. El odontograma es un motor de terceros
**vendorizado** (ver §7).

---

## 2. La decisión que explica todo: no hay Admin SDK

El proyecto está en el plan **Spark de Firebase**, sin organización de GCP, así que
**no se pueden emitir service-account keys**. Consecuencia directa:

> **El navegador escribe Firestore DIRECTAMENTE. No hay un backend que medie las
> operaciones del dashboard. Las Security Rules son la ÚNICA frontera real.**

Esto se aparta del patrón habitual (cliente → API → base) y condiciona todo lo demás:

- **Toda autorización que importe tiene que estar en `firestore.rules`.** El RBAC del
  cliente (`lib/rbac.ts`, `can()`) es **solo UX** — un usuario malicioso lo saltea
  abriendo la consola del navegador. Ya se cerraron por esta vía tres agujeros reales:
  escritura del EMR por asistentes, auto-ascenso de plan, y escritura tras impago.
- **Las rutas de servidor que necesitan escribir usan un "usuario de servicio"**
  (`lib/server/firestore-rest.ts`): un usuario común de Firebase Auth que inicia sesión
  con `SERVICE_USER_EMAIL/PASSWORD` y está habilitado en la allowlist
  `serviceAccounts/{uid}`. Las reglas lo reconocen con `isService()`. Es el mecanismo
  de elevación que reemplaza al Admin SDK.
- **Las imágenes van como base64 dentro de Firestore** (no hay Firebase Storage). Se
  redimensionan en el cliente (`lib/image.ts`) para que cada documento quede por debajo
  del límite de 1 MB.

⚠️ **Migrar a Blaze** habilitaría Admin SDK, Cloud Functions (cron) y sacaría el techo
de cuota diaria compartida. Es el principal pendiente de infraestructura para escalar.

---

## 3. Modelo de datos

### Multi-tenant: todo cuelga de la clínica

```
clinics/{cid}                     ← doc raíz: nombre, config, plan (legacy)
  ├── users/{uid}                 ← equipo + roles
  ├── patients/{id}               ← ficha + EMR + odontograma
  ├── appointments/{id}
  ├── budgets/{id}                ← planes de tratamiento
  ├── payments/{id} · expenses/{id} · cashSessions/{id}
  ├── billing/{id} · fiscalDocs/{id}
  ├── radiographs · signatures · labOrders · settlements · boxes
  ├── crmCards · campaigns · surveys · surveyResponses
  └── … (30 colecciones en total)
```

**Regla dura:** nunca se escriben datos de una clínica en otra. El store escribe con
`fsSave(col, id, data)` / `fsDelete` contra `clinicIdRef.current` — **no** contra la
global mutable `CLINIC_ID` (que existe por razones históricas y es una trampa conocida).

### Colecciones raíz (fuera de `clinics/`)

| Colección | Para qué | Quién escribe |
|---|---|---|
| `directory/{uid}` | Routing login → clínica (multi-clínica) | admin (acotado) / servicio |
| `serviceAccounts/{uid}` | Allowlist del usuario de servicio | **nadie** (consola de Firebase) |
| `subscriptions/{cid}` | **Plan contratado y estado de cobro** | **solo servicio** (webhook) |
| `webhookEvents/{id}` | Idempotencia de webhooks de pago | solo servicio |

`subscriptions` vive **fuera** de `clinics/{cid}` a propósito: ese doc lo puede escribir
el admin de la propia clínica, así que si el plan viviera ahí, cualquier cliente se
auto-ascendería a Cadena gratis.

---

## 4. Autorización — tres capas

| Capa | Dónde | Qué garantiza | ¿Se puede saltear? |
|---|---|---|---|
| **Security Rules** | `firestore.rules` | Aislamiento entre clínicas, RBAC, cobro, plan | **No** — es la frontera real |
| **Usuario de servicio** | `lib/server/firestore-rest.ts` | Escrituras sin sesión (webhooks, reservas, firmas) | No (credencial en env) |
| **RBAC de cliente** | `lib/rbac.ts` + `components/PlanGate.tsx` | Que la UI no muestre lo que no corresponde | **Sí** — es solo UX |

Helpers principales de las reglas:

- `isMember(cid)` — existe `clinics/{cid}/users/{uid}`. Fuente de verdad de pertenencia.
- `isAdmin` / `isStaff` / `isClinical` — RBAC por rol (dinero, EMR, config).
- `isService()` — allowlist de servidor.
- `isDemo(cid)` — sandbox público `cl_demo`.
- `subActive(cid)` — suscripción al día (chequea **status y fecha**).
- `effectivePlan(cid)` + `canWritePremium(cid, planes)` — gating de módulos por plan.

**Default-deny**: las colecciones se enumeran explícitamente. Una colección nueva sin
regla queda **denegada** — por eso agregar una feature exige tocar `firestore.rules` y
correr `firebase deploy --only firestore:rules`, o las clínicas reales no guardan (la
demo sí, por `isDemo`, lo que enmascara el fallo).

---

## 5. Superficies

### Dashboard (`/app/*`) — requiere sesión
23 páginas: agenda, pacientes (+ ficha), presupuestos, facturación, caja, gastos,
inventario, laboratorios, liquidaciones, box, CRM, reportes, tareas, chat, encuestas,
esterilización, ambiental, videos, integraciones, configuración, suscripción.

Todo pasa por `components/Shell.tsx` (nav estilo Dentalink + gating por rol y plan).

### Páginas públicas — sin login
| Ruta | Para qué | Cómo se protege |
|---|---|---|
| `/reservar/[clinicId]` | Reserva online del paciente | rate-limit + validación estricta |
| `/firmar/[cid]/[token]` | Firma de consentimiento | **token aleatorio ~180 bits** = la credencial |
| `/encuestas/[cid]/[surveyId]` | Encuesta NPS | rate-limit |
| `/pagar/[cid]` | Cobro al paciente | rate-limit; solo datos públicos de la clínica |
| `/videoconsulta/[cid]/[apptId]` | Telemedicina (Jitsi) | sala derivada de token aleatorio |
| `/` · `/login` · `/superadmin` | Landing, acceso, panel del dueño | `/superadmin` autoriza server-side |

Estas páginas **no tienen sesión**, así que escriben vía rutas API con el usuario de
servicio.

### Rutas API (`app/api/*`)
- **IA (8):** `radiografia`, `copilot`, `simulador`, `nota-voz`, `perio-voz`,
  `resumen-paciente`, `contralor`, `reportes`. Patrón: `verifyIdToken` + `rateLimit`
  por uid **y por IP** + la key de Gemini solo del lado servidor.
- **Públicas:** `reservas`, `encuestas`, `pago`, `firmar` — sin sesión, con rate-limit
  y validación de `cid`.
- **Cobro:** `webhooks/lemonsqueezy` (firma HMAC + idempotencia),
  `suscripcion/checkout` (resuelve la clínica server-side).
- **Gestión:** `clinicas` (alta, protegida con `OWNER_PANEL_KEY` + `timingSafeEqual`),
  `change-password`, `email`.

---

## 6. Estado en el cliente — `lib/store.tsx`

Un **único objeto `DB`** con todas las colecciones de la clínica activa, cargado de una
vez al entrar (`loadFirestore`) y mantenido en React Context.

- **Write-through**: cada acción actualiza el estado local *y* escribe Firestore
  (`fsSave`/`fsDelete`). No hay capa de sincronización ni caché intermedia.
- **Fallback local**: si Firestore no está disponible, trabaja contra `localStorage`
  (`backend: "connecting" | "firebase" | "local"`).
- ⚠️ **Trampa conocida**: `persist()` captura un snapshot del `db`. Un bucle síncrono de
  varios `add*` produce *last-write-wins* y pierde datos → usar el updater funcional
  `persist(prev => …)`.
- El `logout` borra el caché de PII de `localStorage` (dato médico sensible).

---

## 7. Odontograma — motor vendorizado

`components/odontogram-engine/` es una copia adaptada de
[React-Odontogram-Modul](https://github.com/ZoliQua/React-Odontogram-Modul) (MIT), con
~30 campos clínicos por pieza y sus ~800 tests propios.

Particularidades:
- **No es un paquete de npm** — se vendorizó el fuente. Se le removió la funcionalidad
  HL7 FHIR (sin consumidor) y se le expusieron `collectExportPayload`/`importStatus`.
- Mantiene **estado interno propio y manipula el DOM** (no es React controlado). El
  puente con nuestro mundo es `components/Odontogram.tsx`.
- Lleva **`// @ts-nocheck` en sus 116 archivos**: no se escribió contra `strict: true` y
  exigirle nuestro rigor de tipado significaría reescribirlo (dificultando re-sincronizar
  con upstream).
- Los datos se guardan como payload nativo del motor en `Patient.odontogram`.
- `components/OdontogramShowcase.tsx` es una vitrina liviana **solo para marketing**
  (landing y dashboard), desconectada de datos reales.

---

## 8. Monetización

```
Cliente → /app/suscripcion → POST /api/suscripcion/checkout
                                    ↓ (resuelve clinic_id server-side)
                             checkout hospedado de Lemon Squeezy
                                    ↓ (pago confirmado)
                             POST /api/webhooks/lemonsqueezy
                                    ↓ (firma HMAC + idempotencia)
                             subscriptions/{cid}  ← usuario de servicio
                                    ↓
                             gating en reglas + UI
```

- **LS es Merchant of Record**: los datos de tarjeta nunca tocan Novudent (fuera del
  alcance PCI) y LS emite la factura.
- **La única fuente de verdad es el pago confirmado por webhook.** No hay ninguna acción
  en la UI que active un plan.
- **Al vencer: solo lectura.** La clínica conserva consulta y exportación de sus
  historias clínicas — retenerlas como palanca de cobro es legalmente delicado
  (LGPD Brasil / Ley 1581 Colombia).
- **Grandfathering**: una clínica sin doc de suscripción puede escribir (las que ya
  existían antes del cobro no podían quedar bloqueadas de un día para el otro).

---

## 9. Testing

| Suite | Comando | Cubre |
|---|---|---|
| Unitarios | `npx vitest run` | Helpers puros (validadores clínicos, cobro, RBAC, moneda…) |
| Reglas | `npm run test:rules` | Aislamiento multi-clínica, RBAC, cobro y planes |
| Motor odontograma | incluido en vitest | Los ~800 tests propios del vendor |

**Convención: los validadores clínicos y de negocio son funciones puras con TDD**
(`lib/radiografia.ts`, `lib/firma.ts`, `lib/perio-voice.ts`, `lib/subscription.ts`,
`lib/lemonsqueezy.ts`…) — nunca corrompen la ficha ante basura del modelo de IA.

Los tests de reglas necesitan Java (emulador): `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

**Antes de mergear:** `npx tsc --noEmit && npx vitest run && npm run build`.

---

## 10. Despliegue

- **Push a `main` → deploy automático en Vercel.**
- **Las reglas NO se despliegan solas**: `firebase deploy --only firestore:rules` es un
  paso manual y obligatorio cada vez que se agrega una colección o se cambia una regla.
- Variables de entorno en Vercel: `GEMINI_API_KEY`, `FIREBASE_WEB_API_KEY`,
  `SERVICE_USER_EMAIL/PASSWORD`, `OWNER_PANEL_KEY`, `RESEND_API_KEY`/`EMAIL_FROM`,
  `LEMONSQUEEZY_WEBHOOK_SECRET`, `LS_VARIANT_*`, `LS_CHECKOUT_*`.

---

## 11. Limitaciones conocidas

| Tema | Estado |
|---|---|
| **Plan Spark** | Cuota diaria compartida entre todas las clínicas; sin Cloud Functions (no hay cron para vencimientos ni cobranza). **Bloqueante para escalar.** |
| **Demo pública** | `cl_demo` es escribible sin autenticar y comparte cuota con producción. Lo ideal es aislarla en otro proyecto Firebase. |
| **Rate-limit** | En memoria por instancia de lambda; no es un límite global real. Migrar a Upstash/Vercel KV. |
| **Sin CSP de recursos** | Hay `frame-ancestors`, `nosniff` y `Referrer-Policy`, pero no `script-src` con nonces. |
| **Next.js 14.x** | Ya no recibe parches nuevos; las CVEs conocidas no aplican a esta app (no usa `next/image`, Server Actions, middleware ni i18n). Re-evaluar si se agregan esas features. |
| **Costo de las reglas** | Cada escritura hace un `get()` extra a `subscriptions/{cid}` (los `get()` al mismo path se cachean por evaluación → 1 lectura). |
