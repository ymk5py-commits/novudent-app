# Novudent — notas de ingeniería

SaaS de gestión para clínicas dentales (LATAM, español rioplatense). La clínica
real de referencia es **Aura Esthetic Center** (hoy en Dentalink — el norte es
**reemplazar a Dentalink sin perder nada**).

Stack: **Next.js 14 App Router + TypeScript**, **Firestore** (Web SDK, el navegador
escribe Firestore DIRECTO con Firebase Auth), **Gemini** (IA: voz, visión, texto),
**vitest**, Tailwind, Recharts, framer-motion. Deploya a **novudent.novumholding.lat** (dominio propio; `novudent-app.vercel.app` redirige ahí salvo `/api/`)
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

- **Colección nueva por clínica:** sumar su nombre a `lib/backend/colecciones.json`
  (el manifiesto: `COLECCIONES_DE_LA_TIENDA` es lo que lee `leerClinica`) + al `DB`; default `[]` en `lib/seed.ts`; acciones
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
- **RBAC:** `can(session.role, "<perm>")` (`lib/rbac.ts`; es la matriz de fábrica más lo que cada clínica reparte en «Permisos del equipo», ver abajo). EMR (clínico) = dentista/
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

**Menú y Configuración (oct-2026, pedido de Camila):** `components/Shell.tsx` (`NAV`): «Liquidaciones» está **una sola vez**
(Administración › Gestión; es la misma página que antes colgaba también de Cobranza), «Encuestas y NPS» va dentro de **CRM**,
«Videos 3D» es un enlace suelto junto a Pacientes (perm `emr.read`: lo ven admin, dentista y asistente) y «Campos del paciente»
lleva a `/app/pacientes/configuracion` (URL limpia; ver «URLs limpias y SEO» más abajo). En Administración › Configuración: **Agenda online**
(`components/AgendaOnline`: link, QR y anticipación mínima en una sola tarjeta), **Arancel de precios** y **Bancos y entidades
financieras**. **Pago online** (`components/PagoOnline`, `lib/pagoOnline.ts`) guarda con botón y avisa; antes guardaba en silencio
al salir del campo y un link sin `https://` quedaba guardado pero `/pagar/{cid}` lo ignoraba. Vaciar un campo de `config` se guarda
como `""`, no como `undefined` (el `setDoc(..., {merge:true})` no borra un campo ausente). **Arancel** (`components/ArancelPrecios`,
lógica pura con tests en `lib/arancel.ts`): buscar, precio editable en la fila (Enter guarda y pasa al siguiente), ajuste en
bloque por porcentaje con vista previa y «Deshacer» (solo devuelve lo que sigue como lo dejó el ajuste), carga pegando filas de
Excel o un CSV (código · descripción · [categoría] · precio; con solo código y precio actualiza lo que existe) y descarga. El
**código del servicio es el id del documento** en Firestore: `normalizarCodigo` rechaza barras y espacios, y un código repetido ya
no pisa al existente. Los cambios en bloque usan `upsertProcedures` (un solo estado y caché local). **Bancos** (`lib/bancos.ts`,
`components/BancosEntidades`, `components/CampoBanco`): `config.entidadesFinancieras` vive en el documento de la clínica (sin
colección nueva ni reglas nuevas) y el campo «Banco» del cheque las ofrece como sugerencia sin impedir escribir otro nombre; la
lista «más usadas en Paraguay» es orientativa y la clínica la revisa. **⚠️ Un `sr-only` (position:absolute) dentro de un contenedor
`overflow-x-auto` sin `relative` sobresale de la tabla y, en el celular, Chrome ensancha toda la ventana** (`innerWidth` 412 → 522):
los modales quedan corridos y sus botones fuera de pantalla. `scrollWidth <= innerWidth` no lo detecta (crecen juntos): se compara
con el ancho inicial (`e2e/arancel-bancos.spec.ts`). Ponele `relative` al contenedor.

