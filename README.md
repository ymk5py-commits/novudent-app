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

Para probar sin cuenta: **`/login?demo=1` → "Ver demo" → elegí un usuario**. Desde el 11/8 la
pestaña de demo no aparece en `/login` a secas (el acceso público es el pedido de acceso); sigue
viva con `?demo=1` para mostrarla en ventas. La clínica demo (`cl_demo`) se auto-siembra con
datos de ejemplo.

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

### Correo al paciente (Resend)
| Variable | Habilita |
|---|---|
| `RESEND_API_KEY` · `EMAIL_FROM` | «Enviar al correo» y «Notificar por mail» de la agenda (`/api/notificaciones/cita`), las mismas que usa `/api/email`. El remitente lleva un dominio verificado en Resend: `Clínica <avisos@tu-dominio>`. **Solo del lado del servidor** |

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

### Soporte de Novum (botón «Ayuda» de la barra superior)
Son **públicas**: Next.js las incrusta en el bundle al compilar, así que las ve cualquiera
que abra la app (nunca un secreto acá) y cambiarlas pide un nuevo deploy. El panel muestra
solo los canales bien cargados; sin WhatsApp ni correo dice que el canal de soporte
todavía no está configurado. Se leen en `lib/soporte.ts`.

| Variable | Habilita |
|---|---|
| `NEXT_PUBLIC_SOPORTE_WHATSAPP` | Botón «Escribir por WhatsApp» (`wa.me`, con un mensaje que ya dice la clínica y el usuario). Número con código de país, p. ej. `595981123456`; se aceptan `+`, espacios y guiones. Si no es un número (de 8 a 15 dígitos), no se muestra |
| `NEXT_PUBLIC_SOPORTE_EMAIL` | Botón «Escribir un correo» (`mailto:` con asunto y cuerpo prearmados) |
| `NEXT_PUBLIC_SOPORTE_HORARIO` | Texto libre del horario de atención, p. ej. `Lunes a viernes de 8:00 a 18:00`. Solo no alcanza: hace falta WhatsApp o correo |

---

## Tests

```bash
npx tsc --noEmit     # tipos
npx vitest run       # unitarios (helpers puros + motor del odontograma)
npm run test:rules   # Security Rules contra el emulador de Firestore
npm run build && npm run test:e2e   # E2E con Playwright (escritorio + celular)
```

### E2E (`e2e/`, Playwright)

Corren contra la app **compilada** (`next start`, como en producción) y **cortan la red hacia
Firebase** en cada prueba: la app trabaja con su fallback de `localStorage` y la demo sembrada. Son
deterministas, no necesitan credenciales y **nunca tocan la base de producción ni su cuota**. Cada
prueba falla si el navegador registra una excepción o un `console.error` real.

| Archivo | Qué cubre |
|---|---|
| `landing.spec.ts` | hero, SEO, odontograma interactivo, precios, preguntas, formulario (con `/api/contacto` interceptado: no se manda nada real) |
| `paginas-publicas.spec.ts` | páginas de venta, 404, `robots.txt`, `sitemap.xml` |
| `acceso.spec.ts` | login, demo por `?demo=1`, redirección sin sesión, logout que borra el caché de pacientes |
| `app-paginas.spec.ts` | las 23 pantallas de la app cargan sin errores |
| `flujos.spec.ts` | dar una cita, alta de paciente, presentar/aceptar presupuesto, registrar pago, cierre de caja, pestañas de la ficha |
| `roles.spec.ts` | matriz RBAC: qué ve y qué no el dentista y la asistente |
| `planes.spec.ts` | gating del plan Solo y el cambio de contraseña obligatorio |
| `chat.spec.ts` | chat interno: elegir a una persona y mandarle un directo, que otra persona no lo vea, y la difusión del admin (le llega a cada uno sin ver a quién más) |
| `ayuda.spec.ts` | el botón «Ayuda» avisa que el canal de soporte no está configurado (la compilación de prueba no trae las `NEXT_PUBLIC_SOPORTE_*`) |
| `publicas-con-token.spec.ts` | reservar, firmar, pagar, encuestas, videoconsulta con tokens inválidos |
| `api.spec.ts` | rutas del servidor sin credenciales: validaciones, trampa para bots, límite de 5/h, mensajes sin trazas |
| `visual.spec.ts` | `@visual`: capturas de referencia de la landing y el login (no corren en la CI) |

```bash
npx playwright test --project=celular      # un solo proyecto
npx playwright test --grep @visual         # solo las capturas
npx playwright test --grep @visual --update-snapshots   # aceptar un cambio visual buscado
npx playwright show-report                 # reporte con trazas y capturas de lo que falló
```

Las pruebas marcadas `test.fixme` documentan bugs conocidos: pasan a correr cuando se arreglan.

**`test:rules` necesita Java** (lo usa el emulador). En macOS con Homebrew:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH" && npm run test:rules
```

Estos tests son la red de seguridad más importante del proyecto: **las reglas son la
única frontera de autorización real** (ver `ARCHITECTURE.md` §4). Cubren aislamiento
entre clínicas, RBAC por rol, cobro y planes.

**Antes de mergear a `main`** (la CI de GitHub corre lo mismo en cada PR):
```bash
npx tsc --noEmit && npx vitest run && npm run build && npm run test:e2e
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
e2e/               E2E con Playwright (ver «Tests»)
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
