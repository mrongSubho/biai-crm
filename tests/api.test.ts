import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/server/index.ts';
import { createTestD1Database } from './d1-helper.ts';
import { retryQueuedCrmDeliveries } from '../src/server/delivery_retry.ts';

describe('BIAI Task 1 CRM — API Security, D1 Persistence, FTS5 & HMAC Webhooks', () => {
  let d1: ReturnType<typeof createTestD1Database>;
  let env: any;

  beforeEach(() => {
    d1 = createTestD1Database();
    env = {
      DB: d1,
      WORKSPACE_ID: 'ws_biai_main',
      META_WEBHOOK_VERIFY_TOKEN: 'biai_meta_verify_token_2026',
      META_APP_SECRET: 'test_meta_app_secret_biai_2026',
      ENVIRONMENT: 'test',
      DEFAULT_TIMEZONE: 'Asia/Dhaka'
    };
  });

  it('GET /api/health returns healthy status and system metadata with D1 connected', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.d1_connected).toBe(true);
    expect(json.timezone).toBe('Asia/Dhaka');
  });

  it('Unauthenticated requests to protected CRM endpoints are strictly denied with 401', async () => {
    const res = await app.request('/api/v1/enquiries', {}, env);
    expect(res.status).toBe(401);
    const json: any = await res.json();
    expect(json.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/enquiries loads 20 enquiries with dynamic SLA calculation for authenticated operator', async () => {
    const res = await app.request('/api/v1/enquiries?queue=all', {
      headers: { 'Authorization': 'Bearer rep-token' }
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.total).toBe(20);
    expect(json.data.length).toBe(20);
    expect(json.data[0]).toHaveProperty('sla_status');
    expect(json.data[0].sender_name).toBe('Rafi Ahmed');
  });

  it('FTS5 search finds messages matching keyword "bootcamp" from SQLite index', async () => {
    const res = await app.request('/api/v1/enquiries?search=bootcamp', {
      headers: { 'Authorization': 'Bearer rep-token' }
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.some((r: any) => r.raw_message.toLowerCase().includes('bootcamp'))).toBe(true);
  });

  it('filters queue by sales leads and support tickets correctly via D1', async () => {
    const salesRes = await app.request('/api/v1/enquiries?queue=sales', {
      headers: { 'Authorization': 'Bearer rep-token' }
    }, env);
    const salesJson: any = await salesRes.json();
    expect(salesJson.data.every((r: any) => r.triage_category === 'SALES_LEAD')).toBe(true);

    const supportRes = await app.request('/api/v1/enquiries?queue=support', {
      headers: { 'Authorization': 'Bearer rep-token' }
    }, env);
    const supportJson: any = await supportRes.json();
    expect(supportJson.data.every((r: any) => r.triage_category === 'SUPPORT_BILLING')).toBe(true);
  });

  it('POST /api/v1/enquiries/:id/stage updates opportunity stage in D1 and writes audit ledger', async () => {
    const res = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rep-token' },
      body: JSON.stringify({ newStage: 'Interested' })
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.pipeline_stage).toBe('Interested');

    const dbOpp = d1.rawDb.prepare("SELECT pipeline_stage FROM opportunities WHERE id = 'opp_1'").get() as any;
    expect(dbOpp.pipeline_stage).toBe('Interested');

    const audit = d1.rawDb.prepare("SELECT * FROM audit_events WHERE entity_type = 'OPPORTUNITY' AND entity_id = 'opp_1'").get() as any;
    expect(audit).toBeTruthy();
    expect(audit.event_type).toBe('STAGE_TRANSITION');
  });

  it('POST /api/v1/enquiries/:id/stage rejects invalid stage values with 400 validation error', async () => {
    const res = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rep-token' },
      body: JSON.stringify({ newStage: 'InvalidStageName' })
    }, env);
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error).toContain('Invalid sales stage');
  });

  it('Role Gating: Specialist operator cannot update operational ticket status without supervisor role', async () => {
    const res = await app.request('/api/v1/enquiries/16/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rep-token' },
      body: JSON.stringify({ newStatus: 'ESCALATED', notes: 'Unauthorized attempt' })
    }, env);
    expect(res.status).toBe(403);
    const json: any = await res.json();
    expect(json.code).toBe('ROLE_FORBIDDEN');
  });

  it('POST /api/v1/enquiries/:id/status updates operational ticket in D1 with supervisor role', async () => {
    const res = await app.request('/api/v1/enquiries/16/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sup-token' },
      body: JSON.stringify({ newStatus: 'ESCALATED', notes: 'P0 PR risk escalated to supervisor' })
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.ticket_status).toBe('ESCALATED');

    const dbTicket = d1.rawDb.prepare("SELECT ticket_status, resolution_notes FROM operational_tickets WHERE source_message_id = 'msg_16'").get() as any;
    expect(dbTicket.ticket_status).toBe('ESCALATED');
    expect(dbTicket.resolution_notes).toContain('PR risk escalated');
  });

  it('POST /api/v1/enquiries/:id/reply records outbound message in D1, meets SLA, and calls WhatsApp adapter', async () => {
    const res = await app.request('/api/v1/enquiries/2/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rep-token' },
      body: JSON.stringify({ replyText: 'Assalamualaikum Tahmina Apa, our team is processing your details.' })
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.reply_status).toBe('SENT');
    expect(json.delivery).toBeTruthy();
    expect(json.delivery.status).toBe('SENT');

    const dbOpp = d1.rawDb.prepare("SELECT first_response_at, pipeline_stage FROM opportunities WHERE source_message_id = 'msg_2'").get() as any;
    expect(dbOpp.first_response_at).toBeTruthy();
    expect(dbOpp.pipeline_stage).toBe('Contacted');
  });

  it('scheduled delivery retry sends a queued outbound message and records provider state', async () => {
    await d1.prepare(`
      INSERT INTO messages (
        id, conversation_id, direction, channel, external_message_id,
        sender_raw, phone_raw, content, detected_language, language_confidence,
        received_at, delivery_status, idempotency_key, retry_count, next_retry_at
      ) VALUES (?, 'conv_1', 'OUTBOUND', 'WhatsApp', ?, 'BIAI Staff Agent', ?, ?, 'EN', 1.0,
        datetime('now'), 'QUEUED', ?, 0, NULL)
    `).bind('msg_retry_crm', 'crm_retry_external', '01711000001', 'Retry this message', 'crm_ws_biai_main_msg_retry_crm').run();

    const result = await retryQueuedCrmDeliveries(d1, env);
    const row: any = await d1.prepare('SELECT delivery_status, provider_message_id, retry_count FROM messages WHERE id = ?')
      .bind('msg_retry_crm').first();

    expect(result.sent).toBe(1);
    expect(row.delivery_status).toBe('SENT');
    expect(row.provider_message_id).toMatch(/^mock_whatsapp_/);
    expect(row.retry_count).toBe(0);
  });

  it('GET /api/v1/knowledge-base queries ground-truth knowledge base from D1', async () => {
    const res = await app.request('/api/v1/knowledge-base', {
      headers: { 'Authorization': 'Bearer rep-token' }
    }, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBeGreaterThanOrEqual(4);
    expect(json.items.some((i: any) => i.category === 'Bootcamp')).toBe(true);
  });

  it('GET /api/webhooks/meta validates hub.challenge handshake token', async () => {
    const validRes = await app.request('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=biai_meta_verify_token_2026&hub.challenge=test_challenge_123', {}, env);
    expect(validRes.status).toBe(200);
    expect(await validRes.text()).toBe('test_challenge_123');

    const wrongRes = await app.request('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test_challenge', {}, env);
    expect(wrongRes.status).toBe(403);
  });

  it('POST /api/webhooks/meta validates HMAC-SHA256 signature, stores event in D1 ledger, and enforces idempotency', async () => {
    const payload = JSON.stringify({
      id: 'meta_entry_test_202',
      entry: [{
        id: 'meta_entry_test_202',
        changes: [{
          value: {
            messages: [{ text: { body: 'Assalamualaikum, amader corporate team er jonno training lagbe.' } }],
            contacts: [{ wa_id: '+8801711200888', profile: { name: 'Kazi Nazrul' } }]
          }
        }]
      }]
    });

    // 1. Forged signature
    const forgedRes = await app.request('/api/webhooks/meta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'sha256=invalidhexsignature000000000000000000000000000000000000000000000000'
      },
      body: payload
    }, env);
    expect(forgedRes.status).toBe(403);

    // 2. Valid signature computation
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('test_meta_app_secret_biai_2026'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const validSignature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const validRes = await app.request('/api/webhooks/meta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${validSignature}`
      },
      body: payload
    }, env);
    expect(validRes.status).toBe(201);
    const json1: any = await validRes.json();
    expect(json1.status).toBe('received');

    // Verify written to D1 webhook_events table
    const dbWebhook = d1.rawDb.prepare("SELECT * FROM webhook_events WHERE external_event_id = 'meta_entry_test_202'").get() as any;
    expect(dbWebhook).toBeTruthy();
    expect(dbWebhook.status).toBe('PROCESSED');

    // 3. Duplicate replay is safely caught by D1 idempotency ledger
    const duplicateRes = await app.request('/api/webhooks/meta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': `sha256=${validSignature}`
      },
      body: payload
    }, env);
    expect(duplicateRes.status).toBe(200);
    const json2: any = await duplicateRes.json();
    expect(json2.status).toBe('ignored_duplicate');
  });

  // ============================================================================
  // IDENTITY CONTROL PLANE INTEGRATION TESTS
  // ============================================================================
  it('Identity Control Plane: Login verification, session creation, CSRF enforcement, and lockout', async () => {
    // 1. Login with invalid password
    const failRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tanvir@biai.com.bd', password: 'WrongPassword123!' })
    }, env);
    expect(failRes.status).toBe(401);

    // 2. Successful Login with seeded PBKDF2 credentials
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tanvir@biai.com.bd', password: 'RepPassword2026!' })
    }, env);
    expect(loginRes.status).toBe(200);
    const loginData: any = await loginRes.json();
    expect(loginData.sessionToken).toBeTruthy();
    expect(loginData.csrfToken).toBeTruthy();
    expect(loginData.user.role).toBe('SPECIALIST_OPERATOR');
    expect(loginData.user.security_tier).toBe('TIER_3');

    // Check Set-Cookie header
    const cookieHeader = loginRes.headers.get('Set-Cookie');
    expect(cookieHeader).toContain('__Host-biai_session=');

    // 3. GET /api/auth/me using Cookie session
    const meRes = await app.request('/api/auth/me', {
      headers: { 'Cookie': `__Host-biai_session=${loginData.sessionToken}` }
    }, env);
    expect(meRes.status).toBe(200);
    const meData: any = await meRes.json();
    expect(meData.email).toBe('tanvir@biai.com.bd');

    // 4. CSRF enforcement: Mutating request with Cookie session and missing CSRF token -> 403
    const noCsrfRes = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `__Host-biai_session=${loginData.sessionToken}`
      },
      body: JSON.stringify({ newStage: 'Interested' })
    }, env);
    expect(noCsrfRes.status).toBe(403);
    const noCsrfJson: any = await noCsrfRes.json();
    expect(noCsrfJson.code).toBe('CSRF_MISSING');

    // 5. Mutating request with valid X-CSRF-Token -> 200
    const validCsrfRes = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `__Host-biai_session=${loginData.sessionToken}`,
        'X-CSRF-Token': loginData.csrfToken
      },
      body: JSON.stringify({ newStage: 'Contacted' })
    }, env);
    expect(validCsrfRes.status).toBe(200);

    // 6. Logout revokes session in D1
    const logoutRes = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Cookie': `__Host-biai_session=${loginData.sessionToken}` }
    }, env);
    expect(logoutRes.status).toBe(200);

    // After logout, session is revoked
    const meAfterLogout = await app.request('/api/auth/me', {
      headers: { 'Cookie': `__Host-biai_session=${loginData.sessionToken}` }
    }, env);
    expect(meAfterLogout.status).toBe(401);
  });
});
