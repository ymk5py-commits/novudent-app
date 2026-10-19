#!/usr/bin/env bash
# Respaldo lógico CIFRADO de la base de Supabase de Novudent: volcado → cifrado AES-256 → comprobación → copia local → Cloudflare R2.
# Correr en el servidor (necesita docker). Pensado para un temporizador diario (ver docs/servidor/respaldos.md).
#
# Uso:  ./respaldo.sh                 (hace todo lo configurado)
#       ./respaldo.sh --solo-local    (no sube a R2, aunque esté configurado: sirve para probar)
#
# Configuración en ~/.respaldo-novudent.env (permisos 600; nunca en el repositorio):
#   RESPALDO_CLAVE=<frase larga>                 cifra los respaldos. GUARDALA TAMBIÉN FUERA DEL SERVIDOR: sin ella no hay forma de abrirlos.
#   R2_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com   R2_BUCKET=<bucket>   R2_ACCESS_KEY_ID=...   R2_SECRET_ACCESS_KEY=...
#   (opcional) DB_CONTENEDOR=<nombre>            si hay más de una base de Supabase en el servidor
#   (opcional) DIR_LOCAL=~/respaldos-novudent    RETENCION_LOCAL_DIAS=7   RETENCION_R2_DIAS=14   RETENCION_R2_MENSUAL_DIAS=400
#   (opcional) AVISO_URL=<URL de «push» de Uptime Kuma>   se llama solo si TODO salió bien: un respaldo que no avisa es un respaldo que se cayó.
set -euo pipefail

SOLO_LOCAL=0; [ "${1:-}" = "--solo-local" ] && SOLO_LOCAL=1
CONFIG="${RESPALDO_CONFIG:-$HOME/.respaldo-novudent.env}"
[ -r "$CONFIG" ] || { echo "Falta $CONFIG (ver el encabezado de este script)" >&2; exit 2; }
# shellcheck disable=SC1090
set -a; . "$CONFIG"; set +a
: "${RESPALDO_CLAVE:?falta RESPALDO_CLAVE en $CONFIG}"
DIR_LOCAL="${DIR_LOCAL:-$HOME/respaldos-novudent}"
RETENCION_LOCAL_DIAS="${RETENCION_LOCAL_DIAS:-7}"
RETENCION_R2_DIAS="${RETENCION_R2_DIAS:-14}"
RETENCION_R2_MENSUAL_DIAS="${RETENCION_R2_MENSUAL_DIAS:-400}"
RCLONE_IMAGEN="rclone/rclone:1.68.2"
mkdir -p "$DIR_LOCAL"; chmod 700 "$DIR_LOCAL"
log() { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
exec 9>"$DIR_LOCAL/.respaldo.lock"
flock -n 9 || { log "ya hay un respaldo en curso"; exit 75; }

# 1) La base: el único contenedor db-<uuid> que levanta Coolify (o el indicado).
if [ -n "${DB_CONTENEDOR:-}" ]; then DB="$DB_CONTENEDOR"; else
  mapfile -t candidatos < <(docker ps --format '{{.Names}}' | grep -E '^db-[a-z0-9]+-' | grep -F "db-${DB_RECURSO:-}" || true)
  [ "${#candidatos[@]}" -eq 1 ] || { echo "Esperaba exactamente un contenedor db-<uuid> y hay ${#candidatos[@]}: definí DB_CONTENEDOR" >&2; exit 2; }
  DB="${candidatos[0]}"
fi
log "base: $DB"

# 2) Volcado (formato custom: comprimido y restaurable por partes) cifrado al vuelo: el volcado en claro nunca toca el disco.
SELLO="$(date +%Y%m%d-%H%M%S)"
ARCHIVO="novudent-supabase-$SELLO.dump.enc"
RUTA="$DIR_LOCAL/$ARCHIVO"
docker exec "$DB" pg_dump -U supabase_admin -d postgres --format=custom --no-owner \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:RESPALDO_CLAVE > "$RUTA.parcial"
mv "$RUTA.parcial" "$RUTA"; chmod 600 "$RUTA"
log "volcado cifrado: $ARCHIVO ($(du -h "$RUTA" | cut -f1))"

# 3) Comprobación: se descifra y se lista el contenido con pg_restore. Un archivo que no abre no es un respaldo.
if ! ENTRADAS="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:RESPALDO_CLAVE < "$RUTA" | docker exec -i "$DB" pg_restore --list | awk '/^[0-9]+;/ {n++} END {print n+0}')"; then
  echo "Falló la comprobación del respaldo: NO se sube" >&2
  rm -f "$RUTA"
  exit 1
fi
[ "$ENTRADAS" -gt 50 ] || { echo "El respaldo no se puede leer o está vacío ($ENTRADAS entradas): NO se sube" >&2; rm -f "$RUTA"; exit 1; }
sha256sum "$RUTA" | awk '{print $1}' > "$RUTA.sha256"
log "comprobado: $ENTRADAS entradas en el volcado"

# 4) A Cloudflare R2 (rclone en un contenedor con la versión fijada; las claves van por entorno, no por la línea de comandos).
subir() { # subir <ruta-remota>
  docker run --rm -v "$DIR_LOCAL:/datos:ro" \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" -e RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" -e RCLONE_CONFIG_R2_ACL=private \
    "$RCLONE_IMAGEN" "$@"
}
if [ "$SOLO_LOCAL" -eq 0 ] && [ -n "${R2_BUCKET:-}" ]; then
  : "${R2_ENDPOINT:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
  subir copyto "/datos/$ARCHIVO" "R2:$R2_BUCKET/novudent/diario/$ARCHIVO" --s3-no-check-bucket
  subir copyto "/datos/$ARCHIVO.sha256" "R2:$R2_BUCKET/novudent/diario/$ARCHIVO.sha256" --s3-no-check-bucket
  # El día 1 de cada mes se guarda una copia aparte que dura más.
  if [ "$(date +%d)" = "01" ]; then subir copyto "/datos/$ARCHIVO" "R2:$R2_BUCKET/novudent/mensual/$ARCHIVO" --s3-no-check-bucket; fi
  # Comprobar que llegó: el tamaño remoto tiene que ser igual al local.
  REMOTO="$(subir size "R2:$R2_BUCKET/novudent/diario/$ARCHIVO" --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["bytes"])')"
  LOCAL="$(stat -c %s "$RUTA")"
  [ "$REMOTO" = "$LOCAL" ] || { echo "El tamaño en R2 ($REMOTO) no coincide con el local ($LOCAL)" >&2; exit 1; }
  log "subido a R2 y verificado ($LOCAL bytes)"
  subir delete "R2:$R2_BUCKET/novudent/diario" --min-age "${RETENCION_R2_DIAS}d" --s3-no-check-bucket || true
  subir delete "R2:$R2_BUCKET/novudent/mensual" --min-age "${RETENCION_R2_MENSUAL_DIAS}d" --s3-no-check-bucket || true
else
  log "sin subida a R2 (${SOLO_LOCAL:+solo local}${R2_BUCKET:+}${R2_BUCKET:-R2 sin configurar})"
fi

# 5) Limpieza local y aviso.
find "$DIR_LOCAL" -maxdepth 1 -name 'novudent-supabase-*' -mtime "+$RETENCION_LOCAL_DIAS" -delete
[ -z "${AVISO_URL:-}" ] || curl -fsS -m 10 "$AVISO_URL" >/dev/null || log "aviso: no pude llamar a AVISO_URL"
log "listo"
