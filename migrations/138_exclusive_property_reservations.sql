-- Conflicting historical reservations must be reviewed before this invariant can be installed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_reservations_active_property
  ON property_reservations(company_id, property_id)
  WHERE status='active' AND deleted_at IS NULL;
