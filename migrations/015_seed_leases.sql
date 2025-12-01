-- =============================================================================
-- Migration: 015_seed_leases
-- Description: Insert sample lease data for development and testing
-- =============================================================================

-- Insert sample leases
INSERT INTO leases (id, unit_id, tenant_id, start_date, end_date, rent_amount, deposit, status)
VALUES
    (
        '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002', -- Unit 201 from seed data
        (SELECT user_id FROM tenants LIMIT 1),
        '2024-01-01',
        '2025-01-01',
        120000.00,
        240000.00,
        'active'
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000005', -- Unit OF-B from seed data
        (SELECT user_id FROM tenants LIMIT 1 OFFSET 1),
        '2024-06-01',
        '2025-06-01',
        140000.00,
        280000.00,
        'active'
    ),
    (
        '30000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000001', -- Unit 101
        (SELECT user_id FROM tenants LIMIT 1),
        '2023-01-01',
        '2024-01-01',
        85000.00,
        170000.00,
        'expired'
    );

-- Insert sample lease amendments
INSERT INTO lease_amendments (lease_id, effective_date, change_type, description, old_values, new_values, status, approved_at)
VALUES
    (
        '30000000-0000-0000-0000-000000000001',
        '2024-07-01',
        'rent_increase',
        'Annual rent adjustment based on inflation',
        '{"rent_amount": 120000}',
        '{"rent_amount": 130000}',
        'approved',
        CURRENT_TIMESTAMP
    ),
    (
        '30000000-0000-0000-0000-000000000002',
        '2025-06-01',
        'extension',
        'Contract extension for 1 year',
        '{"end_date": "2025-06-01"}',
        '{"end_date": "2026-06-01"}',
        'pending',
        NULL
    );

-- Verify insertions
DO $$
BEGIN
    RAISE NOTICE 'Inserted % leases', (SELECT COUNT(*) FROM leases WHERE id LIKE '30000000%');
    RAISE NOTICE 'Inserted % lease amendments', (SELECT COUNT(*) FROM lease_amendments);
END $$;
