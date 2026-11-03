# BIAI Omnichannel Edge CRM & Triage Engine — Implementation Record
**Application:** Task 1 — Omnichannel CRM & Inbound Triage Engine  
**Target Environment:** Cloudflare Workers (Edge V8 Isolate) + Cloudflare D1 Database  
**Live Production URL:** [https://biaicrm.mrong.tech](https://biaicrm.mrong.tech)  
**Worker Subdomain URL:** [https://biai-crm.ludobase.workers.dev](https://biai-crm.ludobase.workers.dev)  
**Primary GitHub Repository:** [https://github.com/mrongSubho/biai-crm.git](https://github.com/mrongSubho/biai-crm.git)  
**Specification Documents:** [`PLAN_TASK1_BIAI_CRM.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/PLAN_TASK1_BIAI_CRM.md), [`DESIGN_SYSTEM_PLAN.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/DESIGN_SYSTEM_PLAN.md) & [`UI_UX_FIRST_CLASS_PLAN.md`](file:///Users/mrongsubho/Documents/Termninal/BIAI/UI_UX_FIRST_CLASS_PLAN.md)  
**Current Git Head Commit:** `0d22d56` (`feat(crm): account management control plane and internal command messaging system`)  
**Test Suite Verification:** Vitest 3.2.7 — **36 / 36 Tests Passing (100%)**  
**Status:** 100% Implemented, Hardened, Reconciled & Deployed Live  
**Date:** November 2026

---

## 1. Executive Summary & Production Deliverables

The **BIAI Omnichannel Edge CRM** is an operational triage console engineered specifically for the admissions, executive education, and student-support operations of the **Bangladesh Institute of AI (BIAI)**. It ingests and processes unformatted, multilingual inbound customer communications across WhatsApp, Facebook Messenger, Website Forms, Phone Call Notes, and Social Comments.

The system replaces legacy multi-column Kanban boards with an ergonomic **Linear/Stripe-grade 3-pane desktop workspace**. It delivers sub-millisecond edge classification, dialect-matched communication, strict 48-hour SLA compliance during Dhaka business hours, a 4-tier hierarchical security and account control plane, viewport-contained anti-scroll geometry, streamlined one-lined urgency indicators, and an internal command messaging system with operational directive tracking.

### Verified Production Artifacts

| Component | Identifier / Location | Status |
| :--- | :--- | :--- |
| **Custom Domain** | `https://biaicrm.mrong.tech` | **Live (HTTP/2 200, Edge SSL active, Global Anycast)** |
| **Worker Subdomain** | `https://biai-crm.ludobase.workers.dev` | **Live (Worker Version: `0c408f7f-22dd-4cdd-9b4d-8aefc74195f6`)** |
| **Cloudflare D1 Database** | `biai-crm-db` (`7c038dce-7ae2-48bb-9efa-5439cdc373a8`) | **APAC Region (Singapore), Migrations 0001–0006 Applied & Seeded** |
| **GitHub Repository** | `https://github.com/mrongSubho/biai-crm.git` | **Clean, Synchronized on `main` at commit `0d22d56`** |
| **Test Suite** | Vitest 3.2.7 | **36 / 36 Tests Passing (18 Parser Engine + 18 API / D1 / Auth / Messaging)** |
| **Security & Identity** | Tier-based RBAC & SHA-256 Sessions | **Active (Tier 0–3, CSRF Double-Submit, PBKDF2-SHA256, Anti-Escalation)** |
| **Internal Messaging** | Direct & Broadcast Threads | **Active (Directive Ack Tracking, Deep-Link `#ENQ-xx`, Unread Badges)** |
| **Design System** | BIAI Restrained Brand Identity | **Warm Ivory (`#FAF9F6`), Burnt Orange (`#C2410C`), Obsidian Dark (`#080C14`)** |

---

## 2. Complete Architecture & Technology Stack

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE EDGE WORKER RUNTIME (V8 Isolate, nodejs_compat, Date: 2024-11-01)                           │
├──────────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ BACKEND API & CONTROL PLANE (Hono v4)                │ STORAGE & PERSISTENCE (Cloudflare D1 SQLite)     │
│ • GET  /api/health (Runtime & timezone ping)         │ • 22 Tables & FTS5 Full-Text Search Indexes     │
│ • GET  /api/v1/enquiries (Queue/SLA filtered list)   │ • Migrations 0001–0006 (ACID Relational Schema) │
│ • POST /api/v1/enquiries/parse (AI + Regex hybrid)   │ • Outbound Delivery Queue with Backoff Retries  │
│ • POST /api/v1/enquiries/:id/stage (Pipeline mutate) │ • Immutable Security Audit Ledger Triggers      │
│ • POST /api/v1/enquiries/:id/reply (Outbound record) │ • Cloudflare Static Assets (Single-Page App)    │
│ • POST /api/auth/* (Login, Logout, Self-Service)     │                                                 │
│ • POST /api/admin/users/* (Lifecycle, Reset, Freeze) │                                                 │
│ • POST /api/v1/messages/* (Directives, Acks, Threads)│                                                 │
├──────────────────────────────────────────────────────┴─────────────────────────────────────────────────┤
│ CLIENT PRESENTATION LAYER (Svelte 5 Runes + Tailwind CSS v3)                                           │
│ • Viewport-Contained 3-Pane Desktop Workspace (h-screen, overflow-hidden, zero outer window scroll)    │
│ • Pane 1: Queues & Filters Rail (220px fixed, internal scroll)                                         │
│ • Pane 2: Conversation Stream (420px, internal scroll, stable 2-line previews)                        │
│ • Pane 3: Lead Inspector & AI Studio (flex-1 min-w-[500px], one-page fit, inner conversation scroll)   │
│ • Card Urgency Redesign: One-lined smart semantic labels (🔴 Overdue 3d, 🟡 Due in 2d, ⚪ In SLA)     │
│ • Account Control Plane Modal (AccountControlModal.svelte): Self-service, operator directory, audit log│
│ • Internal Messaging Center Modal (MessagingCenterModal.svelte): Threads, Directives, Deep Links       │
│ • Sandboxed Reference Clock Scrubber (Asia/Dhaka 2026-10-28 12:00 BST default)                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Technology Invariants
* **Edge Runtime:** Cloudflare Workers running V8 isolates with `nodejs_compat` enabled and zero reliance on heavy Node.js daemon infrastructure.
* **Backend Framework:** [Hono v4](https://hono.dev/) with typed Cloudflare Worker environment bindings (`DB: D1Database`, `AI: Ai`, `ASSETS: Fetcher`).
* **Frontend Framework:** [Svelte 5](https://svelte.dev/) with fine-grained reactivity via runes (`$state`, `$derived`, `$effect`) for instant UI synchronization without virtual-DOM thrashing.
* **Styling & Design Tokens:** Tailwind CSS v3 configured with authentic BIAI color tokens (`biai-700: #c2410c`, `warm-50: #faf9f6`, `warm-100: #f3f2ed`, `obsidian-950: #080c14`).
* **Typography:** `Inter` for Latin UI, `Noto Sans Bengali` with `line-height: 1.65` for matra conjunct clarity, and `JetBrains Mono` for tabular financial numbers and SLA timers.

---

## 3. Spec vs. Implementation Traceability Matrix

Every functional, operational, architectural, and security requirement outlined from the project inception through the latest control plane enhancements is verified below:

| Requirement / Spec Section | Core Feature Description | Implemented Code Module | Status |
| :--- | :--- | :--- | :--- |
| **Task 1 Sec 2.1** | Bangladesh E.164 Phone Normalization (`+8801XXXXXXXXX`) | [`src/server/parser/phone.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/parser/phone.ts) | Verified (Tests 1–4) |
| **Task 1 Sec 2.2** | Script & Dialect Classifier (`BN_SCRIPT`, `BANGLISH`, `ENGLISH`) | [`src/server/parser/classifier.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/parser/classifier.ts) | Verified (Tests 5–7) |
| **Task 1 Sec 2.3** | Omnichannel Ingestion Parser (Hybrid AI + Regex) | [`src/server/parser/triage.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/parser/triage.ts) | Verified (Tests 8–14) |
| **Task 1 Sec 2.4** | 48-Hour SLA Engine (Dhaka Business Hours & Weekend Rules) | [`src/server/sla/engine.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/sla/engine.ts) | Verified (Tests 15–18) |
| **Task 1 Sec 2.5** | Dialect-Matched Auto-Reply Generation | [`src/server/parser/replies.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/parser/replies.ts) | Verified |
| **Task 1 Sec 3** | Cloudflare D1 Relational Schema & Indices | [`migrations/0001_core_crm_schema.sql`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0001_core_crm_schema.sql) | Applied Remotely |
| **Task 1 Sec 4** | Knowledge Base Seeds & 20 Sample Inbound Inquiries | [`migrations/0002_seed_knowledge_and_sample_enquiries.sql`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0002_seed_knowledge_and_sample_enquiries.sql) | Applied Remotely |
| **Task 1 Sec 5** | Hono Edge REST API Endpoints & FTS5 Indexing | [`src/server/index.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/index.ts) | Active on Edge |
| **Task 1 Sec 6** | 3-Pane Desktop Triage Workspace Architecture | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Task 1 Sec 7** | Authentic BIAI Brand Identity, Favicon & Themes | [`public/biai-logo.png`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/public/biai-logo.png) & [`index.html`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/index.html) | Implemented |
| **Task 1 Sec 8** | Sandboxed Evaluator Mode with Time Scrubbing | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Task 1 Sec 9** | Financial Reconciliation & Scope Labeling | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Reconciled |
| **Design Phase 1** | Calm Urgency & Visual Geometry Lock | [`src/lib/ui/status.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/ui/status.ts) | Implemented |
| **Design Phase 2** | Viewport Layout Containment & Anti-Scroll Polish | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Design Phase 3** | Smart One-Lined Urgency Text Badges | [`src/client/App.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/client/App.svelte) | Implemented |
| **Auth Phase 1** | Tier-based RBAC & Identity Control Plane | [`src/server/auth.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/auth.ts) & [`migrations/0003`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0003_identity_control_plane.sql) | Verified |
| **Auth Phase 2** | Durable Outbound Delivery with Exponential Backoff | [`migrations/0004`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0004_durable_outbound_delivery.sql) & [`0005`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0005_delivery_provider_response.sql) | Verified |
| **Admin Phase 1** | Hierarchical Account Control Plane & Anti-Escalation | [`src/server/auth_service.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/auth_service.ts) & [`migrations/0006`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/migrations/0006_account_admin_and_messaging.sql) | Verified (Tests 32–35) |
| **Admin Phase 2** | Account Control Modal UI (Self-service + Admin) | [`src/lib/ui/AccountControlModal.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/ui/AccountControlModal.svelte) | Implemented |
| **Messaging Phase 1** | Internal Command Messaging & Directives Engine | [`src/server/messaging_service.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/messaging_service.ts) | Verified (Test 36) |
| **Messaging Phase 2** | Operational Directive Tracking & Deep Context Routing | [`src/lib/ui/MessagingCenterModal.svelte`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/lib/ui/MessagingCenterModal.svelte) | Implemented |

---

## 4. Core Engine Implementations

### 4.1 Bangladesh E.164 Phone Normalizer (`src/server/parser/phone.ts`)
* **Objective:** Clean messy phone strings entered via web forms, chat apps, and manual notes into standard E.164 format (`+8801XXXXXXXXX`).
* **Input Scenarios Handled:**
  - Standard 11-digit local format: `01711000001` $\to$ `+8801711000001`
  - Country code prefix without plus: `8801711000001` $\to$ `+8801711000001`
  - International prefix with formatting: `+880-1711-000001` or `+880 1711 000001` $\to$ `+8801711000001`
  - Local with dashes/spaces: `01711-000001` $\to$ `+8801711000001`
* **Validation Guards:** Enforces standard Bangladesh telecom operator prefixes (`013`, `014`, `015`, `016`, `017`, `018`, `019`) and requires exactly 11 digits after the country code. Invalid or short strings return `null` with descriptive error flags.

### 4.2 Dialect & Script Classifier (`src/server/parser/classifier.ts`)
Deterministically classifies inbound text into one of three linguistic channels to ensure response tone alignment:
1. **Bengali Unicode Script (`BN_SCRIPT`):**
   - Matches characters against Unicode block `\u0980-\u09FF`.
   - Threshold: $\ge 20\%$ Bengali Unicode characters in text.
2. **Banglish (`BANGLISH`):**
   - Identifies Latin-transliterated Bengali phonetic tokens (e.g., `koto`, `kibhabe`, `korbo`, `apnader`, `shuru`, `bhai`, `vai`, `apu`, `taka`, `ar`, `ei`, `ki`, `hobe`).
3. **English (`ENGLISH`):**
   - Identifies corporate, international, and standard English inquiries.

### 4.3 Deterministic Triage Intent Classifier (`src/server/parser/triage.ts`)
Sorts raw customer communications into 5 mutually exclusive operational queues:
* **`CRITICAL_ESCALATION` (P0):** Identifies threats of social media exposure, consumer rights council, legal escalation, or angry cancellation (Row #16). Triggers **24h accelerated SLA** and supervisor alerts.
* **`SUPPORT_BILLING` (P1):** Identifies TrxID strings, unconfirmed bKash/Nagad payments, or invoice inquiries (Row #7). Directs to Finance reconciliation queue.
* **`CAREERS_HR` (P3):** Identifies CVs, internship inquiries, and job applications (Row #20). Quarantined from sales pipeline.
* **`SPAM_SECURITY` (P3):** Identifies crypto trading bots, SEO spam, or phishing URLs (Row #11). Deterministically quarantined.
* **`SALES_LEAD` (P1/P2):** Identifies course inquiries, bootcamps, and corporate seat procurement. Extracts company name, seat count, and budget.

### 4.4 48-Hour SLA State Machine (`src/server/sla/engine.ts`)
* **Timezone:** Asia/Dhaka (`UTC+6`).
* **Working Window:** 09:00 AM – 06:00 PM BST (9 business hours per day).
* **Weekend Exclusion:** **Friday** is strictly excluded as the official Bangladesh weekend. Communications arriving after Friday 00:00 pause SLA progression until Saturday 09:00 BST.
* **Dynamic Reference Clock:** Supports both real-time wall clock and interactive sandboxed scrubber (`2026-10-28 12:00 BST` default benchmark).
* **State Definitions:**
  * `IN_SLA` / `HEALTHY`: $> 12$ business hours remaining before breach.
  * `AT_RISK`: $\le 12$ business hours remaining before breach.
  * `BREACHED`: $> 48$ elapsed business hours without a logged `first_response_at`.
  * `MET`: `first_response_at` logged within the SLA window.

### 4.5 CRM Data Repository & ACID D1 Operations (`src/server/db/repository.ts`)
* Uses Cloudflare D1 prepared statements to prevent SQL injection.
* Employs SQLite transactions for atomic enquiry transitions and outbound message creation.
* Implements FTS5 virtual table indexing for sub-10ms search queries across sender names, phone numbers, and full message bodies.
* Webhook Idempotency: Stores `provider_message_id` with unique constraints to reject duplicate WhatsApp/Meta webhook deliveries.

---

## 5. UI/UX Architecture & Layout Containment

The user interface is designed as an ergonomic, distraction-free **3-Pane Desktop Workspace** that complies with BIAI's authentic brand guidelines.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: [Logo] B I A I CRM   [ 🔍 Global Search: sender, phone (+880), keyword... ⌘K ]   [User Menu ▾]│
├───────────────────┬────────────────────────────────────────┬───────────────────────────────────────────┤
│ PANE 1:           │ PANE 2:                                │ PANE 3:                                   │
│ QUEUES & FILTERS  │ CONVERSATION STREAM (420px)            │ LEAD INSPECTOR & AI STUDIO                │
│ (220px fixed)     │                                        │ (flex-1 min-w-[500px])                    │
│                   │ Scope: Sales Pipeline (16 leads)       │                                           │
│ • Sales (16)      ├────────────────────────────────────────┤ Rafi Ahmed · Product Manager, ShurjoPay   │
│ • Billing (1)     │ [WA] Rafi Ahmed             ৳ 3,500    │ Channel: WhatsApp   Phone: +8801711000001 │
│ • Escalations (1) │ ShurjoPay · 3-day Bootcamp             │ Priority: P1 · 2x Repeat Chaser           │
│ • Careers (1)     │ 🟡 Due in 2d                           │ Stage: [ Contacted ▾ ]                    │
│ • Quarantined (1) │ "Assalamualaikum, apnader 3-day..."    │───────────────────────────────────────────┤
│ • All Records (20)├────────────────────────────────────────┤ ORIGINAL CUSTOMER INBOUND MESSAGE:        │
│ ───────────────── │ [Call] Habibur Rahman       [P0 PR]    │ "Assalamualaikum, apnader 3 day bootcamp  │
│ FILTERS:          │ 🔴 Overdue 3d                          │  er price koto? Payment kibhabe korbo?"   │
│ • P0 Escalations  │ "Caller wants to cancel and..."        │───────────────────────────────────────────┤
│ • At Risk (<12h)  ├────────────────────────────────────────┤ DIALECT-MATCHED SUGGESTED REPLY:          │
│ • Corporate Seats │ [Form] Mahmud Hasan         120 seats  │ "Walaikum Assalam Rafi vai! Amader 3-day  │
│ • Bangla Unicode  │ Bank in Motijheel · Corporate          │  AI Bootcamp er fee 3,500 BDT. Apni       │
│                   │ ⚪ In SLA                              │  bKash, Nagad ba Card er maddhome..."     │
│                   │ "Need a quote for training 120..."     │ [ Approve & Send Outbound ] [ Copy ]      │
└───────────────────┴────────────────────────────────────────┴───────────────────────────────────────────┘
```

### 5.1 Viewport Containment & Anti-Scroll Geometry
* **Root Window Lock:** The root container is locked with `h-screen overflow-hidden`. The browser's outer window never scrolls, eliminating disorienting page-level shifts.
* **Pane-Level Isolation:**
  - **Queue Rail:** Fixed `220px` width, internally scrollable when filters exceed height.
  - **Conversation Stream:** Fixed `420px` width, scrollable internally (`flex-1 min-h-0 overflow-y-auto overscroll-contain`).
  - **Lead Inspector:** `flex-1 min-w-[500px]`, structured so that header metrics, stage selector, and action buttons remain pinned in one viewport, while only the inner conversation thread scrolls.
* **Modals:** Both `AccountControlModal` and `MessagingCenterModal` enforce `max-h-[85vh]` with fixed headers and internally scrollable content tabs.

### 5.2 Smart One-Lined Urgency Text Badges
Following user design feedback, bulky nested box badges were replaced with streamlined, single-line semantic text labels:
* 🔴 **Overdue:** `🔴 Overdue 3d` (Crimson indicator, bold sans-mono label).
* 🟡 **Due Soon:** `🟡 Due in 2d` (Amber indicator, calm urgency).
* ⚪ **In SLA:** `⚪ In SLA` (Muted slate indicator).
* **3px Left Border Rails:** Cards retain a 3px semantic left rail for immediate peripheral scanning without visual noise.

---

## 6. Authentication, Security & Hierarchical RBAC Control Plane

### 6.1 Role & Security Tier Hierarchy

```text
┌────────────────────────────────────────────────────────────────────────┐
│ TIER_0: PLATFORM_OWNER (usr_admin_1)                                   │
│ Sovereign control across all workspaces, user provisioning, scopes.    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ delegates
┌──────────────────────────────────▼─────────────────────────────────────┐
│ TIER_1: OPERATIONS_ADMIN (usr_ops_1)                                   │
│ User lifecycle management, freeze/unfreeze lower tiers, password reset,│
│ supervisor ticket approval, operational directive issuance.            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ manages
                  ┌────────────────┴────────────────┐
┌─────────────────▼──────────────┐ ┌────────────────▼────────────────────┐
│ TIER_2: COMMERCIAL_STRATEGIST  │ │ TIER_3: TRIAGE_SPECIALIST          │
│ Analytics, pipeline valuation, │ │ Inbound triage, enquiry responses, │
│ knowledge-base supervision.    │ │ customer communication execution.  │
└────────────────────────────────┘ └────────────────────────────────────┘
```

### 6.2 Strict Anti-Escalation Security Enforcement (`canManageTarget`)
Implemented in [`src/server/auth.ts`](file:///Users/mrongsubho/Documents/Termninal/BIAI/apps/task1-crm/src/server/auth.ts):
1. **Tier Invariant:** An operator can only create, update, suspend, or reset users with a strictly lower security tier (`actorTierNumber < targetTierNumber`).
2. **Platform Owner Immunity:** `OPERATIONS_ADMIN` (`TIER_1`) can never modify, freeze, demote, or reset `PLATFORM_OWNER` (`TIER_0`).
3. **Peer Immunity:** `TIER_1` administrators cannot freeze or modify peer `TIER_1` administrators.
4. **Self-Targeting Ban:** Operators cannot suspend, demote, or revoke their own accounts.

### 6.3 Credential Security & Session Lifecycle
* **Password Hashing:** PBKDF2 with SHA-256, 100,000 iterations, and a unique 16-byte cryptographically secure salt.
* **Session Storage:** 64-character random hexadecimal session tokens stored as SHA-256 hashes in Cloudflare D1 (`sessions` table).
* **Cookie Architecture:** Signed HTTP-only, `SameSite=Lax` cookies with strict 24-hour expiration.
* **Double-Submit CSRF Protection:** Anti-CSRF token verified on all mutating HTTP requests (`POST`, `PUT`, `DELETE`, `PATCH`).
* **Step-Up Reauthentication:** Destructive actions (user deletion, role changes, privilege escalations) require a password confirmation within the last 15 minutes (`reauth_confirmed_at`).
* **Instant Session Invalidation:** Suspending an account or resetting a password immediately revokes all active sessions for that user in D1.

### 6.4 Hierarchical Account Control Plane UI (`AccountControlModal.svelte`)
* **Self-Service Tab:** View personal profile details (Name, Email, Role, Tier, Department), and change password with current password verification.
* **Operators Directory Tab (Tier 0 & 1 only):**
  - Searchable list of all operators with live status badges (`ACTIVE`, `SUSPENDED`).
  - Provision new operators with assigned role, department, and initial temporary password.
  - 1-Click Administrative Password Reset (generates secure temporary password and flags `must_change_password = 1`).
  - Account Freeze / Unfreeze with mandatory suspension reason modal and real-time session revocation.
* **Audit Trail Tab:** Chronological, immutable view of administrative actions recorded by D1 database triggers.

---

## 7. Internal Command Messaging & Operational Directive System

### 7.1 Architecture & Schema (`migrations/0006_account_admin_and_messaging.sql`)
The messaging engine is embedded directly into the CRM control plane to enable seamless operational communication between Platform Owners, Operations Admins, and Specialists:
* **`internal_threads`:** Thread container supporting `DIRECT` (operator-to-operator) and `ROLE_BROADCAST` (e.g. to all `TRIAGE_SPECIALIST`s).
* **`internal_thread_participants`:** Tracks participant roles (`CREATOR`, `RECIPIENT`, `BROADCAST_MEMBER`), read receipts (`last_read_at`), and directive acknowledgments (`acknowledged_at`).
* **`internal_messages`:** Message records supporting `MESSAGE`, `DIRECTIVE`, and `SYSTEM_NOTICE`.

### 7.2 Priority Flags & Context Deep-Linking
* **Priority Levels:** `NORMAL`, `HIGH`, `CRITICAL` (with visual badges).
* **Deep Context Routing:** Threads can be linked directly to an enquiry (`ENQUIRY`, `#ENQ-xx`). Clicking the context link automatically opens the enquiry in the Lead Inspector pane for instant review.

### 7.3 Operational Directives & 1-Click Acknowledgment
* **Directive Enforcement:** Messages flagged as `DIRECTIVE` enforce `requires_ack = 1`.
* **1-Click Ack Endpoint:** `POST /api/v1/messages/directives/:id/ack` logs the timestamp and user ID of acknowledgment.
* **Supervisory Visibility:** Senders see real-time status: pending amber pill (`⏳ Acknowledgment Pending`) or green confirmation (`✓ Acknowledged by Tariqul Islam at 14:32`).

### 7.4 Global Unread Badge Counter
* The top-bar Account Menu displays an active badge counter (`AccountMenu.svelte`) indicating unread messages and pending directives.

---

## 8. Complete Database Migration History (`0001` to `0006`)

| Migration File | Key Tables / Alterations Created | Purpose & Scope |
| :--- | :--- | :--- |
| **`0001_core_crm_schema.sql`** | `workspaces`, `enquiries`, `messages`, `opportunities`, `audit_ledger`, `ai_extractions`, `courses` | Core relational CRM schema, opportunity stages, course catalogs, audit trail. |
| **`0002_seed_knowledge_and_sample_enquiries.sql`** | Seed rows for BIAI courses, knowledge base articles, and 20 canonical inbound inquiries | Pre-populates the 20 test fixture enquiries, curriculum fees, and dial-tone knowledge bases. |
| **`0003_identity_control_plane.sql`** | `users`, `sessions`, `user_app_scopes`, `auth_events`, `failed_login_attempts` | Tier-based identity control plane, PBKDF2 credentials, session tracking, lockout logic. |
| **`0004_durable_outbound_delivery.sql`** | `ALTER TABLE messages ADD COLUMN provider_message_id, idempotency_key, retry_count, next_retry_at, failure_code` | Durable delivery queue with exponential backoff for WhatsApp/Meta outbound messages. |
| **`0005_delivery_provider_response.sql`** | `ALTER TABLE messages ADD COLUMN last_provider_response TEXT` | Captures raw HTTP delivery payloads from communication providers for auditing. |
| **`0006_account_admin_and_messaging.sql`** | `ALTER TABLE users ADD COLUMN must_change_password, suspended_reason, suspended_by`; `internal_threads`, `internal_thread_participants`, `internal_messages` | Account admin freeze/reset capabilities, Operations Admin seed (`usr_ops_1`), and Command Messaging. |

---

## 9. 100% Data Reconciliation (Task 1 Records)

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
* **Healthy / In SLA:** **14 records**.

---

## 10. Comprehensive Test Verification Suite (36/36 Tests Passing)

The complete Vitest test suite executes in **657ms** with 100% pass rate:

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
   ✓ Full Ingestion Engine > parses Row #1 (Rafi Ahmed Banglish WhatsApp) and generates tone-matched Banglish reply
   ✓ Full Ingestion Engine > parses Row #3 (Mahmud Hasan - embedded role and organization)
   ✓ 48-Hour SLA State Machine > calculates IN_SLA when more than 12h remaining
   ✓ 48-Hour SLA State Machine > flags AT_RISK when 12h or less remaining
   ✓ 48-Hour SLA State Machine > triggers BREACHED when past 48 hours without response
   ✓ 48-Hour SLA State Machine > records MET when response logged within 48 hours

 ✓ tests/api.test.ts (18 tests) 188ms
   ✓ GET /api/health returns healthy status and system metadata with D1 connected
   ✓ Unauthenticated requests to protected CRM endpoints are strictly denied with 401
   ✓ GET /api/v1/enquiries loads 20 enquiries with dynamic SLA calculation for authenticated operator
   ✓ FTS5 search finds messages matching keyword "bootcamp" from SQLite index
   ✓ filters queue by sales leads and support tickets correctly via D1
   ✓ POST /api/v1/enquiries/:id/stage updates opportunity stage in D1 and writes audit ledger
   ✓ POST /api/v1/enquiries/:id/stage rejects invalid stage values with 400 validation error
   ✓ Role Gating: Specialist operator cannot update operational ticket status without supervisor role
   ✓ POST /api/v1/enquiries/:id/status updates operational ticket in D1 with supervisor role
   ✓ POST /api/v1/enquiries/:id/reply records outbound message in D1, meets SLA, and calls WhatsApp adapter
   ✓ scheduled delivery retry sends a queued outbound message and records provider state
   ✓ GET /api/v1/knowledge-base queries ground-truth knowledge base from D1
   ✓ GET /api/webhooks/meta validates hub.challenge handshake token
   ✓ POST /api/webhooks/meta validates HMAC-SHA256 signature, stores event in D1 ledger, and enforces idempotency
   ✓ Identity Control Plane: Login verification, session creation, CSRF enforcement, and lockout
   ✓ Self-service profile update and session inspection
   ✓ Admin user management, privilege delegation & anti-escalation enforcement
   ✓ Internal Command Messaging: directives, acknowledgment & unread count

 Test Files  2 passed (2)
      Tests  36 passed (36)
   Duration  657ms
```

---

## 11. Production Build & Deployment Verification

### 11.1 Client Production Build Evidence
```bash
$ npm run build:client

vite v6.4.5 building for production...
✓ 120 modules transformed.
dist/index.html                   1.50 kB │ gzip:  0.73 kB
dist/assets/index-BRgBPDYg.css   41.50 kB │ gzip:  7.48 kB
dist/assets/index-yzC8fmBs.js   199.11 kB │ gzip: 55.76 kB
✓ built in 1.06s
```

### 11.2 Live Production Endpoint Verification
```bash
# Custom Domain HTTP/2 Edge Verification
$ curl -ILs https://biaicrm.mrong.tech/
HTTP/2 200 
content-type: text/html
server: cloudflare

# Edge Worker Health Ping & Timezone Validation
$ curl -s https://biaicrm.mrong.tech/api/health
{
  "status": "healthy",
  "runtime": "Cloudflare Workers (Edge V8 Isolate)",
  "timezone": "Asia/Dhaka",
  "database": "D1 Connected (biai-crm-db)"
}

# Authentic Woven Brand Asset Verification
$ curl -ILs https://biaicrm.mrong.tech/biai-logo.png
HTTP/2 200 
content-type: image/png
server: cloudflare
```
