-- ============================================================================
-- 0006_account_admin_and_messaging.sql
-- BIAI Control Plane: User Lifecycle, Admin Controls & Internal Messaging
-- ============================================================================

-- 1. Extend users table for admin freeze and password-change enforcement
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN suspended_reason TEXT;
ALTER TABLE users ADD COLUMN suspended_by TEXT;

-- 2. Internal Messaging Threads
CREATE TABLE IF NOT EXISTS internal_threads (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    thread_type TEXT NOT NULL CHECK (thread_type IN ('DIRECT', 'ROLE_BROADCAST')),
    target_role TEXT,
    subject TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('NORMAL', 'HIGH', 'CRITICAL')),
    context_type TEXT CHECK (context_type IN ('NONE', 'ENQUIRY', 'LEAD', 'USER')),
    context_id TEXT,
    context_label TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_internal_threads_workspace_last_msg
ON internal_threads(workspace_id, last_message_at DESC);

-- 3. Thread Participants & Read / Acknowledgment State
CREATE TABLE IF NOT EXISTS internal_thread_participants (
    thread_id TEXT NOT NULL REFERENCES internal_threads(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    participant_role TEXT NOT NULL DEFAULT 'PARTICIPANT' CHECK (participant_role IN ('CREATOR', 'RECIPIENT', 'BROADCAST_MEMBER')),
    last_read_at TEXT,
    acknowledged_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_participants_user_read
ON internal_thread_participants(user_id, last_read_at);

-- 4. Internal Messages
CREATE TABLE IF NOT EXISTS internal_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES internal_threads(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'MESSAGE' CHECK (message_type IN ('MESSAGE', 'DIRECTIVE', 'SYSTEM_NOTICE')),
    requires_ack INTEGER NOT NULL DEFAULT 0,
    acknowledged_by TEXT REFERENCES users(id),
    acknowledged_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_thread_created
ON internal_messages(thread_id, created_at ASC);

-- 5. Seed Tier 1 OPERATIONS_ADMIN (Tariqul Islam)
INSERT OR IGNORE INTO users (
    id, workspace_id, email, normalized_email, full_name, department,
    password_hash, role, security_tier, status, mfa_required, created_at, updated_at
) VALUES (
    'usr_ops_1', 'ws_biai_main', 'opsadmin@biai.com.bd', 'opsadmin@biai.com.bd', 'Tariqul Islam', 'Operations',
    '$pbkdf2-sha256$i=100000$b3BzYWRtaW4tc2FsdC0xMjM0$g9Wz1p1bE+o7sN3wE6fL3n5sR8tU2vX1yZ0aB4cD6eE=',
    'ADMIN', 'TIER_1', 'ACTIVE', 0, datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO user_app_scopes (user_id, app_key, permission, granted_by) VALUES
('usr_ops_1', 'CRM', 'CRM_READ', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'CRM_TRIAGE', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'CRM_REPLY_APPROVE', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'CRM_REPLY_DISPATCH', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'CRM_KNOWLEDGE_BASE_MANAGE', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'AUDIT_READ', 'usr_admin_1'),
('usr_ops_1', 'CRM', 'USER_PROVISION', 'usr_admin_1');

-- 6. Seed Initial Directive Thread from PLATFORM_OWNER to OPERATIONS_ADMIN
INSERT OR IGNORE INTO internal_threads (
    id, workspace_id, thread_type, target_role, subject, priority,
    context_type, context_id, context_label, created_by, last_message_at, is_archived, created_at
) VALUES (
    'th_directive_1', 'ws_biai_main', 'DIRECT', NULL,
    'SLA Escalation Directive: Response Times for High-Value Leads',
    'CRITICAL', 'ENQUIRY', '12', 'Enquiry #12 - Motijheel Bank (৳ 1,500,000)',
    'usr_admin_1', datetime('now', '-2 hours'), 0, datetime('now', '-2 hours')
);

INSERT OR IGNORE INTO internal_thread_participants (thread_id, user_id, participant_role, last_read_at, acknowledged_at) VALUES
('th_directive_1', 'usr_admin_1', 'CREATOR', datetime('now', '-2 hours'), datetime('now', '-2 hours')),
('th_directive_1', 'usr_ops_1', 'RECIPIENT', NULL, NULL);

INSERT OR IGNORE INTO internal_messages (
    id, thread_id, sender_id, body, message_type, requires_ack, acknowledged_by, acknowledged_at, created_at
) VALUES (
    'msg_directive_1', 'th_directive_1', 'usr_admin_1',
    'Tariqul: Please prioritize Enquiry #12 (Kamrul Islam - Bank in Motijheel). 120 seats at stake. Ensure our specialist team dispatches the customized banking AI curriculum proposal by 4 PM today.',
    'DIRECTIVE', 1, NULL, NULL, datetime('now', '-2 hours')
);
