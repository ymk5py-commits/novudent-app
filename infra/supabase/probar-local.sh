#!/usr/bin/env bash
# Prueba de humo del stack de Supabase de Novudent con secretos DESCARTABLES (se generan acá y se borran al terminar).
# Requiere docker (con el plugin compose), python3 y curl. Solo publica en 127.0.0.1:$PUERTO y todo se destruye al salir.
# Uso: ./probar-local.sh          (PUERTO=18000 por defecto; PUERTO=18010 ./probar-local.sh para otro)
# Correr SIEMPRE antes de subir una versión nueva de las imágenes (docker-compose.yml) a Coolify.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
PROYECTO="nvsb-test-$$"
PUERTO="${PUERTO:-18000}"
TMP="$(mktemp -d)"
chmod 700 "$TMP"
fallos=0

dc() { docker compose -p "$PROYECTO" -f "$TMP/docker-compose.yml" -f "$TMP/override.yml" --env-file "$TMP/.env" "$@"; }
limpiar() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpiar EXIT

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$1"; }
mal()  { printf '  \033[31mFALLA\033[0m %s\n' "$1"; fallos=$((fallos + 1)); }
info() { printf '  INFO  %s\n' "$1"; }
espera() { # espera "descripción" esperado comando...   (compara el código HTTP que imprime el comando)
  local d="$1" e="$2"; shift 2
  local r; r="$("$@" 2>/dev/null || true)"
  if [ "$r" = "$e" ]; then ok "$d (HTTP $r)"; else mal "$d: esperaba HTTP $e y llegó '$r'"; fi
}

cp "$AQUI/docker-compose.yml" "$TMP/"
printf 'services:\n  kong:\n    ports:\n      - "127.0.0.1:%s:8000"\n' "$PUERTO" > "$TMP/override.yml"

# Secretos y JWT descartables (HS256), con los mismos nombres que las variables mágicas de Coolify.
python3 - "$TMP/.env" "$PUERTO" <<'PY'
import base64, hashlib, hmac, json, secrets, sys, time
destino, puerto = sys.argv[1], sys.argv[2]
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
jwt_secret = secrets.token_hex(16)  # 32 caracteres, como el que genera Coolify
def jwt(rol):
    cab = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    ahora = int(time.time())
    carga = b64(json.dumps({"role": rol, "iss": "supabase", "iat": ahora, "exp": ahora + 3600 * 24}, separators=(",", ":")).encode())
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
chmod 600 "$TMP/.env"
leer() { grep "^$1=" "$TMP/.env" | cut -d= -f2-; }
ANON="$(leer SERVICE_SUPABASEANON_KEY)"
SERVICIO="$(leer SERVICE_SUPABASESERVICE_KEY)"
URL="http://127.0.0.1:$PUERTO"
curl_codigo() { curl -s -o /dev/null -w '%{http_code}' -m 15 "$@"; }

echo "== Levantando el stack ($PROYECTO) y esperando que todo esté sano =="
dc up -d --wait --wait-timeout 300 2>&1 | tail -n 12 || { mal "el stack no llegó a estar sano"; dc ps; for sv in $(dc ps --format '{{.Service}} {{.Health}}' | awk '$2 != "healthy" {print $1}'); do echo "--- registro de $sv ---"; dc logs --no-log-prefix --tail 40 "$sv" 2>&1 | tail -n 40; done; exit 1; }
dc ps --format 'table {{.Service}}\t{{.Status}}'

echo "== Puerta de entrada (Kong) =="
espera "auth/health con clave anónima" 200 curl_codigo -H "apikey: $ANON" "$URL/auth/v1/health"
espera "auth/health sin clave" 401 curl_codigo "$URL/auth/v1/health"
espera "clave inventada" 401 curl_codigo -H "apikey: clave-inventada" "$URL/auth/v1/health"
espera "rest/v1 con clave anónima" 200 curl_codigo -H "apikey: $ANON" -H "Authorization: Bearer $ANON" "$URL/rest/v1/"
espera "rest/v1 sin clave" 401 curl_codigo "$URL/rest/v1/"
espera "ruta que no existe (dashboard/storage/funciones)" 404 curl_codigo -H "apikey: $ANON" "$URL/storage/v1/bucket"
GRANDE="$TMP/grande.json"; { printf '{"x":"'; head -c 9000000 /dev/zero | tr '\0' a; printf '"}'; } > "$GRANDE"
espera "cuerpo de 9 MB rechazado (tope de 8 MB)" 413 curl_codigo -X POST -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' --data-binary "@$GRANDE" "$URL/rest/v1/rpc/lote"
rm -f "$GRANDE"

