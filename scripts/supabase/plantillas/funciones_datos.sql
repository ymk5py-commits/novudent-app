-- Las operaciones de datos que usa el navegador y el servidor (spec del 9-oct §5.2). Se llaman con `rpc` de PostgREST.
--
--   guardar(tabla, clinic_id, id, data)                         setDoc sin merge (alta o reemplazo entero del documento)
--   quitar(tabla, clinic_id, id)                                deleteDoc
--   fijar_campo(tabla, clinic_id, id, campo, valor, quitar)     updateDoc de UN campo de primer nivel / deleteField
--   mezclar_clinica(cid, parche)                                setDoc(clinics/{cid}, parche, {merge: true})
--   lote(operaciones)                                           writeBatch: todas las operaciones o ninguna
--
-- Todas corren con los permisos de quien llama (security invoker): la RLS y las reglas por campo se aplican igual que con un
-- insert o un update directos. Las tablas se validan contra una lista (nunca se arma SQL con un nombre que no esté en ella).
--
-- Por qué `guardar` y no un `insert … on conflict do update` de PostgREST: ese insert evalúa la política de ALTA sobre la fila nueva
-- aunque el documento ya exista. Firestore evalúa un setDoc sobre un documento existente como una ACTUALIZACIÓN (p. ej. el asistente
-- puede guardar la ficha entera si no cambió nada clínico). `guardar` hace lo mismo: primero actualiza y solo si no existe, da el alta.

