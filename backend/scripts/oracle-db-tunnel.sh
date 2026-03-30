#!/usr/bin/env bash
set -euo pipefail

# Opens an SSH tunnel using the host alias configured in ~/.ssh/config.
SSH_HOST="${SSH_HOST:-oracle}"
LOCAL_PORT="${LOCAL_PORT:-15432}"
REMOTE_HOST="${REMOTE_HOST:-127.0.0.1}"
REMOTE_PORT="${REMOTE_PORT:-5432}"

exec ssh -N \
  -L "${LOCAL_PORT}:${REMOTE_HOST}:${REMOTE_PORT}" \
  "${SSH_HOST}"
