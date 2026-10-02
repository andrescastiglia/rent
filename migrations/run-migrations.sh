#!/bin/bash
set -euo pipefail

# =============================================================================
# MIGRATION RUNNER - Execute PostgreSQL Migrations
# =============================================================================
# This script runs all SQL migration files in sequence
# Usage: ./run-migrations.sh [--dry-run] [--baseline-through <migration> --force-baseline-through] [--status]
# =============================================================================

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Cargar variables de entorno
load_env_file() {
    if [ "${MIGRATIONS_SKIP_ENV_FILE:-false}" = true ]; then
        return 0
    fi

    local env_file="${MIGRATIONS_ENV_FILE:-$PROJECT_ROOT/.env}"

    if [ ! -f "$env_file" ]; then
        return 0
    fi

    local line
    local key
    local value
    local line_number=0

    while IFS= read -r line || [ -n "$line" ]; do
        ((line_number += 1))
        line="${line%$'\r'}"

        if [[ "$line" =~ ^[[:space:]]*$ ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
            continue
        fi

        line="${line#"${line%%[![:space:]]*}"}"
        if [[ "$line" =~ ^export[[:space:]]+ ]]; then
            line="${line#export}"
            line="${line#"${line%%[![:space:]]*}"}"
        fi

        if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
            echo "Invalid dotenv assignment at $env_file:$line_number" >&2
            exit 1
        fi

        key="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        value="${value#"${value%%[![:space:]]*}"}"

        if [[ "$value" == \"* ]]; then
            if [[ "$value" != *\" ]]; then
                echo "Unterminated double-quoted value at $env_file:$line_number" >&2
                exit 1
            fi
            value="${value:1:${#value}-2}"
        elif [[ "$value" == \'* ]]; then
            if [[ "$value" != *\' ]]; then
                echo "Unterminated single-quoted value at $env_file:$line_number" >&2
                exit 1
            fi
            value="${value:1:${#value}-2}"
        else
            value="${value%"${value##*[![:space:]]}"}"
        fi

        # Explicit process variables take precedence over values from the file.
        if [ -z "${!key+x}" ]; then
            printf -v "$key" '%s' "$value"
            export "$key"
        fi
    done < "$env_file"
}

load_env_file

# Valores por defecto
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-rent_user}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-rent_password}
POSTGRES_DB=${POSTGRES_DB:-rent_db}
PGPASSWORD=${PGPASSWORD:-$POSTGRES_PASSWORD}
export PGPASSWORD

DRY_RUN=false
BASELINE_ALL_IF_MISSING=false
FORCE_BASELINE_ALL_IF_MISSING=false
BASELINE_THROUGH=""
FORCE_BASELINE_THROUGH=false
ADOPT_LEGACY_CHECKSUMS=false
STATUS_ONLY=false

# =============================================================================
# FUNCIONES
# =============================================================================

print_header() {
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Running Database Migrations${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Determine execution method
declare -a EXEC_CMD=()
CONTAINER_NAME="${MIGRATIONS_CONTAINER_NAME:-rent-postgres}"

run_query() {
    local sql="$1"
    shift

    printf '%s\n' "$sql" | "${EXEC_CMD[@]}" "$@"
}

determine_exec_method() {
    if command -v psql &> /dev/null; then
        EXEC_CMD=(psql -X -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB")
        print_info "Using local psql client"
    elif command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
        EXEC_CMD=(docker exec -i -e PGPASSWORD "$CONTAINER_NAME" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB")
        print_info "Using Docker container ($CONTAINER_NAME)"
    else
        print_error "Neither 'psql' nor running Docker container '$CONTAINER_NAME' found."
        exit 1
    fi
}

check_connection() {
    print_info "Checking database connection..."
    
    if ! run_query "SELECT 1;" &> /dev/null; then
        print_error "Cannot connect to PostgreSQL database"
        print_info "Connection details:"
        echo "  Host: $POSTGRES_HOST"
        echo "  Port: $POSTGRES_PORT"
        echo "  User: $POSTGRES_USER"
        echo "  Database: $POSTGRES_DB"
        echo ""
        print_info "Make sure Docker services are running: make up"
        exit 1
    fi
    
    print_success "Database connection successful"
}

# One psql session owns the execution lock from preflight through the last commit.
# The builder validates all files before PostgreSQL receives any SQL.
main() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run) DRY_RUN=true; shift ;;
            --baseline-all-if-missing) BASELINE_ALL_IF_MISSING=true; shift ;;
            --force-baseline-all-if-missing) FORCE_BASELINE_ALL_IF_MISSING=true; shift ;;
            --baseline-through)
                if [ $# -lt 2 ] || [[ "$2" = --* ]]; then
                    print_error "--baseline-through requires a migration filename"
                    exit 1
                fi
                BASELINE_THROUGH="$2"; shift 2 ;;
            --force-baseline-through) FORCE_BASELINE_THROUGH=true; shift ;;
            --adopt-legacy-checksums) ADOPT_LEGACY_CHECKSUMS=true; shift ;;
            --status) STATUS_ONLY=true; shift ;;
            --help)
                cat <<EOF
Usage: $0 [OPTIONS]

  --dry-run                       Validate history and show pending files without writes
  --baseline-through <file>        Record only a verified snapshot boundary
  --force-baseline-through         Required with --baseline-through
  --baseline-all-if-missing        Record a verified complete snapshot
  --force-baseline-all-if-missing  Required with --baseline-all-if-missing
  --adopt-legacy-checksums         Record current checksums for reviewed legacy history
  --status                        Show history, including checksum verification state
  --help                          Show this help
EOF
                return 0 ;;
            *) print_error "Unknown option: $1"; exit 1 ;;
        esac
    done

    if [ "$BASELINE_ALL_IF_MISSING" = true ] && [ -n "$BASELINE_THROUGH" ]; then
        print_error "--baseline-all-if-missing and --baseline-through are mutually exclusive"
        exit 1
    fi
    if [ "$BASELINE_ALL_IF_MISSING" = true ] && [ "$FORCE_BASELINE_ALL_IF_MISSING" != true ]; then
        print_error "--baseline-all-if-missing requires --force-baseline-all-if-missing"
        exit 1
    fi
    if [ -n "$BASELINE_THROUGH" ] && [ "$FORCE_BASELINE_THROUGH" != true ]; then
        print_error "--baseline-through requires --force-baseline-through"
        exit 1
    fi
    if [ "$STATUS_ONLY" = true ] && { [ "$DRY_RUN" = true ] || [ "$ADOPT_LEGACY_CHECKSUMS" = true ] || [ "$BASELINE_ALL_IF_MISSING" = true ] || [ -n "$BASELINE_THROUGH" ]; }; then
        print_error "--status cannot be combined with migration actions"
        exit 1
    fi
    if ! command -v python3 >/dev/null; then
        print_error "Python 3 is required to validate migration transaction boundaries"
        exit 1
    fi

    local sql_file
    sql_file=$(mktemp "${TMPDIR:-/tmp}/rent-migrations.XXXXXX")
    trap 'rm -f "$sql_file"' EXIT
    local builder_args=(--directory "$SCRIPT_DIR" --lock-timeout "${MIGRATIONS_LOCK_TIMEOUT_SECONDS:-30}")
    if [ "$DRY_RUN" = true ]; then builder_args+=(--dry-run); fi
    if [ "$STATUS_ONLY" = true ]; then builder_args+=(--status); fi
    if [ "$BASELINE_ALL_IF_MISSING" = true ]; then builder_args+=(--baseline-all); fi
    if [ -n "$BASELINE_THROUGH" ]; then builder_args+=(--baseline-through "$BASELINE_THROUGH"); fi
    if [ "$ADOPT_LEGACY_CHECKSUMS" = true ]; then builder_args+=(--adopt-legacy-checksums); fi
    python3 "$SCRIPT_DIR/build-runner.py" "${builder_args[@]}" > "$sql_file"

    print_header
    determine_exec_method
    check_connection
    if "${EXEC_CMD[@]}" < "$sql_file"; then
        print_success "Migration verification completed successfully"
    else
        print_error "Migration execution or verification failed; pending work was not marked as applied"
        exit 1
    fi
    rm -f "$sql_file"
    trap - EXIT
}

main "$@"
