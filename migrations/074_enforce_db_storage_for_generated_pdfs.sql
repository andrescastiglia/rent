-- Migration: 074_enforce_db_storage_for_generated_pdfs.sql
-- Description: Enforce DB-backed URLs for generated PDFs (contracts, receipts,
--              invoices and credit notes). Existing non-conforming rows are
--              preserved; constraints apply to new/updated data.
-- Created at: 2026-02-12

ALTER TABLE leases
    DROP CONSTRAINT IF EXISTS leases_contract_pdf_url_db_chk;

ALTER TABLE leases
    ADD CONSTRAINT leases_contract_pdf_url_db_chk
    CHECK (
      contract_pdf_url IS NULL
      OR contract_pdf_url LIKE 'db://document/%'
    ) NOT VALID;

ALTER TABLE receipts
    DROP CONSTRAINT IF EXISTS receipts_pdf_url_db_chk;

ALTER TABLE receipts
    ADD CONSTRAINT receipts_pdf_url_db_chk
    CHECK (
      pdf_url IS NULL
      OR pdf_url LIKE 'db://document/%'
    ) NOT VALID;

ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS invoices_pdf_url_db_chk;

ALTER TABLE invoices
    ADD CONSTRAINT invoices_pdf_url_db_chk
    CHECK (
      pdf_url IS NULL
      OR pdf_url LIKE 'db://document/%'
    ) NOT VALID;

ALTER TABLE credit_notes
    DROP CONSTRAINT IF EXISTS credit_notes_pdf_url_db_chk;

ALTER TABLE credit_notes
    ADD CONSTRAINT credit_notes_pdf_url_db_chk
    CHECK (
      pdf_url IS NULL
      OR pdf_url LIKE 'db://document/%'
    ) NOT VALID;
