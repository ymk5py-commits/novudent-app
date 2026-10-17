#!/usr/bin/env bash
# Corre las pruebas de test/rls/ contra un Postgres de Supabase DESCARTABLE.
#
#   scripts/supabase/probar-rls.sh [--servidor gmktec] [--puerto N] [--conservar] [-- ARGUMENTOS PARA node --test]
#
# La Mac no tiene Docker, así que el Postgres (la misma imagen que usa el stack: supabase/postgres) se levanta EN EL SERVIDOR con
# `ssh`, ligado a 127.0.0.1, con límite de memoria y de CPU, y con una contraseña que se genera acá y se pasa por la entrada
# estándar (no queda en la línea de comandos de nadie). Un túnel `ssh -L` lo acerca a la Mac. Al terminar (también con Ctrl-C o si algo
# falla) se cierra el túnel y se borra el contenedor con sus datos.
#
# Si ya estás en el servidor (con Docker), pasá `--local`: no usa SSH ni túnel.
#
# No toca ningún otro contenedor: solo crea y borra `nvsb-test-esquema-*`. Lo que sigue a `--` va a `node --test` (por ejemplo un archivo
# o `--test-name-pattern`). Por defecto corre todo test/rls/*.test.mjs, de a un archivo por vez.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
IMAGEN="supabase/postgres:17.6.1.136"   # la misma etiqueta que infra/supabase/docker-compose.yml
SERVIDOR="gmktec"
PUERTO=""
CONSERVAR=0
LOCAL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --servidor) SERVIDOR="${2:?falta el servidor}"; shift 2;;
    --puerto) PUERTO="${2:?falta el puerto}"; shift 2;;
    --conservar) CONSERVAR=1; shift;;
    --local) LOCAL=1; shift;;
    --) shift; break;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "Opción desconocida: $1" >&2; exit 1;;
  esac
done

NOMBRE="nvsb-test-esquema-$$"
CLAVE="$(openssl rand -hex 16)"
TUNEL_PID=""

remoto() { if [ "$LOCAL" -eq 1 ]; then bash -c "$*"; else ssh -o BatchMode=yes -o ConnectTimeout=15 "$SERVIDOR" "$*"; fi; }

# Un puerto libre en el servidor (donde se publica) y en esta máquina (donde llega el túnel).
puerto_ocupado() {
  if (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; then return 0; fi
  if [ "$LOCAL" -eq 0 ] && remoto "ss -ltn | awk '{print \$4}' | grep -q ':$1\$'" 2>/dev/null; then return 0; fi
  return 1
}
if [ -z "$PUERTO" ]; then
  for _ in $(seq 1 30); do
    PUERTO=$((15500 + RANDOM % 400))
    puerto_ocupado "$PUERTO" || break
    PUERTO=""
  done
  [ -n "$PUERTO" ] || { echo "No encontré un puerto libre." >&2; exit 1; }
fi

limpiar() {
  local codigo=$?
  [ -n "$TUNEL_PID" ] && kill "$TUNEL_PID" 2>/dev/null || true
  if [ "$CONSERVAR" -eq 1 ]; then
    echo "Contenedor conservado: $NOMBRE (puerto $PUERTO en $SERVIDOR). Borralo con: ssh $SERVIDOR docker rm -fv $NOMBRE" >&2
  else
    remoto "docker rm -fv $NOMBRE >/dev/null 2>&1 || true" || true
  fi
  exit "$codigo"
}
trap limpiar EXIT INT TERM

DONDE="$SERVIDOR"; [ "$LOCAL" -eq 1 ] && DONDE="este equipo"
echo "== Levantando $IMAGEN como $NOMBRE (127.0.0.1:$PUERTO en $DONDE) =="
if [ "$LOCAL" -eq 1 ]; then
  printf 'POSTGRES_PASSWORD=%s\nJWT_EXP=3600\n' "$CLAVE" | docker run -d --name "$NOMBRE" --memory 1g --cpus 2 --label nvsb-test=1 -p "127.0.0.1:$PUERTO:5432" --env-file /dev/stdin "$IMAGEN" > /dev/null
else
  printf 'POSTGRES_PASSWORD=%s\nJWT_EXP=3600\n' "$CLAVE" | ssh -o BatchMode=yes "$SERVIDOR" "docker run -d --name $NOMBRE --memory 1g --cpus 2 --label nvsb-test=1 -p 127.0.0.1:$PUERTO:5432 --env-file /dev/stdin $IMAGEN" > /dev/null
fi

# Listo cuando terminó la inicialización de la imagen (arranca, crea los roles y se reinicia) y los roles de Supabase existen.
listo=0
for _ in $(seq 1 90); do
  if remoto "docker logs $NOMBRE 2>&1 | grep -q 'init process complete'" \
     && [ "$(remoto "docker logs $NOMBRE 2>&1 | grep -c 'ready to accept connections'")" -ge 2 ] \
     && [ "$(remoto "docker exec $NOMBRE psql -U supabase_admin -d postgres -At -c \"select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','postgres')\" 2>/dev/null" || true)" = "4" ]; then
    listo=1; break
  fi
  sleep 2
done
[ "$listo" -eq 1 ] || { echo "El Postgres no llegó a estar listo:" >&2; remoto "docker logs --tail 30 $NOMBRE" >&2 || true; exit 1; }

if [ "$LOCAL" -eq 0 ]; then
  ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -L "$PUERTO:127.0.0.1:$PUERTO" "$SERVIDOR" &
  TUNEL_PID=$!
  for _ in $(seq 1 20); do (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null && break; sleep 0.5; done
fi

export RLS_PG_URL="postgres://supabase_admin:${CLAVE}@127.0.0.1:${PUERTO}/postgres"
cd "$RAIZ/test/rls"
[ -d node_modules ] || npm install --no-audit --no-fund --silent
echo "== Pruebas =="
if [ $# -gt 0 ]; then
  node --test --test-concurrency=1 --test-reporter=spec "$@"
else
  node --test --test-concurrency=1 --test-reporter=spec ./*.test.mjs
fi
