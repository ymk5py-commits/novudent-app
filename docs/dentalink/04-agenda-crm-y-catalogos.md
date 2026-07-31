# Dentalink — vistas de agenda, CRM de email, catálogos y los 74 reportes Excel

> Segunda tanda de relevamiento, 31-jul-2026, sobre `auradentalclinic.dentalink.cl`.
> **Anonimizado.** Completa lo que quedó pendiente en
> [01-modulos.md](01-modulos.md), [02-administracion.md](02-administracion.md) y
> [03-reportes-y-crm.md](03-reportes-y-crm.md).

---

## Agenda semanal — `/agendas/semanal/<fecha>/<idProfesional>`

Grilla de **7 días × franjas de 30 minutos**, desde las 08:00. Cabecera con el
rango (`27 de Julio al 02 de Agosto`) y flechas `‹ ›` para moverse de semana.

Dos selectores que conviven, y esto es lo importante:

- **Por profesional** — un desplegable, y además el sub-tab `Semanal ▾` abre la
  lista de los profesionales para saltar entre agendas.
- **Por sillón** — un chip `Sillon 1` **con badge de cantidad de citas** (28 en la
  semana relevada). O sea que la misma grilla se puede mirar por persona o por
  recurso físico.

Junto a ellos, un link **`Sobre Agendamiento`** (overbooking).

### Cómo se leen las celdas

| Estado de la celda | Cómo se ve |
|---|---|
| Hueco libre | Fondo verde claro, con un **`+` verde** para agendar ahí mismo y un pin de ubicación |
| Cita ocupada | Bloque de color según el estado, con el nombre del paciente y un `⌄` que abre acciones |
| Bloqueo | Bloque rayado en diagonal |
| Cita con alerta | Ícono `!` rojo antes del nombre |

El color del bloque codifica el estado de la cita. Los que aparecen en la leyenda:
`Atendido · Atendiéndose · Confirmado por teléfono · En sala de espera · No asiste ·
No confirmado · Anulado`.

### Modal de agendar

Se abre `Dar cita (agendar)` con dos pestañas: **`Paciente existente`** /
**`Paciente nuevo`** — se puede crear el paciente sin salir de la agenda.

Campos: `Doctor` · **`Recurso`** (el sillón/box) · `Paciente` · `Hora(s)` ·
`Dirección de atención`.

Otras acciones desde la grilla: **`Bloquear`** (reservar franjas sin paciente) y
**`Cambiar de tratamiento esta cita`** — o sea que la cita se puede reasignar de
un plan de tratamiento a otro después de creada.

Al elegir un hueco, además, ofrece ver disponibilidad **`Con este profesional`** /
**`Con otros profesionales`**.

## Agenda diaria global — `/agendas/semanal2/<fecha>`

Un día, **todos los profesionales lado a lado**. Cada uno con su **propia columna
de horas** a la izquierda de su columna de citas, lo que evita tener que seguir
una fila larguísima con la vista.

Controles: navegación por día (`‹ Jueves, 30 de Julio de 2026 ›`), un toggle
**`Mostrar Sobre Agendamiento`** y un filtro **`Todas las especialidades`**.

> Es la vista de recepción: se ve de un vistazo quién tiene hueco ahora.
> Novudent tiene agenda diaria y semanal, pero no esta.

## Planificación de Box/Sillones — `/administracion/boxes/planificacion`

Grilla semanal **por box**: `Box 1` con los 7 días y franjas horarias de **06:00 a
23:00**. Define en qué horarios está disponible cada sillón; es lo que alimenta el
campo `Recurso` del modal de agendar y el selector por sillón de la agenda semanal.

---

## Agenda Online — `/administracion/agendaonline`

El módulo de reserva web del paciente. Bastante más profundo de lo que parecía.

**Tabs:** `Agenda Online` · `Agenda Express` · `Campañas` · `Dashboard`.

Arriba de todo, la **URL pública de reserva**: un `Dirección de Agendamiento` con
selector (`Todos los Profesionales` o uno en particular) y el link acortado
—forma `https://ff.healthatom.io/<código>`— con botón de copiar. O sea que se
puede generar un link **por profesional**, no uno solo para la clínica.

**Sub-tabs de configuración:** `Configuración de Citas` · `Configuraciones
Administrativas` · `Configuración de Profesionales`.

### Lo configurable (con la explicación que da la propia app)

- **Configuración especial**: agendar por especialidad, por profesional, por
  sucursal o las tres; pedir los datos del paciente **al principio o al final**;
  que el paciente elija profesional o que se asigne al azar; si se pregunta el
  motivo de atención.
- **Cantidad de bloques por cita**: `1 · 2 · 3 · 4 · 5`. *"Si un profesional tiene
  un intervalo de 15 minutos, 2 bloques equivaldrían a 30 minutos."*
