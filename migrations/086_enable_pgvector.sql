-- =============================================================================
-- Migration: 086_enable_pgvector.sql
-- Description: Enable pgvector for existing RentFlow databases. The extension
--              binaries must be installed on the PostgreSQL server first.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "vector";

COMMIT;
