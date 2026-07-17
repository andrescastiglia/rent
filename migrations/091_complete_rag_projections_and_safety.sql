-- =============================================================================
-- Migration: 091_complete_rag_projections_and_safety.sql
-- Description: Complete RAG sources, synchronous tombstones and mutation audit.
-- =============================================================================

BEGIN;

ALTER TABLE ai_rag_runs
    ADD COLUMN IF NOT EXISTS prompt_override_attempt BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION retire_ai_knowledge_projection(
    p_company_id UUID,
    p_projection_type VARCHAR,
    p_entity_id UUID
) RETURNS VOID
LANGUAGE sql
AS $$
    UPDATE ai_knowledge_chunks
       SET deleted_at = NOW(), updated_at = NOW()
     WHERE company_id = p_company_id
       AND entity_type = p_projection_type
       AND entity_id = p_entity_id
       AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION trg_enqueue_property_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    is_deleted BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    is_deleted := TG_OP = 'DELETE' OR source_row.deleted_at IS NOT NULL;
    IF is_deleted THEN
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'property_summary', source_row.id
        );
    END IF;
    PERFORM enqueue_ai_embedding_outbox(
        source_row.company_id, 'property', source_row.id,
        CASE WHEN is_deleted THEN 'delete' ELSE 'upsert' END,
        COALESCE(source_row.updated_at, NOW())
    );
    RETURN source_row;
END;
$$;

CREATE OR REPLACE FUNCTION trg_enqueue_document_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    old_was_indexable BOOLEAN := FALSE;
    is_indexable BOOLEAN := FALSE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
        is_indexable := NEW.deleted_at IS NULL AND NEW.status = 'approved';
    END IF;
    IF TG_OP <> 'INSERT' THEN
        old_was_indexable := OLD.deleted_at IS NULL AND OLD.status = 'approved';
    END IF;
    IF NOT is_indexable THEN
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'document_chunk', source_row.id
        );
    END IF;
    IF is_indexable OR old_was_indexable THEN
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'document', source_row.id,
            CASE WHEN is_indexable THEN 'upsert' ELSE 'delete' END,
            COALESCE(source_row.updated_at, NOW())
        );
    END IF;
    RETURN source_row;
END;
$$;

CREATE OR REPLACE FUNCTION trg_enqueue_rag_simple_source()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    source_type VARCHAR := TG_ARGV[0];
    projection_type VARCHAR := TG_ARGV[1];
    is_deleted BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    is_deleted := TG_OP = 'DELETE' OR source_row.deleted_at IS NOT NULL;

    IF is_deleted THEN
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, projection_type, source_row.id
        );
    END IF;
    PERFORM enqueue_ai_embedding_outbox(
        source_row.company_id,
        source_type,
        source_row.id,
        CASE WHEN is_deleted THEN 'delete' ELSE 'upsert' END,
        COALESCE(source_row.updated_at, NOW())
    );
    RETURN source_row;
END;
$$;

DO $$
DECLARE
    source RECORD;