**Permisos del equipo (oct-2026, pedido de Camila: «dar y sacar permisos de acceso a información o ejecución»):** Administración ›
Permisos del equipo (`components/PermisosDelEquipo`; lógica pura y con tests en `lib/permisosEquipo.ts` y `lib/rbac.ts`). La matriz de
`lib/rbac.ts` es la **de fábrica**; cada clínica guarda en `clinics/{cid}.config.permisos[rol] = { dar: [...], quitar: [...] }` solo la
**diferencia** (los cuatro roles que no son administrador, SIEMPRE con las dos listas, vacías si no hay cambios: `setDoc(…, {merge:true})`
no borra lo ausente, así que «volver a fábrica» se guarda escribiendo las listas vacías). `can(role, p, permisos?)` aplica los ajustes: sin
tercer argumento usa los que el store pone en cada render (`aplicarPermisosDeLaClinica`, estado de módulo, solo del navegador); **las
rutas del servidor leen `config.permisos` de la clínica, lo pasan por `normalizarPermisos` y se lo pasan a `can()`** (hoy
`notificaciones/cita` y `ia/agenda-resumen`; si agregás otra ruta que llame a `can`, hacelo igual). Todo lo que viene de Firestore pasa por
`normalizarPermisos` antes de usarse (roles y permisos que no existen, listas que no son listas, repetidos). **No se tocan** el
administrador ni `users.manage` / `practice.config` (`PERMISOS_SOLO_ADMIN`): por eso Esterilización, Registro ambiental, Box, Arancel…
siguen siendo solo del administrador; si Camila pide repartirlos por separado hay que crear un permiso nuevo para cada uno (sumarlo a
`MATRIX`, a `GRUPOS_DE_PERMISOS`, a `PERMISOS_EN_PALABRAS` y a `TIPO_DE_PERMISO`: `npm test` rompe si falta alguno). `REQUIERE` (en
`lib/permisosEquipo.ts`): dar «cobrar» da «ver montos» y sacar «ver montos» saca todo lo que maneja plata; la pantalla avisa lo que
arrastró. **Qué hace cumplir el servidor** (`firestore.rules`: `tienePermiso(cid, perm, rolesDeFábrica)` detrás de `isCaja`, `isRecepcion`,
`isClinical`, `puedeGastos` y `puedeLiquidaciones`): `payments.manage`, `engagement.forms`, `emr.write`, `expenses.manage` y
`billing.reports`. **El resto (ver montos, datos personales, la agenda de todos…) solo esconde pantallas y botones: Firestore sigue
dejando leer a todo miembro de la clínica**, y la pantalla lo dice. Un test (`lib/permisosEquipo.test.ts`) ata la lista de roles de fábrica
de cada `tienePermiso(...)` de las reglas a la matriz y a `PERMISOS_QUE_EXIGE_EL_SERVIDOR`: si cambiás la matriz hay que cambiar las
reglas, y al revés. Solo el administrador escribe `clinics/{cid}` (nadie se da permisos a sí mismo). El store escucha el documento de la
clínica **solo para `config.permisos`, `config.rolesPropios` y `config.nombresDeRoles`** (el cambio llega en vivo, sin recargar; no toma el resto de la configuración para no pisar lo que
este navegador todavía está guardando). Con `dar` y `quitar` a la vez gana `dar`, igual en cliente y en reglas. **Hay que publicar las
reglas antes del código** (el código viejo ignora `permisos`; las reglas nuevas, sin ajustes, se comportan como siempre). Los tests del
emulador («permisos del equipo») están al final de `test/firestore-rules.test.mjs`. La landing y el manual muestran la matriz de fábrica
(`permisoDeFabrica`), nunca los ajustes de una clínica.

**Comercial, roles propios y nombres (8-oct-2026, segundo pedido de Camila: «tiene que haber también comercial… o escribir el nombre que le queramos
poner»):** `Role` ahora son seis roles de fábrica (se suma **`commercial`**, «Comercial»: agenda de todos, datos del paciente, presupuestos con
sus montos y CRM; sin caja, ficha clínica ni reportes). `User.role` y `Session.role` son `RolId` (= `string`): un rol de fábrica **o el id de un rol
propio** (`rp_` + 8 letras/números). Cada clínica guarda `config.rolesPropios: {id, nombre}[]` (los roles que creó) y `config.nombresDeRoles`
(otro nombre para un rol de fábrica; vacío = el de fábrica). **Un rol propio no hereda nada de fábrica**: lo que puede es su lista `dar` en
`config.permisos[id]` (al crearlo se puede copiar lo que HOY puede otro rol; después es independiente). Por eso **las reglas de Firestore ya lo
soportan sin saber que existe** (`tienePermiso` mira `dar`); lo único que cambió en las reglas es sumar `'commercial'` a la lista de
`isRecepcion` (`engagement.forms`), y el test de sincronía lo exige. **Para mostrar un rol usá `rolLabel(role)` / `rolDescripcion(role)`, nunca
`ROLE_LABEL[role]`** (esos son los de fábrica y el compilador no deja indexarlos con un `RolId`); para los selectores, `rolesParaElegir()`. Todo
eso (permisos, roles propios, nombres) lo aplica el store en cada render con `aplicarRolesDeLaClinica(config)` y lo escucha en vivo; las rutas del
servidor pasan por `normalizarPermisos`/`normalizarRolesPropios` (`/api/team-users` solo acepta un rol propio que la clínica tenga creado). Los ids
de rol pasan por `esIdDeRolValido` (nunca `admin`, ni nombres de propiedades de `Object`): `permisoEfectivo` mira los ajustes con `hasOwnProperty`.
**Un rol propio NO es profesional**: los chequeos `role === "dentist"` / `"assistant"` (lista de profesionales, liquidaciones, límite del plan,
doctores de la asistente) no lo ven; si la clínica necesita algo parecido a un dentista, usa el rol Dentista con otro nombre. Lógica pura y con tests
en `lib/rolesPropios.ts` (`crearRolPropio`, `errorDeNombreDeRol`, `personasConElRol`: un rol con gente, también dada de baja, no se elimina). La demo
trae a «Gustavo Comercial» (`u7`); la demo de **producción** no lo tiene hasta «Reiniciar demo».

