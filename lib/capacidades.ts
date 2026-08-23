/** Las ocho capacidades de Novudent — fuente única para la home (SeccionCapacidades)
 *  y la página /capacidades.
 *
 *  En módulo PLANO por el mismo motivo que lib/faqs.ts: un array exportado
 *  desde un archivo "use client" llega como client reference a los Server
 *  Components, y `.map()` revienta en el build. */
export const CAPACIDADES = [
  { n: "01", t: "Agenda + confirmación de citas", d: "Calendario semanal 00–24 h, lista de espera y recordatorios por WhatsApp con plantilla propia. Clic en una franja vacía y la cita existe." },
  { n: "02", t: "Odontograma por superficies", d: "32 piezas FDI con morfología real. Caries en mesial, corona en la 26: dos clics, queda auditado quién y cuándo." },
  { n: "03", t: "Presupuestos y cobro en cuotas", d: "Plan de tratamiento con convenios y descuento automático. Borrador → presentado → aceptado, ejecución por pieza e impresión en PDF." },
  { n: "04", t: "Caja, gastos y morosidad", d: "Arqueo diario por método de pago, control de gastos y cuentas por cobrar con recordatorio de deuda en un clic." },
  { n: "05", t: "Inventario y comisiones", d: "Bodega virtual con alertas de reposición, y cálculo automático del pago a cada odontólogo según su producción cobrada." },
  { n: "06", t: "Ortodoncia, recetas y archivos", d: "Módulo de ortodoncia con controles mensuales, recetas con plantillas listas para imprimir y radiografías en la ficha." },
  { n: "07", t: "Informes de gestión", d: "KPIs de 30 días, tasa de aceptación de presupuestos y reportes descargables en Excel: pagos, gastos, comisiones, pacientes." },
  { n: "08", t: "Roles, formularios y facturación", d: "RBAC de 3 roles, anamnesis digital con flujo del lápiz y máquina de estados MBILLED → HOLD → FACTURADO con validaciones CPT." },
] as const;
