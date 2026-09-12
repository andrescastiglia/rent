#!/usr/bin/env bash
set -euo pipefail
image="$1"
app="$2"
case "$app" in
  backend)
    docker run --rm --read-only --entrypoint node "$image" -e "require('node:fs').accessSync('dist/main.js'); require('node:fs').accessSync('dist/tracing.js'); require('bcrypt').hashSync('container-check',4); require('@napi-rs/canvas').createCanvas(8,8); require('pdfkit'); require('./dist/config/database-tls'); console.log('Native ARM64 modules loaded')" ;;
  frontend)
    docker run --rm --read-only --entrypoint node "$image" -e "require('next'); require('newrelic/package.json'); require('node:fs').accessSync('server.js'); console.log('Next standalone complete')" ;;
  batch)
    docker run --rm --read-only --tmpfs /tmp -e LOG_TO_FILE=false --entrypoint node "$image" -e "require('node:fs').accessSync('dist/index.js'); require('./dist/shared/logger').logger.info('Console-only batch'); require('pdfkit'); require('node:fs').accessSync('scripts/generate-all-reports.sh')" ;;
  maintenance)
    docker run --rm --read-only --entrypoint bash "$image" -c 'pg_dump --version; restic version; python3 -c "import psycopg2"; bash -n /app/scripts/backup.sh /app/scripts/restore-drill.sh' ;;
  postgres)
    docker run --rm --entrypoint postgres "$image" --version | grep -Eq '^postgres \(PostgreSQL\) 17\.9( |$)'
    name=rent-postgres-image-test
    trap 'docker rm -fv "$name" >/dev/null 2>&1 || true' EXIT
    docker run -d --name "$name" -e POSTGRES_PASSWORD=container-test-only "$image"
    for i in $(seq 1 60); do
      if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres >/dev/null; then break; fi
      sleep 2
    done
    docker exec "$name" psql -U postgres -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION postgis; CREATE EXTENSION vector; CREATE EXTENSION unaccent; CREATE EXTENSION pgcrypto; CREATE EXTENSION "uuid-ossp";' -c "SELECT postgis_version(), vector_dims('[1,2,3]'::vector);"
    test "$(docker exec "$name" psql -U postgres -Atc "SELECT extversion FROM pg_extension WHERE extname='postgis'")" = 3.5.3
    test "$(docker exec "$name" psql -U postgres -Atc "SELECT extversion FROM pg_extension WHERE extname='vector'")" = 0.8.5 ;;
  *) exit 2 ;;
esac
