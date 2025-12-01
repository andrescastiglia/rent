-- =============================================================================
-- Migration: 011_seed_properties
-- Description: Insert sample property data for development and testing
-- =============================================================================

-- Insert sample properties
INSERT INTO properties (id, company_id, owner_id, address, city, state, zip_code, latitude, longitude, type, status, description, year_built, total_area_sqm)
VALUES
    (
        '10000000-0000-0000-0000-000000000001',
        (SELECT id FROM companies LIMIT 1),
        (SELECT user_id FROM owners LIMIT 1),
        'Av. Corrientes 1234',
        'Buenos Aires',
        'CABA',
        'C1043',
        -34.6037,
        -58.3816,
        'residential',
        'active',
        'Edificio residencial moderno en pleno centro de Buenos Aires con excelentes amenidades',
        2018,
        1500.00
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        (SELECT id FROM companies LIMIT 1),
        (SELECT user_id FROM owners LIMIT 1),
        'Av. Santa Fe 5678',
        'Buenos Aires',
        'CABA',
        'C1425',
        -34.5875,
        -58.4173,
        'commercial',
        'active',
        'Edificio comercial con oficinas premium en zona de Palermo',
        2020,
        2000.00
    );

-- Insert sample units for first property (residential)
INSERT INTO units (id, property_id, unit_number, floor, bedrooms, bathrooms, area_sqm, monthly_rent, status, has_parking, parking_spots)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '101',
        1,
        2,
        1,
        65.00,
        85000.00,
        'available',
        true,
        1
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '201',
        2,
        3,
        2,
        95.00,
        120000.00,
        'occupied',
        true,
        1
    ),
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000001',
        '301',
        3,
        3,
        2,
        95.00,
        125000.00,
        'available',
        true,
        1
    );

-- Insert sample units for second property (commercial)
INSERT INTO units (id, property_id, unit_number, floor, bedrooms, bathrooms, area_sqm, monthly_rent, status, has_parking, parking_spots)
VALUES
    (
        '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000002',
        'OF-A',
        5,
        0,
        2,
        120.00,
        180000.00,
        'available',
        true,
        2
    ),
    (
        '20000000-0000-0000-0000-000000000005',
        '10000000-0000-0000-0000-000000000002',
        'OF-B',
        5,
        0,
        1,
        80.00,
        140000.00,
        'occupied',
        true,
        1
    );

-- Insert sample property features
INSERT INTO property_features (property_id, feature_name, feature_value)
VALUES
    -- Features for residential property
    ('10000000-0000-0000-0000-000000000001', 'pool', 'Outdoor heated pool'),
    ('10000000-0000-0000-0000-000000000001', 'gym', '24/7 access'),
    ('10000000-0000-0000-0000-000000000001', 'security_24h', 'Yes'),
    ('10000000-0000-0000-0000-000000000001', 'elevator', '2 elevators'),
    ('10000000-0000-0000-0000-000000000001', 'laundry', 'Shared laundry room'),
    ('10000000-0000-0000-0000-000000000001', 'bbq_area', 'Rooftop BBQ area'),
    
    -- Features for commercial property
    ('10000000-0000-0000-0000-000000000002', 'security_24h', 'Yes'),
    ('10000000-0000-0000-0000-000000000002', 'elevator', '3 high-speed elevators'),
    ('10000000-0000-0000-0000-000000000002', 'air_conditioning', 'Central AC'),
    ('10000000-0000-0000-0000-000000000002', 'internet', 'Fiber optic 1Gbps'),
    ('10000000-0000-0000-0000-000000000002', 'parking', 'Underground parking');

-- Verify insertions
DO $$
BEGIN
    RAISE NOTICE 'Inserted % properties', (SELECT COUNT(*) FROM properties WHERE id LIKE '10000000%');
    RAISE NOTICE 'Inserted % units', (SELECT COUNT(*) FROM units WHERE id LIKE '20000000%');
    RAISE NOTICE 'Inserted % property features', (SELECT COUNT(*) FROM property_features WHERE property_id LIKE '10000000%');
END $$;
