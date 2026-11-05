Production-grade, edge-native CRM and AI Ingestion Engine engineered for the **BIAI AI Intern Assessment (Task 1)**.

# BIAI CRM Triage — Project Submission Note

**Candidate:** Subho Mrong  
**Submission Date:** 5 November 2026  
**Live Application:** [https://biaicrm.mrong.tech](https://biaicrm.mrong.tech)  
**Code Repository:** [https://github.com/mrongSubho/biai-crm](https://github.com/mrongSubho/biai-crm)  
**Walkthrough Video (5 min):** [https://www.loom.com/share/e2545f48a22141c08e3972f29431fc01] (https://www.loom.com/share/e2545f48a22141c08e3972f29431fc01)

---

### Tech Stack & Architecture Choices

* **Runtime:** Cloudflare Workers (Edge V8 Isolates)
* **BACKEND & CONTROL:** Hono v4
* **Database:** Cloudflare D1 (Distributed Edge SQLite)
* **Frontend:** Svelte 5 (Runes)

**Why this stack:**
* **Instant local performance:** Cloudflare Workers execute directly at Cloudflare’s Dhaka edge node, avoiding the high latency and cold-start delays common with traditional servers.
* **Zero-maintenance relational storage:** Cloudflare D1 provides lightweight, ACID-compliant SQLite at the edge—guaranteeing consistent lead status transitions, full message histories, and zero server management overhead.
* **Ultra-lean UI:** Svelte 5 compiles down to raw JavaScript (<80 KB gzipped) without the virtual-DOM overhead of React, keeping the dashboard snappy even on patchy mobile data.

---

### 1. What I Built and Why

In Bangladesh, prospective students and corporate buyers don't fill out tidy web forms. They send mixed Banglish questions on Messenger or WhatsApp, drop quick comments on Facebook posts, or call directly. Many leads get delayed, repeat inquiries get missed, and critical refund requests can get buried in a busy inbox.

I built this CRM to solve those exact daily headaches for the BIAI team:

* **One Unified Inbox for Every Channel**: Ingests incoming inquiries from WhatsApp, Facebook Messenger, Facebook comments, website forms, and phone call notes into a single shared inbox.
* **Smart Triage that Cuts Through the Noise**: Instantly categorizes inbound messages into active sales leads, support/billing, or spam. It flags critical risks (like public refund threats) for priority de-escalation and surfaces repeat reach-outs (e.g. recognizing Rafi Ahmed followed up twice) so hot leads never go cold.
* **Human-Ready Conversation Stream**: Counselors can view the full back-and-forth dialogue, take internal scratchpad notes (`+ Note`) attached to the lead, and draft replies with a single click.
* **Natural Language & Dialect Matching**: Suggested replies adapt to how the customer writes—switching seamlessly between **Bangla**, **Banglish**, and **English**, with tone presets (**Professional**, **Friendly**, **Direct**, or **Executive**).
* **48-Hour Response SLA Tracker**: Clear countdowns show exactly how much time is left to reply—or how long a message is overdue in plain hours and minutes.
* **Weekly Executive Summary**: A dedicated report that gives management a bird's-eye view of lead volume, active pipeline value, channel breakdown, and missing phone numbers.

---

### 2. AI Toolchain & Practical Application

#### **AI Agent Harness & Model Orchestration**
* **Agentic Harness:** Google Antigravity & GitHub Copilot
* **Architecture, Design & Strategy Planning:** GPT Sol 5.6, Gemini Argon 4, Opus 5.5
* **High-Speed Implementation & Edge Engineering:** Gemini 3.8 Flash, GPT Sol 5.6
* **Production Runtime Inference:** Google Gemini API and Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct`) for edge extraction and tone-matched drafting.

#### **How AI is Applied in the CRM**
1. **Zero-Friction Detail Extraction**: When an inquiry arrives in informal Banglish—e.g., *"amader corporate team er jonno AI bootcamp quote lagbe. 25 jon engineer attend korbe"*—the system automatically extracts the contact, team size (25 engineers), intent, and estimated deal value without manual form-filling.
2. **Context-Aware Reply Drafting**: Generates sensible first-draft responses aligned with the specific course or corporate program mentioned, saving the admissions team from typing repetitive greetings.

---

### 3. Current Limitations (What Needs Live Credentials)

* **Official WhatsApp Cloud API**: In this demo environment, outbound WhatsApp messages run in sandbox simulation mode, and incoming webhooks run via authenticated test fixtures. Hooking up live, 2-way background messaging requires BIAI's verified Meta Business Account credentials.
* **Audio Voice Notes**: Phone call notes are currently logged manually as text entries. Direct voice note speech-to-text transcription isn't hooked up yet.

---

### 4. What I Would Add Next

1. **Direct WhatsApp & Messenger 2-Way Sync**: Connect BIAI’s live Meta WABA account so counselor replies send directly through WhatsApp Cloud API inside the thread.
2. **bKash & Nagad Payment Auto-Match**: Automatically verify transaction IDs (TrxID) sent by students against merchant IPN statements to auto-transition leads to "Paid / Enrolled".
3. **Frontline Voice Memo Transcription**: Allow counselors to record a quick 15-second audio memo after a phone call and have it automatically transcribed into bullet points on the customer’s card.


##  Quick Start (Local Development)

```bash
# Navigate to the app directory
cd apps/task1-crm

# Run the automated test suite (48 unit & integration tests)
npm test

# Build the production client bundle (<90 KB gzipped)
npm run build

# Start the local development server
npm run dev
```

Open `http://localhost:5173` to interact with the full CRM, the live AI Parser Studio, and the SLA simulation clock.

---

##  Cloudflare Deployment Runbook

### Prerequisites
- Node.js $\ge 20$
- Cloudflare account with Wrangler CLI (`npx wrangler login`)

### Step 1: Provision Remote Cloudflare D1 Database
```bash
npx wrangler d1 create biai-crm-db
```
*Copy the `database_id` output and update `wrangler.toml`.*

### Step 2: Apply Database Migrations
```bash
# Apply schema and initial sample data seed to Cloudflare D1
npx wrangler d1 migrations apply biai-crm-db --remote
```

### Step 3: Deploy to Cloudflare
```bash
# Builds Svelte 5 static client into ./dist and deploys the unified Worker
npm run deploy
```

---

##  Project Structure

```text
apps/task1-crm/
├── wrangler.toml                 # Cloudflare Worker, D1 & Assets configuration
├── package.json
├── vite.config.ts
├── migrations/
│   ├── 0001_core_crm_schema.sql  # Relational D1 schema with FTS5 and audit tables
│   └── 0002_seed_knowledge_and_sample_enquiries.sql # Seed for all 20 sample enquiries
├── src/
│   ├── lib/
│   │   ├── types/crm.ts          # Zod schemas & strict TypeScript contracts
│   │   └── engine/
│   │       ├── phone.ts          # Bangladesh E.164 phone normalizer
│   │       ├── dialect.ts        # Bengali Unicode & Banglish lexicon detector
│   │       ├── triage.ts         # 5-tier intent & triage classifier
│   │       ├── replies.ts        # Grounded knowledge-base reply drafter
│   │       ├── sla.ts            # 48-hour SLA calculation state machine
│   │       └── parser.ts         # Unified message extraction pipeline
│   ├── server/
│   │   ├── index.ts              # Hono v4 Edge Worker API & static asset gateway
│   │   └── fixtures.ts           # Enriched 20 sample enquiries dataset
│   └── client/
│       ├── main.ts               # Svelte 5 application mounting
│       ├── app.css               # Tailwind & custom glassmorphism styles
│       └── App.svelte            # Main reactive CRM workspace & parser studio
├── tests/
│   ├── parser.test.ts            # 23 comprehensive ingestion & triage tests
│   ├── weekly_digest.test.ts     # 6 business cycle & digest engine tests
│   └── api.test.ts               # 19 edge API, security, CSRF & D1 tests
├── SUBMISSION_NOTE.md            # Half-page required submission note
└── LOOM_SCRIPT.md                # 4-minute 30-second Loom presentation script
```

---

##  Verification & Acceptance Metrics

Run `npm test` to verify:
- **Phone Normalization:** 100% precision on BD local numbers, prefix stripping, and operator detection.
- **Dialect Classification:** 100% accuracy on sample Bangla, Banglish, and English rows across 4 tone presets.
- **Weekly Executive Digest:** 100% precision on Saturday 00:00 to Friday 23:59 business week period boundaries and financial sums.
- **Triage Matrix:** Accurate quarantine of Row `#11`, P0 escalation of Row `#16`, billing routing of Row `#7`, and career routing of Row `#20`.
- **Corporate Extraction:** Correct extraction of 120 seats (Bank in Motijheel), 40 seats (Gazipur Textile), and 15 seats (Garment factory).
- **SLA Engine:** Verifies `IN_SLA`, `AT_RISK`, `BREACHED` (positive overdue duration), and `MET` state transitions.
- **Security & RBAC:** Verifies PBKDF2 authentication, CSRF double-submit token enforcement, anti-escalation tier bounds, and durable outbox delivery.
