#!/usr/bin/env bash
# Corre un comando con las variables del stack descartable (las que dejó `stack-descartable.sh up`, fuera del repo).
# Uso: scripts/adaptadores/correr.sh vitest run -c vitest.supabase.config.ts
set -euo pipefail
ENV_LOCAL="${ENV_LOCAL:-$HOME/.cache/novudent-fase-c/${PROYECTO:-nvsb-test-c}.env}"
if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]; then
  [ -f "$ENV_LOCAL" ] || { echo "No hay stack: corré primero scripts/adaptadores/stack-descartable.sh up (o exportá las variables NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_JWT_SECRET)." >&2; exit 1; }
  set -a; . "$ENV_LOCAL"; set +a
fi
exec npx "$@"
