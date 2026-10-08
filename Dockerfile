# Syntaxe Docker moderne (construction en cache, --mount=type=cache).
# Image de PRODUCTION du site — utilisée par `docker-compose.prod.yml`
# (gérable dans OMV ▸ Services ▸ Compose). Le dev a son propre
# `Dockerfile.dev` : ces deux fichiers ne se mélangent pas.
#
# Étages : deps (npm ci) → build (next build) → runner (image finale mince).
# Les secrets ne transitent JAMAIS par le build : `.dockerignore` exclut
# `.env*`, et les variables `NEXT_PUBLIC_*` (inlinées à la compilation)
# arrivent par des `build.args` du compose.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables inlinées à la compilation (elles n'existent que là, côté client) :
# le compose les injecte depuis le `.env` du dossier du fichier compose.
# `VERCEL_ENV=production` : demo-gate.ts masque le jeu de démo quand
# VERCEL_ENV=production — la prod n'est plus Vercel, on redéclare l'intention
# ici (build) et dans `.env` (runtime).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_NAME
ARG CDN_BASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SITE_NAME=$NEXT_PUBLIC_SITE_NAME \
    CDN_BASE_URL=$CDN_BASE_URL \
    VERCEL_ENV=production
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# `server.js` se lie à HOSTNAME, que Docker force à <id du conteneur> : la
# loopback ne répondrait plus (healthcheck KO → cron bloqué par depends_on).
# On impose 0.0.0.0 — c'est le réglage de l'exemple officiel Next avec Docker.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0
# `output: "standalone"` ne copie ni `public/` ni `.next/static/` (doc Next) :
# on les ajoute, `server.js` les sert alors automatiquement.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
# Même chose que `next start`, mais sur le serveur minimal embarqué.
CMD ["node", "server.js"]
