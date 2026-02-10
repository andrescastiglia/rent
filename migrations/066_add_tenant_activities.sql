-- =============================================================================
-- Migration: 066_add_tenant_activities.sql
-- Description: Add tenant activities for CRM and follow-up management.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'tenant_activity_type'
    ) THEN
        CREATE TYPE tenant_activity_type AS ENUM (
            'call',
            'task',
            'note',
            'email',
            'whatsapp',
            'visit'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'tenant_activity_status'
    ) THEN
        CREATE TYPE tenant_activity_status AS ENUM ('pending', 'completed', 'cancelled');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    type tenant_activity_type NOT NULL,
    status tenant_activity_status NOT NULL DEFAULT 'pending',
    subject VARCHAR(200) NOT NULL,
    body TEXT NULL,
    due_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_activities_tenant_id
    ON tenant_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_activities_company_id
    ON tenant_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_activities_status
    ON tenant_activities(status);