**Manual de procedimientos (oct-2026):** `docs/manual/` arma un PDF por rol con capturas reales de la demo
(`npm run manual:capturas` + `npm run manual:pdf`; necesita WeasyPrint y poppler). El texto de cada procedimiento vive en
`docs/manual/contenido/*.ts` (datos tipados + cómo sacar sus capturas con Playwright, con el botón a tocar marcado en rojo); los
permisos del apéndice salen de `lib/rbac.ts` y `npm test` se rompe si un permiso nuevo no está explicado en `docs/manual/permisos.ts`.
**Si cambiás una pantalla, un botón o un permiso que el manual explica, volvé a correr las capturas**: una captura que ya no
encuentra su botón falla, que es justamente el aviso. El manual de agosto (`generar-manual.py`) sigue siendo el del dueño. Los avisos son `ojo` / `tip` / `revisar` (decisiones para Angel y Camila) / `error` (un defecto de la app: va al apéndice «Errores conocidos» y se saca el aviso cuando se corrige); `verComo` muestra la pantalla de otro rol; el captor falla si una captura muestra texto prohibido (otro sistema, el pie de soporte, localhost) y se tapa con `ocultar`. La lista de bugs que encontró el proceso, con dónde están, es `docs/manual/hallazgos-de-la-app.md`.

**Arreglo de bugs (8-oct-2026) — lo que quedó como convención** (la lista, con dónde estaba cada uno, es `docs/manual/hallazgos-de-la-app.md`):
**Fechas:** «hoy» es `fechaLocal()`; el día de una fecha guardada, `diaDe(x)` (instante ISO → día local, `AAAA-MM-DD` tal cual); el valor de un
`datetime-local`, `aInputLocal(iso)` (nunca `toISOString().slice(0, 16)`: es la hora UTC); un día de calendario se guarda como `AAAA-MM-DD`
(las órdenes de laboratorio viejas, guardadas como medianoche UTC, se leen con `diaDeLaOrden`). **Fusión de fichas** (`lib/fusionFichas.ts`):
`fichaConTodo: Required<Patient>` en su test deja de compilar si se suma un campo a `Patient`: hay que decidir cómo se fusiona; el
odontograma se junta pieza por pieza con `PIEZA_SIN_HALLAZGOS` (`lib/odontogramaSinHallazgos.ts`, atada al motor por
`lib/odontogram-bridge.test.ts`: actualizarla al re-sincronizar el motor, porque el editor guarda SIEMPRE las 32 piezas); `mergePatients`
devuelve `ResultadoFusion` y se frena sin tocar nada si la ficha resultante no entra en un documento (~900 KB). **Rutas públicas** (`/api/reservas`):
`listCollection(…, N)` baja los N documentos de MENOR id, o sea los más viejos: para buscar usá `queryWhere` / `queryRange` / `queryIn`
(filtran en Firestore). `fsSave` es `setDoc` SIN merge (omitir un campo lo borra); la configuración de la clínica (`updateClinicConfig`,
`fsMeta`) sí usa merge (vaciar un campo = `""`). **Dinero:** un pago no se borra, se anula (`voidPayment`); «Registrar devolución» solo deja un
registro (no mueve saldo ni caja: decisión pendiente); los descuentos pasan por `parsearDescuento` / `descuentoSaneado`. **Menús flotantes:**
`Desplegable` + `lib/ubicarPanel.ts` (se reubican y recorren con scroll). El texto del odontograma está en voseo (`lib/odontogram-voseo.test.ts`).

