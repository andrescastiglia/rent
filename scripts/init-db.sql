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
CREATE TYPE plan_type AS ENUM ('free', 'basic', 'premium', 'enterprise');

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

-- Property operation modes
CREATE TYPE property_operation AS ENUM ('rent', 'sale');

-- Property commercial lifecycle state
CREATE TYPE property_operation_state AS ENUM (
    'available', 'rented', 'reserved', 'sold'
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
CREATE TYPE lease_status AS ENUM ('draft', 'active', 'finalized');

-- Contract type
CREATE TYPE contract_type AS ENUM ('rental', 'sale');

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

-- Payment item type
CREATE TYPE payment_item_type AS ENUM ('charge', 'discount');


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
CREATE TYPE inflation_index_type AS ENUM ('icl', 'ipc', 'igp_m', 'casa_propia', 'custom');

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'invoice_issued', 'payment_reminder', 'payment_received', 'overdue_notice',
    'late_fee_applied', 'monthly_report', 'lease_expiring', 'rent_adjustment'
);

-- Notification frequency
CREATE TYPE notification_frequency AS ENUM ('immediate', 'daily_digest', 'weekly_digest', 'disabled');

-- Visit notification channel/status
CREATE TYPE visit_notification_channel AS ENUM ('whatsapp', 'email');
CREATE TYPE visit_notification_status AS ENUM ('queued', 'sent', 'failed');

-- Interested profiles
CREATE TYPE interested_operation AS ENUM ('rent', 'sale');
CREATE TYPE interested_property_type AS ENUM (
    'apartment', 'house', 'commercial', 'office', 'warehouse', 'land', 'parking', 'other'
);
CREATE TYPE interested_status AS ENUM (
    'interested', 'tenant', 'buyer'
);
CREATE TYPE interested_qualification_level AS ENUM ('mql', 'sql', 'rejected');
CREATE TYPE interested_match_status AS ENUM (
    'suggested', 'contacted', 'visit_scheduled', 'accepted', 'rejected', 'expired'
);
CREATE TYPE interested_activity_type AS ENUM (
    'call', 'task', 'note', 'email', 'whatsapp', 'visit'
);
CREATE TYPE interested_activity_status AS ENUM ('pending', 'completed', 'cancelled');

-- Owner activities
CREATE TYPE owner_activity_type AS ENUM (
    'call', 'task', 'note', 'email', 'whatsapp', 'visit', 'reserve'
);
CREATE TYPE owner_activity_status AS ENUM ('pending', 'completed', 'cancelled');

-- Tenant activities
CREATE TYPE tenant_activity_type AS ENUM (
    'call', 'task', 'note', 'email', 'whatsapp', 'visit'
);
CREATE TYPE tenant_activity_status AS ENUM ('pending', 'completed', 'cancelled');

-- Property reservations
CREATE TYPE property_reservation_status AS ENUM ('active', 'released', 'converted');

-- Credit notes
CREATE TYPE credit_note_status AS ENUM ('draft', 'issued', 'cancelled');

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
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000001',
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    language VARCHAR(8) DEFAULT 'es',
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
CREATE INDEX idx_users_last_name ON users(last_name);
CREATE INDEX idx_users_last_name_ci ON users(LOWER(last_name));
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
-- Interested Profiles (Leads)
-- -----------------------------------------------------------------------------
CREATE TABLE interested_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    people_count INTEGER,
    min_amount DECIMAL(12, 2),
    max_amount DECIMAL(12, 2),
    has_pets BOOLEAN DEFAULT FALSE,
    guarantee_types TEXT[],
    preferred_zones TEXT[],
    preferred_city VARCHAR(120),
    desired_features TEXT[],
    property_type_preference interested_property_type,
    operation interested_operation NOT NULL DEFAULT 'rent',
    operations interested_operation[] NOT NULL DEFAULT ARRAY['rent'::interested_operation],
    status interested_status NOT NULL DEFAULT 'interested',
    qualification_level interested_qualification_level,
    qualification_notes TEXT,
    source VARCHAR(100),
    assigned_to_user_id UUID REFERENCES users(id),
    organization_name VARCHAR(150),
    custom_fields JSONB DEFAULT '{}',
    last_contact_at TIMESTAMPTZ,
    next_contact_at TIMESTAMPTZ,
    lost_reason TEXT,
    consent_contact BOOLEAN NOT NULL DEFAULT FALSE,
    consent_recorded_at TIMESTAMPTZ,
    converted_to_tenant_id UUID REFERENCES tenants(id),
    converted_to_sale_agreement_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT interested_profiles_people_count_check CHECK (people_count IS NULL OR people_count > 0),
    CONSTRAINT interested_profiles_min_amount_check CHECK (min_amount IS NULL OR min_amount >= 0),
    CONSTRAINT interested_profiles_max_amount_check CHECK (max_amount IS NULL OR max_amount >= 0)
);

