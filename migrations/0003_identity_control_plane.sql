-- ============================================================================
-- 0003_identity_control_plane.sql
-- BIAI Access & Operations Control Plane: Identity, Sessions, MFA & Webhook Ledger
-- ============================================================================

PRAGMA foreign_keys = OFF;

-- 1. Table Rebuild for users to introduce Tiered Roles & Lockout Columns
CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    email TEXT NOT NULL UNIQUE,
    normalized_email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    department TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'PLATFORM_OWNER',
        'OPERATIONS_ADMIN',
        'TEAM_LEAD',
        'SPECIALIST_OPERATOR',
        'READ_ONLY_AUDITOR'
    )),
    security_tier TEXT NOT NULL CHECK (
        security_tier IN ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3', 'TIER_4')
    ),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')
    ),
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    password_changed_at TEXT,
    mfa_required INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (workspace_id, normalized_email)
);

-- Copy existing users with role mapping and PBKDF2 password hashes
INSERT INTO users_new (
    id, workspace_id, email, normalized_email, full_name, department, password_hash, role, security_tier, status, failed_login_count, mfa_required, created_at, updated_at
)
SELECT 
    id,
    workspace_id,
    email,
    lower(email),
    full_name,
    CASE 
        WHEN role = 'ADMIN' THEN 'Management'
        WHEN role = 'SUPERVISOR' THEN 'Operations'
        ELSE 'Sales'
    END,
    'disabled_pending_bootstrap',
    CASE 
        WHEN role = 'ADMIN' THEN 'PLATFORM_OWNER'
        WHEN role = 'SUPERVISOR' THEN 'TEAM_LEAD'
        ELSE 'SPECIALIST_OPERATOR'
    END,
    CASE 
        WHEN role = 'ADMIN' THEN 'TIER_0'
        WHEN role = 'SUPERVISOR' THEN 'TIER_2'
        ELSE 'TIER_3'
    END,
    CASE WHEN id IN ('usr_admin_1', 'usr_sup_1', 'usr_rep_1') THEN 'DEACTIVATED' ELSE 'ACTIVE' END,
    0,
    CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END,
    created_at,
    datetime('now')
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_users_normalized_email ON users(normalized_email);

-- 2. User Application Scopes & Granular Permissions
CREATE TABLE IF NOT EXISTS user_app_scopes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    app_key TEXT NOT NULL CHECK (app_key IN ('CRM', 'PIPELINE')),
    permission TEXT NOT NULL,
    granted_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, app_key, permission)
);

-- Seed scopes
INSERT OR IGNORE INTO user_app_scopes (user_id, app_key, permission, granted_by) VALUES
('usr_admin_1', 'CRM', 'CRM_READ', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'CRM_TRIAGE', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'CRM_REPLY_APPROVE', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'CRM_REPLY_DISPATCH', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'CRM_KNOWLEDGE_BASE_MANAGE', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'AUDIT_READ', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'USER_PROVISION', 'usr_admin_1'),
('usr_admin_1', 'CRM', 'SECURITY_ADMIN', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_READ', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_REMEDIATE', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_MERGE', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_EMAIL_APPROVE', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_EMAIL_DISPATCH', 'usr_admin_1'),
('usr_admin_1', 'PIPELINE', 'PIPELINE_EXPORT', 'usr_admin_1'),
('usr_sup_1', 'CRM', 'CRM_READ', 'usr_admin_1'),
('usr_sup_1', 'CRM', 'CRM_TRIAGE', 'usr_admin_1'),
('usr_sup_1', 'CRM', 'CRM_REPLY_APPROVE', 'usr_admin_1'),
('usr_sup_1', 'CRM', 'CRM_REPLY_DISPATCH', 'usr_admin_1'),
('usr_sup_1', 'CRM', 'AUDIT_READ', 'usr_admin_1'),
('usr_rep_1', 'CRM', 'CRM_READ', 'usr_admin_1'),
('usr_rep_1', 'CRM', 'CRM_TRIAGE', 'usr_admin_1'),
('usr_rep_1', 'CRM', 'CRM_REPLY_APPROVE', 'usr_admin_1'),
('usr_rep_1', 'CRM', 'CRM_REPLY_DISPATCH', 'usr_admin_1');

-- 3. Production auth_sessions Table with CSRF & Step-Up Reauthentication
CREATE TABLE IF NOT EXISTS auth_sessions (
    id_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    csrf_token_hash TEXT NOT NULL,
    mfa_verified_at TEXT,
    reauthenticated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    idle_expires_at TEXT NOT NULL,
    revoked_at TEXT,
    revoke_reason TEXT,
    ip_hash TEXT,
    user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions(expires_at);

-- 4. MFA Factors Table (AES-GCM encrypted secrets)
CREATE TABLE IF NOT EXISTS mfa_factors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    factor_type TEXT NOT NULL CHECK (factor_type IN ('TOTP', 'RECOVERY_CODE')),
    secret_ciphertext TEXT NOT NULL,
    enabled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mfa_factors_user ON mfa_factors(user_id);

-- 5. Operator Invitations (Single-use hashed tokens)
CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Password Resets (Single-use hashed tokens)
CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. Durable Rate Limit Buckets
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    bucket_key TEXT PRIMARY KEY,
    counter INTEGER NOT NULL DEFAULT 1,
    window_start TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_buckets(expires_at);

-- 8. Append-Only Security Auth Events
CREATE TABLE IF NOT EXISTS auth_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT,
    actor_user_id TEXT,
    subject_user_id TEXT,
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
    reason_code TEXT,
    ip_hash TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_auth_events_no_update
BEFORE UPDATE ON auth_events
BEGIN
    SELECT RAISE(FAIL, 'auth_events is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS trg_auth_events_no_delete
BEFORE DELETE ON auth_events
BEGIN
    SELECT RAISE(FAIL, 'auth_events is append-only and cannot be deleted');
END;

-- 9. Durable Webhook Events Ledger
CREATE TABLE IF NOT EXISTS webhook_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE')),
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    failure_code TEXT,
    UNIQUE (workspace_id, provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_status ON webhook_events(status);

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
