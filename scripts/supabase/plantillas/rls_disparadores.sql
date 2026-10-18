-- Las 5 reglas por campo de firestore.rules. PostgreSQL no restringe por columna dentro de un jsonb, y una política no ve el documento
-- anterior: estas reglas dependen de QUÉ CAMBIÓ (old.data contra new.data), así que viven en disparadores `before`. Cada una rechaza con
-- el código 42501 (el mismo de «permiso denegado»).
--
-- Quién queda sujeto: todos los roles que están sujetos a RLS (anon, authenticated). Los que la saltan —service_role, postgres,
-- supabase_admin— también saltan estas reglas: el servidor y el cargador de datos escriben lo que tienen que escribir. Los disparadores
-- son `security invoker` a propósito: ven el rol de quien llama y no el del dueño.

-- ¿Quien llama se salta la RLS? (service_role, postgres, superusuarios.) Entonces también se salta las reglas por campo.
create or replace function interno.salta_reglas()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_roles where rolname = current_user and (rolsuper or rolbypassrls))
$$;

-- Las claves de primer nivel cuyo valor cambió entre dos documentos (agregadas, quitadas o con otro valor): el
-- `diff().affectedKeys()` de las reglas de Firestore. Reescribir un valor igual no cuenta.
create or replace function interno.claves_cambiadas(a jsonb, b jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(k order by k), '{}')
  from (
    select jsonb_object_keys(coalesce(a, '{}'::jsonb)) as k
    union
    select jsonb_object_keys(coalesce(b, '{}'::jsonb))
  ) t
  where (coalesce(a, '{}'::jsonb) ? k) <> (coalesce(b, '{}'::jsonb) ? k)
     or (a -> k) is distinct from (b -> k)
$$;

-- 1 · clinics: el admin edita la configuración pero NO `plan` (lo fija la suscripción; si no, cambiar `plan` a «cadena» desbloquea
--     todos los módulos premium sin pagar). El servidor y la demo (con sesión) sí pueden.
create or replace function interno.regla_clinics_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if interno.salta_reglas() or interno."isDemoRW"(new.id) then
    return new;
  end if;
  if 'plan' = any (interno.claves_cambiadas(old.data, new.data)) then
    raise exception 'el plan de la clínica lo fija la suscripción: no se cambia desde acá' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger "clinics_regla_plan" before update on public."clinics"
  for each row execute function interno.regla_clinics_plan();

-- 2 · users: un usuario edita SU PROPIO documento solo en `name` y `color` (lista BLANCA). No `role`, `active`, `clinicId`, `email`,
--     `authUid` (escalada, o mudarse de clínica), ni `commissionPct` (fraude de comisiones), ni `mustChangePassword` (saltarse el
--     cambio forzado: ese flag solo lo limpia el servidor tras rotar la contraseña real). El admin, el servidor y la demo no tienen tope.
--     La política de `update` ya dejó pasar solo al admin, a la demo o a quien edita su propia fila: acá solo queda este último caso.
create or replace function interno.regla_users_propio()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if interno.salta_reglas() or interno."isDemoRW"(new.clinic_id) or interno."isAdmin"(new.clinic_id) then
    return new;
  end if;
  foreach k in array interno.claves_cambiadas(old.data, new.data) loop
    if k not in ('name', 'color') then
      raise exception 'un usuario solo puede cambiar su nombre y su color (no %)', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

create or replace trigger "users_regla_propio" before update on public."users"
  for each row execute function interno.regla_users_propio();

-- 3 · patients: quien no es rol clínico (emr.write) no modifica los campos clínicos: {{CLINICOS_SQL}}. (El alta con campos clínicos
--     la rechaza la política de `insert`.) Un guardado que deja la ficha clínica intacta pasa: cuenta lo que cambia, no lo que se manda.
create or replace function interno.regla_patients_clinico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if interno.salta_reglas() or interno."isDemoRW"(new.clinic_id) then
    return new;
  end if;
  if not interno."isClinical"(new.clinic_id)
     and interno.claves_cambiadas(old.data, new.data) && array[{{CLINICOS_SQL}}]::text[] then
    raise exception 'los campos clínicos de la ficha solo los cambia un rol con emr.write' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger "patients_regla_clinico" before update on public."patients"
  for each row execute function interno.regla_patients_clinico();

-- 4 · directMessages (alta): siempre a nombre propio. `directoValido` de firestore.rules:
--     • lista cerrada de claves (`readAt` no viene en el alta: lo marca después el destinatario);
--     • `fromId` es quien escribe: nadie manda un directo a nombre de otro, ni el admin;
--     • `participants` son exactamente remitente y destinatario, y el destinatario es OTRA persona activa de la misma clínica;
--     • texto no vacío de hasta 2000 caracteres (el tope de la interfaz, lib/chat.ts MAX_TEXTO);
--     • `difusionId` (copia de una difusión general) solo lo pone el admin.
create or replace function interno.regla_directos_alta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d jsonb := new.data;
  cid text := new.clinic_id;
  yo text;
  clave text;
  requeridas constant text[] := array['id', 'clinicId', 'fromId', 'fromName', 'toId', 'participants', 'text', 'createdAt'];
  permitidas constant text[] := array['id', 'clinicId', 'fromId', 'fromName', 'toId', 'participants', 'text', 'createdAt', 'difusionId'];
