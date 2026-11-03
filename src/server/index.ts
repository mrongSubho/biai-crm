import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  authMiddleware,
  requireRole,
  requireTier,
  requireScope,
  requireReauth,
  type AuthenticatedUser
} from './auth.js';
import { AuthService } from './auth_service.js';
import { MessagingService } from './messaging_service.js';
import { CrmRepository } from './db/repository.js';
import {
  StageTransitionSchema,
  TicketStatusTransitionSchema,
  OutboundReplySchema,
  ParseMessageSchema,
  EnquiryQuerySchema
} from './validation.js';
import { sha256 } from './crypto.js';
import { getMissingProductionConfig } from './config.js';
import { retryQueuedCrmDeliveries } from './delivery_retry.js';

// Cloudflare Worker Environment Bindings
export interface Env {
  DB?: any;
  AI?: any;
  ASSETS?: any;
  ENVIRONMENT?: string;
  DEFAULT_TIMEZONE?: string;
  WORKSPACE_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  META_WHATSAPP_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
  GEMINI_API_KEY?: string;
  MFA_ENCRYPTION_KEY?: string;
  INITIAL_OWNER_BOOTSTRAP_TOKEN?: string;
  ALLOWED_ORIGINS?: string;
}

const app = new Hono<{
  Bindings: Env;
  Variables: { actor: AuthenticatedUser; workspaceId: string };
}>();

app.use('*', async (c, next) => {
  const missing = getMissingProductionConfig(c.env as unknown as Record<string, unknown>);
  if (missing.length > 0) {
    return c.json({
      error: 'Production configuration is incomplete',
      code: 'PRODUCTION_CONFIG_INVALID',
      missing
    }, 503);
  }
  return next();
});

// 1. Global CORS Middleware
app.use('*', cors({
  origin: (origin, c) => {
    if (c.env?.ENVIRONMENT !== 'production') return origin || '*';
    const allowedOrigins = (c.env?.ALLOWED_ORIGINS || '').split(',').map((value: string) => value.trim()).filter(Boolean);
    return origin && allowedOrigins.includes(origin) ? origin : '';
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// 2. Authentication Middleware across protected route namespaces
app.use('/api/v1/*', authMiddleware);
app.use('/api/admin/*', authMiddleware);
app.use('/api/auth/me', authMiddleware);
app.use('/api/auth/logout', authMiddleware);
app.use('/api/auth/reauthenticate', authMiddleware);
app.use('/api/auth/mfa/*', authMiddleware);
app.use('/api/auth/password/change', authMiddleware);
app.use('/api/auth/profile', authMiddleware);
app.use('/api/auth/sessions', authMiddleware);
app.use('/api/auth/sessions/*', authMiddleware);
app.use('/api/auth/activity', authMiddleware);

// ============================================================================
// SYSTEM HEALTHCHECK
// ============================================================================
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    runtime: 'Cloudflare Workers (Edge V8 Isolate)',
    d1_connected: Boolean(c.env?.DB),
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'development',
    timezone: c.env?.DEFAULT_TIMEZONE || 'Asia/Dhaka'
  });
});

// ============================================================================
// IDENTITY & AUTHENTICATION CONTROL PLANE
// ============================================================================

// POST /api/auth/login: Rate-limited, locked, PBKDF2 + MFA verification
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, mfaCode } = body;

  if (!email || !password) {
    return c.json({ error: 'Email and password are required', code: 'INVALID_REQUEST' }, 400);
  }

  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const ua = c.req.header('user-agent') || 'Unknown';

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.login(ip, ua, { email, password, mfaCode });

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }

  if (result.requiresMfa) {
    return c.json(result.data, 200);
  }

  if (result.cookieHeader) {
    c.header('Set-Cookie', result.cookieHeader);
  }

  return c.json(result.data, 200);
});

