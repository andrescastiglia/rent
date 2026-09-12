#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'python3 /app/scripts/metrics.py success 0' ERR
mkdir -p /tmp/rent-backup/data
pg_dump --format=custom --file=/tmp/rent-backup/data/rent.dump
pg_restore --list /tmp/rent-backup/data/rent.dump >/dev/null
# A fixed host/path keeps retention grouped across ephemeral Kubernetes pods.
restic backup --host oracle-rent --tag database /tmp/rent-backup/data
restic forget --host oracle-rent --tag database --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic check
python3 /app/scripts/metrics.py success 1
python3 /app/scripts/metrics.py last_success_timestamp "$(date +%s)"
rm -f /tmp/rent-backup/data/rent.dump
