# =============================================================================
# Makefile - Plataforma de Administración de Alquileres
# =============================================================================
# Comandos útiles para desarrollo local con Docker Compose
# =============================================================================

.PHONY: help up down restart ps logs logs-follow clean clean-volumes healthcheck db-reset db-shell redis-shell rabbitmq-shell tools stop-tools

# Variables
COMPOSE_FILE := docker-compose.yml
COMPOSE := docker compose -f $(COMPOSE_FILE)

# Colores para output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

# =============================================================================
# AYUDA
# =============================================================================

help: ## Mostrar esta ayuda
	@echo ""
	@echo "$(BLUE)=========================================$(NC)"
	@echo "$(BLUE)  Comandos Disponibles$(NC)"
	@echo "$(BLUE)=========================================$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# =============================================================================
# GESTIÓN DE SERVICIOS
# =============================================================================

up: ## Iniciar todos los servicios
	@echo "$(BLUE)Iniciando servicios...$(NC)"
	@$(COMPOSE) up -d
	@echo "$(GREEN)✓ Servicios iniciados$(NC)"
	@echo "$(YELLOW)Ejecuta 'make healthcheck' para verificar el estado$(NC)"

down: ## Detener todos los servicios
	@echo "$(BLUE)Deteniendo servicios...$(NC)"
	@$(COMPOSE) down
	@echo "$(GREEN)✓ Servicios detenidos$(NC)"

restart: ## Reiniciar todos los servicios
	@echo "$(BLUE)Reiniciando servicios...$(NC)"
	@$(COMPOSE) restart
	@echo "$(GREEN)✓ Servicios reiniciados$(NC)"

stop: ## Detener servicios sin eliminar contenedores
	@echo "$(BLUE)Deteniendo servicios...$(NC)"
	@$(COMPOSE) stop
	@echo "$(GREEN)✓ Servicios detenidos$(NC)"

start: ## Iniciar servicios existentes
	@echo "$(BLUE)Iniciando servicios existentes...$(NC)"
	@$(COMPOSE) start
	@echo "$(GREEN)✓ Servicios iniciados$(NC)"

# =============================================================================
# HERRAMIENTAS OPCIONALES
# =============================================================================

tools: ## Iniciar herramientas opcionales (pgAdmin)
	@echo "$(BLUE)Iniciando herramientas...$(NC)"
	@$(COMPOSE) --profile tools up -d
	@echo "$(GREEN)✓ Herramientas iniciadas$(NC)"
	@echo "$(YELLOW)pgAdmin disponible en: http://localhost:5050$(NC)"

stop-tools: ## Detener herramientas opcionales
	@echo "$(BLUE)Deteniendo herramientas...$(NC)"
	@$(COMPOSE) --profile tools down
	@echo "$(GREEN)✓ Herramientas detenidas$(NC)"

# =============================================================================
# MONITOREO Y LOGS
# =============================================================================

ps: ## Listar contenedores y su estado
	@$(COMPOSE) ps

logs: ## Ver logs de todos los servicios
	@$(COMPOSE) logs --tail=100

logs-follow: ## Seguir logs en tiempo real
	@$(COMPOSE) logs -f

logs-postgres: ## Ver logs de PostgreSQL
	@$(COMPOSE) logs --tail=100 postgres

logs-redis: ## Ver logs de Redis
	@$(COMPOSE) logs --tail=100 redis

logs-rabbitmq: ## Ver logs de RabbitMQ
	@$(COMPOSE) logs --tail=100 rabbitmq

healthcheck: ## Verificar estado de todos los servicios
	@chmod +x scripts/healthcheck.sh
	@./scripts/healthcheck.sh

# =============================================================================
# LIMPIEZA
# =============================================================================

clean: down ## Detener servicios y limpiar contenedores
	@echo "$(BLUE)Limpiando contenedores...$(NC)"
	@$(COMPOSE) rm -f
	@echo "$(GREEN)✓ Contenedores eliminados$(NC)"

clean-volumes: ## Eliminar volúmenes (ADVERTENCIA: elimina datos persistentes)
	@echo "$(YELLOW)⚠ ADVERTENCIA: Esto eliminará todos los datos persistentes$(NC)"
	@read -p "¿Continuar? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		echo "$(BLUE)Eliminando volúmenes...$(NC)"; \
		$(COMPOSE) down -v; \
		echo "$(GREEN)✓ Volúmenes eliminados$(NC)"; \
	else \
		echo "$(YELLOW)Operación cancelada$(NC)"; \
	fi

clean-all: clean clean-volumes ## Limpieza completa (servicios + volúmenes)

# =============================================================================
# BASE DE DATOS
# =============================================================================

db-reset: ## Resetear base de datos (elimina y recrea)
	@chmod +x scripts/reset-db.sh
	@./scripts/reset-db.sh

db-reset-force: ## Resetear base de datos sin confirmación
	@chmod +x scripts/reset-db.sh
	@./scripts/reset-db.sh --force

db-shell: ## Abrir shell de PostgreSQL
	@docker exec -it rent-postgres psql -U rent_user -d rent_dev

db-backup: ## Crear backup de la base de datos
	@echo "$(BLUE)Creando backup...$(NC)"
	@mkdir -p backups
	@docker exec rent-postgres pg_dump -U rent_user -d rent_dev > backups/backup_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "$(GREEN)✓ Backup creado en backups/$(NC)"

