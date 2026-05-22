-- =============================================================================
-- Migration: 081_align_runtime_schema_contracts.sql
-- Description: Align production schema with current TypeORM entities and
--              runtime flows for bank accounts, notifications, digital
--              signatures, payment gateway transactions, and settlements.
-- =============================================================================

-- Lease statuses used by the digital signature flow.
ALTER TYPE lease_status ADD VALUE IF NOT EXISTS 'pending_signature';
ALTER TYPE lease_status ADD VALUE IF NOT EXISTS 'signed';

-- -----------------------------------------------------------------------------
-- Digital signature requests
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digital_signature_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'docusign',
    external_envelope_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    tenant_email VARCHAR(255) NOT NULL,
    tenant_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255),
    owner_name VARCHAR(255),
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    signing_url TEXT,
    owner_signing_url TEXT,
    certificate_url TEXT,
    webhook_events JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE digital_signature_requests
    ADD COLUMN IF NOT EXISTS tenant_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tenant_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS owner_signing_url TEXT,
    ADD COLUMN IF NOT EXISTS certificate_url TEXT,
    ADD COLUMN IF NOT EXISTS webhook_events JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_digital_signature_requests_company
    ON digital_signature_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_digital_signature_requests_lease
    ON digital_signature_requests(lease_id);
CREATE INDEX IF NOT EXISTS idx_digital_signature_requests_external_envelope
    ON digital_signature_requests(external_envelope_id)
    WHERE external_envelope_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_digital_signature_requests_updated_at
    ON digital_signature_requests;
CREATE TRIGGER update_digital_signature_requests_updated_at
    BEFORE UPDATE ON digital_signature_requests
    FOR EACH ROW
    EXECUTE FUNCTION functions.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Bank accounts
-- -----------------------------------------------------------------------------
ALTER TABLE bank_accounts
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS cbu VARCHAR(100),
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ARS',
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE bank_accounts ba
SET cbu = COALESCE(ba.cbu, ba.cbu_cvu)
WHERE ba.cbu IS NULL
  AND ba.cbu_cvu IS NOT NULL;

UPDATE bank_accounts ba
SET user_id = COALESCE(ba.user_id, o.user_id)
FROM owners o
WHERE ba.user_id IS NULL
  AND (ba.owner_id = o.id OR ba.owner_id = o.user_id);

UPDATE bank_accounts ba
SET owner_id = o.id
FROM owners o
WHERE ba.owner_id = o.user_id;

ALTER TABLE bank_accounts
    ALTER COLUMN currency SET DEFAULT 'ARS',
    ALTER COLUMN is_default SET DEFAULT FALSE,
    ALTER COLUMN holder_name DROP NOT NULL;

ALTER TABLE bank_accounts
    DROP CONSTRAINT IF EXISTS chk_bank_account_owner,
    DROP CONSTRAINT IF EXISTS bank_accounts_account_type_check,
    DROP CONSTRAINT IF EXISTS bank_accounts_owner_id_fkey,
    DROP CONSTRAINT IF EXISTS bank_accounts_user_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bank_accounts_owner_id_fkey'
          AND conrelid = 'bank_accounts'::regclass
    ) THEN
        ALTER TABLE bank_accounts
            ADD CONSTRAINT bank_accounts_owner_id_fkey
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'bank_accounts_user_id_fkey'
          AND conrelid = 'bank_accounts'::regclass
    ) THEN
        ALTER TABLE bank_accounts
            ADD CONSTRAINT bank_accounts_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user
    ON bank_accounts(user_id)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_accounts_default
    ON bank_accounts(company_id, owner_id, is_default)
    WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Notification preferences
-- -----------------------------------------------------------------------------
ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS company_id UUID,
    ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'whatsapp',
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS custom_data JSONB;

UPDATE notification_preferences np
SET company_id = COALESCE(np.company_id, u.company_id),
    is_enabled = COALESCE(np.is_enabled, np.email_enabled, TRUE),
    channel = COALESCE(np.channel, 'whatsapp')
FROM users u
WHERE np.user_id = u.id;

ALTER TABLE notification_preferences
    ALTER COLUMN channel SET DEFAULT 'whatsapp',
    ALTER COLUMN is_enabled SET DEFAULT TRUE,
    DROP CONSTRAINT IF EXISTS notification_preferences_company_id_fkey,
    DROP CONSTRAINT IF EXISTS notification_preferences_unique,
    DROP CONSTRAINT IF EXISTS notification_preferences_user_type_channel_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notification_preferences_company_id_fkey'
          AND conrelid = 'notification_preferences'::regclass
    ) THEN
        ALTER TABLE notification_preferences
            ADD CONSTRAINT notification_preferences_company_id_fkey
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notification_preferences_user_type_channel_unique'
          AND conrelid = 'notification_preferences'::regclass
    ) THEN
        ALTER TABLE notification_preferences
            ADD CONSTRAINT notification_preferences_user_type_channel_unique
            UNIQUE (user_id, company_id, notification_type, channel);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notification_preferences_company
    ON notification_preferences(company_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled
    ON notification_preferences(user_id, is_enabled)
    WHERE is_enabled = TRUE;

-- -----------------------------------------------------------------------------
-- Payment gateway transactions
-- -----------------------------------------------------------------------------
ALTER TABLE payment_gateway_transactions
    ALTER COLUMN tenant_id DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- Settlements
-- -----------------------------------------------------------------------------
UPDATE settlements s
SET owner_id = o.id
FROM owners o
WHERE s.owner_id = o.user_id;

ALTER TABLE settlements
    DROP CONSTRAINT IF EXISTS settlements_owner_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'settlements_owner_id_fkey'
          AND conrelid = 'settlements'::regclass
    ) THEN
        ALTER TABLE settlements
            ADD CONSTRAINT settlements_owner_id_fkey
            FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE RESTRICT;
    END IF;
END $$;
