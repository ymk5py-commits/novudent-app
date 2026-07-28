# Novudent

SaaS de gestión para clínicas dentales (LATAM, español rioplatense). Agenda, ficha del
paciente con odontograma, planes de tratamiento, caja y facturación, inventario, IA
clínica y cobro por suscripción.

**Producción:** [novudent-app.vercel.app](https://novudent-app.vercel.app) · deploy
automático desde `main`.

| Documento | Para qué |
|---|---|
| **`ARCHITECTURE.md`** | Cómo está construido y por qué. **Leerlo antes de tocar código.** |
| `SECURITY.md` | Modelo de amenaza y checklist de despliegue |
| `CLAUDE.md` | Convenciones de trabajo y patrones al agregar features |
| `docs/` | Specs, planes de implementación e integración con Botika |

---

## Arranque rápido

Requiere **Node 20+** (probado en 20.20).

```bash
npm install
npm run dev
```

Abre <http://localhost:3100> (el puerto es 3100, no 3000).

**La app arranca sin ninguna variable de entorno.** La configuración web de Firebase está
en el código (`lib/firebase.ts`) porque es pública por diseño, así que el login y la base
funcionan de entrada. Lo que necesita envs son las funciones de servidor (IA, email,
cobro), que **degradan con un mensaje claro** en vez de romper.

Para probar sin cuenta: **`/login` → "Ver demo" → elegí un usuario**. La clínica demo
(`cl_demo`) se auto-siembra con datos de ejemplo.

---

## Variables de entorno

Ninguna es necesaria para levantar el proyecto. Cada bloque habilita una función; si
falta, esa función responde 503 con un mensaje entendible.

### Servidor (Firestore sin Admin SDK)
| Variable | Habilita |
|---|---|
| `FIREBASE_WEB_API_KEY` | Verificar tokens en las rutas API (auth de servidor) |
| `SERVICE_USER_EMAIL` · `SERVICE_USER_PASSWORD` | El **usuario de servicio**: escrituras sin sesión (reservas online, firma remota, webhooks). Ver `ARCHITECTURE.md` §2 |
| `FIREBASE_PROJECT_ID` | Opcional — default `novudent-664f3` |

### IA (Gemini)
| Variable | Habilita |
|---|---|
| `GEMINI_API_KEY` | Las 8 rutas de IA. **Nunca exponerla al cliente ni loguearla** |
| `GEMINI_VISION_MODEL` | Opcional — default `gemini-2.5-pro` |
| `GEMINI_TEXT_MODEL` · `GEMINI_AUDIO_MODEL` · `GEMINI_IMAGE_MODEL` | Opcionales |

### Cobro (Lemon Squeezy)
| Variable | Habilita |
|---|---|
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Verificación HMAC del webhook. **Sin esto el endpoint queda cerrado a propósito** |
| `LS_VARIANT_SOLO` · `LS_VARIANT_CLINICA` · `LS_VARIANT_CADENA` | Mapeo variante comprada → plan |
| `LS_CHECKOUT_SOLO` · `LS_CHECKOUT_CLINICA` · `LS_CHECKOUT_CADENA` | Links de checkout hospedado |

### Otros
| Variable | Habilita |
|---|---|
| `OWNER_PANEL_KEY` | Alta de clínicas desde `/superadmin` |
| `RESEND_API_KEY` · `EMAIL_FROM` | Envío de email (presupuestos) |

---

## Tests

```bash
npx tsc --noEmit     # tipos
npx vitest run       # unitarios (helpers puros + motor del odontograma)
npm run test:rules   # Security Rules contra el emulador de Firestore
```

**`test:rules` necesita Java** (lo usa el emulador). En macOS con Homebrew:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules
```

Estos tests son la red de seguridad más importante del proyecto: **las reglas son la
única frontera de autorización real** (ver `ARCHITECTURE.md` §4). Cubren aislamiento
entre clínicas, RBAC por rol, cobro y planes.

**Antes de mergear a `main`:**
```bash
npx tsc --noEmit && npx vitest run && npm run build
```

---

## Estructura

```
app/
  app/…            dashboard (23 páginas, requiere sesión)
  api/…            rutas de servidor: ia/ · webhooks/ · reservas · firmar · pago …
  reservar/ firmar/ pagar/ encuestas/ videoconsulta/   páginas PÚBLICAS sin login
  login/ superadmin/
components/        34 componentes · odontogram-engine/ = motor vendorizado (MIT)
lib/               store.tsx (estado global) · types.ts (modelo) · helpers puros
  server/          auth · firestore-rest (usuario de servicio) · rate-limit
firestore.rules    ⚠️ la frontera de seguridad real
test/              tests de reglas (node:test + emulador)
```

---

## Tareas comunes

### Agregar una colección nueva
El orden importa — si te salteás el último paso, **las clínicas reales no guardan y la
demo sí**, lo que enmascara el fallo:

1. `lib/types.ts` — el tipo + sumarlo a la interfaz `DB`
2. `lib/store.tsx` — `col("<nombre>")` en el `Promise.all` de `loadFirestore` + acciones
   `add/update/delete` (molde: `addRadiograph`)
3. `lib/seed.ts` — default `[]`
4. **`firestore.rules`** — el bloque `match`. Sin esto queda **denegado por default-deny**
5. **`firebase deploy --only firestore:rules`** ← manual, no lo hace el deploy de Vercel

### Agregar una ruta de IA
Molde: `app/api/ia/perio-voz/route.ts` — `verifyIdToken` + `rateLimit` (por uid **y** por
IP) + la key solo del lado servidor. Para visión usar `responseMimeType: "application/json"`
con un parser tolerante: si no, el modelo devuelve prosa y rompe el JSON.

### Validadores clínicos y de negocio
Van como **funciones puras con TDD** (`lib/radiografia.ts`, `lib/firma.ts`,
`lib/subscription.ts`…). Nunca deben corromper la ficha ante una respuesta basura del
modelo.

---

## Despliegue

- **Push a `main` → Vercel despliega solo.**
- **Las reglas de Firestore NO.** Son un paso manual:
  ```bash
  firebase deploy --only firestore:rules
  ```
- Las envs se cargan en el panel de Vercel.

> **Credenciales de git:** la cuenta `gh` activa puede no tener acceso al repo. Ver
> `CLAUDE.md` para el procedimiento de push.
