BEGIN;

-- Deprecate unsupported inflation indices.
UPDATE leases
SET inflation_index_type = NULL
WHERE inflation_index_type::text IN ('casa_propia', 'custom');

DELETE FROM inflation_indices
WHERE index_type::text IN ('casa_propia', 'custom');

-- Recreate enum without deprecated values.
ALTER TABLE leases
  ALTER COLUMN inflation_index_type TYPE text
  USING inflation_index_type::text;

ALTER TABLE inflation_indices
  ALTER COLUMN index_type TYPE text
  USING index_type::text;

DROP TYPE inflation_index_type;

CREATE TYPE inflation_index_type AS ENUM ('icl', 'ipc', 'igp_m');

ALTER TABLE leases
  ALTER COLUMN inflation_index_type TYPE inflation_index_type
  USING inflation_index_type::inflation_index_type;

ALTER TABLE inflation_indices
  ALTER COLUMN index_type TYPE inflation_index_type
  USING index_type::inflation_index_type;

COMMIT;