**Pedidos de Camila del 8-oct-2026 (agenda, análisis de estudios, plan y arancel, tareas)** — spec en
`docs/superpowers/specs/2026-10-08-pedidos-de-camila-agenda-ficha-plan-tareas.md`. **Agenda:** la semanal tiene celdas de 30 min con menú por espacio
(cita presencial, videoconsulta, múltiples, sobreagendar, bloquear); la geometría es pura (`lib/agendaSemana.ts`, `columnasSuperpuestas`). Los
**bloqueos** son la colección `agendaBlocks` (`lib/bloqueos.ts`: un bloqueo por día, `dentistId: "*"` = todos, `boxId` opcional, `serieId` para las
repeticiones de hasta un año) y **nadie reserva encima**: `huecosDelDia` recibe `bloqueos` (y `permitirSuperponer` para el sobrecupo, que nunca salta
un bloqueo) y `/api/reservas` los lee con `queryRange` (respaldo: la colección; si no se puede, sigue sin ellos y lo loguea). `Appointment.sobrecupo` y
`Appointment.prestaciones` (lo que se hace en la cita, del plan o del arancel; `lib/prestacionesCita.ts`). **Colección nueva = sumarla también a
`completarCache` (`lib/cacheLocal.ts`)**, si no el caché local viejo rompe las pantallas. **Análisis de estudios:** quién cae en «Sin próxima cita» lo
decide `lib/seguimiento.ts` (asistió o tiene plan vigente, sin cita futura, sin plan finalizado ni quita vigente); la quita es `Patient.seguimiento` y se
guarda con `setSeguimientoPaciente`, que escribe **solo ese campo** (`fsCampo` → `updateDoc`/`deleteField`): para editar un campo suelto desde una
pantalla que puede tener la ficha vieja en memoria usá ese patrón, no `upsertPatient` (`setDoc` sin merge pisaría lo que otro cargó después).
**Plan y arancel:** «Nuevo plan de tratamiento» arma el plan en la ficha (`BudgetForm` con paciente fijo); las prestaciones y los pacientes se eligen con
`BuscadorPrestacion` / `BuscadorPaciente` (nunca un `<select>` con todo el arancel). El arancel se carga desde `.xlsx` con el lector propio
`lib/xlsx.ts` (fflate con `import()` dinámico; topes de 8 MB, 20.000 filas y 64 MB descomprimidos, revisados ANTES de inflar; `.xls` y archivos con
contraseña se rechazan con mensaje) y `analizarCargaDeFilas` (comparte núcleo con el pegado; sin columna de código empareja por nombre o crea `S0001`…;
hasta 3.000 filas). **Tareas:** la bandeja abre en «Todas las pendientes» (`todasLasPendientes`); con `?fecha=` abre «Tareas del día» de esa fecha; Mi
agenda suma «Todas».

**URLs limpias y SEO (8-oct-2026, pedido de Croman)** — spec en `docs/superpowers/specs/2026-10-08-urls-limpias-y-seo.md`. Las secciones del panel son
rutas reales, sin `#`: `/app/configuracion/permisos`, `/app/reportes/graficos`, `/app/tareas/plazos`, `/app/pacientes/configuracion`,
`/app/pacientes/<id>/planes`. La tabla nombre-en-la-URL → sección y las funciones están en `lib/rutasPanel.ts` (`rutaDeSeccion`, `seccionDeRuta`,
`rutaDeFicha`, `rutaLimpia`, `hrefActivo`); las rutas `[seccion]` / `[pestana]` reusan la misma página (`export { default } from "../page"`). Las
pestañas cambian la URL con `window.history.pushState` (Reportes, Pacientes, Tareas: «atrás» vuelve a la anterior) o `replaceState` (la ficha), que Next
sincroniza con `usePathname`. **Los enlaces viejos con `#` o `?tab=` siguen andando**: el Shell los pasa a la URL limpia (`rutaLimpia`) y las pantallas
igual los entienden. **Para sumar una sección:** agregala a `SECCIONES` y usá `rutaDeSeccion` en los enlaces (nunca escribas `#…` a mano). **El panel
no se indexa** (`noindex` en `app/app/layout.tsx` y en los layouts de `/login`, `/superadmin`, `/reservar`, `/firmar`, `/confirmar`, `/pagar`,
`/encuestas`, `/videoconsulta`, además del `disallow` de `app/robots.ts`). Lo que se indexa sale de `PAGINAS_PUBLICAS` (`lib/seo.ts`): **al cambiar el
contenido de una página pública, actualizá su fecha `actualizado`** (va al sitemap). `next.config.mjs` redirige `novudent-app.vercel.app` al dominio
propio con 308, salvo `/api/` (hay integraciones que la llaman directo). La verificación de Search Console y Bing sale de las variables
`GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` de Vercel; la clave de **IndexNow** está en `public/<clave>.txt` y `npm run indexnow` avisa las URLs
del sitemap (correrlo después de publicar). `e2e/seo.spec.ts` cuida título (≤ 70), descripción (70–170), canónica, un solo `<h1>`, `alt` y el `noindex`
de lo privado.

