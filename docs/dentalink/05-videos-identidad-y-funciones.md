# Dentalink — identidad y funciones vistas en sus videos (oct 2026)

> Relevado el **3-oct-2026** sobre 11 videos del canal oficial (Dentalink Latam /
> `@dentalink`), de 2015 a 2026. El más actual y completo es la **Demo México**
> (`EWEv30Q-tm4`, 2025). Complementa a [00-sistema-de-diseno.md](00-sistema-de-diseno.md),
> que se relevó sobre la instancia real.
>
> **Decisión del equipo (Cami, 3-oct-2026):** Dentalink es el diseño de referencia.
> Se copian la **tipografía y la forma** (densidad, tablas, pestañas, botones) y se
> **mantienen los colores de Novudent** (navy `#051735` y azul del isologo) y todas
> las funcionalidades propias. Nada de la marca de Dentalink (logo, textos).

## Videos usados

| id | Título | Año | Qué muestra |
|---|---|---|---|
| `EWEv30Q-tm4` | Demo Dentalink México | 2025 | Agenda semanal, ficha, odontograma, periodontograma, planes, pagos, caja, liquidaciones, gastos, CRM, reportes |
| `6AOH6c6nS4w` | Gestión de permisos de usuarios | 2026 | Menú Administración (2 columnas), Usuarios › Datos y permisos |
| `Vzb3jIpBx9g` | Manejo del plan de tratamiento | 2017 | Opciones del plan, financiamiento por crédito, descuento por planilla |
| `nxkpyy9GS9E` | Agregar planes de tratamiento | 2023 | Lista «En ejecución / Otros», odontograma del plan, envío por e-mail |
| `YoIX-Xx2h1c` | Diagnósticos en odontograma y perio | 2023 | Panel «Definir diagnóstico», tabla de hallazgos, periodontograma |
| `xmtX2QwAI7s` | Recibir pagos (Plan Basic) | 2022 | Ingresar un pago: selección de prestaciones, medios múltiples, comprobante |
| `dbVeJhk1z1k` | Historial, evoluciones y antecedentes | 2023 | Historial tipo línea de tiempo, editor de evoluciones con plantilla |
| `2wbnGMyrOB4` | Recetas, documentos y consentimientos | 2023 | Recetas con plantilla, documento clínico, solicitar firma |
| `eFkEyhSjneQ` | Crea tus usuarios | 2021 | Alta de odontólogo en 3 pasos (datos, usuario, contratos) |
| `GVbDJwTRIcg` | Estados de pacientes de la agenda | 2016 | Administrador de estados: nombre, color, anulación, tipo |
| `mYxX4eG9zqo` | Uso de los Box | 2016 | Planificación y uso de Box/Sillones (Gantt semanal) |
| `iXnTFRSH20A` | Agenda de pacientes | 2015 | Agenda diaria, diaria global, «Dar cita» con paciente existente/nuevo |

## 1. Tipografía (ya aplicada en el panel)

- **Open Sans** en todo, títulos incluidos. Sin Jost ni monoespaciada en el panel.
- Base **14px** `#333`; secundario `#666`.
- Título de página y de sección **16px / 700** (ej. «Usuarios», «Planes de tratamiento»).
  El nuevo diseño usa títulos más grandes y livianos (~20px / 400) solo en
  cabeceras de página como «Datos y permisos» o «Ingresar un pago».
- Encabezado de tabla **13px / 700**, texto oscuro, **sin mayúsculas**, fondo blanco,
  línea inferior de 1px.
- Etiquetas de formulario 13px normales, alineadas a la derecha en formularios
  horizontales (Bootstrap `form-horizontal`).
- Botones ~12–13px, 28–30px de alto. Peso máximo 700.

## 2. Forma (ya aplicada en el panel)

| Elemento | Dentalink | Novudent ahora |
|---|---|---|
| Esquinas | 4px | 4px en el panel y los modales (regla CSS con alcance `.app-workspace` / `.app-portal`) |
| Sombras | ninguna; líneas de 1px | sin `shadow-card`; `shadow-pop` muy suave para desplegables y modales |
| Barra superior | plana | navy plano (se quitó el degradé) |
| Menú de módulos | ícono + texto, activo en azul, sin pastilla | igual |
| Pestañas de sección | texto con **subrayado azul de 2px** (Usuarios, Ficha clínica) | igual, en los dos niveles de la ficha y en todas las páginas con pestañas |
| Tablas | filas compactas (padding 8px), líneas de 1px | `py-2` en todas las celdas |
| Badges | rectángulo de 4px («Deudas», «Diagnóstico», NUEVO/BETA) | rectángulo de 4px |
| Botón de ayuda | redondo flotante abajo a la derecha (auriculares) | igual, abre «Ayuda de Novum» |
| Modales | cuadrados, título 16px | igual |

