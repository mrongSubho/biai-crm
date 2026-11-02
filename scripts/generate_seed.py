import json

sql = """-- ============================================================================
-- 0002_seed_knowledge_and_sample_enquiries.sql
-- Seed Workspaces, Staff Users, Ground-Truth Knowledge Base & 20 Sample Enquiries
-- ============================================================================

-- 1. Default Workspace
INSERT OR IGNORE INTO workspaces (id, name, default_timezone) 
VALUES ('ws_biai_main', 'BIAI Institute', 'Asia/Dhaka');

-- 2. Staff Users (Farhan Ahmed - Admin, Tanvir Islam - Sales Rep, Nasreen Khan - Supervisor)
INSERT OR IGNORE INTO users (id, workspace_id, email, full_name, role, password_hash, is_active)
VALUES 
  ('usr_admin_1', 'ws_biai_main', 'admin@biai.com.bd', 'Farhan Ahmed', 'ADMIN', 'argon2id_mock_hash_admin', 1),
  ('usr_rep_1', 'ws_biai_main', 'tanvir@biai.com.bd', 'Tanvir Islam', 'SALES_REP', 'argon2id_mock_hash_rep', 1),
  ('usr_sup_1', 'ws_biai_main', 'supervisor@biai.com.bd', 'Nasreen Khan', 'SUPERVISOR', 'argon2id_mock_hash_sup', 1);

-- 3. Versioned Ground-Truth Knowledge Base
INSERT OR IGNORE INTO knowledge_base (id, program_category, topic, facts_payload_json, version, is_active, published_by)
VALUES 
  ('kb_bootcamp', 'Bootcamp', '3-Day AI Bootcamp Details', '{"title":"3-Day AI Bootcamp","duration":"3 Days (Fri-Sun)","mode":"Live Online Zoom + Lifetime Recordings","price_bdt":3500,"payment_methods":["bKash","Nagad","Credit/Debit Card"],"curriculum":["Prompt Engineering","Workflow Automation with n8n","AI Coding with Cursor"],"certification":"BIAI Verified Certificate"}', 1, 1, 'usr_admin_1'),
  ('kb_fellowship', 'Fellowship', 'AI Executive Fellowship', '{"title":"AI Fellowship Program","duration":"12 Weeks","target_audience":"Professionals & Non-technical Managers","price_bdt":25000,"instalments_allowed":true,"instalment_terms":"2 instalments of 12,500 BDT","certification":"Govt-approved & Industry-recognized BIAI Executive Credential"}', 1, 1, 'usr_admin_1'),
  ('kb_corporate', 'Corporate Training', 'B2B Enterprise Upskilling', '{"title":"BIAI Corporate AI Training","min_team_size":10,"delivery_options":["Onsite at client premises","Online interactive cohort"],"group_discounts":{"10_25_seats":"15% group discount","26_50_seats":"25% group discount","50_plus_seats":"Custom enterprise quote"},"locations":["Dhaka (Motijheel, Gulshan, Mirpur)","Gazipur","Chattogram"]}', 1, 1, 'usr_admin_1'),
  ('kb_masterclass', 'Free Masterclass', 'Community Masterclass', '{"title":"BIAI Free AI Masterclass","fee_bdt":0,"eligibility":"Open to all including high school students (Class 9 and above)","mode":"Zoom Live"}', 1, 1, 'usr_admin_1'),
  ('kb_refund_policy', 'General', 'Refund & Cancellation Policy', '{"full_refund_window":"Up to 48 hours before cohort start date","post_start_refund":"Non-refundable once classes commence","processing_time":"3-5 business days via original payment method"}', 1, 1, 'usr_admin_1');
"""

