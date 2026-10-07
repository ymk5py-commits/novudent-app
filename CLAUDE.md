# Novudent — notas de ingeniería

SaaS de gestión para clínicas dentales (LATAM, español rioplatense). La clínica
real de referencia es **Aura Esthetic Center** (hoy en Dentalink — el norte es
**reemplazar a Dentalink sin perder nada**).

Stack: **Next.js 14 App Router + TypeScript**, **Firestore** (Web SDK, el navegador
escribe Firestore DIRECTO con Firebase Auth), **Gemini** (IA: voz, visión, texto),
**vitest**, Tailwind, Recharts, framer-motion. Deploya a **novudent-app.vercel.app**
desde `main`.

## Reglas duras

- **Firestore sin Admin SDK** (proyecto Spark, sin org GCP → no hay service-account
  keys). El cliente escribe Firestore directo (reglas de seguridad = la defensa). Las
  rutas server que necesitan escribir (p.ej. `/api/reservas`, `/api/firmar`) usan un
  **usuario de servicio** (`lib/server/firestore-rest.ts`: signInWithPassword con
  `SERVICE_USER_EMAIL/PASSWORD` + `FIREBASE_WEB_API_KEY`) — cubierto en reglas por
  `isService()` (existe `serviceAccounts/{uid}`).
- **Imágenes = base64 en Firestore** (no hay Firebase Storage). Redimensionar en
  cliente antes de guardar (`lib/image.ts` `resizeToDataUrl`) — cada doc < 1 MB.
- **Multi-tenant:** todo vive en `clinics/{cid}/<colección>`. El store escribe vía
  `fsSave(col,id,data)`/`fsDelete` contra `clinicIdRef.current` (NO la global mutable
  `CLINIC_ID`). Nunca escribir datos de una clínica en otra.
- **Nunca** exponer la key de Gemini ni tokens en el cliente o en logs.
- LGPD (Brasil) / Ley 1581 (Colombia): retención de PII importa; el consentimiento y
  las radiografías son datos sensibles (member-scoped + retención).

## Patrones (seguir al agregar features)

- **Colección nueva por clínica:** sumar `col("<nombre>")` al `Promise.all` de
  `loadFirestore()` + al `DB`; default `[]` en `lib/seed.ts`; acciones
  `add/update/delete` en el store (molde `addRadiograph`). **Y agregar la regla** en
  `firestore.rules`: `match /<col>/{id} { allow read, write: if isMember(cid) ||
  isService() || isDemo(cid); }` — si te olvidás, las clínicas reales no guardan
  (default-deny; el demo `cl_demo` sí anda por `isDemo`).
- **Rutas IA:** molde `app/api/ia/perio-voz/route.ts` (auth `verifyIdToken` +
  `rateLimit` + Gemini). Para visión usar `responseMimeType: "application/json"` +
  un parser tolerante (si no, Gemini devuelve prosa y rompe el JSON). Default de
  modelo de visión: `gemini-2.5-pro`.
- **Validadores clínicos = puros + TDD** (`lib/radiografia.ts`, `lib/firma.ts`,
  `lib/perio-voice.ts`): nunca corrompen la ficha ante basura del modelo.
- **RBAC:** `can(session.role, "<perm>")` (`lib/rbac.ts`). EMR (clínico) = dentista/
  admin; formularios/consentimientos/administrativo = `engagement.forms` (admin/
  asistente); financiero = `billing.reports`; config = `practice.config`.
- **Planes:** `PlanFeature` en `lib/plan.ts` + `useClinicPlan()` + `<PlanLocked
  feature=…/>`. Solo / Clínica / Cadena. Features premium (radiografia_ia,
  firma_electronica, laboratorios, liquidaciones, boxes) = Clínica+Cadena; `crm` =
  Cadena.
- **Motion:** `components/motion.tsx` (`Reveal`/`Stagger`/`StaggerItem`/
  `PageTransition`, respeta `prefers-reduced-motion`). Envolver secciones en `Reveal`.
- **Ficha del paciente** (`app/app/pacientes/[id]/page.tsx`): cabecera estilo
  Dentalink (banda navy + foto subible + badges médicos). Tabs incluyen Radiografías
  y Consentimientos.

## Git / credenciales (IMPORTANTE)

