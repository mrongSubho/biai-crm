import type { Language, ProgramIntent, TriageCategory } from '../types/crm.ts';

export type TonePreset = 'Professional' | 'Friendly' | 'Direct' | 'Executive';

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
  bangla: string;
  banglish: string;
  english: string;
  requiresPriceVerification: boolean;
  notes: string[];
}

export function getTriDialectReplies(ctx: ReplyGenerationContext, tone: TonePreset = 'Professional'): {
  bn: string;
  banglish: string;
  en: string;
} {
  const { senderName, programIntent, triageCategory, seats = 1 } = ctx;
  const firstName = senderName.split(' ')[0] || 'Sir/Madam';

  // 1. Quarantined Phishing / Spam
  if (triageCategory === 'SPAM_SECURITY') {
    return {
      bn: '[কোয়ারেন্টিন্ড - ফিশিং স্প্যাম শনাক্ত হয়েছে। কোনো আউটবাউন্ড মেসেজ পাঠানো হবে না]',
      banglish: '[QUARANTINED - PHISHING SPAM DETECTED. NO REPLY DISPATCHED]',
      en: '[QUARANTINED - PHISHING SPAM DETECTED. NO REPLY DISPATCHED]'
    };
  }

  // 2. Critical Escalation / Refund Threat (Row #16 Habibur Rahman)
  if (triageCategory === 'CRITICAL_ESCALATION') {
    return {
      bn: `আসসালামু আলাইকুম ${senderName} সাহেব। আমি বিআইএআই ম্যানেজমেন্ট থেকে বলছি। আপনার রিফান্ড রিকোয়েস্টটি আমরা সর্বোচ্চ অগ্রাধিকার দিয়ে আজকেই প্রসেস করছি। আপনার বিকাশ বা ব্যাংক অ্যাকাউন্ট নম্বরটি কনফার্ম করলে এখনই পাঠিয়ে দিচ্ছি।`,
      banglish: `Assalamualaikum ${senderName} saheb. Ami BIAI Management theke Farhan bolchi. Apnar refund request ti shorbochcho priority diye amra ajkei process korchi. Apnar bKash ba bank account number ta ekhane confirm korle ekhoni disburse kore dicchi.`,
      en: `Assalamualaikum Mr. ${senderName}. This is Farhan from BIAI Management. I personally received your urgent cancellation request and sincerely apologize for your frustration. I have immediately instructed our finance team to expedite your full refund today. Could you please confirm your bKash or Bank details right now so we can disburse it immediately?`
    };
  }

  // 3. Billing & Payment Support (Row #7 Farzana Rahman)
  if (triageCategory === 'SUPPORT_BILLING') {
    if (tone === 'Direct') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName}! আপনার বিকাশ/নগদ TrxID এবং প্রেরক নম্বরটি এখানে দিন, ফাইন্যান্স টিম এখনই ভেরিফাই করে কনফার্ম করছে।`,
        banglish: `Walaikum Assalam ${firstName}! Apnar bKash TrxID ebong sender number ta din, finance team ekhoni verify korche.`,
        en: `Hello ${firstName}, please provide your bKash TrxID and sender mobile number. Our finance team will verify it immediately.`
      };
    }
    return {
      bn: `আসসালামু আলাইকুম ${firstName} আপু/ভাই! আপনার পেমেন্ট কনফার্মেশনে বিলম্ব হওয়ার জন্য আমরা আন্তরিকভাবে দুঃখিত। অনুগ্রহ করে আপনার বিকাশ/নগদ ট্রানজ্যাকশন আইডি (TrxID) এবং যে নম্বর থেকে টাকা পাঠিয়েছেন তা এখানে দিন। আমাদের ফাইন্যান্স টিম এখনই ভেরিফাই করে আপনার ইনরোলমেন্ট নিশ্চিত করে দিচ্ছে।`,
      banglish: `Walaikum Assalam ${firstName}! Payment confirmation deri houay amra antorik bhabe dukkhito. Apnar bKash TrxID ebong sender number ta ekhane share korun, amader team ekhoni verify kore confirm korche.`,
      en: `Hello ${firstName}, we sincerely apologize for the delay in confirming your payment. Please provide your bKash/Nagad Transaction ID (TrxID) and sender mobile number. Our finance team will expedite verification immediately.`
    };
  }

  // 4. Careers / Intern Inquiry (Row #20 Arif Hossain)
  if (triageCategory === 'CAREERS_HR') {
    return {
      bn: `হ্যালো ${firstName}! বিআইএআই-তে ক্যারিয়ারের আগ্রহের জন্য ধন্যবাদ। অনুগ্রহ করে আপনার সিভি ও পোর্টফোলিও hr@biai.com.bd এ ইমেইল করুন অথবা আমাদের ওয়েবসাইট biai.com.bd/careers এ সাবমিট করুন।`,
      banglish: `Hello ${firstName}! BIAI te internship e interest er jonno dhonnobad. Apnar CV ebong portfolio hr@biai.com.bd e mail korun ba biai.com.bd/careers e apply korun.`,
      en: `Hi ${firstName}, thank you for your enthusiasm about joining BIAI! Please visit our careers portal at biai.com.bd/careers or email your CV, GitHub, and portfolio directly to hr@biai.com.bd.`
    };
  }

  // 5. Corporate B2B Training (Rows #3, #10, #18)
  if (programIntent === 'Corporate Training') {
    if (tone === 'Direct') {
      return {
        bn: `আসসালামু আলাইকুম ${senderName} সাহেব। ${seats} জনের টিমের জন্য আমাদের বিশেষ করপোরেট অফার রয়েছে। এ সপ্তাহে কি একটি ১৫ মিনিটের কলে বসতে পারি?`,
        banglish: `Assalamualaikum ${senderName} saheb. ${seats} jon team er jonno amader corporate package ache. Ei week e 15 min call e boste pari?`,
        en: `Dear Mr. ${senderName}, for your ${seats}-member team, we offer customized corporate training. Can we schedule a quick 15-minute briefing this week?`
      };
    }
    return {
      bn: `আসসালামু আলাইকুম ${senderName} সাহেব! আপনার প্রতিষ্ঠানের ${seats} জন কর্মীর টিমের জন্য আমাদের বিশেষ গ্রুপ ডিসকাউন্ট সুবিধা রয়েছে। আমরা ইন্ডাস্ট্রি-উপযোগী বাস্তবসম্মত এআই ট্রেনিং ও ওয়ার্কশপ প্রদান করি। আপনার সুবিধাজনক সময়ে কি আগামী সপ্তাহে একটি ১৫ মিনিটের ডিসকভারি মিটিং করা যাবে?`,
      banglish: `Assalamualaikum ${senderName} saheb! Apnar protishthaner ${seats} jon kormir team er jonno amader vishesh group discount ache. Amra industry-oriented practical AI training provide kori. Convenient time e ki 15-min discovery call kora jabe?`,
      en: `Dear Mr. ${senderName}, thank you for reaching out to BIAI. For an enterprise cohort of ${seats} team members, we offer specialized hands-on AI curriculum tailored to your industry workflows. Could we arrange a 15-minute briefing call or office visit this week?`
    };
  }

  // 6. 3-Day Bootcamp (Rows #1, #12)
  if (programIntent === 'Bootcamp') {
    if (tone === 'Friendly') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName} ভাই! 😊 আমাদের ৩ দিনের এআই বুটক্যাম্পের ফি ৩,৫০০ টাকা। আপনি বিকাশ, নগদ বা কার্ডে সহজে পেমেন্ট করতে পারবেন। ক্লাস শুরু হচ্ছে আগামী শুক্রবার থেকে। আপনার জন্য রেজিস্ট্রেশন লিংকটি পাঠিয়ে দেব কি?`,
        banglish: `Walaikum Assalam ${firstName} vai! 😊 Amader 3-day AI Bootcamp er fee 3,500 BDT. Apni bKash, Nagad ba Card er maddhome shohojei payment korte parben. Shukrobar theke start hocche. Registration link ta pathabo vai?`,
        en: `Hey ${firstName}! 😊 Our 3-Day AI Bootcamp tuition is 3,500 BDT. You can pay conveniently via bKash, Nagad, or Card. Classes start this Friday! Shall I send you the direct registration link?`
      };
    }
    if (tone === 'Direct') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName} ভাই। বুটক্যাম্প ফি ৩,৫০০ টাকা (৩ দিন লাইভ জুম + লাইফটাইম রেকর্ডিং)। রেজিস্ট্রেশন লিংক পাঠাবো কি?`,
        banglish: `Walaikum Assalam ${firstName} vai. Bootcamp fee 3,500 BDT (3-day live Zoom + lifetime recordings). Registration link pathabo ki?`,
        en: `Hi ${firstName}, Bootcamp fee is 3,500 BDT (3 days live on Zoom with lifetime recordings). Would you like the registration link?`
      };
    }
    if (tone === 'Executive') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName} সাহেব। বিআইএআই-এর ৩ দিনের প্র্যাক্টিক্যাল এআই বুটক্যাম্পটির এনরোলমেন্ট ফি ৩,৫০০ টাকা। এতে প্র্যাক্টিক্যাল কোডিং ও লাইভ প্রজেক্ট সেশন অন্তর্ভুক্ত। বিস্তারিত ব্রোশিওর ও রেজিস্ট্রেশন লিংক প্রদান করতে পারি।`,
        banglish: `Assalamualaikum ${firstName} saheb. BIAI 3-day Practical AI Bootcamp er enrollment fee 3,500 BDT. Practical coding ebong live project included. Syllabus brochure ebong registration link provide korte pari.`,
        en: `Dear ${senderName}, the BIAI 3-Day Applied AI Bootcamp tuition is 3,500 BDT, covering hands-on executive implementation and modern LLM workflows. May I provide the detailed syllabus and registration link?`
      };
    }
    // Professional default
    return {
      bn: `আসসালামু আলাইকুম ${firstName} ভাই! আমাদের ৩ দিনের প্র্যাক্টিক্যাল এআই বুটক্যাম্পের ফি ৩,৫০০ টাকা। আপনি বিকাশ, নগদ বা কার্ডের মাধ্যমে সহজে পেমেন্ট করতে পারবেন। ক্লাস শুরু হচ্ছে আগামী শুক্রবার থেকে। রেজিস্ট্রেশন লিংকটি কি পাঠাবো?`,
      banglish: `Walaikum Assalam ${firstName} vai! Amader 3-day AI Bootcamp er fee 3,500 BDT. Apni bKash, Nagad ba Card er maddhome shohojei payment korte parben. Class shuru hocche ashche Shukrobar theke. Apnake ki registration link ta pathabo?`,
      en: `Hi ${firstName}, our 3-Day AI Bootcamp tuition is 3,500 BDT. It includes live interactive weekend sessions and lifetime portal access to all recordings. Would you like me to send the registration link?`
    };
  }

  // 7. AI Fellowship (Rows #2, #14, #19)
  if (programIntent === 'Fellowship') {
    if (tone === 'Friendly') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName} আপু/ভাই! 😊 আমাদের ১২ সপ্তাহের ফ্ল্যাগশিপ এআই ফেলোশিপ ব্যাচের অ্যাডমিশন চলছে। কোর্স ফি ২৫,০০০ টাকা (২ কিস্তিতে দেওয়া যাবে)। সম্পূর্ণ সিলেবাস আর ডিটেইলস পাঠিয়ে দিচ্ছি?`,
        banglish: `Assalamualaikum ${firstName} apu/vai! 😊 Amader 12-week flagship AI Fellowship er admission chalche. Fee 25,000 BDT (2 instalments available). Apnake ki details ebong syllabus pathiye dibo?`,
        en: `Hey ${firstName}! 😊 Admissions are open for our 12-week AI Fellowship. Tuition is 25,000 BDT (payable in 2 equal instalments). Shall I share the full curriculum brochure with you?`
      };
    }
    if (tone === 'Direct') {
      return {
        bn: `আসসালামু আলাইকুম ${firstName}। ফেলোশিপ ফি ২৫,০০০ টাকা (২ কিস্তিতে পরিশোধযোগ্য)। ক্লাস শুরু আগামী সপ্তাহে। সিলেবাস লিংক পাঠাবো কি?`,
        banglish: `Assalamualaikum ${firstName}. Fellowship fee 25,000 BDT (2 instalments). Next week shuru. Syllabus link pathabo ki?`,
        en: `Hi ${firstName}, Fellowship tuition is 25,000 BDT (payable in 2 installments). Classes start next week. Would you like the syllabus link?`
      };
    }
    // Professional default
    return {
      bn: `আসসালামু আলাইকুম ${firstName} আপু/ভাই! আমাদের পরবর্তী ১২ সপ্তাহের এআই ফেলোশিপ ব্যাচ আগামী সপ্তাহে শুরু হচ্ছে। প্রোগ্রাম ফি ২৫,০০০ টাকা (২টি সমান কিস্তিতে পরিশোধের সুযোগ রয়েছে)। সম্পূর্ণ সিলেবাস ও ভর্তি নির্দেশিকা কি পাঠাবো?`,
      banglish: `Assalamualaikum ${firstName} apu/vai! Amader 12-week AI Fellowship batch er admission chalche. Program fee 25,000 BDT ebong apni 2 ta instalment e pay korte parben. Apnake ki details ebong syllabus pathiye dibo?`,
      en: `Hi ${firstName}, the BIAI AI Fellowship is an intensive 12-week program designed for both professionals and non-technical managers. Tuition is 25,000 BDT, payable in two instalments. Would you like us to send the comprehensive syllabus brochure?`
    };
  }

  // 8. Free Masterclass (Row #13)
  if (programIntent === 'Free Masterclass') {
    return {
      bn: `হ্যাঁ ${firstName}! অবশ্যই জয়েন করতে পারবে। আমাদের ফ্রি এআই মাস্টারক্লাসটি সবার জন্যই উন্মুক্ত এবং ক্লাস ৯-এর শিক্ষার্থীরাও সহজে বুঝতে পারবে এমনভাবেই সাজানো। তোমার জন্য ক্লাসের জুম রেজিস্ট্রেশন লিংক এখানে দেওয়া হলো: https://biai.com.bd/masterclass/free-pass`,
      banglish: `Hello ${firstName}! Amader free community AI Masterclass shobar jonno open ebong class 9 er students rao easily bujhte parbe. Free Zoom join link: https://biai.com.bd/masterclass/free-pass`,
      en: `Hi ${firstName}! Yes, our free community AI Masterclass is completely open to school and college students. Here is your free Zoom registration link: https://biai.com.bd/masterclass/free-pass`
    };
  }

  // 9. General Course Questions (Default)
  return {
    bn: `আসসালামু আলাইকুম ${firstName}! বিআইএআই-তে যোগাযোগের জন্য ধন্যবাদ। আমাদের সব ক্লাস লাইভ অনলাইনে পরিচালিত হয় এবং পোর্টাল থেকে লাইফটাইম রেকর্ডিং সুবিধা দেওয়া হয়। আমাদের আসন্ন ব্যাচগুলো সম্পর্কে বিস্তারিত জানাতে পারি কি?`,
    banglish: `Hello ${firstName} vai! Amader shob class live online Zoom e hoy ebong shob class er lifetime recording access portal e dewa hoy. Apnake ki amader upcoming batches er details pathabo?`,
    en: `Hi ${firstName}, thank you for your inquiry with BIAI! We offer live interactive classes with lifetime access to session recordings and practical project mentorship. How can we assist you with our upcoming cohorts?`
  };
}

export function generateSuggestedReplies(ctx: ReplyGenerationContext): GeneratedReplyPair {
  const tri = getTriDialectReplies(ctx, 'Professional');
  const { detectedLanguage } = ctx;

  let primary = tri.banglish;
  let primaryLanguage: Language = 'BANGLISH';
  let alternate = tri.bn;
  let alternateLanguage: Language = 'BN_SCRIPT';

  if (detectedLanguage === 'BN_SCRIPT') {
    primary = tri.bn;
    primaryLanguage = 'BN_SCRIPT';
    alternate = tri.banglish;
    alternateLanguage = 'BANGLISH';
  } else if (detectedLanguage === 'EN') {
    primary = tri.en;
    primaryLanguage = 'EN';
    alternate = tri.bn;
    alternateLanguage = 'BN_SCRIPT';
  }

  return {
    primary,
    primaryLanguage,
    alternate,
    alternateLanguage,
    bangla: tri.bn,
    banglish: tri.banglish,
    english: tri.en,
    requiresPriceVerification: false,
    notes: [`Generated tri-dialect replies (bn, banglish, en) for ${ctx.programIntent}`]
  };
}