BEGIN
    FOR source IN SELECT * FROM (VALUES
        ('leases', 'lease', 'lease_summary'),
        ('invoices', 'invoice', 'invoice_payment_summary'),
        ('owners', 'owner', 'owner_portfolio_summary'),
        ('tenant_accounts', 'tenant_account', 'tenant_account_summary'),
        ('interested_profiles', 'interested', 'interested_profile_summary'),
        ('owner_activities', 'owner_activity', 'activity_chunk'),
        ('tenant_activities', 'tenant_activity', 'activity_chunk')
    ) AS sources(table_name, source_type, projection_type)
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I',
            source.table_name || '_ai_embedding_outbox',
            source.table_name
        );
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION trg_enqueue_rag_simple_source(%L, %L)',
            source.table_name || '_ai_embedding_outbox',
            source.table_name,
            source.source_type,
            source.projection_type
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trg_enqueue_interested_activity_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    target_company_id UUID;
    old_company_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    SELECT company_id INTO target_company_id
      FROM interested_profiles
     WHERE id = source_row.interested_profile_id;

    IF TG_OP = 'UPDATE'
       AND OLD.interested_profile_id IS DISTINCT FROM NEW.interested_profile_id THEN
        SELECT company_id INTO old_company_id
          FROM interested_profiles
         WHERE id = OLD.interested_profile_id;
        IF old_company_id IS NOT NULL THEN
            PERFORM retire_ai_knowledge_projection(
                old_company_id, 'activity_chunk', OLD.id
            );
            PERFORM enqueue_ai_embedding_outbox(
                old_company_id, 'interested_activity', OLD.id, 'delete', NOW()
            );
        END IF;
    END IF;

    IF target_company_id IS NULL THEN
        RETURN source_row;
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM retire_ai_knowledge_projection(
            target_company_id, 'activity_chunk', source_row.id
        );
    END IF;
    PERFORM enqueue_ai_embedding_outbox(
        target_company_id,
        'interested_activity',
        source_row.id,
        CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
        COALESCE(source_row.updated_at, NOW())
    );
    RETURN source_row;
END;
$$;

DROP TRIGGER IF EXISTS interested_activities_ai_embedding_outbox
    ON interested_activities;
CREATE TRIGGER interested_activities_ai_embedding_outbox
AFTER INSERT OR UPDATE OR DELETE ON interested_activities
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_interested_activity_embedding();

CREATE OR REPLACE FUNCTION trg_retire_interested_activity_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE'
       OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        UPDATE ai_knowledge_chunks c
           SET deleted_at = NOW(), updated_at = NOW()
         WHERE c.company_id = OLD.company_id
           AND c.entity_type = 'activity_chunk'
           AND c.entity_id IN (
             SELECT a.id
               FROM interested_activities a
              WHERE a.interested_profile_id = OLD.id
           )
           AND c.deleted_at IS NULL;

        INSERT INTO ai_embedding_outbox (
            company_id, entity_type, entity_id, operation, source_updated_at
        )
        SELECT OLD.company_id, 'interested_activity', a.id, 'delete', NOW()
          FROM interested_activities a
         WHERE a.interested_profile_id = OLD.id;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interested_profiles_ai_activity_retirement
    ON interested_profiles;
CREATE TRIGGER interested_profiles_ai_activity_retirement
BEFORE UPDATE OF deleted_at OR DELETE ON interested_profiles
FOR EACH ROW EXECUTE FUNCTION trg_retire_interested_activity_dependencies();

DROP TRIGGER IF EXISTS leases_ai_document_embedding_dependencies ON leases;
CREATE TRIGGER leases_ai_document_embedding_dependencies
AFTER UPDATE OF confirmed_contract_text, draft_contract_text ON leases
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_lease_document_embeddings();

CREATE OR REPLACE FUNCTION trg_enqueue_payment_rag_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    IF source_row.invoice_id IS NOT NULL THEN
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'invoice_payment_summary', source_row.invoice_id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'invoice', source_row.invoice_id, 'upsert',
            COALESCE(source_row.updated_at, NOW())
        );
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.invoice_id IS NOT NULL
       AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
        PERFORM retire_ai_knowledge_projection(
            OLD.company_id, 'invoice_payment_summary', OLD.invoice_id
        );
        PERFORM enqueue_ai_embedding_outbox(
            OLD.company_id, 'invoice', OLD.invoice_id, 'upsert', NOW()
        );
    END IF;
    RETURN source_row;
END;
$$;

DROP TRIGGER IF EXISTS payments_ai_embedding_dependencies ON payments;
CREATE TRIGGER payments_ai_embedding_dependencies
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_payment_rag_dependencies();

