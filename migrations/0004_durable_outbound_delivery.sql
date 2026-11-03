ALTER TABLE messages ADD COLUMN provider_message_id TEXT;
ALTER TABLE messages ADD COLUMN idempotency_key TEXT;
ALTER TABLE messages ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN next_retry_at TEXT;
ALTER TABLE messages ADD COLUMN failure_code TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_delivery_queue
ON messages(delivery_status, next_retry_at);

ALTER TABLE ai_extractions ADD COLUMN fallback_reason TEXT;
