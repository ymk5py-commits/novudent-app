-- GENERADO por scripts/supabase/generar-esquema.mjs a partir de lib/backend/colecciones.json. NO editar a mano:
-- se cambia el generador (o scripts/supabase/plantillas/) y se vuelve a generar con `node scripts/supabase/generar-esquema.mjs`.
-- Tablas: una por colección. (clinic_id, id, data jsonb, updated_at); las raíz sin clinic_id. RLS activado y sin permisos para anon/authenticated.

create schema if not exists interno;
revoke all on schema interno from public;
grant usage on schema interno to anon, authenticated, service_role;

-- Un documento no cambia de clave (ni de clínica ni de id) y su updated_at lo mantiene la base, no quien escribe.
create or replace function interno.al_actualizar_clinica()
returns trigger
language plpgsql
as $$
begin
  if new.clinic_id is distinct from old.clinic_id or new.id is distinct from old.id then
    raise exception 'la clave de un documento no se cambia (%/%)', old.clinic_id, old.id using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function interno.al_actualizar_raiz()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'la clave de un documento no se cambia (%)', old.id using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ── Colecciones de cada clínica (36) ──────────────────────────────────────────
do $$
begin
  if to_regclass('public."users"') is null then
    create table public."users" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "users_pkey" primary key (clinic_id, id),
  constraint "users_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."users" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."users"'::regclass and conname = 'users_data_tamano') then
    alter table public."users" add constraint "users_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."users" enable row level security;
grant all on table public."users" to service_role;
create or replace trigger "users_al_actualizar" before update on public."users"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."patients"') is null then
    create table public."patients" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "patients_pkey" primary key (clinic_id, id),
  constraint "patients_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."patients" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."patients"'::regclass and conname = 'patients_data_tamano') then
    alter table public."patients" add constraint "patients_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."patients" enable row level security;
grant all on table public."patients" to service_role;
create or replace trigger "patients_al_actualizar" before update on public."patients"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."appointments"') is null then
    create table public."appointments" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "appointments_pkey" primary key (clinic_id, id),
  constraint "appointments_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."appointments" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."appointments"'::regclass and conname = 'appointments_data_tamano') then
    alter table public."appointments" add constraint "appointments_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."appointments" enable row level security;
grant all on table public."appointments" to service_role;
create or replace trigger "appointments_al_actualizar" before update on public."appointments"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."billing"') is null then
    create table public."billing" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "billing_pkey" primary key (clinic_id, id),
  constraint "billing_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."billing" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."billing"'::regclass and conname = 'billing_data_tamano') then
    alter table public."billing" add constraint "billing_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."billing" enable row level security;
grant all on table public."billing" to service_role;
create or replace trigger "billing_al_actualizar" before update on public."billing"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."procedures"') is null then
    create table public."procedures" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "procedures_pkey" primary key (clinic_id, id),
  constraint "procedures_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."procedures" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."procedures"'::regclass and conname = 'procedures_data_tamano') then
    alter table public."procedures" add constraint "procedures_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."procedures" enable row level security;
grant all on table public."procedures" to service_role;
create or replace trigger "procedures_al_actualizar" before update on public."procedures"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."budgets"') is null then
    create table public."budgets" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "budgets_pkey" primary key (clinic_id, id),
  constraint "budgets_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."budgets" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."budgets"'::regclass and conname = 'budgets_data_tamano') then
    alter table public."budgets" add constraint "budgets_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."budgets" enable row level security;
grant all on table public."budgets" to service_role;
create or replace trigger "budgets_al_actualizar" before update on public."budgets"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."payments"') is null then
    create table public."payments" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "payments_pkey" primary key (clinic_id, id),
  constraint "payments_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."payments" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."payments"'::regclass and conname = 'payments_data_tamano') then
    alter table public."payments" add constraint "payments_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."payments" enable row level security;
grant all on table public."payments" to service_role;
create or replace trigger "payments_al_actualizar" before update on public."payments"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."expenses"') is null then
    create table public."expenses" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "expenses_pkey" primary key (clinic_id, id),
  constraint "expenses_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."expenses" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."expenses"'::regclass and conname = 'expenses_data_tamano') then
    alter table public."expenses" add constraint "expenses_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."expenses" enable row level security;
grant all on table public."expenses" to service_role;
create or replace trigger "expenses_al_actualizar" before update on public."expenses"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."stock"') is null then
    create table public."stock" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "stock_pkey" primary key (clinic_id, id),
  constraint "stock_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."stock" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."stock"'::regclass and conname = 'stock_data_tamano') then
    alter table public."stock" add constraint "stock_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."stock" enable row level security;
