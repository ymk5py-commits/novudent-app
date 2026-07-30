# Dentalink — Reportes y CRM

> Relevado el 30-jul-2026 sobre `auradentalclinic.dentalink.cl`. **Anonimizado.**

---

## Estructura de Reportes

Tres familias bajo el mismo menú:

1. **Panel de desempeño** (`/dashboard`) — el tablero de KPIs, documentado en
   [01-modulos.md](01-modulos.md).
2. **Reportes gráficos** (`/reportes/*`) — 15 informes, cada uno una pantalla.
3. **Reportes Excel** (`/solicitudes_reportes`) — más de 50, se piden y se
   descargan de forma asíncrona (cola de solicitudes).

Los reportes gráficos comparten un **chasis común**:

```
┌────────────────────────────────────────────────────────────────┐
│ [Reportes gráficos] [Otros gráficos ▾]        ← selector de informe │
├────────────────────────────────────────────────────────────────┤
│ Título                          En base a: [ ▾ ]  [sucursal ▾] │
│ Párrafo explicando qué mide     Desde: [fecha]  Hasta: [fecha] │
│ el gráfico                                        [ Generar ▶ ] │
├────────────────────────────────────────────────────────────────┤
│                        GRÁFICO                                  │
├────────────────────────────────────────────────────────────────┤
│                    TABLA DE RESPALDO                            │
│         (los mismos datos, mes a mes, en números)               │
└────────────────────────────────────────────────────────────────┘
```

Cuatro decisiones de diseño que vale copiar:

- **Cada informe explica en prosa qué mide**, arriba a la izquierda, antes del
  gráfico. No asume que el dueño de la clínica sepa leerlo.
- **Siempre hay tabla debajo del gráfico** con los mismos datos. El gráfico
  comunica, la tabla se audita y se copia.
- **El rango por defecto son 13 meses** (mes actual + 12 hacia atrás), de modo que
  siempre se ve el mismo mes del año anterior.
- El selector de informe está **dentro de la pantalla**, no solo en el menú: se
  salta de un reporte a otro sin volver a navegar.

### Catálogo de reportes gráficos

| Reporte | Ruta | Qué mide |
|---|---|---|
| **Resultados** | `/reportes/resultados` | **% de ganancia sobre costos** por período. Barras verdes con el % encima de cada mes y tabla con Ventas / Costos abajo. Selector `En base a:` = `Acciones clínicas realizadas` (o alternativas) |
| **Flujos de dinero** | `/reportes/flujos` | Entradas y salidas mes a mes, 13 columnas |
| **Análisis de pacientes** | `/clientes#analisis` | Vive dentro de Pacientes, no en Reportes |
| **Gastos** | `/reportes/gastos` | Gasto por categoría y período |
| **Eficiencia por profesional** | `/reportes/ventaspordentista` | `Profesional · Ventas · Ventas/Horas atendidas · Horas atendidas · Presupuestado` |
| **Ventas por prestación** | `/reportes/ventasporprestacion` | Ranking de prestaciones |
| **Ventas por categoría** | `/reportes/ventasporcategoria` | Agrupado por categoría del arancel |
| **Eficiencia de captación de presupuestos** | `/reportes/eficienciapresupuestos` | Tasa de conversión presupuesto → tratamiento |
| **Informe de recaudación diario** | `/reportes/informediario` | Cierre del día |
| **Ranking profesionales** | `/reportes/presupuestosdentistas` | Quién presupuesta más |
| **Pacientes morosos** | `/reportes/morosos` | Ver abajo |
| **Estado de financiamientos** | `/reportes/estadofinanciamientos` | Ver abajo |
| **Estado de descuentos por planilla** | `/reportes/estadodesctoplanillas` | Descuentos vía empleador (convenios) |
| **Derivación de pacientes** | `/reportesgraficos/derivaciones` | De dónde vienen los pacientes |
| **Presupuestos capturados** | `/reportesgraficos/presupuestos-capturados` | Presupuestos que se convirtieron |

### Pacientes morosos — `/reportes/morosos`

Columnas: `Nombre · Paciente · Contacto · Mora · Balance` más **tres tramos de
antigüedad**:

```
30 días o menos   |   Entre 30 y 60 días   |   60 días o más   |   Total
```

Es un **aging de cuentas por cobrar** clásico. Novudent hoy muestra "deuda" como
un número plano; sin los tramos no se puede priorizar la cobranza ni disparar
gestiones distintas según la antigüedad.

### Estado de financiamientos — `/reportes/estadofinanciamientos`

Proyección **hacia adelante**: las columnas son los próximos 16 meses
(`07/2026 … 10/2027`). Muestra cuánto se espera cobrar por cuotas comprometidas.
Es el único reporte que mira al futuro; el resto mira hacia atrás.

### Eficiencia por profesional — `/reportes/ventaspordentista`

La métrica interesante es **`Ventas/Horas atendidas`**: productividad por hora de
sillón, no venta bruta. Es lo que permite comparar a un ortodoncista con un
odontopediatra sin que la comparación sea injusta.

---

## CRM

### Tareas de gestión — `/tareas/app`

