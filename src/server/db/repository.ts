import { sampleEnquiriesFixture } from '../fixtures.ts';
import { calculateSlaStatus } from '../../lib/engine/sla.ts';
import { parseIncomingMessage } from '../../lib/engine/parser.ts';
import type { Channel, PipelineStage } from '../../lib/types/crm.ts';
import type { AuthenticatedUser } from '../auth.ts';
import type { TicketStatus } from '../validation.ts';

let inMemoryRecords: any[] = [...sampleEnquiriesFixture];
let inMemoryAudits: any[] = [];

export class CrmRepository {
  /**
   * Fetch enquiries with dynamic SLA calculation and queue filtering
   */
  static async getEnquiries(
    db: any,
    queue: string = 'all',
    stage?: string,
    simTime?: string,
    environment: string = 'development'
  ) {
    // Security check: sim_time is restricted in production
    const effectiveSimTime = environment === 'production' ? null : (simTime || null);

    if (db) {
      try {
        let sql = `
          SELECT 
            m.id as message_id,
            m.content as raw_message,
            m.channel,
            m.received_at,
            c.name as sender_name,
            c.normalized_phone,
            o.id as opportunity_id,
            o.pipeline_stage,
            o.program_intent,
            o.estimated_seats as seats,
            o.estimated_value_bdt,
            o.sla_status,
            o.sla_due_at,
            o.first_response_at,
            t.queue_category,
            t.ticket_status
          FROM messages m
          JOIN contacts c ON m.contact_id = c.id
          LEFT JOIN opportunities o ON o.source_message_id = m.id
          LEFT JOIN operational_tickets t ON t.source_message_id = m.id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (stage) {
          sql += ' AND o.pipeline_stage = ?';
          params.push(stage);
        }

        const { results } = await db.prepare(sql).bind(...params).all();
        if (results && results.length > 0) {
          let list = (results as any[]).map((r, index) => {
            const sla = calculateSlaStatus(r.received_at, r.first_response_at, effectiveSimTime);
            return {
              id: index + 1,
              sender_name: r.sender_name,
              channel: r.channel,
              received_at: r.received_at,
              raw_message: r.raw_message,
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
   * Transition Sales Pipeline Stage
   */
  static async transitionStage(
    db: any,
    id: number,
    newStage: PipelineStage,
    actor: AuthenticatedUser
  ) {
    if (db) {
      try {
        await db.prepare(`
          INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
          VALUES (?, ?, 'USER', ?, 'STAGE_TRANSITION', 'OPPORTUNITY', ?, '{"stage":"UNKNOWN"}', ?)
        `).bind(
          actor.workspace_id,
          actor.id,
          actor.role,
          String(id),
          JSON.stringify({ stage: newStage, actor_name: actor.full_name })
        ).run();
      } catch (e) {
        console.error('D1 transitionStage audit error:', e);
      }
    }

    const record = inMemoryRecords.find(r => r.id === id);
    if (!record) {
      throw new Error(`Enquiry with ID ${id} not found.`);
    }

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

  /**
   * Transition Operational Ticket Status (e.g. ESCALATED, RESOLVED)
   */
  static async transitionTicketStatus(
    db: any,
    id: number,
    newStatus: TicketStatus,
    notes: string | undefined,
    actor: AuthenticatedUser
  ) {
    if (db) {
      try {
        await db.prepare(`
          INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
          VALUES (?, ?, 'USER', ?, 'TICKET_STATUS_UPDATED', 'TICKET', ?, '{"status":"UNKNOWN"}', ?)
        `).bind(
          actor.workspace_id,
          actor.id,
          actor.role,
          String(id),
          JSON.stringify({ status: newStatus, notes, actor_name: actor.full_name })
        ).run();
      } catch (e) {
        console.error('D1 ticket transition audit error:', e);
      }
    }

    const record = inMemoryRecords.find(r => r.id === id);
    if (!record) throw new Error(`Ticket with ID ${id} not found.`);

    record.ticket_status = newStatus;
    if (newStatus === 'ESCALATED') {
      record.is_escalated = true;
    }
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

  /**
   * Approve and record outbound reply
   */
  static async recordOutboundReply(
    db: any,
    id: number,
    replyText: string,
    channel: Channel,
    actor: AuthenticatedUser
  ) {
    const now = new Date().toISOString();

    if (db) {
      try {
        await db.prepare(`
          INSERT INTO audit_events (workspace_id, actor_id, actor_type, actor_role, event_type, entity_type, entity_id, before_state_json, after_state_json)
          VALUES (?, ?, 'USER', ?, 'REPLY_APPROVED', 'MESSAGE', ?, '{"reply_status":"PENDING"}', ?)
        `).bind(
          actor.workspace_id,
          actor.id,
          actor.role,
          String(id),
          JSON.stringify({ reply_status: 'SENT', channel, actor_name: actor.full_name })
        ).run();
      } catch (e) {
        console.error('D1 reply audit error:', e);
      }
    }

    const record = inMemoryRecords.find(r => r.id === id);
    if (!record) {
      throw new Error(`Enquiry with ID ${id} not found.`);
    }

    record.first_response_at = now;
    record.outbound_reply = replyText;
    record.reply_status = 'SENT';
    if (record.pipeline_stage === 'New') {
      record.pipeline_stage = 'Contacted';
    }

    const auditRow = {
      id: inMemoryAudits.length + 1,
      workspace_id: actor.workspace_id,
      actor_id: actor.id,
      actor_role: actor.role,
      event_type: 'OUTBOUND_REPLY_SENT',
      entity_id: id,
      channel,
      timestamp: now
    };
    inMemoryAudits.push(auditRow);

    return { record, audit: auditRow };
  }

  /**
   * Ingest and parse message
   */
  static async ingestMessage(
    db: any,
    payload: { content: string; senderRaw?: string; phoneRaw?: string; channel?: Channel },
    actor: AuthenticatedUser
  ) {
    const extraction = parseIncomingMessage({
      content: payload.content,
      senderRaw: payload.senderRaw || '',
      phoneRaw: payload.phoneRaw || '',
      channel: payload.channel || 'WhatsApp'
    });

    const newId = inMemoryRecords.length + 1;
    const now = new Date().toISOString();

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

    const auditRow = {
      id: inMemoryAudits.length + 1,
      workspace_id: actor.workspace_id,
      actor_id: actor.id,
      actor_role: actor.role,
      event_type: 'INBOUND_INGEST',
      entity_id: newId,
      triage_category: extraction.triage_category,
      timestamp: now
    };
    inMemoryAudits.push(auditRow);

    return { record: newRecord, extraction, audit: auditRow };
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