grant all on table public."stock" to service_role;
create or replace trigger "stock_al_actualizar" before update on public."stock"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."stockMoves"') is null then
    create table public."stockMoves" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "stockMoves_pkey" primary key (clinic_id, id),
  constraint "stockMoves_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."stockMoves" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."stockMoves"'::regclass and conname = 'stockMoves_data_tamano') then
    alter table public."stockMoves" add constraint "stockMoves_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."stockMoves" enable row level security;
grant all on table public."stockMoves" to service_role;
create or replace trigger "stockMoves_al_actualizar" before update on public."stockMoves"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."waitlist"') is null then
    create table public."waitlist" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "waitlist_pkey" primary key (clinic_id, id),
  constraint "waitlist_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."waitlist" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."waitlist"'::regclass and conname = 'waitlist_data_tamano') then
    alter table public."waitlist" add constraint "waitlist_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."waitlist" enable row level security;
grant all on table public."waitlist" to service_role;
create or replace trigger "waitlist_al_actualizar" before update on public."waitlist"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."outbox"') is null then
    create table public."outbox" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "outbox_pkey" primary key (clinic_id, id),
  constraint "outbox_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."outbox" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."outbox"'::regclass and conname = 'outbox_data_tamano') then
    alter table public."outbox" add constraint "outbox_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."outbox" enable row level security;
grant all on table public."outbox" to service_role;
create or replace trigger "outbox_al_actualizar" before update on public."outbox"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."slotLocks"') is null then
    create table public."slotLocks" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "slotLocks_pkey" primary key (clinic_id, id),
  constraint "slotLocks_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."slotLocks" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."slotLocks"'::regclass and conname = 'slotLocks_data_tamano') then
    alter table public."slotLocks" add constraint "slotLocks_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."slotLocks" enable row level security;
grant all on table public."slotLocks" to service_role;
create or replace trigger "slotLocks_al_actualizar" before update on public."slotLocks"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."recoveryMonitors"') is null then
    create table public."recoveryMonitors" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "recoveryMonitors_pkey" primary key (clinic_id, id),
  constraint "recoveryMonitors_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."recoveryMonitors" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."recoveryMonitors"'::regclass and conname = 'recoveryMonitors_data_tamano') then
    alter table public."recoveryMonitors" add constraint "recoveryMonitors_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."recoveryMonitors" enable row level security;
grant all on table public."recoveryMonitors" to service_role;
create or replace trigger "recoveryMonitors_al_actualizar" before update on public."recoveryMonitors"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."radiographs"') is null then
    create table public."radiographs" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "radiographs_pkey" primary key (clinic_id, id),
  constraint "radiographs_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."radiographs" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."radiographs"'::regclass and conname = 'radiographs_data_tamano') then
    alter table public."radiographs" add constraint "radiographs_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."radiographs" enable row level security;
grant all on table public."radiographs" to service_role;
create or replace trigger "radiographs_al_actualizar" before update on public."radiographs"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."signatures"') is null then
    create table public."signatures" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "signatures_pkey" primary key (clinic_id, id),
  constraint "signatures_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."signatures" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."signatures"'::regclass and conname = 'signatures_data_tamano') then
    alter table public."signatures" add constraint "signatures_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."signatures" enable row level security;
grant all on table public."signatures" to service_role;
create or replace trigger "signatures_al_actualizar" before update on public."signatures"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."crmCards"') is null then
    create table public."crmCards" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "crmCards_pkey" primary key (clinic_id, id),
  constraint "crmCards_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."crmCards" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."crmCards"'::regclass and conname = 'crmCards_data_tamano') then
    alter table public."crmCards" add constraint "crmCards_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."crmCards" enable row level security;
grant all on table public."crmCards" to service_role;
create or replace trigger "crmCards_al_actualizar" before update on public."crmCards"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."campaigns"') is null then
    create table public."campaigns" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "campaigns_pkey" primary key (clinic_id, id),
  constraint "campaigns_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."campaigns" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."campaigns"'::regclass and conname = 'campaigns_data_tamano') then
    alter table public."campaigns" add constraint "campaigns_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."campaigns" enable row level security;
grant all on table public."campaigns" to service_role;
create or replace trigger "campaigns_al_actualizar" before update on public."campaigns"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."labOrders"') is null then
    create table public."labOrders" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "labOrders_pkey" primary key (clinic_id, id),
  constraint "labOrders_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."labOrders" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."labOrders"'::regclass and conname = 'labOrders_data_tamano') then
    alter table public."labOrders" add constraint "labOrders_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."labOrders" enable row level security;
