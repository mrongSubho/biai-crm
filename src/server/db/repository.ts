import { sampleEnquiriesFixture } from '../fixtures.ts';
import { calculateSlaStatus } from '../../lib/engine/sla.ts';
import { normalizeBangladeshPhone } from '../../lib/engine/phone.ts';
import { parseWithAiOrFallback } from '../ai/parser.ts';
import { sendWhatsAppMessage } from '../adapters/whatsapp.ts';
import { generateRandomToken } from '../crypto.ts';
import type { Channel, PipelineStage } from '../../lib/types/crm.ts';
import type { AuthenticatedUser } from '../auth.ts';
import type { TicketStatus } from '../validation.ts';

let inMemoryRecords: any[] = [...sampleEnquiriesFixture];
let inMemoryAudits: any[] = [];

export class CrmRepository {
  /**
   * Fetch enquiries with dynamic SLA calculation, FTS search, and workspace/queue filtering
   */
  static async getEnquiries(
    db: any,
    queue: string = 'all',
    stage?: string,
    simTime?: string,
    environment: string = 'development',
    search?: string,
    actor?: AuthenticatedUser
  ) {
    const isProduction = environment === 'production';
    // Security check: sim_time clock override is strictly forbidden in production
    const effectiveSimTime = isProduction ? null : (simTime || null);
    const workspaceId = actor?.workspace_id || 'ws_biai_main';

    if (db) {
      try {
        let sql = '';
        const params: any[] = [];

        if (search && search.trim() !== '') {
          sql = `
            SELECT
              CAST(SUBSTR(m.id, 5) AS INTEGER) as id,
              m.id as message_id,
              m.content as raw_message,
              m.channel,
              m.received_at,
              m.phone_raw,
              m.detected_language as language,
              c.name as sender_name,
              c.normalized_phone,
              c.organization,
              o.id as opportunity_id,
              o.pipeline_stage,
              o.program_intent,
              o.estimated_seats as seats,
              o.estimated_value_bdt,
              o.sla_status,
              o.sla_due_at,
              o.first_response_at,
              t.id as ticket_id,
              t.queue_category,
              t.ticket_status,
              t.urgency_level,
              t.resolution_notes
            FROM fts_messages fts
            JOIN messages m ON fts.message_id = m.id
            JOIN conversations conv ON m.conversation_id = conv.id
            JOIN contacts c ON conv.contact_id = c.id
            LEFT JOIN opportunities o ON o.source_message_id = m.id
            LEFT JOIN operational_tickets t ON t.source_message_id = m.id
            WHERE conv.workspace_id = ? AND fts_messages MATCH ?
          `;
          params.push(workspaceId, search.trim());
        } else {
          sql = `
            SELECT
              CAST(SUBSTR(m.id, 5) AS INTEGER) as id,
              m.id as message_id,
              m.content as raw_message,
              m.channel,
              m.received_at,
              m.phone_raw,
              m.detected_language as language,
              c.name as sender_name,
              c.normalized_phone,
              c.organization,
              o.id as opportunity_id,
              o.pipeline_stage,
              o.program_intent,
              o.estimated_seats as seats,
              o.estimated_value_bdt,
              o.sla_status,
              o.sla_due_at,
              o.first_response_at,
              t.id as ticket_id,
              t.queue_category,
              t.ticket_status,
              t.urgency_level,
              t.resolution_notes
            FROM messages m
            JOIN conversations conv ON m.conversation_id = conv.id
            JOIN contacts c ON conv.contact_id = c.id
            LEFT JOIN opportunities o ON o.source_message_id = m.id
            LEFT JOIN operational_tickets t ON t.source_message_id = m.id
            WHERE conv.workspace_id = ? AND m.direction = 'INBOUND'
          `;
          params.push(workspaceId);
        }

        if (stage) {
          sql += ' AND o.pipeline_stage = ?';
          params.push(stage);
        }

        sql += ' ORDER BY id ASC';

        const { results } = await db.prepare(sql).bind(...params).all();
        if (results && results.length > 0) {
          let list = (results as any[]).map((r, index) => {
            const rowId = r.id || (index + 1);
            const fixture = sampleEnquiriesFixture.find(f => f.id === rowId) || {};
            const sla = calculateSlaStatus(r.received_at || fixture.received_at, r.first_response_at, effectiveSimTime);
            return {
              ...fixture,
              id: rowId,
              sender_name: r.sender_name || fixture.sender_name,
              channel: r.channel || fixture.channel,
              received_at: r.received_at || fixture.received_at,
              message: r.raw_message || fixture.message,
              raw_message: r.raw_message || fixture.message,
              phone: r.phone_raw || fixture.phone || '',
              phone_raw: r.phone_raw || fixture.phone || '',
              phone_normalized: r.normalized_phone || fixture.normalized_phone || null,
              normalized_phone: r.normalized_phone || fixture.normalized_phone || null,
              detected_language: r.language || fixture.detected_language || 'BANGLISH',
              language: r.language || fixture.detected_language || 'BANGLISH',
              triage_category: r.queue_category || fixture.triage_category || (r.opportunity_id ? 'SALES_LEAD' : 'GENERAL'),
              program_intent: r.program_intent || fixture.program_intent || 'General Inquiry',
              seats: r.seats ?? fixture.seats ?? 1,
              estimated_value_bdt: r.estimated_value_bdt ?? fixture.estimated_value_bdt ?? 0,
              pipeline_stage: r.pipeline_stage || fixture.pipeline_stage || 'New',
              ticket_status: r.ticket_status || fixture.ticket_status || 'OPEN',
              sla_due_at: r.sla_due_at || fixture.sla_due_at || null,
              suggested_reply: fixture.suggested_reply || '',
              suggested_reply_alt: fixture.suggested_reply_alt || '',
              sla_status: r.first_response_at ? 'MET' : sla.status,
              sla_hours_remaining: sla.hoursRemaining,
              sla_formatted: r.first_response_at ? 'SLA Met' : sla.formattedTimeRemaining,
              is_breached: r.first_response_at ? false : sla.isBreached,
              is_at_risk: r.first_response_at ? false : sla.isAtRisk,
              first_response_at: r.first_response_at
            };
          });

          if (queue && queue !== 'all') {
            const catMap: Record<string, string> = {
              sales: 'SALES_LEAD',
              support: 'SUPPORT_BILLING',
              escalation: 'CRITICAL_ESCALATION',
              careers: 'CAREERS_HR',
              spam: 'SPAM_SECURITY'
            };
            if (catMap[queue]) {
              list = list.filter(r => r.triage_category === catMap[queue]);
            }
          }

          return {
            total: list.length,
            simulated_reference_time: effectiveSimTime || new Date().toISOString(),
            data: list
          };
        }
      } catch (err) {
        console.error('D1 getEnquiries error:', err);
        if (isProduction) {
          const error: any = new Error('Database service unavailable');
          error.status = 503;
          error.code = 'DB_UNAVAILABLE';
          throw error;
        }
      }
    }

    if (isProduction) {
      const error: any = new Error('Database service unavailable: D1 binding missing');
      error.status = 503;
      error.code = 'DB_UNAVAILABLE';
      throw error;
    }

    // Non-production In-Memory Fallback
    let results = inMemoryRecords.map(rec => {
      const sla = calculateSlaStatus(rec.received_at, rec.first_response_at, effectiveSimTime);
      return {
        ...rec,
        sla_status: rec.first_response_at ? 'MET' : sla.status,
        sla_hours_remaining: sla.hoursRemaining,
        sla_formatted: rec.first_response_at ? 'SLA Met' : sla.formattedTimeRemaining,
        is_breached: rec.first_response_at ? false : sla.isBreached,
        is_at_risk: rec.first_response_at ? false : sla.isAtRisk
      };
    });

    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      results = results.filter(r =>
        (r.raw_message && r.raw_message.toLowerCase().includes(q)) ||
        (r.sender_name && r.sender_name.toLowerCase().includes(q))
      );
    }

