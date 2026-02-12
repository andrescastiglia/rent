BEGIN;

-- Guard clause: this script assumes the schema was already created.
DO $$
BEGIN
    IF to_regclass('public.companies') IS NULL THEN
        RAISE EXCEPTION 'Schema not initialized. Missing table: public.companies';
    END IF;
END $$;

-- Capture an existing real password hash before truncating users.
CREATE TEMP TABLE _reset_data_password_hash (
    password_hash TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _reset_data_password_hash (password_hash)
SELECT u.password_hash
FROM users u
WHERE lower(u.email) = lower('admin@rentflow.demo')
LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _reset_data_password_hash) THEN
        RAISE EXCEPTION 'Cannot reset demo data: user admin@rentflow.demo was not found before cleanup.';
    END IF;
END $$;

-- Clean all business data while preserving schema metadata and PostGIS system tables.
DO $$
DECLARE
    v_tables TEXT;
BEGIN
    SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO v_tables
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'spatial_ref_sys',
        'geography_columns',
        'geometry_columns',
        'raster_columns',
        'raster_overviews',
        'migrations',
        'typeorm_metadata'
      );

    IF v_tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';
    END IF;
END $$;

-- Optional cleanup for audit rows.
DO $$
BEGIN
    IF to_regclass('audit.logs') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE audit.logs';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Base reference data