grant all on table public."labOrders" to service_role;
create or replace trigger "labOrders_al_actualizar" before update on public."labOrders"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."settlements"') is null then
    create table public."settlements" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "settlements_pkey" primary key (clinic_id, id),
  constraint "settlements_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."settlements" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."settlements"'::regclass and conname = 'settlements_data_tamano') then
    alter table public."settlements" add constraint "settlements_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."settlements" enable row level security;
grant all on table public."settlements" to service_role;
create or replace trigger "settlements_al_actualizar" before update on public."settlements"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."boxes"') is null then
    create table public."boxes" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "boxes_pkey" primary key (clinic_id, id),
  constraint "boxes_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."boxes" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."boxes"'::regclass and conname = 'boxes_data_tamano') then
    alter table public."boxes" add constraint "boxes_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."boxes" enable row level security;
grant all on table public."boxes" to service_role;
create or replace trigger "boxes_al_actualizar" before update on public."boxes"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."patientNotes"') is null then
    create table public."patientNotes" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "patientNotes_pkey" primary key (clinic_id, id),
  constraint "patientNotes_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."patientNotes" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."patientNotes"'::regclass and conname = 'patientNotes_data_tamano') then
    alter table public."patientNotes" add constraint "patientNotes_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."patientNotes" enable row level security;
grant all on table public."patientNotes" to service_role;
create or replace trigger "patientNotes_al_actualizar" before update on public."patientNotes"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."fiscalDocs"') is null then
    create table public."fiscalDocs" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "fiscalDocs_pkey" primary key (clinic_id, id),
  constraint "fiscalDocs_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."fiscalDocs" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."fiscalDocs"'::regclass and conname = 'fiscalDocs_data_tamano') then
    alter table public."fiscalDocs" add constraint "fiscalDocs_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."fiscalDocs" enable row level security;
grant all on table public."fiscalDocs" to service_role;
create or replace trigger "fiscalDocs_al_actualizar" before update on public."fiscalDocs"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."cashSessions"') is null then
    create table public."cashSessions" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "cashSessions_pkey" primary key (clinic_id, id),
  constraint "cashSessions_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."cashSessions" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."cashSessions"'::regclass and conname = 'cashSessions_data_tamano') then
    alter table public."cashSessions" add constraint "cashSessions_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."cashSessions" enable row level security;
grant all on table public."cashSessions" to service_role;
create or replace trigger "cashSessions_al_actualizar" before update on public."cashSessions"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."sterilizationCycles"') is null then
    create table public."sterilizationCycles" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "sterilizationCycles_pkey" primary key (clinic_id, id),
  constraint "sterilizationCycles_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."sterilizationCycles" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."sterilizationCycles"'::regclass and conname = 'sterilizationCycles_data_tamano') then
    alter table public."sterilizationCycles" add constraint "sterilizationCycles_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."sterilizationCycles" enable row level security;
grant all on table public."sterilizationCycles" to service_role;
create or replace trigger "sterilizationCycles_al_actualizar" before update on public."sterilizationCycles"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."teamMessages"') is null then
    create table public."teamMessages" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "teamMessages_pkey" primary key (clinic_id, id),
  constraint "teamMessages_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."teamMessages" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."teamMessages"'::regclass and conname = 'teamMessages_data_tamano') then
    alter table public."teamMessages" add constraint "teamMessages_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."teamMessages" enable row level security;
grant all on table public."teamMessages" to service_role;
create or replace trigger "teamMessages_al_actualizar" before update on public."teamMessages"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."surveys"') is null then
    create table public."surveys" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "surveys_pkey" primary key (clinic_id, id),
  constraint "surveys_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."surveys" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."surveys"'::regclass and conname = 'surveys_data_tamano') then
    alter table public."surveys" add constraint "surveys_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."surveys" enable row level security;
grant all on table public."surveys" to service_role;
create or replace trigger "surveys_al_actualizar" before update on public."surveys"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."surveyResponses"') is null then
    create table public."surveyResponses" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "surveyResponses_pkey" primary key (clinic_id, id),
  constraint "surveyResponses_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."surveyResponses" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."surveyResponses"'::regclass and conname = 'surveyResponses_data_tamano') then
    alter table public."surveyResponses" add constraint "surveyResponses_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."surveyResponses" enable row level security;
grant all on table public."surveyResponses" to service_role;
create or replace trigger "surveyResponses_al_actualizar" before update on public."surveyResponses"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."mgmtTasks"') is null then
    create table public."mgmtTasks" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "mgmtTasks_pkey" primary key (clinic_id, id),
  constraint "mgmtTasks_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."mgmtTasks" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."mgmtTasks"'::regclass and conname = 'mgmtTasks_data_tamano') then
    alter table public."mgmtTasks" add constraint "mgmtTasks_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."mgmtTasks" enable row level security;
