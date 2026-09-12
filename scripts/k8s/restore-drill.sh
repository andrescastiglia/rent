#!/usr/bin/env bash
set -euo pipefail
umask 077
export BACKUP_KIND=restore-drill
trap 'python3 /app/scripts/metrics.py success 0' ERR
# This job receives the isolated PostgreSQL administrator, never production URLs.
restic restore latest --host oracle-rent --tag database --target /tmp/restore
archive=/tmp/restore/tmp/rent-backup/data/rent.dump
test -s "$archive"
export PGDATABASE=postgres
createdb rent_restore_drill
trap 'dropdb --if-exists rent_restore_drill' EXIT
pg_restore --exit-on-error --dbname=rent_restore_drill "$archive"
psql --dbname=rent_restore_drill -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM documents" -c "SELECT postgis_version(), vector_dims('[1,2,3]'::vector)"
python3 /app/scripts/metrics.py success 1
python3 /app/scripts/metrics.py last_success_timestamp "$(date +%s)"