// POST /api/auth/logout: Revokes session token in D1
app.post('/api/auth/logout', async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const token = actor?.session_id_hash;

  const result = await authService.logout(token || '', actor?.id);
  if (result.cookieHeader) {
    c.header('Set-Cookie', result.cookieHeader);
  }
  return c.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me: Inspect currently authenticated actor context
app.get('/api/auth/me', async (c) => {
  const actor = c.get('actor');
  if (!actor) {
    return c.json({ error: 'Unauthorized: missing authentication session', code: 'UNAUTHORIZED' }, 401);
  }
  return c.json({
    id: actor.id,
    workspace_id: actor.workspace_id,
    email: actor.email,
    full_name: actor.full_name,
    department: actor.department,
    role: actor.role,
    security_tier: actor.security_tier,
    scopes: actor.scopes,
    reauthenticated_at: actor.reauthenticated_at
  });
});

// POST /api/auth/reauthenticate: Step-up authentication
app.post('/api/auth/reauthenticate', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const { password, mfaCode } = body;

  if (!password) {
    return c.json({ error: 'Password is required for reauthentication' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.reauthenticate(actor.id, actor.session_id_hash || '', { password, mfaCode });

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }

  return c.json(result.data, 200);
});

// POST /api/auth/mfa/enroll: Requires step-up reauthentication within 10 min
app.post('/api/auth/mfa/enroll', requireReauth(10), async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.enrollMfa(actor.id);

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 200);
});

// POST /api/auth/mfa/confirm: Confirms pending MFA enrollment
app.post('/api/auth/mfa/confirm', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const { factorId, code } = body;

  if (!factorId || !code) {
    return c.json({ error: 'factorId and 6-digit code are required' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.confirmMfa(actor.id, factorId, code);

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 200);
});

// POST /api/auth/password/change: Requires step-up reauthentication
app.post('/api/auth/password/change', requireReauth(10), async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'currentPassword and newPassword are required' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.changePassword(actor.id, currentPassword, newPassword, actor.session_id_hash);

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 200);
});

// PATCH /api/auth/profile: Self-service update own profile
app.patch('/api/auth/profile', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.updateProfile(actor.id, {
    fullName: body.fullName,
    department: body.department
  });
  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }
  return c.json(result.data, 200);
});

// GET /api/auth/sessions: Self-service list active sessions
app.get('/api/auth/sessions', async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.listSessions(actor.id, actor.session_id_hash);
  return c.json(result.data, 200);
});

// POST /api/auth/sessions/revoke-others: Revoke all other sessions
app.post('/api/auth/sessions/revoke-others', async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.revokeOtherSessions(actor.id, actor.session_id_hash || '');
  return c.json(result.data, 200);
});

// GET /api/auth/activity: Self-service user security activity
app.get('/api/auth/activity', async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.getUserActivity(actor.id);
  return c.json(result.data, 200);
});

