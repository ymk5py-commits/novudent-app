# Dentalink — módulos, pantalla por pantalla

> Relevado el 30-jul-2026 sobre `auradentalclinic.dentalink.cl`. **Anonimizado**:
> los ejemplos de datos son inventados. Ver [00-sistema-de-diseno.md](00-sistema-de-diseno.md)
> para paleta, tipografía y árbol de navegación.
>
> Estado: **parcial**. Cubiertos Agenda, Pacientes, Cajas, Panel de desempeño y
> Ficha del paciente. Pendientes al final del archivo.

---

## Agenda — `/agendas/diario`

Vista por defecto al entrar. Cuatro modos en sub-tabs:

| Sub-tab | Ruta | Qué hace |
|---|---|---|
| **Diaria** | `/agendas/diario` | Lista de citas del día en tabla |
| **Semanal** ▾ | `/agendas/semanal/<fecha>/<idProfesional>` | Un desplegable **por profesional** |
| **Diaria global** | `/agendas/semanal2/<fecha>` | Todos los profesionales lado a lado |
| **Reprogramación** | `/agendas/reprogramacion` | Cola de citas a reubicar |

Acciones de cabecera: `Dar cita` (botón partido: acción + desplegable), `Fecha`,
`Imprimir` ▾, y un ícono de sobre (envío). El contador de citas del día va como
badge junto al título: **Agenda `9 Citas`**.

### Columna izquierda — filtros

- Navegador de fecha grande: `‹  30  ›` con día de semana arriba y mes/año abajo.
- Selector de profesional (`Todos los profesionales`).
- **Filtro por estado de cita con checkboxes y código de color** — cada estado
  tiene su barra de color a la izquierda:

```
Notificado por WhatsApp · Confirmado por Whatsapp · Anulado por pcte. vía Whatsapp
No confirmado · Agenda Online · Notificado vía email · Confirmado por teléfono
Confirmado por email · En sala de espera · Atendiéndose · Atendido · No asiste
Anulado · Anulado por la clínica
```

Catorce estados. Novudent tiene bastantes menos — vale mapearlos.

### Tabla de citas

| Columna | Contenido |
|---|---|
| **Hora** | Bloque `09:00 ↓ 11:00` (inicio, flecha, fin) |
| **Paciente** | Nombre como link + teléfono + **BOX asignado** + alertas (⚠ "Datos personales" si faltan campos) |
| **Doctor** | Profesional a cargo |
| **Estado de la cita** | Desplegable editable en línea (Atendido / No asiste / …) |
| **Situación** | Badge financiero: `Deudas` (rojo) · `Diagnóstico` (verde) · `No hay saldo` (naranja) |

Dos detalles a copiar:

1. **El estado de la cita se edita desde la fila**, sin abrir la cita.
2. **La columna "Situación" cruza agenda con finanzas**: la recepción ve si el
   paciente debe plata antes de atenderlo. Esto en Novudent no existe.

Hay además un banner promocional de WhatsApp descartable (upselling del add-on).

---

## Pacientes — `/clientes`

Sub-tabs: **Pacientes** ▾ (Habilitados / Deshabilitados) · **Configuración** ·
**Análisis** · **Pacientes de Ortodoncia**. Acción principal verde: `+ Nuevo paciente`.

Filtros: buscador por nombre/apellido, campo `Número`, desplegable `Tratamiento`,
botón `Buscar`.

Tabla con **encabezado azul sólido** (`#0088CC`, texto blanco):

| # | Nombre | Apellidos | Tratamientos | Deudas | ⋮ |
|---|---|---|---|---|---|
| 1234 | Ejemplo | De Prueba | 2 | No tiene | menú |

`Tratamientos` es el conteo de planes; `Deudas` muestra "No tiene" o el monto.
La columna `⋮` abre un menú contextual por fila.

---

## Cajas — `/cajas`

