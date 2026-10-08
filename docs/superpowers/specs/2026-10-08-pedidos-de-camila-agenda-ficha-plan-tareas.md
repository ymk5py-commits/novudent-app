# Pedidos de Camila del 8-oct-2026: agenda, ficha del paciente, presupuestos y tareas

Lista que Camila le pasó a Croman (textual, tal como llegó):

> **AGENDA:** En la agenda semanal debe aparecer la opción de sobreagendamiento, en cada box, como en Dentalink. En cada espacio de
> horario de la agenda, debemos tener la opción de dar "cita presencial", "dar múltiples citas" y también la opción de "bloquear
> espacio". Todo como Dentalink. Al dar cita falta la opción de agregar fechas tipo calendario. Cómo se define qué procedimiento se va
> a realizar el paciente para que aparezca en la agenda si al dar la cita no existe esa opción.
>
> **ABRIR Y CARGAR FICHA PACIENTE:** Al entrar en la pestaña análisis de estudios específicos sale el dato de pacientes sin próxima
> cita y con cita; dar la opción de darle click y que me salgan todos los datos de esos pacientes. Cada paciente, si no se le volvió a
> agendar después de asistir, debe caer en pacientes sin próxima cita hasta que se le dé como finalizado su plan de tratamiento o que
> se dé la opción de borrarle de ese apartado por otros motivos.
>
> **ARMAR UN PRESUPUESTO:** Al entrar en el perfil de un paciente, luego planes de tratamiento, luego crear un nuevo plan de
> tratamiento, va a una pestaña de presupuestos con nombre de varios pacientes y sus presupuestos; corregir y que sea como Dentalink
> al armar un plan de tratamiento. La lista de procedimientos y los precios es extensa y debe poder subirse un Excel con los nombres y
> precios y que eso salga.
>
> **REVISAR TUS TAREAS PENDIENTES:** Debe salir todas las tareas, no solo las del día seleccionado.

Son cuatro frentes que se trabajan en paralelo, cada uno en su rama y su worktree:

| Frente | Rama | Pedidos |
|---|---|---|
| **A · Agenda** | `feat/agenda-espacios-bloqueos` | los 4 de AGENDA |
| **B · Análisis de estudios específicos** | `feat/analisis-sin-proxima-cita` | los 2 de FICHA PACIENTE |
| **C · Plan de tratamiento y arancel** | `feat/plan-en-la-ficha-y-arancel-xlsx` | los 2 de PRESUPUESTO |
| **D · Tareas pendientes** | `feat/tareas-todas-las-pendientes` | el de TAREAS |

Ya está en `main` (no la rehagas): `components/BuscadorPaciente.tsx` (el buscador «CI | Nombre» que salió de DarCita) y
`components/BuscadorPrestacion.tsx` + `buscarPrestaciones()` de `lib/arancel.ts` (busca prestaciones por código o nombre, los más
parecidos primero, de a 30). **Usalos**; si necesitás cambiarlos, hacelo en tu rama con tests y avisalo en el informe final.

## Reglas comunes

- **Dentalink es la referencia**, pero con los colores y componentes de Novudent. Interfaz en **español rioplatense (voseo)**: «Elegí»,
  «Agregá», «Quitá». Nada de «Seleccione».
- **Permisos** (`lib/rbac.ts`, `useAlcance().puede(...)`): `agenda.create` y `agenda.edit` = admin, caja, recepción y comercial (el
  dentista y la asistente ven la agenda en solo lectura); `budgets.manage` = admin, caja y comercial; `plans.create` = admin y
  dentista; **`money.view` = admin, caja y comercial: recepción y dentista NO ven precios**. Todo lo que muestre un monto (precio de una
  prestación, total de un plan) se esconde sin `money.view`. Alcance por doctor: `alcance.veDoctor(id)` / `alcance.vePaciente(id)`.
- **Fechas**: «hoy» es `fechaLocal()`; el día local de una fecha guardada, `diaDe(x)`; el valor de un `datetime-local`, `aInputLocal(iso)`.
  Nunca `toISOString().slice(0, …)` para eso (es hora UTC). Las citas del panel guardan un instante ISO UTC; las de la reserva online,
  la hora local sin zona (`lib/boxes.ts diaDeLaCita`, `momentoLocal` de `/api/reservas`).
