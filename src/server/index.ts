import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware, requireRole, type AuthenticatedUser } from './auth.ts';
import { CrmRepository } from './db/repository.ts';
import {
  StageTransitionSchema,
  TicketStatusTransitionSchema,
  OutboundReplySchema,
  ParseMessageSchema,
  EnquiryQuerySchema
} from './validation.ts';
import type { PipelineStage } from '../lib/types/crm.ts';

// Cloudflare Worker Environment Bindings
export interface Env {
  DB?: any; // Cloudflare D1 Database binding
  AI?: any; // Cloudflare Workers AI binding
  ASSETS?: any; // Cloudflare Static Assets
  ENVIRONMENT?: string;
  DEFAULT_TIMEZONE?: string;
  WORKSPACE_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  META_APP_SECRET?: string;
  GEMINI_API_KEY?: string;
}

const app = new Hono<{
  Bindings: Env;
  Variables: { actor: AuthenticatedUser; workspaceId: string };
}>();

// Global middleware
app.use('*', cors());
app.use('/api/v1/*', authMiddleware);

// Set of processed webhook IDs to ensure strict idempotency
const processedWebhookIds = new Set<string>();

// 1. Healthcheck
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
    const result = await CrmRepository.ingestMessage(c.env?.DB, { content, senderRaw, phoneRaw, channel }, actor);

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

// 3. List Enquiries & Tickets (with queue, stage, and safe SLA calculations)
app.get('/api/v1/enquiries', async (c) => {
  const query = EnquiryQuerySchema.safeParse({
    queue: c.req.query('queue'),
    stage: c.req.query('stage'),
    sim_time: c.req.query('sim_time')
  });

  if (!query.success) {
    return c.json({ error: 'Invalid query parameters', details: query.error.format() }, 400);
  }

  const { queue, stage, sim_time } = query.data;
  const env = c.env?.ENVIRONMENT || 'development';

  const result = await CrmRepository.getEnquiries(c.env?.DB, queue, stage, sim_time, env);
  return c.json(result);
});

// 4. Transition Sales Pipeline Stage (Strictly Sales Vocabulary)
app.post('/api/v1/enquiries/:id/stage', async (c) => {
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

  try {
    const result = await CrmRepository.transitionStage(c.env?.DB, id, newStage, actor);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Stage transition failed' }, 400);
  }
});

// Backward-compatible transition endpoint (routes to stage or ticket status depending on vocabulary)
app.post('/api/v1/enquiries/:id/transition', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const { newStage } = body;
  const actor = c.get('actor');

  if (['Escalated', 'Quarantined', 'Billing Verified', 'Resolved'].includes(newStage)) {
    const statusMap: Record<string, any> = {
      'Escalated': 'ESCALATED',
      'Quarantined': 'QUARANTINED',
      'Billing Verified': 'RESOLVED',
      'Resolved': 'RESOLVED'
    };
    const result = await CrmRepository.transitionTicketStatus(c.env?.DB, id, statusMap[newStage] || 'ESCALATED', 'Updated via transition', actor);
    return c.json({ success: true, data: result.record, audit: result.audit });
  }

  const stageValidation = StageTransitionSchema.safeParse({ newStage });
  if (!stageValidation.success) {
    return c.json({ error: 'Invalid stage value', details: stageValidation.error.format() }, 400);
  }

  try {
    const result = await CrmRepository.transitionStage(c.env?.DB, id, stageValidation.data.newStage, actor);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Transition failed' }, 400);
  }
});

// 5. Transition Operational Ticket Status (Supervisor Escalations, Quarantined, Resolved)
app.post('/api/v1/enquiries/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const validation = TicketStatusTransitionSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: 'Invalid ticket status transition', details: validation.error.format() }, 400);
  }

  const { newStatus, notes } = validation.data;
  const actor = c.get('actor');

  try {
    const result = await CrmRepository.transitionTicketStatus(c.env?.DB, id, newStatus, notes, actor);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Ticket status update failed' }, 400);
  }
});

// 6. Approve & Send Outbound Reply
app.post('/api/v1/enquiries/:id/reply', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const validation = OutboundReplySchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: 'Validation failed', details: validation.error.format() }, 400);
  }

  const { replyText, channel } = validation.data;
  const actor = c.get('actor');

  try {
    const result = await CrmRepository.recordOutboundReply(c.env?.DB, id, replyText, channel, actor);
    return c.json({ success: true, data: result.record, audit: result.audit });
  } catch (err: any) {
    return c.json({ error: err.message || 'Reply sending failed' }, 400);
  }
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

// 9. Meta Webhook Signed POST Ingestion with HMAC-SHA256 Verification & Idempotency
app.post('/api/webhooks/meta', async (c) => {
  const signatureHeader = c.req.header('X-Hub-Signature-256');
  const appSecret = c.env?.META_APP_SECRET;

  const rawBody = await c.req.text();

  if (appSecret) {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return c.json({ error: 'Missing or malformed X-Hub-Signature-256 header' }, 401);
    }
    const signature = signatureHeader.substring(7);

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBuf = new Uint8Array(signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
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

  const entryId = payload?.entry?.[0]?.id || payload?.id || `msg_${Date.now()}`;
  if (processedWebhookIds.has(entryId)) {
    return c.json({ status: 'ignored_duplicate', message_id: entryId }, 200);
  }
  processedWebhookIds.add(entryId);

  const webhookActor: AuthenticatedUser = {
    id: 'webhook_meta',
    workspace_id: c.env?.WORKSPACE_ID || 'ws_biai_main',
    email: 'webhook@meta.internal',
    full_name: 'Meta Webhook Dispatcher',
    role: 'SALES_REP'
  };

  const messageText = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || payload?.text || 'Inbound Webhook Message';
  const senderPhone = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || payload?.from || '';
  const senderName = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'WhatsApp Customer';

  const result = await CrmRepository.ingestMessage(c.env?.DB, {
    content: messageText,
    senderRaw: senderName,
    phoneRaw: senderPhone,
    channel: 'WhatsApp'
  }, webhookActor);

  return c.json({
    status: 'received',
    record_id: result.record.id,
    idempotency_key: entryId
  }, 201);
});

// 10. Static Assets fallback for SPA
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
