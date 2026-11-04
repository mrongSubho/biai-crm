# BIAI Omnichannel Multilingual CRM & AI Triage Engine

Production-grade, edge-native CRM and AI Ingestion Engine engineered for the **BIAI AI Intern Assessment (Task 1)**.

Deployed on **Cloudflare Workers (Edge V8 Isolates) + Cloudflare D1 (Distributed SQLite) + Svelte 5 (Runes)**.

---

## 🌟 Key Features

1. **Omnichannel Ingestion:** Ingests messages from WhatsApp, Facebook Messenger, Website forms, Phone call notes, and Facebook comments.
2. **Bangladesh E.164 Phone Normalization:** Strict formatting of all BD phone numbers (`017...`, `88018...`, `+88019...`) into canonical E.164 (`+8801XXXXXXXXX`).
3. **Automated Entity Resolution:** Identifies repeat senders across multiple timestamps. Resolves **Rafi Ahmed (`01711000001`)** on Oct 26 (`#1`) and Oct 27 (`#12`) into a unified thread and flags him as a **Repeat Chaser (2x Unanswered)**.
4. **5-Tier Operational Triage Matrix:**
   - `SALES_LEAD`: 16 active leads managed on a 5-stage pipeline (`New` $\to$ `Contacted` $\to$ `Interested` $\to$ `Paid` / `Lost`).
   - `CRITICAL_ESCALATION`: P0 PR-Risk detection for refund threats (Habibur Rahman `#16`).
   - `SUPPORT_BILLING`: bKash payment verification for unconfirmed transactions (Farzana Rahman `#7`).
   - `CAREERS_HR`: Intern applicant inquiry routing (Arif Hossain `#20`).
   - `SPAM_SECURITY`: Automated crypto phishing quarantine (Earn Crypto Daily `#11`).
5. **Dialect-Matched Linguistic Reply Drafter:** Accurately classifies Bengali Unicode script, Romanized Banglish phonetics, and English with confidence scoring. Generates tone-matched replies grounded in BIAI's course catalog across 4 tones (`Professional`, `Friendly`, `Direct`, `Executive`) and 3 dialects (`বাংলা`, `Banglish`, `EN`).
6. **Conversation Stream & Multi-Turn History:** End-to-end conversational dialogue rendering customer inquiries and outbound admissions agent turns, complete with follow-up simulation, internal note taking, and double-send protection.
7. **48-Hour SLA State Machine:** Dynamic countdown tracking with `IN_SLA`, `AT_RISK` ($<12\text{h}$), and clean positive overdue duration timers (`1h 55m overdue`), accompanied by a test simulation clock for evaluator verification.
8. **Weekly Executive AI Digest Center Stage:** Dedicated Saturday 00:00 to Friday 23:59 business week executive briefing reporting channel breakdown, 3.17M BDT pipeline value, 175 corporate seats requested, and missing phone leakage alerts.
9. **Account Control & Session Security Plane:** Hierarchical 4-tier RBAC (`TIER_0` to `TIER_3`), CSRF double-submit token protection on session revocation, real-time client machine platform detection (replacing static proxy names), and real-time CRM operational activity logging.

---

## 🚀 Quick Start (Local Development)

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

## ☁️ Cloudflare Deployment Runbook

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

## 📂 Project Structure

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

## 🧪 Verification & Acceptance Metrics

Run `npm test` to verify:
- **Phone Normalization:** 100% precision on BD local numbers, prefix stripping, and operator detection.
- **Dialect Classification:** 100% accuracy on sample Bangla, Banglish, and English rows across 4 tone presets.
- **Weekly Executive Digest:** 100% precision on Saturday 00:00 to Friday 23:59 business week period boundaries and financial sums.
- **Triage Matrix:** Accurate quarantine of Row `#11`, P0 escalation of Row `#16`, billing routing of Row `#7`, and career routing of Row `#20`.
- **Corporate Extraction:** Correct extraction of 120 seats (Bank in Motijheel), 40 seats (Gazipur Textile), and 15 seats (Garment factory).
- **SLA Engine:** Verifies `IN_SLA`, `AT_RISK`, `BREACHED` (positive overdue duration), and `MET` state transitions.
- **Security & RBAC:** Verifies PBKDF2 authentication, CSRF double-submit token enforcement, anti-escalation tier bounds, and durable outbox delivery.
