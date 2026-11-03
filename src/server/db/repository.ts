import { sampleEnquiriesFixture } from '../fixtures.ts';
import { calculateSlaStatus } from '../../lib/engine/sla.ts';
import { normalizeBangladeshPhone } from '../../lib/engine/phone.ts';
import { parseWithAiOrFallback } from '../ai/parser.ts';
import { sendWhatsAppMessage } from '../adapters/whatsapp.ts';
import type { Channel, PipelineStage } from '../../lib/types/crm.ts';
import type { AuthenticatedUser } from '../auth.ts';
import type { TicketStatus } from '../validation.ts';

let inMemoryRecords: any[] = [...sampleEnquiriesFixture];
let inMemoryAudits: any[] = [];

export class CrmRepository {
  /**
   * Fetch enquiries with dynamic SLA calculation, FTS search, and queue filtering
   */
  static async getEnquiries(
    db: any,
    queue: string = 'all',
    stage?: string,
    simTime?: string,
    environment: string = 'development',
    search?: string
  ) {
    // Security check: sim_time is restricted in production
    const effectiveSimTime = environment === 'production' ? null : (simTime || null);

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
            WHERE fts_messages MATCH ?
          `;
          params.push(search.trim());
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
            WHERE m.direction = 'INBOUND'
          `;
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
            const sla = calculateSlaStatus(r.received_at, r.first_response_at, effectiveSimTime);
            return {
              id: rowId,
              sender_name: r.sender_name,
              channel: r.channel,
              received_at: r.received_at,
              raw_message: r.raw_message,
              phone_raw: r.phone_raw || '',
              phone_normalized: r.normalized_phone || null,
              language: r.language || 'BANGLISH',
              triage_category: r.queue_category || (r.opportunity_id ? 'SALES_LEAD' : 'GENERAL'),
              program_intent: r.program_intent || 'General Inquiry',
              seats: r.seats || 1,
              estimated_value_bdt: r.estimated_value_bdt || 0,
              pipeline_stage: r.pipeline_stage || 'New',
              ticket_status: r.ticket_status || 'OPEN',
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
        console.error('D1 getEnquiries error, falling back to in-memory:', err);
      }
    }

    // In-memory fallback
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
   * Transition Sales Pipeline Stage in D1 and in-memory
   */
  static async transitionStage(
    db: any,
    id: number,
    newStage: PipelineStage,
    actor: AuthenticatedUser
  ) {
    const oppId = `opp_${id}`;
    const msgId = `msg_${id}`;

    if (db) {
      try {
        const opp = await db.prepare(
          'SELECT id, pipeline_stage, workspace_id FROM opportunities WHERE id = ? OR source_message_id = ?'
        ).bind(oppId, msgId).first();

        const beforeStage = opp?.pipeline_stage || 'Unknown';

        await db.batch([
          db.prepare(`
            UPDATE opportunities
            SET pipeline_stage = ?, updated_at = datetime('now')
            WHERE id = ? OR source_message_id = ?
          `).bind(newStage, oppId, msgId),
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
      } catch (e) {
        console.error('D1 transitionStage error:', e);
      }
    }

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

    const genericRecord = { id, pipeline_stage: newStage, updated_at: new Date().toISOString() };
    return {
      record: genericRecord,
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
   * Transition Operational Ticket Status (e.g. ESCALATED, RESOLVED) in D1
   */
  static async transitionTicketStatus(
    db: any,
    id: number,
    newStatus: TicketStatus,
    notes: string | undefined,
    actor: AuthenticatedUser
  ) {
    const tickId = `tick_${id}`;
    const msgId = `msg_${id}`;

    if (db) {
      try {
        const ticket = await db.prepare(
          'SELECT id, ticket_status, workspace_id FROM operational_tickets WHERE id = ? OR source_message_id = ?'
        ).bind(tickId, msgId).first();

        const beforeStatus = ticket?.ticket_status || 'Unknown';

        await db.batch([
          db.prepare(`
            UPDATE operational_tickets
            SET ticket_status = ?, resolution_notes = COALESCE(?, resolution_notes), updated_at = datetime('now')
            WHERE id = ? OR source_message_id = ?
          `).bind(newStatus, notes || null, tickId, msgId),
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
      } catch (e) {
        console.error('D1 ticket transition error:', e);
      }
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
   * Approve and record outbound reply in D1 with WhatsApp delivery dispatch
   */
  static async recordOutboundReply(
    db: any,
    id: number,
    replyText: string,
    channel: Channel,
    actor: AuthenticatedUser,
    envBindings?: any
  ) {
    const now = new Date().toISOString();
    const msgId = `msg_${id}`;
    let recipientPhone = '';

    // Find phone for dispatch
    const localRec = inMemoryRecords.find(r => r.id === id);
    if (localRec) {
      recipientPhone = localRec.phone_normalized || localRec.phone_raw || '';
    }

    // 1. Dispatch through WhatsApp Adapter
    let deliveryResult: any = null;
    if (channel === 'WhatsApp') {
      deliveryResult = await sendWhatsAppMessage({
        recipientPhone: recipientPhone || '+8801700000000',
        messageText: replyText,
        token: envBindings?.META_WHATSAPP_TOKEN,
        phoneNumberId: envBindings?.META_PHONE_NUMBER_ID
      });
    }

    if (db) {
      try {
        const row = await db.prepare(`
          SELECT m.id, m.conversation_id, conv.contact_id, c.normalized_phone, o.id as opp_id
          FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          JOIN contacts c ON conv.contact_id = c.id
          LEFT JOIN opportunities o ON o.source_message_id = m.id
          WHERE m.id = ? OR CAST(SUBSTR(m.id, 5) AS INTEGER) = ?
        `).bind(msgId, id).first();

        const convId = row?.conversation_id || `conv_${id}`;
        const outMsgId = `msg_out_${Date.now()}`;

        await db.batch([
          db.prepare(`
            UPDATE opportunities
            SET first_response_at = datetime('now'),
                pipeline_stage = CASE WHEN pipeline_stage = 'New' THEN 'Contacted' ELSE pipeline_stage END,
                updated_at = datetime('now')
            WHERE source_message_id = ? OR id = ?
          `).bind(msgId, row?.opp_id || `opp_${id}`),
          db.prepare(`
            INSERT INTO messages (id, conversation_id, direction, channel, external_message_id, sender_raw, content, detected_language, language_confidence, received_at, delivery_status)
            VALUES (?, ?, 'OUTBOUND', ?, ?, 'BIAI Staff Agent', ?, 'EN', 1.0, datetime('now'), 'SENT')
          `).bind(outMsgId, convId, channel, deliveryResult?.messageId || `msg_sim_${Date.now()}`, replyText),
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
      } catch (e) {
        console.error('D1 recordOutboundReply error:', e);
      }
    }

    if (localRec) {
      localRec.first_response_at = now;
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
      timestamp: now
    };
    inMemoryAudits.push(auditRow);

    return {
      record: localRec || { id, reply_status: 'SENT', first_response_at: now },
      audit: auditRow,
      delivery: deliveryResult
    };
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
            INSERT INTO ai_extractions (id, message_id, model_provider, model_version, prompt_version, overall_confidence, raw_response_json, extracted_fields_json, validation_status, human_reviewed)
            VALUES (?, ?, ?, 'v2.1', 'v2', ?, ?, ?, 'PASSED', 0)
          `).bind(
            aiId,
            msgId,
            aiResult.provider,
            aiResult.confidence,
            JSON.stringify(extraction.suggested_replies),
            JSON.stringify(extraction)
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
}