    if (queue && queue !== 'all') {
      const catMap: Record<string, string> = {
        sales: 'SALES_LEAD',
        support: 'SUPPORT_BILLING',
        escalation: 'CRITICAL_ESCALATION',
        careers: 'CAREERS_HR',
        spam: 'SPAM_SECURITY'
      };
      if (catMap[queue]) {
        results = results.filter(r => r.triage_category === catMap[queue]);
      }
    }

    if (stage) {
      results = results.filter(r => r.pipeline_stage === stage);
    }

    return {
      total: results.length,
      simulated_reference_time: effectiveSimTime || new Date().toISOString(),
      data: results
    };
  }

  /**
   * Transition Sales Pipeline Stage in D1
   */
  static async transitionStage(
    db: any,
    id: number,
    newStage: PipelineStage,
    actor: AuthenticatedUser,
    isProduction = false
  ) {
    const oppId = `opp_${id}`;
    const msgId = `msg_${id}`;

    if (db) {
      try {
        const opp = await db.prepare(
          'SELECT id, pipeline_stage, workspace_id FROM opportunities WHERE (id = ? OR source_message_id = ?) AND workspace_id = ?'
        ).bind(oppId, msgId, actor.workspace_id).first();

        const beforeStage = opp?.pipeline_stage || 'Unknown';

        await db.batch([
          db.prepare(`
            UPDATE opportunities
            SET pipeline_stage = ?, updated_at = datetime('now')
            WHERE (id = ? OR source_message_id = ?) AND workspace_id = ?
          `).bind(newStage, oppId, msgId, actor.workspace_id),
          db.prepare(`
            INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
            VALUES (?, ?, 'USER', ?, 'STAGE_TRANSITION', 'OPPORTUNITY', ?, ?, ?)
          `).bind(
            actor.workspace_id,
            actor.id,
            actor.role,
            opp?.id || oppId,
            JSON.stringify({ stage: beforeStage }),
            JSON.stringify({ stage: newStage, actor_name: actor.full_name })
          )
        ]);

        return {
          record: { id, pipeline_stage: newStage, updated_at: new Date().toISOString() },
          audit: {
            workspace_id: actor.workspace_id,
            actor_id: actor.id,
            event_type: 'STAGE_TRANSITION',
            entity_id: oppId,
            after: newStage
          }
        };
      } catch (e: any) {
        console.error('D1 transitionStage error:', e);
        if (isProduction) {
          const err: any = new Error(e.message || 'Database error');
          err.status = 503;
          err.code = 'DB_UNAVAILABLE';
          throw err;
        }
      }
    }

    if (isProduction) {
      const err: any = new Error('Database service unavailable: D1 binding missing');
      err.status = 503;
      err.code = 'DB_UNAVAILABLE';
      throw err;
    }

    // Non-production fallback
    const record = inMemoryRecords.find(r => r.id === id);
    if (record) {
      const oldStage = record.pipeline_stage;
      record.pipeline_stage = newStage;
      record.updated_at = new Date().toISOString();

      const auditRow = {
        id: inMemoryAudits.length + 1,
        workspace_id: actor.workspace_id,
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: 'STAGE_TRANSITION',
        entity_id: id,
        before: oldStage,
        after: newStage,
        timestamp: new Date().toISOString()
      };
      inMemoryAudits.push(auditRow);
      return { record, audit: auditRow };
    }

    return {
      record: { id, pipeline_stage: newStage, updated_at: new Date().toISOString() },
      audit: {
        id: inMemoryAudits.length + 1,
        workspace_id: actor.workspace_id,
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: 'STAGE_TRANSITION',
        entity_id: id,
        after: newStage,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Transition Operational Ticket Status in D1
   */
  static async transitionTicketStatus(
    db: any,
    id: number,
    newStatus: TicketStatus,
    notes: string | undefined,
    actor: AuthenticatedUser,
    isProduction = false
  ) {
    const tickId = `tick_${id}`;
    const msgId = `msg_${id}`;

    if (db) {
      try {
        const ticket = await db.prepare(
          'SELECT id, ticket_status, workspace_id FROM operational_tickets WHERE (id = ? OR source_message_id = ?) AND workspace_id = ?'
        ).bind(tickId, msgId, actor.workspace_id).first();

        const beforeStatus = ticket?.ticket_status || 'Unknown';

        await db.batch([
          db.prepare(`
            UPDATE operational_tickets
            SET ticket_status = ?, resolution_notes = COALESCE(?, resolution_notes), updated_at = datetime('now')
            WHERE (id = ? OR source_message_id = ?) AND workspace_id = ?
          `).bind(newStatus, notes || null, tickId, msgId, actor.workspace_id),
          db.prepare(`
            INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
            VALUES (?, ?, 'USER', ?, 'TICKET_STATUS_UPDATED', 'TICKET', ?, ?, ?)
          `).bind(
            actor.workspace_id,
            actor.id,
            actor.role,
            ticket?.id || tickId,
            JSON.stringify({ status: beforeStatus }),
            JSON.stringify({ status: newStatus, notes, actor_name: actor.full_name })
          )
        ]);

        return {
          record: { id, ticket_status: newStatus, notes, updated_at: new Date().toISOString() },
          audit: {
            workspace_id: actor.workspace_id,
            actor_id: actor.id,
            event_type: 'TICKET_STATUS_UPDATED',
            entity_id: tickId,
            new_status: newStatus
          }
        };
      } catch (e: any) {
        console.error('D1 ticket transition error:', e);
        if (isProduction) {
          const err: any = new Error(e.message || 'Database error');
          err.status = 503;
          err.code = 'DB_UNAVAILABLE';
          throw err;
        }
      }
    }

    if (isProduction) {
      const err: any = new Error('Database service unavailable: D1 binding missing');
      err.status = 503;
      err.code = 'DB_UNAVAILABLE';
      throw err;
    }

    const record = inMemoryRecords.find(r => r.id === id);
    if (record) {
      record.ticket_status = newStatus;
      if (newStatus === 'ESCALATED') record.is_escalated = true;
      record.updated_at = new Date().toISOString();

      const auditRow = {
        id: inMemoryAudits.length + 1,
        workspace_id: actor.workspace_id,
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: 'TICKET_STATUS_UPDATED',
        entity_id: id,
        new_status: newStatus,
        notes,
        timestamp: new Date().toISOString()
      };
      inMemoryAudits.push(auditRow);
      return { record, audit: auditRow };
    }

    return {
      record: { id, ticket_status: newStatus, notes },
      audit: {
        id: inMemoryAudits.length + 1,
        workspace_id: actor.workspace_id,
        actor_id: actor.id,
        actor_role: actor.role,
        event_type: 'TICKET_STATUS_UPDATED',
        entity_id: id,
        new_status: newStatus,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Approve and record outbound reply in D1 with WhatsApp delivery dispatch.
   * Enforces truthful provider dispatch check: fails if delivery fails.
   */
  static async recordOutboundReply(
    db: any,
    id: number,
    replyText: string,
    channel: Channel,
    actor: AuthenticatedUser,
    envBindings?: any
  ) {
    const isProduction = envBindings?.ENVIRONMENT === 'production';
    const msgId = `msg_${id}`;
    const outMsgId = `msg_out_${generateRandomToken(12)}`;
    const idempotencyKey = `crm_${actor.workspace_id}_${outMsgId}`;
    let recipientPhone = '';
    let conversationId = `conv_${id}`;
    let opportunityId: string | null = null;

    if (db) {
      try {
        const recipient = await db.prepare(`
          SELECT m.conversation_id, c.normalized_phone, o.id as opp_id
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          JOIN contacts c ON conv.contact_id = c.id
          LEFT JOIN opportunities o ON o.source_message_id = m.id
          WHERE (m.id = ? OR CAST(SUBSTR(m.id, 5) AS INTEGER) = ?)
            AND conv.workspace_id = ?
        `).bind(msgId, id, actor.workspace_id).first();
        if (recipient) {
          conversationId = recipient.conversation_id;
          opportunityId = recipient.opp_id || null;
        }
        recipientPhone = recipient?.normalized_phone || '';
        if (!recipient && isProduction) {
          const notFound: any = new Error('Enquiry not found in the actor workspace');
          notFound.status = 404;
          notFound.code = 'ENQUIRY_NOT_FOUND';
          throw notFound;
        }
      } catch (error) {
        console.error('D1 recipient lookup error:', error);
        if ((error as any)?.status === 404) throw error;
        if (isProduction) {
          const dbError: any = new Error('Database service unavailable');
          dbError.status = 503;
          dbError.code = 'DB_UNAVAILABLE';
          throw dbError;
        }
      }

      if (db) {
        try {
          await db.prepare(`
            INSERT INTO messages (
              id, conversation_id, direction, channel, external_message_id,
              sender_raw, phone_raw, content, detected_language, language_confidence,
              received_at, delivery_status, idempotency_key, retry_count
            ) VALUES (?, ?, 'OUTBOUND', ?, ?, 'BIAI Staff Agent', ?, ?, 'EN', 1.0,
              datetime('now'), 'QUEUED', ?, 0)
          `).bind(
            outMsgId,
            conversationId,
            channel,
            idempotencyKey,
            recipientPhone || null,
            replyText,
            idempotencyKey
          ).run();
        } catch (error: any) {
          console.error('D1 outbound queue error:', error);
          const dbError: any = new Error('Unable to queue outbound delivery');
          dbError.status = 503;
          dbError.code = 'DB_UNAVAILABLE';
          throw dbError;
        }
      }
    }

    const localRec = inMemoryRecords.find(r => r.id === id);
    if (!recipientPhone && localRec && !isProduction) {
      recipientPhone = localRec.phone_normalized || localRec.phone_raw || '';
    }

    // 1. Dispatch through WhatsApp Adapter (allowMock only in test env)
    let deliveryResult: any = null;
    if (channel === 'WhatsApp') {
      if (!recipientPhone && isProduction) {
        const error: any = new Error('Recipient phone number is required for WhatsApp dispatch');
        error.status = 422;
        error.code = 'RECIPIENT_CONTACT_MISSING';
        throw error;
      }
      deliveryResult = await sendWhatsAppMessage({
        recipientPhone: recipientPhone || '+8801700000000',
        messageText: replyText,
        token: envBindings?.META_WHATSAPP_TOKEN,
        phoneNumberId: envBindings?.META_PHONE_NUMBER_ID,
        idempotencyKey,
        allowMock: !isProduction
      });
    } else if (isProduction) {
      const error: any = new Error(`Outbound provider is not configured for channel '${channel}'`);
      error.status = 501;
      error.code = 'CHANNEL_PROVIDER_UNAVAILABLE';
      throw error;
    } else {
      deliveryResult = {
        success: true,
        messageId: `msg_${channel.toLowerCase()}_${Date.now()}`,
        provider: 'MOCK_ADAPTER',
        status: 'SENT',
        timestamp: new Date().toISOString()
      };
    }

    // Truthful reporting: If provider delivery failed, do NOT mark as SENT
    if (!deliveryResult.success || deliveryResult.status === 'FAILED') {
      if (db) {
        try {
          await db.batch([
            db.prepare(`
              UPDATE messages
              SET delivery_status = 'FAILED', failure_code = ?, retry_count = retry_count + 1,
                  next_retry_at = datetime('now', '+15 minutes'), last_provider_response = ?
              WHERE id = ? AND idempotency_key = ?
              `).bind(
                deliveryResult.error || 'PROVIDER_FAILURE',
                JSON.stringify({ provider: deliveryResult.provider, status: deliveryResult.status, error: deliveryResult.error }),
                outMsgId,
                idempotencyKey
              ),
            db.prepare(`
              INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
              VALUES (?, ?, 'USER', ?, 'MANUAL_DISPATCH_REQUIRED', 'MESSAGE', ?, '{"reply_status":"QUEUED"}', ?)
            `).bind(
              actor.workspace_id,
              actor.id,
              actor.role,
              String(id),
              JSON.stringify({ error: deliveryResult.error, channel, status: 'FAILED', retry_at: '15 minutes' })
            )
          ]);
        } catch (e) {
          console.error('Audit event log error on dispatch failure:', e);
        }
      }

      const failError: any = new Error(deliveryResult.error || 'Outbound dispatch failed');
      failError.status = 502;
      failError.code = 'MANUAL_DISPATCH_REQUIRED';
      failError.delivery = deliveryResult;
      throw failError;
    }

    if (db) {
      try {
        const row = await db.prepare(`
          SELECT m.id, m.conversation_id, conv.contact_id, c.normalized_phone, o.id as opp_id
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          JOIN contacts c ON conv.contact_id = c.id
          LEFT JOIN opportunities o ON o.source_message_id = m.id
          WHERE (m.id = ? OR CAST(SUBSTR(m.id, 5) AS INTEGER) = ?) AND conv.workspace_id = ?
        `).bind(msgId, id, actor.workspace_id).first();

        await db.batch([
          db.prepare(`
            UPDATE opportunities
            SET first_response_at = datetime('now'),
                pipeline_stage = CASE WHEN pipeline_stage = 'New' THEN 'Contacted' ELSE pipeline_stage END,
                updated_at = datetime('now')
            WHERE (source_message_id = ? OR id = ?) AND workspace_id = ?
          `).bind(msgId, row?.opp_id || `opp_${id}`, actor.workspace_id),
          db.prepare(`
            UPDATE messages
            SET delivery_status = 'SENT', provider_message_id = ?, external_message_id = ?,
                failure_code = NULL, next_retry_at = NULL, last_provider_response = ?
            WHERE id = ? AND idempotency_key = ?
          `).bind(
            deliveryResult?.messageId || null,
            deliveryResult?.messageId || idempotencyKey,
            JSON.stringify({ provider: deliveryResult?.provider, status: deliveryResult?.status }),
            outMsgId,
            idempotencyKey
          ),
          db.prepare(`
            INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
            VALUES (?, ?, 'USER', ?, 'OUTBOUND_REPLY_SENT', 'MESSAGE', ?, '{"reply_status":"PENDING"}', ?)
          `).bind(
            actor.workspace_id,
            actor.id,
            actor.role,
            String(id),
            JSON.stringify({ reply_status: 'SENT', channel, actor_name: actor.full_name, provider_id: deliveryResult?.messageId })
          )
        ]);
      } catch (e: any) {
        console.error('D1 recordOutboundReply error:', e);
        if (isProduction) {
          const err: any = new Error(e.message || 'Database error');
          err.status = 503;
          err.code = 'DB_UNAVAILABLE';
          throw err;
        }
      }
    }

    if (localRec) {
      localRec.first_response_at = new Date().toISOString();
      localRec.outbound_reply = replyText;
      localRec.reply_status = 'SENT';
      if (localRec.pipeline_stage === 'New') {
        localRec.pipeline_stage = 'Contacted';
      }
    }

    const auditRow = {
      id: inMemoryAudits.length + 1,
      workspace_id: actor.workspace_id,
      actor_id: actor.id,
      actor_role: actor.role,
      event_type: 'OUTBOUND_REPLY_SENT',
      entity_id: id,
      channel,
      delivery: deliveryResult,
      timestamp: new Date().toISOString()
    };
    inMemoryAudits.push(auditRow);

    return {
      record: localRec || { id, reply_status: 'SENT', first_response_at: new Date().toISOString() },
      audit: auditRow,
      delivery: deliveryResult
    };
  }

  /**
   * Durable Webhook Event Claims & Idempotency Ledger
   */
  static async claimWebhookEvent(
    db: any,
    workspaceId: string,
    provider: string,
    externalEventId: string,
    eventType: string,
    payloadHash: string
  ): Promise<{ duplicate: boolean; eventId?: number }> {
    if (!db) return { duplicate: false };

    try {
      // Check existing
      const existing = await db.prepare(`
        SELECT id, status FROM webhook_events
        WHERE workspace_id = ? AND provider = ? AND external_event_id = ?
      `).bind(workspaceId, provider, externalEventId).first();

      if (existing) {
        return { duplicate: true, eventId: existing.id };
      }

      // Claim record
      const result = await db.prepare(`
        INSERT INTO webhook_events (workspace_id, provider, external_event_id, event_type, payload_hash, status, received_at)
        VALUES (?, ?, ?, ?, ?, 'RECEIVED', datetime('now'))
      `).bind(workspaceId, provider, externalEventId, eventType, payloadHash).run();

      return { duplicate: false, eventId: result.meta?.last_row_id };
    } catch (err) {
      console.error('Webhook claim error:', err);
      return { duplicate: false };
    }
  }

  static async markWebhookProcessed(db: any, eventId?: number) {
    if (!db || !eventId) return;
    try {
      await db.prepare(`
        UPDATE webhook_events
        SET status = 'PROCESSED', processed_at = datetime('now')
        WHERE id = ?
      `).bind(eventId).run();
    } catch (e) {
      console.error('Failed to mark webhook processed:', e);
    }
  }

  static async markWebhookFailed(db: any, eventId?: number, failureCode?: string) {
    if (!db || !eventId) return;
    try {
      await db.prepare(`
        UPDATE webhook_events
        SET status = 'FAILED', failure_code = ?
        WHERE id = ?
      `).bind(failureCode || 'PROCESSING_ERROR', eventId).run();
    } catch (e) {
      console.error('Failed to mark webhook failed:', e);
    }
  }

  /**
   * Ingest and parse message with D1 Relational Schema persistence
   */
  static async ingestMessage(
    db: any,
    payload: { content: string; senderRaw?: string; phoneRaw?: string; channel?: Channel },
    actor: AuthenticatedUser,
    envBindings?: any
  ) {
    const aiResult = await parseWithAiOrFallback({
      content: payload.content,
      senderRaw: payload.senderRaw || '',
      phoneRaw: payload.phoneRaw || '',
      channel: payload.channel || 'WhatsApp',
      geminiApiKey: envBindings?.GEMINI_API_KEY,
      cloudflareAi: envBindings?.AI
    });

    const extraction = aiResult.extraction;
    const now = new Date().toISOString();
    const timestampMs = Date.now();
    const newId = inMemoryRecords.length + 1;

    const newRecord = {
      id: newId,
      sender_name: extraction.extracted_name || payload.senderRaw || 'Anonymous User',
      channel: payload.channel || 'WhatsApp',
      received_at: now,
      phone_raw: payload.phoneRaw || '',
      phone_normalized: extraction.normalized_phone || null,
      raw_message: payload.content,
      language: extraction.detected_language,
      triage_category: extraction.triage_category,
      program_intent: extraction.program_intent,
      businessPriority: extraction.urgency === 'CRITICAL' ? 'P0' : extraction.urgency === 'HIGH' ? 'P1' : 'P2',
      seats: extraction.estimated_seats || 1,
      estimated_value_bdt: extraction.estimated_value_bdt || 0,
      pipeline_stage: 'New' as PipelineStage,
      ticket_status: extraction.triage_category === 'CRITICAL_ESCALATION' ? 'ESCALATED' : 'OPEN',
      suggested_reply: extraction.suggested_replies.primary,
      first_response_at: null,
      reply_status: 'PENDING'
    };

    inMemoryRecords.unshift(newRecord);

    if (db) {
      try {
        const parsedPhone = normalizeBangladeshPhone(payload.phoneRaw || '');
        const normPhone = parsedPhone.isValid ? parsedPhone.normalized : null;
        const contactId = `cnt_${normPhone ? normPhone.replace('+', '') : 'anon_' + timestampMs}`;
        const convId = `conv_${timestampMs}`;
        const msgId = `msg_${newId}`;
        const oppId = `opp_${newId}`;
        const tickId = `tick_${newId}`;
        const aiId = `ai_${timestampMs}`;

        const batchStatements = [
          db.prepare(`
            INSERT OR IGNORE INTO contacts (id, workspace_id, name, normalized_phone, primary_phone, primary_channel, preferred_language, total_messages, first_seen_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
          `).bind(
            contactId,
            actor.workspace_id,
            newRecord.sender_name,
            normPhone,
            payload.phoneRaw || null,
            payload.channel || 'WhatsApp',
            extraction.detected_language
          ),
          db.prepare(`
            INSERT INTO conversations (id, workspace_id, contact_id, channel, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))
          `).bind(convId, actor.workspace_id, contactId, payload.channel || 'WhatsApp'),
          db.prepare(`
            INSERT INTO messages (id, conversation_id, direction, channel, external_message_id, sender_raw, phone_raw, content, detected_language, language_confidence, received_at, delivery_status)
            VALUES (?, ?, 'INBOUND', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'DELIVERED')
          `).bind(
            msgId,
            convId,
            payload.channel || 'WhatsApp',
            `ext_${timestampMs}`,
            newRecord.sender_name,
            payload.phoneRaw || null,
            payload.content,
            extraction.detected_language,
            aiResult.confidence
          ),
          db.prepare(`
            INSERT INTO fts_messages (message_id, sender_raw, content)
            VALUES (?, ?, ?)
          `).bind(msgId, newRecord.sender_name, payload.content)
        ];

        if (extraction.triage_category === 'SALES_LEAD') {
          batchStatements.push(
            db.prepare(`
              INSERT INTO opportunities (id, workspace_id, contact_id, source_message_id, program_intent, pipeline_stage, estimated_seats, estimated_value_bdt, sla_status, sla_due_at)
              VALUES (?, ?, ?, ?, ?, 'New', ?, ?, 'IN_SLA', datetime('now', '+24 hours'))
            `).bind(
              oppId,
              actor.workspace_id,
              contactId,
              msgId,
              extraction.program_intent,
              extraction.estimated_seats || 1,
              extraction.estimated_value_bdt || 0
            )
          );
        } else {
          batchStatements.push(
            db.prepare(`
              INSERT INTO operational_tickets (id, workspace_id, contact_id, source_message_id, queue_category, ticket_status, urgency_level, sentiment, sla_status, sla_due_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'NEUTRAL', 'IN_SLA', datetime('now', '+24 hours'))
            `).bind(
              tickId,
              actor.workspace_id,
              contactId,
              msgId,
              extraction.triage_category,
              extraction.triage_category === 'CRITICAL_ESCALATION' ? 'ESCALATED' : 'OPEN',
              extraction.urgency
            )
          );
        }

        batchStatements.push(
          db.prepare(`
            INSERT INTO ai_extractions (id, message_id, model_provider, model_version, prompt_version, overall_confidence, raw_response_json, extracted_fields_json, validation_status, human_reviewed, fallback_reason)
            VALUES (?, ?, ?, 'v2.1', 'v2', ?, ?, ?, 'PASSED', 0, ?)
          `).bind(
            aiId,
            msgId,
            aiResult.provider,
            aiResult.confidence,
            JSON.stringify(extraction.suggested_replies),
            JSON.stringify(extraction),
            aiResult.fallbackReason || null
          ),
          db.prepare(`
            INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
            VALUES (?, ?, 'USER', ?, 'INBOUND_INGEST', 'MESSAGE', ?, NULL, ?)
          `).bind(
            actor.workspace_id,
            actor.id,
            actor.role,
            msgId,
            JSON.stringify({ triage: extraction.triage_category, provider: aiResult.provider })
          )
        );

        await db.batch(batchStatements);
      } catch (err) {
        console.error('D1 ingestMessage error:', err);
      }
    }

    const auditRow = {
      id: inMemoryAudits.length + 1,
      workspace_id: actor.workspace_id,
      actor_id: actor.id,
      actor_role: actor.role,
      event_type: 'INBOUND_INGEST',
      entity_id: newId,
      triage_category: extraction.triage_category,
      ai_provider: aiResult.provider,
      timestamp: now
    };
    inMemoryAudits.push(auditRow);

    return { record: newRecord, extraction, audit: auditRow };
  }

  /**
   * Fetch Knowledge Base facts from D1
   */
  static async getKnowledgeBase(db: any, category?: string) {
    if (db) {
      try {
        let sql = 'SELECT id, workspace_id, program_category, topic, facts_payload_json, version FROM knowledge_base WHERE is_active = 1';
        const params: any[] = [];
        if (category) {
          sql += ' AND program_category = ?';
          params.push(category);
        }
        const { results } = await db.prepare(sql).bind(...params).all();
        if (results && results.length > 0) {
          return results.map((r: any) => ({
            id: r.id,
            category: r.program_category,
            topic: r.topic,
            facts: JSON.parse(r.facts_payload_json),
            version: r.version
          }));
        }
      } catch (e) {
        console.error('D1 getKnowledgeBase error:', e);
      }
    }

    return [
      { id: 'kb_bootcamp', category: 'Bootcamp', topic: '3-Day AI Bootcamp', facts: { fee_bdt: 3500, duration: '3 Days' } },
      { id: 'kb_fellowship', category: 'Fellowship', topic: 'AI Executive Fellowship', facts: { fee_bdt: 25000, duration: '12 Weeks' } },
      { id: 'kb_corporate', category: 'Corporate Training', topic: 'B2B Upskilling', facts: { min_seats: 10 } }
    ];
  }

  static getDigestMetrics() {
    const channelCounts: Record<string, number> = {};
    let totalPipelineBdt = 0;
    let corporateSeats = 0;
    let unconfirmedPayments = 0;
    let criticalEscalations = 0;
    let totalSalesLeads = 0;

    for (const r of inMemoryRecords) {
      channelCounts[r.channel] = (channelCounts[r.channel] || 0) + 1;
      if (r.triage_category === 'SALES_LEAD') {
        totalSalesLeads++;
        totalPipelineBdt += r.estimated_value_bdt || 0;
        if (r.program_intent === 'Corporate Training') {
          corporateSeats += r.seats || 0;
        }
      } else if (r.triage_category === 'CRITICAL_ESCALATION') {
        criticalEscalations++;
      } else if (r.triage_category === 'SUPPORT_BILLING') {
        unconfirmedPayments++;
      }
    }

    return {
      total_enquiries: inMemoryRecords.length,
      channelCounts,
      totalPipelineBdt,
      corporateSeats,
      unconfirmedPayments,
      criticalEscalations,
      totalSalesLeads
    };
  }

  /**
   * Fetch full conversation thread messages for an enquiry or customer contact
   */
  static async getConversationMessages(db: any, enquiryId: number, actor: AuthenticatedUser) {
    if (db) {
      try {
        const msgId = `msg_${enquiryId}`;
        const recipient = await db.prepare(`
          SELECT m.conversation_id, conv.contact_id
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE (m.id = ? OR CAST(SUBSTR(m.id, 5) AS INTEGER) = ?)
            AND conv.workspace_id = ?
        `).bind(msgId, enquiryId, actor.workspace_id).first();

        if (recipient?.conversation_id) {
          const { results } = await db.prepare(`
            SELECT id, direction, channel, sender_raw as sender_name, content,
                   received_at as timestamp, detected_language as language, delivery_status
            FROM messages
            WHERE conversation_id = ?
            ORDER BY received_at ASC
          `).bind(recipient.conversation_id).all();

          if (results && results.length > 0) {
            return results;
          }
        }
      } catch (e) {
        console.error('D1 getConversationMessages error:', e);
      }
    }

    // In-memory fallback
    const target = inMemoryRecords.find(r => r.id === enquiryId);
    if (!target) return [];

    const normPhone = target.normalized_phone || target.phone_normalized || target.phone;
    const matchedRecords = inMemoryRecords.filter(r => {
      if (normPhone && (r.normalized_phone === normPhone || r.phone === normPhone)) return true;
      return r.id === enquiryId;
    });

    matchedRecords.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    const messages: any[] = [];
    for (const rec of matchedRecords) {
      const isNote = rec.channel === 'Phone call note';
      messages.push({
        id: `msg_in_${rec.id}`,
        enquiry_id: rec.id,
        direction: isNote ? 'INTERNAL_NOTE' : 'INBOUND',
        channel: rec.channel,
        sender_name: rec.sender_name,
        content: rec.message || rec.raw_message,
        timestamp: rec.received_at,
        language: rec.detected_language || rec.language,
        delivery_status: 'RECEIVED'
      });

      if (rec.outbound_reply && rec.first_response_at) {
        messages.push({
          id: `msg_out_${rec.id}`,
          enquiry_id: rec.id,
          direction: 'OUTBOUND',
          channel: rec.channel,
          sender_name: 'BIAI Admissions',
          content: rec.outbound_reply,
          timestamp: rec.first_response_at,
          delivery_status: 'SENT'
        });
      }
    }

    return messages;
  }
}
