#!/bin/bash
# Pone las dos claves públicas/de servicio en la configuración declarativa de Kong y lo arranca.
# Los JWT solo tienen letras, números, «.», «_» y «-»: es seguro sustituirlos con sed y «|» de separador.
set -euo pipefail
: "${SUPABASE_ANON_KEY:?falta SUPABASE_ANON_KEY}"
: "${SUPABASE_SERVICE_KEY:?falta SUPABASE_SERVICE_KEY}"
sed -e "s|\$SUPABASE_ANON_KEY|${SUPABASE_ANON_KEY}|g" \
    -e "s|\$SUPABASE_SERVICE_KEY|${SUPABASE_SERVICE_KEY}|g" \
    /home/kong/temp.yml > /tmp/kong.yml
exec /entrypoint.sh kong docker-start
