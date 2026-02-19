#!/bin/bash

# =============================================================================
# RESET DATABASE - Resetear Base de Datos de Desarrollo
# =============================================================================
# Script para eliminar y recrear la base de datos de desarrollo.
# ADVERTENCIA: Este script ELIMINARÁ todos los datos de la base de datos.
# Solo debe usarse en ambiente de desarrollo local.
# =============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Cargar variables de entorno si existe .env
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Valores por defecto
POSTGRES_HOST=${POSTGRES_HOST:-localhost}
POSTGRES_PORT=${POSTGRES_PORT:-5432}
POSTGRES_USER=${POSTGRES_USER:-rent_user}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-rent_password}
POSTGRES_DB=${POSTGRES_DB:-rent_db}

CONTAINER_NAME="rent-postgres"

# =============================================================================
# FUNCIONES AUXILIARES
# =============================================================================

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

confirm_reset() {
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}  ADVERTENCIA: OPERACIÓN DESTRUCTIVA${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo -e "${YELLOW}Esta operación eliminará TODOS los datos de la base de datos:${NC}"
    echo -e "  Base de datos: ${BLUE}$POSTGRES_DB${NC}"
    echo -e "  Host: ${BLUE}$POSTGRES_HOST:$POSTGRES_PORT${NC}"
    echo ""
    
    if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
        print_warning "Modo forzado activado, omitiendo confirmación..."
        return 0
    fi
    
    read -p "¿Estás seguro que deseas continuar? (escribe 'SI' para confirmar): " confirmation
    
    if [ "$confirmation" != "SI" ]; then
        echo ""
        print_info "Operación cancelada"
        exit 0
    fi
    
    echo ""
}

# =============================================================================
# FUNCIONES PRINCIPALES
# =============================================================================

check_prerequisites() {
    print_info "Verificando prerrequisitos..."
    
    # Verificar que Docker está corriendo
    if ! docker ps &> /dev/null; then
        print_error "Docker no está corriendo"
        exit 1
    fi
    
    # Verificar que el contenedor existe
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_error "Contenedor $CONTAINER_NAME no existe"
        print_info "Ejecuta 'make up' primero para crear los contenedores"
        exit 1
    fi
    
    print_success "Prerrequisitos verificados"
}

drop_database() {
    print_info "Eliminando base de datos existente..."
    
    # Ejecutar DROP DATABASE dentro del contenedor
    docker exec -it "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" 2>/dev/null || {
        print_warning "No se pudo eliminar la base de datos (puede que no exista)"
    }
    
    print_success "Base de datos eliminada"
}

create_database() {
    print_info "Creando base de datos nueva..."
    
    # Crear base de datos
    docker exec -it "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -c "CREATE DATABASE $POSTGRES_DB WITH ENCODING='UTF8' LC_COLLATE='es_ES.UTF-8' LC_CTYPE='es_ES.UTF-8';" 2>/dev/null
    
    print_success "Base de datos creada"
}

run_init_script() {
    print_info "Ejecutando script de inicialización..."
    
    # Ejecutar el script de inicialización
    if [ -f "$SCRIPT_DIR/init-db.sql" ]; then
        docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$SCRIPT_DIR/init-db.sql"
        print_success "Script de inicialización ejecutado"
    else
        print_warning "Script init-db.sql no encontrado, saltando..."
    fi
}

run_migrations() {
    print_info "Buscando migraciones..."
    
    # Verificar si existe un directorio de migraciones
    local migration_dirs=("$PROJECT_ROOT/migrations" "$PROJECT_ROOT/backend/migrations" "$PROJECT_ROOT/prisma/migrations")
    local found=false
    
    for dir in "${migration_dirs[@]}"; do
        if [ -d "$dir" ]; then
            print_info "Directorio de migraciones encontrado: $dir"
            print_warning "Ejecuta manualmente las migraciones de tu ORM (Prisma, TypeORM, etc.)"
            found=true
            break
        fi
    done
    
    if [ "$found" = false ]; then
        print_info "No se encontraron migraciones, esto es normal en un proyecto nuevo"
    fi
}

run_seeds() {
    print_info "Buscando seeds..."
    
    # Verificar si existe un script de seeds
    if [ -f "$SCRIPT_DIR/seeds.sql" ]; then
        print_info "Ejecutando seeds..."
        docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$SCRIPT_DIR/seeds.sql"
        print_success "Seeds ejecutados"
    else
        print_info "No se encontró archivo seeds.sql, saltando..."
    fi
}

verify_reset() {
    print_info "Verificando base de datos..."
    
    # Verificar que la base de datos existe y es accesible
    if docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" &> /dev/null; then
        print_success "Base de datos verificada correctamente"
    else
        print_error "Error al verificar la base de datos"
        exit 1
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Reset Database - Desarrollo Local${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    
    confirm_reset "$1"
    check_prerequisites
    
    echo ""
    print_info "Iniciando proceso de reset..."
    echo ""
    
    drop_database
    create_database
    run_init_script
    run_migrations
    run_seeds
    verify_reset
    
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${GREEN}✓ Base de datos reseteada exitosamente${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    print_info "Siguiente paso: Ejecutar migraciones de la aplicación"
    echo ""
}

# Ejecutar
main "$@"
