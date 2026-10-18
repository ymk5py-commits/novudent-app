#!/usr/bin/env bash
# Aplica las migraciones de supabase/migrations/ a un Postgres de Supabase que corre en un contenedor Docker (el `db-…` de Coolify, o uno de prueba).
#
#   scripts/supabase/aplicar-esquema.sh CONTENEDOR [--ssh HOST] [--carpeta DIR] [--simular]
#
#   CONTENEDOR   nombre del contenedor de la base, o un prefijo (p. ej. `db-iobkqzz5hp73kwligsmfin9o`): Coolify le agrega una marca de
#                tiempo al nombre en cada despliegue, así que alcanza con el prefijo si es único.
#   --ssh HOST   corre `docker` por SSH en ese servidor (p. ej. `--ssh gmktec` desde la Mac, que no tiene Docker). Sin esto usa el Docker local.
#   --carpeta    otra carpeta de migraciones (por defecto supabase/migrations de este repositorio).
#   --simular    no aplica nada: muestra a qué contenedor y qué archivos.
#
# Las migraciones son idempotentes: se pueden aplicar otra vez sin romper nada (tablas `if not exists`, funciones `create or replace`, políticas que se
# borran y se vuelven a crear en la misma transacción). Cada archivo corre en UNA transacción y como `postgres` (el dueño de los objetos en Supabase);
# si falla, ese archivo no deja nada a medias y el script se detiene.
#
# Cuándo correrlo: al desplegar el stack de Supabase por primera vez, y cada vez que cambie algo de supabase/migrations/. NO corre solo.
# NUNCA correrlo contra la base de producción sin haber pasado antes scripts/supabase/probar-rls.sh (las pruebas en un Postgres descartable).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
CARPETA="$RAIZ/supabase/migrations"
SSH_HOST=""
SIMULAR=0
CONTENEDOR=""

uso() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
while [ $# -gt 0 ]; do
  case "$1" in
    --ssh) SSH_HOST="${2:?falta el servidor después de --ssh}"; shift 2;;
    --carpeta) CARPETA="${2:?falta la carpeta después de --carpeta}"; shift 2;;
    --simular) SIMULAR=1; shift;;
    -h|--help) uso 0;;
    -*) echo "Opción desconocida: $1" >&2; uso 1;;
    *) [ -z "$CONTENEDOR" ] && CONTENEDOR="$1" || { echo "Sobra el argumento: $1" >&2; uso 1; }; shift;;
  esac
done
[ -n "$CONTENEDOR" ] || { echo "Falta el contenedor de la base." >&2; uso 1; }

# Por SSH el servidor vuelve a interpretar la línea: se escapa cada argumento (el SQL lleva comillas y paréntesis).
docker_() {
  if [ -n "$SSH_HOST" ]; then ssh -o BatchMode=yes "$SSH_HOST" "$(printf '%q ' docker "$@")"; else docker "$@"; fi
}

# Un nombre exacto, o un prefijo que dé un único contenedor en marcha.
candidatos="$(docker_ ps --format '{{.Names}}' | grep -E "^${CONTENEDOR}" || true)"
n="$(printf '%s' "$candidatos" | grep -c . || true)"
if [ "$n" -eq 0 ]; then echo "No hay ningún contenedor en marcha que empiece con «$CONTENEDOR»." >&2; exit 1; fi
if [ "$n" -gt 1 ]; then
  exacto="$(printf '%s\n' "$candidatos" | grep -Fx "$CONTENEDOR" || true)"
  [ -n "$exacto" ] || { echo "«$CONTENEDOR» coincide con varios contenedores; usá el nombre completo:" >&2; printf '  %s\n' $candidatos >&2; exit 1; }
  candidatos="$exacto"
fi
DB="$candidatos"

archivos=("$CARPETA"/*.sql)
[ -e "${archivos[0]}" ] || { echo "No hay migraciones en $CARPETA" >&2; exit 1; }

psql_() { docker_ exec -i -e PGOPTIONS="-c client_min_messages=warning" "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q "$@"; }

echo "Contenedor: $DB${SSH_HOST:+  (por SSH en $SSH_HOST)}"
echo "Migraciones: ${#archivos[@]} en ${CARPETA#"$RAIZ"/}"
psql_ -At -c "select 'Postgres ' || current_setting('server_version') || ' · base ' || current_database() || ' · ' || pg_size_pretty(pg_database_size(current_database()))"
if [ "$SIMULAR" -eq 1 ]; then
  printf '  %s\n' "${archivos[@]##*/}"
  echo "(simulación: no se aplicó nada)"
  exit 0
fi

for f in "${archivos[@]}"; do
  printf '  aplicando %s … ' "${f##*/}"
  # -1: todo el archivo en una transacción. El script se pasa por stdin: no hace falta copiarlo al contenedor.
  psql_ -1 < "$f" > /dev/null
  echo "listo"
done

# Comprobación: una tabla por colección del manifiesto, todas con RLS.
esperadas="$(node -e '
  const m = require(process.argv[1]);
  const sin = new Set(["directory", ...(m.noSeMigra || [])]);
  console.log(m.porClinica.length + m.raiz.filter((t) => !sin.has(t)).length);
' "$RAIZ/lib/backend/colecciones.json")"
tablas="$(psql_ -At -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity")"
echo "Tablas de Novudent con RLS: $tablas (esperadas: $esperadas)"
[ "$tablas" = "$esperadas" ] || { echo "ATENCIÓN: no coincide. Revisá la base." >&2; exit 1; }
echo "Esquema aplicado."
