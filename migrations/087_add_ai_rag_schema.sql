-- =============================================================================
-- Migration: 087_add_ai_rag_schema.sql
-- Description: Create the RAG projection, embedding outbox and run audit tables.
-- Embedding contract v1: pgvector vector(1536).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID NOT NULL,
    chunk_key VARCHAR(160) NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(1536),
    embedding_model VARCHAR(120) NOT NULL,
    embedding_version INTEGER NOT NULL DEFAULT 1,
    content_hash VARCHAR(64) NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    embedded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_ai_knowledge_chunk
        UNIQUE (company_id, entity_type, entity_id, chunk_key, embedding_version),
    CONSTRAINT ck_ai_knowledge_chunk_index CHECK (chunk_index >= 0),
    CONSTRAINT ck_ai_knowledge_content CHECK (length(btrim(content)) > 0),
    CONSTRAINT ck_ai_knowledge_embedding_version CHECK (embedding_version > 0),
    CONSTRAINT ck_ai_knowledge_content_hash CHECK (content_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_ai_chunks_company_entity
    ON ai_knowledge_chunks (company_id, entity_type, entity_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_chunks_source_updated
    ON ai_knowledge_chunks (source_updated_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_chunks_metadata
    ON ai_knowledge_chunks USING GIN (metadata);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_ai_knowledge_chunks_updated_at'
          AND tgrelid = 'ai_knowledge_chunks'::regclass
          AND NOT tgisinternal
    ) THEN
        CREATE TRIGGER update_ai_knowledge_chunks_updated_at
            BEFORE UPDATE ON ai_knowledge_chunks
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ai_embedding_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(120),
    last_error TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_embedding_outbox_operation
        CHECK (operation IN ('upsert', 'delete')),
    CONSTRAINT ck_ai_embedding_outbox_status
        CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
    CONSTRAINT ck_ai_embedding_outbox_attempts CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_embedding_outbox_pending
    ON ai_embedding_outbox (available_at, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_ai_embedding_outbox_entity
    ON ai_embedding_outbox (company_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_rag_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID,
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(30) NOT NULL,
    strategy VARCHAR(30) NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    retrieved_chunk_ids UUID[] NOT NULL DEFAULT '{}',
    cited_chunk_ids UUID[] NOT NULL DEFAULT '{}',
    insufficient_evidence BOOLEAN NOT NULL DEFAULT FALSE,
    model VARCHAR(120),
    prompt_version VARCHAR(50) NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_rag_runs_query_hash CHECK (query_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_ai_rag_runs_token_counts CHECK (
        (input_tokens IS NULL OR input_tokens >= 0)
        AND (output_tokens IS NULL OR output_tokens >= 0)
    ),
    CONSTRAINT ck_ai_rag_runs_latency CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_rag_runs_company_created
    ON ai_rag_runs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_rag_runs_conversation_created
    ON ai_rag_runs (conversation_id, created_at DESC)
    WHERE conversation_id IS NOT NULL;

COMMENT ON TABLE ai_knowledge_chunks IS
    'Versioned, company-scoped RAG projection with 1536-dimensional embeddings';
COMMENT ON TABLE ai_embedding_outbox IS
    'Transactional outbox for asynchronous RAG projection updates';
COMMENT ON TABLE ai_rag_runs IS
    'Privacy-conscious audit records for RAG retrieval and answer generation';

COMMIT;
