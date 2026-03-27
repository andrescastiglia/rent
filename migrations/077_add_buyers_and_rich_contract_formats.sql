-- Migration: 077_add_buyers_and_rich_contract_formats.sql
-- Description: Introduce dedicated buyers, preserve rich contract/template
--              formats, and default companies to Buenos Aires timezone data.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumtypid = 'user_role'::regtype
          AND enumlabel = 'buyer'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'buyer';
    END IF;
END $$;

ALTER TABLE users
    ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

UPDATE users
SET permissions = '{}'::jsonb
WHERE permissions IS NULL;

ALTER TABLE users
    ALTER COLUMN permissions SET DEFAULT '{}'::jsonb;

ALTER TABLE users
    ALTER COLUMN permissions SET NOT NULL;

ALTER TABLE lease_contract_templates
    ADD COLUMN IF NOT EXISTS template_format VARCHAR(20) NOT NULL DEFAULT 'plain_text';

ALTER TABLE lease_contract_templates
    ADD COLUMN IF NOT EXISTS source_file_name VARCHAR(255);

ALTER TABLE lease_contract_templates
    ADD COLUMN IF NOT EXISTS source_mime_type VARCHAR(120);

UPDATE lease_contract_templates
SET template_format = 'plain_text'
WHERE template_format IS NULL;

ALTER TABLE interested_profiles
    ADD COLUMN IF NOT EXISTS converted_to_buyer_id UUID;

CREATE TABLE IF NOT EXISTS buyers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    interested_profile_id UUID REFERENCES interested_profiles(id) ON DELETE SET NULL,
    dni VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT buyers_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_buyers_company ON buyers(company_id);
CREATE INDEX IF NOT EXISTS idx_buyers_user ON buyers(user_id);
CREATE INDEX IF NOT EXISTS idx_buyers_interested_profile ON buyers(interested_profile_id);
CREATE INDEX IF NOT EXISTS idx_buyers_deleted ON buyers(deleted_at) WHERE deleted_at IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'buyers_interested_profile_unique'
    ) THEN
        ALTER TABLE buyers
            ADD CONSTRAINT buyers_interested_profile_unique UNIQUE (interested_profile_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'interested_profiles_converted_to_buyer_fk'
    ) THEN
        ALTER TABLE interested_profiles
            ADD CONSTRAINT interested_profiles_converted_to_buyer_fk
            FOREIGN KEY (converted_to_buyer_id)
            REFERENCES buyers(id)
            ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE sale_agreements
    ADD COLUMN IF NOT EXISTS buyer_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'sale_agreements_buyer_id_fkey'
    ) THEN
        ALTER TABLE sale_agreements
            ADD CONSTRAINT sale_agreements_buyer_id_fkey
            FOREIGN KEY (buyer_id)
            REFERENCES buyers(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sale_agreements_buyer ON sale_agreements(buyer_id);

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS buyer_id UUID;

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS draft_contract_format VARCHAR(20);

ALTER TABLE leases
    ADD COLUMN IF NOT EXISTS confirmed_contract_format VARCHAR(20);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leases_buyer_id_fkey'
    ) THEN
        ALTER TABLE leases
            ADD CONSTRAINT leases_buyer_id_fkey
            FOREIGN KEY (buyer_id)
            REFERENCES buyers(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leases_buyer_id ON leases(buyer_id);

UPDATE leases
SET draft_contract_format = COALESCE(draft_contract_format, 'plain_text'),
    confirmed_contract_format = COALESCE(
        confirmed_contract_format,
        CASE
            WHEN confirmed_contract_text IS NOT NULL THEN COALESCE(draft_contract_format, 'plain_text')
            ELSE NULL
        END
    )
WHERE draft_contract_format IS NULL
   OR confirmed_contract_format IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'leases'
          AND column_name = 'buyer_profile_id'
    ) THEN
        WITH buyer_candidates AS (
            SELECT
                ip.id AS interested_profile_id,
                ip.company_id,
                COALESCE(NULLIF(trim(ip.first_name), ''), 'Comprador') AS first_name,
                COALESCE(NULLIF(trim(ip.last_name), ''), 'Demo') AS last_name,
                ip.phone,
                lower(
                    COALESCE(
                        NULLIF(trim(ip.email), ''),
                        format('buyer.%s@rentflow.local', replace(ip.id::text, '-', ''))
                    )
                ) AS resolved_email,
                ip.notes
            FROM interested_profiles ip
            WHERE ip.deleted_at IS NULL
              AND (
                    ip.status = 'buyer'
                 OR ip.converted_to_sale_agreement_id IS NOT NULL
                 OR EXISTS (
                        SELECT 1
                        FROM leases l
                        WHERE l.buyer_profile_id = ip.id
                          AND l.deleted_at IS NULL
                    )
              )
        ),
        inserted_users AS (
            INSERT INTO users (
                id, company_id, email, password_hash, role,
                first_name, last_name, phone, is_active, permissions,
                created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                candidate.company_id,
                candidate.resolved_email,
                crypt('buyer123', gen_salt('bf')),
                'buyer'::user_role,
                candidate.first_name,
                candidate.last_name,
                candidate.phone,
                TRUE,
                '{}'::jsonb,
                NOW(),
                NOW()
            FROM buyer_candidates candidate
            LEFT JOIN users existing_user
                ON lower(existing_user.email) = candidate.resolved_email
               AND existing_user.deleted_at IS NULL
            WHERE existing_user.id IS NULL
        )
        INSERT INTO buyers (
            id, user_id, company_id, interested_profile_id, notes, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            matched_user.id,
            candidate.company_id,
            candidate.interested_profile_id,
            candidate.notes,
            NOW(),
            NOW()
        FROM buyer_candidates candidate
        JOIN users matched_user
            ON lower(matched_user.email) = candidate.resolved_email
           AND matched_user.deleted_at IS NULL
           AND matched_user.role = 'buyer'::user_role
        LEFT JOIN buyers existing_buyer
            ON existing_buyer.interested_profile_id = candidate.interested_profile_id
           AND existing_buyer.deleted_at IS NULL
        WHERE existing_buyer.id IS NULL;

        UPDATE interested_profiles ip
        SET converted_to_buyer_id = buyer.id
        FROM buyers buyer
        WHERE buyer.interested_profile_id = ip.id
          AND ip.converted_to_buyer_id IS NULL;

        UPDATE sale_agreements agreement
        SET buyer_id = buyer.id
        FROM interested_profiles ip
        JOIN buyers buyer
            ON buyer.interested_profile_id = ip.id
           AND buyer.deleted_at IS NULL
        WHERE ip.converted_to_sale_agreement_id = agreement.id
          AND agreement.buyer_id IS NULL;

        UPDATE leases lease
        SET buyer_id = buyer.id
        FROM buyers buyer
        WHERE buyer.interested_profile_id = lease.buyer_profile_id
          AND lease.buyer_id IS NULL;
    END IF;
END $$;

UPDATE companies
SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{timezone}',
    to_jsonb('America/Argentina/Buenos_Aires'::text),
    true
)
WHERE settings IS NULL
   OR settings->>'timezone' IS NULL
   OR settings->>'timezone' = 'America/Argentina/Jujuy';

UPDATE companies
SET city = 'Buenos Aires',
    state = 'CABA'
WHERE city IS NULL
   OR state IS NULL
   OR lower(city) = 'jujuy'
   OR lower(state) = 'jujuy';
