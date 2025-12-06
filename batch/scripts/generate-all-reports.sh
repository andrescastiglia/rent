#!/bin/bash
# Script to generate monthly reports for all owners
# Run on the first day of each month

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATCH_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BATCH_DIR"

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
    npm run start -- reports --type monthly --owner-id "$OWNER_ID" --month "$PREV_MONTH"
    
    echo "Generating settlement for owner: $OWNER_ID"
    npm run start -- reports --type settlement --owner-id "$OWNER_ID" --month "$PREV_MONTH"
done

echo "Report generation completed!"
