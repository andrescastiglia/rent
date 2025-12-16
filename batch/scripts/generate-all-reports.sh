#!/bin/bash
# Script to generate monthly reports for all owners
# Run on the first day of each month

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATCH_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BATCH_DIR"

LOG_ARG=()
while [[ $# -gt 0 ]]; do
    case "$1" in
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

# Get current month in YYYY-MM format
CURRENT_MONTH=$(date +%Y-%m)

# Get previous month for reports
PREV_MONTH=$(date -d "1 month ago" +%Y-%m)

echo "Generating reports for period: $PREV_MONTH"

# Get all active owner IDs from database
OWNERS=$(psql -t -c "SELECT DISTINCT o.user_id FROM owners o JOIN units u ON u.company_id IS NOT NULL WHERE o.user_id IS NOT NULL" "$DATABASE_URL")

for OWNER_ID in $OWNERS; do
    OWNER_ID=$(echo "$OWNER_ID" | xargs)  # Trim whitespace
    
    if [ -z "$OWNER_ID" ]; then
        continue
    fi
    
    echo "Generating monthly summary for owner: $OWNER_ID"
    npm run start -- reports "${LOG_ARG[@]}" --type monthly --owner-id "$OWNER_ID" --month "$PREV_MONTH"
    
    echo "Generating settlement for owner: $OWNER_ID"
    npm run start -- reports "${LOG_ARG[@]}" --type settlement --owner-id "$OWNER_ID" --month "$PREV_MONTH"
done

echo "Report generation completed!"
