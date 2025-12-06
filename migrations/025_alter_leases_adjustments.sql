-- =============================================================================
-- Migration: 025_alter_leases_adjustments
-- Description: Add inflation adjustment and increase clause fields to leases
-- =============================================================================

-- Create adjustment type ENUM
CREATE TYPE adjustment_type AS ENUM ('icl', 'igpm', 'fixed', 'none');

-- Create increase clause type ENUM
CREATE TYPE increase_clause_type AS ENUM ('percentage', 'fixed_amount', 'index_based');

-- Add adjustment and increase fields to leases table
ALTER TABLE leases
    ADD COLUMN adjustment_type adjustment_type DEFAULT 'none',
    ADD COLUMN adjustment_rate DECIMAL(5, 2),
    ADD COLUMN next_adjustment_date DATE,
    ADD COLUMN last_adjustment_date DATE,
    ADD COLUMN last_adjustment_rate DECIMAL(5, 2),
    ADD COLUMN increase_clause_type increase_clause_type,
    ADD COLUMN increase_clause_value DECIMAL(10, 2),
    ADD COLUMN increase_clause_frequency_months INTEGER DEFAULT 12;

-- Add constraints
ALTER TABLE leases
    ADD CONSTRAINT leases_adjustment_rate_check 
        CHECK (adjustment_rate IS NULL OR (adjustment_rate >= 0 AND adjustment_rate <= 100)),
    ADD CONSTRAINT leases_increase_clause_value_check 
        CHECK (increase_clause_value IS NULL OR increase_clause_value >= 0),
    ADD CONSTRAINT leases_increase_clause_frequency_check 
        CHECK (increase_clause_frequency_months IS NULL OR increase_clause_frequency_months > 0);

-- Add comments
COMMENT ON COLUMN leases.adjustment_type IS 'Type of inflation adjustment: ICL (Argentina), IGP-M (Brazil), fixed percentage, or none';
COMMENT ON COLUMN leases.adjustment_rate IS 'Fixed adjustment rate (percentage) if adjustment_type is fixed';
COMMENT ON COLUMN leases.next_adjustment_date IS 'Date of next scheduled adjustment';
COMMENT ON COLUMN leases.last_adjustment_date IS 'Date of last applied adjustment';
COMMENT ON COLUMN leases.last_adjustment_rate IS 'Rate applied in last adjustment';
COMMENT ON COLUMN leases.increase_clause_type IS 'Type of increase clause: percentage, fixed amount, or index-based';
COMMENT ON COLUMN leases.increase_clause_value IS 'Value for increase clause (percentage or fixed amount)';
COMMENT ON COLUMN leases.increase_clause_frequency_months IS 'Frequency of increase clause application in months';

-- Create index for next adjustment date (for batch processing)
CREATE INDEX idx_leases_next_adjustment_date 
    ON leases(next_adjustment_date) 
    WHERE deleted_at IS NULL AND next_adjustment_date IS NOT NULL;
