# Permisos del equipo — dar y sacar permisos por rol

Fecha: 8-oct-2026 · Pedido: Camila (Novum), 7-oct-2026, por WhatsApp: «para sacar y dar permisos de acceso a información o
ejecución». Antes se había propuesto solo **restringir** (el administrador saca permisos y nunca agrega); Camila pidió **dar y sacar**.

## Qué se construye

Administración › **Permisos del equipo** (`components/PermisosDelEquipo`): el administrador elige un rol (Recepción y caja,
Recepcionista, Dentista, Asistente de doctores) y marca lo que puede **ver** y **hacer** en su clínica. Lo que no toca queda como viene
de fábrica (la matriz de `lib/rbac.ts`). El cambio rige en el acto, también para quien tiene la sesión abierta.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Por rol, no por persona | Los cuatro roles que no son administrador | Es lo que pidió Camila y lo que se puede explicar en el manual; por persona multiplica los casos y las dudas |
| El administrador | Fijo: siempre puede todo, no aparece en la pantalla | Sin esto un administrador se podría dejar sin acceso a la pantalla que lo arregla |
| `users.manage`, `practice.config` | No se reparten (`PERMISOS_SOLO_ADMIN`), aunque estén escritos en la base | Quien los reparte se los daría a sí mismo; además `practice.config` ata Esterilización, Registro ambiental, Box, Arancel… |
| Dónde se guarda | `clinics/{cid}.config.permisos[rol] = { dar: [...], quitar: [...] }`: solo la **diferencia** contra la fábrica | Si Novum cambia la matriz de fábrica, las clínicas siguen lo que no tocaron; sin ajustes todo se comporta como siempre |
| Forma | Siempre los cuatro roles con las dos listas, vacías si no hay cambios | `setDoc(…, {merge:true})` no borra lo ausente: «volver a fábrica» se guarda escribiendo listas vacías |
| `dar` y `quitar` a la vez | Gana `dar`, igual en cliente (`permisoEfectivo`) y en reglas (`tienePermiso`) | Una sola cuenta en los dos lados |
| Datos mal formados | `normalizarPermisos` los limpia en el cliente y en las rutas del servidor; en las reglas se ignoran y rige la fábrica | La base de Firestore se puede editar a mano; un dato roto no tiene que dejar a un rol sin poder trabajar |
| Dependencias | `REQUIERE`: dar «cobrar» da «ver montos»; sacar «ver montos» saca todo lo que maneja plata; la pantalla avisa lo que arrastró | Evita estados sin sentido (una caja que cobra sin ver el monto) |
| Quién escribe | Solo el administrador (`clinics/{cid}` ya era solo del admin) | Nadie se da permisos a sí mismo |

## Qué hace cumplir cada cosa (el límite que hay que decir)

`firestore.rules` aplica los ajustes con `tienePermiso(cid, perm, rolesDeFábrica)` en cinco puntos:

| Permiso | Se bloquea en el servidor |
|---|---|
| `payments.manage` | cobros, documentos fiscales y caja |
| `engagement.forms` | firmas y documentos clínicos |
| `emr.write` | ficha clínica (campos clínicos del paciente), radiografías y documentos clínicos |
| `expenses.manage` | gastos (lectura y escritura) |
| `billing.reports` | liquidaciones (lectura y escritura) |

**Los demás permisos (ver montos, datos personales, agenda de todos, planes…) solo esconden pantallas y botones.** Firestore sigue
dejando leer cada colección a todo miembro de la clínica: es el modelo que ya tenía la app (el navegador lee Firestore directo). Hacer
que la lectura dependa de los permisos exigiría que cada consulta del store pidiera solo lo permitido, o se caería el arranque de
quien no puede leer una colección. La pantalla y el manual lo dicen.

## Cómo llega el cambio a cada pantalla

* `can(role, p, permisos?)`: sin tercer argumento usa los ajustes que el store aplica en cada render (`aplicarPermisosDeLaClinica`,
  estado de módulo del navegador); con él usa esos (las rutas del servidor leen `config.permisos` y se los pasan).
