# Pruebas de reglas: Firestore → Postgres (caso por caso)

Generado por `test/rls/reglas.test.mjs` (`scripts/supabase/probar-rls.sh`). **No editar a mano.**
Fuente: `test/firestore-rules.test.mjs` (143 casos, en el mismo orden y con los mismos nombres).

**Criterio de aceptación:** cada `assertSucceeds` de Firestore es `permitido` en Postgres y cada `assertFails` es `denegado`.
Si un solo paso difiere, la prueba falla. «Permitidos / denegados» cuenta los pasos de cada caso (lo que dice Firestore, y lo que dio Postgres: es lo mismo).

| | Casos |
|---|---|
| Mismo resultado, sin más | 122 |
| Mismo permitido/denegado, pero el mecanismo cambia (consulta filtrada en vez de fallar entera, etc.) | 13 |
| No aplica (la colección ya no existe) y lo que lo reemplaza | 8 |

**Cómo se ve un «denegado» en Postgres** (columna «cómo se deniega»): `error 42501` = la base rechaza la operación (política o regla por campo);
`no ve la fila` = la RLS la filtra (la fila existe y la sesión no la ve; Firestore fallaba la lectura); `sin efecto (0 filas)` = un borrado que la política
no deja pasar no da error, no borra nada; `la colección … no tiene tabla` = nada que leer o escribir.

