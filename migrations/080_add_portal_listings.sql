DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_name') THEN
    CREATE TYPE portal_name AS ENUM ('zonaprop', 'argenprop', 'mercadolibre', 'properati', 'navent');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portal_listing_status') THEN
    CREATE TYPE portal_listing_status AS ENUM ('draft', 'published', 'paused', 'removed', 'error');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS portal_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    portal portal_name NOT NULL,
    status portal_listing_status NOT NULL DEFAULT 'draft',
    external_id VARCHAR(255),
    external_url TEXT,
    published_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    error_message TEXT,
    listing_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, property_id, portal)
);
CREATE INDEX IF NOT EXISTS idx_portal_listings_company ON portal_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_portal_listings_property ON portal_listings(property_id);
CREATE TRIGGER update_portal_listings_updated_at BEFORE UPDATE ON portal_listings FOR EACH ROW EXECUTE FUNCTION functions.update_updated_at_column();