Lo que **no** se copia: el azul `#0076DB` de la barra, el verde de «Nuevo paciente»
y el cian de «Dar cita». Novudent usa su navy y su azul.

## 3. Estructura vista en los videos (para contrastar con Novudent)

### Barra y menú
- Barra 1: logo · buscador global · «Novedades» · selector de sucursal · Soporte ·
  **ID Soporte** · logo de la clínica.
- Barra 2: Agenda · Pacientes · Cajas · Recaudación ▾ · Administración ▾ · Reportes ▾ ·
  CRM ▾ · ⭐ Nueva Agenda.
- Administración ▾ es un panel de **2 columnas** («ADMINISTRACIÓN» / «CONFIGURACIÓN»)
  con etiquetas **NUEVO** y **BETA** en ítems recientes (Pagos POS, Estados de cita,
  Contralor IA). Columna 1: Convenios, Facturación electrónica, Gastos, Usuarios,
  Gestión de recursos, Gestión de especialidades, Inventario, Laboratorios,
  Liquidaciones, Planificación y uso de Box/Sillones, Fusión de fichas, Pago Online,
  Pagos POS, Planes y servicios, Esterilización, Conciliación seguros, Seguros.
  Columna 2: Agenda Online, Arancel de precios, Bancos y entidades financieras,
  Documentos clínicos, Consentimientos informados, Estados de cita, Logotipo,
  Opciones de pago, Pagos anulados y pendientes, Configuraciones especiales,
  Solicitudes de devolución, Configurador Asistente, Contralor IA, Sincronización
  de archivos.

### Agenda
- Cabecera: «Agenda» + badge «5 Citas» · pestañas Diaria / Semanal ▾ / Diaria global /
  Reprogramación · «Dar cita» (botón partido) · Fecha · Imprimir ▾ · sobre.
- Columna izquierda: día grande con flechas · selector de profesional ·
  «Marcar todos» · lista de **estados con casilla y barra de color**.
- Tabla: Hora (bloque de color según estado, inicio ↓ fin) · Paciente (link, teléfono,
  **BOX**, «Datos personales» si faltan) · Doctor · Estado (desplegable en la fila,
  con «Ver historial de confirmaciones») · Situación (Deudas / Diagnóstico /
  No hay saldo / Hay saldo).
- Semanal: grilla por profesional con casillas verdes «disponible» y lápiz para editar;
  filtro «Sobre agendamiento»; selector de Sillón.
- Diaria global: columnas por profesional, filtro por especialidad.
- Modal «Agendamientos Online»: validar / eliminar reservas web antes de que entren.
- Página pública de **confirmación de cita** (link por WhatsApp/e-mail): Confirmar /
  Anular + datos de la cita.

### Estados de cita (Administración › Estados de agenda)
Tabla editable: **Nombre · Color · Anulación (Sí/No) · Tipo** (Reservado / Uso
interno / Estado propio) · editar · borrar. «Crear nuevo estado» y «Restablecer
configuración original». Estados de fábrica: Anulado, Atendido, Confirmado por
teléfono, En sala de espera, Atendiéndose, No confirmado, No asiste, Anulado por
sesiones en conflicto, Anulado por pcte. vía email, Confirmado por email,
Notificado vía email, Agenda Online, Cambio de fecha, Confirmado por WhatsApp,
Anulado por pcte. vía portal, Anulado vía validación. «Anulación = Sí» libera el
cupo en la agenda.

### Ficha del paciente
- Banda azul con avatar circular, nombre, ID, documento, edad, convenio, y 3
  cuadros: **Alertas médicas · Enfermedades · Medicamentos**.
- Pestañas nivel 1: Datos personales · Ficha clínica · Planes de tratamiento ·
  Facturación y pagos · 📅 Dar cita · Recibir pago · Historia clínica.
- Ficha clínica nivel 2: Historial · Evoluciones · Antecedentes médicos · Odontograma ·
  Periodontograma · Rx y Documentos · Recetas · Documentos Clínicos · Consentimientos.
- **Historial** = línea de tiempo (presupuesto creado, pago recibido, evolución
  guardada…) con filtro por mes y tipo, imprimir, «Mostrar anuladas».
- **Evoluciones**: «Todas / Solo mis evoluciones», editor enriquecido, «Usar
  plantilla», atada a un plan de tratamiento ya realizado.
- **Recetas**: editor + plantilla; cada receta con Enviar · Editar · Imprimir ·
  Duplicar · Eliminar; filtro por tratamiento; «Mostrar anuladas».
- **Documentos clínicos**: «Nuevo documento clínico» → Continuar → «Solicitar firma»
  (paciente firma en pantalla; el profesional solo desde su propio usuario).
- **Rx y Documentos**: agrupados por fecha, filtro por usuario/fecha, «Subir archivo».
- Barra vertical flotante a la derecha con accesos (GES, odontograma, evoluciones,
  imágenes, perio, alertas, tareas).