grant all on table public."mgmtTasks" to service_role;
create or replace trigger "mgmtTasks_al_actualizar" before update on public."mgmtTasks"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."environmentalLogs"') is null then
    create table public."environmentalLogs" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "environmentalLogs_pkey" primary key (clinic_id, id),
  constraint "environmentalLogs_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."environmentalLogs" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."environmentalLogs"'::regclass and conname = 'environmentalLogs_data_tamano') then
    alter table public."environmentalLogs" add constraint "environmentalLogs_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."environmentalLogs" enable row level security;
grant all on table public."environmentalLogs" to service_role;
create or replace trigger "environmentalLogs_al_actualizar" before update on public."environmentalLogs"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."eduVideos"') is null then
    create table public."eduVideos" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "eduVideos_pkey" primary key (clinic_id, id),
  constraint "eduVideos_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."eduVideos" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."eduVideos"'::regclass and conname = 'eduVideos_data_tamano') then
    alter table public."eduVideos" add constraint "eduVideos_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."eduVideos" enable row level security;
grant all on table public."eduVideos" to service_role;
create or replace trigger "eduVideos_al_actualizar" before update on public."eduVideos"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."branches"') is null then
    create table public."branches" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "branches_pkey" primary key (clinic_id, id),
  constraint "branches_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."branches" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."branches"'::regclass and conname = 'branches_data_tamano') then
    alter table public."branches" add constraint "branches_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."branches" enable row level security;
grant all on table public."branches" to service_role;
create or replace trigger "branches_al_actualizar" before update on public."branches"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."directMessages"') is null then
    create table public."directMessages" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "directMessages_pkey" primary key (clinic_id, id),
  constraint "directMessages_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."directMessages" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."directMessages"'::regclass and conname = 'directMessages_data_tamano') then
    alter table public."directMessages" add constraint "directMessages_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."directMessages" enable row level security;
grant all on table public."directMessages" to service_role;
create or replace trigger "directMessages_al_actualizar" before update on public."directMessages"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."clinicalDocs"') is null then
    create table public."clinicalDocs" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "clinicalDocs_pkey" primary key (clinic_id, id),
  constraint "clinicalDocs_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."clinicalDocs" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."clinicalDocs"'::regclass and conname = 'clinicalDocs_data_tamano') then
    alter table public."clinicalDocs" add constraint "clinicalDocs_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."clinicalDocs" enable row level security;
grant all on table public."clinicalDocs" to service_role;
create or replace trigger "clinicalDocs_al_actualizar" before update on public."clinicalDocs"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."routineChecks"') is null then
    create table public."routineChecks" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "routineChecks_pkey" primary key (clinic_id, id),
  constraint "routineChecks_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."routineChecks" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."routineChecks"'::regclass and conname = 'routineChecks_data_tamano') then
    alter table public."routineChecks" add constraint "routineChecks_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."routineChecks" enable row level security;
grant all on table public."routineChecks" to service_role;
create or replace trigger "routineChecks_al_actualizar" before update on public."routineChecks"
  for each row execute function interno.al_actualizar_clinica();