create or replace function interno.fusion_profunda(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  -- Fusión profunda de objetos como la de Firestore: los objetos se mezclan clave por clave; todo lo demás (arreglos, textos, números,
  -- null) reemplaza. `null` se guarda como null: no borra la clave.
  if jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(b) is distinct from 'object' then
    return b;
  end if;
  r := a;
  for k, v in select key, value from jsonb_each(b) loop
    r := jsonb_set(
      r, array[k],
      case when jsonb_typeof(r -> k) = 'object' and jsonb_typeof(v) = 'object' then interno.fusion_profunda(r -> k, v) else v end,
      true);
  end loop;
  return r;
end $$;

create or replace function interno.tipo_de_tabla(tabla text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when tabla = any (array[{{TABLAS_CLINICA_SQL}}]::text[]) then 'clinica'
    when tabla = any (array[{{TABLAS_RAIZ_SQL}}]::text[]) then 'raiz'
  end
$$;

-- Valida el destino de una operación y devuelve si la tabla es de una clínica ('clinica') o raíz ('raiz').
create or replace function interno.destino_valido(tabla text, clinic_id text, id text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  tipo text := interno.tipo_de_tabla(tabla);
begin
  if tipo is null then
    raise exception 'la tabla % no existe en Novudent', tabla using errcode = '42P01';
  end if;
  if id is null or id = '' then
    raise exception 'falta el id del documento' using errcode = '22023';
  end if;
  if tipo = 'clinica' and (clinic_id is null or clinic_id = '') then
    raise exception 'falta clinic_id (la tabla % es de una clínica)', tabla using errcode = '22023';
  end if;
  if tipo = 'raiz' and clinic_id is not null then
    raise exception 'la tabla % no es de una clínica: clinic_id tiene que ser null', tabla using errcode = '22023';
  end if;
  return tipo;
end $$;

create or replace function public.guardar(tabla text, clinic_id text, id text, data jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tipo text := interno.destino_valido(tabla, clinic_id, id);
  n integer;
begin
  if jsonb_typeof(data) is distinct from 'object' then
    raise exception 'data tiene que ser un objeto JSON' using errcode = '22023';
  end if;
  for i in 1..3 loop
    if tipo = 'clinica' then
      execute format('update public.%I set data = $1 where clinic_id = $2 and id = $3', tabla) using data, clinic_id, id;
    else
      execute format('update public.%I set data = $1 where id = $2', tabla) using data, id;
    end if;
    get diagnostics n = row_count;
    if n > 0 then return; end if;
    -- No hay nada que actualizar (no existe, o existe y no lo ve quien llama): alta. Si el documento apareció en el medio, se vuelve a intentar.
    if tipo = 'clinica' then
      execute format('insert into public.%I (clinic_id, id, data) values ($1, $2, $3) on conflict do nothing', tabla) using clinic_id, id, data;
    else
      execute format('insert into public.%I (id, data) values ($1, $2) on conflict do nothing', tabla) using id, data;
    end if;
    get diagnostics n = row_count;
    if n > 0 then return; end if;
  end loop;
  raise exception 'no se pudo guardar %/%: ninguna regla lo permite', tabla, id using errcode = '42501';
end $$;

create or replace function public.quitar(tabla text, clinic_id text, id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  tipo text := interno.destino_valido(tabla, clinic_id, id);
  n integer;
  visibles integer;
begin
  if tipo = 'clinica' then
    execute format('delete from public.%I where clinic_id = $1 and id = $2', tabla) using clinic_id, id;
  else
    execute format('delete from public.%I where id = $1', tabla) using id;
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    -- Si lo veo y no pude borrarlo, es un permiso denegado. Si no lo veo, no hay nada que borrar: se devuelve 0 sin avisar si existía.
    if tipo = 'clinica' then
      execute format('select count(*) from public.%I where clinic_id = $1 and id = $2', tabla) into visibles using clinic_id, id;
    else
      execute format('select count(*) from public.%I where id = $1', tabla) into visibles using id;
    end if;
    if visibles > 0 then
      raise exception 'no se pudo borrar %/%: ninguna regla lo permite', tabla, id using errcode = '42501';
    end if;
  end if;
  return n;
end $$;

-- `valor` es null → se guarda null (igual que Firestore); `quitar` = true → se quita la clave (deleteField). El campo es de primer
-- nivel: uno vacío o con punto se rechaza (Firestore lo leería como una ruta anidada).
create or replace function public.fijar_campo(tabla text, clinic_id text, id text, campo text, valor jsonb default null, quitar boolean default false)
returns void
language plpgsql
set search_path = ''
as $$
declare
  tipo text := interno.destino_valido(tabla, clinic_id, id);
  n integer;
begin
  if campo is null or campo = '' or position('.' in campo) > 0 then
    raise exception 'campo inválido (%): tiene que ser un nombre de primer nivel, sin puntos', campo using errcode = '22023';
  end if;
  if coalesce(quitar, false) then
    if tipo = 'clinica' then
      execute format('update public.%I set data = data - $1 where clinic_id = $2 and id = $3', tabla) using campo, clinic_id, id;
    else
      execute format('update public.%I set data = data - $1 where id = $2', tabla) using campo, id;
    end if;
  else
    if tipo = 'clinica' then
      execute format('update public.%I set data = jsonb_set(data, array[$1], coalesce($2, ''null''::jsonb), true) where clinic_id = $3 and id = $4', tabla) using campo, valor, clinic_id, id;
    else
      execute format('update public.%I set data = jsonb_set(data, array[$1], coalesce($2, ''null''::jsonb), true) where id = $3', tabla) using campo, valor, id;
    end if;
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no se pudo cambiar %/%: no existe o ninguna regla lo permite', tabla, id using errcode = '42501';
  end if;
end $$;

create or replace function public.mezclar_clinica(cid text, parche jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if cid is null or cid = '' then
    raise exception 'falta el id de la clínica' using errcode = '22023';
  end if;
  if jsonb_typeof(parche) is distinct from 'object' then
    raise exception 'parche tiene que ser un objeto JSON' using errcode = '22023';
  end if;
  for i in 1..3 loop
    update public.clinics set data = interno.fusion_profunda(data, parche) where id = cid;
    get diagnostics n = row_count;
    if n > 0 then return; end if;
    insert into public.clinics (id, data) values (cid, parche) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then return; end if;
  end loop;
  raise exception 'no se pudo guardar la clínica %: ninguna regla lo permite', cid using errcode = '42501';
end $$;

-- operaciones: [{ "op": "guardar", "tabla", "clinic_id", "id", "data" },
--               { "op": "quitar", "tabla", "clinic_id", "id" },
--               { "op": "fijar_campo", "tabla", "clinic_id", "id", "campo", "valor", "quitar" },
--               { "op": "mezclar_clinica", "cid", "parche" }]
-- Una sola llamada es una sola transacción: si una operación falla, no queda ninguna. Devuelve cuántas se aplicaron.
create or replace function public.lote(operaciones jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  o jsonb;
  n integer := 0;
begin
  if jsonb_typeof(operaciones) is distinct from 'array' then
    raise exception 'operaciones tiene que ser un arreglo JSON' using errcode = '22023';
  end if;
  if jsonb_array_length(operaciones) > 1000 then
    raise exception 'un lote admite hasta 1000 operaciones' using errcode = '54000';
  end if;
  for o in select value from jsonb_array_elements(operaciones) loop
    case o ->> 'op'
      when 'guardar' then
        perform public.guardar(o ->> 'tabla', o ->> 'clinic_id', o ->> 'id', o -> 'data');
      when 'quitar' then
        perform public.quitar(o ->> 'tabla', o ->> 'clinic_id', o ->> 'id');
      when 'fijar_campo' then
        perform public.fijar_campo(o ->> 'tabla', o ->> 'clinic_id', o ->> 'id', o ->> 'campo', o -> 'valor', coalesce((o ->> 'quitar')::boolean, false));
      when 'mezclar_clinica' then
        perform public.mezclar_clinica(o ->> 'cid', o -> 'parche');
      else
        raise exception 'operación desconocida: %', o ->> 'op' using errcode = '22023';
    end case;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Solo con sesión (o la clave de servicio). La demo se escribe con la sesión anónima de GoTrue, que es el rol authenticated.
revoke all on function public.guardar(text, text, text, jsonb) from public, anon;
revoke all on function public.quitar(text, text, text) from public, anon;
revoke all on function public.fijar_campo(text, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.mezclar_clinica(text, jsonb) from public, anon;
revoke all on function public.lote(jsonb) from public, anon;
grant execute on function public.guardar(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.quitar(text, text, text) to authenticated, service_role;
grant execute on function public.fijar_campo(text, text, text, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.mezclar_clinica(text, jsonb) to authenticated, service_role;
grant execute on function public.lote(jsonb) to authenticated, service_role;
