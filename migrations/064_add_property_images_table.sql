-- =============================================================================
-- Migration: 064_add_property_images_table.sql
-- Description: Store property images in database (bytea)
-- =============================================================================

CREATE TABLE IF NOT EXISTS property_images (
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

CREATE INDEX IF NOT EXISTS idx_property_images_company
    ON property_images(company_id);

CREATE INDEX IF NOT EXISTS idx_property_images_property
    ON property_images(property_id);

CREATE INDEX IF NOT EXISTS idx_property_images_temp
    ON property_images(is_temporary);

CREATE INDEX IF NOT EXISTS idx_property_images_created
    ON property_images(created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_property_images_updated_at'
    ) THEN
        CREATE TRIGGER update_property_images_updated_at
            BEFORE UPDATE ON property_images
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
