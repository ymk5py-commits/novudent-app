# Hallazgos de la app al armar el manual (7-oct-2026) — estado al 8-oct-2026

Cada paso del manual de procedimientos se corrió en la app (Playwright contra la demo local), así que al escribirlo aparecieron cosas
que no funcionan como deberían. Esta lista las junta, con dónde está el problema y cómo verlo. **No son decisiones de negocio**: esas
van en «Puntos para revisar» del PDF. Los defectos que el manual documenta también salen en su apéndice «Errores conocidos de la app»,
que se achica a medida que se corrigen (al corregir uno, sacá su aviso `error` de `docs/manual/contenido/`).

Estado: ✅ corregido · 🟡 decisión de producto pendiente · 🔴 abierto.

## Corregidos el 7-oct-2026

| | Qué pasaba | Dónde |
|---|---|---|
| ✅ | La vista **Mensual** de la agenda mostraba cada cita 3 horas adelantada (09:00 salía 12:00): cortaba el texto ISO, que es UTC | `app/app/agenda/page.tsx` |
| ✅ | El **Excel de Citas** traía la hora y hasta la fecha en UTC | `app/app/reportes/page.tsx` |
| ✅ | La IA del **Contralor** recibía la hora de las citas de mañana en UTC | `app/app/page.tsx` |
| ✅ | **Cumpleaños del CRM** con un día de diferencia («¡Hoy!» el día anterior): `new Date("YYYY-MM-DD")` es medianoche UTC | `lib/cumpleanos.ts` (puro, con tests) |
| ✅ | Contador «1 citas», mes «Octubre De 2026» y detalle de la cita con «02:00 p. m. → 14:30» | `app/app/agenda/page.tsx` |
| ✅ | Un E2E dependía del día de la semana (tomaba la primera fila del día) | `e2e/agenda.spec.ts` |
| ✅ | **Esterilización y Registro ambiental no controlaban el rol**: ahora dicen «Acceso denegado» como el resto de Gestión (`practice.config`, solo el administrador). *Decisión pendiente para Angel y Camila: si la asistente tiene que cargar los ciclos de esterilización, hay que darle el permiso; «Permisos del equipo» todavía no lo resuelve, porque estas pantallas van atadas a «Configurar la clínica», que no se reparte; haría falta un permiso propio para cada una.* | `app/app/esterilizacion/page.tsx`, `app/app/ambiental/page.tsx` |

## Corregidos el 8-oct-2026 («arreglar todos los bugs»)

Cada arreglo tiene su prueba (unitaria o e2e); los de `e2e/bugs-datos.spec.ts`, `e2e/pantallas-y-flujos.spec.ts` y `e2e/ficha-y-textos.spec.ts`
se comprobaron revirtiendo el arreglo: la prueba falla sin él.

### Datos y plata

