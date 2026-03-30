#!/bin/bash

# =============================================================================
# MIGRATION RUNNER - Execute PostgreSQL Migrations
# =============================================================================
# This script runs all SQL migration files in sequence
# Usage: ./run-migrations.sh [--dry-run] [--baseline-all-if-missing --force-baseline-all-if-missing] [--status]
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
    local env_file="$PROJECT_ROOT/.env"

    if [ ! -f "$env_file" ]; then
        return 0
    fi

    set -a
    # shellcheck disable=SC1090
    if ! . "$env_file"; then
        set +a
        echo "Failed to load environment file: $env_file" >&2
        exit 1
    fi
    set +a
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
CONTAINER_NAME="rent-postgres"

run_query() {
    local sql="$1"
    shift

    printf '%s\n' "$sql" | "${EXEC_CMD[@]}" "$@"
}

determine_exec_method() {
    if command -v psql &> /dev/null; then
        EXEC_CMD=(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB")
        print_info "Using local psql client"
    elif command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
        EXEC_CMD=(docker exec -i -e "PGPASSWORD=$PGPASSWORD" "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB")
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

create_migration_table() {
    print_info "Checking migrations tracking table..."
    
    run_query "CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);" &> /dev/null
    
    print_success "Migration tracking table ready"
}

migration_table_exists() {
    run_query "SELECT to_regclass('public.schema_migrations') IS NOT NULL;" -t | tr -d ' \r'
}

database_has_existing_schema() {
    run_query "SELECT COUNT(*) > 0 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('companies', 'users');" -t | tr -d ' \r'
}

baseline_all_migrations() {
    local baseline_count=0

    echo ""
    print_warning "schema_migrations was missing on an initialized database"
    print_info "Baselining current migration files as already executed"

    for migration_file in $(ls -1 "$SCRIPT_DIR"/*.sql 2>/dev/null | sort -V); do
        local migration_name=$(basename "$migration_file")
        run_query "INSERT INTO schema_migrations (migration_name) VALUES ('$migration_name') ON CONFLICT (migration_name) DO NOTHING;" &> /dev/null
        ((baseline_count++))
    done

    print_success "Baselined $baseline_count migration(s)"
}

get_executed_migrations() {
    run_query "SELECT migration_name FROM schema_migrations ORDER BY migration_name;" -t | tr -d ' \r'
}

handle_missing_migration_table() {
    local has_existing_schema="$1"

    if [ "$has_existing_schema" != "t" ]; then
        return 0
    fi

    echo ""
    print_warning "Detected an initialized database without schema_migrations"

    if [ "$BASELINE_ALL_IF_MISSING" != true ]; then
        print_error "Refusing to auto-baseline because pending migrations cannot be verified safely"
        print_info "Recover schema_migrations manually, or rerun with:"
        echo "  $0 --baseline-all-if-missing --force-baseline-all-if-missing"
        print_info "Use the force flag only after confirming every migration file has already been applied."
        exit 1
    fi

    if [ "$FORCE_BASELINE_ALL_IF_MISSING" != true ]; then
        print_error "--baseline-all-if-missing requires --force-baseline-all-if-missing on initialized databases"
        print_info "This prevents silently marking unapplied migrations as executed."
        exit 1
    fi
}

run_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file")
    
    echo ""
    print_info "Running migration: $migration_name"
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN - Would execute: $migration_file"
        cat "$migration_file"
        return 0
    fi
    
    # Execute migration
    # We pipe the file content to the execution command
    if "${EXEC_CMD[@]}" < "$migration_file" &> /dev/null; then
        
        # Record migration
        run_query "INSERT INTO schema_migrations (migration_name) VALUES ('$migration_name') ON CONFLICT (migration_name) DO NOTHING;" &> /dev/null
        
        print_success "Migration completed: $migration_name"
    else
        print_error "Migration failed: $migration_name"
        # Try to get error output
        "${EXEC_CMD[@]}" < "$migration_file"
        exit 1
    fi
}

run_all_migrations() {
    local executed_migrations=$(get_executed_migrations)
    local migration_count=0
    local skipped_count=0
    
    # Get all .sql files sorted numerically
    for migration_file in $(ls -1 "$SCRIPT_DIR"/*.sql 2>/dev/null | sort -V); do
        local migration_name=$(basename "$migration_file")
        
        # Skip if already executed
        if echo "$executed_migrations" | grep -q "^$migration_name$"; then
            ((skipped_count++))
            print_warning "Skipping (already executed): $migration_name"
            continue
        fi
        
        # Run migration
        run_migration "$migration_file"
        ((migration_count++))
    done
    
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    
    if [ $migration_count -eq 0 ]; then
        print_info "No new migrations to run"
    else
        print_success "Successfully ran $migration_count migration(s)"
    fi
    
    if [ $skipped_count -gt 0 ]; then
        print_info "Skipped $skipped_count already executed migration(s)"
    fi
    
    echo -e "${BLUE}=========================================${NC}"
    echo ""
}

show_migration_status() {
    echo ""
    print_info "Migration Status:"
    echo ""
    
    run_query "SELECT 
            migration_name,
            executed_at,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - executed_at)) / 3600 as hours_ago
        FROM schema_migrations 
        ORDER BY executed_at DESC;" 2>/dev/null || print_warning "No migrations executed yet"
    
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --baseline-all-if-missing)
                BASELINE_ALL_IF_MISSING=true
                shift
                ;;
            --force-baseline-all-if-missing)
                FORCE_BASELINE_ALL_IF_MISSING=true
                shift
                ;;
            --status)
                determine_exec_method
                check_connection
                show_migration_status
                exit 0
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dry-run    Show what would be executed without running"
                echo "  --baseline-all-if-missing"
                echo "               Prepare to baseline current migration files when"
                echo "               schema_migrations is missing on an initialized DB"
                echo "  --force-baseline-all-if-missing"
                echo "               Required together with --baseline-all-if-missing"
                echo "               after manually verifying the schema is up to date"
                echo "  --status     Show migration execution history"
                echo "  --help       Show this help message"
                echo ""
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    print_header
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "Running in DRY RUN mode - no changes will be made"
        echo ""
    fi
    
    determine_exec_method
    check_connection

    local had_migration_table
    local has_existing_schema="f"
    had_migration_table=$(migration_table_exists)

    if [ "$had_migration_table" != "t" ]; then
        has_existing_schema=$(database_has_existing_schema)
        handle_missing_migration_table "$has_existing_schema"
    fi

    create_migration_table

    if [ "$had_migration_table" != "t" ] && [ "$has_existing_schema" = "t" ] && [ "$BASELINE_ALL_IF_MISSING" = true ] && [ "$FORCE_BASELINE_ALL_IF_MISSING" = true ]; then
        baseline_all_migrations
    fi

    # Run migrations
    local executed_migrations=$(get_executed_migrations)
    local migration_count=0
    local skipped_count=0
    local failed=false
    
    # Get all .sql files sorted numerically
    for migration_file in $(ls -1 "$SCRIPT_DIR"/*.sql 2>/dev/null | sort -V); do
        local migration_name=$(basename "$migration_file")
        
        # Skip if already executed
        if echo "$executed_migrations" | grep -q "^$migration_name$"; then
            ((skipped_count++))
            print_warning "Skipping (already executed): $migration_name"
            continue
        fi
        
        # Run migration
        if run_migration "$migration_file"; then
            ((migration_count++))
        else
            failed=true
            break
        fi
    done
    
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    
    if [ $migration_count -eq 0 ]; then
        print_info "No new migrations to run"
    else
        print_success "Successfully ran $migration_count migration(s)"
    fi
    
    if [ $skipped_count -gt 0 ]; then
        print_info "Skipped $skipped_count already executed migration(s)"
    fi
    
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    
    if [ "$failed" = true ]; then
        print_error "Migration process failed!"
        exit 1
    fi
    
    if [ "$DRY_RUN" = false ]; then
        show_migration_status
    fi
    
    print_success "Migrations completed successfully!"
    echo ""
}

# Execute
main "$@"