# Now write out SQL statements for the 20 enquiries
enquiries_data = [
  {
    "id": 1,
    "channel": "WhatsApp",
    "received_at": "2026-10-26 09:12",
    "sender_name": "Rafi Ahmed",
    "phone": "01711000001",
    "norm_phone": "+8801711000001",
    "contact_id": "cnt_01711000001",
    "lang": "BANGLISH",
    "lang_conf": 0.98,
    "intent": "Bootcamp",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 1,
    "est_value": 3500,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-28 09:12",
    "message": "Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?",
    "reply_primary": "Walaikum Assalam Rafi vai! Amader 3-day AI Bootcamp er fee 3,500 BDT. Apni bKash, Nagad ba Card er maddhome shohojei payment korte parben. Apnake ki registration link ta pathabo?",
    "reply_alt": "আসসালামু আলাইকুম রাফি ভাই! আমাদের ৩ দিনের এআই বুটক্যাম্পের ফি ৩,৫০০ টাকা। আপনি বিকাশ, নগদ বা কার্ডের মাধ্যমে সহজে পেমেন্ট করতে পারবেন। রেজিস্ট্রেশন লিংকটি কি পাঠাবো?"
  },
  {
    "id": 2,
    "channel": "Facebook Messenger",
    "received_at": "2026-10-26 09:40",
    "sender_name": "Tahmina Akter",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_tahmina_akter",
    "lang": "BN_SCRIPT",
    "lang_conf": 1.0,
    "intent": "Fellowship",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 25000,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-28 09:40",
    "message": "ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই। কবে শুরু হবে?",
    "reply_primary": "আসসালামু আলাইকুম তাহমিনা আপু! আমাদের পরবর্তী এআই ফেলোশিপ ব্যাচের ক্লাস আগামী সপ্তাহে শুরু হচ্ছে। আপনার ফোন নম্বরটি দিলে আমাদের কাউন্সেলর আপনাকে সম্পূর্ণ সিলেবাস ও ভর্তি ফি এর বিস্তারিত জানিয়ে দেবেন।",
    "reply_alt": "Assalamualaikum Tahmina apu! Amader next AI Fellowship batch er class ashche shoptaho theke shuru hocche. Apnar phone number ta dile amader counselor apnake details janiye dibe."
  },
  {
    "id": 3,
    "channel": "Website form",
    "received_at": "2026-10-26 10:05",
    "sender_name": "Mahmud Hasan",
    "org": "Gazipur Textile Company",
    "role": "Managing Director",
    "phone": "01711000003",
    "norm_phone": "+8801711000003",
    "contact_id": "cnt_01711000003",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "Corporate Training",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 40,
    "est_value": 600000,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-28 10:05",
    "message": "I run a 40-person textile company in Gazipur. We want AI training for our team. Can someone call me this week?",
    "reply_primary": "Dear Mr. Mahmud Hasan, thank you for reaching out to BIAI. We offer tailored onsite AI training programs specifically for manufacturing and textile management. Our corporate solutions director will call you on +8801711000003 today to schedule a discovery call and discuss customized modules for your 40-member team.",
    "reply_alt": "আসসালামু আলাইকুম মাহমুদ হাসান সাহেব, বিআইএআই-তে যোগাযোগ করার জন্য ধন্যবাদ। আপনার ৪০ জনের টিমের জন্য আমরা বিশেষ অনসাইট কর্পোরেট ট্রেনিং প্রদান করতে আনন্দিত হবো।"
  },
  {
    "id": 4,
    "channel": "WhatsApp",
    "received_at": "2026-10-26 10:31",
    "sender_name": "Sabbir",
    "phone": "01711000004",
    "norm_phone": "+8801711000004",
    "contact_id": "cnt_01711000004",
    "lang": "BANGLISH",
    "lang_conf": 0.96,
    "intent": "General Course",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 3500,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-28 10:31",
    "message": "Vai class gula live hoy naki recorded? Recording pawa jay?",
    "reply_primary": "Hello Sabbir vai! Amader shob class-i Zoom e live hoy, ebong proti ti live class er por recording portal e upload kora hoy. Apni lifetime recording access paben, tai kono class miss holeo shomossha nei. Apni ki 3-day bootcamp naki 12-week fellowship e আগ্রহী?",
    "reply_alt": "হ্যালো সাব্বির ভাই! আমাদের সব ক্লাস লাইভ হয় এবং পরবর্তীতে লাইফটাইম রেকর্ডিং অ্যাক্সেস পাবেন।"
  },
  {
    "id": 5,
    "channel": "Phone call note",
    "received_at": "2026-10-26 11:02",
    "sender_name": "Nasreen Sultana",
    "phone": "01711000005",
    "norm_phone": "+8801711000005",
    "contact_id": "cnt_01711000005",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 1,
    "est_value": 3500,
    "urgency": "MEDIUM",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-28 11:02",
    "message": "Called to ask about student discount. Said she will call again tomorrow after 5 PM.",
    "reply_primary": "Hi Nasreen, we noted your inquiry regarding our 20% student scholarship discount for university students. As agreed on your call, we look forward to speaking with you tomorrow after 5:00 PM. Please have your valid student ID handy.",
    "reply_alt": "নাসরীন আপু, আপনার স্টুডেন্ট ডিসকাউন্ট সম্পর্কিত কলটি নোট করা হয়েছে। আগামীকাল বিকাল ৫টার পর কথা হবে।"
  },
  {
    "id": 6,
    "channel": "Facebook comment",
    "received_at": "2026-10-26 11:20",
    "sender_name": "Ishtiaq",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_ishtiaq",
    "lang": "BANGLISH",
    "lang_conf": 0.95,
    "intent": "Fellowship",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 25000,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-28 11:20",
    "message": "Ei course korle job pabo?",
    "reply_primary": "Ishtiaq vai, amader AI Fellowship program e real-world industry projects ebong portfolio building e direct mentorship dewa hoy, ja tech job placement er jonno khub helpful. Beshi jante amader page inbox e apnar phone number pathan, amra call korbo.",
    "reply_alt": "ইশতিয়াক ভাই, আমাদের কোর্সগুলোতে ইন্ডাস্ট্রি প্রজেক্ট ও জব পোর্টফোলিও বিল্ড করতে সহায়তা করা হয়।"
  },
  {
    "id": 7,
    "channel": "WhatsApp",
    "received_at": "2026-10-26 12:48",
    "sender_name": "Farzana Rahman",
    "phone": "01711000007",
    "norm_phone": "+8801711000007",
    "contact_id": "cnt_01711000007",
    "lang": "BN_SCRIPT",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "SUPPORT_BILLING",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 3500,
    "urgency": "HIGH",
    "sentiment": "FRUSTRATED",
    "sla_due": "2026-10-28 12:48",
    "message": "পেমেন্ট করেছি কিন্তু কোনো কনফার্মেশন পাইনি। আমার নাম ফারজানা রহমান। ২৫ তারিখে বিকাশে দিয়েছি।",
    "reply_primary": "আসসালামু আলাইকুম ফারজানা আপু! আপনার পেমেন্ট কনফার্মেশনে বিলম্ব হওয়ার জন্য আমরা আন্তরিকভাবে দুঃখিত। অনুগ্রহ করে আপনার বিকাশ ট্রানজ্যাকশন আইডি (TrxID) এবং যে নম্বর থেকে পাঠিয়েছেন তা এখানে দিন। আমাদের ফাইন্যান্স টিম এখনই ভেরিফাই করে কনফার্মেশন পাঠাচ্ছে।",
    "reply_alt": "Farzana apu, payment confirmation deri houay amra dukkhito. Apnar bKash TrxID ta ekhane share korun, amra ekhoni solve korchi."
  },
  {
    "id": 8,
    "channel": "Website form",
    "received_at": "2026-10-26 13:15",
    "sender_name": "Anika Chowdhury",
    "phone": "01711000008",
    "norm_phone": "+8801711000008",
    "contact_id": "cnt_01711000008",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 3500,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-28 13:15",
    "message": "Do you offer refunds if I cannot attend after paying?",
    "reply_primary": "Dear Anika, yes! BIAI provides a 100% full refund if you request cancellation up to 48 hours before your batch begins. Would you like to check the schedule for our upcoming cohorts?",
    "reply_alt": "আরো বিস্তারিত জানতে এবং রিফান্ড পলিসি দেখতে আমাদের ওয়েবসাইটে ভিজিট করতে পারেন।"
  },
  {
    "id": 9,
    "channel": "Facebook Messenger",
    "received_at": "2026-10-26 14:02",
    "sender_name": "Jahid",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_jahid",
    "lang": "BANGLISH",
    "lang_conf": 0.95,
    "intent": "General Course",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 3500,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-28 14:02",
    "message": "Offline class kothay hobe? Mirpur e?",
    "reply_primary": "Jahid vai, amader standard public batches gulo live online Zoom e hoy, jar karone Mirpur ba jekono jayga theke join kora jay. Tobe corporate custom workshop client office e hoy. Apnar ki online class e kono shubidha ache?",
    "reply_alt": "জাহিদ ভাই, আমাদের ক্লাসগুলো লাইভ অনলাইনে হয়। ফলে মিরপুর বা যেকোনো স্থান থেকেই অংশ নেওয়া যায়।"
  },
  {
    "id": 10,
    "channel": "WhatsApp",
    "received_at": "2026-10-26 14:30",
    "sender_name": "Kamrul Islam",
    "org": "Bank in Motijheel",
    "role": "HR",
    "phone": "01711000010",
    "norm_phone": "+8801711000010",
    "contact_id": "cnt_01711000010",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "Corporate Training",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 120,
    "est_value": 1500000,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-28 14:30",
    "message": "Hi, I'm from a bank in Motijheel. Need a quote for training 120 employees. Online or onsite both fine.",
    "reply_primary": "Dear Mr. Kamrul Islam, thank you for reaching out to BIAI. For an enterprise cohort of 120 banking personnel, we have customized AI modules covering BFSI automation, workflow productivity, and security governance. Our head of enterprise partnerships would be pleased to visit your Motijheel office or arrange a Zoom briefing this week. Could we propose a 20-minute call tomorrow at 11:00 AM?",
    "reply_alt": "আসসালামু আলাইকুম কামরুল সাহেব, আপনার ব্যাংকের ১২০ জন কর্মকর্তার জন্য এআই ট্রেনিং প্রস্তাবনা নিয়ে আমরা দ্রুত আলোচনা করতে আগ্রহী।"
  },
  {
    "id": 11,
    "channel": "Facebook comment",
    "received_at": "2026-10-26 15:10",
    "sender_name": "Earn Crypto Daily",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_earn_crypto",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "SPAM_SECURITY",
    "pipeline_stage": "New",
    "seats": 0,
    "est_value": 0,
    "urgency": "LOW",
    "sentiment": "SPAM",
    "sla_due": "2026-10-28 15:10",
    "message": "Earn 5000 USD every day with our crypto signals! Click bit.ly/xxxx now!!!",
    "reply_primary": "[QUARANTINED - PHISHING SPAM DETECTED. NO REPLY DISPATCHED]",
    "reply_alt": "[QUARANTINED - NO ACTION REQUIRED]"
  },
  {
    "id": 12,
    "channel": "WhatsApp",
    "received_at": "2026-10-27 09:05",
    "sender_name": "Rafi Ahmed",
    "phone": "01711000001",
    "norm_phone": "+8801711000001",
    "contact_id": "cnt_01711000001",
    "lang": "BANGLISH",
    "lang_conf": 0.98,
    "intent": "Bootcamp",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 1,
    "est_value": 3500,
    "urgency": "HIGH",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-29 09:05",
    "message": "Bootcamp er price ta bolen please",
    "reply_primary": "Rafi vai, antorik bhabe dukkhito deri korar jonno! Amader 3-day AI Bootcamp er fee 3,500 BDT. Class shuru hocche ashche Shukrobar theke. Apnake ki enrollment link ta pathiye dibo?",
    "reply_alt": "রাফি ভাই, দেরির জন্য আন্তরিকভাবে দুঃখিত। আমাদের ৩ দিনের বুটক্যাম্প ফি ৩,৫০০ টাকা। আপনি কি এখনই রেজিস্ট্রেশন করতে চান?"
  },
  {
    "id": 13,
    "channel": "Facebook Messenger",
    "received_at": "2026-10-27 09:44",
    "sender_name": "Mim",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_mim",
    "lang": "BN_SCRIPT",
    "lang_conf": 1.0,
    "intent": "Free Masterclass",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 0,
    "urgency": "LOW",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-29 09:44",
    "message": "আমি ক্লাস ৯-এ পড়ি। আমি কি ফ্রি মাস্টারক্লাসে জয়েন করতে পারব?",
    "reply_primary": "হ্যাঁ মীম! অবশ্যই জয়েন করতে পারবে। আমাদের ফ্রি এআই মাস্টারক্লাসটি সবার জন্যই উন্মুক্ত এবং ক্লাস ৯-এর শিক্ষার্থীরাও সহজে বুঝতে পারবে এমনভাবেই সাজানো। তোমার জন্য ক্লাসের জুম রেজিস্ট্রেশন লিংক এখানে দেওয়া হলো: [রেজিস্ট্রেশন লিংক]",
    "reply_alt": "Hey Mim! Yes, absolutely you can join our free AI masterclass. It is open for high school students too!"
  },
  {
    "id": 14,
    "channel": "Website form",
    "received_at": "2026-10-27 10:20",
    "sender_name": "Shirin Sultana",
    "role": "Marketing Manager",
    "phone": "01711000013",
    "norm_phone": "+8801711000013",
    "contact_id": "cnt_01711000013",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "Fellowship",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 1,
    "est_value": 25000,
    "urgency": "MEDIUM",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-29 10:20",
    "message": "Is the fellowship suitable for a non-technical marketing manager? I have 8 years of experience but no coding.",
    "reply_primary": "Dear Shirin, absolutely! The BIAI AI Fellowship is specifically designed for non-technical executives and marketing leaders. No programming experience is needed; you will master practical AI tools, automated content workflows, and AI decision frameworks. Would you like to review our brochure and schedule a 10-minute counselor consultation?",
    "reply_alt": "শিরীন সুলতানা আপু, এআই ফেলোশিপ প্রোগ্রামটি নন-টেকনিক্যাল প্রফেশনাল ও মার্কেটিং ম্যানেজারদের জন্যই বিশেষভাবে তৈরি।"
  },
  {
    "id": 15,
    "channel": "WhatsApp",
    "received_at": "2026-10-27 11:55",
    "sender_name": "Tanvir",
    "phone": "01711000014",
    "norm_phone": "+8801711000014",
    "contact_id": "cnt_01711000014",
    "lang": "BANGLISH",
    "lang_conf": 0.95,
    "intent": "General Course",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 3500,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-29 11:55",
    "message": "Add-on ta ki? Lifetime access mane ki?",
    "reply_primary": "Tanvir vai, lifetime access mane holo course shesh houar por-o apni recorded video, updated code prompts ebong resource library te shob shomoy access paben. Kono batch change holeo notun resources paben. Apni ki kono specific course er details jante chan?",
    "reply_alt": "তানভীর ভাই, লাইফটাইম অ্যাক্সেসের মাধ্যমে আপনি কোর্সের যাবতীয় মেটেরিয়াল ও রেকর্ডিং আজীবন দেখতে পারবেন।"
  },
  {
    "id": 16,
    "channel": "Phone call note",
    "received_at": "2026-10-27 12:30",
    "sender_name": "Habibur Rahman",
    "phone": "01711000015",
    "norm_phone": "+8801711000015",
    "contact_id": "cnt_01711000015",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "CRITICAL_ESCALATION",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 0,
    "urgency": "CRITICAL",
    "sentiment": "FRUSTRATED",
    "sla_due": "2026-10-28 12:30",
    "message": "Caller wants to cancel his enrolment and get his money back. Very upset. Said he will post about it on Facebook if not solved today.",
    "reply_primary": "[P0 LEADERSHIP DE-ESCALATION SCRIPT]: Assalamualaikum Mr. Habibur Rahman. This is Farhan from BIAI Management. I personally received your urgent cancellation request and sincerely apologize for your frustration. I have immediately instructed our finance team to expedite your full refund today. Could you please confirm your bKash or Bank details right now so we can disburse it immediately?",
    "reply_alt": "[জরুরি ব্যবস্থাপনা ফোন স্ক্রিপ্ট]: হাবিবুর রহমান সাহেবের রিফান্ড রিকোয়েস্টটি অগ্রাধিকার ভিত্তিতে সমাধান করা হচ্ছে।"
  },
  {
    "id": 17,
    "channel": "Facebook Messenger",
    "received_at": "2026-10-27 13:42",
    "sender_name": "Nowshin",
    "phone": "",
    "norm_phone": None,
    "contact_id": "cnt_nowshin",
    "lang": "BANGLISH",
    "lang_conf": 0.95,
    "intent": "Fellowship",
    "triage": "SALES_LEAD",
    "pipeline_stage": "New",
    "seats": 1,
    "est_value": 25000,
    "urgency": "MEDIUM",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-29 13:42",
    "message": "Apnader course certificate ta ki govt approved?",
    "reply_primary": "Nowshin apu, BIAI er certificate ti Bangladesh Institute of AI er verified credential ebong industry-standard curriculum onujayi provid kora hoy, ja leading tech company ebong employers gulo te highly recognized. Certificate e unique verification QR code thake. Apnar phone number ta dile amader counselor apnake demo certificate ebong syllabus dekhiye dibe.",
    "reply_alt": "নওশীন আপু, আমাদের কোর্স সার্টিফিকেটটি ইন্ডাস্ট্রি-স্বীকৃত এবং ভেরিফাইড কিউআর কোডসহ প্রদান করা হয়।"
  },
  {
    "id": 18,
    "channel": "WhatsApp",
    "received_at": "2026-10-27 14:18",
    "sender_name": "Rezaul Karim",
    "org": "Garment factory",
    "role": "Owner",
    "phone": "01711000017",
    "norm_phone": "+8801711000017",
    "contact_id": "cnt_01711000017",
    "lang": "BN_SCRIPT",
    "lang_conf": 1.0,
    "intent": "Corporate Training",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Contacted",
    "seats": 15,
    "est_value": 150000,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-29 14:18",
    "message": "আমার কোম্পানির ১৫ জন কর্মীর জন্য কি গ্রুপ ডিসকাউন্ট আছে?",
    "reply_primary": "আসসালামু আলাইকুম রেজাউল সাহেব! জ্বি হ্যাঁ, আপনার গার্মেন্টস কারখানার ১৫ জন কর্মীর টিমের জন্য আমাদের বিশেষ ১৫% গ্রুপ ডিসকাউন্ট সুবিধা রয়েছে। আমরা গার্মেন্টস অপারেশন্স ও সাপ্লাই চেইনের জন্য উপযোগী বাস্তবসম্মত এআই ট্রেনিং প্রদান করি। আপনার সুবিধাজনক সময়ে কি একটি ৫ মিনিটের ফোন কলে কথা বলা যাবে?",
    "reply_alt": "Assalamualaikum Rezaul shaheb! 15 jon employee er jonno amader 15% group discount package available ache."
  },
  {
    "id": 19,
    "channel": "WhatsApp",
    "received_at": "2026-10-27 15:09",
    "sender_name": "Samira",
    "phone": "01711000018",
    "norm_phone": "+8801711000018",
    "contact_id": "cnt_01711000018",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "Fellowship",
    "triage": "SALES_LEAD",
    "pipeline_stage": "Interested",
    "seats": 1,
    "est_value": 25000,
    "urgency": "HIGH",
    "sentiment": "POSITIVE",
    "sla_due": "2026-10-29 15:09",
    "message": "Can I pay in two instalments for the fellowship?",
    "reply_primary": "Hi Samira, yes! We offer a convenient 2-instalment payment plan for the AI Fellowship (50% at enrollment and 50% midway through week 6). Would you like me to reserve your seat and share the registration link?",
    "reply_alt": "সামিরা আপু, এআই ফেলোশিপে ২ কিস্তিতে ফি পরিশোধের সুযোগ রয়েছে। আপনি কি রেজিস্ট্রেশন লিংক চান?"
  },
  {
    "id": 20,
    "channel": "Website form",
    "received_at": "2026-10-27 16:00",
    "sender_name": "Arif Hossain",
    "phone": "01711000019",
    "norm_phone": "+8801711000019",
    "contact_id": "cnt_01711000019",
    "lang": "EN",
    "lang_conf": 1.0,
    "intent": "General Course",
    "triage": "CAREERS_HR",
    "pipeline_stage": "New",
    "seats": 0,
    "est_value": 0,
    "urgency": "LOW",
    "sentiment": "NEUTRAL",
    "sla_due": "2026-10-29 16:00",
    "message": "Looking for a job as an AI intern. Where do I apply?",
    "reply_primary": "Hi Arif, thank you for your enthusiasm about joining BIAI! Please visit our careers portal at biai.com.bd/careers or email your CV, GitHub/portfolio to hr@biai.com.bd. Our recruitment team reviews internship applications weekly.",
    "reply_alt": "আরিফ ভাই, আমাদের ক্যারিয়ার পেজ biai.com.bd/careers এ আপনার সিভি সাবমিট করতে পারেন।"
  }
]

