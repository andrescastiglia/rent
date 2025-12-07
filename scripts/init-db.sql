-- =============================================================================
-- RentFlow Database Schema - Complete Initialization Script
-- =============================================================================
-- Este script inicializa completamente la base de datos PostgreSQL:
-- 1. Extensiones y configuración del servidor
-- 2. Schemas auxiliares (audit, functions)
-- 3. Funciones helper
-- 4. Tipos ENUM
-- 5. Tablas del sistema (en orden de dependencia)
-- 6. Datos semilla
-- =============================================================================

-- Configurar localización y encoding
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

\echo '========================================='
\echo 'RentFlow - Inicialización de Base de Datos'
\echo '========================================='

-- =============================================================================
-- SECTION 1: EXTENSIONS
-- =============================================================================
\echo 'Instalando extensiones...'

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";
-- PostGIS para funcionalidades geoespaciales (comentar si no se requiere)
CREATE EXTENSION IF NOT EXISTS "postgis";

\echo '✓ Extensiones instaladas'

-- =============================================================================
-- SECTION 2: SCHEMAS
-- =============================================================================
\echo 'Creando schemas...'

CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS functions;

\echo '✓ Schemas creados'

-- =============================================================================
-- SECTION 3: HELPER FUNCTIONS
-- =============================================================================
\echo 'Creando funciones auxiliares...'

-- Function to auto-update updated_at column (public schema for app tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Same function in functions schema for flexibility
CREATE OR REPLACE FUNCTION functions.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate slug
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

-- Function to generate password reset tokens
CREATE OR REPLACE FUNCTION generate_password_reset_token(p_user_id UUID, p_expires_in INTERVAL DEFAULT '24 hours')
RETURNS TABLE(token VARCHAR, expires_at TIMESTAMPTZ) AS $$
DECLARE
    v_token VARCHAR(255);
    v_expires_at TIMESTAMPTZ;
BEGIN
    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires_at := CURRENT_TIMESTAMP + p_expires_in;
    
    UPDATE users 
    SET password_reset_token = v_token,
        password_reset_expires = v_expires_at
    WHERE id = p_user_id
    AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found or deleted';
    END IF;
    
    RETURN QUERY SELECT v_token, v_expires_at;
END;
$$ LANGUAGE plpgsql;

-- Function to verify password reset token
CREATE OR REPLACE FUNCTION verify_password_reset_token(p_token VARCHAR)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id
    FROM users
    WHERE password_reset_token = p_token
    AND password_reset_expires > CURRENT_TIMESTAMP
    AND deleted_at IS NULL;
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

\echo '✓ Funciones auxiliares creadas'

-- =============================================================================
-- SECTION 4: AUDIT TABLES
-- =============================================================================
\echo 'Creando tablas de auditoría...'

CREATE TABLE IF NOT EXISTS audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    user_id UUID,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_logs_action_check CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit.logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit.logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit.logs(created_at DESC);

\echo '✓ Tablas de auditoría creadas'

-- =============================================================================
-- SECTION 5: ENUM TYPES
-- =============================================================================
\echo 'Creando tipos ENUM...'

-- Company plan types
CREATE TYPE plan_type AS ENUM ('free', 'basic', 'professional', 'enterprise');

-- User roles
CREATE TYPE user_role AS ENUM ('admin', 'owner', 'tenant', 'staff');

-- Tenant employment status
CREATE TYPE employment_status AS ENUM (
    'employed', 'self_employed', 'unemployed', 'retired', 'student'
);

-- Staff specializations
CREATE TYPE staff_specialization AS ENUM (
    'maintenance', 'cleaning', 'security', 'administration', 'accounting', 'legal', 'other'
);

-- Property types
CREATE TYPE property_type AS ENUM (
    'apartment', 'house', 'commercial', 'office', 'warehouse', 'land', 'parking', 'other'
);

-- Property status
CREATE TYPE property_status AS ENUM (
    'active', 'inactive', 'under_maintenance', 'pending_approval'
);

-- Unit status
CREATE TYPE unit_status AS ENUM (
    'available', 'occupied', 'maintenance', 'reserved'
);

-- Document types
CREATE TYPE document_type AS ENUM (
    'lease_contract', 'id_document', 'proof_of_income', 'bank_statement',
    'utility_bill', 'insurance', 'inspection_report', 'maintenance_record', 'photo', 'other'
);

-- Document status
CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- Payment frequency
CREATE TYPE payment_frequency AS ENUM ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual');

-- Lease status
CREATE TYPE lease_status AS ENUM (
    'draft', 'pending_signature', 'active', 'expired', 'terminated', 'renewed'
);

-- Lease amendment change types
CREATE TYPE amendment_change_type AS ENUM (
    'rent_adjustment', 'term_extension', 'term_reduction', 
    'tenant_addition', 'tenant_removal', 'clause_modification', 'other'
);

-- Amendment status
CREATE TYPE amendment_status AS ENUM (
    'draft', 'pending_approval', 'approved', 'rejected', 'superseded'
);

-- Late fee types
CREATE TYPE late_fee_type AS ENUM (
    'none', 'fixed', 'percentage', 'daily_fixed', 'daily_percentage'
);

-- Billing frequency
CREATE TYPE billing_frequency AS ENUM (
    'first_of_month', 'last_of_month', 'contract_date', 'custom'
);

-- Movement types for tenant accounts
CREATE TYPE movement_type AS ENUM (
    'charge', 'payment', 'adjustment', 'refund', 'interest', 'late_fee', 'discount'
);

-- Invoice status
CREATE TYPE invoice_status AS ENUM (
    'draft', 'pending', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'refunded'
);

-- Commission invoice status
CREATE TYPE commission_invoice_status AS ENUM ('draft', 'pending', 'sent', 'paid', 'cancelled');

-- Payment methods
CREATE TYPE payment_method AS ENUM (
    'cash', 'bank_transfer', 'credit_card', 'debit_card', 'check', 'digital_wallet', 'crypto', 'other'
);

-- Payment status
CREATE TYPE payment_status AS ENUM (
    'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'
);

-- Adjustment types for rent increases
CREATE TYPE adjustment_type AS ENUM ('fixed', 'percentage', 'inflation_index');

-- Increase clause types
CREATE TYPE increase_clause_type AS ENUM (
    'none', 'annual_fixed', 'annual_percentage', 'inflation_linked', 'custom_schedule'
);

-- ARCA/AFIP invoice types
CREATE TYPE arca_tipo_comprobante AS ENUM (
    'factura_a', 'factura_b', 'factura_c',
    'nota_credito_a', 'nota_credito_b', 'nota_credito_c',
    'nota_debito_a', 'nota_debito_b', 'nota_debito_c',
    'recibo_a', 'recibo_b', 'recibo_c'
);

-- Inflation index types
CREATE TYPE inflation_index_type AS ENUM ('icl', 'ipc', 'igp_m', 'custom');

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'invoice_issued', 'payment_reminder', 'payment_received', 'overdue_notice',
    'late_fee_applied', 'monthly_report', 'lease_expiring', 'rent_adjustment'
);

