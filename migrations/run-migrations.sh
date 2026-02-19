#!/bin/bash

# =============================================================================
# MIGRATION RUNNER - Execute PostgreSQL Migrations
# =============================================================================
# This script runs all SQL migration files in sequence
# Usage: ./run-migrations.sh [--dry-run]
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
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Valores por defecto
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-rent_user}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-rent_password}
POSTGRES_DB=${POSTGRES_DB:-rent_db}

DRY_RUN=false

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
EXEC_CMD=""
CONTAINER_NAME="rent-postgres"

determine_exec_method() {
    if command -v psql &> /dev/null; then
        EXEC_CMD="psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB"
        print_info "Using local psql client"
    elif command -v docker &> /dev/null && docker ps | grep -q "$CONTAINER_NAME"; then
        EXEC_CMD="docker exec -i $CONTAINER_NAME psql -U $POSTGRES_USER -d $POSTGRES_DB"
        print_info "Using Docker container ($CONTAINER_NAME)"
    else
        print_error "Neither 'psql' nor running Docker container '$CONTAINER_NAME' found."
        exit 1
    fi
}

check_connection() {
    print_info "Checking database connection..."
    
    if ! echo "SELECT 1;" | $EXEC_CMD &> /dev/null; then
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
    
    echo "CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);" | $EXEC_CMD &> /dev/null
    
    print_success "Migration tracking table ready"
}

get_executed_migrations() {
    echo "SELECT migration_name FROM schema_migrations ORDER BY migration_name;" | $EXEC_CMD -t | tr -d ' \r'
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
    if cat "$migration_file" | $EXEC_CMD &> /dev/null; then
        
        # Record migration
        echo "INSERT INTO schema_migrations (migration_name) VALUES ('$migration_name') ON CONFLICT (migration_name) DO NOTHING;" | $EXEC_CMD &> /dev/null
        
        print_success "Migration completed: $migration_name"
    else
        print_error "Migration failed: $migration_name"
        # Try to get error output
        cat "$migration_file" | $EXEC_CMD
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
    
    echo "SELECT 
            migration_name,
            executed_at,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - executed_at)) / 3600 as hours_ago
        FROM schema_migrations 
        ORDER BY executed_at DESC;" | $EXEC_CMD 2>/dev/null || print_warning "No migrations executed yet"
    
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
    create_migration_table
    
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
