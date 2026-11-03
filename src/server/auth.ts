import type { Context, MiddlewareHandler } from 'hono';
import { constantTimeCompare, sha256 } from './crypto.js';

export type UserRole =
  | 'PLATFORM_OWNER'
  | 'OPERATIONS_ADMIN'
  | 'TEAM_LEAD'
  | 'SPECIALIST_OPERATOR'
  | 'READ_ONLY_AUDITOR'
  // Legacy aliases mapped
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'SALES_REP';

export type SecurityTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_4';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export function normalizeStoredRole(role: string): UserRole {
  if (role === 'ADMIN') return 'PLATFORM_OWNER';
  if (role === 'SUPERVISOR') return 'TEAM_LEAD';
  if (role === 'SALES_REP') return 'SPECIALIST_OPERATOR';
  return role as UserRole;
}

export function toStoredRole(role: UserRole): 'ADMIN' | 'SUPERVISOR' | 'SALES_REP' {
  if (role === 'PLATFORM_OWNER' || role === 'OPERATIONS_ADMIN') return 'ADMIN';
  if (role === 'TEAM_LEAD') return 'SUPERVISOR';
  return 'SALES_REP';
}

export interface AuthenticatedUser {
  id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  department?: string;
  role: UserRole;
  security_tier: SecurityTier;
  status: UserStatus;
  scopes: string[];
  session_id_hash?: string;
  csrf_token_hash?: string;
  reauthenticated_at?: string | null;
  is_cookie_session?: boolean;
}

const TIER_HIERARCHY: Record<SecurityTier, number> = {
  TIER_0: 0,
  TIER_1: 1,
  TIER_2: 2,
  TIER_3: 3,
  TIER_4: 4,
};

export function hasMinimumTier(userTier: SecurityTier, requiredTier: SecurityTier): boolean {
  return TIER_HIERARCHY[userTier] <= TIER_HIERARCHY[requiredTier];
}

export async function hashToken(token: string): Promise<string> {
  return sha256(token);
}

// Seeded users for test environment execution (strict TIER mapping)
export const SEEDED_CRM_USERS: Record<string, AuthenticatedUser> = {
  'usr_admin_1': {
    id: 'usr_admin_1',
    workspace_id: 'ws_biai_main',
    email: 'admin@biai.com.bd',
    full_name: 'Farhan Ahmed',
    department: 'Management',
    role: 'PLATFORM_OWNER',
    security_tier: 'TIER_0',
    status: 'ACTIVE',
    scopes: [
      'CRM_READ',
      'CRM_TRIAGE',
      'CRM_REPLY_APPROVE',
      'CRM_REPLY_DISPATCH',
      'CRM_KNOWLEDGE_BASE_MANAGE',
      'AUDIT_READ',
      'USER_PROVISION',
      'SECURITY_ADMIN'
    ],
    reauthenticated_at: new Date().toISOString()
  },
  'usr_sup_1': {
    id: 'usr_sup_1',
    workspace_id: 'ws_biai_main',
    email: 'supervisor@biai.com.bd',
    full_name: 'Nasreen Khan',
    department: 'Operations',
    role: 'TEAM_LEAD',
    security_tier: 'TIER_2',
    status: 'ACTIVE',
    scopes: [
      'CRM_READ',
      'CRM_TRIAGE',
      'CRM_REPLY_APPROVE',
      'CRM_REPLY_DISPATCH',
      'AUDIT_READ'
    ],
    reauthenticated_at: new Date().toISOString()
  },
  'usr_rep_1': {
    id: 'usr_rep_1',
    workspace_id: 'ws_biai_main',
    email: 'tanvir@biai.com.bd',
    full_name: 'Tanvir Islam',
    department: 'Sales',
    role: 'SPECIALIST_OPERATOR',
    security_tier: 'TIER_3',
    status: 'ACTIVE',
    scopes: [
      'CRM_READ',
      'CRM_TRIAGE',
      'CRM_REPLY_APPROVE',
      'CRM_REPLY_DISPATCH'
    ],
    reauthenticated_at: new Date().toISOString()
  }
};

/**
 * Extract session token from request.
 * Prefers __Host-biai_session cookie, falls back to standard cookie or Bearer token.
 */
export function extractSessionToken(c: Context): { token: string; isCookie: boolean } | null {
  const cookieHeader = c.req.header('Cookie');
  if (cookieHeader) {
    const hostMatch = cookieHeader.match(/__Host-biai_session=([^;]+)/);
    if (hostMatch) return { token: hostMatch[1].trim(), isCookie: true };

    const stdMatch = cookieHeader.match(/biai_session=([^;]+)/);
    if (stdMatch) return { token: stdMatch[1].trim(), isCookie: true };

    const legacyMatch = cookieHeader.match(/session=([^;]+)/);
    if (legacyMatch) return { token: legacyMatch[1].trim(), isCookie: true };
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return { token, isCookie: false };
  }

  return null;
}

