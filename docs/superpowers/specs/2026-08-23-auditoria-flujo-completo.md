# Auditoría del flujo completo — Novudent (23-ago-2026)

Cinco frentes en paralelo sobre el código, más pruebas contra **producción** y
contra el emulador de reglas. Lo que sigue está ordenado por plata y por riesgo,
no por dónde vive el código.

- **Frentes:** sesión/identidad · escalada de privilegios · superficie pública ·
  aislamiento multi-clínica · cobro y suscripciones.
- **Suites al terminar:** 401 vitest + 88 reglas, todo en verde.
- **Reglas publicadas** en el proyecto real (versión de las 12:00 del 23-ago).
- **Dato que cambia el cálculo:** el proyecto ya está en **Blaze**. Todo lo que
  quema Gemini es factura, no cuota gratis.

---

## 1. Corregido y desplegado

### 1.1 · CRÍTICO — El estado de la suscripción salía del nombre del evento
`lib/lemonsqueezy.ts`

Lemon Squeezy dispara `subscription_updated` en **todos** los cambios del ciclo
de vida —cancelación e impago incluidos— y no garantiza el orden de entrega. El
código lo mapeaba a `"active"` sin mirar `data.attributes.status`.

Consecuencia: el corte a solo-lectura era una carrera, no una política. La
clínica cancelaba, llegaba `subscription_cancelled` (cortaba bien) y el
`subscription_updated` del mismo cambio la reactivaba. Una clínica en `past_due`
seguía escribiendo las ~2 semanas de reintentos de cobro.

**Ahora:** el estado sale de `attributes.status`; el evento solo decide *si* se
procesa. Un `subscription_updated` sin status utilizable no aplica nada (antes
caía a "active", el peor default posible). Además se descartan payloads rancios
comparando `attributes.updated_at` contra el guardado.

### 1.2 · CRÍTICO — Un pago cobrado que nunca se aplicaba
`app/api/webhooks/lemonsqueezy/route.ts`

La marca de idempotencia se creaba **antes** de escribir la suscripción. Si esa
escritura fallaba (Firestore transitorio, token del usuario de servicio, red), la
ruta devolvía 500 para que LS reintentara — pero el reintento entraba por
`duplicate` y la suscripción no se escribía nunca. Sin alerta, sin pendiente.

El cliente pagaba y se quedaba sin plan. En una **renovación** era peor: el
`currentPeriodEndMs` no avanzaba y la clínica al día caía a solo-lectura.

**Ahora:** idempotencia en dos tiempos. La marca nace `pendiente` y solo pasa a
`aplicado` después de escribir. Un reintento sobre `pendiente` no es un
duplicado: es la prueba de que el intento anterior murió a mitad, y se reaplica.

### 1.3 · CRÍTICO — Suscripción activa que no podía vencer
`lib/lemonsqueezy.ts` + `app/api/webhooks/lemonsqueezy/route.ts`

`setDocument` es un PATCH sin `updateMask`: reemplaza el doc entero. Si el
payload no traía `renews_at`, el `currentPeriodEndMs` guardado se **borraba**. Y
una suscripción `active` sin fecha no vence ni para `isSubscriptionActive()` ni
para `subActive()` en las reglas: producto gratis para siempre.

**Ahora:** se usa `ends_at ?? renews_at`, y si no hay ninguna fecha utilizable se
conserva la anterior.

### 1.4 · ALTO — Las 8 rutas de IA no miraban plan ni suscripción
`app/api/ia/*` · nuevo `lib/server/require-feature.ts`

`verifyIdToken` responde una sola pregunta: "¿este token es de una cuenta real
del proyecto?". No dice a qué clínica pertenece, si sigue activa, ni qué plan
pagó. Y como el registro por email está abierto, esa cuenta real la consigue
cualquiera en treinta segundos.

Resultado: un cliente de $45 usaba por curl toda la suite de IA que justifica los
$129; una clínica cancelada seguía quemando `gemini-2.5-pro` con imágenes de 8 MB
contra la key del dueño. El rate limit (20/min por uid) acotaba el ritmo, no el
derecho. **En Blaze eso es factura real.**

