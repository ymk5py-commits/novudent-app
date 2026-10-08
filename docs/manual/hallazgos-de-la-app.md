# Hallazgos de la app al armar el manual (7-oct-2026)

Cada paso del manual de procedimientos se corrió en la app (Playwright contra la demo local), así que al escribirlo aparecieron cosas
que no funcionan como deberían. Esta lista las junta, con dónde está el problema y cómo verlo. **No son decisiones de negocio**: esas
van en «Puntos para revisar» del PDF. Los defectos que el manual documenta también salen en su apéndice «Errores conocidos de la app»,
que se achica a medida que se corrigen (al corregir uno, sacá su aviso `error` de `docs/manual/contenido/`).

Estado: ✅ corregido y en producción · 🔴 abierto.

## Corregidos el 7-oct-2026 (en `main`, 390 E2E verdes)

| | Qué pasaba | Dónde |
|---|---|---|
| ✅ | La vista **Mensual** de la agenda mostraba cada cita 3 horas adelantada (09:00 salía 12:00): cortaba el texto ISO, que es UTC | `app/app/agenda/page.tsx` |
| ✅ | El **Excel de Citas** traía la hora y hasta la fecha en UTC | `app/app/reportes/page.tsx` |
| ✅ | La IA del **Contralor** recibía la hora de las citas de mañana en UTC | `app/app/page.tsx` |
| ✅ | **Cumpleaños del CRM** con un día de diferencia («¡Hoy!» el día anterior): `new Date("YYYY-MM-DD")` es medianoche UTC | `lib/cumpleanos.ts` (puro, con tests) |
| ✅ | Contador «1 citas», mes «Octubre De 2026» y detalle de la cita con «02:00 p. m. → 14:30» | `app/app/agenda/page.tsx` |
| ✅ | Un E2E dependía del día de la semana (tomaba la primera fila del día) | `e2e/agenda.spec.ts` |
| ✅ | **Esterilización y Registro ambiental no controlaban el rol**: el menú las escondía, pero quien escribía `/app/esterilizacion` o `/app/ambiental` (recepción, caja, dentista, asistente) registraba, editaba y borraba. Ahora dicen «Acceso denegado» como el resto de Gestión (`practice.config`, solo el administrador). *Decisión pendiente para Angel y Camila: si la asistente tiene que cargar los ciclos de esterilización, hay que darle el permiso; hoy los ciclos de la demo están a nombre de ella. Ojo: «Permisos del equipo» (8-oct-2026) todavía no lo resuelve, porque estas pantallas van atadas a «Configurar la clínica», que no se reparte; haría falta un permiso propio para Esterilización y otro para Registro ambiental.* | `app/app/esterilizacion/page.tsx`, `app/app/ambiental/page.tsx`, `e2e/roles.spec.ts` |

## Abiertos — pueden perder datos o plata