CREATE INDEX idx_interested_company ON interested_profiles(company_id);
CREATE INDEX idx_interested_phone ON interested_profiles(phone);
CREATE INDEX idx_interested_operation ON interested_profiles(operation);
CREATE INDEX idx_interested_operations ON interested_profiles USING GIN (operations);
CREATE INDEX idx_interested_status ON interested_profiles(status);
CREATE INDEX idx_interested_qualification_level ON interested_profiles(qualification_level);
CREATE INDEX idx_interested_assigned_to ON interested_profiles(assigned_to_user_id);
CREATE INDEX idx_interested_property_type ON interested_profiles(property_type_preference);
CREATE INDEX idx_interested_next_contact_at ON interested_profiles(next_contact_at) WHERE next_contact_at IS NOT NULL;
CREATE INDEX idx_interested_deleted ON interested_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_interested_company_phone_operation_unique
    ON interested_profiles(company_id, phone, operation)
    WHERE deleted_at IS NULL;

CREATE TRIGGER update_interested_profiles_updated_at
    BEFORE UPDATE ON interested_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE interested_profiles IS 'Interested profiles for matching properties';

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
    ip_whitelist TEXT[] DEFAULT '{}',
    allowed_modules TEXT[] DEFAULT '{}',
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
    owner_whatsapp VARCHAR(40),
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
    sale_price DECIMAL(12, 2),
    sale_currency VARCHAR(3) DEFAULT 'ARS',
    operations property_operation[] NOT NULL DEFAULT ARRAY['rent'::property_operation],
    operation_state property_operation_state NOT NULL DEFAULT 'available',
    allows_pets BOOLEAN DEFAULT TRUE,
    accepted_guarantee_types TEXT[],
    max_occupants INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_properties_company ON properties(company_id);
CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(address_city);
CREATE INDEX idx_properties_sale_price ON properties(sale_price) WHERE sale_price IS NOT NULL;
CREATE INDEX idx_properties_operations ON properties USING GIN (operations);
CREATE INDEX idx_properties_operation_state ON properties(operation_state);
CREATE INDEX idx_properties_deleted ON properties(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_properties_location ON properties(latitude, longitude) 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE properties IS 'Properties available for rent';

-- -----------------------------------------------------------------------------
-- Property Images (binary image storage in DB)
-- -----------------------------------------------------------------------------
CREATE TABLE property_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_name VARCHAR(255),
    mime_type VARCHAR(120) NOT NULL,
    size_bytes INTEGER NOT NULL,
    data BYTEA NOT NULL,
    is_temporary BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_images_company ON property_images(company_id);
CREATE INDEX idx_property_images_property ON property_images(property_id);
CREATE INDEX idx_property_images_temp ON property_images(is_temporary);
CREATE INDEX idx_property_images_created ON property_images(created_at DESC);

CREATE TRIGGER update_property_images_updated_at
    BEFORE UPDATE ON property_images FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE property_images IS 'Property images stored as binary content in the database';

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

-- -----------------------------------------------------------------------------
-- Property Visits
-- -----------------------------------------------------------------------------
CREATE TABLE property_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    visited_at TIMESTAMPTZ NOT NULL,
    interested_name VARCHAR(255),
    interested_profile_id UUID REFERENCES interested_profiles(id) ON DELETE SET NULL,
    comments TEXT,
    has_offer BOOLEAN DEFAULT FALSE,
    offer_amount DECIMAL(12, 2),
    offer_currency VARCHAR(3) DEFAULT 'ARS',
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT property_visits_interested_ref_check
        CHECK (interested_profile_id IS NOT NULL OR interested_name IS NOT NULL)
);

CREATE INDEX idx_property_visits_property ON property_visits(property_id);
CREATE INDEX idx_property_visits_date ON property_visits(visited_at);
CREATE INDEX idx_property_visits_interested_profile ON property_visits(interested_profile_id)
    WHERE interested_profile_id IS NOT NULL;

CREATE TRIGGER update_property_visits_updated_at
    BEFORE UPDATE ON property_visits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE property_visits IS 'Visit log for properties';

-- -----------------------------------------------------------------------------
-- Property Visit Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE property_visit_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visit_id UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
    channel visit_notification_channel NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status visit_notification_status NOT NULL DEFAULT 'queued',
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_visit_notifications_visit ON property_visit_notifications(visit_id);
CREATE INDEX idx_property_visit_notifications_status ON property_visit_notifications(status);

CREATE TRIGGER update_property_visit_notifications_updated_at
    BEFORE UPDATE ON property_visit_notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE property_visit_notifications IS 'Notification log for property visits';