Sub-tabs: **Cajas abiertas** · **Cajas cerradas** · **Reportes** ▾ · **Mi caja** ·
**Buscar caja** ▾. Acción principal verde: `+ Abrir caja`.

Enlace de configuración arriba a la derecha: *"Configurar medios de pago a
considerar en reportería de esta sección"*.

### Tabla de cajas abiertas

| Usuario | Apertura | Detalle | Saldo anterior | Saldo inicial | Acumulado |
|---|---|---|---|---|---|
| Usuario Ejemplo | 17 Jul 2026 | ver detalle 🔍 | Gs. 0 | Gs. 0 | Gs. 0 |

Notable: hay cajas abiertas **desde 2022** sin cerrar. El sistema no fuerza el
cierre — es un dato de diseño, no un bug.

### Reportes de caja (sub-desplegable)

- Resumen de recaudación últimos 10 días
- Resumen cajas
- Pagos recibidos por período
- Pagos recibidos por período por profesional
- Resumen excel de cajas entre dos fechas

Columnas del detalle de pagos: `# Pago · Fecha · Responsable · Tipo pago ·
Medio pago · Total`.

Banner de advertencia permanente: los resúmenes **no reflejan** los pagos por
descuento por planilla.

---

## Panel de desempeño — `/dashboard`

El tablero de KPIs. Filtros arriba: **sucursal · mes · año · `Filtrar` ·
`Últimos 30 días`**. Cada panel tiene un `?` de ayuda contextual.

### Panel "AGENDA <MES>" (columna izquierda)

Cinco KPIs, cada uno con **número grande + etiqueta + sparkline** a la derecha:

| KPI | Ejemplo |
|---|---|
| Pacientes nuevos | 14 |
| Citas anuladas | 33 |
| Ocupación *(aproximado)* | 24% |
| Presupuestos | 42 |
| Atendidos vs agendados | 76% |

Debajo: gráfico de líneas **"Atenciones por mes"** (12 meses móviles) y una
tarjeta verde sólida con el total de atenciones del mes.

### Panel "VENTAS <MES>" (columna derecha)

- **Ventas (Acciones realizadas)** — monto enorme + comparativa contra el mes
  anterior con flecha y color (`↓ -55% menos que el mes anterior`).
- **Dona**: Ventas pagadas vs Deuda.
- **Recaudación (Pagos recibidos)** — mismo formato, con su comparativa.
- **Dona**: Recaudación de pacientes (venta) · Abonos no utilizados · Otros.
- **Barras agrupadas "Ventas y recaudación mensual"** — 12 meses, dos series
  (Ventas celeste `#8FC3D9`, Recaudación verde `#2E9E42`).

Distinción conceptual clave, y Novudent hoy no la hace:

> **Ventas ≠ Recaudación.** "Ventas" es lo ejecutado (acciones realizadas del plan);
> "Recaudación" es la plata que entró. Se reportan por separado y se comparan.

Técnico: 25 `<canvas>` en la página → librería de gráficos basada en canvas
(Chart.js o similar). Novudent usa Recharts (SVG); no hace falta cambiar.

---

## Ficha del paciente — `/clientes/ver/<id>` → `/pacientes/<id>/gestion/personales`

La instancia tiene activada la **"Nueva sección de pacientes"** (feature flag del
menú de usuario), que redirige al esquema de rutas nuevo.

### Cabecera (banda azul `#0076DB`)

```
[avatar con iniciales]  ID <n>
                        Nombre Apellido                 ⚠ Alertas médicas
                        DNI · -- · 28 años, 9M          ♥ Enfermedades
                        [Beneficios]                    ▤ Medicamentos
```

Las tres tarjetas de la derecha son **traslúcidas sobre el azul** y muestran
"Sin información" cuando están vacías. Novudent ya replica esto.

### Navegación de 2 niveles

**Nivel 1** (dentro de la banda, fondo blanco):
`Datos personales · Ficha clínica · Planes de tratamiento · Facturación y pagos · Recibir pago`
— y a la derecha, separadas: `📅 Agendar` · `⬇ Historia clínica`.