* El store escucha el documento de la clínica **solo para `config.permisos`**, así el cambio llega sin recargar y no pisa el resto de
  la configuración que ese navegador pueda estar guardando.
* La landing y el manual muestran siempre la matriz de fábrica (`permisoDeFabrica`).

## Fuera de alcance (y qué haría falta)

* **Esterilización, Registro ambiental, Box y «marcar prestaciones como realizadas» no se pueden delegar una por una**: van atadas a
  `practice.config` (que no se reparte) y a Presupuestos. Para repartirlas hay que crear un permiso propio para cada una (sumarlo a
  `MATRIX`, `GRUPOS_DE_PERMISOS`, `PERMISOS_EN_PALABRAS`, `TIPO_DE_PERMISO` y la pantalla correspondiente).
* No hay registro de quién cambió qué ni cuándo.
* No hay permisos por persona.

## Pruebas

* `lib/rbac.test.ts` y `lib/permisosEquipo.test.ts`: la cuenta fábrica + ajustes, la limpieza de datos, las dependencias y que **cada
  lista de roles de fábrica escrita en `firestore.rules` sea la de la matriz** (se probó rompiendo una lista a propósito).
* `test/firestore-rules.test.mjs` (emulador): dar y sacar en los cinco puntos, el administrador intocable, lo que no se reparte, que
  nadie se auto-ascienda, que los ajustes de una clínica no valgan en otra, datos mal formados, el cambio en el acto y la suscripción
  vencida.
* `e2e/permisos.spec.ts`: la pantalla de punta a punta, lo que se guarda y cómo queda la app para la persona de ese rol (se probó
  sacando la línea que aplica los permisos en el store: los dos casos de dar y sacar fallan).

## Despliegue

Publicar `firestore.rules` **antes** del código: el código viejo ignora `permisos` y las reglas nuevas, sin ajustes, se comportan como
siempre (`firebase deploy --only firestore:rules --project novudent-664f3`).

## Segundo pedido de Camila (8-oct-2026): Comercial y roles propios

Camila contestó al aviso de «Permisos del equipo»: «tiene que haber también comercial. Las clínicas tienen los comerciales que venden también, no todas, pero tenemos que tener la opción. O de escribir el nombre que le queramos poner».

| Tema | Decisión | Por qué |
|---|---|---|
| Comercial | Un rol de fábrica más (`commercial`): agenda de todos, datos del paciente, planes y presupuestos con montos, CRM y tareas. Sin caja, ficha clínica, reportes ni configuración | «No todas las clínicas lo tienen pero tiene que estar la opción»; los permisos se ajustan como los de cualquier rol |
| Nombre libre | Se puede **cambiar el nombre de cualquier rol** (`config.nombresDeRoles`) y **crear roles propios** (`config.rolesPropios`) | Cubre las dos lecturas del pedido: «comercial» y «el nombre que queramos» |
| Qué hereda un rol propio | **Nada**: lo que puede es su lista `dar`. Al crearlo se puede copiar lo que hoy puede otro rol | Las reglas de Firestore ya lo soportan sin cambios y no hay herencia que se desincronice |
| Qué NO es un rol propio | Un profesional: no aparece en la agenda, liquidaciones ni cuenta para el límite del plan, y no tiene doctores asignados | Los chequeos `role === "dentist"`/`"assistant"` están en ~25 lugares; para algo parecido se usa Dentista con otro nombre |
| Rol de la persona | `User.role` guarda el id de fábrica o `rp_xxxxxxxx` | Las reglas y el store ya leen `users/{uid}.role` |
| Borrar un rol | Solo si nadie lo tiene (tampoco las personas dadas de baja) | Evita personas con un rol que ya no existe |
| Ids | `esIdDeRolValido`: letras, números, `_` y `-`, hasta 40; nunca `admin` ni nombres de propiedades de `Object` | La clave termina en un mapa de Firestore y en `permisos[role]` |

Cambio en `firestore.rules`: solo `isRecepcion` suma `'commercial'` (`engagement.forms`). **Se publican las reglas antes del código.** Sin eso, un Comercial nuevo no podría firmar ni armar documentos hasta que se publiquen.
