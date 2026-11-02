-- ============================================================================
-- 0001_core_crm_schema.sql
-- Cloudflare D1 Relational Schema with FTS5 and Audit Ledger
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Tenant / Organization Boundary
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Staff Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SUPERVISOR', 'SALES_REP')),
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Canonical Contacts (Deduplicated Person Entity)
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    organization TEXT,
    role TEXT,
    primary_phone TEXT,
    normalized_phone TEXT UNIQUE, -- Indexed canonical +8801XXXXXXXXX
    primary_email TEXT,
    primary_channel TEXT NOT NULL,
    preferred_language TEXT NOT NULL DEFAULT 'BANGLISH' CHECK (
        preferred_language IN ('BN_SCRIPT', 'BANGLISH', 'EN', 'MIXED', 'UNKNOWN')
    ),
    is_merged INTEGER NOT NULL DEFAULT 0,
    merged_into_id TEXT REFERENCES contacts(id),
    total_messages INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_normalized_phone ON contacts(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id);

-- 4. Channel Conversations (Thread Container)
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    channel TEXT NOT NULL CHECK (channel IN (
        'WhatsApp', 'Facebook Messenger', 'Website form', 'Phone call note', 'Facebook comment'
    )),
    external_thread_id TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SNOOZED', 'CLOSED')),
    assigned_user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Immutable Messages (Inbound and Outbound Ledger)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    channel TEXT NOT NULL,
    external_message_id TEXT UNIQUE,
    sender_raw TEXT NOT NULL,
    phone_raw TEXT,
    content TEXT NOT NULL,
    detected_language TEXT NOT NULL CHECK (
        detected_language IN ('BN_SCRIPT', 'BANGLISH', 'EN', 'MIXED', 'UNKNOWN')
    ),
    language_confidence REAL NOT NULL DEFAULT 1.0,
    received_at TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'DELIVERED' CHECK (
        delivery_status IN ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')
    ),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at);

-- 6. Sales Opportunities (Revenue Pipeline Only)
CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    source_message_id TEXT NOT NULL REFERENCES messages(id),
    program_intent TEXT NOT NULL CHECK (program_intent IN (
        'Bootcamp', 'Fellowship', 'Corporate Training', 'Free Masterclass', 'General Course'
    )),
    pipeline_stage TEXT NOT NULL DEFAULT 'New' CHECK (pipeline_stage IN (
        'New', 'Contacted', 'Interested', 'Paid', 'Lost'
    )),
    estimated_seats INTEGER NOT NULL DEFAULT 1,
    estimated_value_bdt INTEGER NOT NULL DEFAULT 0,
    sla_status TEXT NOT NULL DEFAULT 'IN_SLA' CHECK (
        sla_status IN ('IN_SLA', 'AT_RISK', 'BREACHED', 'MET')
    ),
    sla_due_at TEXT NOT NULL,
    first_response_at TEXT,
    assigned_user_id TEXT REFERENCES users(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_sla ON opportunities(sla_status);

-- 7. Operational & Support Tickets (Non-Sales Funnels)
CREATE TABLE IF NOT EXISTS operational_tickets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    source_message_id TEXT NOT NULL REFERENCES messages(id),
    queue_category TEXT NOT NULL CHECK (queue_category IN (
        'CRITICAL_ESCALATION', 'SUPPORT_BILLING', 'CAREERS_HR', 'SPAM_SECURITY'
    )),
    ticket_status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
        ticket_status IN ('OPEN', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'QUARANTINED')
    ),
    urgency_level TEXT NOT NULL CHECK (urgency_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    sentiment TEXT NOT NULL CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'FRUSTRATED', 'SPAM')),
    sla_status TEXT NOT NULL DEFAULT 'IN_SLA' CHECK (
        sla_status IN ('IN_SLA', 'AT_RISK', 'BREACHED', 'MET')
    ),
    sla_due_at TEXT NOT NULL,
    resolution_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tickets_queue ON operational_tickets(queue_category);

-- 8. AI Extraction & Audit Provenance
CREATE TABLE IF NOT EXISTS ai_extractions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    model_provider TEXT NOT NULL, -- e.g. 'workers-ai' | 'gemini-2.5-flash' | 'deterministic'
    model_version TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    overall_confidence REAL NOT NULL,
    raw_response_json TEXT NOT NULL,
    extracted_fields_json TEXT NOT NULL, -- JSON containing value, confidence, and provenance span
    validation_status TEXT NOT NULL CHECK (validation_status IN ('PASSED', 'REPAIRED', 'FALLBACK')),
    human_reviewed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Ground-Truth Versioned Knowledge Base
CREATE TABLE IF NOT EXISTS knowledge_base (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    program_category TEXT NOT NULL,
    topic TEXT NOT NULL,
    facts_payload_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    published_by TEXT REFERENCES users(id),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Entity Merges Ledger (Deduplication Audit Trail)
CREATE TABLE IF NOT EXISTS contact_merges (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    canonical_contact_id TEXT NOT NULL REFERENCES contacts(id),
    merged_contact_id TEXT NOT NULL,
    match_rule TEXT NOT NULL, -- 'EXACT_PHONE' | 'FUZZY_NAME_MANUAL'
    confidence REAL NOT NULL,
    merged_by TEXT NOT NULL REFERENCES users(id),
    merged_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Immutable Audit Ledger (Append-Only)
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_type TEXT NOT NULL DEFAULT 'USER' CHECK (actor_type IN ('USER', 'SYSTEM', 'WEBHOOK')),
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'STAGE_TRANSITION' | 'TICKET_STATUS_UPDATED' | 'REPLY_APPROVED' | 'CONTACT_MERGED' | 'INBOUND_INGEST'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state_json TEXT,
    after_state_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Immutability Triggers for audit_events
CREATE TRIGGER IF NOT EXISTS trg_audit_events_crm_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(FAIL, 'audit_events is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_events_crm_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(FAIL, 'audit_events is append-only and cannot be deleted');
END;

-- 12. SQLite FTS5 Full-Text Search Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
    message_id UNINDEXED,
    sender_raw,
    content,
    tokenize = 'unicode61'
);
