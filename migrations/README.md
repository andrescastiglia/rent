# Database Migrations

Este directorio contiene las migraciones de base de datos para el Sistema de Gestión Inmobiliaria.

## 📋 Tabla de Contenidos

- [Estructura](#estructura)
- [Convenciones](#convenciones)
- [Ejecución de Migraciones](#ejecución-de-migraciones)
- [Orden de Ejecución](#orden-de-ejecución)
- [Crear Nueva Migración](#crear-nueva-migración)
- [Troublesh](#troubleshooting)

---

## Estructura

```
migrations/
├── 001_create_companies.sql      # Tabla de empresas/organizaciones
├── 002_create_users.sql           # Tabla base de usuarios
├── 003_create_owners.sql          # Propietarios (extiende users)
├── 004_create_tenants.sql         # Inquilinos (extiende users)
├── 005_create_staff.sql           # Personal de mantenimiento (extiende users)
├── 006_create_admins.sql          # Administradores (extiende users)
├── 007_seed_initial_data.sql      # Datos iniciales para desarrollo
├── run-migrations.sh              # Script para ejecutar migraciones
└── README.md                      # Esta documentación
```

---

## Convenciones

### Nomenclatura de Archivos

**Formato**: `{número}_{descripción}.sql`

- **Número**: 3 dígitos con ceros a la izquierda (001, 002, etc.)
- **Descripción**: snake_case descriptivo
- **Extensión**: `.sql`

**Ejemplos**:
- `001_create_companies.sql`
- `025_add_property_features.sql`
- `100_create_payment_methods.sql`

### Estructura de una Migración

Cada archivo de migración debe seguir esta estructura:

```sql
-- =============================================================================
-- Migration: {número}_{descripción}.sql
-- Description: {Descripción detallada}
-- =============================================================================

-- Create ENUM types (si aplica)
CREATE TYPE {type_name} AS ENUM (...);

-- Create table
CREATE TABLE {table_name} (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- campos...
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_{table}_{column} ON {table}({column});

-- Add comments
COMMENT ON TABLE {table} IS '{descripción}';
COMMENT ON COLUMN {table}.{column} IS '{descripción}';

-- Create triggers
CREATE TRIGGER update_{table}_updated_at
    BEFORE UPDATE ON {table}
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();
```

---

## Ejecución de Migraciones

### Método 1: Script Automático (Recomendado)

```bash
# Ejecutar todas las migraciones pendientes
cd migrations
chmod +x run-migrations.sh
./run-migrations.sh
```

### Método 2: Makefile

Desde la raíz del proyecto:

```bash
# Ejecutar migraciones
make db-migrate

# Ver estado de migraciones
make db-migrate-status
```

### Método 3: Manual

```bash
# Conectarse a la base de datos
psql -h localhost -p 5432 -U rent_user -d rent_dev

# Ejecutar migración individual
\i migrations/001_create_companies.sql
```

---

## Orden de Ejecución

Las migraciones se ejecutan en orden numérico ascendente:

### Fase 0: Preparación (realizada en `init-db.sql`)
- Extensiones PostgreSQL (uuid-ossp, pgcrypto, etc.)
- Schemas (audit, functions)
- Funciones auxiliares

### Fase 1: Core Business (Módulo de Autenticación)

**001 - Companies**
- Tabla de empresas/organizaciones
- ENUM `plan_type`

**002 - Users**
- Tabla base de usuarios
- ENUM `user_role`
- Triggers de seguridad

**003 - Owners**
- Extensión de users para propietarios
- Validación de rol

**004 - Tenants**
- Extensión de users para inquilinos
- ENUM `employment_status`
- Validación de rol

**005 - Staff**
- Extensión de users para personal
- ENUM `staff_specialization`
- Validación de rol

**006 - Admins**
- Extensión de users para administradores
- Permisos JSONB
- Validación de rol

**007 - Seed Data**
- Datos iniciales para desarrollo
- Super admin
- Usuarios de ejemplo

### Fase 2: Propiedades (Futuro)
- 010-019: Properties, Units, Features, Documents

### Fase 3: Contratos (Futuro)
- 020-029: Leases, Amendments

### Fase 4: Financiero (Futuro)
- 030-039: Payments, Invoices

### Fase 5: Mantenimiento (Futuro)
- 040-049: Maintenance Tickets

### Fase 6: CRM y Sistema (Futuro)
- 050-059: Leads, Reports, Notifications
---

## Crear Nueva Migración

### 1. Determinar el Número

Buscar el último número existente y sumar 1:

```bash
ls -1 migrations/*.sql | tail -1
# Output: migrations/007_seed_initial_data.sql
# Próximo número: 008
```

### 2. Crear el Archivo

```bash
touch migrations/008_add_new_feature.sql
```

### 3. Escribir la Migración

**Template básico**:

```sql
-- =============================================================================
-- Migration: 008_add_new_feature.sql
-- Description: Add new feature to the system
-- =============================================================================

-- Tu código SQL aquí
CREATE TABLE ...

-- Comentarios
COMMENT ON TABLE ...

-- Triggers
CREATE TRIGGER ...
```

### 4. Probar la Migración

```bash
# Dry run para ver qué haría
./run-migrations.sh --dry-run

# Ejecutar en desarrollo
./run-migrations.sh
```

### 5. Verificar Resultados

```bash
# Ver tablas creadas
psql -h localhost -U rent_user -d rent_dev -c "\dt"

# Ver constraints
psql -h localhost -U rent_user -d rent_dev -c "\d {table_name}"
```

---

## Tracking de Migraciones

El sistema usa una tabla `schema_migrations` para rastrear qué migraciones se han ejecutado:

```sql
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Ver estado**:

```bash
./run-migrations.sh --status
```

O directamente en SQL:

```sql
SELECT * FROM schema_migrations ORDER BY executed_at DESC;
```

---

## Troubleshooting

### Error: "migration already exists"

La migración ya fue ejecutada. El sistema previene re-ejecuciones automáticas.

**Solución**:
```sql
-- Eliminar registro de tracking (solo en desarrollo)
DELETE FROM schema_migrations WHERE migration_name = '001_create_companies.sql';

-- Volver a ejecutar
./run-migrations.sh
```

### Error: "Cannot connect to database"

**Solución**:
```bash
# Verificar que Docker está corriendo
make ps

# Iniciar servicios si están detenidos
make up

# Verificar healthcheck
make healthcheck
```

### Error en una Migración

Si una migración falla:

1. El script se detiene automáticamente
2. No se registra la migración en `schema_migrations`
3. Los cambios parciales pueden quedar en la BD

**Solución**:
```bash
# Opción 1: Resetear base de datos (desarrollo)
make db-reset

# Opción 2: Corregir el SQL y volver a ejecutar
vim migrations/XXX_problematic.sql
./run-migrations.sh
```

### Dependencias Entre Migraciones

Las migraciones deben ejecutarse en orden. Si una migración requiere que otra exista:

1. Verificar que el número de secuencia es correcto
2. Asegurarse que la migración dependiente tiene un número menor

---

## Best Practices

### ✅ DO

- **Usar transacciones implícitas**: PostgreSQL envuelve cada script en transacción
- **Agregar comentarios descriptivos** en tablas y columnas
- **Crear índices** para columnas frecuentemente consultadas
- **Validar constraints** para integridad de datos
- **Usar soft deletes** (`deleted_at`) en lugar de DELETE físico
- **Documentar cambios complejos** en comentarios SQL

### ❌ DON'T

- **No modificar migraciones ejecutadas**: Crear nueva migración para cambios
- **No usar DROP TABLE** en producción sin backup
- **No hardcodear valores sensibles**: Usar variables de entorno
- **No omitir validaciones**: Siempre agregar constraints apropiados
- **No olvidar índices**: Performance crítica

---

## Ejemplos

### Agregar Nueva columna

```sql
-- Migration: 015_add_user_preferences.sql
ALTER TABLE users 
ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;

CREATE INDEX idx_users_preferences ON users USING GIN (preferences);

COMMENT ON COLUMN users.preferences IS 'User preferences and settings';
```

### Crear Relación

```sql
-- Migration: 020_add_properties_company_fk.sql
ALTER TABLE properties
ADD COLUMN company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT;

CREATE INDEX idx_properties_company_id ON properties(company_id);
```

### Migración de Datos

```sql
-- Migration: 025_migrate_old_status_values.sql
UPDATE properties 
SET status = 'available' 
WHERE status = 'vacant';

UPDATE properties 
SET status = 'occupied' 
WHERE status = 'rented';
```

---

## Referencias

- [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html)
- [PostgreSQL Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL Triggers](https://www.postgresql.org/docs/current/trigger-definition.html)

---

**Última actualización**: 2025-11-30  
**Versión**: 1.0
