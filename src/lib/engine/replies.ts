import type { Language, ProgramIntent, TriageCategory } from '../types/crm.ts';

export interface ReplyGenerationContext {
  senderName: string;
  detectedLanguage: Language;
  programIntent: ProgramIntent;
  triageCategory: TriageCategory;
  normalizedPhone?: string | null;
  seats?: number;
  messageContent: string;
}

export interface GeneratedReplyPair {
  primary: string;
  primaryLanguage: Language;
  alternate: string;
  alternateLanguage: Language;
  requiresPriceVerification: boolean;
  notes: string[];
}

export function generateSuggestedReplies(ctx: ReplyGenerationContext): GeneratedReplyPair {
  const { senderName, detectedLanguage, programIntent, triageCategory, seats = 1 } = ctx;
  const firstName = senderName.split(' ')[0] || 'Sir/Madam';
  const notes: string[] = [];
  let requiresPriceVerification = false;

  // 1. Quarantined Spam
  if (triageCategory === 'SPAM_SECURITY') {
    return {
      primary: '[QUARANTINED - PHISHING SPAM DETECTED. NO REPLY DISPATCHED]',
      primaryLanguage: 'EN',
      alternate: '[QUARANTINED - NO ACTION REQUIRED]',
      alternateLanguage: 'EN',
      requiresPriceVerification: false,
      notes: ['Spam quarantined automatically. Outbound sending disabled.']
    };
  }

  // 2. Critical Escalation / Refund Threat (Row #16 Habibur Rahman)
  if (triageCategory === 'CRITICAL_ESCALATION') {
    return {
      primary: `[P0 SUPERVISOR DE-ESCALATION SCRIPT]: Assalamualaikum Mr. ${senderName}. This is Farhan from BIAI Management. I personally received your urgent cancellation request and sincerely apologize for your frustration. I have immediately instructed our finance team to expedite your full refund today. Could you please confirm your bKash or Bank details right now so we can disburse it immediately?`,
      primaryLanguage: 'EN',
      alternate: `[জরুরি ব্যবস্থাপনা ফোন স্ক্রিপ্ট]: আসসালামু আলাইকুম ${senderName} সাহেব। আপনার রিফান্ড রিকোয়েস্টটি আমরা সর্বোচ্চ অগ্রাধিকার দিয়ে আজকেই প্রসেস করছি। আপনার বিকাশ বা ব্যাংক অ্যাকাউন্ট নম্বরটি দিন।`,
      alternateLanguage: 'BN_SCRIPT',
      requiresPriceVerification: false,
      notes: ['Critical PR Risk: Prompt phone call recommended within 1 hour.']
    };
  }

  // 3. Billing & Payment Support (Row #7 Farzana Rahman)
  if (triageCategory === 'SUPPORT_BILLING') {
    return {
      primary: `আসসালামু আলাইকুম ${firstName} আপু/ভাই! আপনার পেমেন্ট কনফার্মেশনে বিলম্ব হওয়ার জন্য আমরা আন্তরিকভাবে দুঃখিত। অনুগ্রহ করে আপনার বিকাশ/নগদ ট্রানজ্যাকশন আইডি (TrxID) এবং যে নম্বর থেকে টাকা পাঠিয়েছেন তা এখানে দিন। আমাদের ফাইন্যান্স টিম এখনই ভেরিফাই করে আপনার ইনরোলমেন্ট নিশ্চিত করে দিচ্ছে।`,
      primaryLanguage: 'BN_SCRIPT',
      alternate: `Walaikum Assalam ${firstName}! Payment confirmation deri houay amra antorik bhabe dukkhito. Apnar bKash TrxID ebong sender number ta ekhane share korun, amader team ekhoni verify kore confirm korche.`,
      alternateLanguage: 'BANGLISH',
      requiresPriceVerification: false,
      notes: ['Finance team verification pending on bKash merchant statement.']
    };
  }

  // 4. Careers / Intern Inquiry (Row #20 Arif Hossain)
  if (triageCategory === 'CAREERS_HR') {
    return {
      primary: `Hi ${firstName}, thank you for your enthusiasm about joining BIAI! Please visit our careers portal at biai.com.bd/careers or email your CV, GitHub, and portfolio directly to hr@biai.com.bd. Our hiring team reviews intern applications on a rolling basis.`,
      primaryLanguage: 'EN',
      alternate: `হ্যালো ${firstName}! বিআইএআই-তে ইন্টার্নশিপে আগ্রহের জন্য ধন্যবাদ। অনুগ্রহ করে আপনার সিভি hr@biai.com.bd এ ইমেইল করুন অথবা আমাদের ওয়েবসাইট biai.com.bd/careers এ সাবমিট করুন।`,
      alternateLanguage: 'BN_SCRIPT',
      requiresPriceVerification: false,
      notes: ['Routed to HR portal inquiry workflow.']
    };
  }

  // 5. Corporate B2B Training (Rows #3, #10, #18)
  if (programIntent === 'Corporate Training') {
    if (detectedLanguage === 'BN_SCRIPT') {
      return {
        primary: `আসসালামু আলাইকুম ${senderName} সাহেব! আপনার প্রতিষ্ঠানের ${seats} জন কর্মীর টিমের জন্য আমাদের বিশেষ গ্রুপ ডিসকাউন্ট সুবিধা রয়েছে। আমরা ইন্ডাস্ট্রি-উপযোগী বাস্তবসম্মত এআই ট্রেনিং ও ওয়ার্কশপ প্রদান করি। আপনার সুবিধাজনক সময়ে কি আগামী সপ্তাহে একটি ১৫ মিনিটের ডিসকভারি মিটিং করা যাবে?`,
        primaryLanguage: 'BN_SCRIPT',
        alternate: `Dear Mr. ${senderName}, thank you for contacting BIAI. For your team cohort of ${seats} members, we offer customized corporate AI upskilling packages. Could we schedule a 15-minute briefing call this week?`,
        alternateLanguage: 'EN',
        requiresPriceVerification: false,
        notes: [`Enterprise inquiry for ${seats} team members. Account executive assigned.`]
      };
    } else {
      return {
        primary: `Dear Mr. ${senderName}, thank you for reaching out to BIAI. For an enterprise cohort of ${seats} team members, we offer specialized hands-on AI curriculum tailored to your industry workflows (onsite or interactive online). Could we arrange a 15-minute briefing call or office visit this week?`,
        primaryLanguage: 'EN',
        alternate: `আসসালামু আলাইকুম ${senderName} সাহেব, আপনার প্রতিষ্ঠানের ${seats} জনের টিমের জন্য কাস্টমাইজড এআই ট্রেনিং প্রস্তাবনা নিয়ে আমরা আলোচনা করতে আগ্রহী।`,
        alternateLanguage: 'BN_SCRIPT',
        requiresPriceVerification: false,
        notes: [`Enterprise inquiry for ${seats} team members.`]
      };
    }
  }

  // 6. 3-Day Bootcamp (Rows #1, #12)
  if (programIntent === 'Bootcamp') {
    if (detectedLanguage === 'BANGLISH') {
      return {
        primary: `Walaikum Assalam ${firstName} vai! Amader 3-day AI Bootcamp er fee 3,500 BDT. Apni bKash, Nagad ba Card er maddhome shohojei payment korte parben. Class shuru hocche ashche Shukrobar theke. Apnake ki registration link ta pathabo?`,
        primaryLanguage: 'BANGLISH',
        alternate: `আসসালামু আলাইকুম ${firstName} ভাই! আমাদের ৩ দিনের এআই বুটক্যাম্পের ফি ৩,৫০০ টাকা। বিকাশ, নগদ বা কার্ডের মাধ্যমে পেমেন্ট করতে পারবেন। রেজিস্ট্রেশন লিংকটি কি পাঠাবো?`,
        alternateLanguage: 'BN_SCRIPT',
        requiresPriceVerification: false,
        notes: ['Bootcamp pricing confirmed: 3,500 BDT.']
      };
    } else if (detectedLanguage === 'BN_SCRIPT') {
      return {
        primary: `আসসালামু আলাইকুম ${firstName}! আমাদের ৩ দিনের প্র্যাক্টিক্যাল এআই বুটক্যাম্পের ফি ৩,৫০০ টাকা। আপনি বিকাশ, নগদ বা কার্ডে সহজে পেমেন্ট করতে পারবেন। রেজিস্ট্রেশন লিংকটি কি পাঠাবো?`,
        primaryLanguage: 'BN_SCRIPT',
        alternate: `Walaikum Assalam ${firstName} vai! Amader 3-day bootcamp fee 3,500 BDT. Registration link pathabo ki?`,
        alternateLanguage: 'BANGLISH',
        requiresPriceVerification: false,
        notes: ['Bootcamp pricing confirmed: 3,500 BDT.']
      };
    } else {
      return {
        primary: `Hi ${firstName}, our 3-Day AI Bootcamp tuition is 3,500 BDT. It includes live interactive weekend sessions and lifetime portal access to all recordings. Would you like me to send the registration link?`,
        primaryLanguage: 'EN',
        alternate: `Walaikum Assalam ${firstName} vai! Amader 3-day AI Bootcamp er fee 3,500 BDT. Registration link pathabo ki?`,
        alternateLanguage: 'BANGLISH',
        requiresPriceVerification: false,
        notes: ['Bootcamp pricing confirmed: 3,500 BDT.']
      };
    }
  }

  // 7. AI Fellowship (Rows #2, #14, #19)
  if (programIntent === 'Fellowship') {
    if (detectedLanguage === 'BN_SCRIPT') {
      return {
        primary: `আসসালামু আলাইকুম ${firstName} আপু/ভাই! আমাদের পরবর্তী ১২ সপ্তাহের এআই ফেলোশিপ ব্যাচ আগামী সপ্তাহে শুরু হচ্ছে। প্রোগ্রাম ফি ২৫,০০০ টাকা (২টি সমান কিস্তিতে পরিশোধের সুযোগ রয়েছে)। সম্পূর্ণ সিলেবাস ও ভর্তি নির্দেশিকা কি পাঠাবো?`,
        primaryLanguage: 'BN_SCRIPT',
        alternate: `Assalamualaikum ${firstName}! Amader 12-week AI Fellowship fee 25,000 BDT (2 instalments available). Apnake ki syllabus pathabo?`,
        alternateLanguage: 'BANGLISH',
        requiresPriceVerification: false,
        notes: ['Fellowship fee: 25,000 BDT with 2-instalment option.']
      };
    } else if (detectedLanguage === 'BANGLISH') {
      return {
        primary: `Assalamualaikum ${firstName} apu/vai! Amader 12-week AI Fellowship batch er admission chalche. Program fee 25,000 BDT ebong apni 2 ta instalment e pay korte parben. Apnake ki details ebong syllabus pathiye dibo?`,
        primaryLanguage: 'BANGLISH',
        alternate: `আসসালামু আলাইকুম ${firstName}! আমাদের ১২ সপ্তাহের এআই ফেলোশিপের বিস্তারিত সিলেবাস ও রেজিস্ট্রেশন নির্দেশিকা পাঠাতে পারি।`,
        alternateLanguage: 'BN_SCRIPT',
        requiresPriceVerification: false,
        notes: ['Fellowship fee: 25,000 BDT with 2-instalment option.']
      };
    } else {
      return {
        primary: `Hi ${firstName}, the BIAI AI Fellowship is an intensive 12-week program designed for both professionals and non-technical managers. Tuition is 25,000 BDT, payable in two instalments. Would you like us to send the comprehensive syllabus brochure?`,
        primaryLanguage: 'EN',
        alternate: `Assalamualaikum ${firstName}! Amader 12-week AI Fellowship er syllabus brochure ta pathiye dicchi.`,
        alternateLanguage: 'BANGLISH',
        requiresPriceVerification: false,
        notes: ['Fellowship fee: 25,000 BDT with 2-instalment option.']
      };
    }
  }

  // 8. Free Masterclass (Row #13)
  if (programIntent === 'Free Masterclass') {
    return {
      primary: `হ্যাঁ ${firstName}! অবশ্যই জয়েন করতে পারবে। আমাদের ফ্রি এআই মাস্টারক্লাসটি সবার জন্যই উন্মুক্ত এবং ক্লাস ৯-এর শিক্ষার্থীরাও সহজে বুঝতে পারবে এমনভাবেই সাজানো। তোমার জন্য ক্লাসের জুম রেজিস্ট্রেশন লিংক এখানে দেওয়া হলো: [রেজিস্ট্রেশন লিংক]`,
      primaryLanguage: 'BN_SCRIPT',
      alternate: `Hi ${firstName}! Yes, our free community AI Masterclass is completely open to school and college students. Here is your free Zoom registration link: [Registration Link]`,
      alternateLanguage: 'EN',
      requiresPriceVerification: false,
      notes: ['Free masterclass access granted.']
    };
  }

  // 9. General Course Questions (Recordings, Certificates, Student Discount)
  if (detectedLanguage === 'BANGLISH') {
    return {
      primary: `Hello ${firstName} vai! Amader shob class live online Zoom e hoy ebong shob class er lifetime recording access portal e dewa hoy. Apnake ki amader upcoming batches er details pathabo?`,
      primaryLanguage: 'BANGLISH',
      alternate: `Hello ${firstName}! All our sessions are conducted live online with lifetime recording access. Would you like to check the course brochure?`,
      alternateLanguage: 'EN',
      requiresPriceVerification: false,
      notes: ['General inquiry answered.']
    };
  }

  return {
    primary: `Hi ${firstName}, thank you for your inquiry with BIAI! We offer live interactive classes with lifetime access to session recordings and practical project mentorship. How can we assist you with our upcoming cohorts?`,
    primaryLanguage: 'EN',
    alternate: `আসসালামু আলাইকুম ${firstName}! বিআইএআই-তে যোগাযোগের জন্য ধন্যবাদ। আমাদের লাইভ ক্লাস ও রেকর্ডিং সুবিধা সম্পর্কে আরও জানতে আমাদের সাথে যুক্ত থাকুন।`,
    alternateLanguage: 'BN_SCRIPT',
    requiresPriceVerification: false,
    notes: ['General inquiry answered.']
  };
}