| | Qué pasaba | Cómo quedó |
|---|---|---|
| ✅ | **Fusionar fichas perdía datos** (recetas, ortodoncia, lista de espera, tareas, mensajes automáticos, datos personales y alertas médicas de la duplicada). | `lib/fusionFichas.ts` + `mergePatients`: se completa lo vacío, se juntan las listas, los textos médicos se unen sin repetir, se reasignan lista de espera, mensajes y tareas (con sus claves). El **odontograma se junta pieza por pieza** (el editor guarda siempre las 32 piezas y las sanas pisaban los hallazgos de la duplicada: lo encontró la revisión independiente); si las dos tienen hallazgos distintos en una pieza manda la que se mantiene y se avisa cuál. Una CI «s/d-…» de una importación no tapa la real. Si las dos fichas juntas no entran en un documento de Firestore (radiografías), la fusión se frena sin tocar nada. La Historia Clínica pendiente repetida se anula. Prueba guardián: `Required<Patient>` en `lib/fusionFichas.test.ts`. |
| ✅ | **Editar un borrador de presupuesto** borraba el nombre del plan. | `components/BudgetForm.tsx` parte de `...budget`; agrega «Nombre del plan (opcional)» y una sección por prestación. |
| ✅ | **Convenio con porcentaje fuera de rango** (150 %) y campo que conservaba el anterior. | `parsearDescuento` / `descuentoSaneado` (`lib/budgets.ts`): la pantalla marca el error y apaga «Agregar convenio»; los totales y `realizadas()` sanean un dato viejo. |
| ✅ | **El odontograma no guardaba el último cambio** si se salía antes de 0,8 s. | `components/Odontogram.tsx` guarda al salir (cambio de pestaña, de ficha, `pagehide`). |
| ✅ | **«Restablecer boca»** borraba todo sin preguntar y dejaba «Información dental» con lo viejo. | Pide confirmación y avisa el cambio (parche anotado en `components/odontogram-engine/NOTICE.md`). |
| ✅ | **La receta impresa mostraba la CI** al dentista (sin `patients.personal`). | `components/PatientExtras.tsx` respeta el permiso. |
| ✅ | **Un pago quedaba fechado a las 12:00** y no entraba en la caja abierta. | `fechaDelPago`: hoy → hora real; otro día → mediodía local. «Ingresar pago» sin fecha avisa en vez de tirar un error. |
| ✅ | **La reserva online podía pisar citas del panel** (instante UTC contra hora local sin zona). | `turnosOcupados` (`lib/reserva-online.ts`) compara en la zona de la clínica y cuenta la duración. |
| ✅ | **La reserva online dejaba de ver las citas recientes con más de 500 citas** (y duplicaba pacientes con más de 500 fichas, o si la CI estaba guardada con puntos): bajaba los primeros 500 documentos por id, o sea los más viejos. *(Lo encontró la revisión independiente.)* | `queryRange` / `queryIn` (`lib/server/firestore-rest.ts`): las citas se piden a Firestore por rango de `start` y el paciente por `document IN [«4123456», «4.123.456»]`, con las primeras 500 fichas como respaldo. |
| ✅ | **Los pacientes que reservan por la web no quedaban con la Historia Clínica pendiente.** | `app/api/reservas/route.ts` la crea igual que el alta de la recepción. |
| ✅ | **El tachito de «Movimientos de la caja»** borraba el pago para siempre, sin confirmar ni dejar rastro. | Anula (con confirmación; queda en «Pagos eliminados»). Se sacó `deletePayment` del store. |
| ✅ | **«Registrar devolución»** se podía repetir sobre el mismo pago y no preguntaba. | Confirma y, una vez hecha, el renglón dice «Devuelto» (`devolucionDelPago`). *El efecto contable sigue pendiente: ver «Decisiones».* |
| ✅ | **Laboratorios**: fechas un día antes, entrega de hoy ya «Vencida» y «Dr. Dra.». | `lib/laboratorios.ts`: se guarda el día tal cual; las órdenes viejas (medianoche UTC) se leen bien sin migrar; vencida recién al día siguiente. |
| ✅ | **Box**: borrar un box con citas las dejaba huérfanas y sin confirmar; el día se agrupaba en UTC. | Confirma (dice cuántas citas tiene), las citas pasan a «Sin box asignado» y se agrupa por día local (`lib/boxes.ts`). |
| ✅ | **Un logotipo con fondo transparente** se guardaba con fondo negro. | `lib/image.ts` pinta de blanco antes de dibujar. |
| ✅ | **El mes UTC y «hoy» UTC**: Esterilización y Registro ambiental (el mes del filtro, y el campo «Fecha y hora», que mostraba la hora UTC y corría el registro 3 h en cada edición), los Excel de Pagos, Gastos y Presupuestos, el gráfico de caja, la fecha de cobro del cheque y su «atrasado», y los valores por defecto de «hoy» en varios formularios. | `fechaLocal()`, `diaDe()` y `aInputLocal()` (`lib/tareas.ts`). |