| | Problema | Dónde y cómo verlo |
|---|---|---|
| 🔴 | **Fusionar fichas pierde datos.** Pasan a la ficha que queda las citas, presupuestos, pagos, firmas, radiografías, documentos, etc., pero **no** las recetas, el tratamiento de ortodoncia, la lista de espera, las tareas ni los mensajes automáticos de WhatsApp, ni los datos personales de la duplicada (teléfono, correo, convenio, foto) ni sus alertas médicas. En la lista de espera queda una fila sin nombre. Es irreversible. | `lib/store.tsx` (`mergePatients`, ~L1099). Administración › Fusión de fichas: crear una segunda ficha, darle una receta o ponerla en la lista de espera, fusionar y abrir la que queda. El primer desplegable viene con una ficha ya elegida. |
| 🔴 | **Editar un borrador de presupuesto** y guardarlo borra el nombre del plan («Blanqueamiento dental») y otros datos que el formulario no muestra: el `onSave` arma el presupuesto de cero en vez de partir de `...budget`. | `components/BudgetForm.tsx`. Cobranza › Presupuestos › «Editar» en un Borrador › «Guardar». |
| 🔴 | **El odontograma no guarda el último cambio** si se sale de la ficha o se cambia de pestaña antes de 0,8 s: el cleanup del efecto cancela el temporizador del guardado diferido sin ejecutarlo. | `components/Odontogram.tsx` (L68-80, `SAVE_DEBOUNCE_MS = 800`). Marcar una caries y cambiar de pestaña enseguida. |
| 🔴 | **«Restablecer boca» del odontograma borra todo sin pedir confirmación** y deja «Información dental» con lo viejo hasta reabrir la ficha. | Ficha clínica › Odontograma › Estados › «Restablecer boca». |
| 🔴 | **La receta impresa muestra la CI del paciente al dentista**, que no tiene `patients.personal`: `PlanPrintDocument` respeta el permiso y `RxPrint` no. | Como Dentista: Recetas › Nueva receta › Emitir receta. |
| 🔴 | **Un pago ingresado desde la ficha queda fechado a las 12:00** del día elegido: antes del mediodía todavía no entra en «Movimientos de la caja» ni en el «Total de caja», y en una caja abierta después de las 12:00 no entra nunca (el saldo del paciente sí baja). Tendría que usar la hora real del cobro. | `components/RecibirPago.tsx` L106 (`new Date(date + "T12:00:00")`), contra `totalesSesion` de la caja. |
| 🔴 | **La reserva online puede pisar citas dadas desde el panel.** Las citas del panel se guardan como instante UTC (`toISOString()`), las online como hora local sin zona (`YYYY-MM-DDTHH:MM:00`), y la API de turnos libres compara `start.slice(11,16)` de ambas: una cita del panel a las 09:00 marca ocupado el turno de las 12:00 y deja libre el de las 09:00. *Leído en el código, no reproducido: falta probarlo con una clínica real.* | `app/api/reservas/route.ts` (L113-118 y la comprobación de L259). |
| 🔴 | **Convenio con porcentaje fuera de rango:** el campo tiene `min`/`max` pero no frena el botón; un 150 queda guardado y el presupuesto calcula 150 % de descuento. El campo también conserva el porcentaje anterior después de agregar. | `app/app/configuracion/page.tsx` (~L294-301). |
| 🔴 | El tachito del administrador en **Movimientos de la caja** borra el pago para siempre, sin confirmación ni registro (el de la ficha anula y deja rastro). «Registrar devolución» solo deja un registro: no cambia el saldo ni la caja, no pide confirmación y se puede repetir sobre el mismo pago. | Cajas › Movimientos; Ficha › Facturación y pagos › Pagos. |
| 🔴 | **Laboratorios: las fechas salen un día antes** (la de envío del 07/10 se ve «06-oct.») y una orden con entrega para hoy ya figura «Vencida»: se guarda `new Date("AAAA-MM-DD").toISOString()` (medianoche UTC) y la tabla lo lee como instante. | `app/app/laboratorios/page.tsx` L387-388 y L585. Nueva orden con envío 07/10 y entrega 14/10. |
| 🔴 | **Box: borrar un box con citas las deja huérfanas**: conservan un `boxId` que ya no existe, cuentan en el total del día pero no aparecen en ninguna columna ni en «Sin box asignado». El tachito no pide confirmación. | `/app/box`: elegir un día, asignar una cita a un box y borrarlo. |
| 🔴 | Un logotipo con fondo transparente se guarda con **fondo negro** (se exporta JPEG sin pintar el fondo de blanco). | `lib/image.ts` L37. |

## Abiertos — pantallas y flujos

