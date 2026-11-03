import { describe, it, expect, vi } from 'vitest';
import { parseIncomingMessage } from '../src/lib/engine/parser';
import { normalizeBangladeshPhone } from '../src/lib/engine/phone';
import { detectDialect } from '../src/lib/engine/dialect';
import { analyzeMessageTriage } from '../src/lib/engine/triage';
import { calculateSlaStatus } from '../src/lib/engine/sla';
import { parseWithAiOrFallback } from '../src/server/ai/parser';

describe('Bangladesh E.164 Phone Normalizer', () => {
  it('normalizes standard 11-digit local format', () => {
    const res = normalizeBangladeshPhone('01711000001');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+8801711000001');
    expect(res.operator).toBe('Grameenphone');
  });

  it('normalizes with country code without plus', () => {
    const res = normalizeBangladeshPhone('8801819200102');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+8801819200102');
    expect(res.operator).toBe('Robi');
  });

  it('normalizes with hyphens, spaces, and plus prefix', () => {
    const res = normalizeBangladeshPhone('+880 1911-200103');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+8801911200103');
    expect(res.operator).toBe('Banglalink');
  });

  it('fails gracefully on empty, short, or invalid numbers', () => {
    expect(normalizeBangladeshPhone('').isValid).toBe(false);
    expect(normalizeBangladeshPhone('01234').isValid).toBe(false);
    expect(normalizeBangladeshPhone('01011000001').isValid).toBe(false); // Invalid operator prefix 010
  });
});

describe('Dialect & Script Classifier', () => {
  it('classifies pure Bengali Unicode script correctly', () => {
    const res1 = detectDialect('ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?');
    expect(res1.language).toBe('BN_SCRIPT');
    expect(res1.confidence).toBeGreaterThan(0.8);

    const res2 = detectDialect('পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।');
    expect(res2.language).toBe('BN_SCRIPT');

    const res3 = detectDialect('আমার কোম্পানির ১৫ জন কর্মীর জন্য কি গ্রুপ ডিসকাউন্ট আছে?');
    expect(res3.language).toBe('BN_SCRIPT');
  });

  it('classifies Romanized Banglish phonetics accurately', () => {
    const res1 = detectDialect('Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?');
    expect(res1.language).toBe('BANGLISH');
    expect(res1.matchedTokens.length).toBeGreaterThanOrEqual(2);

    const res2 = detectDialect('Vai class gula live hoy naki recorded? Recording pawa jay?');
    expect(res2.language).toBe('BANGLISH');

    const res3 = detectDialect('Bootcamp er price ta bolen please');
    expect(res3.language).toBe('BANGLISH');

    const res4 = detectDialect('Offline class kothay hobe? Mirpur e?');
    expect(res4.language).toBe('BANGLISH');
  });

  it('classifies English corporate and inquiries accurately', () => {
    const res1 = detectDialect('I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?');
    expect(res1.language).toBe('EN');

    const res2 = detectDialect('Looking for a job as an AI intern. Where do I apply?');
    expect(res2.language).toBe('EN');

    const res3 = detectDialect('Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!');
    expect(res3.language).toBe('EN');
  });
});

describe('Triage & Intent Classifier (Forensic Sample Evaluation)', () => {
  it('identifies Row #11 as SPAM_SECURITY and quarantines it', () => {
    const res = analyzeMessageTriage('Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!');
    expect(res.triageCategory).toBe('SPAM_SECURITY');
    expect(res.sentiment).toBe('SPAM');
    expect(res.flags).toContain('PHISHING_OR_CRYPTO_SPAM');
  });

  it('identifies Row #16 as CRITICAL_ESCALATION with P0 PR-Risk', () => {
    const res = analyzeMessageTriage(
      'Caller wants to cancel his enrolment and get his money back. Very upset. Said he will post about it on Facebook if not solved today.'
    );
    expect(res.triageCategory).toBe('CRITICAL_ESCALATION');
    expect(res.urgency).toBe('CRITICAL');
    expect(res.sentiment).toBe('FRUSTRATED');
    expect(res.flags).toContain('CRITICAL_PR_RISK');
  });

  it('identifies Row #7 as SUPPORT_BILLING for unconfirmed bKash payment', () => {
    const res = analyzeMessageTriage(
      'পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।'
    );
    expect(res.triageCategory).toBe('SUPPORT_BILLING');
    expect(res.urgency).toBe('HIGH');
    expect(res.flags).toContain('UNCONFIRMED_PAYMENT_VERIFICATION');
  });

  it('identifies Row #20 as CAREERS_HR for job applicant', () => {
    const res = analyzeMessageTriage('Looking for a job as an AI intern. Where do I apply?');
    expect(res.triageCategory).toBe('CAREERS_HR');
    expect(res.programIntent).toBe('Non-Sales');
  });

  it('correctly extracts corporate seat counts and B2B whale leads', () => {
    // Row #10: Bank in Motijheel - 120 employees
    const bankRes = analyzeMessageTriage(
      "Hi, I'm from a bank in Motijheel. Need a quote for training 120 employees. Online or onsite both fine."
    );
    expect(bankRes.triageCategory).toBe('SALES_LEAD');
    expect(bankRes.programIntent).toBe('Corporate Training');
    expect(bankRes.seats).toBe(120);
    expect(bankRes.estimatedValueBdt).toBe(1500000);

    // Row #3: Gazipur textile - 40 person
    const textileRes = analyzeMessageTriage(
      'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?'
    );
    expect(textileRes.programIntent).toBe('Corporate Training');
    expect(textileRes.seats).toBe(40);

    // Row #18: Small garment - 15 staff
    const garmentRes = analyzeMessageTriage('আমার কোম্পানির ১৫ জন কর্মীর জন্য কি গ্রুপ ডিসকাউন্ট আছে?');
    expect(garmentRes.programIntent).toBe('Corporate Training');
    expect(garmentRes.seats).toBe(15);
  });
});

