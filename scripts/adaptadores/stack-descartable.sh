#!/usr/bin/env bash
# Stack de Supabase DESCARTABLE para probar los adaptadores de la fase C (cliente, servidor, e2e).
# La Mac no tiene Docker: los contenedores corren en el servidor (ssh gmktec), con nombres nvsb-test-…, ligados a 127.0.0.1 y con límite de
# memoria. Desde la Mac se entra con un túnel `ssh -N -L`. Los secretos se generan acá, viven en el servidor (~/fase-c/<proyecto>/.env,
# modo 600) y en un archivo local FUERA del repo (modo 600); nunca se imprimen.
#
#   scripts/adaptadores/stack-descartable.sh up [dir-con-sql]   levanta (y aplica los *.sql del directorio, en orden), abre el túnel
#   scripts/adaptadores/stack-descartable.sh sql archivo.sql    corre un SQL contra la base del stack (como supabase_admin)
#   scripts/adaptadores/stack-descartable.sh down               borra contenedores, volúmenes y archivos del servidor y cierra el túnel
#   scripts/adaptadores/stack-descartable.sh env                ruta del archivo de variables (para `source`)
#
# Variables: PUERTO (18200), PROYECTO (nvsb-test-c), SERVIDOR (gmktec).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
PUERTO="${PUERTO:-18200}"
PROYECTO="${PROYECTO:-nvsb-test-c}"
SERVIDOR="${SERVIDOR:-gmktec}"
REMOTO="fase-c/$PROYECTO"
ENV_LOCAL="${ENV_LOCAL:-$HOME/.cache/novudent-fase-c/$PROYECTO.env}"
PID_TUNEL="$(dirname "$ENV_LOCAL")/$PROYECTO.tunel.pid"

remoto() { ssh -o ConnectTimeout=15 "$SERVIDOR" "$@"; }
dcr() { remoto "cd ~/$REMOTO && docker compose -p $PROYECTO -f docker-compose.yml -f override.yml --env-file .env $*"; }

abrir_tunel() {
  mkdir -p "$(dirname "$ENV_LOCAL")"
  cerrar_tunel
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L "127.0.0.1:$PUERTO:127.0.0.1:$PUERTO" "$SERVIDOR"
  pgrep -f "ssh -f -N .*127.0.0.1:$PUERTO:127.0.0.1:$PUERTO" | head -n 1 > "$PID_TUNEL" || true
}
cerrar_tunel() {
  pkill -f "ssh -f -N .*127.0.0.1:$PUERTO:127.0.0.1:$PUERTO" >/dev/null 2>&1 || true
  rm -f "$PID_TUNEL"
}

cmd_up() {
  local dir_sql="${1:-}"
  remoto "mkdir -p ~/$REMOTO && chmod 700 ~/$REMOTO"
  tar --no-xattrs -C "$RAIZ/infra/supabase" -cf - docker-compose.yml | remoto "tar -x -C ~/$REMOTO"
  # Límites de memoria y puerto solo en 127.0.0.1 (el compose real no publica nada).
  remoto "cat > ~/$REMOTO/override.yml" <<YML
services:
  db:       { mem_limit: 1g }
  auth:     { mem_limit: 256m }
  rest:     { mem_limit: 256m }
  realtime: { mem_limit: 768m }
  kong:
    mem_limit: 512m
    ports:
      - "127.0.0.1:$PUERTO:8000"
YML
  # Secretos y JWT descartables (HS256) generados EN EL SERVIDOR, con los nombres de las variables mágicas de Coolify.
  remoto "cd ~/$REMOTO && umask 077 && python3 - $PUERTO ${E2E_SUPABASE_PORT:-3110}" <<'PY'
import base64, hashlib, hmac, json, secrets, sys, time
puerto = sys.argv[1]
puerto_app = sys.argv[2]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
jwt_secret = secrets.token_hex(16)
def jwt(rol):
    cab = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    ahora = int(time.time())
    carga = b64(json.dumps({"role": rol, "iss": "supabase", "iat": ahora, "exp": ahora + 3600 * 24 * 14}, separators=(",", ":")).encode())
    firma = b64(hmac.new(jwt_secret.encode(), f"{cab}.{carga}".encode(), hashlib.sha256).digest())
    return f"{cab}.{carga}.{firma}"
lineas = {
    "SERVICE_PASSWORD_POSTGRES": secrets.token_hex(16),
    "SERVICE_PASSWORD_JWT": jwt_secret,
    "SERVICE_PASSWORD_64_REALTIME": secrets.token_hex(32),
    "SERVICE_SUPABASEANON_KEY": jwt("anon"),
    "SERVICE_SUPABASESERVICE_KEY": jwt("service_role"),
    "API_EXTERNAL_URL": f"http://127.0.0.1:{puerto}",
    "SITE_URL": f"http://localhost:{puerto_app}",
    "ADDITIONAL_REDIRECT_URLS": f"http://localhost:{puerto_app}/**",
}
open(".env", "w").write("".join(f"{k}={v}\n" for k, v in lineas.items()))
PY
  echo "== Levantando $PROYECTO (puerto $PUERTO) =="
  dcr "up -d --wait --wait-timeout 300" 2>&1 | tail -n 8
  # Variables para las pruebas: se leen del servidor y se guardan local (modo 600, fuera del repo).
  mkdir -p "$(dirname "$ENV_LOCAL")"
  ( umask 077
    remoto "cd ~/$REMOTO && cat .env" | awk -v p="$PUERTO" '
      { v = substr($0, index($0, "=") + 1) }
      /^SERVICE_SUPABASEANON_KEY=/ { anon = v }
      /^SERVICE_SUPABASESERVICE_KEY=/ { srv = v }
      /^SERVICE_PASSWORD_JWT=/ { jwt = v }
      END {
        print "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:" p
        print "NEXT_PUBLIC_SUPABASE_ANON_KEY=" anon
        print "SUPABASE_SERVICE_ROLE_KEY=" srv
        print "SUPABASE_JWT_SECRET=" jwt
      }' > "$ENV_LOCAL" )
  chmod 600 "$ENV_LOCAL"
  if [ -n "$dir_sql" ]; then
    for f in $(ls "$dir_sql"/*.sql | sort); do echo "== SQL: $(basename "$f") =="; cmd_sql "$f"; done
  fi
  abrir_tunel
  echo "Listo. Variables en $ENV_LOCAL (no las pegues en ningún lado). Túnel en 127.0.0.1:$PUERTO."
}

cmd_sql() { remoto "cd ~/$REMOTO && docker compose -p $PROYECTO -f docker-compose.yml -f override.yml --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres" < "$1"; }

cmd_down() {
  cerrar_tunel
  remoto "cd ~/$REMOTO 2>/dev/null && docker compose -p $PROYECTO -f docker-compose.yml -f override.yml --env-file .env down -v --remove-orphans; cd ~ && rm -rf ~/$REMOTO" 2>&1 | tail -n 5 || true
  rm -f "$ENV_LOCAL"
  echo "Borrado: $PROYECTO."
}

case "${1:-}" in
  up) shift; cmd_up "$@" ;;
  sql) cmd_sql "$2" ;;
  down) cmd_down ;;
  env) echo "$ENV_LOCAL" ;;
  tunel) abrir_tunel ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
