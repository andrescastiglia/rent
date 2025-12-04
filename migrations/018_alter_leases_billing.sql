-- =============================================================================
-- Migration: 018_alter_leases_billing
-- Description: Add billing configuration fields to leases table
-- =============================================================================

-- Create late fee type ENUM
CREATE TYPE late_fee_type AS ENUM ('daily_rate', 'fixed_amount');

-- Create billing frequency ENUM
CREATE TYPE billing_frequency AS ENUM ('advance', 'weekly', 'biweekly', 'monthly', 'bimonthly');

-- Add billing fields to leases table
ALTER TABLE leases
    ADD COLUMN late_fee_type late_fee_type,
    ADD COLUMN late_fee_value DECIMAL(10, 4),
    ADD COLUMN commission_rate DECIMAL(5, 2),
    ADD COLUMN billing_frequency billing_frequency NOT NULL DEFAULT 'monthly',
    ADD COLUMN billing_day INTEGER NOT NULL DEFAULT 1;

-- Add constraints
ALTER TABLE leases
    ADD CONSTRAINT leases_late_fee_value_check 
        CHECK (late_fee_value IS NULL OR late_fee_value >= 0),
    ADD CONSTRAINT leases_commission_rate_check 
        CHECK (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)),
    ADD CONSTRAINT leases_billing_day_check 
        CHECK (billing_day >= 1 AND billing_day <= 28),
    ADD CONSTRAINT leases_late_fee_consistency_check
        CHECK (
            (late_fee_type IS NULL AND late_fee_value IS NULL) OR
            (late_fee_type IS NOT NULL AND late_fee_value IS NOT NULL)
        );

-- Add comments
COMMENT ON COLUMN leases.late_fee_type IS 'Type of late fee: daily_rate (percentage) or fixed_amount';
COMMENT ON COLUMN leases.late_fee_value IS 'Late fee value: percentage per day or fixed amount';
COMMENT ON COLUMN leases.commission_rate IS 'Company commission percentage (0-100)';
COMMENT ON COLUMN leases.billing_frequency IS 'How often invoices are generated';
COMMENT ON COLUMN leases.billing_day IS 'Day of period when invoice is generated (1-28)';
