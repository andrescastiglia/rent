-- =============================================================================
-- RentFlow - Migracion de esquema segun historias-de-usuario.md
-- =============================================================================
-- Objetivo:
-- 1) Integrar interesados con visitas y matching de propiedades
-- 2) Optimizar busquedas por apellido de inquilino y monto de inversion en ventas
-- 3) Reforzar requisito de recibos de ventas por duplicado
--
-- Script idempotente para bases ya existentes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- ENUM types nuevos para CRM de interesados
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interested_status') THEN
        CREATE TYPE interested_status AS ENUM (
            'new', 'qualified', 'matching', 'visit_scheduled', 'offer_made', 'won', 'lost'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interested_match_status') THEN
        CREATE TYPE interested_match_status AS ENUM (
            'suggested', 'contacted', 'visit_scheduled', 'accepted', 'rejected', 'expired'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interested_qualification_level') THEN
        CREATE TYPE interested_qualification_level AS ENUM ('mql', 'sql', 'rejected');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interested_activity_type') THEN
        CREATE TYPE interested_activity_type AS ENUM (
            'call', 'task', 'note', 'email', 'whatsapp', 'visit'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interested_activity_status') THEN
        CREATE TYPE interested_activity_status AS ENUM ('pending', 'completed', 'cancelled');
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- US-TENANT-01: busqueda rapida por apellido
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name_ci ON users(LOWER(last_name));

-- -----------------------------------------------------------------------------
-- US-SEARCH-02 / Integracion de interesados
-- -----------------------------------------------------------------------------
ALTER TABLE interested_profiles
    ADD COLUMN IF NOT EXISTS preferred_zones TEXT[],
    ADD COLUMN IF NOT EXISTS status interested_status,
    ADD COLUMN IF NOT EXISTS qualification_level interested_qualification_level,
    ADD COLUMN IF NOT EXISTS qualification_notes TEXT,
    ADD COLUMN IF NOT EXISTS source VARCHAR(100),
    ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS organization_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS next_contact_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lost_reason TEXT,
    ADD COLUMN IF NOT EXISTS consent_contact BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS converted_to_tenant_id UUID REFERENCES tenants(id),
    ADD COLUMN IF NOT EXISTS converted_to_sale_agreement_id UUID;

UPDATE interested_profiles
SET status = 'new'
WHERE status IS NULL;

ALTER TABLE interested_profiles
    ALTER COLUMN status SET DEFAULT 'new';

ALTER TABLE interested_profiles
    ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'interested_profiles_people_count_check'
    ) THEN
        ALTER TABLE interested_profiles
            ADD CONSTRAINT interested_profiles_people_count_check
            CHECK (people_count IS NULL OR people_count > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'interested_profiles_max_amount_check'
    ) THEN
        ALTER TABLE interested_profiles
            ADD CONSTRAINT interested_profiles_max_amount_check
            CHECK (max_amount IS NULL OR max_amount >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_interested_status ON interested_profiles(status);
CREATE INDEX IF NOT EXISTS idx_interested_qualification_level ON interested_profiles(qualification_level);
CREATE INDEX IF NOT EXISTS idx_interested_assigned_to ON interested_profiles(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_interested_next_contact_at
    ON interested_profiles(next_contact_at) WHERE next_contact_at IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_interested_company_phone_operation_unique'
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM interested_profiles
            WHERE deleted_at IS NULL
            GROUP BY company_id, phone, operation
            HAVING COUNT(*) > 1
        ) THEN
            RAISE NOTICE 'Se omite idx_interested_company_phone_operation_unique: existen duplicados activos por company_id/phone/operation';
        ELSE
            CREATE UNIQUE INDEX idx_interested_company_phone_operation_unique
                ON interested_profiles(company_id, phone, operation)
                WHERE deleted_at IS NULL;
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- US-SEARCH-01: filtro por monto de inversion (venta)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_properties_sale_price
    ON properties(sale_price) WHERE sale_price IS NOT NULL;

-- -----------------------------------------------------------------------------
-- US-PROP-02: visitas vinculadas a interesado
-- -----------------------------------------------------------------------------
ALTER TABLE property_visits
    ADD COLUMN IF NOT EXISTS interested_profile_id UUID REFERENCES interested_profiles(id) ON DELETE SET NULL;

ALTER TABLE property_visits
    ALTER COLUMN interested_name DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'property_visits_interested_ref_check'
    ) THEN
        ALTER TABLE property_visits
            ADD CONSTRAINT property_visits_interested_ref_check
            CHECK (interested_profile_id IS NOT NULL OR interested_name IS NOT NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_property_visits_interested_profile
    ON property_visits(interested_profile_id)
    WHERE interested_profile_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- US-SEARCH-03: busqueda cruzada (match) con trazabilidad
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interested_property_matches (
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

CREATE INDEX IF NOT EXISTS idx_interested_property_matches_company
    ON interested_property_matches(company_id);
CREATE INDEX IF NOT EXISTS idx_interested_property_matches_interested
    ON interested_property_matches(interested_profile_id);
CREATE INDEX IF NOT EXISTS idx_interested_property_matches_property
    ON interested_property_matches(property_id);
CREATE INDEX IF NOT EXISTS idx_interested_property_matches_status
    ON interested_property_matches(status);
CREATE INDEX IF NOT EXISTS idx_interested_property_matches_score
    ON interested_property_matches(score DESC) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interested_property_matches_deleted
    ON interested_property_matches(deleted_at) WHERE deleted_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_interested_property_matches_updated_at'
    ) THEN
        CREATE TRIGGER update_interested_property_matches_updated_at
            BEFORE UPDATE ON interested_property_matches
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

COMMENT ON TABLE interested_property_matches IS 'Cross-search results between interested profiles and properties';

CREATE TABLE IF NOT EXISTS interested_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    from_status interested_status NOT NULL,
    to_status interested_status NOT NULL,
    reason TEXT,
    changed_by_user_id UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interested_stage_history_profile
    ON interested_stage_history(interested_profile_id);
CREATE INDEX IF NOT EXISTS idx_interested_stage_history_changed_at
    ON interested_stage_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_interested_stage_history_to_status
    ON interested_stage_history(to_status);

CREATE TABLE IF NOT EXISTS interested_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interested_profile_id UUID NOT NULL REFERENCES interested_profiles(id) ON DELETE CASCADE,
    type interested_activity_type NOT NULL,
    status interested_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    template_name VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interested_activities_profile
    ON interested_activities(interested_profile_id);
CREATE INDEX IF NOT EXISTS idx_interested_activities_status
    ON interested_activities(status);
CREATE INDEX IF NOT EXISTS idx_interested_activities_due_at
    ON interested_activities(due_at) WHERE due_at IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_interested_activities_updated_at'
    ) THEN
        CREATE TRIGGER update_interested_activities_updated_at
            BEFORE UPDATE ON interested_activities
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- US-SALES-03: impresion duplicada obligatoria
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sale_receipts_copy_count_check'
    ) THEN
        ALTER TABLE sale_receipts
            ADD CONSTRAINT sale_receipts_copy_count_check CHECK (copy_count >= 2);
    END IF;
END $$;

COMMIT;