# Track unique contacts
contacts_seen = {}
for e in enquiries_data:
    cid = e['contact_id']
    if cid not in contacts_seen:
        contacts_seen[cid] = {
            'id': cid,
            'name': e['sender_name'],
            'org': e.get('org', None),
            'role': e.get('role', None),
            'phone': e['phone'] if e['phone'] else None,
            'norm_phone': e['norm_phone'],
            'channel': e['channel'],
            'lang': e['lang'],
            'first_seen': e['received_at'],
            'last_seen': e['received_at'],
            'msg_count': 1
        }
    else:
        # Repeat sender! (e.g. Rafi Ahmed #1 and #12)
        contacts_seen[cid]['last_seen'] = e['received_at']
        contacts_seen[cid]['msg_count'] += 1

sql += "\n-- 4. Canonical Contacts (Deduplicated)\n"
for c in contacts_seen.values():
    org_val = f"'{c['org']}'" if c['org'] else "NULL"
    role_val = f"'{c['role']}'" if c['role'] else "NULL"
    ph_val = f"'{c['phone']}'" if c['phone'] else "NULL"
    norm_val = f"'{c['norm_phone']}'" if c['norm_phone'] else "NULL"
    sql += f"""INSERT OR IGNORE INTO contacts (id, workspace_id, name, organization, role, primary_phone, normalized_phone, primary_channel, preferred_language, total_messages, first_seen_at, last_seen_at)
VALUES ('{c['id']}', 'ws_biai_main', '{c['name']}', {org_val}, {role_val}, {ph_val}, {norm_val}, '{c['channel']}', '{c['lang']}', {c['msg_count']}, '{c['first_seen']}', '{c['last_seen']}');
"""

