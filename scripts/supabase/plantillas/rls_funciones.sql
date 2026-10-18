-- Las funciones auxiliares de los permisos: son las `function` de firestore.rules, con los mismos nombres (spec del 9-oct §6.1).
--
-- Viven en el esquema `interno`, que PostgREST NO expone (solo expone `public`): el navegador no las puede llamar por la API. Las
-- políticas sí, porque anon y authenticated tienen USAGE sobre `interno` y EXECUTE sobre estas funciones.
--
-- Las que leen tablas son `security definer` con el `search_path` fijo: el dueño (postgres, que salta RLS) lee `users`, `clinics` y
-- `subscriptions` sin entrar en un ciclo de políticas. Son `stable`, así que se evalúan una vez por fila como mucho y no cambian dentro
-- de una consulta. Los nombres con mayúscula van entre comillas (Postgres pasa a minúsculas lo que no las lleva).
--
-- Qué NO hay: `isService()`. La clave de servicio (rol service_role) salta RLS, así que no hace falta preguntarlo en cada política.

-- El uid de la sesión de GoTrue. PostgREST (con PGRST_DB_USE_LEGACY_GUCS=false) deja los claims del JWT en `request.jwt.claims`;
-- auth.uid() de la imagen de Supabase solo mira el viejo `request.jwt.claim.sub`, así que se leen los dos.
create or replace function interno.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
  )::uuid
$$;

