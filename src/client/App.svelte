<script lang="ts">
  import { onMount } from 'svelte';
  import { parseIncomingMessage } from '../lib/engine/parser';
  import { calculateSlaStatus } from '../lib/engine/sla';
  import { soundFx } from '../lib/audio/sound_fx.ts';
  import type { ExtractionResult, PipelineStage, Channel } from '../lib/types/crm';

  // --- THEME & VIEWPORT STATE ---
  let theme = $state<'dark' | 'light'>('light');
  let viewMode = $state<'inbox' | 'board'>('inbox');
  let evaluatorMode = $state(false);
  let showPortalsMenu = $state(false);
  let showParserModal = $state(false);
  let audioEnabled = $state(soundFx.enabled);

  // Ingestion Modal State
  let ingestSenderName = $state('Tanvir Hossain');
  let ingestPhone = $state('+8801712345678');
  let ingestChannel = $state<Channel>('WhatsApp');
  let ingestMessage = $state('Assalamualaikum, amader corporate team er jonno AI bootcamp quote lagbe. 25 jon engineer attend korbe.');

  // --- AUTHENTICATION & OPERATOR STATE ---
  let currentUser = $state<{
    id: string;
    email: string;
    full_name: string;
    department?: string;
    role: string;
    security_tier: string;
    scopes: string[];
  } | null>(null);
  let csrfToken = $state('');
  let authChecking = $state(true);
  let loginEmail = $state('tanvir@biai.com.bd');
  let loginPassword = $state('RepPassword2026!');
  let loginMfaCode = $state('');
  let loginRequiresMfa = $state(false);
  let loginError = $state<string | null>(null);
  let loginLoading = $state(false);

  // --- DATA & TRIAGE STATE ---
  let enquiries = $state<any[]>([]);
  let selectedId = $state<number>(1);
  let activeQueue = $state<'sales' | 'billing' | 'escalation' | 'careers' | 'spam' | 'all'>('sales');
  let activeFilter = $state<'all' | 'p0' | 'at_risk' | 'corporate' | 'bangla'>('all');
  let searchQuery = $state('');

  // Simulation Clock: baseline reference checkpoint
  let simTime = $state<string>('2026-10-28T12:00:00');
  let copyFeedback = $state<string | null>(null);

  // Inspector Action State
  let editableReply = $state('');

  async function checkAuth() {
    authChecking = true;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        currentUser = await res.json();
        await loadEnquiries();
      } else {
        currentUser = null;
        enquiries = [];
      }
    } catch {
      currentUser = null;
    } finally {
      authChecking = false;
    }
  }

  async function loadEnquiries() {
    try {
      const r = await fetch('/api/v1/enquiries?queue=all', { credentials: 'include' });
      if (r.ok) {
        const res = await r.json();
        if (res?.data && Array.isArray(res.data)) {
          enquiries = res.data;
          if (enquiries.length > 0 && !selectedId) {
            selectedId = enquiries[0].id;
          }
        }
      }
    } catch (e) {
      console.log('Failed to fetch enquiries:', e);
    }
  }

  async function handleLogin() {
    loginLoading = true;
    loginError = null;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          mfaCode: loginRequiresMfa ? loginMfaCode : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        loginError = data.error || 'Authentication failed';
        loginLoading = false;
        return;
      }
      if (data.requiresMfa) {
        loginRequiresMfa = true;
        loginLoading = false;
        return;
      }
      csrfToken = data.csrfToken || '';
      currentUser = data.user;
      loginRequiresMfa = false;
      await loadEnquiries();
    } catch (err: any) {
      loginError = err.message || 'Network error during login';
    } finally {
      loginLoading = false;
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        credentials: 'include'
      });
    } catch {}
    currentUser = null;
    csrfToken = '';
    enquiries = [];
  }

  function quickLogin(email: string, pass: string) {
    loginEmail = email;
    loginPassword = pass;
    handleLogin();
  }

  // --- KEYBOARD & THEME INITIALIZATION ---
  onMount(() => {
    // 1. Theme initialization
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      theme = 'dark';
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      theme = 'light';
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }

    // 2. Authoritative Auth Check
    checkAuth();

    const handleKeydown = (e: KeyboardEvent) => {
      // Cmd+K -> Focus Search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = document.getElementById('global-search') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
      // J / K Navigation across conversations
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectNextLead(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectNextLead(-1);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  function toggleAudio() {
    audioEnabled = soundFx.toggle();
    if (audioEnabled) {
      showFeedback('🔊 Audio FX enabled (Web Audio synthesized)');
    } else {
      showFeedback('🔇 Audio FX muted');
    }
  }

  // --- RECONCILED DATA & ORTHOGONAL SLA EVALUATION ---
  let evaluatedEnquiries = $derived(
    enquiries.map(rec => {
      const effectiveSimTime = evaluatorMode ? simTime : '2026-10-28T12:00:00';
      const sla = calculateSlaStatus(rec.received_at, rec.first_response_at, effectiveSimTime);

      // Business Priority (Orthogonal to time)
      let businessPriority: 'P0' | 'P1' | 'P2' | 'P3' = 'P2';
      let priorityReason = 'Standard Admission Inquiry';

      if (rec.triage_category === 'CRITICAL_ESCALATION' || (rec.flags && rec.flags.includes('PR_RISK'))) {
        businessPriority = 'P0';
        priorityReason = 'Public PR Escalation / Refund Threat';
      } else if (rec.triage_category === 'SUPPORT_BILLING') {
        businessPriority = 'P1';
        priorityReason = 'bKash Verification Pending';
      } else if ((rec.seats && rec.seats >= 10) || rec.is_repeat_sender) {
        businessPriority = 'P1';
        priorityReason = rec.seats && rec.seats >= 10 ? `Corporate Account (${rec.seats} seats)` : '2x Repeat Chaser';
      } else if (rec.triage_category === 'CAREERS_HR') {
        businessPriority = 'P3';
        priorityReason = 'Career Applicant';
      } else if (rec.triage_category === 'SPAM_SECURITY') {
        businessPriority = 'P3';
        priorityReason = 'Automated Quarantine';
      }

      // SLA State
      const isMet = !!rec.first_response_at;
      const slaState: 'HEALTHY' | 'AT_RISK' | 'BREACHED' | 'MET' = isMet
        ? 'MET'
        : sla.isBreached
          ? 'BREACHED'
          : sla.isAtRisk
            ? 'AT_RISK'
            : 'HEALTHY';

      // 6-Tier Urgency Matrix & Priority Glow
      let urgencyTier: 0 | 1 | 2 | 3 | 4 | 5 = 4;
      let urgencyLabel = '';
      let urgencyGlowClass = '';
      let urgencyRailClass = '';

      if (isMet) {
        urgencyTier = 5;
        urgencyLabel = '✓ SLA Met';
        urgencyRailClass = 'rail-met';
        urgencyGlowClass = 'border-slate-200 dark:border-slate-800';
      } else if (sla.isBreached || businessPriority === 'P0') {
        const overdueHours = Math.abs(sla.hoursRemaining);
        if (overdueHours >= 2 || businessPriority === 'P0') {
          urgencyTier = 0; // > 2h overdue or P0 PR threat
          urgencyLabel = businessPriority === 'P0'
            ? '🚨 P0 · CRITICAL'
            : `🚨 OVERDUE ${Math.round(overdueHours)}h`;
          urgencyGlowClass = 'border-red-600 shadow-[0_0_18px_rgba(220,38,38,0.45)] ring-2 ring-red-500/60 animate-pulse bg-red-50/50 dark:bg-red-950/30';
          urgencyRailClass = 'rail-p0';
        } else {
          urgencyTier = 1; // 1h - 2h overdue
          urgencyLabel = `⚠️ OVERDUE ${Math.round(overdueHours)}h`;
          urgencyGlowClass = 'border-rose-500 shadow-[0_0_14px_rgba(225,29,72,0.35)] ring-1 ring-rose-400/50 bg-rose-50/40 dark:bg-rose-950/20';
          urgencyRailClass = 'rail-p0';
        }
      } else if (sla.hoursRemaining <= 1) {
        urgencyTier = 2; // < 1h remaining (Critical Imminent Breach)
        const mins = Math.max(1, Math.round(sla.hoursRemaining * 60));
        urgencyLabel = `🔥 CRITICAL · ${mins}m LEFT`;
        urgencyGlowClass = 'border-orange-500 shadow-[0_0_14px_rgba(234,88,12,0.4)] ring-1 ring-orange-500/60 animate-pulse bg-orange-50/40 dark:bg-orange-950/25';
        urgencyRailClass = 'rail-at-risk';
      } else if (sla.hoursRemaining <= 3) {
        urgencyTier = 3; // 1h - 3h remaining (At Risk Warning)
        urgencyLabel = `⏳ At Risk · ${Math.round(sla.hoursRemaining)}h left`;
        urgencyGlowClass = 'border-amber-400 shadow-[0_0_10px_rgba(217,119,6,0.3)] ring-1 ring-amber-400/40 bg-amber-50/30 dark:bg-amber-950/15';
        urgencyRailClass = 'rail-at-risk';
      } else {
        urgencyTier = 4; // Healthy (> 3h)
        urgencyLabel = `In SLA · ${Math.round(sla.hoursRemaining)}h left`;
        urgencyGlowClass = 'border-warm-200 dark:border-slate-800';
        urgencyRailClass = 'rail-healthy';
      }

      return {
        ...rec,
        businessPriority,
        priorityReason,
        slaState,
        railClass: urgencyRailClass,
        urgencyTier,
        urgencyLabel,
        urgencyGlowClass,
        sla_hours_remaining: sla.hoursRemaining,
        sla_formatted: isMet ? 'SLA Met' : sla.formattedTimeRemaining,
        is_breached: !isMet && sla.isBreached,
        is_at_risk: !isMet && sla.isAtRisk
      };
    })
  );

  // Queue & Filter Stream
  let filteredEnquiries = $derived(
    evaluatedEnquiries.filter(e => {
      // 1. Queue Separation
      if (activeQueue === 'sales' && e.triage_category !== 'SALES_LEAD') return false;
      if (activeQueue === 'billing' && e.triage_category !== 'SUPPORT_BILLING') return false;
      if (activeQueue === 'escalation' && e.triage_category !== 'CRITICAL_ESCALATION') return false;
      if (activeQueue === 'careers' && e.triage_category !== 'CAREERS_HR') return false;
      if (activeQueue === 'spam' && e.triage_category !== 'SPAM_SECURITY') return false;

      // 2. Saved Quick Filters
      if (activeFilter === 'p0' && e.businessPriority !== 'P0') return false;
      if (activeFilter === 'at_risk' && !e.is_at_risk && !e.is_breached) return false;
      if (activeFilter === 'corporate' && (!e.seats || e.seats < 10)) return false;
      if (activeFilter === 'bangla' && e.detected_language !== 'BN_SCRIPT') return false;

      // 3. Search Query (sender, organization, phone, message content, ID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = e.sender_name?.toLowerCase().includes(q);
        const matchesOrg = (e as any).organization?.toLowerCase().includes(q);
        const matchesPhone = e.phone?.includes(q) || e.normalized_phone?.includes(q);
        const matchesMsg = e.message?.toLowerCase().includes(q);
        const matchesId = String(e.id) === q || `lead-${e.id}` === q;
        if (!matchesName && !matchesOrg && !matchesPhone && !matchesMsg && !matchesId) return false;
      }

      return true;
    })
  );

  // Selected Lead (Guaranteed Selection)
  let selectedEnquiry = $derived(
    filteredEnquiries.find(e => e.id === selectedId) ||
    evaluatedEnquiries.find(e => e.id === selectedId) ||
    filteredEnquiries[0] ||
    evaluatedEnquiries[0]
  );

  // Sync draft reply whenever selected enquiry changes
  $effect(() => {
    if (selectedEnquiry) {
      editableReply = selectedEnquiry.suggested_reply || '';
    }
  });

  function selectLead(id: number) {
    selectedId = id;
    const item = evaluatedEnquiries.find(e => e.id === id);
    if (item) {
      if (item.urgencyTier === 0) {
        soundFx.playEmergencyAlert();
      } else if (item.urgencyTier === 1 || item.urgencyTier === 2 || item.urgencyTier === 3) {
        soundFx.playWarningPing();
      }
    }
  }

  function selectNextLead(delta: number) {
    const list = filteredEnquiries;
    if (list.length === 0) return;
    const currentIndex = list.findIndex(e => e.id === selectedId);
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= list.length) nextIndex = list.length - 1;
    selectLead(list[nextIndex].id);
  }

  // --- ACTIONS ---
  async function approveReply(id: number) {
    const textToSend = editableReply;
    enquiries = enquiries.map(e => {
      if (e.id === id) {
        return {
          ...e,
          first_response_at: new Date().toISOString(),
          pipeline_stage: 'Contacted' as PipelineStage,
          reply_status: 'SENT',
          outbound_reply: textToSend
        };
      }
      return e;
    });
    soundFx.playActionSuccess();
    showFeedback('Outbound response approved & sent. SLA timer met.');

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify({ replyText: textToSend, channel: selectedEnquiry.channel })
    }).catch(e => console.log('Local action cached', e));
  }

  async function transitionStage(id: number, stage: PipelineStage) {
    enquiries = enquiries.map(e => {
      if (e.id === id) {
        return { ...e, pipeline_stage: stage };
      }
      return e;
    });
    soundFx.playActionSuccess();
    showFeedback(`Stage transitioned to ${stage}`);

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify({ newStage: stage })
    }).catch(e => console.log('Local action cached', e));
  }

  async function transitionTicketStatus(id: number, status: string, notes?: string) {
    enquiries = enquiries.map(e => {
      if (e.id === id) {
        return { ...e, ticket_status: status, is_escalated: status === 'ESCALATED' };
      }
      return e;
    });
    soundFx.playWarningPing();
    showFeedback(`Ticket status updated: ${status}`);

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify({ newStatus: status, notes })
    }).catch(e => console.log('Local action cached', e));
  }

  function scrubSimTime(newTime: string) {
    const prevBreached = evaluatedEnquiries.filter(e => e.is_breached).length;
    simTime = newTime;
    setTimeout(() => {
      const newBreached = evaluatedEnquiries.filter(e => e.is_breached).length;
      if (newBreached > prevBreached) {
        soundFx.playWarningPing();
      }
    }, 50);
  }

  function ingestCustomMessage() {
    if (!ingestMessage.trim()) return;

    const extraction = parseIncomingMessage(ingestMessage, ingestChannel);
    const newId = enquiries.length > 0 ? Math.max(...enquiries.map(e => e.id)) + 1 : 1;

    const newEnquiry: any = {
      id: newId,
      channel: ingestChannel,
      received_at: new Date().toISOString(),
      sender_name: ingestSenderName || 'Direct Inbound Customer',
      phone: ingestPhone || null,
      normalized_phone: extraction.normalized_phone || ingestPhone || null,
      contact_id: `ct_${newId}`,
      detected_language: extraction.detected_language,
      language_confidence: extraction.confidence,
      program_intent: extraction.program_intent,
      triage_category: extraction.triage_category,
      urgency: extraction.urgency,
      sentiment: extraction.sentiment,
      pipeline_stage: 'New' as PipelineStage,
      estimated_value_bdt: extraction.estimated_budget_bdt || 0,
      seats: extraction.seats_detected || 1,
      sla_due_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      first_response_at: null,
      message: ingestMessage,
      suggested_reply: extraction.suggested_reply,
      reply_status: 'PENDING',
      flags: extraction.urgency === 'CRITICAL' ? ['PR_RISK'] : []
    };

    enquiries = [newEnquiry, ...enquiries];
    selectedId = newId;
    showParserModal = false;

    if (extraction.triage_category === 'CRITICAL_ESCALATION') {
      soundFx.playEmergencyAlert();
      showFeedback(`🚨 Ingested P0 Critical Ticket #${newId}`);
    } else {
      soundFx.playNewMessage();
      showFeedback(`✅ Ingested Enquiry #${newId} (${extraction.triage_category})`);
    }

    ingestMessage = '';
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showFeedback(`Copied ${label} to clipboard`);
  }

  function showFeedback(msg: string) {
    copyFeedback = msg;
    setTimeout(() => { copyFeedback = null; }, 2500);
  }

  function exportCsv() {
    const headers = ['ID', 'Channel', 'Sender', 'Phone', 'Normalized Phone', 'Queue', 'Stage', 'Value BDT', 'Seats', 'SLA Due', 'First Response', 'Message'];
    const rows = filteredEnquiries.map(e => [
      e.id,
      e.channel,
      `"${e.sender_name}"`,
      `"${e.phone || ''}"`,
      `"${e.normalized_phone || ''}"`,
      e.triage_category,
      e.pipeline_stage,
      e.estimated_value_bdt || 0,
      e.seats || 1,
      e.sla_due_at,
      e.first_response_at || '',
      `"${e.message.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biai-crm-${activeQueue}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    showFeedback('CSV exported successfully');
  }

  // --- RECONCILED FINANCIALS & COUNTS ---
  let salesLeads = $derived(evaluatedEnquiries.filter(e => e.triage_category === 'SALES_LEAD'));
  let totalPipelineValue = $derived(salesLeads.reduce((s, e) => s + (e.estimated_value_bdt || 0), 0));
  let totalCorporateSeats = $derived(salesLeads.reduce((s, e) => s + ((e.seats && e.seats > 1) ? e.seats : 0), 0));
  let atRiskCount = $derived(evaluatedEnquiries.filter(e => e.is_at_risk).length);
  let breachedCount = $derived(evaluatedEnquiries.filter(e => e.is_breached).length);

  const salesStages: PipelineStage[] = ['New', 'Contacted', 'Interested', 'Paid', 'Lost'];
</script>

<!-- APPLICATION CONTAINER -->
<div class="h-screen w-screen flex flex-col overflow-hidden bg-warm-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-orange-600 selection:text-white">

  <!-- ======================================================== -->
  <!-- 1. TOP COMMAND BAR (AUTHENTIC BIAI ECOSYSTEM HEADER)      -->
  <!-- ======================================================== -->
  <header class="h-14 border-b border-warm-200 dark:border-slate-800 bg-[#FAF9F6] dark:bg-[#080C14] px-4 flex items-center justify-between gap-4 shrink-0 z-30 transition-colors">

    <!-- Left: Authentic BIAI Brand Identity & Ecosystem Navigation -->
    <div class="flex items-center gap-5">
      <!-- Official BIAI Circular Woven Emblem & Spaced Wordmark -->
      <a href="https://biai.com.bd" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 group">
        <img src="/biai-logo.png" alt="Bangladesh Institute of AI" class="w-8 h-8 rounded-full shrink-0 object-contain shadow-xs transition group-hover:scale-105" />
        <span class="font-bold tracking-[0.3em] text-slate-900 dark:text-white text-base">B I A I</span>
      </a>

      <!-- Ecosystem Workspace Navigation Links (Styled to match biai.com.bd navbar) -->
      <nav class="hidden md:flex items-center gap-1 text-xs font-medium">
        <!-- Active CRM Triage link with authentic BIAI bottom underline bar -->
        <span class="relative py-4 px-3 font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5 cursor-default">
          <span>CRM Triage</span>
          <span class="absolute bottom-0 left-2 right-2 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full"></span>
        </span>

        <!-- Switch to Task 2 Corporate Pipeline -->
        <a
          href="/task2"
          title="Switch to Corporate Pipeline workspace"
          class="py-4 px-3 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition">
          Corporate Pipeline
        </a>

        <!-- External BIAI Portals directly from biai.com.bd -->
        <a
          href="https://biai.com.bd/courses"
          target="_blank"
          rel="noopener noreferrer"
          class="py-4 px-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition flex items-center gap-1">
          <span>Courses</span>
          <svg class="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>

        <a
          href="https://biai.com.bd"
          target="_blank"
          rel="noopener noreferrer"
          class="py-4 px-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition flex items-center gap-1">
          <span>For Business</span>
          <svg class="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        </a>
      </nav>
    </div>

    <!-- Center: Global Search (Cmd+K) -->
    <div class="flex-1 max-w-md relative">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>
      <input
        id="global-search"
        type="text"
        bind:value={searchQuery}
        placeholder="Search sender, company, phone (+880), keyword...  ⌘K"
        class="w-full text-xs pl-9 pr-14 py-1.5 rounded-lg border border-warm-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-600 transition"
      />
      {#if searchQuery}
        <button
          onclick={() => searchQuery = ''}
          class="absolute inset-y-0 right-2 my-auto h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center">
          ✕ Clear
        </button>
      {:else}
        <kbd class="absolute right-2.5 top-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono pointer-events-none border border-slate-200 dark:border-slate-800 px-1 rounded">⌘K</kbd>
      {/if}
    </div>

    <!-- Right: Utility Controls & Primary CTA -->
    <div class="flex items-center gap-2">
      <!-- Sound FX Toggle Button -->
      <button
        onclick={toggleAudio}
        aria-label="Toggle audio effects"
        title={audioEnabled ? 'Audio FX Enabled (Click to Mute)' : 'Audio FX Muted (Click to Unmute)'}
        class="text-xs p-1.5 rounded flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-warm-100 dark:hover:bg-slate-800 transition">
        {#if audioEnabled}
          <span class="text-emerald-600 dark:text-emerald-400 font-mono text-sm" title="Audio On">🔊</span>
        {:else}
          <span class="text-slate-400 font-mono text-sm" title="Audio Muted">🔇</span>
        {/if}
      </button>

      <!-- Evaluator Mode Sandbox Toggle -->
      <button
        onclick={() => evaluatorMode = !evaluatorMode}
        class={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${evaluatorMode ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-600 dark:text-amber-300' : 'bg-white text-slate-600 border-warm-200 hover:bg-warm-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
        title="Toggle Time Machine evaluation fixture">
        <span class={`w-1.5 h-1.5 rounded-full ${evaluatorMode ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></span>
        <span>Evaluator Mode</span>
      </button>

      <!-- CSV Export -->
      <button
        onclick={exportCsv}
        aria-label="Export CSV"
        title="Export active queue to CSV"
        class="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white p-1.5 rounded hover:bg-warm-100 dark:hover:bg-slate-800 transition">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      </button>

      <!-- Theme Switcher -->
      <button
        onclick={toggleTheme}
        aria-label="Toggle theme"
        title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        class="p-1.5 rounded text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-warm-100 dark:hover:bg-slate-800 transition">
        {#if theme === 'dark'}
          <svg class="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        {:else}
          <svg class="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
        {/if}
      </button>

      <!-- Authenticated Operator Badge & Logout -->
      {#if currentUser}
        <div class="hidden sm:flex items-center gap-2 pl-2 border-l border-warm-200 dark:border-slate-800">
          <div class="text-right">
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{currentUser.full_name}</div>
            <div class="text-[10px] font-mono text-orange-600 dark:text-orange-400 leading-tight">{currentUser.security_tier} · {currentUser.role}</div>
          </div>
          <button
            onclick={handleLogout}
            class="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-medium transition"
            title="Sign out of BIAI CRM Control Plane">
            Sign Out
          </button>
        </div>
      {/if}

      <!-- Primary Action Button (Authentic BIAI Orange Pill matching Start Building) -->
      <button
        onclick={() => showParserModal = true}
        class="text-xs font-semibold bg-[#C2410C] hover:bg-[#EA580C] text-white px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm hover:shadow-orange-600/30 active:scale-[0.97] transition">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span>+ Ingest Message</span>
      </button>
    </div>
  </header>

  {#if authChecking}
    <div class="flex-1 flex items-center justify-center bg-warm-50 dark:bg-slate-950">
      <div class="flex flex-col items-center gap-3">
        <div class="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
        <div class="text-xs text-slate-500 font-mono">Verifying BIAI Operator Session...</div>
      </div>
    </div>
  {:else if !currentUser}
    <!-- LOGIN OVERLAY -->
    <div class="flex-1 flex items-center justify-center p-4 bg-[#FAF9F6] dark:bg-[#080C14]">
      <div class="w-full max-w-md p-8 rounded-2xl border border-warm-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl">
        <!-- Brand Header -->
        <div class="flex items-center gap-3 mb-6">
          <img src="/biai-logo.png" alt="BIAI" class="w-10 h-10 rounded-full shrink-0" />
          <div>
            <h1 class="text-lg font-bold text-slate-900 dark:text-white tracking-wide">BIAI CRM Control Plane</h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">Restricted Operations & Inbound Triage Gateway</p>
          </div>
        </div>

        {#if loginError}
          <div class="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs">
            {loginError}
          </div>
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
          <div>
            <label for="login-email" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Work Email</label>
            <input
              id="login-email"
              type="email"
              bind:value={loginEmail}
              required
              class="w-full text-xs px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-orange-600 outline-none"
              placeholder="operator@biai.com.bd"
            />
          </div>

          <div>
            <label for="login-password" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input
              id="login-password"
              type="password"
              bind:value={loginPassword}
              required
              class="w-full text-xs px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-orange-600 outline-none"
            />
          </div>

          {#if loginRequiresMfa}
            <div class="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900">
              <label for="login-mfa" class="block text-xs font-semibold text-orange-900 dark:text-orange-200 mb-1">MFA Security Code</label>
              <input
                id="login-mfa"
                type="text"
                bind:value={loginMfaCode}
                required
                maxlength="6"
                class="w-full text-center font-mono text-base tracking-widest px-3 py-1.5 rounded-lg border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-orange-600 outline-none"
                placeholder="000000"
              />
              <p class="text-[10px] text-orange-700 dark:text-orange-300/80 mt-1">Enter 6-digit code from your authenticator app</p>
            </div>
          {/if}

          <button
            type="submit"
            disabled={loginLoading}
            class="w-full py-2 px-4 rounded-lg bg-[#C2410C] hover:bg-[#EA580C] text-white font-semibold text-xs shadow transition disabled:opacity-50">
            {loginLoading ? 'Authenticating...' : (loginRequiresMfa ? 'Verify MFA & Enter' : 'Sign In')}
          </button>
        </form>

        <!-- Quick Operator Access for Evaluation/Demo -->
        <div class="mt-6 pt-5 border-t border-warm-200 dark:border-slate-800">
          <div class="text-[11px] font-semibold text-slate-500 mb-2">Demo / Evaluation Profiles:</div>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              onclick={() => quickLogin('admin@biai.com.bd', 'AdminPassword2026!')}
              class="text-[10px] p-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-500 transition text-center">
              <div class="font-bold">Tier 0</div>
              <div class="text-[9px] opacity-75">Platform Owner</div>
            </button>
            <button
              type="button"
              onclick={() => quickLogin('supervisor@biai.com.bd', 'SupervisorPassword2026!')}
              class="text-[10px] p-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-500 transition text-center">
              <div class="font-bold">Tier 2</div>
              <div class="text-[9px] opacity-75">Team Lead</div>
            </button>
            <button
              type="button"
              onclick={() => quickLogin('tanvir@biai.com.bd', 'RepPassword2026!')}
              class="text-[10px] p-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-orange-500 transition text-center">
              <div class="font-bold">Tier 3</div>
              <div class="text-[9px] opacity-75">Specialist</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  {:else}

  <!-- ======================================================== -->
  <!-- 2. SANDBOXED EVALUATOR BANNER (ONLY WHEN ACTIVE)          -->
  <!-- ======================================================== -->
  {#if evaluatorMode}
    <div class="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
      <div class="flex items-center gap-2">
        <span class="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
          Evaluation Harness Active
        </span>
        <span class="text-amber-800 dark:text-amber-300/80">· Fixture Reference Clock:</span>
        <span class="font-mono font-bold text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded">
          {simTime.replace('T', ' ')} (Asia/Dhaka)
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 text-[11px] mr-1">Scrub Clock:</span>
        <button
          onclick={() => scrubSimTime('2026-10-27T12:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100">
          -24h
        </button>
        <button
          onclick={() => scrubSimTime('2026-10-28T00:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100">
          -12h
        </button>
        <button
          onclick={() => scrubSimTime('2026-10-28T12:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white shadow-xs">
          Baseline (Oct 28)
        </button>
        <button
          onclick={() => scrubSimTime('2026-10-29T00:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100">
          +12h
        </button>
        <button
          onclick={() => scrubSimTime('2026-10-29T12:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100">
          +24h
        </button>
        <button
          onclick={() => scrubSimTime('2026-10-30T12:00:00')}
          class="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100">
          +48h
        </button>
        <button
          onclick={() => { evaluatorMode = false; simTime = '2026-10-28T12:00:00'; }}
          class="ml-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline text-[11px]">
          ✕ Exit
        </button>
      </div>
    </div>
  {/if}

  <!-- ======================================================== -->
  <!-- 3. RECONCILED KPI SUMMARY STRIP                           -->
  <!-- ======================================================== -->
  <div class="h-9 bg-warm-100/80 dark:bg-slate-900/40 border-b border-warm-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs shrink-0">
    <div class="flex items-center gap-5 text-slate-600 dark:text-slate-400">
      <div class="flex items-center gap-1.5">
        <span>Scope:</span>
        <span class="font-semibold text-slate-900 dark:text-white capitalize">
          {activeQueue === 'all' ? 'All Inquiries' : `${activeQueue} Queue`}
        </span>
        <span class="text-[11px] text-slate-400">({filteredEnquiries.length} of {evaluatedEnquiries.length} total)</span>
      </div>

      <div class="h-3.5 w-[1px] bg-warm-300 dark:bg-slate-800"></div>

      <div class="flex items-center gap-1.5">
        <span>Active Pipeline:</span>
        <span class="font-bold font-mono text-emerald-700 dark:text-emerald-400">৳ {totalPipelineValue.toLocaleString()} BDT</span>
        <span class="text-[11px] text-slate-400">(Sales Leads)</span>
      </div>

      <div class="h-3.5 w-[1px] bg-warm-300 dark:bg-slate-800"></div>

      <div class="flex items-center gap-1.5">
        <span>Corporate Demand:</span>
        <span class="font-bold font-mono text-slate-900 dark:text-white">{totalCorporateSeats} Seats</span>
        <span class="text-[11px] text-slate-400">(Rows #3, #10, #18)</span>
      </div>
    </div>

    <!-- SLA Health Pills -->
    <div class="flex items-center gap-2 font-mono text-[11px]">
      {#if atRiskCount > 0}
        <span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          {atRiskCount} At Risk (&lt;12h)
        </span>
      {/if}
      {#if breachedCount > 0}
        <span class="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800 flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          {breachedCount} SLA Breached
        </span>
      {/if}
    </div>
  </div>

  <!-- ======================================================== -->
  <!-- 4. THREE-PANE DESKTOP WORKSPACE (LINEAR / STRIPE GRADE)   -->
  <!-- ======================================================== -->
  <div class="flex-1 flex overflow-hidden">

    <!-- ------------------------------------------------------ -->
    <!-- PANE 1: QUEUE & FILTER NAVIGATION (220px Fixed)        -->
    <!-- ------------------------------------------------------ -->
    <aside class="w-56 border-r border-warm-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 flex flex-col justify-between shrink-0 overflow-y-auto">
      <div class="p-3 space-y-4">
        <!-- Triage Queues -->
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Triage Queues
          </div>
          <nav class="space-y-0.5 text-xs">
            <button
              onclick={() => activeQueue = 'sales'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'sales' ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Sales Pipeline</span>
              </div>
              <span class="font-mono text-[11px] text-slate-500">
                {evaluatedEnquiries.filter(e => e.triage_category === 'SALES_LEAD').length}
              </span>
            </button>

            <button
              onclick={() => activeQueue = 'billing'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'billing' ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Billing Verification</span>
              </div>
              <span class="font-mono text-[11px] text-slate-500">
                {evaluatedEnquiries.filter(e => e.triage_category === 'SUPPORT_BILLING').length}
              </span>
            </button>

            <button
              onclick={() => activeQueue = 'escalation'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'escalation' ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>P0 Escalations</span>
              </div>
              <span class="font-mono text-[11px] text-rose-600 font-bold">
                {evaluatedEnquiries.filter(e => e.triage_category === 'CRITICAL_ESCALATION').length}
              </span>
            </button>

            <button
              onclick={() => activeQueue = 'careers'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'careers' ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-sky-500"></span>
                <span>Careers & HR</span>
              </div>
              <span class="font-mono text-[11px] text-slate-500">
                {evaluatedEnquiries.filter(e => e.triage_category === 'CAREERS_HR').length}
              </span>
            </button>

            <button
              onclick={() => activeQueue = 'spam'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'spam' ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                <span>Quarantined Spam</span>
              </div>
              <span class="font-mono text-[11px] text-slate-500">
                {evaluatedEnquiries.filter(e => e.triage_category === 'SPAM_SECURITY').length}
              </span>
            </button>

            <button
              onclick={() => activeQueue = 'all'}
              class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${activeQueue === 'all' ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white font-semibold' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-slate-700 dark:bg-slate-300"></span>
                <span>All Records</span>
              </div>
              <span class="font-mono text-[11px] opacity-80">
                {evaluatedEnquiries.length}
              </span>
            </button>
          </nav>
        </div>

        <!-- Saved Focus Filters -->
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Quick Filters
          </div>
          <div class="space-y-0.5 text-xs">
            <button
              onclick={() => activeFilter = 'all'}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'all' ? 'text-orange-700 dark:text-orange-300 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              All Inquiries
            </button>
            <button
              onclick={() => activeFilter = 'p0'}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'p0' ? 'text-rose-700 dark:text-rose-300 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              🚨 P0 PR Threats
            </button>
            <button
              onclick={() => activeFilter = 'at_risk'}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'at_risk' ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              ⚠️ At Risk (&lt;12h)
            </button>
            <button
              onclick={() => activeFilter = 'corporate'}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'corporate' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              🏢 Corporate Whales
            </button>
            <button
              onclick={() => activeFilter = 'bangla'}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'bangla' ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              🇧🇩 Bangla Unicode
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="p-3 border-t border-warm-200 dark:border-slate-800 text-[11px] text-slate-400">
        <div class="flex items-center justify-between">
          <span>Engine: Cloudflare D1</span>
          <span class="w-2 h-2 rounded-full bg-emerald-500" title="Edge Isolate Active"></span>
        </div>
      </div>
    </aside>

    <!-- ------------------------------------------------------ -->
    <!-- PANE 2: CONVERSATION STREAM OR KANBAN BOARD            -->
    <!-- ------------------------------------------------------ -->
    {#if viewMode === 'inbox'}
      <section class="w-[420px] border-r border-warm-200 dark:border-slate-800 bg-warm-50 dark:bg-slate-950 flex flex-col shrink-0 overflow-hidden">
        <!-- Stream Header with View Toggle -->
        <div class="h-10 border-b border-warm-200 dark:border-slate-800 px-3.5 flex items-center justify-between bg-white dark:bg-slate-900 text-xs shrink-0">
          <div class="flex items-center gap-2 text-slate-500">
            <span class="font-semibold text-slate-800 dark:text-slate-200">
              {filteredEnquiries.length} Conversations
            </span>
            {#if searchQuery}
              <span class="text-[11px] text-orange-600">(filtered)</span>
            {/if}
          </div>

          <!-- View Switcher: Inbox Stream vs Kanban Board -->
          <div class="flex items-center gap-1 bg-warm-100 dark:bg-slate-800 p-0.5 rounded-md text-[11px]">
            <button
              onclick={() => viewMode = 'inbox'}
              class="px-2 py-0.5 rounded font-medium transition bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs">
              Inbox
            </button>
            <button
              onclick={() => viewMode = 'board'}
              class="px-2 py-0.5 rounded font-medium transition text-slate-500 hover:text-slate-800">
              Board
            </button>
          </div>
        </div>

        <!-- Inquiry Cards Scroll Area -->
        <div class="flex-1 overflow-y-auto p-2.5 space-y-2.5">
          {#if filteredEnquiries.length === 0}
            <div class="py-16 text-center text-slate-400 dark:text-slate-600 text-xs italic">
              No inquiries match active queue and filters.
            </div>
          {:else}
            {#each filteredEnquiries as item (item.id)}
              {@const isSelected = selectedEnquiry && selectedEnquiry.id === item.id}

              <div
                role="button"
                tabindex="0"
                onclick={() => selectLead(item.id)}
                onkeydown={(e) => { if (e.key === 'Enter') selectLead(item.id); }}
                class={`group relative w-full text-left p-3.5 rounded-xl border transition-all duration-150 cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 ${item.railClass} ${item.urgencyGlowClass} ${
                  isSelected
                    ? 'bg-orange-50/80 border-orange-400 dark:bg-orange-950/30 dark:border-orange-700 shadow-sm'
                    : 'bg-white hover:bg-warm-100/70 border-warm-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-850'
                }`}>

                <!-- Card Top Row: Sender, Org, Financial/Seat -->
                <div class="flex items-start justify-between gap-2">
                  <div class="truncate">
                    <div class="flex items-center gap-1.5">
                      <span class={`font-semibold text-xs ${isSelected ? 'text-orange-950 dark:text-orange-200' : 'text-slate-900 dark:text-white'}`}>
                        {item.sender_name}
                      </span>
                      {#if item.is_repeat_sender}
                        <span class="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          2x
                        </span>
                      {/if}
                      {#if item.urgencyTier <= 1}
                        <span class="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                      {/if}
                    </div>
                    {#if (item as any).organization}
                      <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {(item as any).organization}
                      </p>
                    {/if}
                  </div>

                  <!-- Financial Value or Seat Count -->
                  <div class="text-right shrink-0">
                    {#if item.estimated_value_bdt}
                      <span class="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        ৳ {item.estimated_value_bdt.toLocaleString()}
                      </span>
                    {:else if item.seats && item.seats > 1}
                      <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {item.seats} seats
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- Dynamic Zoom & Content Expansion: expands on hover so operator can read full message before opening -->
                <p class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 group-hover:line-clamp-none transition-all duration-200 my-2 font-bengali leading-relaxed group-hover:text-[13.5px] group-hover:text-slate-950 dark:group-hover:text-white">
                  "{item.message}"
                </p>

                <!-- Dynamic Hover Metadata Peek: reveals phone, intent, and prompt on hover -->
                <div class="hidden group-hover:flex items-center justify-between text-[11px] py-1 px-2 mb-1.5 rounded-lg bg-warm-100/95 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border border-warm-200 dark:border-slate-700 shadow-xs transition-all">
                  <span class="font-mono font-medium">{item.normalized_phone || item.phone || 'No phone'}</span>
                  <span class="text-orange-600 dark:text-orange-400 font-semibold">{item.program_intent || 'General'}</span>
                  <span class="text-[10px] text-slate-400 font-mono">↵ Inspect</span>
                </div>

                <!-- Card Footer: Orthogonal Priority & SLA Pill -->
                <div class="flex items-center justify-between text-[10px] pt-1.5 border-t border-warm-100 dark:border-slate-800/80">
                  <div class="flex items-center gap-2">
                    <!-- Channel Icon / Name -->
                    <span class="text-slate-500 font-medium">
                      {item.channel}
                    </span>
                    <span>·</span>
                    <span class="text-slate-500">
                      {item.detected_language === 'BN_SCRIPT' ? 'বাংলা' : item.detected_language}
                    </span>
                  </div>

                  <!-- Tiered Urgency Glow Pill -->
                  <div class="flex items-center gap-1 font-mono">
                    {#if item.urgencyTier === 0}
                      <span class="px-1.5 py-0.5 rounded font-bold bg-rose-600 text-white shadow-xs">
                        {item.urgencyLabel}
                      </span>
                    {:else if item.urgencyTier === 1}
                      <span class="px-1.5 py-0.5 rounded font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                        {item.urgencyLabel}
                      </span>
                    {:else if item.urgencyTier === 2}
                      <span class="px-1.5 py-0.5 rounded font-bold bg-orange-500 text-white">
                        {item.urgencyLabel}
                      </span>
                    {:else if item.urgencyTier === 3}
                      <span class="px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        {item.urgencyLabel}
                      </span>
                    {:else if item.urgencyTier === 5}
                      <span class="px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {item.urgencyLabel}
                      </span>
                    {:else}
                      <span class="px-1.5 py-0.5 rounded text-slate-500 bg-warm-100 dark:bg-slate-800">
                        {item.businessPriority} · {item.sla_formatted}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {:else}
      <!-- KANBAN BOARD VIEW -->
      <section class="flex-1 min-w-0 border-r border-warm-200 dark:border-slate-800 bg-warm-100/50 dark:bg-slate-950 flex flex-col overflow-hidden">
        <!-- Board Header with Switcher -->
        <div class="h-10 border-b border-warm-200 dark:border-slate-800 px-4 flex items-center justify-between bg-white dark:bg-slate-900 text-xs shrink-0">
          <div class="flex items-center gap-3">
            <span class="font-bold text-slate-900 dark:text-white">Pipeline Stages</span>
            <span class="text-slate-400 font-mono text-[11px]">({filteredEnquiries.length} total)</span>
          </div>

          <div class="flex items-center gap-1 bg-warm-100 dark:bg-slate-800 p-0.5 rounded-md text-[11px]">
            <button
              onclick={() => viewMode = 'inbox'}
              class="px-2 py-0.5 rounded font-medium transition text-slate-500 hover:text-slate-800">
              Inbox
            </button>
            <button
              onclick={() => viewMode = 'board'}
              class="px-2 py-0.5 rounded font-medium transition bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs">
              Board
            </button>
          </div>
        </div>

        <!-- 5 Stage Columns -->
        <div class="flex-1 overflow-x-auto p-4 flex gap-4">
          {#each salesStages as stage}
            {@const stageItems = filteredEnquiries.filter(e => e.pipeline_stage === stage)}
            {@const stageSum = stageItems.reduce((acc, e) => acc + (e.estimated_value_bdt || 0), 0)}
            <div class="w-72 shrink-0 flex flex-col bg-white/70 dark:bg-slate-900/60 rounded-xl border border-warm-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div class="p-3 border-b border-warm-200 dark:border-slate-800 bg-warm-50 dark:bg-slate-850 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-xs text-slate-800 dark:text-slate-200">{stage}</span>
                  <span class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-warm-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    {stageItems.length}
                  </span>
                </div>
                {#if stageSum > 0}
                  <span class="font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    ৳ {(stageSum / 1000).toFixed(0)}k
                  </span>
                {/if}
              </div>

              <!-- Stage Cards -->
              <div class="p-2 overflow-y-auto space-y-2 flex-1">
                {#if stageItems.length === 0}
                  <div class="py-8 text-center text-slate-400 text-xs italic">
                    No inquiries in {stage}
                  </div>
                {:else}
                  {#each stageItems as item (item.id)}
                    {@const isSelected = selectedEnquiry && selectedEnquiry.id === item.id}
                    <div
                      role="button"
                      tabindex="0"
                      onclick={() => selectLead(item.id)}
                      onkeydown={(e) => { if (e.key === 'Enter') selectLead(item.id); }}
                      class={`group relative w-full text-left p-3 rounded-lg border transition-all duration-150 cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 ${item.railClass} ${item.urgencyGlowClass} ${
                        isSelected
                          ? 'bg-orange-50/80 border-orange-400 dark:bg-orange-950/30 dark:border-orange-700 shadow-sm'
                          : 'bg-white hover:bg-warm-100/70 border-warm-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-850'
                      }`}>
                      <div class="flex items-start justify-between gap-1">
                        <span class="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {item.sender_name}
                        </span>
                        {#if item.estimated_value_bdt}
                          <span class="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                            ৳ {item.estimated_value_bdt.toLocaleString()}
                          </span>
                        {/if}
                      </div>

                      <p class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 group-hover:line-clamp-none transition-all duration-200 my-2 font-bengali leading-relaxed group-hover:text-[13px] group-hover:text-slate-950 dark:group-hover:text-white">
                        "{item.message}"
                      </p>

                      <div class="hidden group-hover:flex items-center justify-between text-[10px] py-1 px-1.5 mb-1.5 rounded bg-warm-100/90 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-warm-200 dark:border-slate-700 font-mono">
                        <span>{item.normalized_phone || item.phone || 'No phone'}</span>
                        <span class="text-orange-600 dark:text-orange-400 font-semibold">↵ Open</span>
                      </div>

                      <div class="flex items-center justify-between text-[10px] pt-1 border-t border-warm-100 dark:border-slate-800 font-mono">
                        <span class="text-slate-400">{item.channel}</span>
                        <span class="font-semibold">{item.urgencyLabel}</span>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ------------------------------------------------------ -->
    <!-- PANE 3: PERSISTENT LEAD INSPECTOR & AI ACTION STUDIO   -->
    <!-- ------------------------------------------------------ -->
    <main class={`${viewMode === 'board' ? 'w-[450px] shrink-0 border-l border-warm-200 dark:border-slate-800' : 'flex-1'} bg-white dark:bg-slate-900 flex flex-col overflow-y-auto`}>
      {#if !selectedEnquiry}
        <div class="m-auto text-center py-20 text-slate-400 text-sm">
          Select an inquiry from the inbox stream to inspect.
        </div>
      {:else}
        <!-- Inspector Top Header: Contact Identity & Actions -->
        <div class="p-6 border-b border-warm-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-warm-50/50 dark:bg-slate-900/60">
          <div>
            <div class="flex items-center gap-2.5">
              <h2 class="text-lg font-bold text-slate-900 dark:text-white">
                {selectedEnquiry.sender_name}
              </h2>

              <span class={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                selectedEnquiry.businessPriority === 'P0'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-warm-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}>
                {selectedEnquiry.businessPriority} · {selectedEnquiry.priorityReason}
              </span>
            </div>

            <!-- Organization & Role -->
            {#if (selectedEnquiry as any).organization}
              <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {(selectedEnquiry as any).role ? `${(selectedEnquiry as any).role}, ` : ''}{(selectedEnquiry as any).organization}
              </p>
            {/if}

            <!-- Contact Metadata Row -->
            <div class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono">
              <span class="flex items-center gap-1">
                <span>Channel:</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200">{selectedEnquiry.channel}</span>
              </span>

              {#if selectedEnquiry.normalized_phone || selectedEnquiry.phone}
                <span class="flex items-center gap-1">
                  <span>Phone:</span>
                  <span class="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedEnquiry.normalized_phone || selectedEnquiry.phone}
                  </span>
                  <button
                    onclick={() => copyToClipboard(selectedEnquiry.normalized_phone || selectedEnquiry.phone, 'Phone number')}
                    class="text-orange-600 hover:text-orange-700 ml-1 text-[11px]"
                    title="Copy normalized phone number">
                    📋
                  </button>
                </span>
              {:else}
                <span class="text-amber-600 font-sans text-[11px]">
                  ⚠️ Missing Phone Number (Ask in reply)
                </span>
              {/if}

              <span>·</span>
              <span>Received: {selectedEnquiry.received_at}</span>
            </div>
          </div>

          <!-- Pipeline Stage Selector Dropdown (Strict Sales Opportunity Vocabulary) -->
          <div class="flex items-center gap-2">
            {#if (selectedEnquiry as any).ticket_status && (selectedEnquiry as any).ticket_status !== 'OPEN'}
              <span class="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                Ticket: {(selectedEnquiry as any).ticket_status}
              </span>
            {/if}
            <label for="stage-select" class="text-xs text-slate-400">Stage:</label>
            <select
              id="stage-select"
              value={selectedEnquiry.pipeline_stage}
              onchange={(e) => transitionStage(selectedEnquiry.id, (e.target as HTMLSelectElement).value as PipelineStage)}
              class="text-xs font-medium border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-orange-600 focus:outline-none">
              {#each salesStages as st}
                <option value={st}>{st}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- Inspector Content Body -->
        <div class="p-6 space-y-6 flex-1">

          <!-- SLA Policy & Pacing Card -->
          <div class="bg-warm-50 dark:bg-slate-850 p-4 rounded-xl border border-warm-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span class="text-slate-500">48-Hour SLA Status:</span>
              <div class="flex items-center gap-2 mt-1">
                {#if selectedEnquiry.first_response_at}
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    SLA Met (Response Logged {selectedEnquiry.first_response_at.slice(0, 16)})
                  </span>
                {:else if selectedEnquiry.is_breached}
                  <span class="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                    SLA Breached ({selectedEnquiry.sla_hours_remaining}h overdue)
                  </span>
                {:else if selectedEnquiry.is_at_risk}
                  <span class="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                    At Risk ({selectedEnquiry.sla_formatted} remaining)
                  </span>
                {:else}
                  <span class="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    In SLA ({selectedEnquiry.sla_formatted} remaining)
                  </span>
                {/if}
              </div>
            </div>

            <div class="text-right font-mono text-[11px] text-slate-400">
              <div>Deadline: {selectedEnquiry.sla_due_at}</div>
              <div>Timezone: Asia/Dhaka (10am–7pm)</div>
            </div>
          </div>

          <!-- Original Customer Inbound Message (Distinct Quote Box) -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Original Inbound Message
              </span>
              <span class="text-[11px] text-slate-400">
                Language: <strong class="text-slate-700 dark:text-slate-300">{selectedEnquiry.detected_language}</strong>
                ({Math.round((selectedEnquiry.language_confidence || 1) * 100)}% confidence)
              </span>
            </div>

            <div class="bg-warm-50 dark:bg-slate-950 p-4 rounded-xl border-l-4 border-orange-500 border-t border-r border-b border-warm-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-100 font-bengali leading-relaxed">
              "{selectedEnquiry.message}"
            </div>
          </div>

          <!-- AI Dialect-Matched Reply Composer -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Dialect-Matched Suggested Reply
                </span>
                <span class="text-[10px] font-mono bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 px-1.5 py-0.5 rounded">
                  Tone: Respectful Professional
                </span>
              </div>

              {#if selectedEnquiry.suggested_reply_alt}
                <button
                  onclick={() => editableReply = selectedEnquiry.suggested_reply_alt}
                  class="text-[11px] text-orange-600 hover:underline">
                  Switch to Alt Dialect
                </button>
              {/if}
            </div>

            <textarea
              bind:value={editableReply}
              rows="4"
              class="w-full text-sm p-3.5 rounded-xl border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-slate-100 font-bengali leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-600"
              placeholder="Draft your reply..."></textarea>

            <!-- Reply Actions -->
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center gap-2">
                {#if selectedEnquiry.businessPriority === 'P0'}
                  <button
                    onclick={() => transitionTicketStatus(selectedEnquiry.id, 'ESCALATED', 'P0 PR risk escalated to supervisor')}
                    class="text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition">
                    🚨 Escalate to Supervisor
                  </button>
                {/if}

                <button
                  onclick={() => copyToClipboard(editableReply, 'Suggested reply')}
                  class="text-xs font-medium bg-warm-100 hover:bg-warm-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-2 rounded-lg transition">
                  📋 Copy Reply
                </button>
              </div>

              <button
                onclick={() => approveReply(selectedEnquiry.id)}
                class="text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white px-5 py-2 rounded-full flex items-center gap-2 shadow-sm shadow-orange-600/20 active:scale-[0.98] transition">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                <span>Approve & Send Outbound</span>
              </button>
            </div>
          </div>

          <!-- Audit Log Trail -->
          <div class="pt-4 border-t border-warm-200 dark:border-slate-800">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Record Audit Lineage
            </span>
            <div class="text-[11px] font-mono text-slate-500 space-y-1">
              <div>• [{selectedEnquiry.received_at}] Ingestion via {selectedEnquiry.channel} webhook (ID: {selectedEnquiry.id})</div>
              <div>• [{selectedEnquiry.received_at}] Triaged to {selectedEnquiry.triage_category} (Priority: {selectedEnquiry.businessPriority})</div>
              {#if selectedEnquiry.first_response_at}
                <div class="text-emerald-600 dark:text-emerald-400">• [{selectedEnquiry.first_response_at.slice(0, 16)}] First outbound response approved (Stage: Contacted)</div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </main>
  </div>

  <!-- Ingest Inbound Message Modal -->
  {#if showParserModal}
    <div class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-warm-200 dark:border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-orange-600"></span>
            <h3 class="text-sm font-bold text-slate-900 dark:text-white">Ingest Inbound Inquiry / Webhook</h3>
          </div>
          <button
            onclick={() => showParserModal = false}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm">
            ✕
          </button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label for="ingest-name" class="block text-slate-500 font-medium mb-1">Customer / Sender Name</label>
            <input
              id="ingest-name"
              type="text"
              bind:value={ingestSenderName}
              class="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-600"
              placeholder="e.g. Tanvir Hossain"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label for="ingest-phone" class="block text-slate-500 font-medium mb-1">Phone Number (+880)</label>
              <input
                id="ingest-phone"
                type="text"
                bind:value={ingestPhone}
                class="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-orange-600"
                placeholder="+8801712345678"
              />
            </div>

            <div>
              <label for="ingest-channel" class="block text-slate-500 font-medium mb-1">Inbound Channel</label>
              <select
                id="ingest-channel"
                bind:value={ingestChannel}
                class="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-600">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Facebook Messenger">Facebook Messenger</option>
                <option value="Website form">Website form</option>
                <option value="Phone call note">Phone call note</option>
                <option value="Facebook comment">Facebook comment</option>
              </select>
            </div>
          </div>

          <div>
            <label for="ingest-msg" class="block text-slate-500 font-medium mb-1">Raw Customer Inbound Message (Bangla / Banglish / English)</label>
            <textarea
              id="ingest-msg"
              bind:value={ingestMessage}
              rows="4"
              class="w-full p-3 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bengali leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-600"
              placeholder="Paste raw customer message..."></textarea>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-warm-200 dark:border-slate-800">
          <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Deterministic Triage Engine</span>
            <span>·</span>
            <span>Zero Hallucination</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              onclick={() => showParserModal = false}
              class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white text-xs">
              Cancel
            </button>
            <button
              onclick={ingestCustomMessage}
              class="px-4 py-1.5 rounded-full bg-[#C2410C] hover:bg-[#EA580C] text-white font-semibold text-xs shadow-sm hover:shadow-orange-600/30 active:scale-95 transition">
              Parse & Ingest Inquiry
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}

  <!-- Toast Notification Feedback -->
  {#if copyFeedback}
    <div class="fixed bottom-4 right-4 bg-slate-900 text-white dark:bg-white dark:text-slate-950 px-4 py-2 rounded-lg text-xs font-medium shadow-lg z-50 animate-bounce">
      {copyFeedback}
    </div>
  {/if}
</div>
