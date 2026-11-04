# BIAI CRM Triage — Project Submission Note

**Candidate:** Subho Mrong  
**Submission Date:** 5 November 2026  
**Live Application:** [https://biaicrm.mrong.tech](https://biaicrm.mrong.tech)  
**Code Repository:** [https://github.com/mrongSubho/biai-crm](https://github.com/mrongSubho/biai-crm)  
**Automated Tests:** 48 / 48 Passing (Vitest)  
**Walkthrough Video (4.5 min):** [Loom Video URL]

---

### Tech Stack & Architecture Choices

* **Runtime:** Cloudflare Workers (Edge V8 Isolates)
* **Database:** Cloudflare D1 (Distributed Edge SQLite)
* **Frontend:** Svelte 5 (Runes)

**Why this stack:**
* **Instant local performance:** Cloudflare Workers execute directly at Cloudflare’s Dhaka edge node (<50 ms response), avoiding the high latency and cold-start delays common with traditional servers.
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
* **48-Hour Response SLA Tracker**: Clear countdowns show exactly how much time is left to reply—or how long a message is overdue in plain hours and minutes (e.g., `1h 55m overdue`), without confusing negative decimals.
* **Weekly Executive Summary**: A dedicated report covering Saturday to Friday that gives management a bird's-eye view of lead volume, active pipeline value, channel breakdown, and missing phone numbers.

---

### 2. AI Toolchain & Practical Application

#### **AI Agent Harness & Model Orchestration**
* **Agentic Harness:** Google Antigravity & GitHub Copilot
* **Architecture, Design & Strategy Planning:** GPT Sol 5.6, Gemini Argon 4, Opus 5.5
* **High-Speed Implementation & Edge Engineering:** Gemini 3.8 Flash, GPT Sol 5.6
* **Production Runtime Inference:** Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct`) for edge extraction and tone-matched drafting.

#### **How AI is Applied in the CRM**
1. **Zero-Friction Detail Extraction**: When an inquiry arrives in informal Banglish—e.g., *"amader corporate team er jonno AI bootcamp quote lagbe. 25 jon engineer attend korbe"*—the system automatically extracts the contact, team size (25 engineers), intent, and estimated deal value without manual form-filling.
2. **Context-Aware Reply Drafting**: Generates sensible first-draft responses aligned with the specific course or corporate program mentioned, saving the admissions team from typing repetitive greetings.
3. **Deterministic Fail-Safe Rules**: If an external AI endpoint times out or is offline, built-in keyword and triage heuristics take over so the inbox **never crashes or freezes**.

---

### 3. Current Limitations (What Needs Live Credentials)

* **Official WhatsApp Cloud API**: In this demo environment, outbound WhatsApp messages run in sandbox simulation mode, and incoming webhooks run via authenticated test fixtures. Hooking up live, 2-way background messaging requires BIAI's verified Meta Business Account credentials.
* **Audio Voice Notes**: Phone call notes are currently logged manually as text entries. Direct voice note speech-to-text transcription isn't hooked up yet.

---

### 4. What I Would Add Next

1. **Direct WhatsApp & Messenger 2-Way Sync**: Connect BIAI’s live Meta WABA account so counselor replies send directly through WhatsApp Cloud API inside the thread.
2. **bKash & Nagad Payment Auto-Match**: Automatically verify transaction IDs (TrxID) sent by students against merchant IPN statements to auto-transition leads to "Paid / Enrolled".
3. **Frontline Voice Memo Transcription**: Allow counselors to record a quick 15-second audio memo after a phone call and have it automatically transcribed into bullet points on the customer’s card.
