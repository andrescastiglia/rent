BEGIN;

CREATE TABLE IF NOT EXISTS api_rate_limit_buckets (
  bucket_key char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_expiry
  ON api_rate_limit_buckets (expires_at);

COMMIT;
