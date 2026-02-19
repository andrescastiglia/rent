#!/bin/bash

# =============================================================================
# HEALTHCHECK - Verificación de Servicios de Desarrollo Local
# =============================================================================
# Script para verificar que todos los servicios Docker estén funcionando
# correctamente y sean accesibles.
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

REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}

RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-5672}
RABBITMQ_MANAGEMENT_PORT=${RABBITMQ_MANAGEMENT_PORT:-15672}

# =============================================================================
# FUNCIONES AUXILIARES
# =============================================================================

print_header() {
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Healthcheck - Servicios Locales${NC}"
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

# =============================================================================
# VERIFICACIONES
# =============================================================================

check_docker() {
    echo -e "\n${YELLOW}[1/5]${NC} Verificando Docker..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker no está instalado"
        return 1
    fi
    
    if ! docker ps &> /dev/null; then
        print_error "Docker no está corriendo o no tienes permisos"
        return 1
    fi
    
    print_success "Docker está operativo"
    return 0
}

check_containers() {
    echo -e "\n${YELLOW}[2/5]${NC} Verificando contenedores..."
    
    local containers=("rent-postgres" "rent-redis" "rent-rabbitmq")
    local all_running=true
    
    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "running")
            if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
                print_success "Contenedor $container está corriendo"
            else
                print_warning "Contenedor $container está corriendo pero no healthy (status: $status)"
            fi
        else
            print_error "Contenedor $container no está corriendo"
            all_running=false
        fi
    done
    
    if [ "$all_running" = false ]; then
        print_info "Ejecuta 'make up' para iniciar los servicios"
        return 1
    fi
    
    return 0
}

check_postgres() {
    echo -e "\n${YELLOW}[3/5]${NC} Verificando PostgreSQL..."
    
    # Verificar si psql está disponible
    if ! command -v psql &> /dev/null; then
        print_warning "Cliente psql no instalado, verificando conexión básica..."
        
        # Verificación básica de puerto
        if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
            print_success "PostgreSQL responde en puerto $POSTGRES_PORT"
            return 0
        else
            print_error "PostgreSQL no responde en $POSTGRES_HOST:$POSTGRES_PORT"
            return 1
        fi
    fi
    
    # Verificación completa con psql
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" &> /dev/null; then
        print_success "PostgreSQL conectado exitosamente"
        
        # Verificar extensiones
        local extensions=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'unaccent');" 2>/dev/null | xargs)
        
        if [ "$extensions" -ge 3 ]; then
            print_success "Extensiones PostgreSQL instaladas correctamente"
        else
            print_warning "Algunas extensiones PostgreSQL pueden no estar instaladas"
        fi
        
        return 0
    else
        print_error "No se puede conectar a PostgreSQL"
        return 1
    fi
}

check_redis() {
    echo -e "\n${YELLOW}[4/5]${NC} Verificando Redis..."
    
    # Verificar si redis-cli está disponible
    if ! command -v redis-cli &> /dev/null; then
        print_warning "Cliente redis-cli no instalado, verificando conexión básica..."
        
        if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
            print_success "Redis responde en puerto $REDIS_PORT"
            return 0
        else
            print_error "Redis no responde en $REDIS_HOST:$REDIS_PORT"
            return 1
        fi
    fi
    
    # Verificación completa con redis-cli
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" PING 2>/dev/null | grep -q "PONG"; then
        print_success "Redis conectado exitosamente"
        return 0
    else
        print_error "No se puede conectar a Redis"
        return 1
    fi
}

check_rabbitmq() {
    echo -e "\n${YELLOW}[5/5]${NC} Verificando RabbitMQ..."
    
    # Verificar puerto AMQP
    if nc -z "$RABBITMQ_HOST" "$RABBITMQ_PORT" 2>/dev/null; then
        print_success "RabbitMQ AMQP responde en puerto $RABBITMQ_PORT"
    else
        print_error "RabbitMQ AMQP no responde en $RABBITMQ_HOST:$RABBITMQ_PORT"
        return 1
    fi
    
    # Verificar Management UI
    if nc -z "$RABBITMQ_HOST" "$RABBITMQ_MANAGEMENT_PORT" 2>/dev/null; then
        print_success "RabbitMQ Management UI disponible en http://$RABBITMQ_HOST:$RABBITMQ_MANAGEMENT_PORT"
    else
        print_warning "RabbitMQ Management UI no responde en puerto $RABBITMQ_MANAGEMENT_PORT"
    fi
    
    return 0
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    print_header
    
    local exit_code=0
    
    check_docker || exit_code=1
    check_containers || exit_code=1
    check_postgres || exit_code=1
    check_redis || exit_code=1
    check_rabbitmq || exit_code=1
    
    echo ""
    echo -e "${BLUE}=========================================${NC}"
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ Todos los servicios están operativos${NC}"
    else
        echo -e "${RED}✗ Algunos servicios tienen problemas${NC}"
        echo -e "${YELLOW}Ejecuta 'make logs' para ver más detalles${NC}"
    fi
    
    echo -e "${BLUE}=========================================${NC}"
    echo ""
    
    exit $exit_code
}

# Ejecutar
main "$@"