Repo: **`github.com/ymk5py-commits/novudent-app`** (público). La cuenta `gh` activa
(`croman-coder`) **NO tiene acceso**. En la notebook de Croman (`croman-srpy`) hay una
**deploy key con escritura solo en este repo** (`~/.ssh/id_ymk5py`, alias SSH `github-ymk5py`,
agregada el 4-oct-2026) y el remote ya tiene el push apuntando ahí
(`git remote set-url --push origin git@github-ymk5py:ymk5py-commits/novudent-app.git`):
**`git push origin main` anda directo**, sin cambiar de cuenta. El fetch sigue por HTTPS.
En otra máquina sin esa llave:
```
gh auth switch --user ymk5py-commits && git push origin main && gh auth switch --user croman-coder
```
Los deploys se verifican con el conector de Vercel (equipo `croman-mvp-s-projects`, proyecto
`novudent-app`); no hace falta la CLI.
Los commits ya quedan firmados como `ymk5py`. Trabajar en rama feature → merge a
`main` (auto-deploy). Correr `npx tsc --noEmit && npx vitest run && npm run build`
antes de mergear.

## Pasos manuales de prod (Carlos)

- `firebase deploy --only firestore:rules` cada vez que se agrega una colección
  (cubre recoveryMonitors, radiographs, signatures, crmCards, campaigns, labOrders,
  settlements, boxes, **clinicalDocs**, **routineChecks**…).
- Envs en Vercel: `GEMINI_API_KEY`, `FIREBASE_WEB_API_KEY`, `SERVICE_USER_EMAIL/
  PASSWORD`, `OWNER_PANEL_KEY`.

## Demo

`cl_demo` (plan Clínica). Login: `/login` → "Ver demo" → si está vacío "Restaurar
datos de demo" (`seedDemo`) → clic en un usuario (Administrador/Dentista/Asistente).

## Estado: paridad Dentalink (ver docs/superpowers/ + memorias)

SHIPPED previo: motion/scroll · **Radiografía IA** · **Firma electrónica** · **4 módulos**
(CRM/Labs/Liquidaciones/Box) · **nav estilo Dentalink**.

**Clon completo de Dentalink (jun-2026, en prod):** ficha de paciente de **2 niveles**
(5 grupos) · **Plan de tratamiento** 2 columnas (panel financiero + Ortodoncia 5 sub-tabs +
**prestaciones por sección** con Dscto/Pago + comentarios para el paciente + citas del plan,
vista LISTA En ejecución/Otros con estado financiero) · **Historial timeline** unificado
(`lib/historial.ts`) · **Datos personales** completo (Sexo/Género, Ciudad/Municipio, +11
campos) + sub-tabs **Citas/Comentarios/Tareas/Emails** (colección `patientNotes`) ·
**Facturación** del paciente (Pagos / Documentos emitidos / Devoluciones / Pagos eliminados /
Balance; colección `fiscalDocs` + soft-delete `Payment.voidedAt`) · **Recibir pago** multi-plan
+ **cuotas de financiamiento** (`lib/financiamiento.ts`) · sección **Pacientes** (tabla
Tratamientos/Deudas + sub-tabs **Análisis & Conversión** / **Pacientes de Ortodoncia** /
**Configuración de campos**). Helpers puros TDD: `conversion`/`categorias`/`ortho`/`budgets`/
`financiamiento`/`historial`. Charts: `FunnelChart`/`ConversionLineChart`/`StatusDonutChart`.

**⚠️ Tras cada deploy con colección nueva: `firebase deploy --only firestore:rules`** — las
nuevas son **`patientNotes`** y **`fiscalDocs`** (hasta entonces las clínicas reales no guardan
notas/boletas; el demo sí por `isDemo`). **Único pendiente real:** link de pago con pasarela
(fuera de alcance sin gateway). Plan maestro y audit en
`docs/superpowers/specs/2026-06-20-dentalink-paridad-plan-maestro-v2.md`.

**Identidad Dentalink (oct-2026):** el panel copia la **tipografía y la forma** de Dentalink
(Open Sans 14px, esquinas 4px, pestañas subrayadas, tablas densas) y **mantiene los colores
de Novudent**. Relevamiento en `docs/dentalink/05-videos-identidad-y-funciones.md`, con la
lista de funciones que faltan. **Estados de cita configurables** (`lib/estadosCita.ts`):
`Appointment.status` sigue siendo el comportamiento base (7 valores, los usa toda la lógica)
y `Appointment.estadoId` apunta al estado configurable de `Clinic.config.estadosCita`
(Configuración › Estados de cita). Para pintar una cita usar `estadoDeCita()` /
`useEstadosCita()`, nunca `ESTADO_LABEL[status]` directo.

**Pagos y financiamiento (oct-2026):** «Ingresar un pago» en 3 pasos (`lib/pago.ts`): cada
cruce plan × medio es un `Payment` y todos comparten `receiptNumber` (= el comprobante).
Opciones del plan (`OpcionesPlan`): el financiamiento guarda `Budget.financiamiento` y su
`interes` **se suma en `budgetTotal`** sin descuento. Para mostrar el descuento usar
`budgetDescuento(b)`, nunca `subtotal − total`; las cuotas se leen con `cuotasDe(b, payments)`
(descuenta lo pagado antes de generarlas). Fechas: `fmtDate` lee las YYYY-MM-DD en hora local
(`parseFecha`); para «hoy» usar `fechaLocal()`, no `toISOString().slice(0, 10)`.