// POST /api/auth/invitations: Invite operator (Tier 0 or Tier 1 only + recent reauth)
app.post('/api/auth/invitations', authMiddleware, requireTier('TIER_1'), requireReauth(10), async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const { email, fullName, department, role, securityTier, scopes } = body;

  if (!email || !fullName || !role || !securityTier) {
    return c.json({ error: 'email, fullName, role, and securityTier are required' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.createInvitation(actor, {
    email,
    fullName,
    department,
    role,
    securityTier,
    scopes: Array.isArray(scopes) ? scopes : ['CRM_READ', 'CRM_TRIAGE']
  });

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 201);
});

// POST /api/auth/invitations/accept: Public endpoint to accept invitation
app.post('/api/auth/invitations/accept', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { token, fullName, password } = body;

  if (!token || !password) {
    return c.json({ error: 'token and password are required' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.acceptInvitation(token, { fullName, password });

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 200);
});

// POST /api/auth/bootstrap-owner: Controlled Platform Owner Provisioning
app.post('/api/auth/bootstrap-owner', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, fullName, password, bootstrapToken } = body;

  if (!email || !fullName || !password) {
    return c.json({ error: 'email, fullName, and password are required' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.bootstrapOwner({ email, fullName, password, bootstrapToken });

  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }

  return c.json(result.data, 200);
});

// ============================================================================
// ADMINISTRATIVE USER & ACCESS CONTROL PLANE (TIER_0 / TIER_1)
// ============================================================================

// GET /api/admin/users: Enriched directory with scopes, active session counts & permissions
app.get('/api/admin/users', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.listUsers(actor);
  if (!result.success) {
    return c.json({ error: result.error }, result.status as any);
  }
  return c.json(result.data, 200);
});

// POST /api/admin/users: Create new active user or tokenized invitation
app.post('/api/admin/users', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const { email, fullName, department, role, securityTier, scopes } = body;
  const password = body.password || body.tempPassword;
  const mustChangePassword = body.mustChangePassword !== undefined ? !!body.mustChangePassword : true;

  if (!email || !fullName || !role || !securityTier) {
    return c.json({ error: 'email, fullName, role, and securityTier are required', code: 'INVALID_REQUEST' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.createUser(actor, {
    email,
    fullName,
    department,
    role,
    securityTier,
    scopes,
    password,
    mustChangePassword: !!mustChangePassword
  });

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 201);
});

// PATCH /api/admin/users/:id: Modify user role, tier, department, scopes
app.patch('/api/admin/users/:id', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.updateUser(actor, targetId, {
    fullName: body.fullName,
    department: body.department,
    role: body.role,
    securityTier: body.securityTier,
    scopes: body.scopes
  });

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// POST /api/admin/users/:id/reset-password: Force set password for target user
app.post('/api/admin/users/:id/reset-password', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const newPassword = body.newPassword || body.tempPassword;

  if (!newPassword) {
    return c.json({ error: 'newPassword or tempPassword is required', code: 'INVALID_REQUEST' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.adminResetPassword(actor, targetId, newPassword);

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// POST /api/admin/users/:id/status: Freeze, Reactivate, Unlock Lockout, Deactivate
app.post('/api/admin/users/:id/status', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  let action = body.action;
  if (!action && body.status) {
    if (body.status === 'SUSPENDED') action = 'SUSPEND';
    else if (body.status === 'ACTIVE') action = 'ACTIVATE';
    else if (body.status === 'DEACTIVATED') action = 'DEACTIVATE';
  }
  const reason = body.reason;

  if (!action || !['SUSPEND', 'ACTIVATE', 'UNLOCK', 'DEACTIVATE'].includes(action)) {
    return c.json({ error: 'Valid action (SUSPEND, ACTIVATE, UNLOCK, DEACTIVATE) or status is required', code: 'INVALID_ACTION' }, 400);
  }

  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.setUserStatus(actor, targetId, action, reason);

  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// Backward-compatible endpoints for suspend and reactivate
app.post('/api/admin/users/:id/suspend', requireTier('TIER_1'), async (c) => {
  const targetId = c.req.param('id');
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.setUserStatus(actor, targetId, 'SUSPEND', 'Administrative suspension');
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

app.post('/api/admin/users/:id/reactivate', requireTier('TIER_1'), async (c) => {
  const targetId = c.req.param('id');
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.setUserStatus(actor, targetId, 'ACTIVATE');
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// POST /api/admin/users/:id/revoke-sessions: Force logout target user
app.post('/api/admin/users/:id/revoke-sessions', requireTier('TIER_1'), async (c) => {
  const targetId = c.req.param('id');
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const result = await authService.revokeUserSessions(actor, targetId);
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// GET /api/admin/audit-logs: Comprehensive security audit stream
app.get('/api/admin/audit-logs', requireTier('TIER_1'), async (c) => {
  const actor = c.get('actor');
  const authService = new AuthService(c.env?.DB, c.env, 'CRM');
  const userId = c.req.query('userId');
  const eventType = c.req.query('eventType');
  const outcome = c.req.query('outcome');
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : 50;

  const result = await authService.getAuditLogs(actor.workspace_id, { userId, eventType, outcome, limit });
  return c.json(result.data, 200);
});

// ============================================================================
// CORE CRM DOMAIN ENDPOINTS (ROLE & SCOPE GATED)
// ============================================================================

// 2. Parse Raw Inbound Message (AI & Deterministic Hybrid)
app.post('/api/v1/enquiries/parse', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const validation = ParseMessageSchema.safeParse(body);
    if (!validation.success) {
      return c.json({ error: 'Validation failed', details: validation.error.format() }, 400);
    }

    const { content, senderRaw, phoneRaw, channel } = validation.data;
    const actor = c.get('actor');
    const result = await CrmRepository.ingestMessage(c.env?.DB, { content, senderRaw, phoneRaw, channel }, actor, c.env);

    return c.json({
      success: true,
      data: result.extraction,
      record: result.record,
      evaluated_at: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({ error: 'Extraction failed', details: err?.message }, 500);
  }
});

// 3. List Enquiries & Tickets (with queue, stage, FTS search, and dynamic SLA)
app.get('/api/v1/enquiries', async (c) => {
  const query = EnquiryQuerySchema.safeParse({
    queue: c.req.query('queue'),
    stage: c.req.query('stage'),
    sim_time: c.req.query('sim_time'),
    search: c.req.query('search') || c.req.query('q')
  });

  if (!query.success) {
    return c.json({ error: 'Invalid query parameters', details: query.error.format() }, 400);
  }

  const { queue, stage, sim_time, search } = query.data;
  const env = c.env?.ENVIRONMENT || 'development';
  const actor = c.get('actor');

  try {
    const result = await CrmRepository.getEnquiries(c.env?.DB, queue, stage, sim_time, env, search, actor);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to fetch enquiries', code: err.code || 'CRM_ERROR' }, err.status || 500);
  }
});

// 4. Transition Sales Pipeline Stage (Scope: CRM_TRIAGE)
app.post('/api/v1/enquiries/:id/stage', requireScope('CRM_TRIAGE'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const validation = StageTransitionSchema.safeParse(body);

  if (!validation.success) {
    return c.json({
      error: 'Invalid sales stage. Valid pipeline stages are: New, Contacted, Interested, Paid, Lost. For operational status, use /api/v1/enquiries/:id/status.',
      details: validation.error.format()
    }, 400);
  }

  const { newStage } = validation.data;
  const actor = c.get('actor');
  const isProduction = c.env?.ENVIRONMENT === 'production';

  try {
    const result = await CrmRepository.transitionStage(c.env?.DB, id, newStage, actor, isProduction);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Stage transition failed', code: err.code }, err.status || 400);
  }
});

// Backward-compatible transition endpoint
app.post('/api/v1/enquiries/:id/transition', requireScope('CRM_TRIAGE'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const { newStage } = body;
  const actor = c.get('actor');
  const isProduction = c.env?.ENVIRONMENT === 'production';

  if (['Escalated', 'Quarantined', 'Billing Verified', 'Resolved'].includes(newStage)) {
    const statusMap: Record<string, any> = {
      'Escalated': 'ESCALATED',
      'Quarantined': 'QUARANTINED',
      'Billing Verified': 'RESOLVED',
      'Resolved': 'RESOLVED'
    };
    const result = await CrmRepository.transitionTicketStatus(c.env?.DB, id, statusMap[newStage] || 'ESCALATED', 'Updated via transition', actor, isProduction);
    return c.json({ success: true, data: result.record, audit: result.audit });
  }

  const stageValidation = StageTransitionSchema.safeParse({ newStage });
  if (!stageValidation.success) {
    return c.json({ error: 'Invalid stage value', details: stageValidation.error.format() }, 400);
  }

  try {
    const result = await CrmRepository.transitionStage(c.env?.DB, id, stageValidation.data.newStage, actor, isProduction);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Transition failed', code: err.code }, err.status || 400);
  }
});

// 5. Transition Operational Ticket Status (Supervisor / Management Role Gated)
app.post('/api/v1/enquiries/:id/status', requireRole(['PLATFORM_OWNER', 'OPERATIONS_ADMIN', 'TEAM_LEAD', 'ADMIN', 'SUPERVISOR']), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const validation = TicketStatusTransitionSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: 'Invalid ticket status transition', details: validation.error.format() }, 400);
  }

  const { newStatus, notes } = validation.data;
  const actor = c.get('actor');
  const isProduction = c.env?.ENVIRONMENT === 'production';

  try {
    const result = await CrmRepository.transitionTicketStatus(c.env?.DB, id, newStatus, notes, actor, isProduction);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Ticket status update failed', code: err.code }, err.status || 400);
  }
});

// 6. Approve & Send Outbound Reply (Scope: CRM_REPLY_DISPATCH)
app.post('/api/v1/enquiries/:id/reply', requireScope('CRM_REPLY_DISPATCH'), async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const validation = OutboundReplySchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: 'Validation failed', details: validation.error.format() }, 400);
  }

  const { replyText, channel } = validation.data;
  const actor = c.get('actor');

  try {
    const result = await CrmRepository.recordOutboundReply(c.env?.DB, id, replyText, channel, actor, c.env);
    return c.json({ success: true, data: result.record, audit: result.audit, delivery: result.delivery });
  } catch (err: any) {
    return c.json({
      error: err.message || 'Reply sending failed',
      code: err.code || 'DISPATCH_FAILED',
      delivery: err.delivery
    }, err.status || 500);
  }
});

// 6.1 Ground-Truth Knowledge Base Query
app.get('/api/v1/knowledge-base', async (c) => {
  const category = c.req.query('category');
  const kb = await CrmRepository.getKnowledgeBase(c.env?.DB, category);
  return c.json({ success: true, count: kb.length, items: kb });
});

// 7. Executive Weekly AI Digest
app.get('/api/v1/digest', (c) => {
  const metrics = CrmRepository.getDigestMetrics();

  return c.json({
    period: '2026-10-26 to 2026-10-28',
    total_enquiries: metrics.total_enquiries,
    channel_distribution: {
      whatsapp: metrics.channelCounts['WhatsApp'] || 0,
      facebook_messenger: metrics.channelCounts['Facebook Messenger'] || 0,
      website_form: metrics.channelCounts['Website form'] || 0,
      phone_call_note: metrics.channelCounts['Phone call note'] || 0,
      facebook_comment: metrics.channelCounts['Facebook comment'] || 0
    },
    pipeline_summary: {
      total_sales_leads: metrics.totalSalesLeads,
      total_estimated_pipeline_bdt: metrics.totalPipelineBdt,
      corporate_seats_requested: metrics.corporateSeats,
      top_opportunities: [
        { name: 'Kamrul Islam', org: 'Bank in Motijheel', seats: 120, est_value_bdt: 1500000 },
        { name: 'Mahmud Hasan', org: 'Gazipur Textile Company', seats: 40, est_value_bdt: 600000 },
        { name: 'Rezaul Karim', org: 'Garment Factory', seats: 15, est_value_bdt: 150000 }
      ]
    },
    operational_health: {
      critical_escalations: metrics.criticalEscalations,
      unconfirmed_payments: metrics.unconfirmedPayments,
      missing_phone_capture_rate: '6 out of 20 (30%) lack phone numbers (100% of FB leads)',
      key_recommendation: 'Deploy automated WhatsApp phone number capture prompt in Facebook Messenger to reduce lead leakage.'
    }
  });
});

// ============================================================================
// INTERNAL COMMAND & OPERATIONAL MESSAGING CONTROL PLANE
// ============================================================================

// GET /api/v1/messages/recipients: List eligible messaging targets
app.get('/api/v1/messages/recipients', async (c) => {
  const actor = c.get('actor');
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.getRecipients(actor);
  return c.json(result.data, 200);
});

// GET /api/v1/messages/unread-summary: Fast badge counter
app.get('/api/v1/messages/unread-summary', async (c) => {
  const actor = c.get('actor');
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.getUnreadSummary(actor);
  return c.json(result.data, 200);
});

// GET /api/v1/messages/threads: List user threads
app.get('/api/v1/messages/threads', async (c) => {
  const actor = c.get('actor');
  const channel = c.req.query('channel');
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.listThreads(actor, channel);
  return c.json(result.data, 200);
});

// POST /api/v1/messages/threads: Create new thread
app.post('/api/v1/messages/threads', async (c) => {
  const actor = c.get('actor');
  const body = await c.req.json().catch(() => ({}));
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.createThread(actor, body);
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 201);
});

// GET /api/v1/messages/threads/:id: Get thread and mark read
app.get('/api/v1/messages/threads/:id', async (c) => {
  const actor = c.get('actor');
  const threadId = c.req.param('id');
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.getThread(actor, threadId);
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// POST /api/v1/messages/threads/:id/messages: Send reply
app.post('/api/v1/messages/threads/:id/messages', async (c) => {
  const actor = c.get('actor');
  const threadId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.sendMessage(actor, threadId, body);
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 201);
});

// POST /api/v1/messages/threads/:id/acknowledge: Acknowledge directive
app.post('/api/v1/messages/threads/:id/acknowledge', async (c) => {
  const actor = c.get('actor');
  const threadId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const msgService = new MessagingService(c.env?.DB, c.env, 'CRM');
  const result = await msgService.acknowledgeDirective(actor, threadId, body.messageId);
  if (!result.success) {
    return c.json({ error: result.error, code: result.code }, result.status as any);
  }
  return c.json(result.data, 200);
});

// ============================================================================
// META INBOUND WEBHOOK (DURABLE D1 IDEMPOTENCY LEDGER)
// ============================================================================

// 8. Meta Webhook Verification (Challenge GET)
app.get('/api/webhooks/meta', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const expectedToken = c.env?.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return c.text(challenge || '');
  }
  return c.text('Forbidden: Invalid or missing webhook verification token', 403);
});

// 9. Meta Webhook Signed POST Ingestion with HMAC-SHA256 & Durable D1 Ledger
app.post('/api/webhooks/meta', async (c) => {
  const signatureHeader = c.req.header('X-Hub-Signature-256');
  const appSecret = c.env?.META_APP_SECRET;
  const isProduction = c.env?.ENVIRONMENT === 'production';

  const rawBody = await c.req.text();

  if (isProduction && !appSecret) {
    return c.json({ error: 'META_APP_SECRET configuration missing in production' }, 500);
  }

  if (appSecret) {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return c.json({ error: 'Missing or malformed X-Hub-Signature-256 header' }, 401);
    }
    const signature = signatureHeader.substring(7);
    if (signature.length !== 64) {
      return c.json({ error: 'Malformed X-Hub-Signature-256 value' }, 403);
    }
    if (!/^[0-9a-f]{64}$/i.test(signature)) {
      return c.json({ error: 'Invalid HMAC signature' }, 403);
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBuf = new Uint8Array(signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const isValid = await crypto.subtle.verify('HMAC', key, sigBuf, encoder.encode(rawBody));

    if (!isValid) {
      return c.json({ error: 'Invalid HMAC signature' }, 403);
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const payloadHash = await sha256(rawBody);
  const workspaceId = c.env?.WORKSPACE_ID || 'ws_biai_main';
  const entryId = payload?.entry?.[0]?.id || payload?.id || `event_${payloadHash.slice(0, 32)}`;

  // Durable D1 Idempotency Ledger
  const claim = await CrmRepository.claimWebhookEvent(
    c.env?.DB,
    workspaceId,
    'meta',
    entryId,
    'messages',
    payloadHash
  );

  if (claim.duplicate) {
    return c.json({ status: 'ignored_duplicate', message_id: entryId }, 200);
  }

  const webhookActor: AuthenticatedUser = {
    id: 'webhook_meta',
    workspace_id: workspaceId,
    email: 'webhook@meta.internal',
    full_name: 'Meta Webhook Dispatcher',
    role: 'SPECIALIST_OPERATOR',
    security_tier: 'TIER_3',
    status: 'ACTIVE',
    scopes: ['CRM_READ', 'CRM_TRIAGE']
  };

  const messageText = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || payload?.text || 'Inbound Webhook Message';
  const senderPhone = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || payload?.from || '';
  const senderName = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'WhatsApp Customer';

  try {
    const result = await CrmRepository.ingestMessage(c.env?.DB, {
      content: messageText,
      senderRaw: senderName,
      phoneRaw: senderPhone,
      channel: 'WhatsApp'
    }, webhookActor, c.env);

    await CrmRepository.markWebhookProcessed(c.env?.DB, claim.eventId);

    return c.json({
      status: 'received',
      record_id: result.record.id,
      idempotency_key: entryId
    }, 201);
  } catch (err: any) {
    await CrmRepository.markWebhookFailed(c.env?.DB, claim.eventId, err.message);
    return c.json({ error: 'Webhook processing failed', details: err.message }, 500);
  }
});

// 10. Static Assets fallback for SPA
app.get('*', async (c) => {
  if (c.env?.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

// Cloudflare Cron retries queued/failed provider deliveries without exposing
// an unauthenticated HTTP dispatch endpoint.
(app as any).scheduled = async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
  ctx.waitUntil(retryQueuedCrmDeliveries(env.DB, env));
};

export default app;