Un motor de tareas con **tipos predefinidos y automáticos**, no una lista genérica:

| Tipo | Para qué |
|---|---|
| **Cobranza** | Perseguir deuda |
| **Control** | Traer al paciente al control periódico |
| **Captura** | Convertir un presupuesto no aceptado |
| **Cita** | Seguimiento de la cita (confirmar, reagendar) |
| **Personalizada** | Manual, la crea el usuario |

**Vistas:** `Tareas del día` · `Tareas atrasadas` **con contador** (la instancia
relevada tenía 720 atrasadas). Filtros: `Sólo mías`, por tipo, y
`Esconder tareas completadas por sistema`.

**Configuración de plazos:** cada tipo de tarea define cuándo se dispara —
`Inmediato · 1 día · 1 semana · 1 mes · 1 año · otro`.

Layout: lista a la izquierda, panel de detalle a la derecha
(*"Seleccione una tarea para ver su detalle"*). Navegación por día con
`‹ Anterior · Fecha · Siguiente ›`.

> Esto es el corazón del CRM de Dentalink y donde más lejos estamos. La clave no
> es la lista: es que **el sistema genera las tareas solo** a partir de eventos
> (deuda vencida, presupuesto sin aceptar, control cumplido) y las marca como
> completadas también solo. El usuario gestiona excepciones, no carga tareas.

### Encuestas de satisfacción — `/encuestas/app`

**Sub-tabs:** `Encuestas` · `Configuración de envío` · `Resultados`.

Dos modalidades intercambiables: **encuesta cualitativa** o **NPS**
(botón `Cambiar a una encuesta NPS`). Medio de envío: **Email**.

**Columnas de la lista:** `Nombre · Creada por · Última edición · Envíos ·
Enviado por · Respuestas · Estado`.

Configuración: `Mensaje de la encuesta`, `Encuesta actual`,
`Atributos a medir (encuestar)`.

En la instancia relevada: 2.456 envíos → 327 respuestas (**13,3% de respuesta**).

### Email Marketing — `/CRM/report`

No relevado en detalle.

---

## Recibir pago — `/pagos/registrar/<idPaciente>`

Pantalla *"Ingresar un pago"*, con dos bloques independientes:

**1. Planes de tratamiento** — *"Selecciona el plan de tratamiento a pagar o a la
cual generar el link de pago."*

| Presupuestos | Total presupuesto | Realizado | Pagado | Saldo por abonar |
|---|---|---|---|---|

Botón `Pagar tratamiento(s) ›`.

**2. Por cuotas de financiamiento**

| Cuotas de crédito | Monto | Pagado | Saldo por abonar |
|---|---|---|---|

Botón `Pagar cuotas »`.

Tres cosas a notar:

- **Cuatro columnas de estado, no dos.** `Total presupuesto` (lo cotizado),
  `Realizado` (lo ejecutado), `Pagado` (lo cobrado), `Saldo por abonar`. Un
  paciente puede tener realizado > pagado (debe) o pagado > realizado (abonó
  a cuenta). Novudent ya replica esto.
- **El financiamiento se cobra por separado** de los planes: son dos circuitos.
- **"o a la cual generar el link de pago"** — el link de pago se genera desde acá.
  Es el add-on *Pagos online*, y es lo único de la paridad que en Novudent sigue
  pendiente por falta de pasarela.

---

## Plan de tratamiento — `/pacientes/<id>/tratamiento/<idPlan>`

La ruta vieja `/tratamientos/ver/<idPlan>` redirige acá.

**Columna izquierda:** `Nuevo plan de tratamiento` (editable) · `Resumen clínico` ·
panel financiero · `Profesional a cargo` · `Convenio` · `Sucursal` ·
**`Citas del paciente`** con `Ver todas las citas`.

**Columna derecha:** `Odontograma Internacional FDI` (con ayuda
*"¿Cómo se usa el Odontograma?"*), la fila de sextantes/arcadas, y la tabla de
prestaciones con `+ Sección` · `+ Prestación` · `Acciones ▾`.

**Debajo:** `Diagnóstico` y `Evoluciones`, ambos con **editor de texto rico**
(negrita, itálica, subrayado, pantalla completa) y botón **`Usar una plantilla``**.

Acciones de estado del plan: `Desbloquear` · `Reactivar` — el plan se **bloquea**
(cerrado a edición) y se puede reabrir.

> Dos cosas para Novudent: las **plantillas de texto** para diagnóstico y evolución
> (el dentista no escribe de cero cada vez), y el **bloqueo/reapertura del plan**,
> que es lo que da trazabilidad legal a la ficha.

---

## Qué queda sin relevar

- Email Marketing (`/CRM/report`)
- Reportes Excel (`/solicitudes_reportes`) — el catálogo de 50+
- Agenda semanal y Diaria global (vistas de calendario)
- Ficha clínica del paciente (evoluciones, antecedentes) — las sub-rutas cargan
  de forma diferida y no rindieron estructura desde el DOM
- Administración: especialidades, boxes, agenda online, bancos, logotipo,
  medios de pago, pagos anulados
- **Todo lo que requiere permiso de admin** (`Planes y servicios`), por la sesión
  usada