-- -----------------------------------------------------------------------------
-- Interested Property Matches
-- -----------------------------------------------------------------------------
CREATE TABLE interested_property_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    status interested_match_status NOT NULL DEFAULT 'suggested',
    score DECIMAL(5, 2),
    match_reasons TEXT[],
    first_matched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_matched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contacted_at TIMESTAMPTZ,
    notes TEXT,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT interested_property_matches_unique UNIQUE (interested_profile_id, property_id),
    CONSTRAINT interested_property_matches_score_check CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

CREATE INDEX idx_interested_property_matches_company ON interested_property_matches(company_id);
CREATE INDEX idx_interested_property_matches_interested ON interested_property_matches(interested_profile_id);
CREATE INDEX idx_interested_property_matches_property ON interested_property_matches(property_id);
CREATE INDEX idx_interested_property_matches_status ON interested_property_matches(status);
CREATE INDEX idx_interested_property_matches_score ON interested_property_matches(score DESC)
    WHERE score IS NOT NULL;
CREATE INDEX idx_interested_property_matches_deleted ON interested_property_matches(deleted_at)
    WHERE deleted_at IS NULL;

CREATE TRIGGER update_interested_property_matches_updated_at
    BEFORE UPDATE ON interested_property_matches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE interested_property_matches IS 'Cross-search results between interested profiles and properties';

-- -----------------------------------------------------------------------------
-- Interested Stage History
-- -----------------------------------------------------------------------------
CREATE TABLE interested_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    from_status interested_status NOT NULL,
    to_status interested_status NOT NULL,
    reason TEXT,
    changed_by_user_id UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interested_stage_history_profile ON interested_stage_history(interested_profile_id);
CREATE INDEX idx_interested_stage_history_changed_at ON interested_stage_history(changed_at DESC);
CREATE INDEX idx_interested_stage_history_to_status ON interested_stage_history(to_status);

COMMENT ON TABLE interested_stage_history IS 'History of pipeline stage changes for interested profiles';

-- -----------------------------------------------------------------------------
-- Interested Activities
-- -----------------------------------------------------------------------------
CREATE TABLE interested_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    type interested_activity_type NOT NULL,
    status interested_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    template_name VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_interested_activities_profile ON interested_activities(interested_profile_id);
CREATE INDEX idx_interested_activities_status ON interested_activities(status);
CREATE INDEX idx_interested_activities_due_at ON interested_activities(due_at)
    WHERE due_at IS NOT NULL;

CREATE TRIGGER update_interested_activities_updated_at
    BEFORE UPDATE ON interested_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE interested_activities IS 'Tasks, calls, notes and communications for CRM follow-up';

-- -----------------------------------------------------------------------------
-- Owner Activities
-- -----------------------------------------------------------------------------
CREATE TABLE owner_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    type owner_activity_type NOT NULL,
    status owner_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_owner_activities_owner_id ON owner_activities(owner_id);