-- -----------------------------------------------------------------------------
INSERT INTO currencies (code, name, symbol, decimal_places, is_active, created_at, updated_at)
VALUES
    ('ARS', 'Peso Argentino', '$', 2, TRUE, NOW(), NOW()),
    ('USD', 'Dolar Estadounidense', 'US$', 2, TRUE, NOW(), NOW()),
    ('BRL', 'Real Brasileno', 'R$', 2, TRUE, NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    symbol = EXCLUDED.symbol,
    decimal_places = EXCLUDED.decimal_places,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Company
-- -----------------------------------------------------------------------------
INSERT INTO companies (
    id, name, legal_name, tax_id, email, phone, country, plan, is_active, created_at, updated_at
)
VALUES (
    '10000000-0000-0000-0000-000000000001',
    'Rent Demo Company',
    'Rent Demo Company S.A.',
    '30-00000001-9',
    'admin@rent.demo',
    '+54 11 4000-0000',
    'Argentina',
    'premium',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    legal_name = EXCLUDED.legal_name,
    tax_id = EXCLUDED.tax_id,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    country = EXCLUDED.country,
    plan = EXCLUDED.plan,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
INSERT INTO users (
    id, company_id, email, password_hash, role, language, first_name, last_name, phone, is_active, created_at, updated_at
)
VALUES
    ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', 'admin@rent.demo', (SELECT password_hash FROM _reset_data_password_hash LIMIT 1), 'admin', 'es', 'Admin', 'Demo', '+54 11 4000-0001', TRUE, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', 'staff@rent.demo', (SELECT password_hash FROM _reset_data_password_hash LIMIT 1), 'staff', 'es', 'Sofia', 'Staff', '+54 11 4000-0002', TRUE, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001', 'ana.owner@rent.demo', (SELECT password_hash FROM _reset_data_password_hash LIMIT 1), 'owner', 'es', 'Ana', 'Gomez', '+54 11 4000-0003', TRUE, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000001', 'bruno.owner@rent.demo', (SELECT password_hash FROM _reset_data_password_hash LIMIT 1), 'owner', 'es', 'Bruno', 'Diaz', '+54 11 4000-0004', TRUE, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000001', 'tenant.demo@rent.demo', (SELECT password_hash FROM _reset_data_password_hash LIMIT 1), 'tenant', 'es', 'Lucas', 'Perez', '+54 11 4000-0005', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    language = EXCLUDED.language,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Owners and tenant
-- -----------------------------------------------------------------------------
INSERT INTO owners (
    id, user_id, company_id, tax_id, tax_id_type, bank_name, bank_account_number, commission_rate, created_at, updated_at
)
VALUES
    ('10000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001', '20-11111111-3', 'CUIT', 'Banco Nacion', '0110012345678901234567', 8.00, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000001', '20-22222222-4', 'CUIT', 'Banco Provincia', '0220012345678901234567', 7.50, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET
    user_id = EXCLUDED.user_id,
    company_id = EXCLUDED.company_id,
    tax_id = EXCLUDED.tax_id,
    tax_id_type = EXCLUDED.tax_id_type,
    bank_name = EXCLUDED.bank_name,
    bank_account_number = EXCLUDED.bank_account_number,
    commission_rate = EXCLUDED.commission_rate,
    updated_at = NOW();

INSERT INTO tenants (
    id, user_id, company_id, dni, nationality, emergency_contact_name, emergency_contact_phone, created_at, updated_at
)
VALUES
    ('10000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000401', '10000000-0000-0000-0000-000000000001', '34123456', 'Argentina', 'Maria Perez', '+54 11 4999-0001', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET
    user_id = EXCLUDED.user_id,
    company_id = EXCLUDED.company_id,
    dni = EXCLUDED.dni,
    nationality = EXCLUDED.nationality,
    emergency_contact_name = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Properties and units (owner/property use cases)
-- -----------------------------------------------------------------------------
INSERT INTO properties (
    id, company_id, owner_id, name, property_type, status,
    address_street, address_number, address_city, address_state, address_country,
    sale_price, rent_price, sale_currency, operations, operation_state,
    allows_pets, max_occupants, created_at, updated_at
)
VALUES
    (
      '10000000-0000-0000-0000-000000000601',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000301',
      'Edificio Sol',
      'apartment',
      'active',
      'Av. Siempre Viva',
      '101',
      'Buenos Aires',
      'CABA',
      'Argentina',
      NULL,
      280000.00,
      'ARS',
      ARRAY['rent'::property_operation],
      'available',
      TRUE,
      4,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000602',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000301',
      'PH Centro',
      'house',
      'active',
      'Calle Falsa',
      '742',
      'Buenos Aires',
      'CABA',
      'Argentina',
      NULL,
      320000.00,
      'ARS',
      ARRAY['rent'::property_operation],
      'rented',
      TRUE,
      5,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000603',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000302',
      'Local Comercial Norte',
      'commercial',
      'active',
      'Av. Libertad',
      '500',
      'Cordoba',
      'Cordoba',
      'Argentina',
      95000000.00,
      NULL,
      'ARS',
      ARRAY['sale'::property_operation],
      'available',
      FALSE,
      0,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000604',
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000302',
      'Lote Barrio Verde',
      'land',
      'active',
      'Ruta 8 km 55',
      '0',
      'Pilar',
      'Buenos Aires',
      'Argentina',
      120000000.00,
      450000.00,
      'ARS',
      ARRAY['rent'::property_operation, 'sale'::property_operation],
      'reserved',
      TRUE,
      10,
      NOW(),
      NOW()
    )
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    owner_id = EXCLUDED.owner_id,
    name = EXCLUDED.name,
    property_type = EXCLUDED.property_type,
    status = EXCLUDED.status,
    address_street = EXCLUDED.address_street,
    address_number = EXCLUDED.address_number,
    address_city = EXCLUDED.address_city,
    address_state = EXCLUDED.address_state,
    address_country = EXCLUDED.address_country,
    sale_price = EXCLUDED.sale_price,
    rent_price = EXCLUDED.rent_price,
    sale_currency = EXCLUDED.sale_currency,
    operations = EXCLUDED.operations,
    operation_state = EXCLUDED.operation_state,
    allows_pets = EXCLUDED.allows_pets,
    max_occupants = EXCLUDED.max_occupants,
    updated_at = NOW();

INSERT INTO units (
    id, property_id, company_id, unit_number, floor, status, bedrooms, bathrooms, area, currency, base_rent, created_at, updated_at
)
VALUES
    ('10000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000601', '10000000-0000-0000-0000-000000000001', '1A', '1', 'available', 2, 1, 58.00, 'ARS', 280000.00, NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000602', '10000000-0000-0000-0000-000000000001', 'PB', '0', 'occupied', 3, 2, 92.00, 'ARS', 320000.00, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET
    property_id = EXCLUDED.property_id,
    company_id = EXCLUDED.company_id,
    unit_number = EXCLUDED.unit_number,
    floor = EXCLUDED.floor,
    status = EXCLUDED.status,
    bedrooms = EXCLUDED.bedrooms,
    bathrooms = EXCLUDED.bathrooms,
    area = EXCLUDED.area,
    currency = EXCLUDED.currency,
    base_rent = EXCLUDED.base_rent,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Sale agreement (used by buyer conversion case)
-- -----------------------------------------------------------------------------
INSERT INTO sale_folders (id, company_id, name, description, created_at, updated_at)
VALUES (
    '10000000-0000-0000-0000-000000000801',
    '10000000-0000-0000-0000-000000000001',
    'Loteo Caso Demo',
    'Carpeta para escenarios de interesados compradores',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO sale_agreements (
    id, company_id, folder_id, buyer_name, buyer_phone, total_amount, currency,
    installment_amount, installment_count, start_date, due_day, paid_amount, notes, created_at, updated_at
)
VALUES (
    '10000000-0000-0000-0000-000000000802',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000801',
    'Rocio Buy',
    '+54 11 7000-0005',
    60000000.00,
    'ARS',
    2500000.00,
    24,
    DATE '2026-01-01',
    12,
    0.00,
    'Acuerdo usado para conversacion de interesado a comprador',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    folder_id = EXCLUDED.folder_id,
    buyer_name = EXCLUDED.buyer_name,
    buyer_phone = EXCLUDED.buyer_phone,
    total_amount = EXCLUDED.total_amount,
    currency = EXCLUDED.currency,
    installment_amount = EXCLUDED.installment_amount,
    installment_count = EXCLUDED.installment_count,
    start_date = EXCLUDED.start_date,
    due_day = EXCLUDED.due_day,
    paid_amount = EXCLUDED.paid_amount,
    notes = EXCLUDED.notes,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Interested profiles (different profile types)
-- -----------------------------------------------------------------------------
INSERT INTO interested_profiles (
    id, company_id, first_name, last_name, phone, email,
    people_count, min_amount, max_amount, has_pets,
    preferred_city, property_type_preference,
    operation, operations, status, qualification_level,
    source, assigned_to_user_id, consent_contact, notes,
    converted_to_tenant_id, converted_to_sale_agreement_id,
    created_at, updated_at
)
VALUES
    (
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000001',
      'Camila',
      'Rent',
      '+54 11 7000-0001',
      'camila.rent@demo.local',
      2,
      220000.00,
      360000.00,
      TRUE,
      'Buenos Aires',
      'apartment',
      'rent',
      ARRAY['rent'::interested_operation],
      'interested',
      'mql',
      'web',
      '10000000-0000-0000-0000-000000000102',
      TRUE,
      'Caso: interesada solo en alquiler',
      NULL,
      NULL,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000902',
      '10000000-0000-0000-0000-000000000001',
      'Martin',
      'Sale',
      '+54 11 7000-0002',
      'martin.sale@demo.local',
      3,
      70000000.00,
      130000000.00,
      FALSE,
      'Cordoba',
      'house',
      'sale',
      ARRAY['sale'::interested_operation],
      'interested',
      'sql',
      'referral',
      '10000000-0000-0000-0000-000000000102',
      TRUE,
      'Caso: interesado solo en compra',
      NULL,
      NULL,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000903',
      '10000000-0000-0000-0000-000000000001',
      'Nora',
      'Dual',
      '+54 11 7000-0003',
      'nora.dual@demo.local',
      1,
      200000.00,
      90000000.00,
      FALSE,
      'Pilar',
      'land',
      'rent',
      ARRAY['rent'::interested_operation, 'sale'::interested_operation],
      'interested',
      'mql',
      'manual',
      '10000000-0000-0000-0000-000000000102',
      TRUE,
      'Caso: perfil mixto alquiler/compra',
      NULL,
      NULL,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000904',
      '10000000-0000-0000-0000-000000000001',
      'Lucia',
      'Tenant',
      '+54 11 7000-0004',
      'lucia.tenant@demo.local',
      2,
      250000.00,
      350000.00,
      TRUE,
      'Buenos Aires',
      'house',
      'rent',
      ARRAY['rent'::interested_operation],
      'tenant',
      'sql',
      'manual',
      '10000000-0000-0000-0000-000000000102',
      TRUE,
      'Caso: interesada convertida a inquilina',
      '10000000-0000-0000-0000-000000000501',
      NULL,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000000905',
      '10000000-0000-0000-0000-000000000001',
      'Rocio',
      'Buy',
      '+54 11 7000-0005',
      'rocio.buy@demo.local',
      2,
      50000000.00,
      80000000.00,
      FALSE,
      'Pilar',
      'land',
      'sale',
      ARRAY['sale'::interested_operation],
      'buyer',
      'sql',
      'manual',
      '10000000-0000-0000-0000-000000000102',
      TRUE,
      'Caso: interesada convertida a compradora',
      NULL,
      '10000000-0000-0000-0000-000000000802',
      NOW(),
      NOW()
    )
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    people_count = EXCLUDED.people_count,
    min_amount = EXCLUDED.min_amount,
    max_amount = EXCLUDED.max_amount,
    has_pets = EXCLUDED.has_pets,
    preferred_city = EXCLUDED.preferred_city,
    property_type_preference = EXCLUDED.property_type_preference,
    operation = EXCLUDED.operation,
    operations = EXCLUDED.operations,
    status = EXCLUDED.status,
    qualification_level = EXCLUDED.qualification_level,
    source = EXCLUDED.source,
    assigned_to_user_id = EXCLUDED.assigned_to_user_id,
    consent_contact = EXCLUDED.consent_contact,
    notes = EXCLUDED.notes,
    converted_to_tenant_id = EXCLUDED.converted_to_tenant_id,
    converted_to_sale_agreement_id = EXCLUDED.converted_to_sale_agreement_id,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Lease contract templates (rental + sale)
-- -----------------------------------------------------------------------------
INSERT INTO lease_contract_templates (
    id, company_id, name, contract_type, template_body, is_active, created_at, updated_at
)
VALUES
    (
      '10000000-0000-0000-0000-000000001101',
      '10000000-0000-0000-0000-000000000001',
      'Alquiler Estandar',
      'rental',
      'Contrato de alquiler firmado el {{today}} entre {{owner.fullName}} y {{tenant.fullName}} para {{property.name}}.' || E'\n\n' ||
      'Inicio: {{lease.startDate}} - Fin: {{lease.endDate}}. Canon mensual: {{lease.monthlyRent}} {{lease.currency}}.',
      TRUE,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000001102',
      '10000000-0000-0000-0000-000000000001',
      'Alquiler con Ajustes',
      'rental',
      'Las partes acuerdan ajuste {{lease.adjustmentType}} cada {{lease.adjustmentFrequencyMonths}} meses.' || E'\n\n' ||
      'Mora: tipo {{lease.lateFeeType}} valor {{lease.lateFeeValue}}.',
      TRUE,
      NOW(),
      NOW()
    ),
    (
      '10000000-0000-0000-0000-000000001103',
      '10000000-0000-0000-0000-000000000001',
      'Compra Venta Estandar',
      'sale',
      'Boleto de compra/venta de {{property.name}} entre {{owner.fullName}} y {{buyer.fullName}}.' || E'\n\n' ||
      'Valor fiscal: {{lease.fiscalValue}} {{lease.currency}}. Fecha: {{today}}.',
      TRUE,
      NOW(),
      NOW()
    )
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    contract_type = EXCLUDED.contract_type,
    template_body = EXCLUDED.template_body,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Payment document templates (receipt, invoice, credit note)
-- -----------------------------------------------------------------------------
INSERT INTO payment_document_templates (
    id, company_id, type, name, template_body, is_active, is_default, created_at, updated_at
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

-- -----------------------------------------------------------------------------
-- Active rental lease and tenant account (dependency complete scenario)
-- -----------------------------------------------------------------------------
INSERT INTO leases (
    id, company_id, property_id, tenant_id, owner_id, contract_type, status,
    start_date, end_date, monthly_rent, currency,
    payment_frequency, payment_due_day, billing_frequency, billing_day,
    template_id, template_name, draft_contract_text, confirmed_contract_text, confirmed_at,
    adjustment_type, adjustment_frequency_months, inflation_index_type,
    late_fee_type, late_fee_value, auto_generate_invoices,
    created_at, updated_at
)
VALUES (
    '10000000-0000-0000-0000-000000001201',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000602',
    '10000000-0000-0000-0000-000000000501',
    '10000000-0000-0000-0000-000000000301',
    'rental',
    'active',
    DATE '2026-01-01',
    DATE '2028-01-01',
    320000.00,
    'ARS',
    'monthly',
    10,
    'first_of_month',
    NULL,
    '10000000-0000-0000-0000-000000001101',
    'Alquiler Estandar',
    'Borrador base para caso de uso de alquiler.',
    'Contrato confirmado para caso de uso de alquiler.',
    NOW(),
    'inflation_index',
    6,
    'icl',
    'none',
    0,
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    property_id = EXCLUDED.property_id,
    tenant_id = EXCLUDED.tenant_id,
    owner_id = EXCLUDED.owner_id,
    contract_type = EXCLUDED.contract_type,
    status = EXCLUDED.status,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    monthly_rent = EXCLUDED.monthly_rent,
    currency = EXCLUDED.currency,
    payment_frequency = EXCLUDED.payment_frequency,
    payment_due_day = EXCLUDED.payment_due_day,
    billing_frequency = EXCLUDED.billing_frequency,
    billing_day = EXCLUDED.billing_day,
    template_id = EXCLUDED.template_id,
    template_name = EXCLUDED.template_name,
    draft_contract_text = EXCLUDED.draft_contract_text,
    confirmed_contract_text = EXCLUDED.confirmed_contract_text,
    confirmed_at = EXCLUDED.confirmed_at,
    adjustment_type = EXCLUDED.adjustment_type,
    adjustment_frequency_months = EXCLUDED.adjustment_frequency_months,
    inflation_index_type = EXCLUDED.inflation_index_type,
    late_fee_type = EXCLUDED.late_fee_type,
    late_fee_value = EXCLUDED.late_fee_value,
    auto_generate_invoices = EXCLUDED.auto_generate_invoices,
    updated_at = NOW();

INSERT INTO tenant_accounts (
    id, company_id, tenant_id, lease_id, current_balance, currency, is_active, created_at, updated_at
)
VALUES (
    '10000000-0000-0000-0000-000000001301',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000501',
    '10000000-0000-0000-0000-000000001201',
    0.00,
    'ARS',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO UPDATE
SET
    company_id = EXCLUDED.company_id,
    tenant_id = EXCLUDED.tenant_id,
    lease_id = EXCLUDED.lease_id,
    current_balance = EXCLUDED.current_balance,
    currency = EXCLUDED.currency,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

COMMIT;