/**
 * Core Auth Middleware
 * Enforces deny-by-default access control across all protected routes.
 * Performs session lookup in D1, checks expiration, updates idle timeout,
 * and enforces CSRF verification on mutating cookie-authenticated requests.
 */
export function createAuthMiddleware(appKey: 'CRM' | 'PIPELINE' = 'CRM'): MiddlewareHandler {
  return async (c: Context, next) => {
    const path = c.req.path;

    // Public endpoints that do not require an active session
    if (
      path === '/api/health' ||
      path.startsWith('/api/webhooks/') ||
      path === '/api/auth/login' ||
      path === '/api/auth/password/reset/request' ||
      path === '/api/auth/password/reset/confirm' ||
      path.startsWith('/api/auth/invitations/') ||
      path === '/api/auth/bootstrap-owner'
    ) {
      return next();
    }

    const tokenInfo = extractSessionToken(c);
    let actor: AuthenticatedUser | null = null;
    const isProduction = c.env?.ENVIRONMENT === 'production';

    if (tokenInfo?.token) {
      const tokenHash = await hashToken(tokenInfo.token);

      // 1. Query D1 for session and user
      if (c.env?.DB) {
        try {
          const sessionRow = await c.env.DB.prepare(`
            SELECT
              s.id_hash,
              s.user_id,
              s.workspace_id,
              s.csrf_token_hash,
              s.mfa_verified_at,
              s.reauthenticated_at,
              s.expires_at,
              s.idle_expires_at,
              u.email,
              u.full_name,
              u.department,
              u.role,
              u.security_tier,
              u.status
            FROM auth_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.id_hash = ?
              AND s.revoked_at IS NULL
              AND s.expires_at > datetime('now')
              AND s.idle_expires_at > datetime('now')
              AND u.status = 'ACTIVE'
          `).bind(tokenHash).first();

          if (sessionRow) {
            // Load user scopes for this app
            const scopesResult = await c.env.DB.prepare(`
              SELECT permission FROM user_app_scopes
              WHERE user_id = ? AND app_key = ?
            `).bind(sessionRow.user_id, appKey).all();

            const scopes = (scopesResult.results || []).map((r: any) => r.permission as string);

            actor = {
              id: sessionRow.user_id,
              workspace_id: sessionRow.workspace_id,
              email: sessionRow.email,
              full_name: sessionRow.full_name,
              department: sessionRow.department,
              role: normalizeStoredRole(sessionRow.role as string),
              security_tier: sessionRow.security_tier as SecurityTier,
              status: sessionRow.status as UserStatus,
              scopes,
              session_id_hash: sessionRow.id_hash,
              csrf_token_hash: sessionRow.csrf_token_hash,
              reauthenticated_at: sessionRow.reauthenticated_at,
              is_cookie_session: tokenInfo.isCookie
            };

            // Touch session idle expiry in background
            c.env.DB.prepare(`
              UPDATE auth_sessions
              SET last_seen_at = datetime('now'),
                  idle_expires_at = datetime('now', '+4 hours')
              WHERE id_hash = ?
            `).bind(tokenHash).run().catch(() => {});
          }
        } catch (err) {
          console.error('D1 session query error:', err);
        }
      }

      // 2. In non-production testing environment only: accept seeded tokens
      if (!actor && !isProduction) {
        if (tokenInfo.token === 'admin-token' || tokenHash === '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918') {
          actor = { ...SEEDED_CRM_USERS['usr_admin_1'], is_cookie_session: tokenInfo.isCookie };
        } else if (tokenInfo.token === 'sup-token' || tokenInfo.token === 'mgr-token' || tokenHash === '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce') {
          actor = { ...SEEDED_CRM_USERS['usr_sup_1'], is_cookie_session: tokenInfo.isCookie };
        } else if (tokenInfo.token === 'rep-token' || tokenHash === '04f8996da763b7a969b1028ee3007569eaf3a635486ddab211d512c85b9df8fb') {
          actor = { ...SEEDED_CRM_USERS['usr_rep_1'], is_cookie_session: tokenInfo.isCookie };
        }
      }
    }

    // 3. Deny by default: If no actor, reject with 401
    if (!actor) {
      return c.json({
        error: 'Authentication required: missing or invalid session',
        code: 'UNAUTHORIZED'
      }, 401);
    }

    // 4. CSRF Validation for mutating requests authenticated via cookie
    const method = c.req.method.toUpperCase();
    if (actor.is_cookie_session && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (path !== '/api/auth/logout') {
        const reqCsrf = c.req.header('X-CSRF-Token');
        if (!reqCsrf) {
          return c.json({
            error: 'Forbidden: CSRF token missing from request headers',
            code: 'CSRF_MISSING'
          }, 403);
        }

        const hashedReqCsrf = await hashToken(reqCsrf);
        if (!actor.csrf_token_hash || !constantTimeCompare(hashedReqCsrf, actor.csrf_token_hash)) {
          return c.json({
            error: 'Forbidden: Invalid CSRF token',
            code: 'CSRF_INVALID'
          }, 403);
        }
      }
    }

    // 5. Attach actor to context
    c.set('actor', actor);
    c.set('workspaceId', actor.workspace_id);

    return next();
  };
}