| | Problema | Dónde |
|---|---|---|
| 🔴 | La **tarjeta de un presupuesto recién creado queda invisible** hasta recargar: un `StaggerItem` que se monta después de que su `Stagger` ya animó nace en «hidden» y nadie lo dispara. | `components/motion.tsx`; Cobranza › Presupuestos › Nuevo presupuesto › Guardar. |
| 🔴 | «Guardar plantillas» no saca la barra «Descartar / Guardar plantillas» ni muestra «Plantillas guardadas» (los cambios sí se guardan): compara la lista de trabajo cruda con la guardada ya normalizada. | `components/PlantillasDocumento.tsx` L38-41. |
| 🔴 | Dos atajos de Administración no llevan a su sección: «Campos del paciente» va a `/app/configuracion#campos` y «Documentos y consentimientos» a `#consentimientos`; ninguno de los dos anclas existe. La tabla de campos está en Pacientes › Configuración. | `components/Shell.tsx` L65 y L67. |
| 🔴 | El menú «Estado de la cita» de la agenda no tiene scroll: con estados propios (van al final) y una ventana de 760 px, los últimos quedan fuera de pantalla y no se pueden tocar. | `components/Desplegable.tsx` L75-76 (`fixed` + `overflow-hidden`, sin `max-height`). |
| 🔴 | **`Desplegable` tira un `TypeError` al cambiar el tamaño de la ventana con un menú abierto** (en el evento `resize`, `e.target` es `window` y `panel.current?.contains(window)` falla): el menú no se reubica ni se cierra, y en el celular pasa al girarlo. | `components/Desplegable.tsx` L53 («Documentos ▾», «Opciones ▾»…). |
| 🔴 | «Firmar y guardar» una evolución vacía no guarda ni avisa por qué. | Ficha clínica › Evoluciones › Nueva evolución. |
| 🔴 | En la ficha, «Próximas citas» (Resumen) lista también las citas anuladas, con la etiqueta «Anulado»; el tipo de nota sale crudo en el Historial («diagnostico», «plan»), bien en Evoluciones («Diagnóstico»). | Ficha clínica › Resumen e Historial. |
| 🔴 | El formulario de plan de tratamiento no tiene campo de sección: todas las prestaciones quedan bajo «Sección sin nombre»; la lista de planes agrupa «En ejecución» y «Otros» y no muestra Borrador ni Presentado; los planes nuevos tienen un id feo (`#g_1791375412657`). | `components/BudgetForm.tsx`, `components/PlanTratamiento.tsx`. |
| 🔴 | **Integraciones:** la plantilla «Negociación de presupuestos» sale vacía con «Restaurar default» (`drafts` se arma con 4 claves y `DEFAULT_TEMPLATES` tiene 5) y «Guardar plantillas» no se apaga nunca; el interruptor «Reagendar canceladas» no hace nada (ningún flujo de cancelación encola un mensaje `reagendar`; `botikaEnabled(db, "reagendar")` no tiene llamadores). | `components/` (`TemplatesEditor`, L16-27), `/app/integraciones`. |
| 🔴 | Laboratorios escribe «Dr. Dra. Sofía Benítez»: la tabla antepone «Dr.» a un nombre que ya trae «Dra.». | `app/app/laboratorios/page.tsx` L240. |
| 🔴 | Textos que mandan a un lugar que no existe: «te asigne en Configuración → Usuarios» (el menú real es Administración › Usuarios y profesionales). | `app/app/pacientes/page.tsx` L135, `app/app/agenda/page.tsx` L323, `app/app/page.tsx` L376. |
| 🔴 | Suscripción vencida: el cartel rojo sale dos veces en `/app/suscripcion` (el del `Shell` y el de la página) y **ninguna pantalla usa `useAccessMode`**: el cartel dice que no se puede editar, pero los botones siguen activos y solo `firestore.rules` rechaza la escritura. | `components/Shell.tsx` L287, `components/PlanGate.tsx` L36, `lib/subscription.ts` L78. |
| 🔴 | Crear un paciente con una CI que ya existe no avisa (el manual dice «buscalo antes»). En «Datos personales», «Datos requeridos» incluye Tipo y Email (opcionales al crear) y deja Sexo y Género (obligatorios al crear) en «opcionales»; «Guardar datos» solo exige nombre y apellido, así que se puede vaciar la CI o el teléfono. | `app/app/pacientes/nuevo/page.tsx`, `components/PatientDatos.tsx`. |
| 🔴 | El cartel «Hay N agendamiento(s) online que deben ser validados» lo ve también la asistente (que no puede validar), cuenta solo el día abierto y «Ver y validar» filtra **todas** las citas sin confirmar, no solo las online. | `app/app/agenda/page.tsx`. |
| 🔴 | Los pacientes que reservan por la web no quedan con la Historia Clínica pendiente (sí los que carga la recepción). *Según el código, sin reproducir.* | `/reservar` → `/api/reservas`. |
| 🔴 | La página pública `/reservar/{clinicId}` dice «NOVUdent» en el encabezado en vez del nombre de la clínica y promete «te confirmamos por WhatsApp» aunque la clínica no tenga la integración. | `app/reservar/`. |
| 🔴 | Comentario de cabecera viejo en `components/Consentimientos.tsx`: dice «admin + asistente» y que el dentista ve los documentos en solo lectura; hoy es admin, caja y recepcionista, y el dentista no ve la pestaña. | `components/Consentimientos.tsx`. |
| 🔴 | La pestaña «Estética facial» del plan le dice a la asistente (solo lectura) «Subí registros frontal/perfil»; «Preparar consulta» (IA) está visible para ella. | `components/PlanTratamiento.tsx`. |
| 🔴 | En la tabla del plan, la columna «Pago» muestra si la prestación se **hizo**, no si se pagó (carrito rojo / tilde verde). Sugerencia: llamarla «Estado». | `components/PlanTratamiento.tsx`. |

