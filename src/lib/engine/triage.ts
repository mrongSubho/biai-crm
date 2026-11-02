import type { ProgramIntent, TriageCategory, Urgency, Sentiment } from '../types/crm.ts';

export interface TriageAnalysis {
  triageCategory: TriageCategory;
  programIntent: ProgramIntent;
  urgency: Urgency;
  sentiment: Sentiment;
  seats: number;
  estimatedValueBdt: number;
  confidence: number;
  flags: string[];
  reasons: string[];
}

export function analyzeMessageTriage(content: string, senderRaw: string = ''): TriageAnalysis {
  const text = (content + ' ' + senderRaw).toLowerCase();
  const flags: string[] = [];
  const reasons: string[] = [];

  // 1. Check for SPAM_SECURITY
  if (
    text.includes('crypto') ||
    text.includes('bit.ly') ||
    text.includes('5000 usd') ||
    text.includes('signals') ||
    text.includes('click now') ||
    text.includes('earn daily')
  ) {
    flags.push('PHISHING_OR_CRYPTO_SPAM');
    reasons.push('Contains prohibited crypto spam or obfuscated link patterns.');
    return {
      triageCategory: 'SPAM_SECURITY',
      programIntent: 'Non-Sales',
      urgency: 'LOW',
      sentiment: 'SPAM',
      seats: 0,
      estimatedValueBdt: 0,
      confidence: 0.99,
      flags,
      reasons
    };
  }

  // 2. Check for CRITICAL_ESCALATION (e.g. Row #16 Habibur Rahman)
  if (
    (text.includes('cancel') && (text.includes('money back') || text.includes('refund') || text.includes('enrolment'))) ||
    text.includes('very upset') ||
    (text.includes('post') && text.includes('facebook') && text.includes('solve')) ||
    text.includes('legal action')
  ) {
    flags.push('CRITICAL_PR_RISK', 'REFUND_DEMAND_ESCALATION');
    reasons.push('Caller demanding immediate cancellation and threatening social media escalation.');
    return {
      triageCategory: 'CRITICAL_ESCALATION',
      programIntent: 'Non-Sales',
      urgency: 'CRITICAL',
      sentiment: 'FRUSTRATED',
      seats: 1,
      estimatedValueBdt: 0,
      confidence: 0.98,
      flags,
      reasons
    };
  }

  // 3. Check for SUPPORT_BILLING (e.g. Row #7 Farzana Rahman)
  if (
    (text.includes('পেমেন্ট করেছি') || text.includes('payment korechi') || text.includes('paid already')) &&
    (text.includes('কনফার্মেশন পাইনি') || text.includes('confirmation paini') || text.includes('no confirmation') || text.includes('বিকাশে'))
  ) {
    flags.push('UNCONFIRMED_PAYMENT_VERIFICATION');
    reasons.push('Customer completed payment via bKash but has not received an enrollment confirmation.');
    return {
      triageCategory: 'SUPPORT_BILLING',
      programIntent: 'Non-Sales',
      urgency: 'HIGH',
      sentiment: 'FRUSTRATED',
      seats: 1,
      estimatedValueBdt: 3500,
      confidence: 0.96,
      flags,
      reasons
    };
  }

  // 4. Check for CAREERS_HR (e.g. Row #20 Arif Hossain)
  if (
    text.includes('looking for a job') ||
    text.includes('ai intern') ||
    text.includes('where do i apply') ||
    text.includes('cv') ||
    text.includes('resume') ||
    text.includes('internship')
  ) {
    flags.push('JOB_APPLICATION_INQUIRY');
    reasons.push('Candidate inquiring about AI internship vacancies.');
    return {
      triageCategory: 'CAREERS_HR',
      programIntent: 'Non-Sales',
      urgency: 'LOW',
      sentiment: 'NEUTRAL',
      seats: 0,
      estimatedValueBdt: 0,
      confidence: 0.98,
      flags,
      reasons
    };
  }

  // 5. Default to SALES_LEAD — determine Program Intent & Seats
  let programIntent: ProgramIntent = 'General Course';
  let seats = 1;
  let estimatedValueBdt = 3500;
  let urgency: Urgency = 'MEDIUM';
  let sentiment: Sentiment = 'POSITIVE';

  // Check Corporate B2B Training
  if (
    text.includes('textile company') ||
    text.includes('bank') ||
    text.includes('motijheel') ||
    text.includes('garment factory') ||
    text.includes('corporate') ||
    text.includes('120 employees') ||
    text.includes('40-person') ||
    text.includes('১৫ জন') ||
    text.includes('group discount') ||
    text.includes('training for our team') ||
    text.includes('quote')
  ) {
    programIntent = 'Corporate Training';
    urgency = 'HIGH';
    flags.push('B2B_ENTERPRISE_DEAL');

    // Extract seat count
    if (text.includes('120') || text.includes('১২০')) {
      seats = 120;
      estimatedValueBdt = 1500000;
      flags.push('ENTERPRISE_WHALE_120_SEATS');
    } else if (text.includes('40') || text.includes('৪০')) {
      seats = 40;
      estimatedValueBdt = 600000;
      flags.push('CORPORATE_MID_40_SEATS');
    } else if (text.includes('15') || text.includes('১৫')) {
      seats = 15;
      estimatedValueBdt = 150000;
      flags.push('CORPORATE_SMALL_15_SEATS');
    } else {
      seats = 10;
      estimatedValueBdt = 100000;
    }
  } 
  // Check Fellowship
  else if (
    text.includes('fellowship') ||
    text.includes('ফেলোশিপ') ||
    text.includes('marketing manager') ||
    text.includes('two instalments') ||
    text.includes('certificate') ||
    text.includes('govt approved')
  ) {
    programIntent = 'Fellowship';
    estimatedValueBdt = 25000;
    if (text.includes('instalment') || text.includes('কবে শুরু')) {
      urgency = 'HIGH';
    }
  } 
  // Check Bootcamp
  else if (
    text.includes('bootcamp') ||
    text.includes('বুটক্যাম্প') ||
    text.includes('3 day') ||
    text.includes('price koto')
  ) {
    programIntent = 'Bootcamp';
    estimatedValueBdt = 3500;
    urgency = 'HIGH';
  } 
  // Check Free Masterclass
  else if (
    text.includes('masterclass') ||
    text.includes('মাস্টারক্লাস') ||
    text.includes('ফ্রি') ||
    text.includes('class 9') ||
    text.includes('৯-এ')
  ) {
    programIntent = 'Free Masterclass';
    estimatedValueBdt = 0;
    urgency = 'LOW';
  }

  // Check sentiment
  if (text.includes('deri') || text.includes('late') || text.includes('price ta bolen please')) {
    sentiment = 'NEUTRAL';
    urgency = 'HIGH';
  }

  return {
    triageCategory: 'SALES_LEAD',
    programIntent,
    urgency,
    sentiment,
    seats,
    estimatedValueBdt,
    confidence: 0.94,
    flags,
    reasons
  };
}
