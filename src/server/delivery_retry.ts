import { sendWhatsAppMessage } from './adapters/whatsapp.js';

const MAX_RETRY_COUNT = 5;

export async function retryQueuedCrmDeliveries(db: any, env: {
  ENVIRONMENT?: string;
  META_WHATSAPP_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
}, limit = 25): Promise<{ attempted: number; sent: number; failed: number }> {
  if (!db) return { attempted: 0, sent: 0, failed: 0 };

  const rows = await db.prepare(`
    SELECT m.id, m.phone_raw, m.content, m.channel, m.idempotency_key, m.retry_count
    FROM messages m
    WHERE m.direction = 'OUTBOUND'
      AND m.delivery_status IN ('QUEUED', 'FAILED')
      AND (m.next_retry_at IS NULL OR m.next_retry_at <= datetime('now'))
      AND m.retry_count < ?
    ORDER BY m.created_at
    LIMIT ?
  `).bind(MAX_RETRY_COUNT, limit).all();

  let sent = 0;
  let failed = 0;
  for (const row of rows.results || []) {
    const claim = await db.prepare(`
      UPDATE messages
      SET next_retry_at = datetime('now', '+5 minutes')
      WHERE id = ?
        AND delivery_status IN ('QUEUED', 'FAILED')
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
        AND retry_count < ?
    `).bind(row.id, MAX_RETRY_COUNT).run();
    if (!claim?.meta?.changes) continue;

    const result = await sendWhatsAppMessage({
      recipientPhone: row.phone_raw || '',
      messageText: row.content,
      token: env.META_WHATSAPP_TOKEN,
      phoneNumberId: env.META_PHONE_NUMBER_ID,
      idempotencyKey: row.idempotency_key,
      allowMock: env.ENVIRONMENT !== 'production'
    });

    if (result.success) {
      sent++;
      await db.prepare(`
        UPDATE messages
        SET delivery_status = 'SENT', provider_message_id = ?, external_message_id = ?,
            failure_code = NULL, next_retry_at = NULL, last_provider_response = ?
        WHERE id = ? AND idempotency_key = ?
      `).bind(
        result.messageId || null,
        result.messageId || row.idempotency_key,
        JSON.stringify({ provider: result.provider, status: result.status }),
        row.id,
        row.idempotency_key
      ).run();
    } else {
      failed++;
      const nextDelay = Math.min(60, 5 * 2 ** Number(row.retry_count || 0));
      await db.prepare(`
        UPDATE messages
        SET delivery_status = 'FAILED', failure_code = ?, retry_count = retry_count + 1,
            next_retry_at = datetime('now', '+' || ? || ' minutes'), last_provider_response = ?
        WHERE id = ? AND idempotency_key = ?
      `).bind(
        result.error || 'PROVIDER_FAILURE',
        nextDelay,
        JSON.stringify({ provider: result.provider, status: result.status, error: result.error }),
        row.id,
        row.idempotency_key
      ).run();
    }
  }

  return { attempted: sent + failed, sent, failed };
}