### Planes de tratamiento
- Lista por estado: **En ejecución / Otros**; tarjeta con #, nombre, sucursal,
  profesional, colaboradores, última cita, progreso (anillo %), estado financiero
  (Deudas / Diagnóstico), última actividad.
- Vista del plan: tarjeta azul a la izquierda (Presupuesto total, Descuento comercial,
  Realizado / Abonado / Saldo por abonar, Deudas en rojo, «Cotizar con múltiples
  convenios», vencimiento, profesional, colaboradores, convenio, sucursal) +
  odontograma a la derecha + tabla de prestaciones (+ Sección · + Prestación ·
  Acciones ▾ · Pieza · Dscto · Precio · Pago) + «Firma del paciente» + Comentarios
  para el paciente (con plantilla) + Citas del paciente.
- **Opciones ▾**: Cambiar nombre · Financiamiento · Descuento por planilla · Recaudar
  este tratamiento · Solicitar atención con otro profesional · Finalizar · Eliminar ·
  Duplicar plan.
- **Financiamiento por crédito**: pie, monto financiado, interés mensual, cuotas,
  fecha primera cuota, periodicidad, Simular / Generar.
- Al cargar varias piezas: «Cobrar cada pieza como una prestación separada» /
  «Cobrar todas las piezas en una prestación».
- Enviar presupuesto por e-mail: completo / solo total / sin detalle; «Ver historial
  de envíos».
- Plan bloqueado: franja amarilla «Este tratamiento se encuentra bloqueado» +
  Desbloquear.

### Odontograma
- Panel lateral «Definir diagnóstico» con íconos por tipo (Corona, Corona provisoria,
  Endodoncia, Restauración, Implante, Perno muñón, Otro, Prótesis removible, Corona
  en mal estado…) y «Piezas seleccionadas».
- Tabs Permanente / Temporal, «Diagnóstico» (negro) / «Información» (celeste),
  «Ver solo diagnóstico», imprimir.
- Tabla de hallazgos: Fecha · Pieza · Caras · Estado · Creador · Anular.
- Periodontograma: por pieza, profundidad de surco, margen, NIC, furca, exudado,
  sangrado, movilidad; dibujo vestibular/lingual; versión fechada por profesional.

### Pagos y caja
- **Ingresar un pago**: 1) selección de prestaciones a pagar agrupadas por categoría
  (Precio · Abonado · Estado · Por abonar) y totales (seleccionado, con descuento,
  abonos libres, a pagar, «Ingresar abono libre»); 2) medio de pago (N° factura,
  descuento, **varios medios en un mismo pago** «Agregar nuevo medio de pago»);
  3) **Comprobante** (cliente, cargos a abonar, pagos, detalle de prestaciones
  abonadas) con Imprimir y Enviar por e-mail; «Ingresar otro pago».
- Planes de tratamiento del paciente + «Por cuotas de financiamiento» en la misma
  pantalla.
- Recaudación: tabla # Pago · # Trat. · Medio de pago · ID Ticket · # Boleta ·
  Recepción · Vencimiento · Monto · Acciones, con **Desglose de pago**.
- **Total caja #N**: recaudado + saldo inicial + reingresos − devoluciones − gastos,
  desglosado por medio (con cantidad), «Transacciones de la caja», Imprimir.
- Liquidaciones: Nombre · Apellidos · Fecha · **Realizado** · **A Pagar** · Detalle ·
  Finalizar; «Finalizar todas»; descargar.
- Gastos: Categoría · Detalle · **Fecha factura** · **Fecha pago** · Monto.

### Usuarios y permisos
- Usuarios: pestañas Usuarios · Perfiles · Sesiones · Edición de contratos; «Bloqueos».
- Datos y permisos: pestañas Datos personales · Sucursales de acceso · **Permisos**.
- Permisos agrupados por área (Gestión económica, CRM, Conciliación seguros…), cada
  uno con casilla + ícono ⓘ; «copiarlos desde otro usuario o perfil»; «Guardar
  permisos» verde; aviso «los cambios se aplican en la próxima navegación».
- Datos personales: cambio de contraseña y **2FA**.
- Alta de odontólogo en 3 pasos: datos personales + usuario → contratos por sucursal
  (prestaciones donde gana, % odontólogo, tipo de contrato, descuento medio de pago,
  pago de prestaciones con documentos a plazo).

### Reportes y CRM
- Reportes: «Solicitar reportes» / «Historial de solicitudes» (# · Reporte ·
  Parámetros · Fecha · Solicitado por · Estado→Descargar), paginado «Página 1 de 7».
- CRM ▾: Email Marketing · Encuestas de satisfacción · Tareas de gestión. Email
  marketing: Reportes (segmentos) · Campañas · Plantillas; detalle de campaña
  (reporte original, destinatarios, asunto, contenido).