**Reportes gráficos (oct-2026):** `lib/reportes.ts` (puro, con tests) + `ReportesGraficos`
(Reportes › «Reportes gráficos»). Los meses se agrupan en hora local (`mesLocal`); «ventas» =
prestaciones realizadas con el descuento del plan (`realizadas()`). Permisos: alcanzan los 5
roles (decisión del cliente, 4-oct-2026); no hay permisos por usuario.

**Confirmación de cita por link (oct-2026):** `Appointment.confirmToken` es la credencial del
link público `/confirmar/{cid}/{token}` (patrón de `/firmar`: `/api/citas/confirmar` escribe con
el usuario de servicio, 404 genérico, rate limit). La respuesta del paciente setea `status` +
`estadoId` (confirmado_whatsapp/email, anulado_paciente). `estadoDeCita` solo respeta `estadoId`
si su `base` coincide con el `status`: cambiar el `status` por otro camino nunca deja un
estado viejo pintado.

**Documentos clínicos (oct-2026):** Ficha clínica › **Documentos ▾** (Consentimientos + Documentos
clínicos, como Dentalink). Colección `clinicalDocs` (no va dentro del doc del paciente: ya lleva
foto y EMR): `DocumentoClinico` guarda una **copia** de su plantilla, así editarla después no cambia
lo ya hecho. Las plantillas viven en `Clinic.config.plantillasDocumento`; sin nada guardado,
`plantillasDeClinica()` devuelve las de fábrica (`lib/plantillasDocumento.ts`: la Historia Clínica de
Aura y tres textos «por revisar»). Lógica pura y con tests en `lib/documentosClinicos.ts`. Reglas:
**un documento clínico no se borra, se anula**; `puedeEditarDocumentos` (admin, caja, recepción y
dentista) es el espejo de la regla `clinicalDocs` de `firestore.rules` y hay un test que lo ata a la
matriz de roles. **Todo conteo de pendientes sale de `pendientesPorPaciente()`** (documentos nuevos +
los `Patient.forms` viejos): campana, Inicio, buscador y cabecera de la ficha. El alta de paciente
usa `crearPaciente()` del store, que deja la Historia Clínica pendiente. **La campana** (`CampanaPendientes`)
abre un panel con cada paciente pendiente y su link directo: lo arma `listaPendientes()` (`lib/pendientes.ts`);
los filtros por link son `/app/pacientes?pendientes=documentos` y `/app/facturacion?filtro=en-retencion`
(se leen en un efecto, no con `useSearchParams`).

**Mi agenda (oct-2026):** tarjeta en **Inicio** (`components/agenda/MiAgenda`, la ven los 5 roles) con lo que le
toca a quien entró, hoy o esta semana. **No hay una segunda lista de tareas**: las propias son `MgmtTask` tipo
`personalizada` (las mismas de la bandeja `/app/tareas` y de la ficha); se tildan con `gestionar(fila, "cerrar")` y se
destildan con `reabrir` (`reabrirTarea`). Lógica pura y con tests: `lib/miAgenda.ts` (`esMia`, `itemsDeTareas`,
`rutinaDeHoy`, `armarAgenda`), `lib/tareasAuto.ts` y `lib/agendaIA.ts`. Una propia es mía si la creé y no la delegué o si
me la asignaron; las automáticas de la bandeja solo aparecen si me las asignaron y son de solo lectura (cada cierre de una
derivada significa algo —aceptó, rechazó— que acá no se elige). **La rutina del día** (confirmar las citas de mañana,
reservas online, documentos pendientes, cerrar la caja, stock bajo) no se guarda: se calcula en cada lectura con los
mismos permisos y planes que Inicio, así que se tacha sola. **`MgmtTask.autoCierre`** («se tacha sola cuando el paciente
agende / acepte el presupuesto / pague», solo con paciente) también se DERIVA al leer: `tareasCumplidas` →
`filasDeTareas(…, cumplidas)` la muestra «completada por el sistema» (en la bandeja y en los reportes); si el pago se anula
o la cita se cancela, la tarea vuelve a pendiente. **IA** (plan `ia`): `/api/ia/agenda-semana` (dictar la semana, por voz o
texto) devuelve PROPUESTAS que se revisan antes de guardar, y el nombre del paciente se empareja en el navegador
(`emparejarPaciente`): ningún nombre de paciente viaja a Gemini. `/api/ia/agenda-resumen` recibe solo conteos
(`resumenSemanaDatos`, sin nombres ni textos de tareas) y los montos solo si el rol tiene `billing.reports` (el servidor lo
vuelve a controlar). **En la demo pública (`cl_demo`, sesión anónima de Firebase) TODAS las rutas de IA contestan 403**
(«Tu cuenta no está asignada a ninguna clínica»): `requireFeature` pide ser miembro de una clínica y el
usuario anónimo no tiene `directory/{uid}`; es el cierre de la auditoría del 23-ago y a propósito, porque
cada uso cuesta. Mi agenda lo explica con `mensajeErrorIA`; para probar la IA de punta a punta hace falta una
clínica real con el plan Clínica. **Al sumar una ruta en `app/api/ia/` hay que agregarla a la lista exacta de
`ia-gating.exploits.test.ts`** (hoy son 10) y poner `requireFeature` antes de `generativelanguage`.

