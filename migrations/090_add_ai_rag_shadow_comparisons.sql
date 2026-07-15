BEGIN;

CREATE TABLE IF NOT EXISTS ai_rag_shadow_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rag_run_id UUID REFERENCES ai_rag_runs(id) ON DELETE SET NULL,
    conversation_id UUID,
    company_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(30) NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    tools_output_hash VARCHAR(64),
    rag_output_hash VARCHAR(64),
    lexical_similarity NUMERIC(6,5),
    rag_source_count INTEGER NOT NULL DEFAULT 0,
    rag_insufficient_evidence BOOLEAN,
    tools_latency_ms INTEGER,
    rag_latency_ms INTEGER,
    status VARCHAR(20) NOT NULL,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_ai_rag_shadow_status
        CHECK (status IN ('compared', 'rag_failed', 'tools_failed')),
    CONSTRAINT ck_ai_rag_shadow_hashes CHECK (
        (query_hash ~ '^[0-9a-f]{64}$')
        AND (tools_output_hash IS NULL OR tools_output_hash ~ '^[0-9a-f]{64}$')
        AND (rag_output_hash IS NULL OR rag_output_hash ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT ck_ai_rag_shadow_similarity CHECK (
        lexical_similarity IS NULL
        OR (lexical_similarity >= 0 AND lexical_similarity <= 1)
    )
);

CREATE INDEX IF NOT EXISTS idx_ai_rag_shadow_company_created
    ON ai_rag_shadow_comparisons (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_rag_shadow_status_created
    ON ai_rag_shadow_comparisons (status, created_at DESC);

COMMENT ON TABLE ai_rag_shadow_comparisons IS
    'Privacy-conscious comparison of legacy tool and RAG answers; stores hashes and metrics, never prompt or output text';

COMMIT;
