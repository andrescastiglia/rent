-- =============================================================================
-- Migration: 072_add_payment_document_template_defaults.sql
-- Description: Add default template selection for payment documents and enforce
--              a single default per company/type.
-- =============================================================================

ALTER TABLE payment_document_templates
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY company_id, type
            ORDER BY is_active DESC, updated_at DESC, created_at DESC, id
        ) AS rn
    FROM payment_document_templates
    WHERE deleted_at IS NULL
)
UPDATE payment_document_templates t
SET is_default = (r.rn = 1),
    updated_at = NOW()
FROM ranked r
WHERE t.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_document_templates_default_per_type
    ON payment_document_templates(company_id, type)
    WHERE deleted_at IS NULL AND is_default = TRUE;


BEGIN;

-- =============================================================================
-- Modelos base de plantillas para comprobantes de pago.
-- Ajustar COMPANY_ID si se quiere cargar para otra empresa.
-- Requiere esquema con columna payment_document_templates.is_default.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración
-- -----------------------------------------------------------------------------
-- Empresa demo por defecto
-- 10000000-0000-0000-0000-000000000001

INSERT INTO payment_document_templates (
    id,
    company_id,
    type,
    name,
    template_body,
    is_active,
    is_default,
    created_at,
    updated_at
)
VALUES
    (
      '10000000-0000-0000-0000-000000001151',
      '10000000-0000-0000-0000-000000000001',
      'receipt',
      'Recibo base',
      'Recibo {{receipt.number}}' || E'\n' ||
      'Fecha: {{receipt.issuedAt}}' || E'\n' ||
      'Inquilino: {{tenant.fullName}}' || E'\n' ||
      'Monto: {{receipt.currencySymbol}} {{receipt.amount}}' || E'\n' ||
      'Metodo: {{payment.method}}' || E'\n' ||
      'Referencia: {{payment.reference}}',
      TRUE,
      TRUE,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000001152',
      '10000000-0000-0000-0000-000000000001',
      'invoice',
      'Factura base',
      'Factura {{invoice.number}}' || E'\n' ||
      'Emision: {{invoice.issueDate}}' || E'\n' ||
      'Vencimiento: {{invoice.dueDate}}' || E'\n' ||
      'Cliente: {{tenant.fullName}}' || E'\n' ||
      'Total: {{invoice.currencySymbol}} {{invoice.total}}' || E'\n' ||
      'Estado: {{invoice.status}}',
      TRUE,
      TRUE,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000001153',
      '10000000-0000-0000-0000-000000000001',
      'credit_note',
      'Nota de credito base',
      'Nota de credito {{creditNote.number}}' || E'\n' ||
      'Factura vinculada: {{invoice.number}}' || E'\n' ||
      'Monto: {{creditNote.currency}} {{creditNote.amount}}' || E'\n' ||
      'Motivo: {{creditNote.reason}}',
      TRUE,
      TRUE,
      NOW(),
      NOW()
    )
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    type = EXCLUDED.type,
    name = EXCLUDED.name,
    template_body = EXCLUDED.template_body,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    updated_at = NOW();

-- Garantiza un único default por tipo para la empresa demo.
UPDATE payment_document_templates
SET is_default = FALSE,
    updated_at = NOW()
WHERE company_id = '10000000-0000-0000-0000-000000000001'
  AND deleted_at IS NULL
  AND type = 'receipt'
  AND id <> '10000000-0000-0000-0000-000000001151';

UPDATE payment_document_templates
SET is_default = FALSE,
    updated_at = NOW()
WHERE company_id = '10000000-0000-0000-0000-000000000001'
  AND deleted_at IS NULL
  AND type = 'invoice'
  AND id <> '10000000-0000-0000-0000-000000001152';

UPDATE payment_document_templates
SET is_default = FALSE,
    updated_at = NOW()
WHERE company_id = '10000000-0000-0000-0000-000000000001'
  AND deleted_at IS NULL
  AND type = 'credit_note'
  AND id <> '10000000-0000-0000-0000-000000001153';

COMMIT;
