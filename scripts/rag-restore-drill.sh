#!/bin/bash

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <backup.sql|backup.dump> <target_database_restore_drill>" >&2
    exit 1
fi

backup_file="$1"
target_database="$2"

if [ ! -f "$backup_file" ]; then
    echo "Backup file does not exist: $backup_file" >&2
    exit 1
fi
if [[ ! "$target_database" =~ _restore_drill$ ]]; then
    echo "Target database must end with _restore_drill" >&2
    exit 1
fi
if [ -n "${POSTGRES_DB:-}" ] && [ "$target_database" = "$POSTGRES_DB" ]; then
    echo "Refusing to overwrite the configured source database" >&2
    exit 1
fi

host="${POSTGRES_HOST:-localhost}"
port="${POSTGRES_PORT:-5432}"
user="${POSTGRES_USER:-rent_user}"
export PGPASSWORD="${POSTGRES_PASSWORD:-${PGPASSWORD:-}}"

dropdb --if-exists --force --host "$host" --port "$port" --username "$user" "$target_database"
createdb --host "$host" --port "$port" --username "$user" "$target_database"

if pg_restore --list "$backup_file" >/dev/null 2>&1; then
    pg_restore \
        --exit-on-error \
        --no-owner \
        --host "$host" \
        --port "$port" \
        --username "$user" \
        --dbname "$target_database" \
        "$backup_file"
else
    psql \
        -v ON_ERROR_STOP=1 \
        --host "$host" \
        --port "$port" \
        --username "$user" \
        --dbname "$target_database" \
        --file "$backup_file"
fi

psql -v ON_ERROR_STOP=1 \
    --host "$host" \
    --port "$port" \
    --username "$user" \
    --dbname "$target_database" <<'SQL'
DO $$
BEGIN
    IF to_regclass('public.ai_knowledge_chunks') IS NULL
       OR to_regclass('public.ai_embedding_outbox') IS NULL
       OR to_regclass('public.ai_rag_runs') IS NULL THEN
        RAISE EXCEPTION 'Restored database is missing required RAG tables';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) THEN
        RAISE EXCEPTION 'Restored database does not have pgvector';
    END IF;
END;
$$;
SELECT extversion AS pgvector_version
  FROM pg_extension
 WHERE extname = 'vector';
SELECT
  count(*) FILTER (WHERE deleted_at IS NULL) AS active_chunks,
  count(*) FILTER (
    WHERE deleted_at IS NULL AND embedding IS NULL
  ) AS active_chunks_without_embedding
FROM ai_knowledge_chunks;
SQL

echo "Restore drill completed in database: $target_database"
