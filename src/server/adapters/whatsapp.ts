/**
 * Meta WhatsApp Cloud API Adapter for BIAI CRM.
 */

export interface WhatsAppSendOptions {
  recipientPhone: string;
  messageText: string;
  token?: string;
  phoneNumberId?: string;
  idempotencyKey?: string;
  allowMock?: boolean;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId: string;
  provider: 'META_CLOUD_API' | 'MOCK_ADAPTER';
  status: 'SENT' | 'FAILED';
  error?: string;
  timestamp: string;
}

export async function sendWhatsAppMessage(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
  const { recipientPhone, messageText, token, phoneNumberId, idempotencyKey, allowMock = false } = options;
  const timestamp = new Date().toISOString();

  if (token && phoneNumberId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const cleanPhone = recipientPhone.replace(/[^0-9]/g, '');
      const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: messageText }
        }),
        signal: controller.signal
      });

      const data: any = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          messageId: '',
          provider: 'META_CLOUD_API',
          status: 'FAILED',
          error: data?.error?.message || `WhatsApp API HTTP ${response.status}`,
          timestamp
        };
      }

      return {
        success: true,
        messageId: data?.messages?.[0]?.id || '',
        provider: 'META_CLOUD_API',
        status: 'SENT',
        timestamp
      };
    } catch (err: any) {
      return {
        success: false,
        messageId: '',
        provider: 'META_CLOUD_API',
        status: 'FAILED',
        error: err?.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : (err?.message || 'Network error contacting Meta API'),
        timestamp
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  if (allowMock) {
    return {
      success: true,
      messageId: `mock_whatsapp_${crypto.randomUUID()}`,
      provider: 'MOCK_ADAPTER',
      status: 'SENT',
      timestamp
    };
  }

  return {
    success: false,
    messageId: '',
    provider: 'META_CLOUD_API',
    status: 'FAILED',
    error: 'MISSING_CREDENTIALS: Meta WhatsApp token or Phone Number ID not configured',
    timestamp
  };
}
