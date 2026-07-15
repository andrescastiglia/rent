-- =============================================================================
-- Migration: 088_add_ai_rag_backfill_checkpoints.sql
-- Description: Durable resume checkpoints for RAG batch backfills.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_rag_backfill_checkpoints (
    checkpoint_key VARCHAR(240) PRIMARY KEY,
    entity_type VARCHAR(80) NOT NULL,
    company_id UUID,
    embedding_version INTEGER NOT NULL,
    last_entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_rag_backfill_checkpoint_version
        CHECK (embedding_version > 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_rag_backfill_checkpoints_updated
    ON ai_rag_backfill_checkpoints (updated_at);

COMMIT;