- **Datos**: `fsSave` es `setDoc` SIN merge (omitir un campo lo borra de Firestore). Un campo nuevo en un tipo que ya existe es **opcional**
  (los documentos viejos no lo traen). Un documento tiene que entrar en 1 MiB. Colección nueva = `loadFirestore` + `DB` + seed + acciones
  del store + **regla en `firestore.rules`** + default en `loadLocal` (ver «Patrones» de CLAUDE.md).
- **TDD**: lógica pura en `lib/*.ts` con su `*.test.ts` (vitest) escrito ANTES; verlo fallar por la razón correcta; recién ahí el código.
  Los flujos de pantalla, con Playwright en `e2e/` (un archivo nuevo por frente, helpers de `e2e/soporte.ts`).
- **No romper lo que ya anda**: si cambiás un comportamiento, actualizá los e2e existentes que lo asumían y decí cuáles en el informe.
- **Manual** (`docs/manual/contenido/*.ts`): si cambia un botón o un texto que un procedimiento explica, actualizalo y corré las capturas
  de ese módulo (`MANUAL_SOLO=<modulo> E2E_PORT=<tu puerto> npm run manual:capturas`, con la app compilada). Una captura que ya no
  encuentra su botón falla: es el aviso.
- **Verificación visual**: mirá lo que hiciste. Sacá capturas con Playwright (`page.screenshot`), abrilas con la herramienta Read y
  juzgá: nada cortado, nada que se salga de su caja, también en el celular (Pixel 7, 412 px).

## Frente A · Agenda

**A1 · Menú de cada espacio de la semanal.** La grilla semanal pasa a celdas de **30 minutos** (hoy son de una hora; las etiquetas de
hora siguen cada 56 px). Tocar una celda vacía abre un menú anclado a ella (`Desplegable`) con el título «Lun 12 oct · 09:30» y:
**Dar cita presencial** · **Dar cita por videoconsulta** · **Dar múltiples citas** · **Sobreagendar en este horario** · *(separador)* ·
**Bloquear espacio**. Las cuatro primeras exigen `agenda.create`; «Bloquear espacio», `agenda.edit`. Sin ninguno de esos permisos las
celdas no hacen nada (como hoy). Tocar una cita sigue abriendo «Ver». Cada tarjeta de cita lleva un botón chico **«+»**
(`aria-label="Sobreagendar en este horario"`, visible al pasar el mouse o enfocar, y siempre visible en pantallas táctiles) que abre
el sobreagendado desde esa cita. En la vista Diaria, el menú ⋮ de cada fila suma «Sobreagendar en este horario», y el modal «Ver»
también tiene el botón. Las vistas Semanal y Diaria suman el filtro **Box** (solo si la clínica tiene 2 o más) junto a Profesional y
Sucursal; lo elegido viaja al formulario.

**A2 · Citas superpuestas visibles.** Hoy dos citas del mismo horario se dibujan una encima de la otra. Las que se superponen se reparten
el ancho en columnas (algoritmo clásico de grupos de eventos solapados). Función pura `columnasSuperpuestas` en `lib/agendaSemana.ts`, con tests
(grupos encadenados, tres a la vez, citas que solo se tocan en el borde no cuentan como superpuestas).

**A3 · Sobreagendar (sobrecupo).** En «Dar cita» aparece **«Sobreagendar»**: permite elegir un horario que ya tiene otra cita del mismo
profesional o del mismo box. Con eso activado, la agenda disponible ofrece todos los horarios del horario de atención del profesional
que no estén bloqueados ni en el pasado, y los que ya tienen una cita se marcan (borde ámbar y `title` «Ya hay 1 cita»). Los
bloqueos **nunca** se saltan. La cita guardada lleva `sobrecupo: true` y se ve con la marca «Sobrecupo» en la Diaria, en la tarjeta
semanal y en «Ver». Se abre ya activado desde el menú de espacio, el «+» de la tarjeta y el ⋮ de la Diaria, con el día, la hora, el
profesional y el box de la cita de origen preseleccionados. `huecosDelDia` (`lib/disponibilidad.ts`) suma `permitirSuperponer` y
`bloqueos`.