**Ahora:** `requireFeature(uid, feature)` exige membresía activa + suscripción
vigente + plan que incluya la función, **antes** de tocar Gemini. Falla cerrado:
si no se puede verificar la membresía, no se gasta.

### 1.5 · ALTO — Secuestro de login vía la demo
`lib/store.tsx`

`loginWithEmail` resolvía al usuario así:

```js
db.users.find(x => x.authUid === uid) ??
db.users.find(x => x.email.toLowerCase() === email.toLowerCase());
```

El `db` en la pantalla de ingreso es **siempre** el de la demo (el logout borra
`DB_KEY` y `resolveClinicId` cae a `cl_demo`), y la demo se escribe sin
autenticar. O sea: cualquiera plantaba un usuario en `clinics/cl_demo/users/*`
con el email de un admin real. Ese admin ponía su contraseña **de verdad**,
Firebase la validaba, el match por email lo metía en la demo con el rol que el
atacante hubiera escrito, y el bloque del directorio —el que resuelve la clínica
posta— se salteaba entero. Quedaba pegado ahí, porque la sesión persiste, y todo
lo que cargara iba a una clínica que se lee desde internet sin credenciales.

**Ahora:** la identidad sale del uid y del directorio. El match por email vive
dentro del bloque del directorio, acotado a la clínica que este indica.

### 1.6 · ALTO — El checkout no repetía el RBAC de la pantalla
`app/api/suscripcion/checkout/route.ts`

La pantalla exige rol Administrador; la ruta resolvía la clínica solo por
`directory/{uid}` y emitía el token, sin mirar rol ni `active`. Y
`directory/{uid}` **no se borra al dar de baja a un empleado**.

Con ese token, un asistente o un ex-empleado podía pagar el plan más barato: si
la clínica estaba en el trial del alta contaba como primera compra, la degradaba
a Solo y ataba la suscripción a la cuenta de Lemon Squeezy del atacante — que
después la cancelaba desde el portal y la dejaba en solo-lectura. El ataque de
los $45 que el token cerró para desconocidos, reabierto para cualquiera que
alguna vez tuvo login ahí.

**Ahora:** lee `clinics/{cid}/users/{uid}` y exige `active !== false` y
`role === "admin"`.

### 1.7 · ALTO — El alta que fallaba a mitad dejaba una clínica gratis para siempre
`app/api/clinicas/route.ts`

La suscripción de prueba se escribía **última**, después de ~6 writes sin
transacción. Si fallaba cualquiera de las de abajo quedaba una clínica operativa
**sin** doc de suscripción — que es exactamente el estado del grandfathering:
escritura ilimitada, sin trial que venza, sin banner y sin corte. Encima el
reintento del dueño chocaba contra `existingDir` y devolvía 409, así que el hueco
no se cerraba nunca y nada avisaba.

