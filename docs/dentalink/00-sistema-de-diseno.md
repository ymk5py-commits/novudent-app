# Dentalink — sistema de diseño y arquitectura de navegación

> Relevado el **30-jul-2026** sobre la instancia real `auradentalclinic.dentalink.cl`
> (plan **Titanium**, sucursal AURA ESTHETIC CENTER), leyendo el CSS y el estado
> de la propia app, no a ojo.
>
> **Sin datos de pacientes.** Todo lo que acá figura es estructura: menús, rutas,
> columnas, controles y tokens visuales. Donde hizo falta un ejemplo va un valor
> inventado. Nada de nombres, documentos, teléfonos ni datos clínicos reales.
>
> **Qué se clona y qué no.** Estructura, flujos, nomenclatura funcional y
> disposición: sí — son aspectos funcionales, no expresivos. El logotipo de
> Dentalink, sus ilustraciones y sus textos de marketing palabra por palabra: no.
> Los iconos son **Font Awesome 6 Pro**, que es de licencia paga: en Novudent hay
> que usar el equivalente de FA Free o lucide (que ya usamos).

---

## 1. Stack detectado

| Capa | Qué usa |
|---|---|
| Tipografía | **Open Sans** (Google Fonts, pesos 300/400/600/700) |
| Tipografías secundarias | Roboto e Inter (cargadas, uso puntual) |
| Iconografía | **Font Awesome 6 Pro** (+ `v4-shims`) — licencia paga |
| CSS base | **Bootstrap 2.x** (la paleta es literalmente la de Bootstrap 2) |
| Header superior | **React + styled-components** (clases `sc-*`), montado sobre el resto |
| Resto de la app | Server-rendered clásico, rutas con path plano (`/clientes/ver/<id>`) |
| Soporte embebido | Intercom (chat + "Novedades") |
| Assets | `s3.amazonaws.com/dentalink-static/` |

El header es una isla de React sobre una app server-rendered: se hidrata con un
objeto global `window.header_data` que trae el menú completo, el plan contratado,
los add-ons habilitados y la sucursal activa.

## 2. Tokens visuales

### Color

| Token | Hex | Dónde |
|---|---|---|
| Azul de marca (barra superior) | `#0076DB` | Franja superior con logo, buscador y usuario |
| Azul primario / links | `#0088CC` | Enlaces, encabezado de tablas, acentos |
| Cian de acción | `#49AFCD` | Botones de acción secundaria (ej. "Dar cita") |
| Verde éxito | `#468847` / `#5BB75B` | Botón "+ Nuevo paciente", estados OK |
| Rojo alerta | `#B94A48` | Badge "Deudas", validaciones |
| Texto principal | `#333333` | Todo el cuerpo |
| Texto atenuado | `#999999` · `#666666` · `#555555` | Secundarios, ayudas |
| Bordes | `#DBDBDB` · `#E5E5E5` | Tablas, tarjetas, separadores |
| Fondo de zona | `#F5F5F5` | Bandas y encabezados de sección |
| Fondo de página | `#FFFFFF` | La app es **blanca**, no gris |
| Azul acero | `#8394A5` · `#5B7291` | Iconos y textos de apoyo |

### Tipografía

| Uso | Valor |
|---|---|
| Base del `body` | Open Sans **14px** / 400 / `#333` |
| Título de sección (`h3`) | **16px** / 700 |
| Encabezado de tabla (`th`) | **13px** / 700, padding 8px |
| Botones | ~**12px**, padding `2px 10px` |

Escala chica y compacta: Dentalink prioriza densidad de información sobre aire.
Novudent hoy corre bastante más grande — es la diferencia visual más notoria
después de la tipografía.

### Forma

- Radio de borde: **4px** (Bootstrap 2). Nada de esquinas muy redondeadas.
- Sin sombras marcadas: separación por líneas de 1px.
- Tablas a ancho completo con **encabezado azul sólido** (`#0088CC`) y texto blanco.

## 3. Arquitectura de navegación

Dos barras fijas:

1. **Barra de marca** (`#0076DB`): logo · buscador global de pacientes ·
   "Novedades" · selector de sucursal · usuario · ID de soporte · logo de la clínica.
2. **Barra de módulos** (blanca): los 7 módulos, con ícono + etiqueta.

### Árbol completo

