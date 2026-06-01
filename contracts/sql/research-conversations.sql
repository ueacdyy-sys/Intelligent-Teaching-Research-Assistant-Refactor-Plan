CREATE TABLE IF NOT EXISTS research_conversations (
    id TEXT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    settings JSONB
);

CREATE INDEX IF NOT EXISTS ix_research_conversations_updated_at
    ON research_conversations (updated_at);
