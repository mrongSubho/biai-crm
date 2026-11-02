# Loom Video Presentation Guide & Script (Task 1: BIAI CRM)

> **Target Duration:** 4 Minutes 30 Seconds (Strictly $\le 5$ minutes per BIAI guidelines)  
> **Camera / Audio:** Show your screen with a webcam bubble in the corner. Speak with calm confidence, clear pacing, and focus on *why* this solves BIAI's real daily admissions problems.

---

## Timing & Screen Flow Breakdown

```
00:00 - 00:45 │ The Problem & Why Most CRM Demos Fail
00:45 - 01:45 │ Live Walkthrough on Sample Data: Pipeline, Ingestion & Entity Resolution
01:45 - 02:45 │ Bengali & Banglish Dialect Matching & 48h SLA Engine
02:45 - 03:45 │ 5-Tier Operational Triage (Spam, Refund Escalation, Billing, Careers)
03:45 - 04:30 │ Executive Weekly AI Digest & Cloudflare Edge Architecture Pitch
```

---

## Word-For-Word Talking Script

### Part 1: The Problem & Systems Architecture (00:00 – 00:45)
*(Screen: Show the live BIAI CRM app dashboard on Cloudflare Pages)*

> "Hi BIAI team, my name is Subho Mrong. Today I'm excited to present the **BIAI Omnichannel CRM & AI Triage Engine**.
> 
> BIAI receives dozens of enquiries every day from WhatsApp, Facebook, website forms, and phone calls. The real problem isn't just saving messages—it's that:
> 1. Leads write in a mix of **Bangla Unicode, Romanized Banglish, and English**.
> 2. Reps waste hours answering spam and support queries instead of chasing high-value deals.
> 3. And without clear SLA tracking, follow-ups slip past the 48-hour mark.
> 
> Most candidates build heavy React prototypes that take 2 seconds to load on mobile networks. I took a production systems approach: this app is built on **Cloudflare Workers, Hono v4, Cloudflare D1 distributed SQLite, and Svelte 5**. It runs directly on Cloudflare's Dhaka edge node with sub-50ms latency."

---

### Part 2: Ingestion & Entity Resolution on Sample Data (00:45 – 01:45)
*(Screen: Click into the 5-Stage Pipeline board)*

> "Let's look at the sample data in action. We ingested all 20 enquiries provided in the assessment pack.
> 
> Notice how the system performs **Entity Resolution**:
> Look at **Rafi Ahmed** (`01711000001`). He messaged on October 26 asking for the Bootcamp price, and then messaged again on October 27. Instead of creating two fragmented leads, our engine normalized his phone number to Bangladesh E.164 (`+8801711000001`), recognized him as the same customer, threaded his history, and flagged him with this **'2x Chaser'** badge to alert the sales team.
> 
> Look at the corporate leads: **Kamrul Islam** from a bank in Motijheel. The parser didn't just extract his name; it parsed his role as HR, extracted **120 employees**, and calculated an estimated deal value of **1.5 Million BDT**."

---

### Part 3: Bangla, Banglish & Dialect-Matched Replies (01:45 – 02:45)
*(Screen: Click "+ AI Message Parser Studio", select the Banglish Bootcamp preset #1, then click Run AI Extraction)*

> "Now let's see how our hybrid AI engine handles language. This is where 90% of generic AI tools fail.
> 
> Here is Rafi's raw Banglish message: *'Assalamualaikum, apnader 3 day bootcamp er price koto? Payment kibhabe korbo?'*
> 
> In less than 5 milliseconds, our edge detector classifies the language as **Banglish** with 98% confidence. And look at the suggested reply:
> It replies in natural, polite Banglish: *'Walaikum Assalam Rafi vai! Amader 3-day AI Bootcamp er fee 3,500 BDT. Apni bKash, Nagad ba Card er maddhome shohojei payment korte parben...'*
> 
> If the customer writes in Bengali script, like **Tahmina Akter** (*'ফেলোশিপ প্রোগ্রামে ভর্তি হতে চাই'*), the AI responds in formal, respectful Bangla. And notice: it grounds all replies in BIAI's actual course catalog—never inventing hallucinated fees. 
> With one click on **'Send via WhatsApp'**, it opens a direct `wa.me` deep link with the pre-filled reply and updates the lead stage to 'Contacted'."

---

### Part 4: 5-Tier Operational Triage & 48h SLA Engine (02:45 – 03:45)
*(Screen: Switch tabs between Sales Pipeline, P0 Escalations, and Billing)*

> "A real CRM must protect reps from operational noise. That's why we separated the Sales Pipeline from Operational Queues:
> 
> 1. **P0 Critical Escalation:** Look at **Habibur Rahman** (#16). He called demanding an immediate refund and threatened to post on Facebook. In a normal spreadsheet, this sits unnoticed. Our triage flagged him as **P0 PR Risk**, accelerated his SLA, and generated a dedicated leadership de-escalation call script.
> 2. **Billing Verification:** **Farzana Rahman** (#7) paid via bKash on October 25 but got no confirmation. Routed directly to finance for statement reconciliation.
> 3. **Spam & Careers:** Crypto scam (#11) is quarantined with zero outbound access, and intern applicant Arif (#20) receives an automated careers portal reply without cluttering revenue metrics.
> 
> Look at the **SLA Clock** at the top. I can simulate time forward from October 26 to October 28. Notice how the badges change in real time: from green `IN_SLA`, to amber `At Risk` under 12 hours, to red `Overdue` if unanswered."

---

### Part 5: Executive Weekly AI Digest & Close (03:45 – 04:30)
*(Screen: Click "Weekly AI Digest" modal, then show the clean metric summary)*

> "Finally, for leadership, we built the **Weekly Executive AI Digest**. In one click, management sees:
> - Channel breakdown: 8 WhatsApp, 4 Messenger, 4 Website, 2 Calls, 2 Comments.
> - Active Pipeline: **3.17 Million BDT** across 16 qualified leads.
> - Enterprise Demand: **175 corporate seats** requested across 3 companies.
> - And a crucial operational insight: **30% of leads arrived without phone numbers**—specifically, 100% of Facebook Messenger leads lacked phone capture. The AI explicitly recommends deploying an automated Messenger phone prompt to plug that revenue leak.
> 
> This is a production-deployable system: tested on BIAI's exact sample data, running at the edge on Cloudflare, and ready for your team to use. 
> 
> Thank you, and I look forward to our 20-minute live call!"

---

## Pre-Recording Checklist

- [ ] Open the app URL in Chrome or Brave.
- [ ] Set browser zoom to 100% or 110% for crisp readability.
- [ ] Ensure webcam and microphone inputs are selected in Loom.
- [ ] Rehearse clicking: **Board $\rightarrow$ Preset #1 in Studio $\rightarrow$ P0 Escalations $\rightarrow$ SLA Clock $\rightarrow$ Weekly Digest**.
- [ ] Keep Loom timer in view to wrap up right around **4 minutes 15 seconds**!
