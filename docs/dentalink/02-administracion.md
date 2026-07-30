# Dentalink — módulo Administración

> Relevado el 30-jul-2026 sobre `auradentalclinic.dentalink.cl`. **Anonimizado.**
>
> **Limitación del relevamiento:** la sesión usada no es administradora
> (`hasAdminPermission: false`). Las secciones marcadas **🔒** devolvieron
> *"No tienes permisos para acceder a esta sección"*, así que su estructura interna
> queda sin relevar. Con un usuario admin se completan.

---

## Arancel de precios — `/administracion/prestaciones`

El catálogo de prestaciones y su precio. **Soporta varios aranceles** (listas de
precio) seleccionables desde un `<select name="arancel-selector">`.

**Sub-tabs:** `De acciones Clínicas` · `De Laboratorio` — dos catálogos separados.

**Acciones:** `Nuevo arancel` · `Plantillas` · `Opciones de este arancel` ·
`Agregar categorías`.

**Columnas:** `Nombre · Tipo · Categoría · Acciones`.

Modales: *Eliminar arancel* (con confirmación destructiva explícita
—"Si, estoy seguro. Borrar!"—), *Editar el nombre del arancel*, *Editar el nombre
de la categoría*. Hay `Establecer cambio` / `Deshacer cambio`: los cambios masivos
de precio son reversibles.

> **Para Novudent:** hoy tenemos un solo arancel. Dentalink soporta N listas de
> precio (útil para convenios y para sucursales con precios distintos) y separa
> prestaciones clínicas de las de laboratorio. Y las **plantillas** de arancel
> son lo que hace que una clínica nueva no arranque de cero.

## Gastos — `/administracion/costos/gestionar`

**Sub-tabs:** `Detalle` · `Resumen por categoría`.

**Filtros:** `month` · `year` · `sucursal` · `id_nombre_costo` (categoría) · `id_caja`.

**Columnas:** `Categoría · Detalle · Fecha factura · Fecha pago · Total`.

**Formulario de gasto:** `Nombre` · `Categoría` · `Fecha factura` · `Detalle` ·
`Monto` · `Fecha pago`. Las categorías se crean/eliminan desde la misma pantalla.

> Dos fechas distintas — **factura** y **pago** — es lo que permite el reporte de
> resultados por devengado vs percibido. Novudent hoy guarda una sola.
> Y el gasto se puede imputar a una **caja**, lo que lo conecta con el arqueo.

## Usuarios — `/administracion/usuarios/listar` 🎨

Esta pantalla usa el **sistema de diseño nuevo** de Dentalink, no el Bootstrap 2
del resto: tarjetas con borde redondeado, avatar circular con inicial, botón
primario azul sólido `Nuevo usuario +`, paginación tipo `Elementos por página 15`.
Están migrando la app por partes.

**Sub-tabs:** `Usuarios` · `Edición de contratos`.

**Filtros:** buscador por nombre o email · `Habilitados` ▾ · `Todos` ▾ (por tipo).

**Lista:** avatar · nombre · email · **Tipo** (ej. `Clínico`) · lápiz de edición · `⋮`.

Otras acciones vistas: `Generar bloqueo para todos`, `Reactivar seleccionadas`,
`Imprimir citas` — o sea que desde acá también se gestionan **bloqueos de agenda**
por profesional (con columnas `Fecha · Hora · Duración`).

## Inventario — `/administracion/inventarios/productos`

El módulo más completo de los relevados.

**Sub-tabs:** `Productos` · `Movimientos` · `Stock de seguridad`.

**Acciones:** `Ingresar productos` · `Sacar productos` · `Crear bodega` · `Mover` ·
`Entregar producto` · `Reingresar producto` · `Descargar` · `Imprimir`.

**Columnas de Productos:** `Producto · Stock de seguridad · Stock actual ·
Precio promedio · Precio venta`.

**Columnas de Movimientos:** `Operación · Fecha · Proveedor · Cantidad · Detalle ·
Precio unitario`.

**Columnas de entregas:** `# · Dr(a) · Nr. Atención · Paciente · Stock · Tipo ·
N° lote · Expiración`.

