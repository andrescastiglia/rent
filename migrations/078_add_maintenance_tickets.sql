-- =============================================================================
-- Migration: 078_add_maintenance_tickets.sql
-- Description: Add dedicated maintenance ticket system separated from
--              property_visits. Supports full ticket lifecycle with staff
--              assignment, status tracking, cost logging, and history.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_ticket_status') THEN
        CREATE TYPE maintenance_ticket_status AS ENUM (
            'open',
            'assigned',
            'in_progress',
            'pending_parts',
            'resolved',
            'closed',
            'cancelled'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_ticket_priority') THEN
        CREATE TYPE maintenance_ticket_priority AS ENUM (
            'low',
            'medium',
            'high',
            'urgent'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_ticket_area') THEN
        CREATE TYPE maintenance_ticket_area AS ENUM (
            'kitchen',
            'bathroom',
            'bedroom',
            'living_room',
            'electrical',
            'plumbing',
            'heating_cooling',
            'exterior',
            'common_area',
            'other'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_ticket_source') THEN
        CREATE TYPE maintenance_ticket_source AS ENUM (
            'tenant',
            'owner',
            'staff',
            'admin',
            'inspection'
        );
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- maintenance_tickets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_tickets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    -- Reporter / requestor
    reported_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    source              maintenance_ticket_source NOT NULL DEFAULT 'admin',
    -- Assignment
    assigned_to_staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    assigned_at         TIMESTAMPTZ,
    -- Ticket details
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    area                maintenance_ticket_area NOT NULL DEFAULT 'other',
    priority            maintenance_ticket_priority NOT NULL DEFAULT 'medium',
    status              maintenance_ticket_status NOT NULL DEFAULT 'open',
    -- Scheduling
    scheduled_at        TIMESTAMPTZ,
    -- Resolution
    resolved_at         TIMESTAMPTZ,
    resolution_notes    TEXT,
    -- Cost tracking
    estimated_cost      DECIMAL(12, 2),
    actual_cost         DECIMAL(12, 2),
    cost_currency       VARCHAR(3) NOT NULL DEFAULT 'ARS',
    -- External reference (invoice, receipt number)
    external_ref        VARCHAR(255),
    -- Metadata
    metadata            JSONB DEFAULT '{}',
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE maintenance_tickets IS 'Maintenance and repair tickets for properties. Supports full lifecycle from report to resolution with cost tracking.';
COMMENT ON COLUMN maintenance_tickets.source IS 'Who created the ticket: tenant self-service, owner request, staff inspection, or admin';
COMMENT ON COLUMN maintenance_tickets.area IS 'Area of the property where the issue is located';
COMMENT ON COLUMN maintenance_tickets.priority IS 'Urgency level: low, medium, high, urgent';
COMMENT ON COLUMN maintenance_tickets.status IS 'Ticket lifecycle status';
COMMENT ON COLUMN maintenance_tickets.estimated_cost IS 'Cost estimate before work begins';
COMMENT ON COLUMN maintenance_tickets.actual_cost IS 'Actual cost after completion';

-- ─────────────────────────────────────────────────────────────────────────────
-- maintenance_ticket_comments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_ticket_comments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id   UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT false, -- internal = only visible to admin/staff
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE maintenance_ticket_comments IS 'Comments and updates on maintenance tickets. Internal comments are only visible to admin/staff.';
COMMENT ON COLUMN maintenance_ticket_comments.is_internal IS 'If true, only admin and staff can see this comment (not tenants or owners)';

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_company_id
    ON maintenance_tickets(company_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_property_id
    ON maintenance_tickets(property_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_assigned_staff
    ON maintenance_tickets(assigned_to_staff_id)
    WHERE assigned_to_staff_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status
    ON maintenance_tickets(company_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_priority
    ON maintenance_tickets(company_id, priority, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_reported_by
    ON maintenance_tickets(reported_by_user_id)
    WHERE reported_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_ticket_comments_ticket
    ON maintenance_ticket_comments(ticket_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER update_maintenance_tickets_updated_at
    BEFORE UPDATE ON maintenance_tickets
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

CREATE TRIGGER update_maintenance_ticket_comments_updated_at
    BEFORE UPDATE ON maintenance_ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();