- **Máximo de días de disponibilidad**: `30 · 45 · 60 · 90 días`.
- **Anticipación mínima**: `0 · 1 · 2 · 4 · 8 horas`.

Y hay un tab **`Campañas`** propio, más un reporte "Citas agendadas online por
campañas": **las reservas web se atribuyen a la campaña que las trajo**.

> Novudent tiene `/reservar/<clinicId>`, pero plano: sin bloques configurables,
> sin ventana de disponibilidad, sin anticipación mínima, sin link por
> profesional y sin atribución a campaña. La anticipación mínima es la que más
> duele: sin ella un paciente reserva para dentro de 10 minutos.

---

## CRM · Email Marketing — `/CRM/report`

**Tabs:** `Reportes` · `Campañas de Marketing` · `Plantillas` · `Configuración`.

El flujo, según la propia app: **segmentar desde Reportes → crear la campaña sobre
ese segmento → analizar resultados**. El tercer paso está marcado
**"Próximamente!"**, o sea que a julio de 2026 el analytics de campañas todavía no
existe en Dentalink.

### Entregabilidad — lo más interesante técnicamente

Un banner explica que, por los requisitos que Gmail y Yahoo adoptaron, los correos
salen autenticados desde un subdominio propio de ellos
(`<clinica>@crm1.notificacionclinica.com`), y ofrece **`Usar dominio
personalizado`** con verificación de dominio para no caer en spam.

> Esto vale anotarlo para Novudent: si algún día mandamos email masivo, la
> autenticación del dominio (SPF/DKIM/DMARC) no es opcional — sin eso los correos
> no llegan. Dentalink lo resolvió con un subdominio propio por defecto y
> verificación opcional del dominio del cliente.

Además: saludos automáticos de cumpleaños (mencionado en la descripción del módulo).

---

## Gestión de especialidades — `/administracion/especialidades`

**Tabs:** `Habilitadas` / `Deshabilitadas`.

**Columnas:** `Id · Nombre · Plantillas · Motivo de atención · Prestaciones`.

Cada especialidad ata cuatro cosas:

1. **Plantillas** de **`Prescripciones`** y **`Evoluciones`** (botones propios) —
   los textos precargados que el dentista usa en la ficha, por especialidad.
2. **Motivo de atención** — lo que se ofrece en la agenda online.
3. **Prestaciones** — qué del arancel corresponde a esa especialidad.
4. Un **arancel** asociado a la plantilla (`Arancel de la plantilla`).

> Es el nodo que conecta agenda, ficha clínica y arancel. Novudent trata la
> especialidad como una etiqueta suelta del profesional; acá es la pieza que
> define qué se puede agendar, qué se puede cobrar y qué texto aparece en la
> evolución.

## Opciones de pago — `/administracion/mediosdepago`

**Tabs:** `Medios de pago` (Habilitados / Deshabilitados) · **`Descuentos por
caja`** · **`Descuentos por usuario`**.

**Columnas:** `Medio de pago · **Retención** · **Permite devolución**`.

Dos campos que Novudent no tiene:

- **Retención**: el porcentaje que se queda el medio de pago (la comisión de la
  tarjeta). Sin esto, el "Estado de Resultado" reporta ingresos inflados.
- **Permite devolución**: por medio de pago. No todos admiten reverso.

## Bancos y entidades financieras — `/administracion/bancos`

Simple: `Nombre · Tipo · Cambiar estado`, con `Agregar un banco` y
habilitar/deshabilitar. Alimenta los cheques y las transferencias.

## Pagos anulados y pendientes — `/pagos/eliminados`

**Tabs:** `Pagos anulados` · **`Gestión de Cheques`** (`Cheques por cobrar` /
`Cheques cobrados` / `Cheques anulados`).

**Columnas de anulados:** `# · # Trat. · Paciente · Medio pago · **Recepción** ·
**Eliminación** · Monto` — guarda las dos fechas: cuándo se recibió y cuándo se
anuló, con trazabilidad de ambas.

> **El módulo de cheques es una ausencia completa en Novudent.** En Paraguay y en
> buena parte de LATAM el cheque diferido sigue siendo medio de pago corriente en
> tratamientos largos, y hay que seguirlo por estado hasta que se cobra.

---

## Reportes Excel — `/solicitudes_reportes`

**74 reportes**, no "más de 50" como dice su marketing. Se piden y se generan de
forma asíncrona: hay tabs `Solicitar reportes` / **`Historial de solicitudes`**, un
buscador, y cada reporte muestra **`Descargar último reporte de hace X`** — o sea
que cachea la última corrida y se puede bajar sin regenerar.