do $$
begin
  if to_regclass('public."agendaBlocks"') is null then
    create table public."agendaBlocks" (
  clinic_id  text        not null,
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "agendaBlocks_pkey" primary key (clinic_id, id),
  constraint "agendaBlocks_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."agendaBlocks" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."agendaBlocks"'::regclass and conname = 'agendaBlocks_data_tamano') then
    alter table public."agendaBlocks" add constraint "agendaBlocks_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."agendaBlocks" enable row level security;
grant all on table public."agendaBlocks" to service_role;
create or replace trigger "agendaBlocks_al_actualizar" before update on public."agendaBlocks"
  for each row execute function interno.al_actualizar_clinica();

-- ── Colecciones de primer nivel (5) ──────────────────────────────────────────────
do $$
begin
  if to_regclass('public."clinics"') is null then
    create table public."clinics" (
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "clinics_pkey" primary key (id),
  constraint "clinics_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."clinics" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."clinics"'::regclass and conname = 'clinics_data_tamano') then
    alter table public."clinics" add constraint "clinics_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."clinics" enable row level security;
grant all on table public."clinics" to service_role;
create or replace trigger "clinics_al_actualizar" before update on public."clinics"
  for each row execute function interno.al_actualizar_raiz();

do $$
begin
  if to_regclass('public."subscriptions"') is null then
    create table public."subscriptions" (
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "subscriptions_pkey" primary key (id),
  constraint "subscriptions_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."subscriptions" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."subscriptions"'::regclass and conname = 'subscriptions_data_tamano') then
    alter table public."subscriptions" add constraint "subscriptions_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."subscriptions" enable row level security;
grant all on table public."subscriptions" to service_role;
create or replace trigger "subscriptions_al_actualizar" before update on public."subscriptions"
  for each row execute function interno.al_actualizar_raiz();

do $$
begin
  if to_regclass('public."webhookEvents"') is null then
    create table public."webhookEvents" (
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "webhookEvents_pkey" primary key (id),
  constraint "webhookEvents_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."webhookEvents" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."webhookEvents"'::regclass and conname = 'webhookEvents_data_tamano') then
    alter table public."webhookEvents" add constraint "webhookEvents_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."webhookEvents" enable row level security;
grant all on table public."webhookEvents" to service_role;
create or replace trigger "webhookEvents_al_actualizar" before update on public."webhookEvents"
  for each row execute function interno.al_actualizar_raiz();

do $$
begin
  if to_regclass('public."leads"') is null then
    create table public."leads" (
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "leads_pkey" primary key (id),
  constraint "leads_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."leads" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."leads"'::regclass and conname = 'leads_data_tamano') then
    alter table public."leads" add constraint "leads_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."leads" enable row level security;
grant all on table public."leads" to service_role;
create or replace trigger "leads_al_actualizar" before update on public."leads"
  for each row execute function interno.al_actualizar_raiz();

do $$
begin
  if to_regclass('public."checkoutTokens"') is null then
    create table public."checkoutTokens" (
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  constraint "checkoutTokens_pkey" primary key (id),
  constraint "checkoutTokens_data_objeto" check (jsonb_typeof(data) = 'object')
    );
    revoke all on table public."checkoutTokens" from anon, authenticated;
  end if;
end $$;
-- Un documento no pasa de 2 MiB (Firestore: 1 MiB; las imágenes en base64 se achican en el cliente): la demo la escribe cualquiera con una
-- sesión anónima, y sin tope un solo pedido podría llenar el disco.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public."checkoutTokens"'::regclass and conname = 'checkoutTokens_data_tamano') then
    alter table public."checkoutTokens" add constraint "checkoutTokens_data_tamano" check (pg_column_size(data) <= 2097152);
  end if;
end $$;
alter table public."checkoutTokens" enable row level security;
grant all on table public."checkoutTokens" to service_role;
create or replace trigger "checkoutTokens_al_actualizar" before update on public."checkoutTokens"
  for each row execute function interno.al_actualizar_raiz();

-- ── Índices ─────────────────────────────────────────────────────────────────────────────
create unique index if not exists "users_authuid_unico" on public."users" ((data ->> 'authUid')) where clinic_id <> 'cl_demo' and data ? 'authUid';
create index if not exists "users_clinic_authuid" on public."users" (clinic_id, (data ->> 'authUid'));
create index if not exists "patients_document" on public."patients" (clinic_id, (data ->> 'document')) where data ? 'document';
create index if not exists "appointments_start" on public."appointments" (clinic_id, (data ->> 'start'));
create index if not exists "appointments_confirmtoken" on public."appointments" (clinic_id, (data ->> 'confirmToken')) where data ? 'confirmToken';
create index if not exists "outbox_status" on public."outbox" (clinic_id, (data ->> 'status'));
create index if not exists "signatures_token" on public."signatures" (clinic_id, (data ->> 'token')) where data ? 'token';
create index if not exists "directmessages_participants" on public."directMessages" using gin ((data -> 'participants'));
create index if not exists "agendablocks_start" on public."agendaBlocks" (clinic_id, (data ->> 'start'));

-- ── Tiempo real (spec §7) ───────────────────────────────────────────────────────────────
-- Las tablas que el navegador escucha entran en la publicación de Realtime con replica identity full (para que los delete lleguen con
-- sus datos). Realtime aplica la RLS de cada suscriptor.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter table public."subscriptions" replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions') then
    alter publication supabase_realtime add table public."subscriptions";
  end if;
end $$;
alter table public."clinics" replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clinics') then
    alter publication supabase_realtime add table public."clinics";
  end if;
end $$;
alter table public."outbox" replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'outbox') then
    alter publication supabase_realtime add table public."outbox";
  end if;
end $$;
alter table public."directMessages" replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'directMessages') then
    alter publication supabase_realtime add table public."directMessages";
  end if;
end $$;
alter table public."teamMessages" replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teamMessages') then
    alter publication supabase_realtime add table public."teamMessages";
  end if;
end $$;