```
Agenda                        → /agendas/diario                        [calendar]
Pacientes                     → /clientes                              [users]
Cajas                         → /cajas                                 [cash-register]
Recaudación                   → /pagos/registrar/<idPaciente>          [shopping-cart]
Administración                                                         [clipboard]
  Convenios                   → /administracion/convenios/listar
  Gastos                      → /administracion/costos/gestionar
  Usuarios                    → /administracion/usuarios/listar
  Gestión de especialidades   → /administracion/especialidades
  Inventario                  → /administracion/inventarios/productos
  Laboratorios                → /administracion/laboratorios/ver
  Liquidaciones               → /liquidaciones/verActivas
  Planificación y uso de Box  → /administracion/boxes/planificacion
  Planes y servicios          → /administracion/consumibles
  Agenda Online               → /administracion/agendaonline
  Arancel de precios          → /administracion/prestaciones
  Bancos y entidades financ.  → /administracion/bancos
  Logotipo                    → /administracion/imagenes/nueva
  Opciones de pago            → /administracion/mediosdepago
  Pagos anulados y pendientes → /pagos/eliminados
Reportes                                                               [chart-simple]
  Panel de desempeño          → /dashboard
  Reportes Excel              → /solicitudes_reportes
  Reportes gráficos
    Resultados                          → /reportes/resultados
    Flujos de dinero                    → /reportes/flujos
    Análisis de pacientes               → /clientes#analisis
    Gastos                              → /reportes/gastos
    Eficiencia por profesional          → /reportes/ventaspordentista
    Ventas por prestación               → /reportes/ventasporprestacion
    Ventas por categoría                → /reportes/ventasporcategoria
    Eficiencia de captación de presup.  → /reportes/eficienciapresupuestos
    Informe de recaudación diario       → /reportes/informediario
    Ranking profesionales               → /reportes/presupuestosdentistas
    Pacientes morosos                   → /reportes/morosos
    Estado de financiamientos           → /reportes/estadofinanciamientos
    Estado de descuentos por planilla   → /reportes/estadodesctoplanillas
    Derivación de pacientes             → /reportesgraficos/derivaciones
    Presupuestos capturados             → /reportesgraficos/presupuestos-capturados
CRM                                                                    [link]
  Email Marketing             → /CRM/report
  Encuestas de satisfacción   → /encuestas/app
  Tareas de gestión           → /tareas/app
```

### Menú del usuario

```
Mi Perfil                     → /usuarios/perfil
Nueva sección de pacientes    → /usuarios/nuevoPaciente     (feature flag, ícono estrella)
Cerrar sesión                 → /sessions/logout
── Contáctanos ──
soporte@healthatom.com        (copia al portapapeles)
+56 2 3210 9602               (copia al portapapeles)
ID soporte: <código>          (para que el soporte identifique la cuenta)
```

## 4. Modelo comercial (lo más útil para vender Novudent)

Dentalink vende **plan base + consumibles (add-ons) por separado**. El header
expone los ids de los add-ons contratables:

| id | Add-on |
|---|---|
| 1 | Facturación electrónica |
| 2 | Videoconsultas |
| 3 | Firma electrónica |
| 4 | WhatsApp |
| 5 | Pagos online |
| 6 | Suite BI |
| 7 | Análisis RX (radiografía con IA) |
| 9 | Módulos IA |

La instancia relevada está en el plan **Titanium** con facturación **mensual**.
El header además trae `plansUpselling` y `visibleUpsellingZoneAdmin`: el upselling
está cableado en la propia navegación, no es una página aparte.

> **Lectura para Novudent:** hoy nuestros planes (Solo / Clínica / Cadena) son
> escalones cerrados. Dentalink cobra un plan base y suma consumibles — que es
> justo donde caen nuestras features premium (firma electrónica, radiografía IA,
> WhatsApp, videoconsulta, pagos online). Vale evaluar el mismo modelo.

## 5. Convenciones de ruteo

Sin `/app` ni prefijos: rutas planas por módulo y verbo.

```
/clientes                     listado
/clientes/ver/<id>            ficha del paciente
/clientes/typeahead           autocompletado del buscador global
/clientes/verMas              "ver más" del buscador
/tratamientos/ver/<id>        plan de tratamiento (id de PLAN, no de paciente)
/pagos/registrar/<idPaciente> recibir pago
/pagos/eliminados             pagos anulados y pendientes
/agendas/diario               agenda diaria
/agendas/semanal/<fecha>/<idProfesional>
/agendas/semanal2/<fecha>     "diaria global" (todos los profesionales)
/agendas/reprogramacion
```

Ojo con un detalle que ya nos afecta: **el plan de tratamiento tiene id propio**
(`/tratamientos/ver/4133`) y no cuelga de la ruta del paciente. Un paciente puede
tener varios planes y cada uno es una entidad de primer nivel.