CREATE OR REPLACE FUNCTION trg_enqueue_property_rag_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    dependent RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    PERFORM retire_ai_knowledge_projection(
        source_row.company_id, 'owner_portfolio_summary', source_row.owner_id
    );
    PERFORM enqueue_ai_embedding_outbox(
        source_row.company_id, 'owner', source_row.owner_id, 'upsert',
        COALESCE(source_row.updated_at, NOW())
    );
    FOR dependent IN
        SELECT id FROM leases
         WHERE property_id = source_row.id AND deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'lease_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'lease', dependent.id, 'upsert', NOW()
        );
    END LOOP;
    IF TG_OP = 'UPDATE' AND OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
        PERFORM retire_ai_knowledge_projection(
            OLD.company_id, 'owner_portfolio_summary', OLD.owner_id
        );
        PERFORM enqueue_ai_embedding_outbox(
            OLD.company_id, 'owner', OLD.owner_id, 'upsert', NOW()
        );
    END IF;
    RETURN source_row;
END;
$$;

DROP TRIGGER IF EXISTS properties_ai_embedding_dependencies ON properties;
CREATE TRIGGER properties_ai_embedding_dependencies
AFTER INSERT OR UPDATE OR DELETE ON properties
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_property_rag_dependencies();

CREATE OR REPLACE FUNCTION trg_enqueue_lease_rag_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    dependent RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    FOR dependent IN
        SELECT id FROM tenant_accounts
         WHERE lease_id = source_row.id AND deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'tenant_account_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'tenant_account', dependent.id, 'upsert', NOW()
        );
    END LOOP;
    FOR dependent IN
        SELECT id FROM invoices
         WHERE lease_id = source_row.id AND deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'invoice_payment_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'invoice', dependent.id, 'upsert', NOW()
        );
    END LOOP;
    RETURN source_row;
END;
$$;

DROP TRIGGER IF EXISTS leases_ai_embedding_dependencies ON leases;
CREATE TRIGGER leases_ai_embedding_dependencies
AFTER INSERT OR UPDATE OR DELETE ON leases
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_lease_rag_dependencies();

CREATE OR REPLACE FUNCTION trg_enqueue_user_rag_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    dependent RECORD;
BEGIN
    FOR dependent IN
        SELECT o.id, o.company_id
          FROM owners o
         WHERE o.user_id = NEW.id AND o.deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            dependent.company_id, 'owner_portfolio_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            dependent.company_id, 'owner', dependent.id, 'upsert', NOW()
        );
        INSERT INTO ai_embedding_outbox (
            company_id, entity_type, entity_id, operation, source_updated_at
        )
        SELECT dependent.company_id, 'lease', l.id, 'upsert', NOW()
          FROM leases l
         WHERE l.owner_id = dependent.id AND l.deleted_at IS NULL;
        UPDATE ai_knowledge_chunks c
           SET deleted_at = NOW(), updated_at = NOW()
          FROM leases l
         WHERE l.owner_id = dependent.id AND l.deleted_at IS NULL
           AND c.company_id = dependent.company_id
           AND c.entity_type = 'lease_summary' AND c.entity_id = l.id
           AND c.deleted_at IS NULL;
    END LOOP;
    FOR dependent IN
        SELECT t.id, t.company_id
          FROM tenants t
         WHERE t.user_id = NEW.id AND t.deleted_at IS NULL
    LOOP
        INSERT INTO ai_embedding_outbox (
            company_id, entity_type, entity_id, operation, source_updated_at
        )
        SELECT dependent.company_id, 'lease', l.id, 'upsert', NOW()
          FROM leases l
         WHERE l.tenant_id = dependent.id AND l.deleted_at IS NULL;
        INSERT INTO ai_embedding_outbox (
            company_id, entity_type, entity_id, operation, source_updated_at
        )
        SELECT dependent.company_id, 'tenant_account', a.id, 'upsert', NOW()
          FROM tenant_accounts a
         WHERE a.tenant_id = dependent.id AND a.deleted_at IS NULL;
        UPDATE ai_knowledge_chunks c
           SET deleted_at = NOW(), updated_at = NOW()
         WHERE c.company_id = dependent.company_id AND c.deleted_at IS NULL
           AND (
             (c.entity_type = 'lease_summary' AND EXISTS (
               SELECT 1 FROM leases l WHERE l.id = c.entity_id
                 AND l.tenant_id = dependent.id AND l.deleted_at IS NULL
             )) OR
             (c.entity_type = 'tenant_account_summary' AND EXISTS (
               SELECT 1 FROM tenant_accounts a WHERE a.id = c.entity_id
                 AND a.tenant_id = dependent.id AND a.deleted_at IS NULL
             ))
           );
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_ai_embedding_dependencies ON users;
CREATE TRIGGER users_ai_embedding_dependencies
AFTER UPDATE OF first_name, last_name, deleted_at ON users
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_user_rag_dependencies();

