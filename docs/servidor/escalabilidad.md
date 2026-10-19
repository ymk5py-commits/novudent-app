# Escalabilidad de Novum y Novudent

Pedido del 18-oct-2026: aplicar los ocho puntos enviados por Croman **después de completar la migración y el correo**. Este documento registra trabajo pendiente; no acredita despliegues ni capacidad de carga.

## Orden de ejecución

1. Terminar SMTP con `hola@novumholding.lat`, comprobar recuperación de contraseña y entrega real, respaldo externo y restauración, sincronización final y validación pública de Supabase. Seguir [la guía de corte](corte.md). El apagado de Firebase sigue condicionado a la migración de la integración externa por su mantenedor; Botika queda fuera de este trabajo.
2. Medir producción y ejecutar pruebas de carga en un entorno aislado con datos sintéticos: latencia p50/p95/p99, errores, consultas, conexiones, CPU, memoria, disco y profundidad de colas. Acordar objetivos y registrar el límite sostenible antes de aumentar instancias.
3. Implementar respuestas más pequeñas, consultas e índices, CDN público, límites distribuidos y procesamiento asíncrono; introducir caché donde las mediciones lo justifiquen.
4. Probar varias instancias de la aplicación y su balanceo. Incorporar otro servidor para tolerar la pérdida del host. Evaluar réplicas de base de datos y particionado según los cuellos de botella observados.

## Los ocho puntos

| Punto | Base existente en el código o infraestructura preparada | Trabajo y condición de aceptación |
| --- | --- | --- |
| Balanceador | Entrada mediante Cloudflare Tunnel y Traefik. | Configurar destinos saludables cuando existan varias instancias; probar distribución, retirada de una instancia y reconexión de Realtime. Validar salud con dependencia de la base y preservar IP confiable. |
| Escalabilidad horizontal | Aplicación empaquetada para Coolify. | Compartir estado necesario, cuotas y caché entre instancias; revisar consistencia de builds y sesiones. Probar despliegue gradual y caída de una instancia. Dos contenedores en el GMKtec no resuelven la caída del servidor. |
| Caché Redis | El limitador admite Redis mediante Upstash REST; sin configuración usa memoria local. | Preparar un Redis propio y adaptar el transporte. No usar el Redis interno de Coolify. Definir claves por clínica, usuario/permisos cuando corresponda, TTL e invalidación; comprobar aislamiento y comportamiento ante caída. Empezar por datos no sensibles y resultados medidos. |
| CDN | Cloudflare está en la ruta de entrada; falta acreditar reglas y aciertos de caché. | Cachear estáticos públicos versionados y comprobar cabeceras y HIT. Excluir panel, autenticación, API privada y documentos clínicos. Probar que ninguna respuesta privada se reutiliza entre usuarios. |
| Procesamiento asíncrono | Correo centralizado; el envío actual es síncrono. | Implementar cola persistente y worker separado, inicialmente sobre PostgreSQL si las mediciones lo permiten: arrendamiento de trabajos, concurrencia limitada, idempotencia, reintentos controlados y fallidos revisables. Probar reinicio del worker y recuperación. Un envío SMTP incierto exige conciliación para evitar duplicados; aceptado no equivale a entregado. |
| Base escalable | Esquema con RLS y paginación en el adaptador. | Medir consultas, revisar planes e índices y limitar conexiones. Mantener restauraciones comprobadas. Introducir réplicas solo con necesidad medida y tratamiento explícito de lecturas atrasadas. Evaluar particionado o sharding después de agotar mejoras de consultas y capacidad; conservar aislamiento por clínica. |
| Rate limiting | Limitador de aplicación y plugin de Kong con `policy: local`. | Centralizar contadores antes de escalar instancias. Revisar cuotas por IP confiable, usuario y clínica, y comportamiento ante fallos para autenticación, correo e IA. Probar que varias instancias comparten cuota y que no se falsifica la identidad del cliente. |
| Respuestas ligeras | El adaptador selecciona `id,data,updated_at` y pagina por colección; sigue cargando el conjunto completo de la clínica. | Separar listados y detalles, cargar imágenes/documentos bajo demanda y paginar en la interfaz. Medir bytes y latencia antes/después, sin truncar registros ni perder actualizaciones en tiempo real. |

## Verificación de cada entrega

- Comparar carga y consumo antes/después con el mismo escenario sintético, incluyendo varias clínicas concurrentes.
- Verificar permisos y aislamiento de datos en caché, consultas, colas y respuestas.
- Probar fallos de Redis, worker, instancia y conexión a la base, con recuperación y registros sin secretos ni datos clínicos.
- Documentar configuración, reversión y capacidad comprobada. Desplegar cambios por separado con respaldo previo cuando corresponda.

Los servicios nuevos y cambios de infraestructura se limitan a Novum y Novudent y requieren revisar la capacidad compartida del GMKtec. La contratación de otro servidor o servicio pago queda pendiente de presupuesto autorizado.
