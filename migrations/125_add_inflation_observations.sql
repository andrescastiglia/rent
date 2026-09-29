BEGIN;
-- The legacy monthly ICL rows cannot be relabelled as daily observations.
CREATE TABLE IF NOT EXISTS inflation_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  index_type inflation_index_type NOT NULL,
  observation_date date NOT NULL,
  value numeric(20,10) NOT NULL,
  value_kind text NOT NULL CHECK (value_kind IN ('level','monthly_percent')),
  source text NOT NULL CHECK (length(source)>0),
  source_series text NOT NULL CHECK (length(source_series)>0),
  source_url text NOT NULL CHECK (length(source_url)>0),
  revision integer NOT NULL CHECK (revision>0),
  retrieved_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(index_type,observation_date,revision),
  CHECK ((index_type IN ('icl','ipc') AND value_kind='level' AND value>0 AND value<10000000000)
    OR (index_type='igp_m' AND value_kind='monthly_percent' AND value>-100 AND value<10000000000)),
  CHECK (index_type='icl' OR EXTRACT(DAY FROM observation_date)=1)
);
CREATE INDEX IF NOT EXISTS idx_inflation_observation_latest ON inflation_observations(index_type,observation_date,revision DESC);
CREATE OR REPLACE FUNCTION preserve_inflation_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Inflation observation revisions are immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS immutable_inflation_observation ON inflation_observations;
CREATE TRIGGER immutable_inflation_observation BEFORE UPDATE ON inflation_observations
  FOR EACH ROW EXECUTE FUNCTION preserve_inflation_observation();
COMMIT;
