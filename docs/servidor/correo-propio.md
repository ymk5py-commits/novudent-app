# Correo propio de Novudent

El módulo `lib/server/correo.ts` permite conectar una cuenta SMTP propia para avisos de cita, mensajes de usuarios de clínica y notificaciones de contacto. Las plantillas de citas y sus permisos se conservan. El remitente siempre sale del servidor: el navegador no lo elige.

## Variables de la aplicación en Coolify

| Variable | Contenido |
|---|---|
| `CORREO_PROVEEDOR` | `smtp` |
| `SMTP_HOST` | Servidor SMTP de la cuenta elegida |
| `SMTP_PORT` | `587` (STARTTLS obligatorio) o `465` (TLS desde la conexión) |
| `SMTP_USER` | Usuario de esa cuenta |
| `SMTP_PASSWORD` | Contraseña de aplicación o credencial SMTP, solo en el servidor |
| `EMAIL_FROM` | Remitente autorizado, por ejemplo `Novudent <avisos@dominio-propio>` |
| `LEADS_EMAIL` | Bandeja donde se reciben pedidos de acceso |

Las credenciales se cargan en Coolify sin pegarlas en el chat ni guardarlas en Git. El módulo valida certificados y exige TLS 1.2 o posterior. No se registra el contenido, los destinatarios ni las credenciales de los errores SMTP. Una cuenta SMTP incompleta nunca cambia silenciosamente de proveedor. Las instalaciones existentes pueden seguir usando Resend si no seleccionan SMTP.

## Recuperación de contraseña

GoTrue envía sus propios mensajes de seguridad directamente por SMTP. Cargar en el recurso de Supabase los mismos `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` y `SMTP_PASSWORD`, más `SMTP_ADMIN_EMAIL` (solo la dirección del remitente) y `SMTP_SENDER_NAME=Novudent`. El compose admite `SMTP_PASS` anterior si no se define `SMTP_PASSWORD`.

Después del despliegue hay que pedir un enlace a una cuenta de prueba del propietario, confirmar que llega a su bandeja y completar el cambio de contraseña. Una prueba con SMTP simulado no acredita recepción real.

## Hermes y estado de los envíos

Hermes puede automatizar tareas alrededor del correo cuando se configure su integración. La recuperación de contraseña funciona directamente con GoTrue: no depende de Hermes. No se habilitó ningún acceso nuevo para Hermes en este cambio.

Este módulo es la salida SMTP inicial, no una plataforma completa como Resend. Todavía no tiene cola persistente, panel de historial, gestión de rebotes ni seguimiento de entregas. `aceptado` significa que SMTP o el proveedor aceptó el mensaje; no que el destinatario lo recibió. No hay reintentos automáticos: un corte después de la aceptación puede duplicar mensajes si se reenvían a ciegas. Para una cola futura se requieren registros persistentes e idempotencia, con una política específica para resultados inciertos.

## Estado de activación

Código preparado y pruebas automatizadas; pendiente elegir cuenta, cargar credenciales y comprobar un envío real. La aplicación pública no se cambió por este trabajo.
