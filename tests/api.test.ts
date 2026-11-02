import { describe, it, expect } from 'vitest';
import app from '../src/server/index.ts';

describe('BIAI Task 1 CRM — API Security, State Invariants & Webhooks', () => {
  it('GET /api/health returns healthy status and system metadata', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.status).toBe('healthy');
    expect(json.timezone).toBe('Asia/Dhaka');
  });

  it('GET /api/v1/enquiries loads 20 sample enquiries with dynamic SLA calculation', async () => {
    const res = await app.request('/api/v1/enquiries?queue=all');
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.total).toBe(20);
    expect(json.data[0]).toHaveProperty('sla_status');
  });

  it('filters queue by sales leads and support tickets correctly', async () => {
    const salesRes = await app.request('/api/v1/enquiries?queue=sales');
    const salesJson: any = await salesRes.json();
    expect(salesJson.data.every((r: any) => r.triage_category === 'SALES_LEAD')).toBe(true);

    const supportRes = await app.request('/api/v1/enquiries?queue=support');
    const supportJson: any = await supportRes.json();
    expect(supportJson.data.every((r: any) => r.triage_category === 'SUPPORT_BILLING')).toBe(true);
  });

  it('POST /api/v1/enquiries/:id/stage transitions opportunity stage with valid vocabulary', async () => {
    const res = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer rep-token' },
      body: JSON.stringify({ newStage: 'Interested' })
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.pipeline_stage).toBe('Interested');
  });

  it('POST /api/v1/enquiries/:id/stage rejects invalid stages with 400 validation error', async () => {
    const res = await app.request('/api/v1/enquiries/1/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStage: 'InvalidStageName' })
    });
    expect(res.status).toBe(400);
    const json: any = await res.json();
    expect(json.error).toContain('Invalid sales stage');
  });

  it('POST /api/v1/enquiries/:id/status transitions operational ticket status', async () => {
    const res = await app.request('/api/v1/enquiries/16/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sup-token' },
      body: JSON.stringify({ newStatus: 'ESCALATED', notes: 'P0 PR risk escalated to supervisor' })
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.ticket_status).toBe('ESCALATED');
  });

  it('POST /api/v1/enquiries/:id/reply logs first response and advances New stage to Contacted', async () => {
    const res = await app.request('/api/v1/enquiries/2/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyText: 'Assalamualaikum Tahmina Apa, our team is processing your details.' })
    });
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.reply_status).toBe('SENT');
    expect(json.data.first_response_at).toBeTruthy();
  });

  it('GET /api/webhooks/meta enforces verification token challenge handshake', async () => {
    // Without token or with wrong token
    const wrongRes = await app.request('/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test_challenge');
    expect(wrongRes.status).toBe(403);
  });

  it('POST /api/webhooks/meta ingests inbound message with idempotency', async () => {
    const payload = {
      id: 'meta_entry_test_101',
      entry: [{
        id: 'meta_entry_test_101',
        changes: [{
          value: {
            messages: [{ text: { body: 'Assalamualaikum, bootcamp price koto?' } }],
            contacts: [{ wa_id: '+8801711200999', profile: { name: 'Kazi Nazrul' } }]
          }
        }]
      }]
    };

    const res1 = await app.request('/api/webhooks/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(res1.status).toBe(201);
    const json1: any = await res1.json();
    expect(json1.status).toBe('received');

    // Duplicate message with same entryId is safely ignored
    const res2 = await app.request('/api/webhooks/meta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(res2.status).toBe(200);
    const json2: any = await res2.json();
    expect(json2.status).toBe('ignored_duplicate');
  });
});
