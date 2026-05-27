-- =============================================================================
-- Migration: 085_add_batch_runtime_schema_fixes.sql
-- Description: Align production schema with batch runtime fields introduced by
--              invoice withholdings and owner settlement processing.
-- =============================================================================

ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "withholdings_total" NUMERIC(15, 2) DEFAULT 0;

UPDATE "invoices"
SET "withholdings_total" =
    COALESCE("withholding_iibb", 0)
    + COALESCE("withholding_iva", 0)
    + COALESCE("withholding_ganancias", 0)
WHERE "withholdings_total" IS NULL
   OR "withholdings_total" <>
      COALESCE("withholding_iibb", 0)
      + COALESCE("withholding_iva", 0)
      + COALESCE("withholding_ganancias", 0);

ALTER TABLE "invoices"
    ALTER COLUMN "withholdings_total" SET DEFAULT 0,
    ALTER COLUMN "withholdings_total" SET NOT NULL;

ALTER TYPE "billing_job_type" ADD VALUE IF NOT EXISTS 'process_settlements';
