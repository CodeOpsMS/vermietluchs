FROM node:26.7.0-bookworm-slim AS build

ARG APP_VERSION=0.0.1

WORKDIR /app

# better-sqlite3 benötigt bei fehlendem Fertigpaket einen kleinen C++-Build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm pkg set version="${APP_VERSION}" \
    && npm run build \
    && npm prune --omit=dev

FROM node:26.7.0-bookworm-slim AS runtime

ARG APP_VERSION=0.0.1
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Vermietluchs" \
    org.opencontainers.image.description="Selbst betriebene Miet- und Betriebskostenverwaltung" \
    org.opencontainers.image.source="https://github.com/CodeOpsMS/vermietluchs" \
    org.opencontainers.image.version="${APP_VERSION}" \
    org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.licenses="LicenseRef-PolyForm-Noncommercial-1.0.0"

ENV NODE_ENV=production \
    VERMIETLUCHS_PORT=3001 \
    VERMIETLUCHS_HOST=0.0.0.0 \
    VERMIETLUCHS_DATA_DIR=/data \
    VERMIETLUCHS_VERSION=${APP_VERSION}

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/LICENSE.md ./LICENSE.md
COPY --from=build --chown=node:node /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/server/index.js"]
