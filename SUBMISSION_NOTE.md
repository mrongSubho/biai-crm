# BIAI AI Intern Assessment — Submission Note (Task 1: BIAI CRM)

**Candidate:** Subho Mrong  
**Submission Date:** 4 November 2026  
**Live Demo (Cloudflare Edge):** `https://biaicrm.mrong.tech`  
**Corporate Pipeline Workspace:** `https://biaileads.mrong.tech`  
**Code Repository:** `https://github.com/mrongSubho/biai-crm`  
**Test Suite:** Vitest 3.2.7 — **48 / 48 Tests Passing (100%)**  
**Loom Walkthrough (4 min 30s):** `[Loom Video URL]`

---

### 1. What I Built
I engineered a production-grade, edge-native **Omnichannel CRM & AI Triage Engine** deployed on **Cloudflare Workers (Hono v4) + Cloudflare D1 (Distributed SQLite) + Svelte 5 (Runes)**. Unlike client-heavy React prototypes that suffer from high latency and cold starts in Bangladesh, this system runs directly on Cloudflare’s Dhaka edge PoP with $<50\text{ ms}$ response times.

**Core Capabilities:**
- **Omnichannel Ingestion & Normalization:** Ingests messages across WhatsApp, Facebook Messenger, Website forms, Facebook comments, and Phone call notes. Formats all Bangladesh phone numbers into canonical E.164 (`+8801XXXXXXXXX`).
- **Entity Resolution & Threading:** Automatically links repeat messages to existing customer profiles. For example, Row `#1` and Row `#12` from **Rafi Ahmed (`01711000001`)** are threaded together into a single contact history, elevating his priority as a **Repeat Chaser (2x Unanswered)**.
- **5-Tier Operational Triage:** Decouples active revenue leads from operational noise:
  - `SALES_LEAD`: 16 enquiries mapped into an interactive 5-stage pipeline (`New` $\rightarrow$ `Contacted` $\rightarrow$ `Interested` $\rightarrow$ `Paid` / `Lost`).
  - `CRITICAL_ESCALATION`: Flags Row `#16` (Habibur Rahman refund threat / public review risk) with a P0 PR-Risk banner and leadership de-escalation workflow.
  - `SUPPORT_BILLING`: Routes Row `#7` (Farzana Rahman unconfirmed bKash payment) to finance statement reconciliation.
  - `CAREERS_HR`: Routes Row `#20` (Arif Hossain intern inquiry) to HR careers automation.
  - `SPAM_SECURITY`: Quarantines Row `#11` (crypto phishing) with zero sales rep interruption.
- **Conversation Stream & Multi-Turn History:** Full chronological dialogue stream rendering customer inquiries and outbound admissions agent replies, complete with follow-up simulation, double-send prevention, and private operator scratchpads (`+ Note`).
- **4 Tone Presets & 3 Dialect Switchers:** Dynamically drafts grounded suggested replies across 4 tones (`Professional`, `Friendly`, `Direct`, `Executive`) in 3 dialects (`বাংলা`, `Banglish`, `EN`), embedded directly in both the Lead Inspector and the Ingest Inbound Inquiry Modal.
- **48-Hour SLA Monitor:** Real-time countdown tracking with automated `IN_SLA`, `AT_RISK` ($<12\text{h}$), and `BREACHED` states (e.g. `1h 55m overdue`), accompanied by interactive evaluation time scrubbing.
- **Weekly Executive AI Digest Center Stage:** Dedicated Saturday 00:00 to Friday 23:59 Asia/Dhaka business week executive report with channel distribution, active revenue pipeline (৳3,170,000 BDT), corporate seat demand (175 seats), and missing phone data leakage ratios.
- **Account Control & Session Security Plane:** Hierarchical 4-tier RBAC (`TIER_0` to `TIER_3`), CSRF double-submit token protection on session revocation, real-time client machine platform detection (replacing static proxy names), and real-time CRM operational activity logging.

---

### 2. Which AI Tools I Used and How
- **Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct`):** Used at the edge for zero-latency structured entity extraction and tone-matched reply generation.
- **Google Gemini 2.5 Flash:** Cloud LLM fallback for deep semantic extraction and corporate deal classification.
- **Deterministic Pre-Parser & Lexicon Engine:** Built custom regular expressions and a 40-token Banglish morphological lexicon to ensure $100\%$ uptime and sub-5ms triage even during external network outages.
- **Antigravity AI Pair Programmer:** Used for systems architecture planning, rapid schema migrations, and test fixture authoring.

---

### 3. What Does Not Work Yet (Current Limitations)
- **Direct Meta Webhook Credentials:** In the demo environment, inbound Meta webhooks run in authenticated simulation mode and outbound WhatsApp messages dispatch via `wa.me` deep-links because production Meta Business Verification and WhatsApp Cloud API credentials are tied to BIAI's corporate account.
- **Voice Note Audio Transcription:** Phone notes are currently logged as text; direct audio voice note ingestion via Whisper is not yet connected.

---

### 4. What I Would Fix / Build Next
1. **Meta Cloud API Webhook Integration:** Connect BIAI’s live WABA (WhatsApp Business Account) for automated 2-way message synchronization and Meta 24-hour service window template automation.
2. **bKash / Nagad Merchant Webhook Auto-Reconciliation:** Connect payment gateway IPN (Instant Payment Notification) to automatically match customer TrxIDs with pending admissions (`#7`) and auto-transition stage to `Paid`.
3. **Voice Note Whisper Ingestion:** Integrate edge Whisper transcription for frontline sales reps logging voice notes on the move.