## Abiertos — permisos y funciones que faltan

| | Problema |
|---|---|
| 🔴 | **El dentista no puede marcar sus prestaciones como realizadas.** El botón «pendiente / ✓ realizado» está pensado para «administración y dentista», pero vive en Cobranza › Presupuestos, que el dentista no puede abrir («Acceso denegado»). Hoy solo lo hace la administración. Con «Permisos del equipo» se le puede dar «Presentar y aceptar presupuestos» (y con él «Ver montos»), pero eso le abre toda la pantalla de Presupuestos, no solo el botón: haría falta un permiso propio para marcar prestaciones. |
| 🔴 | Recepción y caja puede editar los tres recuadros médicos de la cabecera (Alertas, Enfermedades, Medicamentos) sin ver la pestaña «Antecedentes médicos». Dentista y asistente no ven «Consentimientos», solo los documentos clínicos: confirmar si deberían leerlos. |
| 🔴 | Textos del odontograma en tuteo («Haz clic…», «usa CMD/CTRL»; `odontogram-engine/i18n/translations.ts` L1601, L2015, L2027) y sin leyenda de colores; la pestaña de radiografías dice «Análisis IA de radiografías» aunque el flujo manual no usa IA (`components/Radiografias.tsx` L323). |
| 🔴 | No hay cómo **crear un plan de ortodoncia** desde la app: «Nuevo plan de tratamiento» arma planes «General»; el de ortodoncia existe solo en la demo. |
| 🔴 | El nombre, la dirección y el teléfono de la clínica no se pueden editar desde la app (los carga Novum al dar de alta). |
| 🔴 | El alta de usuario no tiene selector de color (sale del rol): dos dentistas nuevos quedan con el mismo color en la agenda. |
| 🔴 | La importación de pacientes nombra al sistema de origen en pantalla (título y ayuda del cuadro y «Saldo migrado de…» en Cuentas por cobrar); no hay deshacer; si una CI aparece dos veces en el archivo se importan las dos filas, y los importados no traen la Historia Clínica pendiente. |
| 🔴 | La oferta pública (`lib/landing/precios.ts`) pone «Varios boxes y sucursales» y «Reportes por profesional y sucursal» solo en Multi, pero el sistema los activa desde Clínica (`lib/plan.ts`). Hay que decidir cuál de las dos es la correcta. |
| 🔴 | Textos propios «Completá: …» (`pacientes/nuevo/page.tsx` L49, `DarCita.tsx` L406) que nunca aparecen porque el `required` del navegador frena antes. |
| 🔴 | La puerta a los plazos de las tareas es un engranaje sin texto. |

## Menores (leídos en el código, sin reproducir)

- Esterilización y Registro ambiental arrancan con `new Date().toISOString().slice(0, 7)`, el mes UTC: el último día del mes, después de las 21:00, abren el mes siguiente.
- Box agrupa por día UTC: después de las 21:00 el chip dice la fecha en vez de «Hoy» y una cita de las 21:00 en adelante cae en el día siguiente.
- Los Excel de Pagos y Gastos cortan `date.slice(0, 10)`: fecha UTC.

## Tiene que ver con la demo, no con la app

- La demo es plan **Multi** (`plan: "cadena"`, `lib/seed.ts`), no Clínica: lo que dice «con el plan Clínica…» en los tips es sobre qué incluye cada plan, no sobre lo que se ve en la demo.
- En la demo pública la IA contesta 403 (ver `CLAUDE.md`): ningún procedimiento con IA se fotografió.
- Sin servicio de correo, de WhatsApp ni de firma remota en la demo: los pasos que dependen de eso están escritos con un aviso «Para revisar».
- El canal de soporte (variables `NEXT_PUBLIC_SOPORTE_*`) no está configurado en producción: el panel de Ayuda lo dice.
