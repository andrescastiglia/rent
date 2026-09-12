# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.22.1
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG APP
WORKDIR /src
COPY ${APP}/package*.json ./
RUN npm ci
COPY ${APP}/ ./
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_API_URL=/api API_PROXY_URL=http://backend.rent.svc.cluster.local:3001
RUN npm run build
RUN if [ "$APP" != frontend ]; then npm prune --omit=dev --legacy-peer-deps --package-lock=false; fi

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ansible/files/newrelic-bootstrap.cjs ansible/files/run-exclusive.cjs /app/deploy/
ENV NODE_ENV=production DOTENV_CONFIG_PATH=/run/rent/runtime.env NEW_RELIC_LOG=stdout LOG_TO_FILE=false HOST=0.0.0.0 HOSTNAME=0.0.0.0
USER node

FROM runtime AS server
COPY --from=build --chown=node:node /src/dist ./dist
COPY --from=build --chown=node:node /src/node_modules ./node_modules
COPY --from=build /src/package.json /src/newrelic.js ./
ENV RENT_TRACING_PROVIDER=otlp
ENTRYPOINT ["node", "-r", "/app/deploy/newrelic-bootstrap.cjs"]
CMD ["dist/main.js"]

FROM server AS batch
USER root
# The monthly report wrapper needs the PostgreSQL client and GNU date.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client && rm -rf /var/lib/apt/lists/*
COPY batch/scripts/generate-all-reports.sh ./scripts/generate-all-reports.sh
USER node
ENV RENT_TRACING_MODULE=./dist/shared/tracing.js
CMD ["dist/index.js", "rag-sync", "--batch-size", "50"]

FROM server AS backend
ENV RENT_TRACING_MODULE=./dist/tracing.js

FROM runtime AS frontend
COPY --from=build --chown=node:node /src/.next/standalone/ ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static
COPY --from=build --chown=node:node /src/public ./public
COPY --from=build /src/newrelic.js ./newrelic.js
ENV PORT=3000 NEW_RELIC_APP_NAME=RENT-Frontend-production
ENTRYPOINT ["node", "-r", "/app/deploy/newrelic-bootstrap.cjs", "server.js"]