El comentario justificaba el orden ("para no dejar una suscripción apuntando a
una clínica a medio crear"), pero el razonamiento estaba al revés del riesgo: una
suscripción huérfana no habilita nada.

**Ahora:** va pegada al doc de clínica. Un fallo deja una clínica huérfana e
**inusable** (sin usuarios ni directorio, nadie puede entrar) y el reintento pasa
limpio.

### 1.8 · ALTO — El permiso de cobro estaba invertido
`components/RecibirPago.tsx`

El gate era `can(role,"billing.reports") || can(role,"emr.write")` en vez de
`can(role,"payments.manage")`. Efecto en el uso diario: **el dentista veía el
formulario de cobro y le fallaba; la recepción, que es quien cobra, no lo veía.**
No es solo seguridad: era una función rota en producción.

### 1.9 · ALTO — Reembolsos y pausas de Lemon Squeezy se ignoraban
`lib/lemonsqueezy.ts`

`subscription_payment_refunded` y `subscription_paused` no estaban mapeados. El
cliente pagaba, usaba el mes, pedía el reembolso (LS es Merchant of Record y lo
concede), recuperaba la plata **y el plan seguía activo**. Nótese la asimetría:
`subscription_unpaused` sí estaba mapeado a `active` — se manejaba el volver pero
no el irse. También faltaba `subscription_payment_recovered`, así que la clínica
que regularizaba quedaba cortada.

### 1.10 · Reglas de Firestore endurecidas

| Colección | Antes | Ahora |
|---|---|---|
| `outbox` | `canWrite` (cualquier miembro) | `canWritePremium(['clinica','cadena'])` |
| `cashSessions` | `canWrite` | `isStaff` + suscripción + plan Clínica+ |
| `patients` (create) | cualquier miembro, sin filtro de campos clínicos | rol clínico, o sin campos clínicos |
| `patients` (delete) | cualquier miembro | solo admin |
| `radiographs` | solo plan | + rol clínico |
| `signatures` | cualquier miembro escribe **y borra** | `isStaff` crea; **nadie borra** |
| `fiscalDocs` | cualquier miembro | `isStaff` emite, admin borra |
| `procedures` (precios) | cualquier miembro | solo admin |
| `directory` (create) | admin de cualquier clínica, demo incluida | la demo ya no es destino válido |

El agujero de `patients` merecía nombre propio: el blindaje de campos clínicos
solo corría en `update`, así que la cadena **leer → borrar → recrear** dejaba a la
recepción reescribir odontograma, evoluciones y recetas conservando la demografía
—o sea, indistinguible de un guardado legítimo.

### 1.11 · MEDIO — `cl_demo` ahora es un id reservado
`app/api/clinicas/route.ts`

`isDemo(cid)` es `cid == 'cl_demo'` y no pide sesión. El único anti-colisión era
mirar si el doc existía; si alguna vez no estuviera, la próxima clínica llamada
"Demo" nacía como `cl_demo` y su historia clínica quedaba pública para siempre.

### 1.12 · MEDIO — El rol ya no sale de localStorage
`lib/store.tsx`

Al restaurar la sesión se verificaba el uid contra Firebase, pero `role`,
`clinicId` y `name` seguían saliendo del JSON de localStorage — editable desde la
consola del navegador. Un asistente con credenciales legítimas se ponía
`"role":"admin"` y se abría toda la interfaz de administración: recaudación,
sueldos y comisiones, que se calculan en el cliente.

Las reglas igual le frenaban las **escrituras** de admin, así que no era vía para
corromper datos; era vía para **ver** lo que no le toca. Ahora el rol se
re-deriva del doc de usuario apenas carga la base, y si al usuario lo dieron de
baja la sesión se cierra sola.

---

## 2. Verificado contra producción

| Prueba | Resultado |
|---|---|
| Lectura de una clínica real sin autenticar | **403** |
| Pacientes de una clínica real sin autenticar | **403** |
| `serviceAccounts`, `checkoutTokens`, `directory` | **403** |
| Suscripción de una clínica real | **403** |
| Escritura en una clínica real sin autenticar | **403** |
| Demo (`cl_demo`) lectura y escritura | **200** — sigue funcionando |
| Rutas `/api/ia/*` sin token | **401** |
| App y `/login` | **200** |

También quedó fijado en el emulador (88 tests): 32 colecciones × read/write/
delete/**list** desde otra clínica, todo denegado, con control positivo para
descartar que el deny viniera del cobro o del plan. `collectionGroup` sobre
`patients`/`users`/`signatures`/`payments`: denegado. Una cuenta recién
registrada sin clínica no lee nada y **no puede auto-inscribirse**.

---

## 3. Lo que queda abierto

### 3.1 · La demo se escribe sin autenticar — decisión pendiente
`firestore.rules` — `isDemo(cid)` no llama a `isSignedIn()`.

`clinics/cl_demo/**` es legible y escribible desde internet sin credenciales. Es
**a propósito**: es lo que hace que la demo de ventas funcione sin cuenta, y hoy
la autenticación anónima está desactivada, así que exigir sesión la rompería.

Ya no se puede usar para secuestrar un login (1.5) ni para rutear cuentas ajenas
(1.10). Lo que queda: alguien puede vandalizarla, y puede **quemar cuota del
mismo proyecto** que usan las clínicas reales. En Blaze eso es factura.

Tres salidas, de mejor a peor:

1. **Una cuenta de demo dedicada** (`demo@novudent.app`) con contraseña en el
   bundle, y `isDemo` exigiendo `isSignedIn()`. Una cuenta en vez de 213
   anónimas, y la contraseña se puede rotar si abusan. Requiere que vos o Carlos
   creen esa cuenta — yo no creo cuentas.
2. Reactivar la autenticación anónima y llamarla **solo** en el camino de la
   demo (ya no se dispara sola: eso era el bug de `ensureAuth`).
3. Dejarlo como está y monitorear el gasto.

**Recomiendo la 1.** Es un paso manual de un minuto y cierra el tema.

### 3.2 · Pendientes de Carlos (no son código)

- Cargar en Vercel `LEMONSQUEEZY_WEBHOOK_SECRET` y `LS_VARIANT_*`. **Los dos
  críticos de cobro estaban dormidos porque estas envs faltan; ahora que están
  arreglados, cargarlas es seguro.** Antes no lo era.
- Verificar el payout de Lemon Squeezy hacia Paraguay.

### 3.3 · Backlog técnico, por prioridad

| # | Qué | Dónde | Por qué importa |
|---|---|---|---|
| 1 | `logout` no corta los `onSnapshot` | `lib/store.tsx` | el padrón se reescribe a localStorage después de cerrar sesión |
| 2 | `directory/{uid}` no se borra al dar de baja | `lib/store.tsx` | mitigado (checkout y `requireFeature` chequean `active`), pero la entrada sobrevive |
| 3 | `billing` no distingue submit de finalize | `firestore.rules` | exige partir la regla por campo; hay que fijar antes los estados válidos |
| 4 | `boxes`/`branches`/`surveys`/`eduVideos` sin gate de admin | `firestore.rules` | pantallas admin-only en la UI, abiertas por SDK |
| 5 | `commissionPct`/`salaryBase` legibles por todo miembro | `firestore.rules` | sueldos visibles para la recepción |
| 6 | El campo `clinicId` de adentro del doc no se valida | `firestore.rules` | el path aísla igual; lo que rompe es que la sesión declare una clínica distinta de donde escribe, y eso sale por el `outbox` hacia Botika |
| 7 | `/api/firmar`: la clave del rate limit incluye el token del atacante y escanea 500 docs | `app/api/firmar` | costo por request, evadible rotando el token |
| 8 | `/api/reservas` POST puede relayar WhatsApp por el outbox | `app/api/reservas` | mensajes a costa del dueño |
| 9 | `checkoutTokens` se acumulan sin límite | `app/api/suscripcion/checkout` | acotado: ahora solo los emite un admin, 10/min. **No** ponerles TTL: LS reenvía el mismo token en cada renovación |
| 10 | El alta por email está abierta | Firebase Auth | mitigado: sin clínica no se lee nada, no hay bootstrap de membresía y la IA ya está cerrada |

---

## 4. Lo que se probó y aguantó

Para no volver a auditarlo:

- La frontera entre clínicas: 32 colecciones × 4 operaciones, sin una sola fuga.
- El path traversal del usuario de servicio: cerrado en `encodePath` por
  segmento + `isValidId` en las rutas públicas. Las 6 variantes dan 400.
- La enumeración de emails: `INVALID_LOGIN_CREDENTIALS` para existentes e
  inexistentes por igual.
- El registro anónimo: `ADMIN_ONLY_OPERATION`.
- `serviceAccounts` cerrada → `isService()` no es forjable desde el cliente.
- `clinics/{cid}.plan` no es auto-ascendible; el trial no se estira ni se
  renueva solo, y la clínica no puede borrar su suscripción para volver al
  grandfathering.
- El open-redirect del checkout: `buildCheckoutUrl` exige `https:` y la base sale
  de env, no del cliente.
- `OWNER_PANEL_KEY` se compara con `timingSafeEqual` y antes de revelar el estado
  de configuración.
- Ninguna colección quedó sin regla: las 31 del store tienen `match`, así que no
  hay clínica real guardando en silencio contra un default-deny.
- `cl_clinica-demo` es una clínica **real** y no cae en `isDemo`: hay un test que
  frena a quien cambie la igualdad exacta por un `startsWith`.
