#!/usr/bin/env bash
set -euo pipefail

# Opens a generic SSH database tunnel.
# Defaults target a Postgres listener, but every endpoint can be overridden
# via SSH_HOST / LOCAL_PORT / REMOTE_HOST / REMOTE_PORT.
SSH_HOST="${SSH_HOST:-oracle}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
REMOTE_HOST="${REMOTE_HOST:-127.0.0.1}"
REMOTE_PORT="${REMOTE_PORT:-5432}"

exec ssh -N \
  -L "${LOCAL_PORT}:${REMOTE_HOST}:${REMOTE_PORT}" \
  "${SSH_HOST}"
