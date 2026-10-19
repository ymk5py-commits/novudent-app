#!/usr/bin/env bash
# Stack DESCARTABLE de Supabase (Postgres + GoTrue + Kong…) para probar el cargador de datos (`cargar-postgres.mjs`) contra una base y un GoTrue de verdad.
# Se corre EN EL SERVIDOR (la Mac no tiene Docker): levanta los mismos servicios que infra/supabase con secretos nuevos que se generan acá, publica SOLO en
# 127.0.0.1 (Kong y Postgres), con límite de memoria, y se destruye con `bajar`. No toca nada más del servidor (proyecto «nvsb-test-cargador»).
#
#   tar --no-xattrs -cf - -C infra/supabase docker-compose.yml -C ../../scripts/migracion stack-de-prueba.sh | ssh gmktec 'mkdir -p ~/build-tests/cargador && tar -x -C ~/build-tests/cargador'
#   ssh gmktec '~/build-tests/cargador/stack-de-prueba.sh subir'      # imprime los puertos; los secretos quedan en ~/build-tests/cargador/acceso.env (600)
#   ssh gmktec '~/build-tests/cargador/stack-de-prueba.sh bajar'      # destruye contenedores, volúmenes y la carpeta
#
# Los secretos nunca se imprimen. `acceso.env` trae NOVUDENT_PRUEBA_DB_URL / _GOTRUE_URL / _SERVICE_KEY apuntando a 127.0.0.1 (para usar con `ssh -N -L`).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
PROYECTO="nvsb-test-cargador"
PUERTO_KONG="${PUERTO_KONG:-18100}"
PUERTO_DB="${PUERTO_DB:-18101}"

dc() { docker compose -p "$PROYECTO" -f "$AQUI/docker-compose.yml" -f "$AQUI/override.yml" --env-file "$AQUI/.env" "$@"; }

case "${1:-}" in
  subir)
    [ -f "$AQUI/docker-compose.yml" ] || { echo "Falta docker-compose.yml al lado de este script." >&2; exit 1; }
    if [ -f "$AQUI/.env" ]; then echo "Ya hay un stack armado en $AQUI: corré «bajar» primero." >&2; exit 1; fi
    umask 077
    printf 'services:\n  db:\n    mem_limit: 1g\n    ports:\n      - "127.0.0.1:%s:5432"\n  auth:\n    mem_limit: 300m\n  rest:\n    mem_limit: 256m\n  realtime:\n    mem_limit: 600m\n  kong:\n    mem_limit: 400m\n    ports:\n      - "127.0.0.1:%s:8000"\n' "$PUERTO_DB" "$PUERTO_KONG" > "$AQUI/override.yml"
    python3 - "$AQUI" "$PUERTO_KONG" "$PUERTO_DB" <<'PY'
import base64, hashlib, hmac, json, secrets, sys, time
carpeta, kong, db = sys.argv[1], sys.argv[2], sys.argv[3]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
jwt_secret = secrets.token_hex(16)
clave_db = secrets.token_hex(16)
def jwt(rol):
    cab = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    ahora = int(time.time())
    carga = b64(json.dumps({"role": rol, "iss": "supabase", "iat": ahora, "exp": ahora + 3600 * 24 * 2}, separators=(",", ":")).encode())
    return f"{cab}.{carga}.{b64(hmac.new(jwt_secret.encode(), f'{cab}.{carga}'.encode(), hashlib.sha256).digest())}"
anon, servicio = jwt("anon"), jwt("service_role")
env = {
    "SERVICE_PASSWORD_POSTGRES": clave_db, "SERVICE_PASSWORD_JWT": jwt_secret, "SERVICE_PASSWORD_64_REALTIME": secrets.token_hex(32),
    "SERVICE_SUPABASEANON_KEY": anon, "SERVICE_SUPABASESERVICE_KEY": servicio,
    "API_EXTERNAL_URL": f"http://127.0.0.1:{kong}", "SITE_URL": "http://127.0.0.1:3000",
}
open(f"{carpeta}/.env", "w").write("".join(f"{k}={v}\n" for k, v in env.items()))
open(f"{carpeta}/acceso.env", "w").write(
    f"NOVUDENT_PRUEBA_DB_URL=postgres://supabase_admin:{clave_db}@127.0.0.1:{db}/postgres\n"
    f"NOVUDENT_PRUEBA_GOTRUE_URL=http://127.0.0.1:{kong}/auth/v1\n"
    f"NOVUDENT_PRUEBA_SERVICE_KEY={servicio}\n"
    f"NOVUDENT_PRUEBA_ANON_KEY={anon}\n")
PY
    chmod 600 "$AQUI/.env" "$AQUI/acceso.env"
    dc up -d --wait --wait-timeout 300 2>&1 | tail -n 8
    echo "Stack listo: Kong en 127.0.0.1:$PUERTO_KONG y Postgres en 127.0.0.1:$PUERTO_DB (solo este equipo). Accesos en $AQUI/acceso.env"
    ;;
  bajar)
    if [ -f "$AQUI/.env" ] && [ -f "$AQUI/override.yml" ]; then dc down -v --remove-orphans 2>&1 | tail -n 3; fi
    rm -f "$AQUI/.env" "$AQUI/acceso.env" "$AQUI/override.yml"
    echo "Stack destruido."
    ;;
  estado)
    docker ps --filter "label=com.docker.compose.project=$PROYECTO" --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    echo "Uso: $0 subir | bajar | estado" >&2
    exit 1
    ;;
esac