**A4 · Dar múltiples citas.** Es la «Multiconsulta» que ya existe, ahora también como entrada desde el menú de espacio: abre «Dar cita»
con «Multiconsulta» ya tildada y ese horario elegido. Rotulala «Multiconsulta (varias citas)».

**A5 · Bloquear espacio.** Modal **«Bloquear espacio»**: Profesional (los que ve la persona + «Todos los profesionales»), Box (solo si hay 2+;
«Todos los boxes»), Fecha, Desde, Hasta (de a 15 min; Hasta > Desde), Motivo (opcional, con sugerencias: Almuerzo, Reunión,
Capacitación, Vacaciones, Feriado) y **Repetir**: «No se repite» · «Todos los días hábiles (lunes a sábado)» · «Todas las semanas»,
con «Repetir hasta» (máximo 1 año). Una repetición crea un bloqueo por ocurrencia, todos con el mismo `serieId`. En la semanal el bloqueo
se dibuja rayado en gris con el motivo; tocarlo ofrece **«Quitar este bloqueo»** y, si tiene serie, **«Quitar toda la serie»** (con confirmación).
En la Diaria se listan arriba de la tabla («Espacios bloqueados: 12:00–13:00 Almuerzo · Dr. X [Quitar]») y en «Diaria global» salen como
tarjetas grises. **Un espacio bloqueado no se puede reservar**: ni desde «Dar cita» (con o sin sobreagendar) ni desde la reserva online
(`/api/reservas`, disponibilidad Y la validación al reservar). Un bloqueo que pisa citas que ya existen las deja como están (no las
borra): se avisa «Ya hay N citas en ese horario; siguen en la agenda». Pura lógica en `lib/bloqueos.ts` con tests (`bloqueoAplica`,
`expandirRepeticion`, `errorDeBloqueo`).

Tipo nuevo `AgendaBlock { id, clinicId, dentistId /* "*" = todos */, boxId?, start, end /* ISO */, reason?, createdAt, createdBy, serieId? }`,
colección **`agendaBlocks`** (patrón de colección nueva de CLAUDE.md). Regla de Firestore: igual a la de `appointments`
(leer: miembro, servicio o demo; escribir: como appointments) — **no la publiques**: Croman la publica antes del código; dejala
en `firestore.rules` con un test en `test/firestore-rules.test.mjs`. Acciones del store: `addAgendaBlocks(bs)` y `deleteAgendaBlocks(ids)`.
Permiso: `agenda.edit` (no hace falta uno nuevo).

**A6 · Fecha en el calendario al dar cita.** En «Agenda disponible» de «Dar cita», un campo de fecha con calendario nativo
(`<input type="date">`, `aria-label="Ir a la fecha"`, mínimo hoy) que lleva la ventana de 7 días a esa fecha (la primera columna es la elegida).
Lo ya elegido en otras semanas se conserva (multiconsulta).

**A7 · Qué procedimiento se hace.** Hoy la cita solo tiene «Tipo de consulta» y un título libre. En «Dar cita» se suma **«Procedimiento a realizar»**:
(1) con paciente elegido, sus **planes de tratamiento** (no anulados ni completados, de los doctores que la persona ve) con las prestaciones
pendientes tildables, agrupadas por plan; (2) **«Agregar otra prestación»**: `BuscadorPrestacion` sobre el arancel (`mostrarPrecio` solo con `money.view`:
**la recepción no ve precios**); (3) campo **«Otro motivo»** (texto libre) si no está en el arancel. Se pueden elegir varias. Se guarda
`Appointment.prestaciones?: { cpt?: string; description: string; tooth?: string; budgetId?: string; itemId?: string }[]`; `title` pasa a ser la
primera descripción (+ « +N» si hay más; sin nada elegido queda como hoy, el tipo de consulta) y `budgetId` el del primer plan
tildado. Se ve en la Diaria (debajo del paciente), en la tarjeta semanal, en «Ver» (lista con la pieza) y en la vista Mensual (por el título).
Marcar las prestaciones del plan como «realizadas» al atender la cita queda **fuera de este pedido** (decisión pendiente).

## Frente B · Análisis de estudios específicos (Pacientes › Análisis de estudios específicos)

**B1 · Las tres cifras se tocan.** «Pacientes en …», «Con próxima cita» y «Sin próxima cita» pasan a ser botones tipo filtro (`aria-pressed`) que
dejan en la tabla solo esos pacientes («Mostrando 12 de 40» + «Quitar filtro»). Ningún filtro tocado = todos, como hoy. El filtro vale
también para «Exportar CSV».