echo "== Login =="
EMAIL="prueba-$RANDOM@novudent.test"; CLAVE="Clave-$(openssl rand -hex 6)"
espera "crear usuario con la clave de servicio" 200 curl_codigo -X POST -H "apikey: $SERVICIO" -H "Authorization: Bearer $SERVICIO" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$CLAVE\",\"email_confirm\":true}" "$URL/auth/v1/admin/users"
espera "crear usuario con la clave ANÓNIMA (debe negarse)" 403 curl_codigo -X POST -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' -d '{"email":"intruso@novudent.test","password":"x12345678","email_confirm":true}' "$URL/auth/v1/admin/users"
TOKEN="$(curl -s -m 15 -X POST -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$CLAVE\"}" "$URL/auth/v1/token?grant_type=password" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
if [ -n "$TOKEN" ]; then ok "iniciar sesión con email y contraseña"; else mal "iniciar sesión con email y contraseña"; fi
espera "rest/v1 con el token de esa persona" 200 curl_codigo -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" "$URL/rest/v1/"
cod="$(curl_codigo -X POST -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{}' "$URL/auth/v1/signup")"
if [ "$cod" = "200" ]; then ok "sesión anónima de la demo (HTTP 200)"; else mal "sesión anónima de la demo: HTTP $cod (la demo pública la necesita)"; fi
# Alguien de afuera intenta registrarse con la clave pública: el hook lo rechaza (403) y NO deja ninguna cuenta (no puede «reservar» un correo ajeno).
cod="$(curl_codigo -X POST -H "apikey: $ANON" -H 'Content-Type: application/json' -d '{"email":"intruso2@novudent.test","password":"x12345678"}' "$URL/auth/v1/signup")"
if [ "$cod" = "403" ] || [ "$cod" = "422" ]; then ok "registro abierto por correo rechazado (HTTP $cod)"; else mal "registro abierto por correo: HTTP $cod (se esperaba 403)"; fi
cuantas="$(dc exec -T db psql -U supabase_admin -d postgres -At -c "select count(*) from auth.users where email = 'intruso2@novudent.test'" 2>/dev/null || true)"
if [ "$cuantas" = "0" ]; then ok "el intento no dejó ninguna cuenta"; else mal "el intento dejó $cuantas cuenta(s) en auth.users"; fi

# Límites por cliente (cf-connecting-ip): el alta de sesiones admite 60 por hora; la 61 recibe 429 y otra IP sigue pasando.
for i in $(seq 1 60); do curl -s -o /dev/null -m 15 -X POST -H "apikey: $ANON" -H "cf-connecting-ip: 198.51.100.7" -H 'Content-Type: application/json' -d '{}' "$URL/auth/v1/signup" || true; done
espera "alta de sesiones: la 61.ª de la misma IP recibe 429" 429 curl_codigo -X POST -H "apikey: $ANON" -H "cf-connecting-ip: 198.51.100.7" -H 'Content-Type: application/json' -d '{}' "$URL/auth/v1/signup"
espera "alta de sesiones: otra IP sigue pasando" 200 curl_codigo -X POST -H "apikey: $ANON" -H "cf-connecting-ip: 198.51.100.8" -H 'Content-Type: application/json' -d '{}' "$URL/auth/v1/signup"

echo "== Limpieza de sesiones anónimas (pg_cron) =="
psqlx() { dc exec -T db psql -U supabase_admin -d postgres -At -c "$1"; }
[ "$(psqlx "select count(*) from cron.job where jobname = 'limpiar-sesiones-anonimas'" 2>/dev/null || true)" = "1" ] && ok "tarea diaria programada en pg_cron" || mal "no está programada la limpieza de sesiones anónimas"
psqlx "update auth.users set created_at = now() - interval '40 days' where is_anonymous" >/dev/null 2>&1 || true
psqlx "$(psqlx "select command from cron.job where jobname = 'limpiar-sesiones-anonimas'" 2>/dev/null)" >/dev/null 2>&1 || true
[ "$(psqlx "select count(*) from auth.users where is_anonymous" 2>/dev/null || true)" = "0" ] && ok "la limpieza borra las sesiones anónimas de más de 30 días" || mal "la limpieza no borró las sesiones anónimas viejas"

echo "== Tiempo real =="
ws="$(curl -s -i -m 5 --http1.1 -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==' "$URL/realtime/v1/websocket?apikey=$ANON&vsn=1.0.0" 2>/dev/null | head -n 1 | tr -d '\r' || true)"
case "$ws" in *101*) ok "WebSocket de Realtime ($ws)";; *) mal "WebSocket de Realtime: '$ws'";; esac

echo "== Base de datos =="
psqlc() { dc exec -T db psql -U supabase_admin -d postgres -At -c "$1"; }
roles="$(psqlc "select count(*) from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','supabase_auth_admin')" 2>/dev/null || true)"
[ "$roles" = "5" ] && ok "roles de Supabase creados" || mal "roles de Supabase: $roles de 5"
[ "$(psqlc "select count(*) from information_schema.schemata where schema_name in ('auth','_realtime','public')" 2>/dev/null || true)" = "3" ] && ok "esquemas auth, _realtime y public" || mal "faltan esquemas"
[ "$(psqlc "select count(*) from auth.users" 2>/dev/null || true)" -ge 1 ] 2>/dev/null && ok "el usuario de prueba está en auth.users" || mal "no aparece el usuario de prueba en auth.users"
publicados="$(docker ps --filter "label=com.docker.compose.project=$PROYECTO" --format '{{.Names}} {{.Ports}}' | grep -v '127.0.0.1:' | grep -E '0\.0\.0\.0|:::' || true)"
[ -z "$publicados" ] && ok "ningún puerto publicado fuera de 127.0.0.1" || mal "puertos publicados: $publicados"

echo
if [ "$fallos" -eq 0 ]; then echo "TODO BIEN: el stack pasó todas las pruebas."; else echo "HAY $fallos FALLA(S)."; dc logs --tail 20 2>&1 | tail -n 80; exit 1; fi