export const authMiddleware = createAuthMiddleware('CRM');

/**
 * RBAC: Require one of the specified roles
 */
export function requireRole(allowedRoles: (UserRole)[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const actor = c.get('actor') as AuthenticatedUser;
    if (!actor) {
      return c.json({ error: 'Unauthorized: missing authentication session', code: 'UNAUTHORIZED' }, 401);
    }

    // Map legacy roles if needed
    const normalizedRole = actor.role;
    const isAllowed = allowedRoles.includes(normalizedRole) ||
      (actor.role === 'PLATFORM_OWNER' && allowedRoles.includes('ADMIN' as any)) ||
      (actor.role === 'TEAM_LEAD' && allowedRoles.includes('SUPERVISOR' as any)) ||
      (actor.role === 'SPECIALIST_OPERATOR' && allowedRoles.includes('SALES_REP' as any));

    if (!isAllowed) {
      return c.json({
        error: `Forbidden: role '${actor.role}' is not authorized. Requires one of: ${allowedRoles.join(', ')}`,
        code: 'ROLE_FORBIDDEN'
      }, 403);
    }
    await next();
  };
}

/**
 * TBAC: Require minimum security tier (e.g. TIER_1 requires TIER_0 or TIER_1)
 */
export function requireTier(minTier: SecurityTier) {
  return async (c: Context, next: () => Promise<void>) => {
    const actor = c.get('actor') as AuthenticatedUser;
    if (!actor) {
      return c.json({ error: 'Unauthorized: missing authentication session', code: 'UNAUTHORIZED' }, 401);
    }

    if (!hasMinimumTier(actor.security_tier, minTier)) {
      return c.json({
        error: `Forbidden: requires security tier ${minTier} or higher (current: ${actor.security_tier})`,
        code: 'INSUFFICIENT_SECURITY_TIER'
      }, 403);
    }
    await next();
  };
}

/**
 * PBAC: Require a specific permission scope (Platform Owner always has all scopes)
 */
export function requireScope(scope: string) {
  return async (c: Context, next: () => Promise<void>) => {
    const actor = c.get('actor') as AuthenticatedUser;
    if (!actor) {
      return c.json({ error: 'Unauthorized: missing authentication session', code: 'UNAUTHORIZED' }, 401);
    }

    if (actor.role === 'PLATFORM_OWNER' || actor.security_tier === 'TIER_0') {
      return next();
    }

    if (!actor.scopes.includes(scope)) {
      return c.json({
        error: `Forbidden: missing required permission scope '${scope}'`,
        code: 'SCOPE_FORBIDDEN'
      }, 403);
    }
    await next();
  };
}

/**
 * Step-Up Reauthentication Guard
 * Requires session reauthenticated_at to be within maxMinutes (default 10)
 */
export function parseSqlUtc(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const iso = dateStr.includes('T') ? dateStr : (dateStr.replace(' ', 'T') + 'Z');
  return new Date(iso).getTime();
}

export function requireReauth(maxMinutes = 10) {
  return async (c: Context, next: () => Promise<void>) => {
    const actor = c.get('actor') as AuthenticatedUser;
    if (!actor) {
      return c.json({ error: 'Unauthorized: missing authentication session', code: 'UNAUTHORIZED' }, 401);
    }

    if (!actor.reauthenticated_at) {
      return c.json({
        error: 'Step-up authentication required for privileged action',
        code: 'STEP_UP_REQUIRED'
      }, 403);
    }

    const reauthTime = parseSqlUtc(actor.reauthenticated_at);
    const elapsedMinutes = (Date.now() - reauthTime) / (60 * 1000);

    if (elapsedMinutes > maxMinutes) {
      return c.json({
        error: `Step-up authentication expired (${Math.round(elapsedMinutes)}m ago, max ${maxMinutes}m). Reauthentication required.`,
        code: 'STEP_UP_REQUIRED'
      }, 403);
    }

    await next();
  };
}
