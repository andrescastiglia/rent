#!/bin/bash
# Script to generate monthly reports for all owners
# Run on the first day of each month

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATCH_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BATCH_DIR"

LOG_ARG=()
MODE_ARG=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            MODE_ARG=(--dry-run)
            shift
            ;;
        --log)
            if [[ -z "${2:-}" ]]; then
                echo "Missing value for --log" >&2
                exit 1
            fi
            LOG_ARG=(--log "$2")
            shift 2
            ;;
        --log=*)
            LOG_ARG=(--log "${1#*=}")
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Get previous month for reports
PREV_MONTH=$(TZ=America/Argentina/Buenos_Aires date -d "$(TZ=America/Argentina/Buenos_Aires date +%Y-%m-01) -1 month" +%Y-%m)

echo "Generating reports for period: $PREV_MONTH"

# Get all active owner IDs from database
OWNERS=$(psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "SELECT id FROM owners WHERE deleted_at IS NULL ORDER BY company_id, id")
FAILED=0

for OWNER_ID in $OWNERS; do
    OWNER_ID=$(echo "$OWNER_ID" | xargs)  # Trim whitespace
    
    if [ -z "$OWNER_ID" ]; then
        continue
    fi
    
    echo "Generating monthly summary for owner: $OWNER_ID"
    node dist/index.js reports "${LOG_ARG[@]}" "${MODE_ARG[@]}" --type monthly --owner-id "$OWNER_ID" --month "$PREV_MONTH" || FAILED=$((FAILED + 1))
    
    echo "Generating settlement for owner: $OWNER_ID"
    node dist/index.js reports "${LOG_ARG[@]}" "${MODE_ARG[@]}" --type settlement --owner-id "$OWNER_ID" --month "$PREV_MONTH" || FAILED=$((FAILED + 1))
done

if [ "$FAILED" -gt 0 ]; then
    echo "Report generation finished with $FAILED failed reports" >&2
    exit 1
fi
echo "Report generation completed!"