Piezas que Novudent no tiene:

- **Bodegas múltiples** (`Nombre nueva bodega`, mover stock entre bodegas).
- **Lote y fecha de expiración** — obligatorio para insumos clínicos.
- **Precio promedio ponderado** además del precio de venta.
- **Reporte de quiebre de stock**: *"lista de sugerencia de productos que se deben
  reponer, basados en su stock de seguridad"*.
- **Entrega de producto atada a una atención y a un paciente** — así el consumo se
  imputa al tratamiento.

## Laboratorios — `/administracion/laboratorios/ver`

**Sub-tabs anidados:**

```
Laboratorios          → Habilitados / Deshabilitados
Prestaciones de lab.  → Habilitadas / Deshabilitadas
Solicitudes           → Pendiente / En proceso / En revisión / Finalizada
```

**Columnas de laboratorios:** `Nombre · Detalle · Por pagar · Acciones`.

**Alta de laboratorio:** `Nombre` · `Dirección` · `Email` · `Teléfono` · `Detalle`.

> El **flujo de 4 estados** de la solicitud (Pendiente → En proceso → En revisión →
> Finalizada) y la columna **`Por pagar`** (cuenta corriente con el laboratorio)
> son lo que a Novudent le falta: hoy tenemos órdenes pero no el ciclo ni el saldo.

## Liquidaciones — `/liquidaciones/verActivas`

Lo que se le paga a cada profesional.

**Sub-tabs:** `Activas` · `Finalizadas` · `Descargar...` ▾. Filtro por sucursal
(`Todas las sucursales` / una en particular).

**Columnas:** `Seleccionar · Nombre · Apellidos · Fecha · Realizado · A Pagar ·
Detalle · Finalizar`.

**Acciones:** `Finalizar todas` · `Finalizar liquidaciones seleccionadas` (en lote,
con modal *"Especificar fecha de liquidación"*) · `Descargar`.

Distinción importante: **`Realizado`** (lo que el profesional ejecutó) vs
**`A Pagar`** (lo que le corresponde según su contrato). No son lo mismo, y el
contrato se define en `Usuarios → Edición de contratos`.

## Convenios — `/administracion/convenios/listar`

**Sub-tabs:** `Listar` (Habilitados / Deshabilitados) · `Reporte deudas`.

**Columnas:** `# Id · Empresa · Fecha afiliación · Convenio`.

**Acciones:** `Agregar convenio` · `Crear convenio` · `Elegir convenio`.

> El convenio es **con una empresa** y el paciente se afilia con fecha. El
> `Reporte deudas` es por convenio: se le factura a la empresa, no al paciente.
> Es un modelo B2B que Novudent no contempla.

## Planes y servicios — `/administracion/consumibles` 🔒

El panel de autogestión de la suscripción. Sub-tab visible:
`Mis servicios contratados`.

Aunque el contenido está bloqueado para esta sesión, el header expone los add-ons
contratables (ver [00-sistema-de-diseno.md](00-sistema-de-diseno.md) §4).

**Patrón de permisos a copiar:** Dentalink **muestra el ítem del menú igual** y
recién al entrar despliega un estado vacío amable con un ícono de prohibido y el
texto *"No tienes permisos para acceder a esta sección"*. No lo esconde. Discutible,
pero es coherente: el usuario sabe que la función existe y puede pedirla.

## Otras secciones (no relevadas en detalle)

| Sección | Ruta | Estado |
|---|---|---|
| Gestión de especialidades | `/administracion/especialidades` | pendiente |
| Planificación y uso de Box/Sillones | `/administracion/boxes/planificacion` | render vacío (carga diferida) |
| Agenda Online | `/administracion/agendaonline` | pendiente |
| Bancos y entidades financieras | `/administracion/bancos` | pendiente |
| Logotipo | `/administracion/imagenes/nueva` | pendiente |
| Opciones de pago | `/administracion/mediosdepago` | pendiente |
| Pagos anulados y pendientes | `/pagos/eliminados` | pendiente |
