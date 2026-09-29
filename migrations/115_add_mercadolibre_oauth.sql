BEGIN;
CREATE TABLE IF NOT EXISTS mercadolibre_connections (
  company_id uuid PRIMARY KEY REFERENCES companies(id),
  seller_id bigint UNIQUE,
  encrypted_tokens text,
  expires_at timestamptz,
  status text NOT NULL CHECK (status IN ('active','connecting','refreshing','reconnect_required','disconnected')),
  operation_id uuid,
  operation_started_at timestamptz,
  connected_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR (seller_id IS NOT NULL AND encrypted_tokens IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS mercadolibre_authorizations (
  state_hash varchar(64) PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid NOT NULL REFERENCES users(id),
  encrypted_verifier text NOT NULL,
  redirect_uri text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','exchanging','used','failed')),
  operation_id uuid,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mercadolibre_authorizations_company ON mercadolibre_authorizations(company_id, status);
CREATE TABLE IF NOT EXISTS mercadolibre_connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  actor_id uuid REFERENCES users(id),
  event text NOT NULL CHECK (event IN ('authorization_started','connected','refreshed','reconnect_required','disconnected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
