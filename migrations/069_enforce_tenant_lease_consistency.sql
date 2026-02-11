-- =============================================================================
-- Migration: 069_enforce_tenant_lease_consistency.sql
-- Description: Enforce tenant role, lease, and account consistency constraints
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM tenants t
        JOIN users u ON u.id = t.user_id
        WHERE t.deleted_at IS NULL
          AND (u.deleted_at IS NOT NULL OR u.role <> 'tenant'::user_role)
    ) THEN
        RAISE EXCEPTION 'Invalid tenant records found: each tenant must be linked to an active user with role tenant';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM leases l
        LEFT JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
        LEFT JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
        WHERE l.deleted_at IS NULL
          AND l.contract_type = 'rental'::contract_type
          AND (
              l.tenant_id IS NULL
              OR t.id IS NULL
              OR u.id IS NULL
              OR u.role <> 'tenant'::user_role
              OR t.company_id IS DISTINCT FROM l.company_id
          )
    ) THEN
        RAISE EXCEPTION 'Invalid rental lease records found: tenant must exist, be active, role tenant, and belong to the same company';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM tenant_accounts ta
        JOIN leases l ON l.id = ta.lease_id
        WHERE ta.deleted_at IS NULL
          AND (
              ta.tenant_id IS DISTINCT FROM l.tenant_id
              OR ta.company_id IS DISTINCT FROM l.company_id
          )
    ) THEN
        RAISE EXCEPTION 'Invalid tenant account records found: tenant_accounts tenant/company must match lease tenant/company';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_tenant_user_role()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role user_role;
    v_user_company_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT u.role, u.company_id
    INTO v_user_role, v_user_company_id
    FROM users u
    WHERE u.id = NEW.user_id
      AND u.deleted_at IS NULL;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Tenant user % does not exist or is deleted', NEW.user_id;
    END IF;

    IF v_user_role <> 'tenant'::user_role THEN
        RAISE EXCEPTION 'Tenant user % must have role tenant', NEW.user_id;
    END IF;

    IF v_user_company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'Tenant company % must match user company %', NEW.company_id, v_user_company_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_rental_lease_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_company_id UUID;
    v_tenant_user_role user_role;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.contract_type = 'rental'::contract_type THEN
        IF NEW.tenant_id IS NULL THEN
            RAISE EXCEPTION 'Rental lease % requires tenant_id', NEW.id;
        END IF;

        SELECT t.company_id, u.role
        INTO v_tenant_company_id, v_tenant_user_role
        FROM tenants t
        JOIN users u ON u.id = t.user_id
        WHERE t.id = NEW.tenant_id
          AND t.deleted_at IS NULL
          AND u.deleted_at IS NULL;

        IF v_tenant_company_id IS NULL THEN
            RAISE EXCEPTION 'Rental lease tenant % does not exist or is deleted', NEW.tenant_id;
        END IF;

        IF v_tenant_user_role <> 'tenant'::user_role THEN
            RAISE EXCEPTION 'Rental lease tenant % must belong to a user with role tenant', NEW.tenant_id;
        END IF;

        IF v_tenant_company_id IS DISTINCT FROM NEW.company_id THEN
            RAISE EXCEPTION 'Rental lease company % must match tenant company %', NEW.company_id, v_tenant_company_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_tenant_account_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_lease_tenant_id UUID;
    v_lease_company_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT l.tenant_id, l.company_id
    INTO v_lease_tenant_id, v_lease_company_id
    FROM leases l
    WHERE l.id = NEW.lease_id
      AND l.deleted_at IS NULL;

    IF v_lease_company_id IS NULL THEN
        RAISE EXCEPTION 'Lease % does not exist or is deleted', NEW.lease_id;
    END IF;

    IF v_lease_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Lease % does not define a tenant for tenant account creation', NEW.lease_id;
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM v_lease_tenant_id THEN
        RAISE EXCEPTION 'Tenant account tenant % must match lease tenant %', NEW.tenant_id, v_lease_tenant_id;
    END IF;

    IF NEW.company_id IS DISTINCT FROM v_lease_company_id THEN
        RAISE EXCEPTION 'Tenant account company % must match lease company %', NEW.company_id, v_lease_company_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_payment_tenant_account_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_account_tenant_id UUID;
    v_account_company_id UUID;
BEGIN
    IF NEW.deleted_at IS NOT NULL OR NEW.tenant_account_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT ta.tenant_id, ta.company_id
    INTO v_account_tenant_id, v_account_company_id
    FROM tenant_accounts ta
    WHERE ta.id = NEW.tenant_account_id
      AND ta.deleted_at IS NULL;

    IF v_account_company_id IS NULL THEN
        RAISE EXCEPTION 'Tenant account % does not exist or is deleted', NEW.tenant_account_id;
    END IF;

    IF NEW.tenant_id IS DISTINCT FROM v_account_tenant_id THEN
        RAISE EXCEPTION 'Payment tenant % must match tenant account tenant %', NEW.tenant_id, v_account_tenant_id;
    END IF;

    IF NEW.company_id IS DISTINCT FROM v_account_company_id THEN
        RAISE EXCEPTION 'Payment company % must match tenant account company %', NEW.company_id, v_account_company_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_tenant_user_role ON tenants;
CREATE TRIGGER trg_validate_tenant_user_role
    BEFORE INSERT OR UPDATE OF user_id, company_id, deleted_at
    ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION validate_tenant_user_role();

DROP TRIGGER IF EXISTS trg_validate_rental_lease_tenant_consistency ON leases;
CREATE TRIGGER trg_validate_rental_lease_tenant_consistency
    BEFORE INSERT OR UPDATE OF tenant_id, company_id, contract_type, deleted_at
    ON leases
    FOR EACH ROW
    EXECUTE FUNCTION validate_rental_lease_tenant_consistency();

DROP TRIGGER IF EXISTS trg_validate_tenant_account_consistency ON tenant_accounts;
CREATE TRIGGER trg_validate_tenant_account_consistency
    BEFORE INSERT OR UPDATE OF tenant_id, lease_id, company_id, deleted_at
    ON tenant_accounts
    FOR EACH ROW
    EXECUTE FUNCTION validate_tenant_account_consistency();

DROP TRIGGER IF EXISTS trg_validate_payment_tenant_account_consistency ON payments;
CREATE TRIGGER trg_validate_payment_tenant_account_consistency
    BEFORE INSERT OR UPDATE OF tenant_id, tenant_account_id, company_id, deleted_at
    ON payments
    FOR EACH ROW
    EXECUTE FUNCTION validate_payment_tenant_account_consistency();
