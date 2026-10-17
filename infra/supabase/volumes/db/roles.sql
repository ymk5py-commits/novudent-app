-- Contraseña de los roles que usan los servicios que SÍ corren (GoTrue y PostgREST); la de supabase_admin la fija la propia imagen.
-- La versión oficial también toca pgbouncer, supabase_functions_admin y supabase_storage_admin: acá no se usan (y supabase_functions_admin
-- ni siquiera existe sin webhooks.sql, así que la inicialización fallaba).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