**Nivel 2** (dentro de Datos personales), con **badges de conteo**:
`Datos personales · Citas [2] · Comentarios administrativos · Tareas de gestión · Emails [14]`

### Formulario de Datos personales

Título grande + botón verde `Guardar datos` + menú `⋮`. Dos bloques:

**DATOS REQUERIDOS** — `TIPO` (con botón de lápiz para editar la lista),
`Nombre legal *`, `Apellidos *`, `Cédula identidad / DNI *` (+ checkbox
`Extranjero`), `Email *`, `Fecha nacimiento *` (tres campos: día / mes / año),
`Teléfono móvil *` (con selector de país y bandera).

**DATOS OPCIONALES** — `Nombre social`, `Convenio`, `Número interno`, `Sexo`,
`Género`, `Ciudad`, `Municipio`, `Dirección`, `Teléfono fijo`,
`Actividad o profesión`, `Empleador`, `Observaciones`, `Apoderado`,
`Referencia`, `DNI Representante Legal`.

Dos patrones que conviene copiar tal cual:

1. **Cada campo opcional trae su propio checkbox `No aplica`** — distingue
   "vacío porque no lo cargué" de "vacío porque no corresponde". Novudent no lo tiene.
2. **`Sexo` y `Género` son campos separados.** Novudent ya los tiene, bien.

Los campos obligatorios se configuran desde `Pacientes → Configuración` (el
asterisco sale de ahí, no está hardcodeado).

---

## Odontograma y plan de tratamiento

Documentado en detalle a partir de las capturas de referencia y ya **implementado**
en Novudent (commit `c0ce927`):

- Fila de coronas en línea (sin encía ni pulpa) → rueda oclusal → **numeración
  con punto (`1.8`, `2.1`) pegada a la rueda**, hacia el centro de la boca.
- Sub-tabs `Permanente / Temporal`, etiqueta `Odontograma Internacional FDI`,
  ayuda `?`.
- Tabs superiores del panel: `Odontograma · Fotografías del paciente`, con
  acciones `$` ▾, engranaje ▾, impresora ▾, enviar ▾.
- Fila de **Sextantes 1-6 + Arcada Superior/Inferior** con selector de color
  (negro/rojo/azul) y desplegable `Arcadas y Sextantes`.
- Tabla de prestaciones: `+ Sección` · `+ Prestación` · `Acciones` ▾, columnas
  `PIEZA · DSCTO · PRECIO · PAGO` (esta última, un semáforo de color).
- Tarjetas debajo: **Firma del paciente** (consentimientos) y **Comentarios para
  el paciente** *(se incluirán en la impresión de presupuestos)*.
- Columna izquierda: panel financiero azul con `Presupuesto total`,
  `Descuento comercial`, `Realizado`, `Abonado`, más `Profesional a cargo`,
  `Convenio`, `Sucursal` y **`Citas del paciente`** (historial con nº de cita,
  fecha, profesional, sucursal, estado y duración).

---

## Continúa en

- [02-administracion.md](02-administracion.md) — Arancel, Gastos, Usuarios,
  Inventario, Laboratorios, Liquidaciones, Convenios, Planes y servicios.
- [03-reportes-y-crm.md](03-reportes-y-crm.md) — los 15 reportes gráficos,
  Tareas de gestión, Encuestas, Recibir pago y Plan de tratamiento.

## Pendiente de relevar

- Email Marketing (`/CRM/report`) y el catálogo de Reportes Excel
- Ficha clínica del paciente (evoluciones, antecedentes) — las sub-rutas cargan
  de forma diferida y no rindieron estructura desde el DOM
- Agenda semanal y Diaria global (vistas de calendario)
- Administración: especialidades, boxes, agenda online, bancos, logotipo,
  medios de pago y pagos anulados
- *Planes y servicios*, bloqueado: la sesión usada no es administradora