begin
  if interno.salta_reglas() or interno."isDemoRW"(cid) then
    return new;
  end if;
  yo := interno.mi_usuario(cid);
  if not (d ?& requeridas) then
    raise exception 'al mensaje directo le faltan campos' using errcode = '42501';
  end if;
  for clave in select jsonb_object_keys(d) loop
    if clave <> all (permitidas) then
      raise exception 'el mensaje directo no admite el campo %', clave using errcode = '42501';
    end if;
  end loop;
  if jsonb_typeof(d -> 'id') <> 'string' or d ->> 'id' <> new.id then
    raise exception 'el id del mensaje no es el del documento' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'clinicId') <> 'string' or d ->> 'clinicId' <> cid then
    raise exception 'el mensaje dice ser de otra clínica' using errcode = '42501';
  end if;
  if yo is null or jsonb_typeof(d -> 'fromId') <> 'string' or d ->> 'fromId' <> yo then
    raise exception 'el remitente tiene que ser quien lo escribe' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'toId') <> 'string' or d ->> 'toId' = d ->> 'fromId' then
    raise exception 'el destinatario tiene que ser otra persona' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'participants') <> 'array' or jsonb_array_length(d -> 'participants') <> 2
     or not ((d -> 'participants') ? (d ->> 'fromId')) or not ((d -> 'participants') ? (d ->> 'toId')) then
    raise exception 'participants tiene que ser exactamente remitente y destinatario' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'text') <> 'string' or char_length(d ->> 'text') > 2000 or (d ->> 'text') !~ '\S' then
    raise exception 'el texto tiene que tener entre 1 y 2000 caracteres' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'fromName') <> 'string' or char_length(d ->> 'fromName') > 200 then
    raise exception 'fromName inválido' using errcode = '42501';
  end if;
  if jsonb_typeof(d -> 'createdAt') <> 'string' then
    raise exception 'createdAt inválido' using errcode = '42501';
  end if;
  if d ? 'difusionId' and (jsonb_typeof(d -> 'difusionId') <> 'string' or not interno."isAdmin"(cid)) then
    raise exception 'solo el administrador manda una difusión' using errcode = '42501';
  end if;
  if not interno.es_usuario_activo(cid, d ->> 'toId') then
    raise exception 'el destinatario no es una persona activa de la clínica' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger "directMessages_regla_alta" before insert on public."directMessages"
  for each row execute function interno.regla_directos_alta();

-- 5 · directMessages (update): el destinatario solo puede marcarlo leído: cambia únicamente `readAt`, y es un texto. (Que sea el
--     destinatario lo exige la política de `update`.)
create or replace function interno.regla_directos_leido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if interno.salta_reglas() or interno."isDemoRW"(new.clinic_id) then
    return new;
  end if;
  foreach k in array interno.claves_cambiadas(old.data, new.data) loop
    if k <> 'readAt' then
      raise exception 'un mensaje directo solo se puede marcar como leído (no se cambia %)', k using errcode = '42501';
    end if;
  end loop;
  if jsonb_typeof(new.data -> 'readAt') is distinct from 'string' then
    raise exception 'readAt tiene que ser un texto' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace trigger "directMessages_regla_leido" before update on public."directMessages"
  for each row execute function interno.regla_directos_leido();

-- 6 · Tope de filas de la demo: cl_demo la escribe cualquiera con una sesión anónima (es el sandbox de ventas), y un documento tiene
--     tope de tamaño pero no hay tope de cantidad. Ninguna colección de la demo pasa de 5000 documentos: la demo legítima siembra ~125 en
--     total, así que sobra. Se rechaza el alta con 53400 (configuration_limit_exceeded). Un reemplazo (`guardar` sobre un documento
--     que ya existe) no es un alta, y «Restaurar datos de demo» que borra y vuelve a crear en una misma transacción ve sus propios borrados.
--     Es un tope blando: dos altas simultáneas justo en el borde pueden pasarse por una. No vale para el servidor ni el cargador.
create or replace function interno.tope_demo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tope constant integer := 5000;
  filas integer;
begin
  if new.clinic_id <> 'cl_demo' or interno.salta_reglas() then
    return new;
  end if;
  execute format('select count(*) from (select 1 from %I.%I where clinic_id = ''cl_demo'' limit %s) t', tg_table_schema, tg_table_name, tope) into filas;
  if filas >= tope then
    raise exception 'la demo no admite más de % documentos en %', tope, tg_table_name using errcode = '53400';
  end if;
  return new;
end $$;

{{TRIGGERS_TOPE_DEMO}}

revoke all on all functions in schema interno from public;
grant execute on all functions in schema interno to anon, authenticated, service_role;
