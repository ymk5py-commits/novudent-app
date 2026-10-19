#!/usr/bin/env bash
# Prueba de RESTAURACIÓN de un respaldo en una base descartable (la prueba mensual: un respaldo que no se restauró no cuenta).
# Uso: ./restaurar-prueba.sh <archivo.dump.enc>      (usa RESPALDO_CLAVE de ~/.respaldo-novudent.env)
# Levanta supabase/postgres (la MISMA versión del compose), restaura, cuenta lo importante y lo destruye todo. No toca la base real.
set -euo pipefail
ARCHIVO="${1:?uso: $0 <archivo.dump.enc>}"
[ -r "$ARCHIVO" ] || { echo "No puedo leer $ARCHIVO" >&2; exit 2; }
CONFIG="${RESPALDO_CONFIG:-$HOME/.respaldo-novudent.env}"
set -a; . "$CONFIG"; set +a
: "${RESPALDO_CLAVE:?falta RESPALDO_CLAVE}"
IMAGEN="$(grep -m1 'image: supabase/postgres:' "$(dirname "$0")/docker-compose.yml" | awk '{print $2}')"
NOMBRE="nvsb-restore-$$"
PASS="$(openssl rand -hex 16)"
limpiar() { docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; }
trap limpiar EXIT
echo "== Levantando $IMAGEN descartable ($NOMBRE) =="
docker run -d --name "$NOMBRE" --memory 2g -e POSTGRES_PASSWORD="$PASS" "$IMAGEN" >/dev/null
for _ in $(seq 1 60); do docker exec "$NOMBRE" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 5
# Realtime crea su rol supabase_realtime_admin al arrancar (no viene en la imagen): sin él, los GRANT del volcado fallan. Acá lo creamos a mano;
# en una recuperación real alcanza con levantar el stack (Realtime lo crea solo) antes de restaurar.
docker exec "$NOMBRE" psql -U supabase_admin -d postgres -qc "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_realtime_admin') then create role supabase_realtime_admin nologin; end if; end \$\$;"
echo "== Restaurando =="
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:RESPALDO_CLAVE < "$ARCHIVO" \
  | docker exec -i "$NOMBRE" pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner 2>"/tmp/$NOMBRE.err"; then
  cat "/tmp/$NOMBRE.err" >&2
  rm -f "/tmp/$NOMBRE.err"
  echo "La restauración falló: el respaldo no está validado." >&2
  exit 1
fi
ERRORES="$(grep -c -i -E 'error' "/tmp/$NOMBRE.err" || true)"
q() { docker exec "$NOMBRE" psql -U supabase_admin -d postgres -At -c "$1"; }
echo "tablas en public:        $(q "select count(*) from information_schema.tables where table_schema='public'")"
echo "usuarios en auth.users:  $(q "select count(*) from auth.users")"
echo "filas por tabla de public (mayores a 0):"
q "select relname || ': ' || n_live_tup from pg_stat_user_tables where schemaname='public' and n_live_tup > 0 order by 1" | sed 's/^/   /'
echo "mensajes de error del restore: $ERRORES (los de objetos propios del sistema, p. ej. extensiones o roles que ya existen, son normales; el resto hay que mirarlo)"
if [ "$ERRORES" -gt 0 ]; then
  grep -i -E 'error' "/tmp/$NOMBRE.err" | sort | uniq -c | sort -rn | head -8 | cut -c1-220 | sed 's/^/   /'
fi

rm -f "/tmp/$NOMBRE.err"
echo "Restauración de prueba terminada; el contenedor se borra al salir."