| # | Caso (nombre en Firestore) | Pasos permitidos / denegados | Estado | Cómo se deniega | Nota |
|---|---|---|---|---|---|
| 1 | miembro A NO lee pacientes de la clínica B | 0 / 1 | igual | no ve la fila |  |
| 2 | miembro A SÍ lee pacientes de su propia clínica | 1 / 0 | igual | — |  |
| 3 | miembro A NO escribe en la clínica B | 0 / 1 | igual | error 42501 |  |
| 4 | empleado con active:false NO lee ni escribe pacientes de su ex-clínica | 0 / 3 | igual | no ve la fila, error 42501, sin efecto (0 filas) |  |
| 5 | dentista NO puede ascenderse a admin (escalada de privilegios) | 0 / 1 | igual | error 42501 |  |
| 6 | usuario SÍ puede editar SOLO su nombre/color (self-update lista blanca) | 1 / 0 | igual | — |  |
| 7 | usuario NO puede limpiar su propio mustChangePassword (solo el servidor) | 0 / 1 | igual | error 42501 |  |
| 8 | dentista NO puede subir su propio commissionPct (fraude de comisiones) | 0 / 1 | igual | error 42501 |  |
| 9 | usuario NO puede BORRAR campos por omisión (set sin merge solo name/color) | 0 / 1 | igual | error 42501 |  |
| 10 | admin SÍ gestiona usuarios de su clínica | 1 / 0 | igual | — |  |
| 11 | la demo: se LEE sin sesión, se ESCRIBE solo con sesión | 2 / 1 | diferencia intencional | error 42501 | Postgres: se siembra el documento a leer (leer uno que no existe devuelve vacío con cualquier regla, así que no probaría nada). `anon` es la clave pública sin sesión; la sesión anónima de la demo es el rol authenticated. |
| 12 | anónimo NO escribe en una clínica real | 0 / 1 | igual | error 42501 |  |
| 13 | directory: cada uno lee SOLO su entrada | 1 / 1 | no aplica | no ve la fila | directory no existe: lo reemplaza public.mi_directorio(), que solo devuelve la clínica de la propia sesión; los usuarios de otra clínica no se ven. |
| 14 | directory: un admin NO crea una entrada apuntando a otra clínica | 0 / 2 | no aplica | error 42501 | directory no existe. Lo que impedía —que un admin enrute a alguien hacia OTRA clínica— ahora es: un admin no crea usuarios en una clínica que no es la suya, ni agrega a su clínica a una persona que ya es de otra (índice único de authUid). |
| 15 | directory: admin SÍ crea entrada de un uid que YA es miembro de su clínica | 1 / 0 | no aplica | — | directory no existe: dentA ya es miembro de clA, y su ruteo sale solo del documento de usuario (no hay entrada que crear). |
| 16 | directory: admin NO puede sembrar el routing de un uid que NO es miembro (anti-envenenamiento) | 0 / 2 | no aplica | sin clínica asignada, error 42501 | directory no existe. Un uid sin usuario en ninguna clínica no tiene ruteo (mi_directorio vacío) y no puede crearse uno solo (ver «FORASTERO … AUTO-INSCRIBIRSE»); que un admin dé de alta a una persona en SU clínica es lo mismo que antes (ver «residual»). |
| 17 | dinero: un DENTISTA NO escribe payments/expenses (no maneja dinero) | 0 / 2 | igual | error 42501 |  |
| 18 | dinero: la CAJA (admin / Recepción y caja) SÍ escribe payments; gastos solo el admin | 2 / 0 | igual | — |  |
| 19 | roles v3: ni la RECEPCIONISTA ni el ASISTENTE DE DOCTORES escriben dinero | 0 / 8 | igual | error 42501 |  |
| 20 | roles v3: los consentimientos los firma la recepción, no el asistente de doctores | 2 / 1 | igual | error 42501 |  |
| 21 | dinero: el dentista SÍ puede LEER payments/expenses (solo no escribir) | 1 / 0 | igual | — |  |
| 22 | serviceAccounts es inaccesible desde el cliente | 0 / 2 | no aplica | la colección serviceAccounts no tiene tabla, error 42P01 | serviceAccounts no existe: la «cuenta de servicio» es la clave service_role de Supabase, que el navegador no tiene. Escribir una «cuenta de servicio» ahora es escribir en una tabla que no existe. |
| 23 | colección no enumerada queda denegada por defecto | 0 / 1 | igual | la colección secretos no tiene tabla |  |
| 24 | recoveryMonitors: un miembro lee/escribe los de su clínica; otra clínica NO | 1 / 1 | diferencia intencional | no ve la fila | Postgres: se siembra el documento de la otra clínica (leer uno que no existe no prueba nada). |
| 25 | EMR: un ASISTENTE NO puede modificar el odontograma del paciente | 0 / 1 | igual | error 42501 |  |
| 26 | EMR: un ASISTENTE NO puede escribir evoluciones/recetas/perio del paciente | 0 / 2 | igual | error 42501 |  |
| 27 | EMR: el ASISTENTE SÍ puede editar demografía del paciente (no clínico) | 1 / 0 | igual | — |  |
| 28 | EMR: un DENTISTA SÍ puede escribir el odontograma/EMR del paciente | 1 / 0 | igual | — |  |
| 29 | EMR: un ADMIN SÍ puede escribir el EMR del paciente | 1 / 0 | igual | — |  |
| 30 | SEGUIMIENTO: recepción y dentista pueden quitar a un paciente de la lista y volver a incluirlo (no es un campo clínico) | 4 / 0 | igual | — |  |
| 31 | SEGUIMIENTO: la ficha entera con la quita (setDoc sin merge) pasa si lo clínico queda igual, y la recepción no puede colar lo clínico de paso | 2 / 1 | igual | error 42501 |  |
| 32 | SEGUIMIENTO: otra clínica no puede tocar la quita de un paciente ajeno | 0 / 1 | igual | error 42501 |  |
| 33 | MONETIZACIÓN: un admin NO puede auto-ascenderse de plan (clinics/{cid}.plan) | 0 / 1 | igual | error 42501 |  |
| 34 | MONETIZACIÓN: el admin SÍ puede editar el resto de la config de su clínica | 1 / 0 | igual | — |  |
| 35 | MONETIZACIÓN: un admin NO puede borrar su clínica | 0 / 1 | igual | error 42501 |  |
| 36 | SUSCRIPCIÓN: un miembro LEE la suscripción de su clínica (gating/banner) | 1 / 0 | igual | — |  |
| 37 | SUSCRIPCIÓN: ni el admin puede escribirla (solo el webhook/servicio) | 0 / 1 | igual | error 42501 |  |
| 38 | SUSCRIPCIÓN: no se lee la suscripción de OTRA clínica | 0 / 1 | diferencia intencional | no ve la fila | Postgres: se siembra subscriptions/clB (leer una que no existe no prueba nada). |
| 39 | COBRO: suscripción vencida (past_due) → NO puede escribir | 0 / 2 | igual | error 42501 |  |
| 40 | COBRO: suscripción vencida SÍ puede LEER y exportar (historia clínica) | 1 / 0 | igual | — |  |
| 41 | COBRO: período vencido corta la escritura aunque el status diga 'active' | 0 / 1 | igual | error 42501 |  |
| 42 | COBRO: clínica SIN doc de suscripción sigue escribiendo (grandfathering) | 1 / 0 | igual | — |  |
| 43 | COBRO: clínica al día escribe normal | 1 / 0 | igual | — |  |
| 44 | PLAN: el plan Solo NO escribe módulos premium (radiografías, firma, labs) | 0 / 3 | igual | error 42501 |  |
| 45 | PLAN: el plan Clínica SÍ escribe los premium de su plan | 2 / 0 | igual | — |  |
| 46 | PLAN: el CRM es solo de Cadena — ni Clínica ni Solo lo escriben | 0 / 2 | igual | error 42501 |  |
| 47 | PLAN: el plan Solo SÍ escribe lo básico (agenda, pacientes) | 2 / 0 | igual | — |  |
| 48 | COBRO: la demo nunca se bloquea por suscripción ni por plan | 2 / 0 | igual | — |  |
| 49 | NEGOCIO: la recepción NO puede LEER los gastos de la clínica | 0 / 1 | igual | no ve la fila |  |
| 50 | SUSCRIPCIÓN: un admin NO puede BORRAR su suscripción (volvería al grandfathering) | 0 / 1 | igual | error 42501 |  |
| 51 | CERRADO · el plan Solo ya no escribe `outbox` (WhatsApp lo paga el dueño del SaaS) | 1 / 1 | igual | error 42501 |  |
| 52 | CERRADO · el plan Solo ya no escribe `cashSessions` (feature `caja` = Clínica+) | 1 / 1 | igual | error 42501 |  |
| 53 | VULN(CRÍTICO): una suscripción 'active' SIN currentPeriodEndMs escribe sin límite de tiempo | 2 / 0 | igual | — |  |
| 54 | NEGOCIO: el dentista tampoco lee los gastos | 0 / 1 | igual | no ve la fila |  |
| 55 | NEGOCIO: el admin SÍ lee y escribe los gastos | 2 / 0 | igual | — |  |
| 56 | NEGOCIO: la recepción ya NO escribe gastos (antes podía, era isStaff) | 0 / 1 | igual | error 42501 |  |
| 57 | SALARIOS: nadie salvo el admin lee las liquidaciones | 1 / 2 | igual | no ve la fila |  |
| 58 | OPERACIÓN INTACTA: «Recepción y caja» sigue cobrando y viendo pagos | 2 / 0 | igual | — |  |
| 59 | AGUJERO (LECTURA) · cualquier empleado lee commissionPct/salaryBase de sus compañeros | 2 / 0 | igual | — |  |
| 60 | CERRADO · el ASISTENTE ya no evade el blindaje EMR con borrar+recrear | 2 / 2 | igual | error 42501 |  |
| 61 | CERRADO · el ASISTENTE no crea pacientes con odontograma/EMR fabricado, pero sí carga uno normal | 1 / 1 | igual | error 42501 |  |
| 62 | CERRADO · el ASISTENTE ya no escribe ni borra radiografías; el dentista sí | 1 / 2 | igual | error 42501 |  |
| 63 | CERRADO · el DENTISTA no escribe consentimientos y NADIE los borra | 1 / 3 | igual | error 42501 |  |
| 64 | CERRADO · el DENTISTA ya no abre caja ni cierra el arqueo ajeno | 1 / 2 | igual | error 42501, sin efecto (0 filas) |  |
| 65 | CERRADO · el DENTISTA ya no emite devoluciones ni borra boletas | 2 / 2 | igual | error 42501 |  |
| 66 | PENDIENTE · billing sigue sin distinguir submit de finalize | 2 / 0 | igual | — |  |
| 67 | CERRADO · un no-admin ya no cambia los precios del catálogo | 1 / 2 | igual | error 42501 |  |
| 68 | PENDIENTE · un no-admin todavía escribe config de la práctica (boxes/branches/surveys/eduVideos) | 2 / 0 | igual | — |  |
| 69 | AGUJERO (ESCRITURA) · el DENTISTA escribe stock/stockMoves (UI: inventory.manage) | 2 / 0 | igual | — |  |
| 70 | AGUJERO · una clínica del plan Solo crea usuarios sin tope (planUserLimitError es del cliente) | 12 / 0 | igual | — |  |
| 71 | CONTROL: siguen cerradas las escaladas de rol, dinero y salarios | 0 / 9 | igual | error 42501, no ve la fila |  |
| 72 | AISLAMIENTO: un miembro de A no LEE ninguna colección de la clínica X | 0 / 1 | igual | no ve la fila |  |
| 73 | AISLAMIENTO: un miembro de A no ESCRIBE ninguna colección de la clínica X | 0 / 1 | igual | error 42501 |  |
| 74 | AISLAMIENTO: un miembro de A no BORRA ninguna colección de la clínica X | 0 / 1 | igual | sin efecto (0 filas) |  |
| 75 | AISLAMIENTO: un miembro de A no LISTA colecciones de la clínica X (query, no get) | 0 / 1 | diferencia intencional | consulta filtrada (lista solo lo propio) | Firestore rechaza la consulta entera; Postgres la contesta vacía (la RLS filtra). Denegado = no devuelve ningún documento de clX y los hay. |
| 76 | AISLAMIENTO: el doc raíz de la clínica X (config, token de Botika) es opaco para A | 0 / 4 | igual | no ve la fila, error 42501, sin efecto (0 filas) |  |
| 77 | CONTROL: un miembro legítimo de X SÍ opera sus colecciones (el deny de arriba es aislamiento, no cobro/plan) | 1 / 0 | igual | — |  |
| 78 | FORASTERO: una cuenta sin clínica no lee NADA de una clínica real | 0 / 3 | igual | no ve la fila |  |
| 79 | FORASTERO: una cuenta sin clínica no puede AUTO-INSCRIBIRSE (bootstrap de membresía) | 0 / 4 | no aplica | error 42501, error 42P01 | serviceAccounts y directory no existen (las escrituras a ellos fallan porque no hay tabla); lo que cuenta —crearse un users propio para ser miembro— sigue denegado. |
| 80 | ANÓNIMO: sin sesión no se lee ni escribe ninguna clínica real | 0 / 3 | igual | no ve la fila, error 42501, error 42501, no ve la fila |  |
| 81 | ANÓNIMO: no se pueden enumerar las clínicas del proyecto | 0 / 5 | diferencia intencional | consulta filtrada (lista solo lo propio), la colección directory no tiene tabla, error 42501 | Firestore rechaza la consulta entera; Postgres contesta con lo permitido: anon solo ve la demo, un admin solo su clínica (y la demo, que es pública). Denegado = no aparece ninguna otra. leads no tiene permisos de tabla para nadie. |
| 82 | COLLECTION GROUP: no se puede barrer una colección a través de TODAS las clínicas | 0 / 2 | diferencia intencional | consulta filtrada (solo lo permitido) | Firestore rechaza la consulta de grupo; Postgres la contesta con lo permitido (las clínicas propias y la demo). Denegado = no devuelve filas de otra clínica. |
| 83 | DIRECTORY: un admin NO puede reescribir ni borrar la entrada ya existente de otro uid | 0 / 3 | no aplica | error 42501, sin efecto (0 filas) | directory no existe. El ruteo de un uid está en SU documento de usuario: un admin de otra clínica no lo puede cambiar, ni borrar, ni copiar el authUid a su clínica (índice único). |
| 84 | DIRECTORY: un admin SÍ puede sembrar el ruteo de un uid ajeno SIN entrada previa (residual) | 2 / 0 | no aplica | — | directory no existe. El residual sigue igual: un admin da de alta en SU clínica a un uid que todavía no es de nadie (y desde ese momento esa persona rutea a esa clínica). |
| 85 | CERRADO · nadie rutea un uid ajeno hacia la demo aunque se haga 'admin' de ella | 2 / 1 | igual | sin clínica asignada |  |
| 86 | I8: se guarda en la clínica A un documento que dice pertenecer a la clínica X | 3 / 0 | igual | — |  |
| 87 | I8: un admin puede mentir el clinicId de SU PROPIO doc de usuario (sale en la Session) | 1 / 0 | igual | — |  |
| 88 | CERRADO · SIN SESIÓN ya no se planta un usuario en cl_demo | 0 / 1 | igual | error 42501 |  |
| 89 | CERRADO · SIN SESIÓN ya no se borra ni se defacea el doc raíz de la demo | 0 / 2 | igual | error 42501 |  |
| 90 | DEMO: desde la demo NO se alcanza ninguna clínica real | 0 / 3 | igual | no ve la fila |  |
| 91 | RAÍZ: leads / checkoutTokens / webhookEvents son opacos para cualquier cliente | 0 / 12 | diferencia intencional | error 42501 | Postgres: se siembran los documentos (leer uno que no existe no prueba nada). Ni anon ni authenticated tienen permisos de tabla sobre estas tres. |
| 92 | CERRADO · SIN SESIÓN no se escribe NINGUNA colección de cl_demo | 0 / 1 | igual | error 42501 |  |
| 93 | CON sesión (la anónima del cliente) la demo sigue escribiéndose entera | 1 / 0 | igual | — |  |
| 94 | DEMO: `cl_clinica-demo` es una clínica REAL — isDemo debe ser igualdad exacta, nunca prefijo/contains | 0 / 5 | igual | no ve la fila, error 42501 |  |
| 95 | DIRECTOS: lo leen sus dos participantes; otra persona de la misma clínica NO | 2 / 2 | igual | no ve la fila |  |
| 96 | DIRECTOS: el admin lee cualquier directo de su clínica y lista la colección entera | 2 / 0 | igual | — |  |
| 97 | DIRECTOS: un no-admin NO lista la colección entera; SÍ la consulta por participants (la del store) | 1 / 2 | diferencia intencional | consulta filtrada (lista solo lo propio) | Firestore rechaza la consulta entera de un no-admin (las reglas no son filtros). Postgres la contesta con lo propio: pedirla completa trae solo los directos de esa persona. Denegado = no trae ninguno ajeno. El cliente ya no necesita la consulta especial. |
| 98 | DIFUSIÓN: cada destinatario lee solo SU copia — no averigua a quién más le llegó | 2 / 3 | diferencia intencional | no ve la fila, consulta filtrada (lista solo lo propio) | La consulta se contesta con lo permitido en vez de fallar entera (spec §5.2): «denegado» = no trae nada ajeno. |
| 99 | DIRECTOS: un ex empleado (active:false) ya no lee ni sus propios directos | 0 / 2 | diferencia intencional | no ve la fila, consulta filtrada (no trae nada) | La consulta se contesta con lo permitido en vez de fallar entera (spec §5.2): «denegado» = no trae nada ajeno. |
| 100 | DIRECTOS: un miembro manda un directo bien formado a otra persona de su clínica | 2 / 0 | igual | — |  |
| 101 | DIRECTOS: nadie manda un directo a nombre de otro (ni el admin, ni sin sesión) | 0 / 2 | igual | error 42501 |  |
| 102 | DIRECTOS: el alta valida destinatario, texto y forma del documento | 0 / 1 | igual | error 42501 |  |
| 103 | DIFUSIÓN: solo el admin la manda — un difusionId en el alta de otro rol se rechaza | 1 / 2 | igual | error 42501 |  |
| 104 | DIRECTOS: lo marca leído el destinatario y nadie más (ni el remitente, ni el admin) | 1 / 3 | igual | error 42501 |  |
| 105 | DIRECTOS: el destinatario solo toca readAt — no reescribe el texto ni el remitente | 0 / 3 | igual | error 42501 |  |
| 106 | DIRECTOS: nadie borra un mensaje, ni el admin | 0 / 3 | igual | error 42501 |  |
| 107 | DIRECTOS: con la suscripción vencida se leen y se marcan leídos, pero no se manda nada nuevo | 2 / 1 | igual | error 42501 |  |
| 108 | DIRECTOS: la demo sigue siendo el sandbox público de siempre | 2 / 1 | igual | error 42501 |  |
| 109 | documentos clínicos: admin, caja, recepción y dentista escriben; el asistente no | 8 / 2 | igual | error 42501 |  |
| 110 | documentos clínicos: todos los miembros leen, y un desconocido no | 5 / 2 | igual | no ve la fila |  |
| 111 | documentos clínicos: no se borran desde el cliente, ni el admin | 0 / 4 | igual | error 42501 |  |
| 112 | documentos clínicos: con la suscripción vencida se lee y no se escribe | 1 / 2 | igual | error 42501 |  |
| 113 | documentos clínicos: la demo es abierta para quien tiene sesión | 2 / 0 | igual | — |  |
| 114 | rutina del administrador: el admin tilda, cambia y destilda | 3 / 0 | igual | — |  |
| 115 | rutina del administrador: caja, recepción, dentista y asistente no escriben ni destildan | 0 / 12 | igual | error 42501 |  |
| 116 | rutina del administrador: todos los miembros leen, y un desconocido o de otra clínica no | 5 / 2 | igual | no ve la fila |  |
| 117 | rutina del administrador: el admin de otra clínica no escribe en la mía | 0 / 1 | igual | error 42501 |  |
| 118 | rutina del administrador: con la suscripción vencida se lee y no se escribe | 1 / 2 | igual | error 42501 |  |
| 119 | rutina del administrador: la demo es abierta para quien tiene sesión, no para un anónimo sin sesión | 2 / 1 | igual | error 42501 |  |
| 120 | bloqueos de agenda: todos los miembros leen (también la lista del día); un desconocido o alguien de otra clínica no | 6 / 3 | diferencia intencional | no ve la fila, consulta filtrada (lista solo lo propio) | La lista de otra clínica: Firestore rechaza la consulta, Postgres la contesta vacía (los hay). |
| 121 | bloqueos de agenda: los crea, cambia y quita cualquier miembro con la suscripción al día, como las citas | 15 / 0 | igual | — |  |
| 122 | bloqueos de agenda: un miembro dado de baja o alguien de otra clínica no escribe ni borra | 0 / 4 | igual | error 42501, sin efecto (0 filas) |  |
| 123 | bloqueos de agenda: el usuario de servicio (la reserva online) los lee | 2 / 0 | igual | — |  |
| 124 | bloqueos de agenda: con la suscripción vencida se leen y no se crean ni se quitan | 1 / 2 | igual | error 42501 |  |
| 125 | bloqueos de agenda: la demo se lee sin sesión y se escribe solo con sesión | 3 / 1 | igual | error 42501 |  |
| 126 | permisos del equipo — cobrar: lo gana la recepción y lo pierde la caja | 3 / 5 | igual | error 42501 |  |
| 127 | permisos del equipo — documentos y firmas: lo gana el dentista y lo pierde la recepción | 3 / 2 | igual | error 42501 |  |
| 128 | permisos del equipo — ficha clínica: la gana la asistente y la pierde el dentista | 4 / 3 | igual | error 42501 |  |
| 129 | permisos del equipo — gastos: los gana la caja, y nadie más los lee | 3 / 9 | diferencia intencional | no ve la fila, consulta filtrada (lista solo lo propio), error 42501 | Listar los gastos: Firestore rechaza la consulta de quien no puede; Postgres la contesta vacía. Denegado = no devuelve ninguno. |
| 130 | permisos del equipo — liquidaciones: las gana la asistente, y nadie más las lee | 3 / 9 | diferencia intencional | no ve la fila, consulta filtrada (lista solo lo propio), error 42501 | Listar las liquidaciones: Firestore rechaza la consulta de quien no puede; Postgres la contesta vacía. Denegado = no devuelve ninguna. |
| 131 | permisos del equipo — al administrador no se le saca nada, ni escribiéndolo a mano en la configuración | 5 / 0 | igual | — |  |
| 132 | permisos del equipo — crear usuarios y configurar la clínica no se reparten, aunque estén escritos | 0 / 4 | igual | error 42501 |  |
| 133 | permisos del equipo — nadie se da permisos a sí mismo: solo el administrador escribe config.permisos | 0 / 8 | igual | sin efecto (0 filas), error 42501 |  |
| 134 | permisos del equipo — los ajustes de una clínica no valen en otra | 1 / 2 | igual | error 42501 |  |
| 135 | permisos del equipo — sin ajustes (clínica sin config.permisos) rige la matriz de fábrica | 3 / 5 | igual | error 42501, no ve la fila |  |
| 136 | permisos del equipo — dar y quitar a la vez: gana dar; listas mal formadas se ignoran y rige la fábrica | 3 / 2 | igual | error 42501 |  |
| 137 | permisos del equipo — el cambio rige en el acto, al darlo y al sacarlo | 5 / 3 | igual | error 42501 |  |
| 138 | permisos del equipo — con la suscripción vencida se lee y no se escribe, aunque se haya repartido el permiso | 1 / 1 | igual | error 42501 |  |
| 139 | Comercial — firma y arma documentos clínicos (engagement.forms) pero no cobra ni toca la ficha, ni ve gastos ni liquidaciones | 4 / 5 | igual | error 42501, no ve la fila |  |
| 140 | roles propios — un rol propio puede lo que la clínica le dio en «dar» y nada más | 4 / 4 | igual | error 42501, no ve la fila |  |
| 141 | roles propios — sin entrada en config.permisos, o con una vacía, o con un id que no existe: no puede nada, pero sigue siendo miembro | 4 / 16 | igual | error 42501, no ve la fila |  |
| 142 | roles propios — quien tiene un rol propio no puede darse permisos ni cambiarse el rol (solo el administrador escribe) | 0 / 4 | igual | sin efecto (0 filas), error 42501 |  |
| 143 | roles propios — el administrador sí crea un rol, se lo asigna a alguien y el cambio rige en el acto | 4 / 2 | igual | error 42501 |  |

