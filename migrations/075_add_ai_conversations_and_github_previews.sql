-- Migration: 075_add_ai_conversations_and_github_previews.sql
-- Description: Persist AI chat conversations and GitHub issue previews across app restarts.
-- Created at: 2026-02-19

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    tool_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_activity_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
    ON ai_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_company_updated
    ON ai_conversations (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_github_issue_previews (
    preview_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NULL,
    conversation_id UUID NULL,
    draft JSONB NOT NULL,
    similar_issues JSONB NOT NULL,
    recommendation JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_github_issue_previews_user_expires
    ON ai_github_issue_previews (user_id, expires_at);
