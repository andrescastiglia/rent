-- =============================================================================
-- Migration: 067_add_lease_templates_and_versioning.sql
-- Description: Add contract templates, draft/confirmed text fields, and lease
--              versioning support.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lease_contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    name VARCHAR(120) NOT NULL,
    contract_type contract_type NOT NULL,
    template_body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS template_id UUID NULL,
    ADD COLUMN IF NOT EXISTS template_name VARCHAR(120) NULL,
    ADD COLUMN IF NOT EXISTS draft_contract_text TEXT NULL,
    ADD COLUMN IF NOT EXISTS confirmed_contract_text TEXT NULL,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS previous_lease_id UUID NULL,
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'leases'
          AND constraint_name = 'fk_leases_template_id'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT fk_leases_template_id
            FOREIGN KEY (template_id) REFERENCES lease_contract_templates(id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'leases'
          AND constraint_name = 'fk_leases_previous_lease_id'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT fk_leases_previous_lease_id
            FOREIGN KEY (previous_lease_id) REFERENCES leases(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lease_contract_templates_company_id
    ON lease_contract_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_lease_contract_templates_contract_type
    ON lease_contract_templates(contract_type);
CREATE INDEX IF NOT EXISTS idx_leases_previous_lease_id
    ON leases(previous_lease_id);