CREATE INDEX idx_owner_activities_company_id ON owner_activities(company_id);
CREATE INDEX idx_owner_activities_due_at ON owner_activities(due_at);
CREATE INDEX idx_owner_activities_status ON owner_activities(status);
CREATE INDEX idx_owner_activities_deleted ON owner_activities(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_owner_activities_updated_at
    BEFORE UPDATE ON owner_activities FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE owner_activities IS 'Activities timeline for property owners';

-- -----------------------------------------------------------------------------
-- Tenant Activities
-- -----------------------------------------------------------------------------
CREATE TABLE tenant_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    type tenant_activity_type NOT NULL,
    status tenant_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenant_activities_tenant_id
    ON tenant_activities(tenant_id);
CREATE INDEX idx_tenant_activities_company_id
    ON tenant_activities(company_id);
CREATE INDEX idx_tenant_activities_status
    ON tenant_activities(status);

-- -----------------------------------------------------------------------------
-- Property Reservations (Person <-> Property)
-- -----------------------------------------------------------------------------
CREATE TABLE property_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    status property_reservation_status NOT NULL DEFAULT 'active',
    activity_source VARCHAR(30) NOT NULL DEFAULT 'activity',
    notes TEXT,
    reserved_by_user_id UUID REFERENCES users(id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_property_reservations_active_pair
    ON property_reservations(property_id, interested_profile_id)
    WHERE status = 'active'::property_reservation_status
      AND deleted_at IS NULL;

CREATE INDEX idx_property_reservations_property_id ON property_reservations(property_id);
CREATE INDEX idx_property_reservations_interested_profile_id ON property_reservations(interested_profile_id);
CREATE INDEX idx_property_reservations_deleted ON property_reservations(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_property_reservations_updated_at
    BEFORE UPDATE ON property_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE property_reservations IS 'Reservations linking interested people with properties';

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
    file_data BYTEA,
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
-- Lease Contract Templates
-- -----------------------------------------------------------------------------
CREATE TABLE lease_contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(120) NOT NULL,
    contract_type contract_type NOT NULL,
    template_body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_lease_contract_templates_company_id
    ON lease_contract_templates(company_id);
CREATE INDEX idx_lease_contract_templates_contract_type
    ON lease_contract_templates(contract_type);

-- -----------------------------------------------------------------------------
-- Leases
-- -----------------------------------------------------------------------------
CREATE TABLE leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    buyer_profile_id UUID REFERENCES interested_profiles(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    lease_number VARCHAR(50),
    contract_type contract_type NOT NULL DEFAULT 'rental',
    status lease_status NOT NULL DEFAULT 'draft',
    start_date DATE,
    end_date DATE,
    monthly_rent DECIMAL(12, 2),
    fiscal_value DECIMAL(14, 2),
    currency VARCHAR(3) DEFAULT 'ARS' REFERENCES currencies(code),
    payment_frequency payment_frequency NOT NULL DEFAULT 'monthly',
    payment_due_day INTEGER DEFAULT 10,
    billing_frequency billing_frequency NOT NULL DEFAULT 'first_of_month',
    billing_day INTEGER,
    next_billing_date DATE,
    last_billing_date DATE,
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
    template_id UUID REFERENCES lease_contract_templates(id),
    template_name VARCHAR(120),
    draft_contract_text TEXT,
    confirmed_contract_text TEXT,
    confirmed_at TIMESTAMPTZ,
    previous_lease_id UUID REFERENCES leases(id),
    version_number INTEGER NOT NULL DEFAULT 1,
    contract_pdf_url TEXT,
    notes TEXT,
    signed_at TIMESTAMPTZ,
    signed_by_tenant BOOLEAN DEFAULT FALSE,
    signed_by_owner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT leases_payment_due_day_check CHECK (payment_due_day BETWEEN 1 AND 28),
    CONSTRAINT leases_billing_day_check CHECK (billing_day IS NULL OR billing_day BETWEEN 1 AND 28),
    CONSTRAINT leases_late_fee_grace_days_check CHECK (late_fee_grace_days >= 0),
    CONSTRAINT leases_adjustment_frequency_check CHECK (adjustment_frequency_months > 0),
    CONSTRAINT leases_dates_check CHECK (
        contract_type <> 'rental'
        OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date)
    ),
    CONSTRAINT leases_contract_type_required_fields_chk CHECK (
        (contract_type = 'rental'
         AND tenant_id IS NOT NULL
         AND start_date IS NOT NULL
         AND end_date IS NOT NULL
         AND monthly_rent IS NOT NULL)
        OR
        (contract_type = 'sale'
         AND buyer_profile_id IS NOT NULL
         AND fiscal_value IS NOT NULL)
    ),
    CONSTRAINT leases_sale_specific_fields_chk CHECK (
        contract_type <> 'sale'
        OR (
            COALESCE(late_fee_value, 0) = 0
            AND (late_fee_type = 'none'::late_fee_type OR late_fee_type IS NULL)
            AND COALESCE(adjustment_value, 0) = 0
        )
    )
);

CREATE INDEX idx_leases_company ON leases(company_id);
CREATE INDEX idx_leases_property_id ON leases(property_id);
CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_buyer_profile_id ON leases(buyer_profile_id);
CREATE INDEX idx_leases_owner ON leases(owner_id);
CREATE INDEX idx_leases_contract_type ON leases(contract_type);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_dates ON leases(start_date, end_date);
CREATE INDEX idx_leases_active ON leases(status) WHERE status = 'active';
CREATE INDEX idx_leases_deleted ON leases(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_leases_next_adjustment ON leases(next_adjustment_date) 
    WHERE next_adjustment_date IS NOT NULL AND status = 'active';
CREATE INDEX idx_leases_billing ON leases(billing_frequency, billing_day) 
    WHERE auto_generate_invoices = TRUE AND status = 'active';
CREATE INDEX idx_leases_previous_lease_id ON leases(previous_lease_id);

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
    withholding_iva DECIMAL(14, 2) DEFAULT 0,
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
    arca_qr_data TEXT,
    pdf_url VARCHAR(500),
    adjustment_applied DECIMAL(14, 2) DEFAULT 0,
    adjustment_index_type VARCHAR(10),
    adjustment_index_value DECIMAL(8, 4),
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

-- -----------------------------------------------------------------------------
-- Payment Items
-- -----------------------------------------------------------------------------
CREATE TABLE payment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    quantity INTEGER DEFAULT 1,
    type payment_item_type NOT NULL DEFAULT 'charge',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_items_payment ON payment_items(payment_id);

CREATE TRIGGER update_payment_items_updated_at
    BEFORE UPDATE ON payment_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE payment_items IS 'Variable items for payment receipts';

-- -----------------------------------------------------------------------------
-- Sales & Installments (Loteos)
-- -----------------------------------------------------------------------------
CREATE TABLE sale_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sale_folders_company ON sale_folders(company_id);
CREATE INDEX idx_sale_folders_deleted ON sale_folders(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_sale_folders_updated_at
    BEFORE UPDATE ON sale_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sale_folders IS 'Folders (loteos) for installment sales';

CREATE TABLE sale_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES sale_folders(id) ON DELETE CASCADE,
    buyer_name VARCHAR(200) NOT NULL,
    buyer_phone VARCHAR(50) NOT NULL,
    total_amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    installment_amount DECIMAL(14, 2) NOT NULL,
    installment_count INTEGER NOT NULL,
    start_date DATE NOT NULL,
    due_day INTEGER DEFAULT 10,
    paid_amount DECIMAL(14, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_sale_agreements_company ON sale_agreements(company_id);
CREATE INDEX idx_sale_agreements_folder ON sale_agreements(folder_id);
CREATE INDEX idx_sale_agreements_deleted ON sale_agreements(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_sale_agreements_updated_at
    BEFORE UPDATE ON sale_agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sale_agreements IS 'Installment sale agreements for loteos';

CREATE TABLE sale_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES sale_agreements(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL,
    installment_number INTEGER NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    payment_date DATE NOT NULL,
    balance_after DECIMAL(14, 2) NOT NULL,
    overdue_amount DECIMAL(14, 2) NOT NULL,
    copy_count INTEGER DEFAULT 2,
    pdf_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT sale_receipts_copy_count_check CHECK (copy_count >= 2)
);

CREATE INDEX idx_sale_receipts_agreement ON sale_receipts(agreement_id);
CREATE INDEX idx_sale_receipts_payment_date ON sale_receipts(payment_date);

CREATE TRIGGER update_sale_receipts_updated_at
    BEFORE UPDATE ON sale_receipts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sale_receipts IS 'Receipts for installment sales (duplicate required)';
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

-- -----------------------------------------------------------------------------
-- Credit Notes
-- -----------------------------------------------------------------------------
CREATE TABLE credit_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    tenant_account_id UUID REFERENCES tenant_accounts(id) ON DELETE SET NULL,
    note_number VARCHAR(50) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
    reason TEXT,
    status credit_note_status NOT NULL DEFAULT 'issued',
    pdf_url VARCHAR(500),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_credit_notes_note_number UNIQUE(note_number)
);

CREATE INDEX idx_credit_notes_invoice_id ON credit_notes(invoice_id);
CREATE INDEX idx_credit_notes_payment_id ON credit_notes(payment_id);
CREATE INDEX idx_credit_notes_tenant_account_id ON credit_notes(tenant_account_id);
CREATE INDEX idx_credit_notes_deleted ON credit_notes(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER update_credit_notes_updated_at
    BEFORE UPDATE ON credit_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE credit_notes IS 'Credit notes linked to invoices and payments';

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

-- -----------------------------------------------------------------------------
-- Bank Accounts (T811)
-- -----------------------------------------------------------------------------
CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES owners(user_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('cbu', 'cvu', 'alias')),
    bank_name VARCHAR(100),
    account_number VARCHAR(50) NOT NULL,
    cbu_cvu VARCHAR(22),
    alias VARCHAR(50),
    holder_name VARCHAR(200) NOT NULL,
    holder_cuit VARCHAR(20),
    is_virtual_alias BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT chk_bank_account_owner CHECK (
        (owner_id IS NOT NULL AND company_id IS NULL) OR
        (owner_id IS NULL AND company_id IS NOT NULL)
    )
);

CREATE INDEX idx_bank_accounts_owner ON bank_accounts(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_accounts_company ON bank_accounts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_bank_accounts_property ON bank_accounts(property_id) WHERE is_virtual_alias = TRUE;

CREATE TRIGGER update_bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bank_accounts IS 'Bank accounts for owners and companies (CBU/CVU/Alias)';

-- -----------------------------------------------------------------------------
-- Crypto Wallets (T812)
-- -----------------------------------------------------------------------------
CREATE TABLE crypto_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES owners(user_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    wallet_type VARCHAR(20) NOT NULL CHECK (wallet_type IN ('bitcoin', 'ethereum', 'lightning')),
    address VARCHAR(200) NOT NULL,
    derivation_path VARCHAR(100),
    is_hot_wallet BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    label VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT chk_crypto_wallet_owner CHECK (
        (owner_id IS NOT NULL AND company_id IS NULL) OR
        (owner_id IS NULL AND company_id IS NOT NULL)
    )
);

CREATE INDEX idx_crypto_wallets_owner ON crypto_wallets(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_crypto_wallets_company ON crypto_wallets(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_crypto_wallets_address ON crypto_wallets(address);

CREATE TRIGGER update_crypto_wallets_updated_at
    BEFORE UPDATE ON crypto_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE crypto_wallets IS 'Cryptocurrency wallets for owners and companies';

-- -----------------------------------------------------------------------------
-- Lightning Invoices (T812)
-- -----------------------------------------------------------------------------
CREATE TABLE lightning_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    payment_hash VARCHAR(64) NOT NULL UNIQUE,
    payment_request TEXT NOT NULL,
    amount_sats BIGINT NOT NULL,
    amount_fiat DECIMAL(15, 2),
    fiat_currency VARCHAR(3) DEFAULT 'ARS',
    exchange_rate DECIMAL(20, 8),
    description VARCHAR(500),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
    expires_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lightning_invoices_hash ON lightning_invoices(payment_hash);
CREATE INDEX idx_lightning_invoices_invoice ON lightning_invoices(invoice_id);
CREATE INDEX idx_lightning_invoices_status ON lightning_invoices(status) WHERE status = 'pending';

CREATE TRIGGER update_lightning_invoices_updated_at
    BEFORE UPDATE ON lightning_invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE lightning_invoices IS 'Bitcoin Lightning Network invoices for payments';

-- -----------------------------------------------------------------------------
-- Settlements (T881)
-- -----------------------------------------------------------------------------
CREATE TYPE settlement_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES owners(user_id) ON DELETE RESTRICT,
    period VARCHAR(7) NOT NULL, -- YYYY-MM
    gross_amount DECIMAL(15, 2) NOT NULL,
    commission_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    withholdings_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ARS',
    status settlement_status DEFAULT 'pending',
    scheduled_date DATE NOT NULL,
    processed_at TIMESTAMPTZ,
    transfer_reference VARCHAR(100),
    bank_account_id UUID REFERENCES bank_accounts(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uq_settlement_owner_period UNIQUE(owner_id, period)
);

CREATE INDEX idx_settlements_owner ON settlements(owner_id);
CREATE INDEX idx_settlements_status ON settlements(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_settlements_scheduled ON settlements(scheduled_date) WHERE status = 'pending';
CREATE INDEX idx_settlements_period ON settlements(period);

CREATE TRIGGER update_settlements_updated_at
    BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE settlements IS 'Owner settlements/liquidations for collected rent payments';

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

\echo '  ✓ Currencies created'

-- =============================================================================
-- SECTION 13.1: SAMPLE DATA FOR DEVELOPMENT
-- =============================================================================
-- All entities share company_id '11111111-1111-1111-1111-111111111111'
-- for coherent multi-tenant filtering
-- =============================================================================

-- Sample Company
INSERT INTO companies (id, name, legal_name, tax_id, email, phone, country, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'RentFlow Demo',
    'RentFlow Demo S.A.',
    '30-12345678-9',
    'admin@rentflow.demo',
    '+54 11 1234-5678',
    'Argentina',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample company created'

-- Sample Admin User
INSERT INTO users (id, company_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'admin@rentflow.demo',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF',
    'Admin',
    'Demo',
    'admin',
    TRUE,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample admin user created'

-- Sample Owner User (owner needs a user first)
INSERT INTO users (id, company_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    'owner@rentflow.demo',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF',
    'Carlos',
    'Propietario',
    'owner',
    TRUE,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Owner
INSERT INTO owners (id, company_id, user_id, tax_id, bank_name, bank_account_number, commission_rate, created_at, updated_at)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333331',
    '20-12345678-9',
    'Banco Nación',
    '0110012345678901234567',
    8.00,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample owner created'

-- Sample Property
INSERT INTO properties (id, company_id, owner_id, name, property_type, address_street, address_number, address_city, address_state, address_country, address_postal_code, created_at, updated_at)
VALUES (
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'Edificio Demo',
    'apartment',
    'Av. Corrientes',
    '1234',
    'Buenos Aires',
    'CABA',
    'Argentina',
    'C1000AAA',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample property created'

-- Sample Unit
INSERT INTO units (id, property_id, company_id, unit_number, floor, bedrooms, bathrooms, area, status, created_at, updated_at)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444',
    '11111111-1111-1111-1111-111111111111',
    '1A',
    '1',
    2,
    1,
    60.00,
    'occupied',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample unit created'

-- Sample Tenant User
INSERT INTO users (id, company_id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    '66666666-6666-6666-6666-666666666666',
    '11111111-1111-1111-1111-111111111111',
    'tenant@example.com',
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF',
    'Juan',
    'Pérez',
    'tenant',
    TRUE,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

-- Sample Tenant Profile
INSERT INTO tenants (id, company_id, user_id, dni, emergency_contact_name, emergency_contact_phone, created_at, updated_at)
VALUES (
    '77777777-7777-7777-7777-777777777777',
    '11111111-1111-1111-1111-111111111111',
    '66666666-6666-6666-6666-666666666666',
    '12345678',
    'María García',
    '+54 11 5555-1234',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample tenant created'

-- Sample Lease
INSERT INTO leases (id, company_id, property_id, tenant_id, owner_id, contract_type, start_date, end_date, monthly_rent, currency, billing_day, status, adjustment_type, adjustment_frequency_months, created_at, updated_at)
VALUES (
    '88888888-8888-8888-8888-888888888888',
    '11111111-1111-1111-1111-111111111111',
    '44444444-4444-4444-4444-444444444444',
    '77777777-7777-7777-7777-777777777777',
    '33333333-3333-3333-3333-333333333333',
    'rental',
    '2025-01-01',
    '2027-01-01',
    250000.00,
    'ARS',
    1,
    'active',
    'inflation_index',
    3,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample lease created'

-- Sample Tenant Account
INSERT INTO tenant_accounts (id, company_id, lease_id, tenant_id, current_balance, created_at, updated_at)
VALUES (
    '99999999-9999-9999-9999-999999999999',
    '11111111-1111-1111-1111-111111111111',
    '88888888-8888-8888-8888-888888888888',
    '77777777-7777-7777-7777-777777777777',
    0.00,
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample tenant account created'

-- Sample Invoices (for current and previous months)
INSERT INTO invoices (id, company_id, lease_id, owner_id, tenant_account_id, invoice_number, status, issue_date, due_date, period_start, period_end, subtotal, tax_amount, total_amount, currency, created_at, updated_at)
VALUES
    -- Current month invoice
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     '88888888-8888-8888-8888-888888888888',
     '33333333-3333-3333-3333-333333333333',
     '99999999-9999-9999-9999-999999999999',
     'INV-2025-001',
     'paid',
     DATE_TRUNC('month', CURRENT_DATE)::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '10 days')::date,
     DATE_TRUNC('month', CURRENT_DATE)::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
     250000.00,
     0.00,
     250000.00,
     'ARS',
     NOW(),
     NOW()),
    -- Previous month invoice
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '11111111-1111-1111-1111-111111111111',
     '88888888-8888-8888-8888-888888888888',
     '33333333-3333-3333-3333-333333333333',
     '99999999-9999-9999-9999-999999999999',
     'INV-2025-002',
     'paid',
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '10 days')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::date,
     250000.00,
     0.00,
     250000.00,
     'ARS',
     NOW(),
     NOW())
ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample invoices created'

-- Sample Payments
INSERT INTO payments (id, company_id, tenant_id, tenant_account_id, invoice_id, amount, payment_date, payment_method, status, reference_number, created_at, updated_at)
VALUES
    -- Payment for current month
    ('cccccccc-cccc-cccc-cccc-cccccccccccc',
     '11111111-1111-1111-1111-111111111111',
     '77777777-7777-7777-7777-777777777777',
     '99999999-9999-9999-9999-999999999999',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     250000.00,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days')::date,
     'bank_transfer',
     'completed',
     'TRF-001',
     NOW(),
     NOW()),
    -- Payment for previous month
    ('dddddddd-dddd-dddd-dddd-dddddddddddd',
     '11111111-1111-1111-1111-111111111111',
     '77777777-7777-7777-7777-777777777777',
     '99999999-9999-9999-9999-999999999999',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     250000.00,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '5 days')::date,
     'bank_transfer',
     'completed',
     'TRF-002',
     NOW(),
     NOW())
ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample payments created'

-- Sample Commission Invoices (paid commissions for current month)
-- Expected total for current month: ARS 34,400 (20,000 + 14,400)
INSERT INTO commission_invoices (id, company_id, owner_id, invoice_number, status, period_start, period_end, issue_date, due_date, base_amount, commission_rate, commission_amount, tax_amount, total_amount, currency, paid_amount, paid_at, payment_reference, created_at, updated_at)
VALUES
    -- Commission for current month (paid) - 8% of 250,000 = 20,000
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
     '11111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'COM-2025-001',
     'paid',
     DATE_TRUNC('month', CURRENT_DATE)::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '15 days')::date,
     250000.00,
     8.00,
     20000.00,
     4200.00,
     24200.00,
     'ARS',
     24200.00,
     DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '7 days',
     'COM-PAY-001',
     NOW(),
     NOW()),
    -- Second commission for current month (paid) - another property/invoice
    ('ffffffff-ffff-ffff-ffff-ffffffffffff',
     '11111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'COM-2025-002',
     'paid',
     DATE_TRUNC('month', CURRENT_DATE)::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '5 days')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '15 days')::date,
     180000.00,
     8.00,
     14400.00,
     3024.00,
     17424.00,
     'ARS',
     17424.00,
     DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '8 days',
     'COM-PAY-002',
     NOW(),
     NOW()),
    -- Commission for previous month (paid) - should NOT appear in current month total
    ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     '11111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'COM-2024-012',
     'paid',
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '25 days')::date,
     (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '15 days')::date,
     250000.00,
     8.00,
     20000.00,
     4200.00,
     24200.00,
     'ARS',
     24200.00,
     DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '20 days',
     'COM-PAY-OLD',
     NOW(),
     NOW()),
    -- Commission for current month (pending - should NOT appear in paid commissions total)
    ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     '11111111-1111-1111-1111-111111111111',
     '33333333-3333-3333-3333-333333333333',
     'COM-2025-003',
     'pending',
     DATE_TRUNC('month', CURRENT_DATE)::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '10 days')::date,
     (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '20 days')::date,
     150000.00,
     8.00,
     12000.00,
     2520.00,
     14520.00,
     'ARS',
     0.00,
     NULL,
     NULL,
     NOW(),
     NOW())
ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample commission invoices created'

-- Sample Billing Jobs for recent activity display
INSERT INTO billing_jobs (id, job_type, status, started_at, completed_at, duration_ms, records_total, records_processed, records_failed, records_skipped, parameters, dry_run, created_at, updated_at)
VALUES
    ('b0b11111-1111-1111-1111-111111111111', 'billing', 'completed', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '5 seconds', 5000, 10, 10, 0, 0, '{}', false, NOW(), NOW()),
    ('b0b22222-2222-2222-2222-222222222222', 'overdue', 'completed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '2 seconds', 2000, 5, 5, 0, 0, '{}', false, NOW(), NOW()),
    ('b0b33333-3333-3333-3333-333333333333', 'sync_indices', 'completed', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours' + INTERVAL '10 seconds', 10000, 24, 24, 0, 0, '{"index": "icl"}', false, NOW(), NOW()),
    ('b0b44444-4444-4444-4444-444444444444', 'exchange_rates', 'completed', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours' + INTERVAL '3 seconds', 3000, 6, 6, 0, 0, '{}', false, NOW(), NOW()),
    ('b0b55555-5555-5555-5555-555555555555', 'reports', 'partial_failure', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours' + INTERVAL '15 seconds', 15000, 8, 6, 2, 0, '{"period": "2025-12"}', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

\echo '  ✓ Sample billing jobs created'

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
\echo '  - Core: companies, users, owners, tenants, interested_profiles,'
\echo '          staff, admins'
\echo '  - Properties: properties, units, property_features'
\echo '                property_visits, property_visit_notifications,'
\echo '                interested_property_matches'
\echo '  - Documents: documents'
\echo '  - Leases: leases, lease_amendments'
\echo '  - Financial: tenant_accounts, movements, invoices,'
\echo '               commission_invoices, payments, receipts'
\echo '  - Banking: bank_accounts, crypto_wallets, lightning_invoices'
\echo '  - Settlements: settlements'
\echo '  - Reference: currencies, inflation_indices, exchange_rates'
\echo '  - System: notification_preferences, billing_jobs'
\echo '  - Audit: audit.logs'
\echo ''
\echo 'Datos de muestra (company_id: 11111111-1111-1111-1111-111111111111):'
\echo '  - Company: RentFlow Demo'
\echo '  - Admin: admin@rentflow.demo'
\echo '  - Owner: 1 (commission rate 8%)'
\echo '  - Property: 1 (Edificio Demo)'
\echo '  - Unit: 1 (1A)'
\echo '  - Tenant: 1 (Juan Pérez)'
\echo '  - Lease: 1 (active, ARS 250,000/month)'
\echo '  - Invoices: 2 (current + previous month)'
\echo '  - Payments: 2'
\echo '  - Commission Invoices: 4 (2 paid current month, 1 paid previous, 1 pending)'
\echo '  - Billing Jobs: 5'
\echo ''
\echo 'Valores esperados del Dashboard:'
\echo '  - Total Properties: 1'
\echo '  - Total Tenants: 1'
\echo '  - Active Leases: 1'
\echo '  - Monthly Income: ARS 250,000'
\echo '  - Monthly Commissions (paid): ARS 34,400'
\echo '  - Total Payments: 2'
\echo '  - Total Invoices: 2'
\echo ''
\echo '========================================='