sql += "\n-- 5. Conversations, Messages, Opportunities & Operational Tickets\n"
for e in enquiries_data:
    conv_id = f"conv_{e['id']}"
    msg_id = f"msg_{e['id']}"
    opp_id = f"opp_{e['id']}"
    tkt_id = f"tkt_{e['id']}"
    ai_id = f"ai_{e['id']}"
    
    # 1. Conversation
    sql += f"""INSERT OR IGNORE INTO conversations (id, workspace_id, contact_id, channel, status, assigned_user_id, created_at, updated_at)
VALUES ('{conv_id}', 'ws_biai_main', '{e['contact_id']}', '{e['channel']}', 'ACTIVE', 'usr_rep_1', '{e['received_at']}', '{e['received_at']}');
"""

    # 2. Inbound Message
    escaped_msg = e['message'].replace("'", "''")
    ph_raw = f"'{e['phone']}'" if e['phone'] else "NULL"
    sql += f"""INSERT OR IGNORE INTO messages (id, conversation_id, direction, channel, external_message_id, sender_raw, phone_raw, content, detected_language, language_confidence, received_at, delivery_status)
VALUES ('{msg_id}', '{conv_id}', 'INBOUND', '{e['channel']}', 'ext_{e['id']}', '{e['sender_name']}', {ph_raw}, '{escaped_msg}', '{e['lang']}', {e['lang_conf']}, '{e['received_at']}', 'DELIVERED');
"""

    # 3. FTS5 indexing
    sql += f"""INSERT INTO fts_messages (message_id, sender_raw, content) VALUES ('{msg_id}', '{e['sender_name']}', '{escaped_msg}');\n"""

    # 4. Route to Opportunity OR Operational Ticket
    if e['triage'] == 'SALES_LEAD':
        sql += f"""INSERT OR IGNORE INTO opportunities (id, workspace_id, contact_id, source_message_id, program_intent, pipeline_stage, estimated_seats, estimated_value_bdt, sla_status, sla_due_at, assigned_user_id)
VALUES ('{opp_id}', 'ws_biai_main', '{e['contact_id']}', '{msg_id}', '{e['intent']}', '{e['pipeline_stage']}', {e['seats']}, {e['est_value']}, 'IN_SLA', '{e['sla_due']}', 'usr_rep_1');
"""
    else:
        # Non-sales ticket
        status = 'QUARANTINED' if e['triage'] == 'SPAM_SECURITY' else ('RESOLVED' if e['triage'] == 'CAREERS_HR' else 'OPEN')
        sql += f"""INSERT OR IGNORE INTO operational_tickets (id, workspace_id, contact_id, source_message_id, queue_category, ticket_status, urgency_level, sentiment, sla_status, sla_due_at)
VALUES ('{tkt_id}', 'ws_biai_main', '{e['contact_id']}', '{msg_id}', '{e['triage']}', '{status}', '{e['urgency']}', '{e['sentiment']}', 'IN_SLA', '{e['sla_due']}');
"""

    # 5. AI Extraction Record
    provenance = {
        "intent": {"value": e['intent'], "confidence": 0.95, "source": "llm"},
        "triage": {"value": e['triage'], "confidence": 0.98, "source": "rule+llm"},
        "urgency": {"value": e['urgency'], "confidence": 0.90, "source": "llm"},
        "language": {"value": e['lang'], "confidence": e['lang_conf'], "source": "script_detector"}
    }
    extracted_json = json.dumps(provenance).replace("'", "''")
    reply_payload = json.dumps({
        "primary": e['reply_primary'],
        "alt": e['reply_alt']
    }).replace("'", "''")

    sql += f"""INSERT OR IGNORE INTO ai_extractions (id, message_id, model_provider, model_version, prompt_version, overall_confidence, raw_response_json, extracted_fields_json, validation_status, human_reviewed)
VALUES ('{ai_id}', '{msg_id}', 'hybrid-workers-ai', 'llama-3.3-70b', 'v2.1', 0.96, '{reply_payload}', '{extracted_json}', 'PASSED', 1);\n"""

with open('/Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0002_seed_knowledge_and_sample_enquiries.sql', 'w') as f:
    f.write(sql)

print('Successfully generated 0002_seed_knowledge_and_sample_enquiries.sql')