### Otros
- Planificación y uso de Box: Gantt semanal por box y día.
- Agenda online pública: sucursal → especialidad → doctor → «Buscar hora más próxima»
  → lista de horas → calendario → «Reservar hora».
- Pie de página «Plataforma de soporte» con e-mail y teléfonos por país; pestañas
  fijas «VIDEOS 3D» y «AYUDA».
- Alertas de éxito estilo Bootstrap: «Éxito: • Permisos actualizados correctamente…»
  con botón Cerrar.

## 4. Qué le falta a Novudent (ordenado por valor para la clínica)

1. ~~**Estados de cita configurables**~~ ✅ hecho el 3-oct-2026 (`lib/estadosCita.ts`,
   Configuración › Estados de cita: 7 base + 9 internos + propios, con color, anulación y tipo).
2. ~~**Ingresar un pago en 3 pasos**~~ ✅ hecho el 4-oct-2026 (`lib/pago.ts`, `RecibirPago`,
   `ComprobantePago`): varios planes con monto editable, abono libre, varios medios en un pago,
   comprobante numerado imprimible y enviable por e-mail. Las cuotas se pagan por el mismo flujo.
3. ~~**Plan de tratamiento: Opciones ▾**~~ ✅ hecho el 4-oct-2026 (`OpcionesPlan`,
   `lib/planOpciones.ts`, `lib/financiamiento.ts`): financiamiento por crédito (pie, cuotas,
   interés mensual, periodicidad, simulación en vivo, reemplazar o quitar), recaudar el plan,
   enviar el presupuesto por e-mail en 3 versiones con historial de envíos, cambiar
   profesional a cargo, duplicar, finalizar y reabrir. Queda afuera «descuento por
   planilla» (convenios con descuento de sueldo, típico de Chile).
4. ~~**Historial del paciente** como línea de tiempo~~ ✅ ya existía (`components/Historial.tsx`:
   filtro por tipo y mes, impresión).
5. **Permisos granulares por área** con perfiles, copiar de otro usuario, sesiones y
   bloqueos; 2FA. Hoy hay 5 roles fijos (`lib/rbac.ts`), sin permisos por usuario.
   El 2FA de Firebase necesita Identity Platform (plan Blaze); el proyecto es Spark.
6. **Reportes gráficos**: Novudent tiene Flujo de caja, Producción y comisiones por
   profesional, Morosidad, NPS, Panel de desempeño, Análisis de pacientes y 8 Excel.
   Faltan Resultados, Ventas por prestación y por categoría, Informe de recaudación
   diario, Estado de financiamientos y Derivación de pacientes (ver 03-reportes-y-crm.md).
7. ~~**Recetas**~~ ✅ hecho el 4-oct-2026 (`lib/recetas.ts`, `PatientExtras.tsx`): plan de
   tratamiento en la receta y filtro por tratamiento, Enviar por e-mail, Duplicar, Anular (no se
   borra: registro clínico) y «Mostrar anuladas», además de las plantillas y la impresión.
8. ~~**Link de confirmación de cita**~~ ✅ hecho el 4-oct-2026 (`lib/confirmacionCita.ts`,
   `/confirmar/{cid}/{token}`, `/api/citas/confirmar`): el paciente confirma o anula sin login
   desde WhatsApp o el correo, y la cita pasa a «Confirmado por WhatsApp/email» o «Anulado por
   el paciente». Va en el correo de confirmación; en la agenda, «Copiar link» (para pegarlo en
   WhatsApp). No hay botón de WhatsApp manual: la revisión de Novum del 27-sep lo sacó a propósito.
9. ~~**Total caja**~~ ✅ hecho el 4-oct-2026 (`lib/caja.ts`, Caja › «Total de caja»): cobrado
   por medio con su cantidad, saldo inicial, gastos, total, efectivo esperado, transacciones con
   N° de comprobante; imprimible con membrete.
10. ~~**Gastos** con fecha de factura y fecha de pago~~ ✅ ya existía (`Expense.invoiceDate`,
    `payDate` y `cashSessionId`).
11. ~~**Pestaña «Pacientes de Ortodoncia»**~~ ✅ existe como «Análisis de estudios
    específicos» (renombrada a propósito en la revisión de Novum del 27-sep-2026).
12. ~~**Menú de usuario**~~ ✅ hecho el 4-oct-2026 (`MenuUsuario`): Mi perfil (datos, ID de
    soporte, cambiar contraseña), Ayuda de Novum, ID de soporte y Cerrar sesión.
13. ~~**Pie «Plataforma de soporte»**~~ ✅ hecho el 4-oct-2026 (`PieSoporte`): canales de
    `NEXT_PUBLIC_SOPORTE_*` + ID de soporte.
