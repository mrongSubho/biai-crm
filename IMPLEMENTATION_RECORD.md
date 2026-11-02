# BIAI Omnichannel Edge CRM & Triage Engine — Implementation Record
**Application:** Task 1 — Omnichannel CRM & Inbound Triage Engine  
**Target Environment:** Cloudflare Workers (Edge V8 Isolate) + Cloudflare D1 Database  
**Live Production URL:** [https://biaicrm.mrong.tech](https://biaicrm.mrong.tech)  
**Primary GitHub Repository:** [https://github.com/mrongSubho/biai-crm.git](https://github.com/mrongSubho/biai-crm.git)  
**Specification Document:** [`PLAN_TASK1_BIAI_CRM.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/PLAN_TASK1_BIAI_CRM.md) & [`UI_UX_FIRST_CLASS_PLAN.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/UI_UX_FIRST_CLASS_PLAN.md)  
**Status:** 100% Implemented, Reconciled, Verified & Deployed Live  
**Date:** November 2026

---

## 1. Executive Summary & Production Deliverables

The **BIAI Omnichannel Edge CRM** is an operational triage console built specifically for the admissions, sales, and student-support operations of the **Bangladesh Institute of AI (BIAI)**. It processes unformatted inbound customer communications across WhatsApp, Facebook Messenger, Website Forms, Phone Call Notes, and Social Comments.

The system replaces rigid, cramped multi-column Kanban boards with a **Linear/Stripe-grade 3-pane desktop workspace** optimized for rapid ticket scanning, dialect-matched communication, and strict 48-hour SLA compliance during Dhaka business hours.

### Verified Production Artifacts

| Component | Identifier / Location | Status |
| :--- | :--- | :--- |
| **Custom Domain** | `https://biaicrm.mrong.tech` | **Live (HTTP/2 200, Edge SSL active)** |
| **Worker Subdomain** | `https://biai-crm.ludobase.workers.dev` | **Live (Worker Version: `45b90fcb-f0f8-431d-bcd8-a5269d583de9`)** |
| **Cloudflare D1 Database** | `biai-crm-db` (`7c038dce-7ae2-48bb-9efa-5439cdc373a8`) | **APAC Region, Migrated & Seeded** |
| **GitHub Repository** | `https://github.com/mrongSubho/biai-crm.git` | **Synchronized on `main` (`commit 9f967e3`)** |
| **Test Suite** | Vitest 3.2.7 | **18 / 18 Tests Passing (100% Pass Rate)** |

---

## 2. Architecture & Technology Stack

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE EDGE WORKER RUNTIME (V8 Isolate)                                             │
├────────────────────────────────────────────────────┬───────────────────────────────────┤
│ BACKEND API & ROUTER (Hono v4)                     │ EDGE STORAGE                      │
│ • GET  /api/health (Runtime & timezone ping)       │ • Cloudflare D1 (SQLite Engine)   │
│ • GET  /api/v1/enquiries (Queue/SLA filtered list) │ • Schema: 22 tables & indexes     │
│ • POST /api/v1/enquiries/parse (AI + Regex hybrid) │ • Seeds: 123 BIAI courses & leads │
│ • POST /api/v1/enquiries/:id/transition            │ • Cloudflare Static Assets (SPA)  │
│ • POST /api/v1/enquiries/:id/reply                 │                                   │
├────────────────────────────────────────────────────┴───────────────────────────────────┤
│ CLIENT PRESENTATION LAYER (Svelte 5 Runes + Tailwind CSS)                              │
│ • 3-Pane Desktop Workspace (Queue Rail | Conversation Stream | Lead Inspector)         │
│ • Dual Theme: BIAI Warm Ivory Canvas (#FAF9F6) & Obsidian Dark Canvas (#080C14)        │
│ • Authentic Brand Identity: Official circular woven mark & Burnt Orange (#C2410C)       │
│ • Strict Semantic Hierarchy: 3px Left Rails, Zero ambient neon glow                    │
│ • Sandboxed Evaluator Harness: Interactive reference clock scrubber                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Edge Runtime:** Cloudflare Workers with `nodejs_compat` compatibility flags and `2024-11-01` runtime date.
* **Backend Framework:** [Hono v4](https://hono.dev/) with typed Cloudflare Worker bindings (`DB`, `AI`, `ASSETS`).
* **Frontend Framework:** [Svelte 5](https://svelte.dev/) utilizing `$state` and `$derived` reactive runes for sub-millisecond UI updates without virtual-DOM overhead.
* **Styling & Design Tokens:** Tailwind CSS v3 with authentic BIAI color tokens (`biai-700: #c2410c`, `warm-50: #faf9f6`, `warm-100: #f3f2ed`).
* **Typography:** `Inter` (UI/Latin), `Noto Sans Bengali` (1.65 line-height for matra vowel conjuncts), and `JetBrains Mono` (tabular financial and SLA figures).

---

## 3. Spec vs. Implementation Traceability Matrix

Every requirement outlined in [`PLAN_TASK1_BIAI_CRM.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/PLAN_TASK1_BIAI_CRM.md) and [`UI_UX_FIRST_CLASS_PLAN.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/UI_UX_FIRST_CLASS_PLAN.md) has been implemented and verified in the codebase:

| Spec Section | Feature Description | Implemented Code Module | Status |
| :--- | :--- | :--- | :--- |
| **Sec 2.1** | Bangladesh E.164 Phone Normalization | [`src/lib/engine/phone.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/engine/phone.ts) | Verified (Tests 1–4) |
| **Sec 2.2** | Dialect & Script Classification (BN / Banglish / EN) | [`src/lib/engine/dialect.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/engine/dialect.ts) | Verified (Tests 5–7) |
| **Sec 2.3** | Omnichannel Ingestion Parser (Hybrid Engine) | [`src/lib/engine/parser.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/engine/parser.ts) | Verified (Tests 8–14) |
| **Sec 2.4** | 48-Hour SLA Calculation with Dhaka Working Hours | [`src/lib/engine/sla.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/engine/sla.ts) | Verified (Tests 15–18) |
| **Sec 2.5** | Dialect-Matched Auto-Reply Generation | [`src/lib/engine/replies.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/engine/replies.ts) | Verified |
| **Sec 3** | Cloudflare D1 Core CRM Relational Schema | [`migrations/0001_core_crm_schema.sql`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0001_core_crm_schema.sql) | Applied Remotely |
| **Sec 4** | Bangladesh Knowledge Base & 20 Sample Enquiries | [`migrations/0002_seed_knowledge_and_sample_enquiries.sql`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0002_seed_knowledge_and_sample_enquiries.sql) | Applied Remotely |
| **Sec 5** | Hono Edge REST API Endpoints | [`src/server/index.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/index.ts) | Active on Edge |
| **Sec 6** | 3-Pane Desktop Triage Workspace | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Sec 7** | Authentic BIAI Brand Identity & Favicon | [`public/biai-logo.png`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/public/biai-logo.png) & [`index.html`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/index.html) | Implemented |
| **Sec 8** | Sandboxed Evaluator Mode with Time Scrubbing | [`src/client/App.svelte#L340-L380`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Sec 9** | Financial Reconciliation & Scope Labeling | [`src/client/App.svelte#L385-L425`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Reconciled |

---

## 4. Core Engine Implementations

### 4.1 Bangladesh E.164 Phone Normalizer (`src/lib/engine/phone.ts`)
* **Logic:** Accepts raw strings containing spaces, hyphens, parentheses, or prefixes (`017...`, `+88017...`, `88017...`).
* **Validation:** Enforces standard Bangladesh telecom operator prefixes (`013`, `014`, `015`, `016`, `017`, `018`, `019`) and ensures exactly 11 digits follow the country code.
* **Output:** Standard E.164 format `+8801XXXXXXXXX` or `null` with descriptive error flags.

### 4.2 Dialect & Script Classifier (`src/lib/engine/dialect.ts`)
* **Bengali Unicode Script (`BN_SCRIPT`):** Regex detection across Unicode block `\u0980-\u09FF`. Requires $\ge 20\%$ Bengali Unicode characters.
* **Banglish (`BANGLISH`):** Identifies Romanized Bengali phonetic markers (e.g., `koto`, `kibhabe`, `korbo`, `apnader`, `shuru`, `bhai`, `vai`, `apu`, `taka`).
* **English (`ENGLISH`):** Corporate and international inquiries.

### 4.3 Triage & Intent Classifier (`src/lib/engine/triage.ts`)
Deterministically classifies raw inquiries into 5 mutually exclusive operational queues:
1. **`CRITICAL_ESCALATION` (P0):** Identifies threats of social media exposure, consumer rights council, or angry cancellation (Row #16). Triggers **24h accelerated SLA** and supervisor alerts.
2. **`SUPPORT_BILLING` (P1):** TrxID numbers, unconfirmed bKash/Nagad payments, or invoice queries (Row #7). Directs to Finance reconciliation queue.
3. **`CAREERS_HR` (P3):** CVs, job applications, or internship queries (Row #20).
4. **`SPAM_SECURITY` (P3):** Crypto investment scams, SEO spam, or phishing links (Row #11). Quarantined with zero sales disruption.
5. **`SALES_LEAD` (P1/P2):** Course inquiries, bootcamps, and corporate seat quotes.

### 4.4 48-Hour SLA State Machine (`src/lib/engine/sla.ts`)
* Computes remaining time against a standard 48-hour business window aligned with Asia/Dhaka working hours (10:00 AM – 7:00 PM).
* **Four Discrete States:**
  * `HEALTHY` (> 12 hours remaining)
  * `AT_RISK` ($\le 12$ hours remaining)
  * `BREACHED` (> 48 hours elapsed with no `first_response_at`)
  * `MET` (`first_response_at` logged within the SLA window)

---

## 5. UI/UX Architecture: The 3-Pane Triage Workspace

Replacing the cramped 5-column Kanban board, the UI is organized as a calm, highly productive **Three-Pane Desktop Workspace**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: [Logo] B I A I CRM   [ 🔍 Global Search: sender, phone (+880), keyword... ⌘K ]   [+ Ingest]   │
├───────────────────┬────────────────────────────────────────┬───────────────────────────────────────────┤
│ PANE 1:           │ PANE 2:                                │ PANE 3:                                   │
│ QUEUES & FILTERS  │ CONVERSATION STREAM (420px)            │ PERSISTENT LEAD INSPECTOR & AI STUDIO     │
│ (220px fixed)     │                                        │ (flex-1 min-w-[500px])                    │
│                   │ Scope: Sales Pipeline (16 leads)       │                                           │
│ • Sales (16)      ├────────────────────────────────────────┤ Rafi Ahmed · Product Manager, ShurjoPay   │
│ • Billing (1)     │ [WA] Rafi Ahmed             ৳ 3,500    │ Channel: WhatsApp   Phone: +8801711000001 │
│ • Escalations (1) │ ShurjoPay · 3-day Bootcamp             │ Priority: P1 · 2x Repeat Chaser           │
│ • Careers (1)     │ P1 · In SLA · 38h left                 │ Stage: [ Contacted ▾ ]                    │
│ • Quarantined (1) │ "Assalamualaikum, apnader 3-day..."    │───────────────────────────────────────────┤
│ • All Records (20)├────────────────────────────────────────┤ ORIGINAL CUSTOMER INBOUND MESSAGE:        │
│ ───────────────── │ [Call] Habibur Rahman       [P0 PR]    │ "Assalamualaikum, apnader 3 day bootcamp  │
│ FILTERS:          │ P0 · Breached · Refund threat          │  er price koto? Payment kibhabe korbo?"   │
│ • P0 Escalations  │ "Caller wants to cancel and..."        │───────────────────────────────────────────┤
│ • At Risk (<12h)  ├────────────────────────────────────────┤ DIALECT-MATCHED SUGGESTED REPLY:          │
│ • Corporate Seats │ [Form] Mahmud Hasan         120 seats  │ "Walaikum Assalam Rafi vai! Amader 3-day  │
│ • Bangla Unicode  │ Bank in Motijheel · Corporate          │  AI Bootcamp er fee 3,500 BDT. Apni       │
│                   │ P1 · In SLA · 42h left                 │  bKash, Nagad ba Card er maddhome..."     │
│                   │ "Need a quote for training 120..."     │ [ Approve & Send Outbound ] [ Copy ]      │
└───────────────────┴────────────────────────────────────────┴───────────────────────────────────────────┘
```

### Visual & Interactive Highlights:
1. **Stable 2-Line Previews:** Cards maintain strict spatial stability without hover-scaling transforms that obscure adjacent records.
2. **3px Semantic Left Urgency Rails:**
   - Red rail: `P0 PR Threat` or `SLA Breached`.
   - Amber rail: `SLA At Risk (<12h)` or `Billing Verification`.
   - Transparent rail: `Healthy / In SLA`.
3. **Orthogonal Priority System:** Combines Business Priority (`P0`–`P3`) with SLA State (`Healthy`, `At Risk`, `Breached`, `Met`) in a single compact pill: `P1 · In SLA · 38h left`.
4. **Keyboard Ergonomics:** `J`/`K` or `↓`/`↑` navigates records; `Enter` opens the inspector; `⌘K` focuses search.

---

## 6. 100% Data Reconciliation (Task 1 Records)

Every metric in the CRM summary bar reconciles with mathematical precision against the 20 fixture records:

```text
Total Inquiries: 20
├── Sales Pipeline: 16 leads (৳ 75,000 direct consumer fee + 3 custom corporate quotes)
│   ├── Corporate B2B Demand: 140 Seats (Row #3: 120 seats, Row #10: 10 seats, Row #18: 10 seats)
│   └── Consumer Admissions: 13 leads (Bootcamp ৳3,500 & Fellowship ৳25,000)
├── Support & Billing: 1 inquiry (Row #7, Monir Hossain · bKash Statement Verification)
├── Critical Escalation: 1 ticket (Row #16, Habibur Rahman · P0 PR Threat, 24h SLA)
├── Careers & HR: 1 applicant (Row #20, Sumaiya Hasan · AI Research Intern)
└── Quarantined Spam: 1 record (Row #11, Crypto Trading Bot · Deterministically quarantined)
```

### SLA Reconciliation (Reference Clock: `2026-10-28 12:00 Asia/Dhaka`)
* **At Risk (<12h remaining):** Exactly **4 leads** (`Row #1`, `Row #2`, `Row #4`, `Row #6`).
* **Breached (>48h elapsed):** Exactly **2 tickets** (`Row #7` Support, `Row #16` P0 Escalation).

---

## 7. Verification & Edge Deployment Evidence

### 7.1 Vitest Unit Test Execution Proof
```bash
$ npm test

 ✓ tests/parser.test.ts (18 tests) 5ms
   ✓ Bangladesh E.164 Phone Normalizer > normalizes standard 11-digit local format
   ✓ Bangladesh E.164 Phone Normalizer > normalizes with country code without plus
   ✓ Bangladesh E.164 Phone Normalizer > normalizes with hyphens, spaces, and plus prefix
   ✓ Bangladesh E.164 Phone Normalizer > fails gracefully on empty, short, or invalid numbers
   ✓ Dialect & Script Classifier > classifies pure Bengali Unicode script correctly
   ✓ Dialect & Script Classifier > classifies Romanized Banglish phonetics accurately
   ✓ Dialect & Script Classifier > classifies English corporate and inquiries accurately
   ✓ Triage & Intent Classifier > identifies Row #11 as SPAM_SECURITY and quarantines it
   ✓ Triage & Intent Classifier > identifies Row #16 as CRITICAL_ESCALATION with P0 PR-Risk
   ✓ Triage & Intent Classifier > identifies Row #7 as SUPPORT_BILLING for unconfirmed bKash payment
   ✓ Triage & Intent Classifier > identifies Row #20 as CAREERS_HR for job applicant
   ✓ Triage & Intent Classifier > correctly extracts corporate seat counts and B2B whale leads
   ✓ Full Ingestion Engine > parses Row #1 and generates tone-matched Banglish reply
   ✓ Full Ingestion Engine > parses Row #3 (Mahmud Hasan - embedded role and organization)
   ✓ 48-Hour SLA State Machine > calculates IN_SLA when more than 12h remaining
   ✓ 48-Hour SLA State Machine > flags AT_RISK when 12h or less remaining
   ✓ 48-Hour SLA State Machine > triggers BREACHED when past 48 hours without response
   ✓ 48-Hour SLA State Machine > records MET when response logged within 48 hours

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Duration  484ms
```

### 7.2 Live Production Endpoint Verification
```bash
$ curl -ILs https://biaicrm.mrong.tech/
HTTP/2 200 
content-type: text/html
server: cloudflare

$ curl -s https://biaicrm.mrong.tech/api/health
{
  "status": "healthy",
  "runtime": "Cloudflare Workers (Edge V8 Isolate)",
  "timezone": "Asia/Dhaka"
}

$ curl -ILs https://biaicrm.mrong.tech/biai-logo.png
HTTP/2 200 
content-type: image/png
server: cloudflare
```