**B2 · Todos los datos.** La tabla suma: teléfono y correo (solo con `patients.personal`, como la CI), próxima cita con hora, última cita
con su estado («Atendido», «No asiste»…), plan de tratamiento (nombre y estado del más reciente que no esté anulado) y, en «Sin próxima cita», desde cuándo
(«hace 23 días»). Acciones por fila: **Ver ficha**, **WhatsApp** (`https://wa.me/<solo dígitos>` si hay teléfono y `patients.personal`) y **Quitar de la lista** (B4).
El CSV lleva las mismas columnas.

**B3 · Quién cae en «Sin próxima cita».** Función pura `seguimientoDe(...)` en `lib/seguimiento.ts` (con tests, mucha cobertura de bordes):
un paciente **está en la lista** si no está deshabilitado, **no tiene ninguna cita futura** (no anulada; una «No asiste» no cuenta), y **o bien asistió**
alguna vez (alguna cita pasada «Atendido» o «Atendiéndose») **o bien tiene un plan de tratamiento vigente** (borrador, presentado o aceptado), y **no** salió de la lista por:
- **plan finalizado**: tiene planes y todos los que no están anulados están «completado» (al menos uno);
- **quitado a mano** (B4) y no asistió de nuevo desde entonces (si después de quitarlo vuelve a atenderse y no se agenda, **vuelve a la lista**).
Las vistas por tipo (Rehabilitación oral, Odontología estética) calculan «asistió» y «cita futura» solo con las citas de ese tipo de consulta;
los planes cuentan siempre. «Ortodoncia» tiene su reporte propio (no se toca).

**B4 · Quitar de la lista por otros motivos.** «Quitar de la lista» abre un modal con motivo: Terminó su tratamiento · Se atiende en otra clínica ·
No quiere continuar · No se lo puede ubicar · Otro (con texto obligatorio). Se guarda en el paciente: `Patient.seguimiento?: { cerradoAt: string /* ISO */; motivo: string; por: string }`.
Hay un interruptor **«Ver quitados (N)»** con «Volver a incluir». Pueden quitar y volver a incluir quienes tengan `patients.personal` o `emr.write` (verificalo contra la regla
`patients` de `firestore.rules`; si no alcanza, avisalo). `lib/fusionFichas.ts` y su test `fichaConTodo: Required<Patient>` obligan a decidir cómo se fusiona el campo nuevo
(criterio: gana el de la ficha que se conserva; si no tiene, el de la otra).

## Frente C · Plan de tratamiento desde la ficha y arancel por Excel

**C1 · «Nuevo plan de tratamiento» arma el plan ahí mismo.** En la ficha del paciente › Plan de tratamiento, el botón deja de ser un enlace a
`/app/presupuestos` (la lista de presupuestos de todos los pacientes) para quien tiene `budgets.manage`: abre el formulario del plan **con ese paciente
fijo** (como ya hace para el dentista con `plans.create`). Lo ve quien tenga `budgets.manage` o `plans.create`; sin `money.view` el formulario va sin montos
(`sinMontos`). Al guardar, se abre el detalle del plan nuevo. También en el estado «Sin planes de tratamiento». La pantalla Presupuestos sigue como está
(lista global), con un **buscador por paciente** arriba y el selector de paciente del formulario global pasa a `BuscadorPaciente`.

**C2 · El formulario del plan con un arancel enorme.** El `<select>` con todas las prestaciones se reemplaza por `BuscadorPrestacion` («Buscar prestación…»
elige y agrega la fila); cada fila queda con pieza, sección, precio (solo con montos) y quitar. Sin prestaciones cargadas no se rompe (hoy `db.procedures[0]` revienta
si el arancel está vacío): mensaje que lleva a Configuración › Arancel de precios. Revisá cualquier otro `<select>` con `db.procedures` (ficha, Prestaciones, Copiloto) y pasalo
al buscador.