db-restore: ## Restaurar último backup (requiere archivo)
	@echo "$(BLUE)Restaurando último backup...$(NC)"
	@if [ -z "$(FILE)" ]; then \
		echo "$(YELLOW)Uso: make db-restore FILE=backups/backup_XXXXXX.sql$(NC)"; \
	else \
		docker exec -i rent-postgres psql -U rent_user -d rent_dev < $(FILE); \
		echo "$(GREEN)✓ Backup restaurado$(NC)"; \
	fi

db-migrate: ## Ejecutar migraciones de base de datos
	@echo "$(BLUE)Ejecutando migraciones...$(NC)"
	@chmod +x migrations/run-migrations.sh
	@./migrations/run-migrations.sh

db-migrate-status: ## Ver estado de migraciones
	@chmod +x migrations/run-migrations.sh
	@./migrations/run-migrations.sh --status

db-migrate-dry-run: ## Ver qué migraciones se ejecutarían sin ejecutarlas
	@chmod +x migrations/run-migrations.sh
	@./migrations/run-migrations.sh --dry-run

# =============================================================================
# REDIS
# =============================================================================

redis-shell: ## Abrir shell de Redis
	@docker exec -it rent-redis redis-cli -a rent_redis_password

redis-flush: ## Limpiar todas las claves de Redis
	@echo "$(YELLOW)⚠ Limpiando Redis...$(NC)"
	@docker exec -it rent-redis redis-cli -a rent_redis_password FLUSHALL
	@echo "$(GREEN)✓ Redis limpiado$(NC)"

# =============================================================================
# RABBITMQ
# =============================================================================

rabbitmq-shell: ## Abrir shell de RabbitMQ
	@docker exec -it rent-rabbitmq rabbitmqctl status

rabbitmq-ui: ## Abrir RabbitMQ Management UI en el navegador
	@echo "$(BLUE)Abriendo RabbitMQ Management UI...$(NC)"
	@echo "$(YELLOW)URL: http://localhost:15672$(NC)"
	@echo "$(YELLOW)Usuario: rent_user$(NC)"
	@echo "$(YELLOW)Password: rent_rabbitmq_password$(NC)"
	@xdg-open http://localhost:15672 2>/dev/null || open http://localhost:15672 2>/dev/null || echo "$(YELLOW)Abre manualmente: http://localhost:15672$(NC)"

# =============================================================================
# SETUP INICIAL
# =============================================================================

setup: ## Setup inicial del proyecto (primera vez)
	@echo "$(BLUE)=========================================$(NC)"
	@echo "$(BLUE)  Setup Inicial - Proyecto Rent$(NC)"
	@echo "$(BLUE)=========================================$(NC)"
	@echo ""
	@if [ ! -f .env ]; then \
		echo "$(BLUE)Creando archivo .env desde .env.example...$(NC)"; \
		cp .env.example .env; \
		echo "$(GREEN)✓ Archivo .env creado$(NC)"; \
		echo "$(YELLOW)⚠ Revisa y ajusta las variables en .env según sea necesario$(NC)"; \
	else \
		echo "$(YELLOW)⚠ Archivo .env ya existe, saltando...$(NC)"; \
	fi
	@echo ""
	@echo "$(BLUE)Iniciando servicios...$(NC)"
	@$(MAKE) up
	@echo ""
	@echo "$(BLUE)Esperando que los servicios estén listos...$(NC)"
	@sleep 10
	@echo ""
	@$(MAKE) healthcheck
	@echo ""
	@echo "$(BLUE)=========================================$(NC)"
	@echo "$(GREEN)✓ Setup completado$(NC)"
	@echo "$(BLUE)=========================================$(NC)"
	@echo ""
	@echo "$(YELLOW)Siguiente paso: Configura tu aplicación para conectarse a los servicios$(NC)"
	@echo ""

# =============================================================================
# INFORMACIÓN
# =============================================================================

info: ## Mostrar información de conexión a servicios
	@echo ""
	@echo "$(BLUE)=========================================$(NC)"
	@echo "$(BLUE)  Información de Servicios$(NC)"
	@echo "$(BLUE)=========================================$(NC)"
	@echo ""
	@echo "$(GREEN)PostgreSQL:$(NC)"
	@echo "  Host:     localhost"
	@echo "  Port:     5432"
	@echo "  Database: rent_dev"
	@echo "  User:     rent_user"
	@echo "  Password: rent_dev_password"
	@echo "  URL:      postgresql://rent_user:rent_dev_password@localhost:5432/rent_dev"
	@echo ""
	@echo "$(GREEN)Redis:$(NC)"
	@echo "  Host:     localhost"
	@echo "  Port:     6379"
	@echo "  Password: rent_redis_password"
	@echo "  URL:      redis://:rent_redis_password@localhost:6379"
	@echo ""
	@echo "$(GREEN)RabbitMQ:$(NC)"
	@echo "  Host:     localhost"
	@echo "  Port:     5672"
	@echo "  Management: http://localhost:15672"
	@echo "  User:     rent_user"
	@echo "  Password: rent_rabbitmq_password"
	@echo "  VHost:    rent_vhost"
	@echo "  URL:      amqp://rent_user:rent_rabbitmq_password@localhost:5672/rent_vhost"
	@echo ""
	@echo "$(GREEN)pgAdmin (opcional):$(NC)"
	@echo "  URL:      http://localhost:5050"
	@echo "  Email:    admin@rent.local"
	@echo "  Password: admin"
	@echo ""
	@echo "$(BLUE)=========================================$(NC)"
	@echo ""

# Default
.DEFAULT_GOAL := help
