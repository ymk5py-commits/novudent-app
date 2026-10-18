# Verificación de la integración de Supabase

Las fases B (esquema y RLS), C (adaptadores, login y servidor) y D (cargador) están reunidas en la rama de trabajo `claude/cloudflare-tunnel-coolify-migration-0bcd08`.

## Evidencia de esta revisión

- Instalación reproducible con `npm ci`, TypeScript y compilación de Next correctos.
- Suite general: **2.122 pruebas aprobadas**, 35 omitidas que requieren servicios externos.
- Postgres temporal en el servidor: **259 pruebas de permisos aprobadas**, incluidos los 143 casos trasladados desde las reglas de Firestore y las comprobaciones adicionales de aislamiento.
- Stack temporal completo, con el esquema integrado: **75 pruebas de adaptadores y rutas del servidor aprobadas en una ejecución conjunta**.
- Navegador contra ese stack: **15 de 16 recorridos aprobados en la ejecución completa**; el restante (recuperación de contraseña) pasó al corregir la URL del puerto de ensayo y repetirlo individualmente. Incluye ficha, cita, pago, chat, reserva pública, aislamiento de clínicas y contraseñas.

Se corrigió la preparación de las pruebas: cada cliente del ensayo tiene una identidad propia para los límites de Kong. Las pruebas que limpian tablas deben ejecutarse separadas del navegador; de lo contrario borran los datos de sus escenarios. El puerto del enlace de recuperación ahora sigue la configuración de Playwright y del stack temporal.

## Lo que todavía falta para el corte

Esto verifica el código integrado con datos sintéticos; **no acredita una migración de datos reales ni un despliegue de esta rama**. Faltan exportar y validar los datos actuales, realizar dos simulacros de carga, configurar y comprobar los respaldos externos y el correo de recuperación, y coordinar el cambio de la aplicación de producción. Firebase continúa como origen hasta completar esos pasos. La dependencia externa por outbox debe resolverse antes de apagar Firebase, según la decisión del propietario.