## Diferencias que no son de un caso en particular

- **Consulta entera contra consulta filtrada (spec §5.2).** Firestore rechaza una consulta que incluye algo que no se puede leer; la RLS contesta con lo permitido. Los casos que dependían de eso se transcriben como «no trae nada ajeno» (estado «diferencia intencional»). El cliente puede pedir `directMessages` completa y recibe lo suyo.
- **Un update o delete bloqueado por la política no da error: afecta 0 filas.** Las funciones `guardar`, `quitar`, `fijar_campo` y `lote` sí devuelven `42501`; un `update`/`delete` directo de PostgREST no.
- **`service_role` (el servidor) se salta RLS y las reglas por campo.** En Firestore el usuario de servicio era una cuenta más con su lista de permitidos: por ejemplo, no podía leer `directMessages` (ningún proceso del servidor los necesita). Ahora puede: la clave de servicio nunca sale del servidor.
- **Siembra de documentos que el original solo nombraba** (marcada en la nota de cada caso): leer un documento que no existe devuelve vacío con cualquier regla, así que «no lo ve» no probaría nada.
- **`directory` y `serviceAccounts` ya no existen** (8 casos). Su función la cumplen `users.data->>'authUid'` (único entre clínicas reales; `mi_directorio()`) y la clave `service_role`.
- **Casos nuevos** (no están en el original, están en `extras.test.mjs` y `sin-membresia.test.mjs`): editar el nombre de otro usuario, la clave inmutable de cada tabla, los campos clínicos con `null`, lo que puede el servidor, y una batería completa de quien no tiene membresía (la clave pública, la sesión anónima de la demo, una cuenta sin clínica, un JWT sin uid y un empleado dado de baja) contra las 41 tablas.
