BEGIN;
-- Existing generation rows remain without a receipt; their original result is unknown.
ALTER TABLE invoice_generations ADD COLUMN IF NOT EXISTS result_snapshot jsonb;
ALTER TABLE ai_tool_mutation_confirmations ADD COLUMN IF NOT EXISTS retry_safe boolean NOT NULL DEFAULT false;
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS retry_safe boolean NOT NULL DEFAULT false;
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS claim_token uuid;
ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
COMMIT;
