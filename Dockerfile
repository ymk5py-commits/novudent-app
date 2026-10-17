# syntax=docker/dockerfile:1
# Novudent para el servidor propio (Coolify). Tres etapas: dependencias → compilación → ejecución (solo `.next/standalone`).
# Las variables NEXT_PUBLIC_* se hornean EN EL BUILD (el navegador las lee del código compilado): se pasan como build args.
# Las demás (claves, secretos) se leen al arrancar: ver docs/servidor/variables.md.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Un ARG sin valor NO crea la variable (no queda como cadena vacía): el código usa sus valores por defecto.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_BACKEND
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APPCHECK_SITE_KEY
ARG NEXT_PUBLIC_WHATSAPP_VENTAS
ARG NEXT_PUBLIC_SOPORTE_WHATSAPP
ARG NEXT_PUBLIC_SOPORTE_HORARIO
ARG NEXT_PUBLIC_SOPORTE_EMAIL
ARG NEXT_PUBLIC_CONTACTO_LEGAL
RUN npm run build

FROM node:24-slim AS run
WORKDIR /app
# HOSTNAME=0.0.0.0: dentro de Docker `HOSTNAME` trae el id del contenedor y Next escucharía solo ahí (inalcanzable desde Traefik).
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
# La imagen slim no trae curl: el chequeo usa el fetch de Node. Mismo endpoint que el monitoreo externo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
