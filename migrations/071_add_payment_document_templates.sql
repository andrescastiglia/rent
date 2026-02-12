-- =============================================================================
-- Migration: 071_add_payment_document_templates.sql
-- Description: Add configurable templates for receipts, invoices and credit
--              notes.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'payment_document_template_type'
    ) THEN
        CREATE TYPE payment_document_template_type AS ENUM (
            'receipt',
            'invoice',
            'credit_note'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS payment_document_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    type payment_document_template_type NOT NULL,
    name VARCHAR(120) NOT NULL,
    template_body TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_document_templates_company_id
    ON payment_document_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_document_templates_type
    ON payment_document_templates(type);
CREATE INDEX IF NOT EXISTS idx_payment_document_templates_active
    ON payment_document_templates(company_id, type, is_active)
    WHERE deleted_at IS NULL;