### Pantallas y flujos

| | Qué pasaba | Cómo quedó |
|---|---|---|
| ✅ | La **tarjeta de un presupuesto recién creado** quedaba invisible hasta recargar. | `components/motion.tsx`: el `StaggerItem` que llega tarde se anima solo. |
| ✅ | **«Guardar plantillas»** de Documentos clínicos no sacaba la barra ni confirmaba. | `hayPlantillasSinGuardar` compara las dos listas normalizadas. |
| ✅ | El atajo «Documentos y consentimientos» de Administración no llegaba a su tarjeta. | Ancla `#consentimientos`. |
| ✅ | El menú **«Estado de la cita»** no tenía scroll y `Desplegable` tiraba `TypeError` al cambiar el tamaño de la ventana. | `lib/ubicarPanel.ts` + `components/Desplegable.tsx`: se reubica, se achica y recorre con scroll. Vale para todos los menús flotantes. |
| ✅ | «Firmar y guardar» una evolución vacía no avisaba. | Avisa qué falta. |
| ✅ | **Próximas citas** listaba las anuladas (y mostraba las más lejanas, no las más cercanas); el tipo de nota salía crudo en el Historial. | `lib/citas.ts`, `etiquetaDeNota`. |
| ✅ | **Integraciones**: «Negociación de presupuestos» salía vacía y «Guardar plantillas» no se apagaba; «Reagendar canceladas» no hacía nada. | Un borrador por cada plantilla; el interruptor quedó apagado y deshabilitado, con la marca «Todavía no envía». *Activarlo es una decisión: ver abajo.* |
| ✅ | **Suscripción vencida**: el cartel salía dos veces y «No se guardó» decía «no tenés permiso». | Una sola vez; el aviso dice «la suscripción está vencida y la clínica está en solo lectura». La interfaz no se deshabilita. |
| ✅ | **Agenda**: el cartel de reservas online lo veía la asistente, contaba solo el día abierto y «Ver y validar» mostraba todas las citas sin confirmar. | Solo quien puede confirmar; cuenta de hoy en adelante; filtra las online y salta al primer día (`reservasPorValidar`). |
| ✅ | **`/reservar/{clínica}`** decía «NOVUdent» y prometía WhatsApp. | Nombre de la clínica (`GET /api/reservas?clinicId=` sin fecha, solo el nombre); «La clínica te va a confirmar el turno». |
| ✅ | **Datos personales**: «Datos requeridos» no seguía la configuración; «Guardar datos» dejaba vaciar un obligatorio; crear un paciente con una CI repetida no avisaba. | `lib/camposPaciente.ts`: aviso «Ya hay un paciente con esa CI» (con «Es otra persona» para seguir), «Completá: …» propio en vez del globito del navegador. |
| ✅ | **Importación de pacientes**: nombraba a otro sistema, no salteaba CI repetidas y no dejaba la Historia Clínica pendiente. | `lib/importacionPacientes.ts`, `historiasClinicasPendientes`. |
| ✅ | **Plan de tratamiento**: columna «Pago» (era «se hizo», no «se pagó»), lista sin Borrador/Presentado, «Preparar consulta» visible para quien no lee la ficha y texto de «Estética facial» para la asistente. | Columna «Estado», «Estado del plan», y lo que no corresponde se oculta. |
| ✅ | Textos del odontograma en tuteo y radiografías con título «Análisis IA». | Voseo (parche en `NOTICE.md`, con prueba) y «Subir una radiografía». |
| ✅ | El nombre, la dirección y el teléfono de la clínica no se podían editar; el alta de usuario no tenía color de agenda. | «Datos de la clínica» editable (`updateClinicProfile`) y paleta de 8 colores (aviso si otra persona ya lo usa). |
| ✅ | Textos que mandaban a «Configuración → Usuarios» (no existe), «Completá: …» que nunca aparecían y el engranaje de plazos sin texto. | «Administración › Usuarios y profesionales», validación propia y «Plazos de las tareas». |

