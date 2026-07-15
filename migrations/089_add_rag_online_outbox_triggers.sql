-- =============================================================================
-- Migration: 089_add_rag_online_outbox_triggers.sql
-- Description: Transactional RAG outbox producers for online source changes.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION enqueue_ai_embedding_outbox(
    p_company_id UUID,
    p_entity_type VARCHAR,
    p_entity_id UUID,
    p_operation VARCHAR,
    p_source_updated_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_company_id IS NULL OR p_entity_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO ai_embedding_outbox (
        company_id,
        entity_type,
        entity_id,
        operation,
        source_updated_at
    ) VALUES (
        p_company_id,
        p_entity_type,
        p_entity_id,
        p_operation,
        COALESCE(p_source_updated_at, NOW())
    );
END;
$$;

CREATE OR REPLACE FUNCTION trg_enqueue_property_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM enqueue_ai_embedding_outbox(
            OLD.company_id, 'property', OLD.id, 'delete', NOW()
        );
        RETURN OLD;
    END IF;

    PERFORM enqueue_ai_embedding_outbox(
        NEW.company_id,
        'property',
        NEW.id,
        CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'delete' END,
        COALESCE(NEW.updated_at, NEW.deleted_at, NOW())
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS properties_ai_embedding_outbox ON properties;
CREATE TRIGGER properties_ai_embedding_outbox
AFTER INSERT OR UPDATE OR DELETE ON properties
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_property_embedding();

CREATE OR REPLACE FUNCTION trg_enqueue_document_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    old_was_indexable BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        old_was_indexable := OLD.deleted_at IS NULL AND OLD.status = 'approved';
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF old_was_indexable THEN
            PERFORM enqueue_ai_embedding_outbox(
                OLD.company_id, 'document', OLD.id, 'delete', NOW()
            );
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.deleted_at IS NULL AND NEW.status = 'approved' THEN
        PERFORM enqueue_ai_embedding_outbox(
            NEW.company_id,
            'document',
            NEW.id,
            'upsert',
            COALESCE(NEW.updated_at, NOW())
        );
    ELSIF old_was_indexable THEN
        PERFORM enqueue_ai_embedding_outbox(
            NEW.company_id,
            'document',
            NEW.id,
            'delete',
            COALESCE(NEW.updated_at, NEW.deleted_at, NOW())
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_ai_embedding_outbox ON documents;
CREATE TRIGGER documents_ai_embedding_outbox
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_document_embedding();

CREATE OR REPLACE FUNCTION trg_enqueue_property_feature_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_property_id UUID := COALESCE(NEW.property_id, OLD.property_id);
    target_company_id UUID;
BEGIN
    SELECT company_id
      INTO target_company_id
      FROM properties
     WHERE id = target_property_id
       AND deleted_at IS NULL;

    IF target_company_id IS NOT NULL THEN
        PERFORM enqueue_ai_embedding_outbox(
            target_company_id, 'property', target_property_id, 'upsert', NOW()
        );
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS property_features_ai_embedding_outbox ON property_features;
CREATE TRIGGER property_features_ai_embedding_outbox
AFTER INSERT OR UPDATE OR DELETE ON property_features
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_property_feature_embedding();

CREATE OR REPLACE FUNCTION trg_enqueue_lease_document_embeddings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    related_document RECORD;
BEGIN
    IF NEW.confirmed_contract_text IS NOT DISTINCT FROM OLD.confirmed_contract_text
       AND NEW.draft_contract_text IS NOT DISTINCT FROM OLD.draft_contract_text THEN
        RETURN NEW;
    END IF;

    FOR related_document IN
        SELECT id, company_id, updated_at
          FROM documents
         WHERE entity_type = 'lease'
           AND entity_id = NEW.id
           AND status = 'approved'
           AND deleted_at IS NULL
    LOOP
        PERFORM enqueue_ai_embedding_outbox(
            related_document.company_id,
            'document',
            related_document.id,
            'upsert',
            NOW()
        );
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leases_ai_embedding_outbox ON leases;
CREATE TRIGGER leases_ai_embedding_outbox
AFTER UPDATE OF confirmed_contract_text, draft_contract_text ON leases
FOR EACH ROW EXECUTE FUNCTION trg_enqueue_lease_document_embeddings();

CREATE INDEX IF NOT EXISTS idx_ai_embedding_outbox_processing_locks
    ON ai_embedding_outbox (locked_at)
    WHERE status = 'processing';

COMMIT;
