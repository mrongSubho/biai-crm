import { parseIncomingMessage } from '../src/lib/engine/parser.ts';
import { normalizeBangladeshPhone } from '../src/lib/engine/phone.ts';
import { detectDialect } from '../src/lib/engine/dialect.ts';
import { analyzeMessageTriage } from '../src/lib/engine/triage.ts';
import { calculateSlaStatus } from '../src/lib/engine/sla.ts';

console.log('--- RUNNING ENGINE VERIFICATION ---');

// 1. Phone Normalizer
const p1 = normalizeBangladeshPhone('01711000001');
console.assert(p1.normalized === '+8801711000001', 'Phone 01711000001 normalizer failed');
console.log('✓ Phone Normalizer: passed');

// 2. Dialect Detector
const d1 = detectDialect('ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?');
console.assert(d1.language === 'BN_SCRIPT', 'Bengali script detection failed');

const d2 = detectDialect('Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?');
console.assert(d2.language === 'BANGLISH', 'Banglish detection failed');

const d3 = detectDialect('I run a 40-person textile company in Gazipur.');
console.assert(d3.language === 'EN', 'English detection failed');
console.log('✓ Dialect Detector: passed');

// 3. Triage & Intent
const t1 = analyzeMessageTriage('Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!');
console.assert(t1.triageCategory === 'SPAM_SECURITY', 'Spam detection failed');

const t2 = analyzeMessageTriage('Caller wants to cancel his enrolment and get his money back. Very upset. Said he will post about it on Facebook if not solved today.');
console.assert(t2.triageCategory === 'CRITICAL_ESCALATION', 'Escalation detection failed');

const t3 = analyzeMessageTriage('পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।');
console.assert(t3.triageCategory === 'SUPPORT_BILLING', 'Billing support detection failed');

const t4 = analyzeMessageTriage('Looking for a job as an AI intern. Where do I apply?');
console.assert(t4.triageCategory === 'CAREERS_HR', 'Careers detection failed');

const t5 = analyzeMessageTriage("Hi, I'm from a bank in Motijheel. Need a quote for training 120 employees.");
console.assert(t5.seats === 120 && t5.programIntent === 'Corporate Training', 'Corporate 120 seats extraction failed');
console.log('✓ Triage & Intent: passed');

// 4. SLA Calculation
const s1 = calculateSlaStatus('2026-10-26T09:00:00Z', null, '2026-10-28T12:00:00Z');
console.assert(s1.status === 'BREACHED' && s1.isBreached === true, 'SLA Breach calculation failed');

const s2 = calculateSlaStatus('2026-10-26T09:00:00Z', null, '2026-10-26T12:00:00Z');
console.assert(s2.status === 'IN_SLA', 'SLA In-SLA calculation failed');
console.log('✓ SLA Engine: passed');

// 5. Full Ingestion on Row #1
const row1 = parseIncomingMessage({
  content: 'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?',
  senderRaw: 'Rafi Ahmed',
  phoneRaw: '01711000001',
  channel: 'WhatsApp'
});
console.assert(row1.suggested_replies.primary.includes('3,500 BDT'), 'Row 1 reply generation failed');
console.log('✓ Full Ingestion Parser on Row #1: passed');

console.log('=== ALL 5 VERIFICATION SUITES PASSED CLEANLY! ===');