## Decisiones de producto pendientes (no son defectos)

| | Tema |
|---|---|
| 🟡 | **Efecto contable de «Registrar devolución»**: hoy solo deja un registro en «Devoluciones»; no baja lo abonado del paciente ni sale de la caja del día. Opción más limpia: un movimiento negativo en la caja de hoy y en lo abonado del plan. Hay que decidir cómo se cuenta. |
| 🟡 | **Numeración de los planes**: los nuevos tienen un id feo (`#g_1791375412657`) que se muestra en ~9 pantallas. Haría falta un número por clínica (`Budget.numero`) y decidir si los viejos se numeran. |
| 🟡 | **«Reagendar canceladas»**: para activarlo hay que decidir el texto del mensaje y cuándo se manda; después, encolar la tarea `reagendar` al cancelar una cita. |
| 🟡 | **El dentista no puede marcar sus prestaciones como realizadas**: el botón vive en Presupuestos, que no puede abrir. Con «Permisos del equipo» se le puede dar la pantalla entera; para darle solo el botón hace falta un permiso propio. |
| 🟡 | Recepción y caja pueden editar los tres recuadros médicos de la cabecera (Alertas, Enfermedades, Medicamentos) sin ver «Antecedentes médicos»; dentista y asistente no ven «Consentimientos». Confirmar si es lo que se quiere. |
| 🟡 | La oferta pública (`lib/landing/precios.ts`) pone «Varios boxes y sucursales» y «Reportes por profesional y sucursal» solo en Multi, pero el sistema los activa desde Clínica (`lib/plan.ts`). Decidir cuál es la correcta. |

## Funciones que faltan (no son defectos)

- No hay cómo **crear un plan de ortodoncia** desde la app: «Nuevo plan de tratamiento» arma planes «General».
- La importación de pacientes no tiene **deshacer** (y cada paciente importado suma una Historia Clínica pendiente: con miles, la campana tendrá miles).
- El odontograma no trae **leyenda de colores**.
- Un **rol propio** (Permisos del equipo) no es un profesional: no aparece en la agenda, en las liquidaciones ni en el límite del plan. Para algo parecido a un dentista o una asistente hay que usar ese rol con otro nombre.

## Cosas menores que quedan (leídas en el código)

- `lib/tareas.ts` y `lib/tareas-reportes.ts` comparan `a.start.slice(0, 10)` (día UTC de la cita) con «hoy» local: una cita de las 21:00 en adelante cuenta como del día siguiente. Las clínicas atienden de día, así que casi no se nota.
- El banner de solo lectura de `components/Consentimientos.tsx` dice «administrador o asistente», pero hoy nadie llega a él.
- «Estética facial»: las fotos y notas las ven recepción, caja y comercial (no tienen `emr.read`).
- La fusión de fichas no se probó contra Firestore real (las pruebas corren sobre la copia local de la demo): conviene probarla una vez con una clínica de prueba.

## Tiene que ver con la demo, no con la app

- La demo es plan **Multi** (`plan: "cadena"`, `lib/seed.ts`), no Clínica: lo que dice «con el plan Clínica…» en los tips es sobre qué incluye cada plan, no sobre lo que se ve en la demo.
- En la demo pública la IA contesta 403 (ver `CLAUDE.md`): ningún procedimiento con IA se fotografió.
- Sin servicio de correo, de WhatsApp ni de firma remota en la demo: los pasos que dependen de eso están escritos con un aviso «Para revisar».
- El canal de soporte (variables `NEXT_PUBLIC_SOPORTE_*`) no está configurado en producción: el panel de Ayuda lo dice.
- «Gustavo Comercial» (el rol Comercial) solo existe en la demo de producción después de «Reiniciar demo».
