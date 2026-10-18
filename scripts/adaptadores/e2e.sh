#!/usr/bin/env bash
# E2E con NEXT_PUBLIC_BACKEND=supabase contra el stack descartable (scripts/adaptadores/stack-descartable.sh up).
# Compila la app con las variables del stack (las NEXT_PUBLIC_* se hornean al compilar; deja el resultado en .next, así que después hay que volver a correr
# `npm run build` para tener el build por defecto) y corre Playwright. Uso: scripts/adaptadores/e2e.sh [argumentos de playwright]   (SIN_BUILD=1 reusa el build)
set -euo pipefail
cd "$(dirname "$0")/../.."
ENV_LOCAL="${ENV_LOCAL:-$HOME/.cache/novudent-fase-c/${PROYECTO:-nvsb-test-c}.env}"
[ -f "$ENV_LOCAL" ] || { echo "No hay stack: corré primero scripts/adaptadores/stack-descartable.sh up" >&2; exit 1; }
set -a; . "$ENV_LOCAL"; set +a
export NEXT_PUBLIC_BACKEND=supabase
if [ -z "${SIN_BUILD:-}" ]; then npm run build; fi
exec npx playwright test -c e2e-supabase/playwright.config.ts "$@"