-- isDemo(cid): LECTURA, sin sesión. `cl_demo` es el sandbox público de ventas. Igualdad EXACTA: nunca prefijo ni contains
-- (existe una clínica real con id `cl_clinica-demo`).
create or replace function interno."isDemo"(cid text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select cid = 'cl_demo' $$;

-- isDemoRW(cid): ESCRITURA. Exige sesión (la anónima de la demo lo es).
create or replace function interno."isDemoRW"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select cid = 'cl_demo' and interno.uid() is not null $$;

-- isMember(cid): tiene un documento en `users` de esa clínica con su authUid Y no está dado de baja (`active` distinto de false; un
-- documento sin el campo cuenta como activo). El chequeo de `active` va ACÁ y no solo en el login: la credencial de un empleado dado
-- de baja sigue siendo válida.
create or replace function interno."isMember"(cid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.clinic_id = cid
      and u.data ->> 'authUid' = interno.uid()::text
      and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
  )
$$;

-- isAdmin(cid): miembro con role = 'admin'.
create or replace function interno."isAdmin"(cid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.clinic_id = cid
      and u.data ->> 'authUid' = interno.uid()::text
      and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
      and u.data ->> 'role' = 'admin'
  )
$$;

-- mi_usuario(cid): el `id` del documento de usuario de quien llama en esa clínica. Hace falta porque `participants`, `fromId`,
-- `toId`, `dentistId`… guardan el id del usuario, no el uid de login. `null` si no es miembro.
create or replace function interno.mi_usuario(cid text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from public.users u
  where u.clinic_id = cid
    and u.data ->> 'authUid' = interno.uid()::text
    and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
  order by u.id
  limit 1
$$;

-- ¿Existe ese usuario en la clínica y no está dado de baja? (el destinatario de un mensaje directo)
create or replace function interno.es_usuario_activo(cid text, uid_doc text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.clinic_id = cid and u.id = uid_doc
      and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
  )
$$;

-- tienePermiso(cid, perm, rolesDeFabrica): lo mismo que `permisoEfectivo()` de lib/rbac.ts (y que `tienePermiso` de firestore.rules):
--   • el admin siempre puede;
--   • lo que figura en `config.permisos[rol].dar` lo puede el rol aunque la fábrica no se lo dé;
--   • lo demás, si el rol está en `rolesDeFabrica` y el permiso no figura en `quitar`.
-- Un permiso en `dar` y en `quitar` a la vez gana `dar`. Lo mal formado (un rol que no es un mapa, una lista que no es una lista) se
-- ignora y rige la fábrica. Un rol propio (`rp_…`) no está en ninguna lista de fábrica: lo que puede es su `dar`.
create or replace function interno."tienePermiso"(cid text, perm text, roles_de_fabrica text[])
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rol text;
  permisos jsonb;
  ajustes jsonb;
  dar jsonb;
  quitar jsonb;
begin
  select u.data ->> 'role' into rol
  from public.users u
  where u.clinic_id = cid
    and u.data ->> 'authUid' = interno.uid()::text
    and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
  order by u.id
  limit 1;
  if not found or rol is null then
    return false;
  end if;
  if rol = 'admin' then
    return true;
  end if;
  select c.data #> '{config,permisos}' into permisos from public.clinics c where c.id = cid;
  if jsonb_typeof(permisos) = 'object' then
    ajustes := permisos -> rol;
  end if;
  if jsonb_typeof(ajustes) = 'object' then
    dar := ajustes -> 'dar';
    quitar := ajustes -> 'quitar';
  end if;
  if jsonb_typeof(dar) = 'array' and dar ? perm then
    return true;
  end if;
  -- coalesce: sin lista `quitar` el jsonb_typeof es null y la cuenta daría null (ni sí ni no), no true.
  return rol = any (roles_de_fabrica) and not coalesce(jsonb_typeof(quitar) = 'array' and quitar ? perm, false);
end $$;

-- Caja: cobra, factura y hace el arqueo (payments.manage; de fábrica admin y caja).
create or replace function interno."isCaja"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select interno."tienePermiso"(cid, 'payments.manage', array['admin', 'cashier']) $$;

-- Recepción: consentimientos, firmas y formularios del paciente (engagement.forms; de fábrica admin, caja, recepción y comercial).
create or replace function interno."isRecepcion"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select interno."tienePermiso"(cid, 'engagement.forms', array['admin', 'cashier', 'receptionist', 'commercial']) $$;

-- Rol clínico (emr.write; de fábrica admin y dentista). El asistente de fábrica no escribe la ficha.
create or replace function interno."isClinical"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select interno."tienePermiso"(cid, 'emr.write', array['admin', 'dentist']) $$;

-- Gastos del negocio (expenses.manage; de fábrica solo el admin).
create or replace function interno."puedeGastos"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select interno."tienePermiso"(cid, 'expenses.manage', array['admin']) $$;

-- Liquidaciones = lo que gana cada profesional (billing.reports; de fábrica solo el admin).
create or replace function interno."puedeLiquidaciones"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select interno."tienePermiso"(cid, 'billing.reports', array['admin']) $$;

-- subActive(cid): ¿la clínica puede ESCRIBIR? Sin documento de suscripción → sí (las clínicas anteriores al cobro no quedan en solo
-- lectura de un día para el otro). Con documento: solo si está al día (active o trialing) Y el período no venció — la fecha se mira
-- aparte del estado por si se perdió el aviso de impago.
create or replace function interno."subActive"(cid text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  select data into s from public.subscriptions where id = cid;
  if not found then
    return true;
  end if;
  if coalesce(s ->> 'status', '') not in ('active', 'trialing') then
    return false;
  end if;
  if not (s ? 'currentPeriodEndMs') then
    return true;
  end if;
  -- CASE y no AND: Postgres no garantiza el orden de un AND, y el cast a numérico falla con un texto.
  return case
    when jsonb_typeof(s -> 'currentPeriodEndMs') = 'number' then (s ->> 'currentPeriodEndMs')::numeric > extract(epoch from now()) * 1000
    else false
  end;
end $$;

-- effectivePlan(cid): el de la suscripción; si no hay documento, el legacy de clinics.plan; sin ninguno de los dos, 'clinica' (el default
-- histórico). Una suscripción sin plan da null (y null no está en ninguna lista: se deniega).
create or replace function interno."effectivePlan"(cid text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
  c jsonb;
begin
  select data into s from public.subscriptions where id = cid;
  if found then
    return s ->> 'plan';
  end if;
  select data into c from public.clinics where id = cid;
  if found and c ? 'plan' then
    return c ->> 'plan';
  end if;
  return 'clinica';
end $$;

-- canWrite(cid): escritura de datos operativos = miembro con la suscripción al día, o la demo con sesión.
create or replace function interno."canWrite"(cid text)
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce((interno."isMember"(cid) and interno."subActive"(cid)) or interno."isDemoRW"(cid), false) $$;

-- canWritePremium(cid, planes): igual, y además el plan tiene que incluir el módulo. El gating de plan no vive solo en la pantalla.
create or replace function interno."canWritePremium"(cid text, planes text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (interno."isMember"(cid) and interno."subActive"(cid) and interno."effectivePlan"(cid) = any (planes)) or interno."isDemoRW"(cid),
    false)
$$;

-- Para el cliente: el id de MI documento de usuario en esa clínica (el adaptador lo usa para `currentUserId()`).
create or replace function public.mi_usuario(cid text)
returns text
language sql
stable
set search_path = ''
as $$ select interno.mi_usuario(cid) $$;

-- Para el cliente: la clínica y el usuario de la sesión. Reemplaza al `directory` de Firestore (login multi-clínica) y devuelve el id del
-- DOCUMENTO de usuario, que es lo que guardan `dentistId`, `participants`… (el `currentUserId()` del adaptador). Cero filas = esa sesión no
-- pertenece a ninguna clínica. Una cuenta real nunca se rutea a la demo (cualquiera con sesión puede plantar un usuario en `cl_demo`, y
-- desde ahí secuestraría el ruteo de otra persona) y quien está dado de baja no tiene clínica.
create or replace function public.mi_directorio()
returns table (clinic_id text, user_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.clinic_id, u.id from public.users u
  where u.data ->> 'authUid' = interno.uid()::text
    and u.clinic_id <> 'cl_demo'
    and coalesce(u.data -> 'active', 'true'::jsonb) <> 'false'::jsonb
  order by u.clinic_id, u.id
  limit 1
$$;

revoke all on function public.mi_usuario(text) from public, anon;
revoke all on function public.mi_directorio() from public, anon;
grant execute on function public.mi_usuario(text) to authenticated, service_role;
grant execute on function public.mi_directorio() to authenticated, service_role;

-- Las políticas se evalúan con el rol de quien consulta: tiene que poder usar el esquema y ejecutar estas funciones.
revoke all on all functions in schema interno from public;
grant execute on all functions in schema interno to anon, authenticated, service_role;