-- Notification frequency
CREATE TYPE notification_frequency AS ENUM ('immediate', 'daily_digest', 'weekly_digest', 'disabled');

-- Billing job types
CREATE TYPE billing_job_type AS ENUM (
    'billing', 'overdue', 'reminders', 'late_fees', 'sync_indices', 'reports', 'exchange_rates'
);

-- Billing job status
CREATE TYPE billing_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'partial_failure');

\echo '✓ Tipos ENUM creados'

-- =============================================================================
-- SECTION 6: CORE TABLES
-- =============================================================================
\echo 'Creando tablas principales...'

-- -----------------------------------------------------------------------------
-- Companies (Multi-tenant root)
-- -----------------------------------------------------------------------------
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    tax_id VARCHAR(50),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Argentina',
    postal_code VARCHAR(20),
    logo_url VARCHAR(500),
    website VARCHAR(255),
    plan plan_type NOT NULL DEFAULT 'free',
    plan_expires_at TIMESTAMPTZ,
    max_properties INTEGER DEFAULT 5,
    max_users INTEGER DEFAULT 3,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    -- ARCA/AFIP Electronic Invoicing
    arca_enabled BOOLEAN DEFAULT FALSE,
    arca_cuit VARCHAR(11),
    arca_razon_social VARCHAR(255),
    arca_condicion_iva VARCHAR(50),
    arca_punto_venta INTEGER,
    arca_certificate_path VARCHAR(500),
    arca_certificate_password_hash VARCHAR(255),
    arca_certificate_expires_at TIMESTAMPTZ,
    arca_production_mode BOOLEAN DEFAULT FALSE,
    arca_last_sync_at TIMESTAMPTZ,
    -- Withholding agent configuration
    withholding_agent_iibb BOOLEAN DEFAULT FALSE,
    withholding_agent_ganancias BOOLEAN DEFAULT FALSE,
    withholding_rates JSONB DEFAULT '{}'::jsonb,
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_companies_plan ON companies(plan);
CREATE INDEX idx_companies_active ON companies(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_companies_tax_id ON companies(tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX idx_companies_deleted ON companies(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_arca_enabled ON companies(arca_enabled) WHERE arca_enabled = TRUE;
CREATE INDEX idx_companies_arca_cuit ON companies(arca_cuit) WHERE arca_cuit IS NOT NULL;

CREATE TRIGGER update_companies_updated_at
    BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE companies IS 'Multi-tenant companies that use the rental management system';

-- -----------------------------------------------------------------------------
-- Currencies
-- -----------------------------------------------------------------------------
CREATE TABLE currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimal_places INTEGER NOT NULL DEFAULT 2,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_currencies_updated_at
    BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE currencies IS 'Supported currencies for multi-currency support';

-- -----------------------------------------------------------------------------
-- Users (Base user entity)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_deleted ON users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_password_reset ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'Base users table with authentication information';

-- -----------------------------------------------------------------------------
-- Owners (Property owners extending users)
-- -----------------------------------------------------------------------------
CREATE TABLE owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tax_id VARCHAR(50),
    tax_id_type VARCHAR(20) DEFAULT 'CUIT',
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Argentina',
    postal_code VARCHAR(20),
    bank_name VARCHAR(100),
    bank_account_type VARCHAR(50),
    bank_account_number VARCHAR(50),
    bank_cbu VARCHAR(22),
    bank_alias VARCHAR(100),
    payment_method payment_method DEFAULT 'bank_transfer',
    commission_rate DECIMAL(5, 2) DEFAULT 0.00,
    notes TEXT,
    invoice_prefix VARCHAR(10) DEFAULT 'OWN',
    next_invoice_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT owners_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_owners_company ON owners(company_id);
CREATE INDEX idx_owners_user ON owners(user_id);
CREATE INDEX idx_owners_tax_id ON owners(tax_id) WHERE tax_id IS NOT NULL;
CREATE INDEX idx_owners_deleted ON owners(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_owners_updated_at
    BEFORE UPDATE ON owners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE owners IS 'Property owners with extended profile information';

-- -----------------------------------------------------------------------------
-- Tenants (Renters extending users)
-- -----------------------------------------------------------------------------
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    dni VARCHAR(20),
    cuil VARCHAR(20),
    date_of_birth DATE,
    nationality VARCHAR(100),
    occupation VARCHAR(100),
    employer VARCHAR(200),
    monthly_income DECIMAL(12, 2),
    employment_status employment_status,
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(50),
    emergency_contact_relationship VARCHAR(100),
    notes TEXT,
    credit_score INTEGER,
    credit_score_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT tenants_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_tenants_company ON tenants(company_id);
CREATE INDEX idx_tenants_user ON tenants(user_id);
CREATE INDEX idx_tenants_dni ON tenants(dni) WHERE dni IS NOT NULL;
CREATE INDEX idx_tenants_deleted ON tenants(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tenants IS 'Tenants with extended profile and employment information';

-- -----------------------------------------------------------------------------
-- Staff (Maintenance and support staff)
-- -----------------------------------------------------------------------------
CREATE TABLE staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    specialization staff_specialization NOT NULL,
    hourly_rate DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'ARS',
    availability_schedule JSONB DEFAULT '{}',
    service_areas TEXT[],
    certifications TEXT[],
    notes TEXT,
    rating DECIMAL(3, 2),
    total_jobs INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT staff_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_staff_company ON staff(company_id);
CREATE INDEX idx_staff_user ON staff(user_id);
CREATE INDEX idx_staff_specialization ON staff(specialization);
CREATE INDEX idx_staff_deleted ON staff(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_staff_updated_at
    BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE staff IS 'Maintenance and support staff members';

-- -----------------------------------------------------------------------------
-- Admins (Company administrators)
-- -----------------------------------------------------------------------------
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_super_admin BOOLEAN DEFAULT FALSE,
    permissions JSONB DEFAULT '{
        "users": {"create": true, "read": true, "update": true, "delete": false},
        "properties": {"create": true, "read": true, "update": true, "delete": false},
        "leases": {"create": true, "read": true, "update": true, "delete": false},
        "payments": {"create": true, "read": true, "update": true, "delete": false},
        "reports": {"create": true, "read": true, "update": false, "delete": false},
        "settings": {"create": false, "read": true, "update": false, "delete": false}
    }',
    department VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT admins_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_admins_company ON admins(company_id);
CREATE INDEX idx_admins_user ON admins(user_id);
CREATE INDEX idx_admins_super ON admins(is_super_admin) WHERE is_super_admin = TRUE;
CREATE INDEX idx_admins_deleted ON admins(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_admins_updated_at
    BEFORE UPDATE ON admins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE admins IS 'Company administrators with granular permissions';

\echo '✓ Tablas principales creadas'

-- =============================================================================
-- SECTION 7: PROPERTY TABLES
-- =============================================================================
\echo 'Creando tablas de propiedades...'

-- -----------------------------------------------------------------------------
-- Properties
-- -----------------------------------------------------------------------------
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    property_type property_type NOT NULL,
    status property_status NOT NULL DEFAULT 'active',
    address_street VARCHAR(255) NOT NULL,
    address_number VARCHAR(20),
    address_floor VARCHAR(10),
    address_apartment VARCHAR(20),
    address_city VARCHAR(100) NOT NULL,
    address_state VARCHAR(100) NOT NULL,
    address_country VARCHAR(100) DEFAULT 'Argentina',
    address_postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    total_area DECIMAL(10, 2),
    built_area DECIMAL(10, 2),
    year_built INTEGER,
    total_units INTEGER DEFAULT 1,
    description TEXT,
    amenities TEXT[],
    images JSONB DEFAULT '[]',
    documents JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_properties_company ON properties(company_id);
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(address_city);
CREATE INDEX idx_properties_deleted ON properties(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_location ON properties(latitude, longitude) 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE properties IS 'Properties available for rent';

-- -----------------------------------------------------------------------------
-- Units (Rentable units within properties)
-- -----------------------------------------------------------------------------
CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    floor VARCHAR(10),
    status unit_status NOT NULL DEFAULT 'available',
    unit_type VARCHAR(100),
    area DECIMAL(10, 2),
    bedrooms INTEGER DEFAULT 0,
    bathrooms DECIMAL(3, 1) DEFAULT 1,
    has_parking BOOLEAN DEFAULT FALSE,
    parking_spots INTEGER DEFAULT 0,
    has_storage BOOLEAN DEFAULT FALSE,
    is_furnished BOOLEAN DEFAULT FALSE,
    base_rent DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'ARS' REFERENCES currencies(code),
    expenses DECIMAL(12, 2) DEFAULT 0,
    description TEXT,
    features TEXT[],
    images JSONB DEFAULT '[]',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT units_property_number_unique UNIQUE (property_id, unit_number)
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_company ON units(company_id);
CREATE INDEX idx_units_status ON units(status);
CREATE INDEX idx_units_deleted ON units(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_units_available ON units(status) WHERE status = 'available';

CREATE TRIGGER update_units_updated_at
    BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE units IS 'Individual rentable units within properties';

-- -----------------------------------------------------------------------------
-- Property Features
-- -----------------------------------------------------------------------------
CREATE TABLE property_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    value VARCHAR(255),
    is_highlighted BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT property_features_unique UNIQUE (property_id, category, name)
);

CREATE INDEX idx_property_features_property ON property_features(property_id);
CREATE INDEX idx_property_features_category ON property_features(category);
CREATE INDEX idx_property_features_highlighted ON property_features(is_highlighted) WHERE is_highlighted = TRUE;

CREATE TRIGGER update_property_features_updated_at
    BEFORE UPDATE ON property_features FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE property_features IS 'Detailed features and characteristics of properties';

\echo '✓ Tablas de propiedades creadas'

-- =============================================================================
-- SECTION 8: DOCUMENTS TABLE
-- =============================================================================
\echo 'Creando tabla de documentos...'

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_type document_type NOT NULL,
    status document_status NOT NULL DEFAULT 'pending',
    name VARCHAR(255) NOT NULL,
    description TEXT,
    file_url VARCHAR(500) NOT NULL,
    file_size INTEGER,
    file_mime_type VARCHAR(100),
    expires_at DATE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    tags TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_expires ON documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_documents_deleted ON documents(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE documents IS 'Documents attached to various entities';

\echo '✓ Tabla de documentos creada'

-- =============================================================================
-- SECTION 9: LEASE TABLES
-- =============================================================================
\echo 'Creando tablas de contratos...'

-- -----------------------------------------------------------------------------
-- Leases
-- -----------------------------------------------------------------------------
CREATE TABLE leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    lease_number VARCHAR(50),
    status lease_status NOT NULL DEFAULT 'draft',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    monthly_rent DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS' REFERENCES currencies(code),
    payment_frequency payment_frequency NOT NULL DEFAULT 'monthly',
    payment_due_day INTEGER DEFAULT 10,
    billing_frequency billing_frequency NOT NULL DEFAULT 'first_of_month',
    billing_day INTEGER,
    late_fee_type late_fee_type NOT NULL DEFAULT 'none',
    late_fee_value DECIMAL(10, 2) DEFAULT 0,
    late_fee_grace_days INTEGER DEFAULT 0,
    late_fee_max DECIMAL(12, 2),
    auto_generate_invoices BOOLEAN DEFAULT TRUE,
    adjustment_type adjustment_type NOT NULL DEFAULT 'fixed',
    adjustment_value DECIMAL(10, 4),
    adjustment_frequency_months INTEGER DEFAULT 12,
    last_adjustment_date DATE,
    next_adjustment_date DATE,
    increase_clause_type increase_clause_type NOT NULL DEFAULT 'none',
    increase_clause_value DECIMAL(10, 4),
    increase_clause_schedule JSONB DEFAULT '[]'::jsonb,
    inflation_index_type inflation_index_type,
    security_deposit DECIMAL(12, 2),
    deposit_currency VARCHAR(3) DEFAULT 'ARS',
    expenses_included BOOLEAN DEFAULT FALSE,
    additional_expenses DECIMAL(12, 2) DEFAULT 0,
    terms_and_conditions TEXT,
    special_clauses TEXT,
    notes TEXT,
    signed_at TIMESTAMPTZ,
    signed_by_tenant BOOLEAN DEFAULT FALSE,
    signed_by_owner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT leases_dates_check CHECK (end_date > start_date),
    CONSTRAINT leases_payment_due_day_check CHECK (payment_due_day BETWEEN 1 AND 28),
    CONSTRAINT leases_billing_day_check CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 28),
    CONSTRAINT leases_late_fee_grace_days_check CHECK (late_fee_grace_days >= 0),
    CONSTRAINT leases_adjustment_frequency_check CHECK (adjustment_frequency_months > 0)
);

CREATE INDEX idx_leases_company ON leases(company_id);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_owner ON leases(owner_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_dates ON leases(start_date, end_date);
CREATE INDEX idx_leases_active ON leases(status) WHERE status = 'active';
CREATE INDEX idx_leases_deleted ON leases(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_leases_next_adjustment ON leases(next_adjustment_date) 
    WHERE next_adjustment_date IS NOT NULL AND status = 'active';
CREATE INDEX idx_leases_billing ON leases(billing_frequency, billing_day) 
    WHERE auto_generate_invoices = TRUE AND status = 'active';

CREATE TRIGGER update_leases_updated_at
    BEFORE UPDATE ON leases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE leases IS 'Lease contracts between owners and tenants';

-- -----------------------------------------------------------------------------
-- Lease Amendments
-- -----------------------------------------------------------------------------
CREATE TABLE lease_amendments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    amendment_number INTEGER NOT NULL,
    change_type amendment_change_type NOT NULL,
    status amendment_status NOT NULL DEFAULT 'draft',
    effective_date DATE NOT NULL,
    description TEXT NOT NULL,
    previous_values JSONB DEFAULT '{}',
    new_values JSONB DEFAULT '{}',
    requested_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    document_url VARCHAR(500),
    signed_by_tenant BOOLEAN DEFAULT FALSE,
    signed_by_owner BOOLEAN DEFAULT FALSE,
    signed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT lease_amendments_number_unique UNIQUE (lease_id, amendment_number)
);

CREATE INDEX idx_lease_amendments_lease ON lease_amendments(lease_id);
CREATE INDEX idx_lease_amendments_company ON lease_amendments(company_id);
CREATE INDEX idx_lease_amendments_status ON lease_amendments(status);
CREATE INDEX idx_lease_amendments_type ON lease_amendments(change_type);
CREATE INDEX idx_lease_amendments_effective ON lease_amendments(effective_date);
CREATE INDEX idx_lease_amendments_deleted ON lease_amendments(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_lease_amendments_updated_at
    BEFORE UPDATE ON lease_amendments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE lease_amendments IS 'Amendments and modifications to lease contracts';

\echo '✓ Tablas de contratos creadas'

-- =============================================================================
-- SECTION 10: FINANCIAL TABLES
-- =============================================================================
\echo 'Creando tablas financieras...'

-- -----------------------------------------------------------------------------
-- Tenant Accounts (Cuenta Corriente)
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    current_balance DECIMAL(14, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'ARS',
    is_active BOOLEAN DEFAULT TRUE,
    last_movement_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT tenant_accounts_lease_unique UNIQUE (lease_id)
);

CREATE INDEX idx_tenant_accounts_company ON tenant_accounts(company_id);
CREATE INDEX idx_tenant_accounts_tenant ON tenant_accounts(tenant_id);
CREATE INDEX idx_tenant_accounts_lease ON tenant_accounts(lease_id);
CREATE INDEX idx_tenant_accounts_active ON tenant_accounts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_tenant_accounts_balance ON tenant_accounts(current_balance) WHERE current_balance != 0;
CREATE INDEX idx_tenant_accounts_deleted ON tenant_accounts(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_tenant_accounts_updated_at
    BEFORE UPDATE ON tenant_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tenant_accounts IS 'Current account (cuenta corriente) for tenant lease payments';

-- -----------------------------------------------------------------------------
-- Tenant Account Movements
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_account_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_account_id UUID NOT NULL REFERENCES tenant_accounts(id) ON DELETE CASCADE,
    movement_type movement_type NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    description TEXT NOT NULL,
    movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_tenant_account_movements_account ON tenant_account_movements(tenant_account_id);
CREATE INDEX idx_tenant_account_movements_type ON tenant_account_movements(movement_type);
CREATE INDEX idx_tenant_account_movements_date ON tenant_account_movements(movement_date DESC);
CREATE INDEX idx_tenant_account_movements_reference ON tenant_account_movements(reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

COMMENT ON TABLE tenant_account_movements IS 'Individual movements in tenant current accounts';

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    tenant_account_id UUID REFERENCES tenant_accounts(id),
    invoice_number VARCHAR(50) NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    discount_amount DECIMAL(14, 2) DEFAULT 0,
    late_fee_amount DECIMAL(14, 2) DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    original_currency VARCHAR(3),
    original_amount DECIMAL(14, 2),
    exchange_rate DECIMAL(12, 6),
    exchange_rate_date DATE,
    withholding_iibb DECIMAL(14, 2) DEFAULT 0,
    withholding_ganancias DECIMAL(14, 2) DEFAULT 0,
    withholding_other DECIMAL(14, 2) DEFAULT 0,
    net_amount DECIMAL(14, 2),
    paid_amount DECIMAL(14, 2) DEFAULT 0,
    balance_due DECIMAL(14, 2),
    last_payment_date DATE,
    arca_tipo_comprobante arca_tipo_comprobante,
    arca_punto_venta INTEGER,
    arca_numero_comprobante BIGINT,
    arca_cae VARCHAR(14),
    arca_cae_vencimiento DATE,
    arca_request_xml TEXT,
    arca_response_xml TEXT,
    arca_submitted_at TIMESTAMPTZ,
    arca_error_message TEXT,
    line_items JSONB DEFAULT '[]',
    notes TEXT,
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT invoices_number_company_unique UNIQUE (company_id, invoice_number),
    CONSTRAINT invoices_period_check CHECK (period_end >= period_start),
    CONSTRAINT invoices_amounts_check CHECK (total_amount >= 0 AND paid_amount >= 0)
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_lease ON invoices(lease_id);
CREATE INDEX idx_invoices_owner ON invoices(owner_id);
CREATE INDEX idx_invoices_tenant_account ON invoices(tenant_account_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_period ON invoices(period_start, period_end);
CREATE INDEX idx_invoices_overdue ON invoices(due_date, status) WHERE status IN ('pending', 'sent', 'partial');
CREATE INDEX idx_invoices_deleted ON invoices(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_arca_cae ON invoices(arca_cae) WHERE arca_cae IS NOT NULL;
CREATE INDEX idx_invoices_arca_pending ON invoices(arca_tipo_comprobante, arca_cae) 
    WHERE arca_tipo_comprobante IS NOT NULL AND arca_cae IS NULL;

CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoices IS 'Rent invoices generated for tenants';

-- -----------------------------------------------------------------------------
-- Commission Invoices
-- -----------------------------------------------------------------------------
CREATE TABLE commission_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    status commission_invoice_status NOT NULL DEFAULT 'draft',
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    base_amount DECIMAL(14, 2) NOT NULL,
    commission_rate DECIMAL(5, 2) NOT NULL,
    commission_amount DECIMAL(14, 2) NOT NULL,
    tax_amount DECIMAL(14, 2) DEFAULT 0,
    total_amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    related_invoices JSONB DEFAULT '[]',
    paid_amount DECIMAL(14, 2) DEFAULT 0,
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT commission_invoices_number_unique UNIQUE (company_id, invoice_number)
);

CREATE INDEX idx_commission_invoices_company ON commission_invoices(company_id);
CREATE INDEX idx_commission_invoices_owner ON commission_invoices(owner_id);
CREATE INDEX idx_commission_invoices_status ON commission_invoices(status);
CREATE INDEX idx_commission_invoices_period ON commission_invoices(period_start, period_end);
CREATE INDEX idx_commission_invoices_deleted ON commission_invoices(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_commission_invoices_updated_at
    BEFORE UPDATE ON commission_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE commission_invoices IS 'Commission invoices charged to property owners';

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    tenant_account_id UUID REFERENCES tenant_accounts(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payment_number VARCHAR(50),
    status payment_status NOT NULL DEFAULT 'pending',
    payment_method payment_method NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    processed_at TIMESTAMPTZ,
    reference_number VARCHAR(255),
    bank_name VARCHAR(100),
    account_last_digits VARCHAR(4),
    authorization_code VARCHAR(100),
    external_transaction_id VARCHAR(255),
    gateway_response JSONB DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT payments_amount_check CHECK (amount > 0)
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_tenant_account ON payments(tenant_account_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_method ON payments(payment_method);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_deleted ON payments(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE payments IS 'Payment transactions from tenants';

-- -----------------------------------------------------------------------------
-- Receipts
-- -----------------------------------------------------------------------------
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    description TEXT,
    pdf_url VARCHAR(500),
    pdf_generated_at TIMESTAMPTZ,
    sent_to_email VARCHAR(255),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT receipts_number_company_unique UNIQUE (company_id, receipt_number)
);

CREATE INDEX idx_receipts_company ON receipts(company_id);
CREATE INDEX idx_receipts_payment ON receipts(payment_id);
CREATE INDEX idx_receipts_date ON receipts(issue_date DESC);

CREATE TRIGGER update_receipts_updated_at
    BEFORE UPDATE ON receipts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE receipts IS 'Payment receipts issued to tenants';

\echo '✓ Tablas financieras creadas'

-- =============================================================================
-- SECTION 11: REFERENCE DATA TABLES
-- =============================================================================
\echo 'Creando tablas de datos de referencia...'

-- -----------------------------------------------------------------------------
-- Inflation Indices
-- -----------------------------------------------------------------------------
CREATE TABLE inflation_indices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    index_type inflation_index_type NOT NULL,
    period_date DATE NOT NULL,
    value DECIMAL(12, 6) NOT NULL,
    variation_monthly DECIMAL(8, 4),
    variation_yearly DECIMAL(8, 4),
    source VARCHAR(100) NOT NULL,
    source_url VARCHAR(500),
    published_at DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inflation_indices_unique UNIQUE (index_type, period_date)
);

CREATE INDEX idx_inflation_indices_type ON inflation_indices(index_type);
CREATE INDEX idx_inflation_indices_period ON inflation_indices(period_date DESC);
CREATE INDEX idx_inflation_indices_lookup ON inflation_indices(index_type, period_date DESC);

CREATE TRIGGER update_inflation_indices_updated_at
    BEFORE UPDATE ON inflation_indices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE inflation_indices IS 'Historical inflation indices for rent adjustments';

-- -----------------------------------------------------------------------------
-- Exchange Rates
-- -----------------------------------------------------------------------------
CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    rate DECIMAL(12, 6) NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    source_url VARCHAR(500),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT exchange_rates_unique UNIQUE (from_currency, to_currency, rate_date, source),
    CONSTRAINT exchange_rates_rate_check CHECK (rate > 0),
    CONSTRAINT exchange_rates_currencies_different CHECK (from_currency != to_currency)
);

CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(rate_date DESC);
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(from_currency, to_currency, rate_date DESC);

CREATE TRIGGER update_exchange_rates_updated_at
    BEFORE UPDATE ON exchange_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE exchange_rates IS 'Historical exchange rates for multi-currency support';

\echo '✓ Tablas de datos de referencia creadas'

-- =============================================================================
-- SECTION 12: SYSTEM TABLES
-- =============================================================================
\echo 'Creando tablas del sistema...'

-- -----------------------------------------------------------------------------
-- Notification Preferences
-- -----------------------------------------------------------------------------
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    frequency notification_frequency NOT NULL DEFAULT 'immediate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notification_preferences_unique UNIQUE (user_id, notification_type)
);

CREATE INDEX idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_type ON notification_preferences(notification_type);
CREATE INDEX idx_notification_preferences_email_enabled 
    ON notification_preferences(user_id, email_enabled) WHERE email_enabled = TRUE;

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE notification_preferences IS 'User preferences for email notifications';

-- -----------------------------------------------------------------------------
-- Billing Jobs
-- -----------------------------------------------------------------------------
CREATE TABLE billing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type billing_job_type NOT NULL,
    status billing_job_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    records_total INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    error_message TEXT,
    error_log JSONB DEFAULT '[]'::jsonb,
    parameters JSONB DEFAULT '{}'::jsonb,
    dry_run BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT billing_jobs_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT billing_jobs_records_check CHECK (
        records_total >= 0 AND records_processed >= 0 AND records_failed >= 0 AND records_skipped >= 0
    )
);

CREATE INDEX idx_billing_jobs_type ON billing_jobs(job_type);
CREATE INDEX idx_billing_jobs_status ON billing_jobs(status);
CREATE INDEX idx_billing_jobs_started_at ON billing_jobs(started_at DESC);
CREATE INDEX idx_billing_jobs_type_status ON billing_jobs(job_type, status);

CREATE TRIGGER update_billing_jobs_updated_at
    BEFORE UPDATE ON billing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE billing_jobs IS 'Tracking table for batch billing job executions';

\echo '✓ Tablas del sistema creadas'

-- =============================================================================
-- SECTION 13: SEED DATA
-- =============================================================================
\echo 'Insertando datos semilla...'

-- Currencies
INSERT INTO currencies (code, name, symbol, decimal_places, is_active) VALUES
    ('ARS', 'Peso Argentino', '$', 2, TRUE),
    ('USD', 'Dólar Estadounidense', 'US$', 2, TRUE),
    ('EUR', 'Euro', '€', 2, TRUE),
    ('BRL', 'Real Brasileño', 'R$', 2, TRUE),
    ('UYU', 'Peso Uruguayo', '$U', 2, TRUE),
    ('CLP', 'Peso Chileno', 'CLP$', 0, TRUE)
ON CONFLICT (code) DO NOTHING;

\echo '✓ Datos semilla insertados'

-- =============================================================================
-- SECTION 14: DATABASE CONFIGURATION
-- =============================================================================
\echo 'Aplicando configuración de base de datos...'

SET TIME ZONE 'America/Argentina/Buenos_Aires';

-- Habilitar parallel query para mejor performance (ajustar según servidor)
-- ALTER DATABASE rent_dev SET max_parallel_workers_per_gather = 4;

\echo '✓ Configuración aplicada'

-- =============================================================================
-- FINAL SUMMARY
-- =============================================================================
\echo ''
\echo '========================================='
\echo '✓ RentFlow - Base de datos inicializada'
\echo '========================================='
\echo ''
\echo 'Extensiones: uuid-ossp, pgcrypto, unaccent, postgis'
\echo 'Schemas: public, audit, functions'
\echo ''
\echo 'Tablas creadas:'
\echo '  - Core: companies, users, owners, tenants, staff, admins'
\echo '  - Properties: properties, units, property_features'
\echo '  - Documents: documents'
\echo '  - Leases: leases, lease_amendments'
\echo '  - Financial: tenant_accounts, movements, invoices,'
\echo '               commission_invoices, payments, receipts'
\echo '  - Reference: currencies, inflation_indices, exchange_rates'
\echo '  - System: notification_preferences, billing_jobs'
\echo '  - Audit: audit.logs'
\echo ''
\echo '========================================='
