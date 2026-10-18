#!/usr/bin/env bash
# Prueba de punta a punta del esquema en el STACK COMPLETO de Supabase (Postgres + GoTrue + PostgREST + Realtime + Kong), descartable.
#
#   scripts/supabase/probar-stack.sh [--servidor gmktec] [--puerto N] [--conservar]
#
# Lo que probar-rls.sh no puede ver: que PostgREST pase el JWT a la base como esperan las políticas (request.jwt.claims), que las rpc se
# llamen con los nombres de parámetros del contrato, que GoTrue emita lo que las reglas esperan (sesión anónima de la demo, email y
# contraseña) y que Realtime respete la RLS de cada suscriptor. Levanta infra/supabase/docker-compose.yml (las mismas imágenes fijadas
# que Coolify) con secretos descartables en el servidor, ligado a 127.0.0.1 y con límites de memoria; le aplica las migraciones con
# aplicar-esquema.sh; abre un túnel SSH hasta Kong y corre test/rls/stack.test.mjs. Al terminar (también con Ctrl-C) borra todo.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
SERVIDOR="gmktec"
PUERTO=""
CONSERVAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --servidor) SERVIDOR="${2:?falta el servidor}"; shift 2;;
    --puerto) PUERTO="${2:?falta el puerto}"; shift 2;;
    --conservar) CONSERVAR=1; shift;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "Opción desconocida: $1" >&2; exit 1;;
  esac
done

PROYECTO="nvsb-test-esquema-stack-$$"
CARPETA="build-tests/$PROYECTO"          # relativa al HOME del servidor
[ -n "$PUERTO" ] || PUERTO=$((16000 + RANDOM % 400))
TUNEL_PID=""
ssh_() { ssh -o BatchMode=yes -o ConnectTimeout=15 "$SERVIDOR" "$@"; }
dc() { ssh_ "cd $CARPETA && docker compose -p $PROYECTO -f docker-compose.yml -f override.yml --env-file .env $*"; }

limpiar() {
  local codigo=$?
  [ -n "$TUNEL_PID" ] && kill "$TUNEL_PID" 2>/dev/null || true
  if [ "$CONSERVAR" -eq 1 ]; then
    echo "Stack conservado: proyecto $PROYECTO en ~/$CARPETA de $SERVIDOR (puerto $PUERTO). Borralo con: ssh $SERVIDOR 'cd $CARPETA && docker compose -p $PROYECTO -f docker-compose.yml -f override.yml --env-file .env down -v && cd .. && rm -rf $PROYECTO'" >&2
  else
    dc "down -v --remove-orphans" >/dev/null 2>&1 || true
    ssh_ "rm -rf $CARPETA" >/dev/null 2>&1 || true
  fi
  exit "$codigo"
}
trap limpiar EXIT INT TERM

echo "== Preparando $PROYECTO en $SERVIDOR (Kong en 127.0.0.1:$PUERTO) =="
ssh_ "mkdir -p $CARPETA && chmod 700 $CARPETA"
tar --no-xattrs -C "$RAIZ/infra/supabase" -cf - docker-compose.yml | ssh_ "tar -x -C $CARPETA"
# Límites de memoria y el único puerto publicado (Kong, en 127.0.0.1).
ssh_ "cat > $CARPETA/override.yml" <<EOF
services:
  db:
    mem_limit: 1g
  auth:
    mem_limit: 256m
  rest:
    mem_limit: 256m
  realtime:
    mem_limit: 768m
  kong:
    mem_limit: 512m
    ports:
      - "127.0.0.1:$PUERTO:8000"
EOF
# Secretos y JWT descartables (HS256), con los nombres de las variables mágicas de Coolify; se generan EN el servidor.
ssh_ "python3 - $CARPETA/.env $PUERTO" <<'PY'
import base64, hashlib, hmac, json, secrets, sys, time
destino, puerto = sys.argv[1], sys.argv[2]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
jwt_secret = secrets.token_hex(16)
def jwt(rol):
    cab = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    ahora = int(time.time())
    carga = b64(json.dumps({"role": rol, "iss": "supabase", "iat": ahora, "exp": ahora + 3600 * 6}, separators=(",", ":")).encode())
    firma = b64(hmac.new(jwt_secret.encode(), f"{cab}.{carga}".encode(), hashlib.sha256).digest())
    return f"{cab}.{carga}.{firma}"
lineas = {
    "SERVICE_PASSWORD_POSTGRES": secrets.token_hex(16),
    "SERVICE_PASSWORD_JWT": jwt_secret,
    "SERVICE_PASSWORD_64_REALTIME": secrets.token_hex(32),
    "SERVICE_SUPABASEANON_KEY": jwt("anon"),
    "SERVICE_SUPABASESERVICE_KEY": jwt("service_role"),
    "API_EXTERNAL_URL": f"http://127.0.0.1:{puerto}",
    "SITE_URL": "http://127.0.0.1:3000",
}
open(destino, "w").write("".join(f"{k}={v}\n" for k, v in lineas.items()))
PY
ssh_ "chmod 600 $CARPETA/.env"

echo "== Levantando el stack y esperando que todo esté sano =="
dc "up -d --wait --wait-timeout 300" 2>&1 | tail -n 8

echo "== Aplicando las migraciones =="
"$AQUI/aplicar-esquema.sh" "$PROYECTO-db-1" --ssh "$SERVIDOR"
# PostgREST relee el esquema cuando se lo avisan (el disparador de la imagen lo hace en cada DDL; por las dudas, también acá).
ssh_ "docker exec $PROYECTO-db-1 psql -U postgres -d postgres -X -q -c \"notify pgrst, 'reload schema'\"" >/dev/null
sleep 2

leer() { ssh_ "grep '^$1=' $CARPETA/.env | cut -d= -f2-"; }
export STACK_ANON="$(leer SERVICE_SUPABASEANON_KEY)"
export STACK_SERVICE="$(leer SERVICE_SUPABASESERVICE_KEY)"
export STACK_URL="http://127.0.0.1:$PUERTO"

ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -L "$PUERTO:127.0.0.1:$PUERTO" "$SERVIDOR" &
TUNEL_PID=$!
for _ in $(seq 1 20); do (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null && break; sleep 0.5; done

echo "== Pruebas de punta a punta =="
cd "$RAIZ/test/rls"
node --test --test-reporter=spec ./stack.test.mjs
