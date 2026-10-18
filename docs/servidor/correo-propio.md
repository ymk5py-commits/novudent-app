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

## Esquema de remitentes (18-oct-2026)

Una sola cuenta SMTP y varias direcciones del dominio, cada una con un papel. El código conoce la lista (`REMITENTES` en `lib/server/correo.ts`); la dirección de cada una vive en Coolify.

| Remitente | Dirección | Para qué lo usa Novudent | ¿Se leen las respuestas? |
|---|---|---|---|
| `hola` | `Novum <hola@novumholding.lat>` | Aviso de pedidos de acceso de la landing (`/api/contacto`); conversación con personas | Sí: es una bandeja real (reenvío de ImprovMX) |
| `info` | `Novum <info@novumholding.lat>` | Información general y comercial. **Todavía no lo usa ninguna ruta**: queda reservado | Sí, cuando se cree el alias |
| `no-reply` | `Novudent <no-reply@novumholding.lat>` | Avisos automáticos de cita (`/api/notificaciones/cita`) y recuperación de contraseña (GoTrue) | No. En el aviso de cita, si la clínica tiene correo cargado, la respuesta del paciente va a **la clínica** (`Reply-To`), nunca a Novum: son datos de salud de esa clínica |

`/api/email` (mensajes que escribe el personal de una clínica) no declara remitente: sale por `EMAIL_FROM`. Cuando se decida con qué dirección debe salir, es un cambio de una línea.

### Variables en Coolify (aplicación)

```dotenv
CORREO_PROVEEDOR=smtp
SMTP_HOST=smtp.improvmx.com
SMTP_PORT=587
SMTP_USER=<usuario SMTP que muestra el panel de ImprovMX>
SMTP_PASSWORD=<la tecleás vos en Coolify; nunca en el chat ni en Git>
EMAIL_FROM=Novum <hola@novumholding.lat>
EMAIL_FROM_HOLA=Novum <hola@novumholding.lat>
EMAIL_FROM_NO_REPLY=Novudent <no-reply@novumholding.lat>
# EMAIL_FROM_INFO=Novum <info@novumholding.lat>   (cuando se cree)
LEADS_EMAIL=<bandeja donde llegan los pedidos de acceso>
```

Un remitente sin `EMAIL_FROM_<ID>` sale por `EMAIL_FROM`, así que una instalación vieja con solo `EMAIL_FROM` sigue funcionando igual. Si algún día una dirección necesita **su propia cuenta SMTP** (ImprovMX da una por dirección), se cargan `SMTP_USER_<ID>` y `SMTP_PASSWORD_<ID>` **las dos**; si falta una, ese remitente no envía (no se completa con la cuenta común para no mandar con la identidad equivocada). `<ID>` va en mayúsculas y con `_` en lugar de `-` (`NO_REPLY`).

### Para el recurso de Supabase (GoTrue: recuperar contraseña)

```dotenv
SMTP_HOST=smtp.improvmx.com
SMTP_PORT=587
SMTP_USER=<el mismo usuario>
SMTP_PASSWORD=<la misma contraseña, tecleada en Coolify>
SMTP_ADMIN_EMAIL=no-reply@novumholding.lat
SMTP_SENDER_NAME=Novudent
```

### Cómo sumar otra dirección (ej. `ventas@`)

1. Agregar `"ventas"` a `REMITENTES` (`lib/server/correo.ts`), con una línea en la tabla de arriba.
2. Cargar `EMAIL_FROM_VENTAS` en Coolify y reiniciar la aplicación.
3. Si recibe respuestas: crear el alias en ImprovMX apuntando a la bandeja que corresponda.
4. Si usa una cuenta SMTP por dirección: crear sus credenciales en ImprovMX y cargar `SMTP_USER_VENTAS` + `SMTP_PASSWORD_VENTAS`.
5. Usarla en la ruta con `enviarCorreo({ …, remitente: "ventas" })` y `correoConfigurado("ventas")`.

### Lo que hay que resolver antes de activar (verificado el 18-oct-2026)

1. **Plan de ImprovMX.** Según su página de precios, el plan gratis incluye **0 envíos por SMTP**; el SMTP empieza en *Light* (USD 50/año, 750 envíos al mes, 25 alias) y sigue con *Premium* (USD 9/mes, 12.000 envíos, 100 alias). Los MX del dominio apuntan a ImprovMX, pero eso solo prueba que **recibe**; hay que mirar en `app.improvmx.com` qué plan tiene el dominio. Con 750 envíos al mes no alcanza para recordatorios de citas de muchas clínicas: para `hola` e `info` (poco volumen) sirve, y para los avisos masivos de cita conviene decidir después un proveedor de envíos aparte (Resend ya está soportado en el código; Amazon SES o Brevo se sumarían como otro proveedor).
2. **Credencial SMTP.** En ImprovMX: dominio › *SMTP Credentials*. Hay dos formas: una por dirección, o **una sola «send as any alias»**, que envía desde cualquier dirección del dominio (incluidas las que todavía no existen) y es la que mejor encaja con «ir creando otras»: se crea una vez y cada dirección nueva es solo una variable. El usuario que se usa para iniciar sesión es el que muestra el panel (con *any alias* no es la dirección de correo). Gmail no la acepta, pero Novudent usa SMTP directo, no Gmail.
3. **DKIM — falta.** El DNS de `novumholding.lat` tiene hoy MX a ImprovMX, SPF `v=spf1 include:spf.improvmx.com ~all` y DMARC `v=DMARC1; p=none` (todo bien), pero **no tiene los dos registros DKIM**: `dkimprovmx1._domainkey` y `dkimprovmx2._domainkey` responden con el CNAME comodín `*.novumholding.lat → cname.vercel-dns-017.com`, que no es el de ImprovMX. Crear en Cloudflare dos CNAME **solo DNS (nube gris)** con los valores exactos que da el panel de ImprovMX (Domain Settings › DNS Settings; según su guía son `dkimprovmx1.improvmx.com` y `dkimprovmx2.improvmx.com`). Sin DKIM los correos con SPF alineado suelen llegar, pero con más riesgo de spam.
4. **Comodín hacia Vercel.** Ese `*.novumholding.lat → Vercel` hay que revisarlo en el apagado de Vercel (fase F): al borrar el proyecto, cualquier subdominio inexistente dejaría de responder bien. No tocarlo antes.
5. **Alias.** Crear `hola@` en ImprovMX apuntando a la bandeja real. **No** crear alias para `no-reply@` (así las respuestas rebotan y nadie las lee por error), salvo que se decida otra cosa.
6. **Envío de prueba real** antes de activar: desde la aplicación (`/api/contacto` con un pedido de prueba) y desde Supabase (pedir un enlace de recuperación a una cuenta propia). Mirar en la bandeja si llegó, en qué carpeta, y en «Mostrar original» que SPF, DKIM y DMARC figuren como `pass`.

### Qué hacés vos y qué hago yo

- **Vos:** confirmar/contratar el plan de ImprovMX, crear la credencial SMTP, teclear `SMTP_PASSWORD` en Coolify (en los dos recursos) y crear los dos CNAME de DKIM en Cloudflare con los valores del panel (o decirme y lo hago yo con Cloudflare abierto en el navegador, sin tocar ninguna clave).
- **Yo:** el código y las pruebas (hecho), y la prueba de envío cuando estén la credencial y el DKIM. Las variables de la aplicación de producción en Coolify las carga quien administra esa app (SERVIDOR GMKTEC) o vos; en el recurso de Supabase puedo cargar las que no son secretas.
