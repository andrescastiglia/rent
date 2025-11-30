-- =============================================================================
-- SCRIPT DE INICIALIZACIÓN DE BASE DE DATOS
-- Plataforma de Administración de Alquileres
-- =============================================================================
-- Este script se ejecuta automáticamente al crear el contenedor de PostgreSQL
-- Configura extensiones, schemas y roles básicos necesarios
-- =============================================================================

-- Configurar localización y encoding
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

\echo '========================================='
\echo 'Iniciando configuración de base de datos'
\echo '========================================='

-- =============================================================================
-- EXTENSIONES
-- =============================================================================
\echo 'Instalando extensiones...'

-- UUID para generación de identificadores únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Funciones criptográficas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Funciones de texto completo (full-text search)
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- PostGIS para funcionalidades geoespaciales (ubicación de propiedades)
-- Comentar si no se requiere funcionalidad de mapas
CREATE EXTENSION IF NOT EXISTS "postgis";

\echo '✓ Extensiones instaladas correctamente'

-- =============================================================================
-- SCHEMAS
-- =============================================================================
\echo 'Creando schemas...'

-- Schema para auditoría
CREATE SCHEMA IF NOT EXISTS audit;

-- Schema para funciones y procedimientos almacenados
CREATE SCHEMA IF NOT EXISTS functions;

\echo '✓ Schemas creados correctamente'

-- =============================================================================
-- FUNCIONES AUXILIARES
-- =============================================================================
\echo 'Creando funciones auxiliares...'

-- Función para actualizar timestamp automáticamente
CREATE OR REPLACE FUNCTION functions.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Función para generar slug a partir de texto
CREATE OR REPLACE FUNCTION functions.generate_slug(text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN lower(
        regexp_replace(
            regexp_replace(
                unaccent(text),
                '[^a-zA-Z0-9\s-]', '', 'g'
            ),
            '\s+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

\echo '✓ Funciones auxiliares creadas correctamente'

-- =============================================================================
-- TABLAS DE AUDITORÍA
-- =============================================================================
\echo 'Creando tablas de auditoría...'

-- Tabla para registro de cambios (audit log)
CREATE TABLE IF NOT EXISTS audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Índices para búsquedas rápidas
    CONSTRAINT audit_logs_action_check CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record 
    ON audit.logs(table_name, record_id);
    
CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
    ON audit.logs(user_id);
    
CREATE INDEX IF NOT EXISTS idx_audit_logs_created 
    ON audit.logs(created_at DESC);

\echo '✓ Tablas de auditoría creadas correctamente'

-- =============================================================================
-- CONFIGURACIONES ADICIONALES
-- =============================================================================
\echo 'Aplicando configuraciones adicionales...'

-- Configurar timezone por defecto
SET TIME ZONE 'America/Argentina/Buenos_Aires';

-- Habilitar parallel query para mejor performance
ALTER DATABASE rent_dev SET max_parallel_workers_per_gather = 4;

\echo '✓ Configuraciones aplicadas correctamente'

-- =============================================================================
-- INFORMACIÓN FINAL
-- =============================================================================
\echo ''
\echo '========================================='
\echo '✓ Base de datos inicializada exitosamente'
\echo '========================================='
\echo ''
\echo 'Extensiones instaladas:'
\echo '  - uuid-ossp (UUIDs)'
\echo '  - pgcrypto (Criptografía)'
\echo '  - unaccent (Búsqueda de texto)'
\echo '  - postgis (Geolocalización)'
\echo ''
\echo 'Schemas creados:'
\echo '  - audit (Auditoría)'
\echo '  - functions (Funciones auxiliares)'
\echo ''
\echo 'Siguiente paso: Ejecutar migraciones de la aplicación'
\echo '========================================='