**C3 · Cargar el arancel desde un archivo de Excel (.xlsx).** Configuración › Arancel de precios › «Cargar desde Excel» hoy solo acepta pegar filas o un CSV, pide
código obligatorio y corta en 500 filas. Pasa a: **elegir un archivo `.xlsx`** (o `.xlsm`, `.csv`, `.tsv`, `.txt`), leerlo en el navegador, mostrar la **vista previa**
de siempre (nuevo / cambia / sin cambios / error) y recién ahí aplicar.
- Lector propio de `.xlsx` en `lib/xlsx.ts` (un `.xlsx` es un zip de XML): usa `fflate` (agregalo como dependencia directa; ya está en el árbol por `@types/three`).
  Devuelve las hojas visibles con sus filas como texto. Maneja cadenas compartidas (también con formato mixto), cadenas en línea, números, booleanos, fórmulas con valor guardado,
  celdas salteadas (referencias `B7`), filas vacías y varias hojas (se elige la hoja; por defecto la primera con datos). Rechaza con mensaje claro: archivo que no es `.xlsx`
  (`.xls` viejo, `.ods`, `.numbers`: «Guardalo como Excel (.xlsx) o CSV»), protegido con contraseña y demasiado grande (más de 8 MB o más de 20.000 filas). Probalo con archivos armados en
  memoria Y con un `.xlsx` real generado con `openpyxl` (guardalo como fixture chico en `lib/__fixtures__/`).
- **Nombre y precio, sin código**: una planilla «Prestación | Precio» (lo más probable en la práctica) tiene que funcionar. Con encabezado reconocido y sin columna de código, cada fila se empareja por
  **nombre** (sin tildes ni mayúsculas) con un servicio que ya existe (cambia el precio) o se **crea con un código automático** `S0001`, `S0002`… (sin chocar con los existentes). Sin encabezado y con dos columnas, si la
  primera tiene espacios o más de 20 letras es un nombre; si no, un código (como hoy). Un nombre repetido en el archivo es un error de esa fila.
- El tope sube a **3.000 filas por carga**; el archivo, hasta 8 MB. La vista previa sigue mostrando 60 filas y avisa «…y N más (se aplican igual)».
- La lógica de carga comparte un núcleo entre texto pegado y archivo (`analizarCargaDeFilas`), así los tests de `analizarCargaDePrecios` siguen valiendo.
- Lo cargado tiene que **salir en el formulario del plan y en «Dar cita»** (por `BuscadorPrestacion` sobre `db.procedures`): probalo de punta a punta en un e2e (subir `.xlsx` → aplicar → crear un plan y encontrar la prestación nueva).

## Frente D · Tareas pendientes

**D1 · Bandeja de tareas (`/app/tareas`).** Nueva lista **«Todas las pendientes (N)»**, **la primera y la que se abre por defecto** (con `?fecha=…&tarea=…` se
sigue abriendo «Tareas del día» de ese día, como hoy, para que los enlaces de Mi agenda y de la ficha no cambien). Muestra TODAS las tareas pendientes de cualquier fecha:
atrasadas, de hoy y futuras, de la más vieja a la más nueva, con la fecha en cada fila (las atrasadas en rojo, como ahora), respetando los filtros de tipo y de responsable. En esa
lista no hay navegación por día (el título es «Tareas pendientes»). Las postergadas («Volver a contactar en…») cuentan como pendientes con su fecha de regreso. «Tareas del día» y
«Tareas atrasadas» quedan como están. Lógica pura y con tests: `todasLasPendientes(filas, hoy)` en `lib/tareas.ts`.

**D2 · Mi agenda (Inicio).** Se suma la pestaña **«Todas»** junto a Hoy y Semana: todas MIS tareas pendientes de cualquier fecha (atrasadas primero, después por día), sin las hechas.
`Ambito` pasa a `"hoy" | "semana" | "todas"` en `lib/miAgenda.ts` (con tests); el resumen semanal y la IA siguen usando solo la semana. Si hay más de 10 por mostrar, un enlace
«Ver todas en Tareas» lleva a `/app/tareas`.

## Fuera de este pedido (decisiones para Camila y Angel)

- Que atender una cita marque como «realizadas» las prestaciones del plan que se eligieron al darla.
- «Dar cita» directo desde la lista de «Sin próxima cita».
- Bloqueos con excepciones dentro de una serie (hoy se quita uno o toda la serie).
- Archivos `.xls` (formato binario viejo): se pide guardarlos como `.xlsx`.