**Rutina del administrador (oct-2026):** tarjeta en **Inicio** solo para el administrador (`practice.config`;
`components/RutinaAdmin`), debajo de los números y arriba de Mi agenda. Es lo que revisa cada día (cierre de caja, lo cobrado,
pacientes que deben, los que deben implantes, reclamos en retención, cheques), cada lunes (el desempeño de la semana) y a fin de
mes (liquidar y cargar gastos: se ven desde el 25 hasta el 5 del mes siguiente). **Es una rutina fija**, la define Novum
(`PASOS_RUTINA`), no se edita por clínica. A diferencia de la rutina de Mi agenda (que se tacha sola), acá lo que se tilda es una
**revisión**: se guarda en la colección `routineChecks` (un documento por casillero y período, id determinístico
`${paso}__${periodo}`: el día, el lunes de la semana o el mes; tildar = `setRutinaCheck(paso, periodo, true)`, destildar =
borrar el documento) y se reinicia sola porque el período cambia. Cada renglón muestra el dato en vivo (`detalle`) y pide atención
(`atencion`) cuando hay algo que mirar (caja abierta o con diferencia, cheques para cobrar, deudas de más de 60 días,
retenciones). Lógica pura y con tests en `lib/rutinaAdmin.ts` (`pasosDeHoy`, `semanaDeRutina`, `deudaDeImplantes`,
`pasosPuestaEnMarcha`). **«Esta semana: N hechas · M faltan» cuenta desde el primer día en que se usó la rutina** (los días
anteriores al primer casillero figuran como «antes» y no castigan). Un implante es una prestación D60/D61 o con «implante» en el
nombre; lo impago se calcula como los morosos (los pagos cubren primero lo más viejo). **Puesta en marcha**: sus pasos «Crear
usuarios» y «Definir servicios» se marcan solos (`pasosPuestaEnMarcha`: hay más de un usuario / hay prestaciones) y la rutina
muestra un aviso con los que faltan. La regla de Firestore `routineChecks` deja escribir solo al administrador (+ demo y servicio);
**hay que publicar las reglas antes del código**.

**Manual de procedimientos (oct-2026):** `docs/manual/` arma un PDF por rol con capturas reales de la demo
(`npm run manual:capturas` + `npm run manual:pdf`; necesita WeasyPrint y poppler). El texto de cada procedimiento vive en
`docs/manual/contenido/*.ts` (datos tipados + cómo sacar sus capturas con Playwright, con el botón a tocar marcado en rojo); los
permisos del apéndice salen de `lib/rbac.ts` y `npm test` se rompe si un permiso nuevo no está explicado en `docs/manual/permisos.ts`.
**Si cambiás una pantalla, un botón o un permiso que el manual explica, volvé a correr las capturas**: una captura que ya no
encuentra su botón falla, que es justamente el aviso. El manual de agosto (`generar-manual.py`) sigue siendo el del dueño. Los avisos son `ojo` / `tip` / `revisar` (decisiones para Angel y Camila) / `error` (un defecto de la app: va al apéndice «Errores conocidos» y se saca el aviso cuando se corrige); `verComo` muestra la pantalla de otro rol; el captor falla si una captura muestra texto prohibido (otro sistema, el pie de soporte, localhost) y se tapa con `ocultar`. La lista de bugs que encontró el proceso, con dónde están, es `docs/manual/hallazgos-de-la-app.md`.

## Diferenciadores (cross-repo con Botika)

Monitor post-op + Negociación de presupuestos: contrato outbox con Botika
(`clinics/{cid}/outbox`; el cron de Botika materializa/envía; `reflectOutbox` refleja).
Voz perio: Novudent puro.

## Workflow

Superpowers (brainstorming → writing-plans → subagent-driven-development). Specs/planes
en `docs/superpowers/`. No abrir PRs salvo que se pida.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
