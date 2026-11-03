import { parseIncomingMessage } from '../../lib/engine/parser.ts';
import type { ExtractionResult } from '../../lib/types/crm.ts';
import { z } from 'zod';

const AiResponseSchema = z.object({
  extracted_name: z.string().nullable().optional(),
  normalized_phone: z.string().nullable().optional(),
  detected_language: z.enum(['BANGLISH', 'BN_SCRIPT', 'EN', 'MIXED']).optional(),
  triage_category: z.enum(['SALES_LEAD', 'SUPPORT_BILLING', 'CRITICAL_ESCALATION', 'CAREERS_HR', 'SPAM_SECURITY']).optional(),
  program_intent: z.enum(['Bootcamp', 'Fellowship', 'Corporate Training', 'Free Masterclass', 'General Course', 'Non-Sales']).optional(),
  urgency: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  estimated_seats: z.number().int().nonnegative().optional(),
  estimated_value_bdt: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export interface AiParseOptions {
  content: string;
  senderRaw?: string;
  phoneRaw?: string;
  channel?: any;
  geminiApiKey?: string;
  cloudflareAi?: any;
}

export async function parseWithAiOrFallback(options: AiParseOptions): Promise<{
  extraction: ExtractionResult;
  provider: 'gemini-2.5-flash' | 'workers-ai' | 'deterministic';
  confidence: number;
  fallbackReason?: string;
}> {
  const { content, senderRaw = '', phoneRaw = '', channel = 'WhatsApp', geminiApiKey, cloudflareAi } = options;
  let fallbackReason: string | undefined;

  // 1. Try Gemini 2.5 Flash if API key provided
  if (geminiApiKey) {
    try {
      const prompt = `You are a Bangladeshi AI institute (BIAI) CRM assistant.
Analyze this inbound message and return a pure JSON object:
Message: "${content}"
Sender: "${senderRaw}"
Phone: "${phoneRaw}"
Channel: "${channel}"

JSON structure:
{
  "extracted_name": "string or null",
  "normalized_phone": "string canonical +8801... or null",
  "detected_language": "BANGLISH" | "BN_SCRIPT" | "EN" | "MIXED",
  "triage_category": "SALES_LEAD" | "SUPPORT_BILLING" | "CRITICAL_ESCALATION" | "CAREERS_HR" | "SPAM_SECURITY",
  "program_intent": "Bootcamp" | "Fellowship" | "Corporate Training" | "Free Masterclass" | "General Course" | "Non-Sales",
  "urgency": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "estimated_seats": number,
  "estimated_value_bdt": number,
  "confidence": number
}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const body: any = await res.json();
        const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = AiResponseSchema.parse(JSON.parse(text));
          const deterministic = parseIncomingMessage({ content, senderRaw, phoneRaw, channel });
          return {
            extraction: {
              ...deterministic,
              extracted_name: parsed.extracted_name || deterministic.extracted_name,
              normalized_phone: parsed.normalized_phone || deterministic.normalized_phone,
              detected_language: parsed.detected_language || deterministic.detected_language,
              triage_category: parsed.triage_category || deterministic.triage_category,
              program_intent: parsed.program_intent || deterministic.program_intent,
              urgency: parsed.urgency || deterministic.urgency,
              estimated_seats: parsed.estimated_seats || deterministic.estimated_seats,
              estimated_value_bdt: parsed.estimated_value_bdt || deterministic.estimated_value_bdt
            },
            provider: 'gemini-2.5-flash',
            confidence: parsed.confidence || 0.95
          };
        }
      }
    } catch (e) {
      console.warn('Gemini extraction error, falling back to deterministic:', e);
      fallbackReason = e instanceof Error ? e.name : 'GEMINI_PROVIDER_ERROR';
    }
  }

  // 2. Try Cloudflare Workers AI if bound
  if (cloudflareAi) {
    try {
      const aiResponse = await Promise.race([
        cloudflareAi.run('@cf/meta/llama-3.3-70b-instruct', {
        prompt: `Analyze the customer inquiry: "${content}". Categorize into SALES_LEAD, SUPPORT_BILLING, CRITICAL_ESCALATION, CAREERS_HR, or SPAM_SECURITY.`
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('WORKERS_AI_TIMEOUT')), 8000))
      ]);
      if (aiResponse?.response) {
        const deterministic = parseIncomingMessage({ content, senderRaw, phoneRaw, channel });
        return { extraction: deterministic, provider: 'workers-ai', confidence: deterministic.confidence_score };
      }
    } catch (e) {
      console.warn('Workers AI error, falling back to deterministic:', e);
      fallbackReason = e instanceof Error ? e.message : 'WORKERS_AI_PROVIDER_ERROR';
    }
  }

  // 3. Robust Deterministic Engine Fallback
  const deterministic = parseIncomingMessage({ content, senderRaw, phoneRaw, channel });
  return {
    extraction: deterministic,
    provider: 'deterministic',
    confidence: deterministic.confidence_score,
    fallbackReason: fallbackReason || 'NO_AI_PROVIDER_CONFIGURED'
  };
}