describe('Full Ingestion & Extraction Engine', () => {
  it('parses Row #1 (Rafi Ahmed Banglish WhatsApp) and generates tone-matched Banglish reply', () => {
    const res = parseIncomingMessage({
      content: 'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?',
      senderRaw: 'Rafi Ahmed',
      phoneRaw: '01711000001',
      channel: 'WhatsApp'
    });

    describe('AI provider hardening', () => {
      it('rejects malformed provider JSON and records a deterministic fallback reason', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"urgency":"NOT_VALID"}' }] } }]
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await parseWithAiOrFallback({
          content: 'Need a bootcamp quote',
          senderRaw: 'Test User',
          phoneRaw: '01711000001',
          geminiApiKey: 'test-key'
        });

        expect(result.provider).toBe('deterministic');
        expect(result.fallbackReason).toBe('ZodError');
        vi.unstubAllGlobals();
      });

      it('accepts a schema-valid Gemini response and preserves provider provenance', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            detected_language: 'EN',
            triage_category: 'SALES_LEAD',
            program_intent: 'Bootcamp',
            urgency: 'HIGH',
            estimated_seats: 4,
            estimated_value_bdt: 14000,
            confidence: 0.88
          }) }] } }]
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await parseWithAiOrFallback({
          content: 'Need a bootcamp quote',
          senderRaw: 'Test User',
          phoneRaw: '01711000001',
          geminiApiKey: 'test-key'
        });

        expect(result.provider).toBe('gemini-2.5-flash');
        expect(result.confidence).toBe(0.88);
        expect(result.extraction.estimated_seats).toBe(4);
        vi.unstubAllGlobals();
      });
    });

    expect(res.extracted_name).toBe('Rafi Ahmed');
    expect(res.normalized_phone).toBe('+8801711000001');
    expect(res.detected_language).toBe('BANGLISH');
    expect(res.program_intent).toBe('Bootcamp');
    expect(res.triage_category).toBe('SALES_LEAD');
    expect(res.suggested_replies.primary).toContain('Walaikum Assalam');
    expect(res.suggested_replies.primary).toContain('3,500 BDT');
    expect(res.suggested_replies.primary).toContain('bKash');
  });

  it('parses Row #3 (Mahmud Hasan - embedded role and organization)', () => {
    const res = parseIncomingMessage({
      content: 'I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?',
      senderRaw: 'Mahmud Hasan (Managing Director, Gazipur textile company)',
      phoneRaw: '01711000003',
      channel: 'Website form'
    });

    expect(res.extracted_name).toBe('Mahmud Hasan');
    expect(res.role).toBe('Managing Director');
    expect(res.organization).toBe('Gazipur textile company');
    expect(res.estimated_seats).toBe(40);
  });
});

describe('48-Hour SLA Calculation & Escalation State Machine', () => {
  it('calculates IN_SLA when more than 12h remaining', () => {
    const received = '2026-10-26T09:00:00Z';
    const now = '2026-10-26T12:00:00Z'; // 45h left
    const res = calculateSlaStatus(received, null, now);
    expect(res.status).toBe('IN_SLA');
    expect(res.isBreached).toBe(false);
    expect(res.isAtRisk).toBe(false);
  });

  it('flags AT_RISK when 12h or less remaining', () => {
    const received = '2026-10-26T09:00:00Z';
    const now = '2026-10-28T00:00:00Z'; // 9h left
    const res = calculateSlaStatus(received, null, now);
    expect(res.status).toBe('AT_RISK');
    expect(res.isAtRisk).toBe(true);
    expect(res.isBreached).toBe(false);
  });

  it('triggers BREACHED when past 48 hours without response', () => {
    const received = '2026-10-26T09:00:00Z';
    const now = '2026-10-28T12:00:00Z'; // 51h elapsed (> 48h)
    const res = calculateSlaStatus(received, null, now);
    expect(res.status).toBe('BREACHED');
    expect(res.isBreached).toBe(true);
  });

  it('records MET when response logged within 48 hours', () => {
    const received = '2026-10-26T09:00:00Z';
    const responded = '2026-10-26T15:00:00Z';
    const now = '2026-10-29T12:00:00Z';
    const res = calculateSlaStatus(received, responded, now);
    expect(res.status).toBe('MET');
    expect(res.isBreached).toBe(false);
  });
});