CREATE OR REPLACE FUNCTION trg_enqueue_tenant_rag_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    source_row RECORD;
    dependent RECORD;
BEGIN
    IF TG_OP = 'DELETE' THEN
        source_row := OLD;
    ELSE
        source_row := NEW;
    END IF;
    FOR dependent IN
        SELECT id FROM leases
         WHERE tenant_id = source_row.id AND deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'lease_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'lease', dependent.id, 'upsert', NOW()
        );
    END LOOP;
    FOR dependent IN
        SELECT id FROM tenant_accounts
         WHERE tenant_id = source_row.id AND deleted_at IS NULL
    LOOP
        PERFORM retire_ai_knowledge_projection(
            source_row.company_id, 'tenant_account_summary', dependent.id
        );
        PERFORM enqueue_ai_embedding_outbox(
            source_row.company_id, 'tenant_account', dependent.id, 'upsert', NOW()
        );
    END LOOP;
    RETURN source_row;
END;
$$;

DROP TRIGGER IF EXISTS tenants_ai_embedding_dependencies ON tenants;
CREATE TRIGGER tenants_ai_embedding_dependencies
AFTER INSERT OR UPDATE OR DELETE ON tenants
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_tenant_rag_dependencies();

CREATE OR REPLACE FUNCTION trg_retire_property_feature_projection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    property_id UUID;
    target_company_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        property_id := OLD.property_id;
    ELSE
        property_id := NEW.property_id;
    END IF;
    SELECT company_id INTO target_company_id FROM properties WHERE id = property_id;
    IF target_company_id IS NOT NULL THEN
        PERFORM retire_ai_knowledge_projection(
            target_company_id, 'property_summary', property_id
        );
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.property_id IS DISTINCT FROM NEW.property_id THEN
        SELECT company_id INTO target_company_id
          FROM properties WHERE id = OLD.property_id;
        IF target_company_id IS NOT NULL THEN
            PERFORM retire_ai_knowledge_projection(
                target_company_id, 'property_summary', OLD.property_id
            );
            PERFORM enqueue_ai_embedding_outbox(
                target_company_id, 'property', OLD.property_id, 'upsert', NOW()
            );
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_features_ai_synchronous_retirement
    ON property_features;
CREATE TRIGGER property_features_ai_synchronous_retirement
AFTER INSERT OR UPDATE OR DELETE ON property_features
FOR EACH ROW EXECUTE FUNCTION trg_retire_property_feature_projection();

CREATE TABLE IF NOT EXISTS ai_tool_mutation_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    company_id UUID,
    user_id UUID NOT NULL,
    tool_name VARCHAR(160) NOT NULL,
    payload JSONB NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    previewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    result_hash VARCHAR(64),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_tool_confirmation_status
        CHECK (status IN ('pending', 'confirmed', 'executed', 'failed', 'expired')),
    CONSTRAINT ck_ai_tool_confirmation_payload_hash
        CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_ai_tool_confirmation_result_hash
        CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_confirmation_lookup
    ON ai_tool_mutation_confirmations (
        conversation_id, user_id, tool_name, payload_hash, created_at DESC
    );
CREATE INDEX IF NOT EXISTS idx_ai_tool_confirmation_expiry
    ON ai_tool_mutation_confirmations (expires_at)
    WHERE status = 'pending';

COMMIT;