**Categorías** (barra lateral): `Todas · Agenda · Arancel de precios · Convenios ·
CRM · Finanzas · Inventario · Laboratorios · Liquidaciones · Pacientes · Tratamientos`.

### El catálogo completo

**Agenda y citas**
```
Citas pacientes
Citas cuyo estado haya sido alguno de los disponibles en la lista
Horas bloqueadas en Profesionales
Estados citas pacientes en mes específico
Cupos y Ocupación
Citas, sus estados y si son de diagnóstico o tratamiento
Estados citas pacientes por sucursal y rango de fechas
Resumen de estados de cita por profesional entre dos fechas
Citas agendadas dentro de un rango de fechas
Citas agendadas online por campañas
```

**Pacientes**
```
Seguimiento Pacientes
Pacientes odontograma
Pacientes morosos
Pacientes ortodoncia
Consentimientos informados
Pacientes nuevos registrados en el sistema entre:
Pacientes nuevos registrados en el sistema según su primera cita:
Pacientes nuevos registrados en el sistema desde Agenda Online:
Pacientes nuevos con el primer profesional que los atendió
Pacientes que han sido tratados por un profesional específico
Pacientes sin tratamientos o con una sola cita asistida.
Evoluciones de Pacientes
Respuestas de encuestas de satisfacción
```

**Tratamientos y presupuestos**
```
Planes de Tratamiento de un paciente
Prestaciones desrealizadas
Tratamientos resumen saldos
Acciones realizadas en un período
Planes de tratamientos que se encuentran finalizados
Planes de tratamiento que no se encuentran finalizados y no poseen citas futuras
Estado presupuestos generados
Estado presupuestos generados detalle por acción
Presupuestos capturados en un periodo de tiempo
Listado de acciones que no se encuentran realizadas pero si se encuentran pagadas
Des-expiraciones
```

**Finanzas y pagos**
```
Pagos pacientes
Pagos pacientes, detalle por acción
Pagos pacientes por fecha de vencimiento
Pagos pacientes por fecha de vencimiento, incluyendo pagos al día
Pagos eliminados de pacientes
Pagos financiamientos
Pagos sin boleta asociada
Pagos descuento por planilla
Descuentos por caja
Cheques por cobrar
Estado de financiamientos
Pacientes morosos por Financiamiento
Flujo
Flujo de Caja
Estado de Resultado (operacional)
Detalle de Gastos
```

**Convenios y descuento por planilla**
```
Afiliados a convenios
Listado convenios
Estado de pagos de presupuestos por convenio
Informe de Cobranza de Descuentos por Planilla
Informe de Cobranza de Descuentos por Planilla (Intervalo de fechas)
Estado de descuentos por planilla
Descuento por planilla originales
Descuento por planilla actuales
```

**Laboratorios**
```
Solicitudes de laboratorio en proceso
Solicitudes de laboratorio en revisión
Solicitudes de laboratorio finalizadas no pagadas
Todas las solicitudes de laboratorio
Acciones de laboratorio más solicitadas
Precio de Acciones de Laboratorio vs Costo de laboratorio
Margen de ganancias de los laboratorios
```

**Inventario, arancel, liquidaciones y CRM**
```
Transacciones de Inventario:
Productos de inventario
Stock de seguridad
Arancel de precios
Plantillas de Arancel
Liquidaciones
Liquidaciones finalizadas
Tareas de gestión generadas en un periodo de tiempo
Tareas de gestión a vencer en un período de tiempo
```

### Tres cosas que este catálogo revela

1. **Descuento por planilla es un circuito entero** (8 reportes). Es el convenio
   donde la empresa descuenta la cuota del sueldo del empleado. Novudent no lo tiene.
2. **Hay dos reportes sobre las tareas de gestión** — generadas y a vencer en un
   período. Confirma que su motor de tareas materializa filas con historia, que es
   justo lo que nosotros decidimos no hacer. Si Aura pide ese reporte, hay que
   revisar la decisión.
3. **"Pagos sin boleta asociada"** y **"Estado de Resultado (operacional)"**
   apuntan a que el módulo financiero llega hasta contabilidad, no se queda en caja.

---

## Qué sigue sin relevar

- **Planes y servicios** (`/administracion/consumibles`) — bloqueado: la sesión
  usada no es administradora. Es el panel de autogestión de la suscripción y los
  add-ons; para verlo hace falta entrar con el usuario admin.
- **Ficha clínica del paciente** (evoluciones, antecedentes) — las sub-rutas cargan
  de forma diferida y no rindieron estructura desde el DOM. Habría que recorrerlas
  a mano con capturas.
- **Logotipo** (`/administracion/imagenes/nueva`) — trivial, sin relevar.
- Los sub-tabs internos de **Agenda Express**, **Campañas** y **Dashboard** de
  Agenda Online.