**Ventanas persistentes (8-oct-2026, pedido de Croman: «que se cierren con cancelar o con la X de arriba, para evitar que se cierren»):**
ningún diálogo se cierra con un clic afuera ni con Escape (se perdía lo que se estaba cargando); se cierran con la X o con «Cancelar».
`Modal` (`components/ui.tsx`) ya lo hace; un diálogo con markup propio usa `useDialogA11y()` (sin argumentos: ya no recibe `onClose`) +
`useAvisoDeCierre()` en el fondo + `BotonCerrar` (un clic afuera marca la X y muestra «Para cerrar, tocá la X o «Cancelar»»). Al abrir, el
foco va al panel (no a la X: un Enter de más la cerraba), salvo que un campo tenga `autoFocus`. El título con la X queda fijo arriba; para
una ventana larga, `ModalPie` deja el pie (botones) fijo abajo. En los tests y las capturas del manual, cerrar con la X
(`getByRole("dialog").getByRole("button", { name: "Cerrar" })`), nunca con `keyboard.press("Escape")`. Los menús (`Desplegable`, la campana)
siguen cerrándose con Escape y con un clic afuera: no son ventanas. **«Dar cita»:** duración en una sola lista de 15 en 15 minutos
(`opcionesDeDuracion`, `textoDuracion`), la grilla con un solo scroll y cada día vacío dice por qué (`motivoSinHuecos`: «No atiende», «Ya
pasó el horario», «No entra en el horario», «Bloqueado», «Sin lugar»); el pie (`data-testid="pie-dar-cita"`) muestra el horario elegido.

**Capa de datos (9-oct-2026, parte P1 del servidor propio)** — `lib/backend/`. La tienda y las pantallas ya no hablan con Firebase: usan
`backendDeDatos` (`lib/backend/index.ts`), que cumple `DatosDeBackend` (leer la clínica, `guardar`, `quitar`, `fijarCampo`, `mezclarClinica`,
`lote`, `escuchar*`) y `SesionDeBackend` (login, token para `/api`, recuperar contraseña) de `tipos.ts`. Hoy la única implementación es
`firestore.ts`; `NEXT_PUBLIC_BACKEND` (por defecto `firestore`) la elige y `supabase` todavía no existe (parte P3, ver
`docs/superpowers/specs/2026-10-09-servidor-propio-supabase-design.md`). **El SDK `firebase/*` (también `@firebase/*`) solo lo pueden importar
`lib/firebase.ts` y `lib/backend/firestore.ts` (y las pruebas `*.emulador.test.ts`); y el envoltorio `lib/firebase.ts` solo lo importa
`lib/backend/firestore.ts`** (las dos reglas las exige `lib/backend/aislamiento.test.ts`): una pantalla que necesite algo de la base se lo pide a
la interfaz. Qué se lee al abrir una clínica, cómo se arma la `DB` y la semilla y puesta al día de la demo viven en `carga.ts` (`cargarDB`),
probadas con el backend en memoria (`memoria.ts`).
**Para sumar una colección:** agregala a `lib/backend/colecciones.json` (`colecciones.test.ts` la ata a `firestore.rules` y a la semilla) además de lo de
siempre. **Toda implementación pasa el mismo contrato** (`contrato-de-datos.ts`): `npm test` lo corre contra la memoria y `npm run test:backend` (necesita
Java y el CLI de Firebase) contra el emulador de Firestore, incluida la lectura con las reglas reales. El `backend` del store
(`"connecting" | "firebase" | "local"`) es otra cosa —el estado de la conexión—; por eso el objeto se llama `backendDeDatos`.
**Exportar Firestore (solo lectura):** `npm run migracion:exportar -- --solo-medir` cuenta y mide todo sin guardar datos de pacientes y deja
`informe-de-volumen.md` (con la proyección para 30 clínicas); sin `--solo-medir` guarda un JSONL por colección y clínica, con `manifiesto.json` (cantidades,
bytes y SHA-256). La credencial por defecto es la sesión del CLI de Firebase (`firebase login`), la única que lee los mensajes directos del chat. **La
exportación tiene datos de pacientes: va fuera del repo (`~/novudent-export`), y `scripts/migracion/exportar-firestore.mjs` se niega a escribir adentro
del repositorio** (compara las rutas reales, también por un enlace simbólico). Código de salida 2 = quedó algo sin leer.

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
