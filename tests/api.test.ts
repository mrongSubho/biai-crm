import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/server/index.ts';
import { createTestD1Database } from './d1-helper.ts';

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

  it('GET /api/v1/enquiries loads 20 enquiries directly from D1 with dynamic SLA calculation', async () => {
    const res = await app.request('/api/v1/enquiries?queue=all', {}, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.total).toBe(20);
    expect(json.data.length).toBe(20);
    expect(json.data[0]).toHaveProperty('sla_status');
    expect(json.data[0].sender_name).toBe('Rafi Ahmed');
  });

  it('FTS5 search finds messages matching keyword "bootcamp" from SQLite index', async () => {
    const res = await app.request('/api/v1/enquiries?search=bootcamp', {}, env);
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.some((r: any) => r.raw_message.toLowerCase().includes('bootcamp'))).toBe(true);
  });

  it('filters queue by sales leads and support tickets correctly via D1', async () => {
    const salesRes = await app.request('/api/v1/enquiries?queue=sales', {}, env);
    const salesJson: any = await salesRes.json();
    expect(salesJson.data.every((r: any) => r.triage_category === 'SALES_LEAD')).toBe(true);

    const supportRes = await app.request('/api/v1/enquiries?queue=support', {}, env);
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

    // Verify directly in D1 SQLite database
    const dbOpp = d1.rawDb.prepare("SELECT pipeline_stage FROM opportunities WHERE id = 'opp_1'").get() as any;
    expect(dbOpp.pipeline_stage).toBe('Interested');

    // Verify append-only audit event in D1
    const audit = d1.rawDb.prepare("SELECT * FROM audit_events WHERE entity_type = 'OPPORTUNITY' AND entity_id = 'opp_1'").get() as any;
    expect(audit).toBeTruthy();
    expect(audit.event_type).toBe('STAGE_TRANSITION');
  });

  it('POST /api/v1/enquiries/:id/stage rejects invalid stage values with 400 validation error', async () => {
    const res = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStage: 'InvalidStageName' })
    }, env);
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error).toContain('Invalid sales stage');
  });

  it('POST /api/v1/enquiries/:id/status updates operational ticket in D1 with audit trail', async () => {
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

    // Verify first_response_at was persisted in D1 opportunities
    const dbOpp = d1.rawDb.prepare("SELECT first_response_at, pipeline_stage FROM opportunities WHERE source_message_id = 'msg_2'").get() as any;
    expect(dbOpp.first_response_at).toBeTruthy();
    expect(dbOpp.pipeline_stage).toBe('Contacted');
  });

  it('GET /api/v1/knowledge-base queries ground-truth knowledge base from D1', async () => {
    const res = await app.request('/api/v1/knowledge-base', {}, env);
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

  it('POST /api/webhooks/meta validates HMAC-SHA256 signature, rejects forged requests, and ingests with idempotency', async () => {
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

    // 1. Forged or missing signature when app secret is set
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

    // 3. Duplicate replay is safely ignored by idempotency cache
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
});
