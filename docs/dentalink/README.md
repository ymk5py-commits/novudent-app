# Relevamiento de Dentalink

Documentación de la estructura, los flujos y el diseño de **Dentalink** para
llevar Novudent a paridad. Relevado el **30-jul-2026** sobre la instancia real
de Aura Esthetic Center (`auradentalclinic.dentalink.cl`, plan Titanium),
leyendo el CSS y el estado de la propia app.

| Archivo | Contenido |
|---|---|
| [00-sistema-de-diseno.md](00-sistema-de-diseno.md) | Stack, paleta con hex, tipografía, árbol de navegación completo (40+ rutas), menú de usuario, convenciones de ruteo, modelo comercial |
| [01-modulos.md](01-modulos.md) | Agenda · Pacientes · Cajas · Panel de desempeño · Ficha del paciente |
| [02-administracion.md](02-administracion.md) | Arancel · Gastos · Usuarios · Inventario · Laboratorios · Liquidaciones · Convenios · Planes y servicios |
| [03-reportes-y-crm.md](03-reportes-y-crm.md) | Los 15 reportes gráficos · Tareas de gestión · Encuestas · Recibir pago · Plan de tratamiento |

## Reglas del relevamiento

**Sin datos de pacientes.** Todo lo documentado es estructura: menús, rutas,
columnas, controles, tokens visuales y flujos. Donde hacía falta un ejemplo va un
valor inventado. No hay nombres, documentos, teléfonos ni datos clínicos reales.

**Qué se clona y qué no.** Estructura, flujos, nomenclatura funcional y
disposición: sí, son aspectos funcionales. El logotipo de Dentalink, sus
ilustraciones propias y sus textos de marketing palabra por palabra: no.

**Iconografía.** Dentalink usa **Font Awesome 6 Pro**, que es licencia paga. En
Novudent hay que usar lucide (lo que ya usamos) o Font Awesome Free.

## Cobertura

**Relevado:** Agenda (diaria) · Pacientes · Cajas · Panel de desempeño · Ficha del
paciente (datos personales) · Recibir pago · Plan de tratamiento · Arancel ·
Gastos · Usuarios · Inventario · Laboratorios · Liquidaciones · Convenios ·
Resultados · Morosos · Flujos · Eficiencia por profesional · Estado de
financiamientos · Tareas de gestión · Encuestas.

**Pendiente:** Email Marketing · el catálogo de Reportes Excel · las vistas de
calendario (semanal y diaria global) · Ficha clínica del paciente · especialidades,
boxes, agenda online, bancos, logotipo, medios de pago y pagos anulados.

**Bloqueado por permisos:** la sesión usada no es administradora
(`hasAdminPermission: false`), así que *Planes y servicios* devolvió "sin permisos".
Para completarlo hace falta relevar con un usuario admin.

## Hallazgos con más impacto para Novudent

1. **Modelo comercial**: plan base + 8 consumibles cobrados aparte (facturación
   electrónica, videoconsultas, firma, WhatsApp, pagos online, suite BI, análisis
   RX, módulos IA). Nuestros planes Solo/Clínica/Cadena son escalones cerrados.
2. **Tareas automáticas** (Cobranza / Control / Captura / Cita): el sistema las
   genera y las cierra solo a partir de eventos. Es el corazón de su CRM.
3. **Ventas ≠ Recaudación**: reportan por separado lo ejecutado y lo cobrado.
4. **Aging de morosidad** en tres tramos (≤30 / 30-60 / >60 días), no un número plano.
5. **Columna "Situación"** en la agenda: cruza la cita con la deuda del paciente.
6. **Checkbox "No aplica"** por campo opcional: distingue "no lo cargué" de
   "no corresponde".
7. **Inventario con bodegas, lote y expiración**, y consumo imputado a la atención.
8. **Plantillas de texto** para diagnóstico y evoluciones, y **bloqueo/reapertura**
   del plan de tratamiento.
9. **Aranceles múltiples** (varias listas de precio) y catálogo de laboratorio separado.
10. **Gasto con dos fechas** (factura y pago) e imputable a una caja.
