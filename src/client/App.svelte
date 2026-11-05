<script lang="ts">
  import { onMount } from 'svelte';
  import { parseIncomingMessage } from '../lib/engine/parser';
  import { calculateSlaStatus, formatDurationHm, formatOverdueDuration } from '../lib/engine/sla';
  import { soundFx } from '../lib/audio/sound_fx.ts';
  import { urgencyPresentation, type Urgency } from '../lib/ui/status';
  import AccountMenu from '../lib/ui/AccountMenu.svelte';
  import AccountControlModal from '../lib/ui/AccountControlModal.svelte';
  import MessagingCenterModal from '../lib/ui/MessagingCenterModal.svelte';
  import Icon from '../lib/ui/Icon.svelte';
  import { detectDialect } from '../lib/engine/dialect';
  import { generateSuggestedReplies, getTriDialectReplies, type TonePreset } from '../lib/engine/replies';
  import { generateWeeklyExecutiveDigest } from '../lib/engine/weekly_digest';
  import WeeklyExecutiveDigest from '../lib/ui/WeeklyExecutiveDigest.svelte';
  import type { ExtractionResult, PipelineStage, Channel } from '../lib/types/crm';

  // --- THEME & VIEWPORT STATE ---
  let theme = $state<'dark' | 'light'>('light');
  let viewMode = $state<'inbox' | 'board' | 'digest'>('inbox');
  let boardInspectorOpen = $state(false);
  let boardScrollContainer: HTMLDivElement | null = $state(null);
  let evaluatorMode = $state(false);
  let showParserModal = $state(false);
  let showAccountModal = $state(false);
  let showMessagingModal = $state(false);
  let messagingContext = $state<{ type: 'ENQUIRY' | 'LEAD'; id: string; label?: string } | null>(null);
  let unreadSummary = $state<{ unreadCount: number; unreadDirectivesCount: number }>({ unreadCount: 0, unreadDirectivesCount: 0 });
  let mobileNavOpen = $state(false);
  let audioEnabled = $state(soundFx.enabled);

  // Ingestion Modal State
  let ingestSenderName = $state('Tanvir Hossain');
  let ingestPhone = $state('+8801712345678');
  let ingestChannel = $state<Channel>('WhatsApp');
  let ingestMessage = $state('Assalamualaikum, amader corporate team er jonno AI bootcamp quote lagbe. 25 jon engineer attend korbe.');
  let ingestTone = $state<TonePreset>('Professional');
  let ingestDialect = $state<'bn' | 'banglish' | 'en'>('banglish');
  let ingestCustomSuggestedReply = $state<string>('');

  let ingestGeneratedReplies = $derived.by(() => {
    if (!ingestMessage.trim()) return null;
    const extraction = parseIncomingMessage(ingestMessage, ingestSenderName, ingestPhone, ingestChannel);
    return getTriDialectReplies({
      senderName: extraction.extracted_name || ingestSenderName || 'Customer',
      detectedLanguage: extraction.detected_language || 'BANGLISH',
      programIntent: extraction.program_intent || 'Bootcamp',
      triageCategory: extraction.triage_category || 'SALES_LEAD',
      normalizedPhone: extraction.normalized_phone || ingestPhone || null,
      seats: extraction.estimated_seats || 1,
      messageContent: ingestMessage
    }, ingestTone);
  });

  let ingestActiveReplyText = $derived.by(() => {
    if (ingestCustomSuggestedReply) return ingestCustomSuggestedReply;
    if (!ingestGeneratedReplies) return '';
    if (ingestDialect === 'bn') return ingestGeneratedReplies.bn;
    if (ingestDialect === 'banglish') return ingestGeneratedReplies.banglish;
    return ingestGeneratedReplies.en;
  });

  function setIngestTone(tone: TonePreset) {
    ingestTone = tone;
    ingestCustomSuggestedReply = '';
  }

  function setIngestDialect(dialect: 'bn' | 'banglish' | 'en') {
    ingestDialect = dialect;
    ingestCustomSuggestedReply = '';
  }

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

  function getCsrfFromCookieOrStorage(): string {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|;\s*)biai_csrf=([^;]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('biai_csrf') || '';
    }
    return '';
  }

  let csrfToken = $state(getCsrfFromCookieOrStorage());

  function getActiveCsrf(): string {
    return csrfToken || getCsrfFromCookieOrStorage();
  }
  let authChecking = $state(true);
  let loginEmail = $state('');
  let loginPassword = $state('');
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
  let feedbackTimer: any = null;

  // Inspector Action State
  let editableReply = $state('');
  let isSendingReply = $state(false);

  // --- OMNICHANNEL CONVERSATION STATE ---
  export interface ConversationItem {
    id: string;
    enquiryId?: number;
    direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL_NOTE';
    channel: Channel;
    senderName: string;
    content: string;
    timestamp: string;
    language?: string;
    languageConfidence?: number;
    deliveryStatus?: string;
    isSimulated?: boolean;
  }

  let threadMessagesMap = $state<Record<string, ConversationItem[]>>({});
  let chatScrollContainer = $state<HTMLDivElement | null>(null);
  let showSimulateModal = $state(false);
  let simulateInputText = $state('');
  let simulateChannel = $state<Channel>('WhatsApp');
  let lastSyncedId = $state<number | null>(null);
  let lastPanelVisibleState = $state(false);
  let isGeneratingReply = $state(false);
  let replyStreamTimeout: any = null;
  let targetFullReply = $state('');

  function cancelReplyStream() {
    if (replyStreamTimeout) {
      clearTimeout(replyStreamTimeout);
      replyStreamTimeout = null;
    }
    isGeneratingReply = false;
  }

  function finishStreamingImmediately() {
    if (isGeneratingReply && targetFullReply) {
      cancelReplyStream();
      editableReply = targetFullReply;
    }
  }

  function streamReplyText(fullText: string, animate: boolean = true) {
    cancelReplyStream();
    targetFullReply = fullText;

    if (!animate || !fullText) {
      editableReply = fullText;
      isGeneratingReply = false;
      return;
    }

    editableReply = '';
    isGeneratingReply = true;

    let index = 0;
    const totalLength = fullText.length;

    function typeNextChunk() {
      if (index >= totalLength) {
        editableReply = fullText;
        isGeneratingReply = false;
        replyStreamTimeout = null;
        return;
      }

      // 1-3 characters at a time for natural streaming velocity
      const chunk = Math.min(Math.floor(Math.random() * 2) + 1, totalLength - index);
      index += chunk;
      editableReply = fullText.slice(0, index);

      // Fast responsive streaming: 8-16ms per tick
      const delay = Math.floor(Math.random() * 8) + 8;
      replyStreamTimeout = setTimeout(typeNextChunk, delay);
    }

    // Brief initial pause before streaming starts (~80ms) for delightful sensation
    replyStreamTimeout = setTimeout(typeNextChunk, 80);
  }

  // Tone & Dialect Switching State
  let activeTone = $state<TonePreset>('Professional');
  let currentDialect = $state<'bn' | 'banglish' | 'en'>('banglish');
  const tonePresets: TonePreset[] = ['Professional', 'Friendly', 'Direct', 'Executive'];

  // Internal Chat Notes State
  let showNoteDrawer = $state(false);
  let newNoteText = $state('');
  const noteQuickTags = [
    '📞 Call Summary',
    '💰 Discount Promised',
    '⏳ Awaiting Payment',
    '📅 Follow-up Required'
  ];

  const simulationPresets = [
    {
      title: 'bKash TrxID (Payment Confirmation)',
      badge: 'Payment Sent',
      text: 'Vai ami 3,500 BDT bKash e send korechi. TrxID: 9L4K2918X. Please confirm amar seat.',
      expectedIntent: 'Payment Verification'
    },
    {
      title: 'Weekend Schedule & Timing',
      badge: 'Logistics',
      text: 'Class gulo ki shudhu weekend e hobe naki weekday teo thakbe? Timing ta koto?',
      expectedIntent: 'Schedule Inquiry'
    },
    {
      title: 'Corporate Bulk Discount (+10 Seats)',
      badge: 'Corporate Expansion',
      text: 'Amader company theke aro 10 jon software engineer add korte chai. Group discount kibhabe pabo?',
      expectedIntent: 'Corporate Discount'
    },
    {
      title: 'Course Certificate & Syllabus PDF',
      badge: 'Curriculum',
      text: 'Course certificate ta ki industry verified? Apnader detailed syllabus brochure ta ektu pathaben please.',
      expectedIntent: 'Curriculum & Certification'
    }
  ];

  async function checkAuth() {
    authChecking = true;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const meData = await res.json();
        currentUser = meData;
        if (meData.csrfToken) {
          csrfToken = meData.csrfToken;
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('biai_csrf', csrfToken);
          }
          if (typeof document !== 'undefined') {
            document.cookie = `biai_csrf=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; Max-Age=604800`;
          }
        }
        await loadEnquiries();
        await refreshUnreadMessages();
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

  async function refreshUnreadMessages() {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/v1/messages/unread-summary');
      const data = await res.json();
      if (res.ok) {
        unreadSummary = data;
      }
    } catch (e) {
      console.error(e);
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
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('biai_csrf', csrfToken);
      }
      if (typeof document !== 'undefined' && csrfToken) {
        document.cookie = `biai_csrf=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax; Max-Age=604800`;
      }
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
        headers: { 'X-CSRF-Token': getActiveCsrf() },
        credentials: 'include'
      });
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('biai_csrf');
      }
      if (typeof document !== 'undefined') {
        document.cookie = 'biai_csrf=; Path=/; SameSite=Lax; Max-Age=0';
      }
    } catch {}
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('biai_csrf');
    }
    currentUser = null;
    csrfToken = '';
    enquiries = [];
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
      } else if (e.key === 'Escape') {
        if (boardInspectorOpen && viewMode === 'board') {
          boardInspectorOpen = false;
          return;
        }
        if (showParserModal) showParserModal = false;
        if (mobileNavOpen) mobileNavOpen = false;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
      cancelReplyStream();
    };
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
      showFeedback('Audio FX enabled (Web Audio synthesized)');
    } else {
      showFeedback('Audio FX muted');
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
      let shortBadge = 'Admission';

      if (rec.triage_category === 'CRITICAL_ESCALATION' || (rec.flags && rec.flags.includes('PR_RISK'))) {
        businessPriority = 'P0';
        priorityReason = 'Public PR Escalation / Refund Threat';
        shortBadge = 'PR Threat';
      } else if (rec.triage_category === 'SUPPORT_BILLING') {
        businessPriority = 'P1';
        priorityReason = 'bKash Verification Pending';
        shortBadge = 'Billing';
      } else if ((rec.seats && rec.seats >= 10) || rec.is_repeat_sender) {
        businessPriority = 'P1';
        if (rec.seats && rec.seats >= 10) {
          priorityReason = `Corporate Account (${rec.seats} seats)`;
          shortBadge = 'Corporate';
        } else {
          priorityReason = '2x Repeat Chaser';
          shortBadge = 'Repeat';
        }
      } else if (rec.triage_category === 'CAREERS_HR') {
        businessPriority = 'P3';
        priorityReason = 'Career Applicant';
        shortBadge = 'Careers';
      } else if (rec.triage_category === 'SPAM_SECURITY') {
        businessPriority = 'P3';
        priorityReason = 'Automated Quarantine';
        shortBadge = 'Spam';
      }

      const orgSuffix = (rec as any).organization ? ` • ${(rec as any).organization}` : '';
      const badgeTooltip = `${businessPriority} · ${priorityReason}${orgSuffix}`;

      // SLA State & Normalized Urgency (Calm Semantic Presentation)
      const isMet = !!rec.first_response_at;
      let urgency: Urgency = 'healthy';
      let urgencyLabel = '';

      if (isMet) {
        urgency = 'met';
        urgencyLabel = 'SLA Met';
      } else if (sla.isBreached || businessPriority === 'P0') {
        urgency = 'critical';
        urgencyLabel = businessPriority === 'P0'
          ? 'P0 · Critical'
          : formatOverdueDuration(sla.hoursRemaining);
      } else if (sla.hoursRemaining <= 3) {
        urgency = 'at-risk';
        urgencyLabel = `At risk · ${formatDurationHm(sla.hoursRemaining)} left`;
      } else {
        urgency = 'healthy';
        urgencyLabel = `In SLA · ${formatDurationHm(sla.hoursRemaining)} left`;
      }

      const meta = urgencyPresentation[urgency];

      return {
        ...rec,
        businessPriority,
        priorityReason,
        shortBadge,
        badgeTooltip,
        urgency,
        urgencyLabel,
        railClass: meta.railClass,
        badgeClass: meta.badgeClass,
        sla_hours_remaining: sla.hoursRemaining,
        sla_formatted: isMet ? 'SLA Met' : sla.formattedTimeRemaining,
        is_breached: !isMet && sla.isBreached,
        is_at_risk: !isMet && sla.isAtRisk
      };
    })
  );

  // Weekly Executive AI Digest (Sat 00:00 - Fri 23:59 Business Cycle)
  let weeklyDigest = $derived(
    generateWeeklyExecutiveDigest(evaluatedEnquiries, evaluatorMode ? simTime : '2026-10-28T12:00:00')
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
        const matchesMsg = (e.message || e.raw_message || '')?.toLowerCase().includes(q);
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

  // Sync draft reply ONLY when the detailed message panel is open and inquiry changes
  $effect(() => {
    const isPanelVisible = viewMode === 'inbox' || boardInspectorOpen;
    if (selectedEnquiry && isPanelVisible) {
      const isNewEnquiry = selectedEnquiry.id !== lastSyncedId;
      const isNewlyOpenedPanel = !lastPanelVisibleState && isPanelVisible;

      if (isNewEnquiry || isNewlyOpenedPanel) {
        lastSyncedId = selectedEnquiry.id;
        lastPanelVisibleState = isPanelVisible;

        const lang = selectedEnquiry.detected_language || selectedEnquiry.language;
        if (lang === 'BN_SCRIPT') {
          currentDialect = 'bn';
        } else if (lang === 'EN') {
          currentDialect = 'en';
        } else {
          currentDialect = 'banglish';
        }
        applyDialectAndTone(currentDialect, activeTone, true);
        scrollChatToBottom(false);
      }
    } else {
      lastPanelVisibleState = isPanelVisible;
      if (!isPanelVisible) {
        cancelReplyStream();
        editableReply = '';
      }
    }
  });

  function applyDialectAndTone(newDialect?: 'bn' | 'banglish' | 'en', newTone?: TonePreset, animate: boolean = true) {
    if (newDialect) currentDialect = newDialect;
    if (newTone) activeTone = newTone;
    if (!selectedEnquiry) return;

    const tri = getTriDialectReplies({
      senderName: selectedEnquiry.sender_name || 'Customer',
      detectedLanguage: selectedEnquiry.detected_language || selectedEnquiry.language || 'BANGLISH',
      programIntent: selectedEnquiry.program_intent || 'Bootcamp',
      triageCategory: selectedEnquiry.triage_category || 'SALES_LEAD',
      normalizedPhone: selectedEnquiry.normalized_phone,
      seats: selectedEnquiry.seats || 1,
      messageContent: selectedEnquiry.message || selectedEnquiry.raw_message || ''
    }, activeTone);

    let chosen = tri.banglish;
    if (currentDialect === 'bn') {
      chosen = tri.bn;
    } else if (currentDialect === 'en') {
      chosen = tri.en;
    }

    streamReplyText(chosen, animate);
  }

  function cycleDialect() {
    if (currentDialect === 'bn') {
      currentDialect = 'banglish';
    } else if (currentDialect === 'banglish') {
      currentDialect = 'en';
    } else {
      currentDialect = 'bn';
    }
    applyDialectAndTone(currentDialect, activeTone, true);
    soundFx.playWarningPing();
    showFeedback(`Switched dialect to ${currentDialect === 'bn' ? 'বাংলা' : currentDialect === 'banglish' ? 'Banglish' : 'English'}`);
  }

  function cycleAiProvider() {
    if (!selectedEnquiry) return;
    const current = selectedEnquiry.ai_provider || 'workers-ai';
    let next: string;
    let label: string;
    if (current.includes('gemini')) {
      next = 'workers-ai';
      label = 'Cloudflare Workers AI (LLaMA 3.3 70B)';
    } else if (current.includes('workers') || current.includes('llama')) {
      next = 'deterministic';
      label = 'Local Heuristic Engine (Deterministic Fallback)';
    } else {
      next = 'gemini-2.5-flash';
      label = 'Google Gemini 2.5 Flash API';
    }

    const target = enquiries.find(e => e.id === selectedEnquiry.id);
    if (target) {
      target.ai_provider = next;
    }
    selectedEnquiry.ai_provider = next;
    soundFx.playWarningPing();
    showFeedback(`Switched AI Provider to ${label}`);
    applyDialectAndTone(currentDialect, activeTone, true);
  }

  let ingestAiProvider = $state<'gemini-2.5-flash' | 'workers-ai' | 'deterministic'>('gemini-2.5-flash');

  function cycleIngestAiProvider() {
    if (ingestAiProvider === 'gemini-2.5-flash') {
      ingestAiProvider = 'workers-ai';
      showFeedback('Ingestion Engine: Cloudflare Workers AI');
    } else if (ingestAiProvider === 'workers-ai') {
      ingestAiProvider = 'deterministic';
      showFeedback('Ingestion Engine: Local Heuristic Fallback');
    } else {
      ingestAiProvider = 'gemini-2.5-flash';
      showFeedback('Ingestion Engine: Google Gemini 2.5 Flash');
    }
    soundFx.playWarningPing();
  }

  function saveInternalNote() {
    if (!newNoteText.trim() || !selectedEnquiry) return;
    const key = getThreadKey(selectedEnquiry);
    const nowIso = new Date().toISOString();
    const newNote: ConversationItem = {
      id: `note_${Date.now()}`,
      enquiryId: selectedEnquiry.id,
      direction: 'INTERNAL_NOTE',
      channel: 'Phone call note',
      senderName: `${currentUser?.full_name || 'Staff'} (Internal Memo)`,
      content: newNoteText.trim(),
      timestamp: nowIso,
      deliveryStatus: 'RECEIVED'
    };

    threadMessagesMap[key] = [...(threadMessagesMap[key] || []), newNote];
    newNoteText = '';
    showNoteDrawer = false;
    soundFx.playActionSuccess();
    showFeedback('Internal staff note added to conversation thread.');
    scrollChatToBottom(true);

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${selectedEnquiry.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getActiveCsrf() },
      credentials: 'include',
      body: JSON.stringify({ newStatus: selectedEnquiry.ticket_status || 'OPEN', notes: newNote.content })
    }).catch(e => console.log('Local action cached', e));
  }

  // --- OMNICHANNEL CONVERSATION THREAD ENGINE ---
  function getThreadKey(enquiry: any): string {
    if (!enquiry) return '';
    return enquiry.normalized_phone || enquiry.phone || enquiry.contact_id || `enquiry_${enquiry.id}`;
  }

  function getThreadMessages(enquiry: any): ConversationItem[] {
    if (!enquiry) return [];
    const key = getThreadKey(enquiry);

    // 1. Gather all base inbound enquiries for this contact across dataset
    const matching = enquiries.filter(e => {
      const eKey = getThreadKey(e);
      return eKey && eKey === key;
    });

    matching.sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());

    const baseItems: ConversationItem[] = [];

    for (const item of matching) {
      const isNote = item.channel === 'Phone call note';
      baseItems.push({
        id: `in_${item.id}`,
        enquiryId: item.id,
        direction: isNote ? 'INTERNAL_NOTE' : 'INBOUND',
        channel: item.channel,
        senderName: item.sender_name || 'Direct Customer',
        content: item.message || item.raw_message || '',
        timestamp: item.received_at,
        language: item.detected_language || item.language,
        languageConfidence: item.language_confidence,
        deliveryStatus: 'RECEIVED'
      });

      // Avoid duplicate outbound turns: if threadMessagesMap[key] already contains an outbound for this enquiry, do not duplicate
      const sessionOutbounds = (threadMessagesMap[key] || []).filter(m => m.direction === 'OUTBOUND' && m.enquiryId === item.id);
      if (item.outbound_reply && item.first_response_at && sessionOutbounds.length === 0) {
        baseItems.push({
          id: `out_base_${item.id}`,
          enquiryId: item.id,
          direction: 'OUTBOUND',
          channel: item.channel,
          senderName: `${currentUser?.full_name || 'BIAI Admissions'} (Admissions)`,
          content: item.outbound_reply,
          timestamp: item.first_response_at,
          deliveryStatus: 'SENT'
        });
      }
    }

    // 2. Merge session turns (outbounds approved or simulated follow-ups)
    const sessionItems = threadMessagesMap[key] || [];
    const existingIds = new Set(baseItems.map(m => m.id));
    const merged = [...baseItems];
    for (const s of sessionItems) {
      if (!existingIds.has(s.id)) {
        merged.push(s);
      }
    }

    merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return merged;
  }

  let activeThreadMessages = $derived(selectedEnquiry ? getThreadMessages(selectedEnquiry) : []);

  let aiThreadDigest = $derived.by(() => {
    if (!selectedEnquiry) return null;
    const msgs = activeThreadMessages;
    const inboundTurns = msgs.filter(m => m.direction === 'INBOUND');
    const outboundTurns = msgs.filter(m => m.direction === 'OUTBOUND');

    if (msgs.length <= 1) {
      return {
        isMultiTurn: false,
        summary: 'Single inbound turn received',
        detail: 'Awaiting primary outbound response'
      };
    }

    return {
      isMultiTurn: true,
      summary: `${inboundTurns.length} Inbound • ${outboundTurns.length} Outbound (${msgs.length} Total Messages)`,
      detail: outboundTurns.length > 0
        ? 'Active two-way dialogue established. Customer engaged.'
        : 'Repeat inquiries detected before staff reply. High response urgency!'
    };
  });

  function scrollChatToBottom(smooth = true) {
    setTimeout(() => {
      if (chatScrollContainer) {
        chatScrollContainer.scrollTo({
          top: chatScrollContainer.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto'
        });
      }
    }, 50);
  }

  function switchViewMode(mode: 'inbox' | 'board' | 'digest') {
    viewMode = mode;
    if (mode === 'board') {
      boardInspectorOpen = false;
    }
  }

  function centerBoardColumn(stage: string) {
    setTimeout(() => {
      const colEl = document.getElementById(`kanban-col-${stage}`);
      if (colEl && boardScrollContainer) {
        colEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 60);
  }

  function selectLead(id: number) {
    selectedId = id;
    const item = evaluatedEnquiries.find(e => e.id === id);
    if (item) {
      if (item.urgency === 'critical') {
        soundFx.playEmergencyAlert();
      } else if (item.urgency === 'at-risk') {
        soundFx.playWarningPing();
      }
    }
    scrollChatToBottom(false);
  }

  function selectLeadOnBoard(id: number, stage: PipelineStage) {
    selectLead(id);
    boardInspectorOpen = true;
    centerBoardColumn(stage);
  }

  function selectNextLead(delta: number) {
    const list = filteredEnquiries;
    if (list.length === 0) return;
    const currentIndex = list.findIndex(e => e.id === selectedId);
    let nextIndex = currentIndex + delta;
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= list.length) nextIndex = list.length - 1;
    const targetLead = list[nextIndex];
    selectLead(targetLead.id);
    if (viewMode === 'board' && boardInspectorOpen && targetLead.pipeline_stage) {
      centerBoardColumn(targetLead.pipeline_stage);
    }
  }

  // --- ACTIONS ---
  async function approveReply(id: number) {
    finishStreamingImmediately();
    const textToSend = editableReply;
    if (!textToSend.trim()) return;
    isSendingReply = true;
    const nowIso = new Date().toISOString();

    enquiries = enquiries.map(e => {
      if (e.id === id) {
        return {
          ...e,
          first_response_at: e.first_response_at || nowIso,
          pipeline_stage: 'Contacted' as PipelineStage,
          reply_status: 'SENT',
          outbound_reply: textToSend
        };
      }
      return e;
    });

    if (selectedEnquiry) {
      const key = getThreadKey(selectedEnquiry);
      const newMsg: ConversationItem = {
        id: `out_${id}_${Date.now()}`,
        enquiryId: id,
        direction: 'OUTBOUND',
        channel: selectedEnquiry.channel,
        senderName: `${currentUser?.full_name || 'BIAI Admissions'} (Admissions)`,
        content: textToSend,
        timestamp: nowIso,
        deliveryStatus: 'SENT'
      };
      threadMessagesMap[key] = [...(threadMessagesMap[key] || []), newMsg];
    }

    soundFx.playActionSuccess();
    showFeedback('Outbound response approved & sent. SLA timer met.');
    scrollChatToBottom(true);

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getActiveCsrf() },
      credentials: 'include',
      body: JSON.stringify({ replyText: textToSend, channel: selectedEnquiry?.channel })
    })
    .catch(e => console.log('Local action cached', e))
    .finally(() => { isSendingReply = false; });
  }

  function executeSimulation(chosenText?: string) {
    if (!selectedEnquiry) return;
    const text = (chosenText || simulateInputText).trim();
    if (!text) return;

    const key = getThreadKey(selectedEnquiry);
    const nowIso = new Date().toISOString();

    const newInboundMsg: ConversationItem = {
      id: `sim_${Date.now()}`,
      enquiryId: selectedEnquiry.id,
      direction: 'INBOUND',
      channel: simulateChannel || selectedEnquiry.channel,
      senderName: selectedEnquiry.sender_name || 'Customer',
      content: text,
      timestamp: nowIso,
      language: detectDialect(text).language,
      languageConfidence: 0.96,
      deliveryStatus: 'RECEIVED',
      isSimulated: true
    };

    threadMessagesMap[key] = [...(threadMessagesMap[key] || []), newInboundMsg];

    // Contextual reply generator for simulation
    const lower = text.toLowerCase();
    const firstName = (selectedEnquiry.sender_name || 'Vai').split(' ')[0];

    if (lower.includes('trxid') || lower.includes('bkash') || lower.includes('send korechi') || lower.includes('3,500') || lower.includes('paid')) {
      const trxMatch = text.match(/trxid:?\s*([a-z0-9]+)/i);
      const trxId = trxMatch ? trxMatch[1].toUpperCase() : '9L4K2918X';
      streamReplyText(`Walaikum Assalam ${firstName} vai! Apnar bKash payment TrxID: ${trxId} amra receive korechi ebong finance team ke verify korte bolechi. Verification complete houa matroi apnar confirmed seat admission voucher ebong Discord onboarding link pathiye deya hobe. Welcome to Bangladesh AI Institute! 🎉`, true);
      
      enquiries = enquiries.map(e => e.id === selectedEnquiry.id ? { ...e, pipeline_stage: 'Interested' as PipelineStage } : e);
      showFeedback(`Payment TrxID detected! Stage moved to Interested & verification reply generated.`);
    } else if (lower.includes('10 jon') || lower.includes('group discount') || lower.includes('corporate') || lower.includes('company')) {
      streamReplyText(`Assalamualaikum ${firstName} vai! Excellent news. Amader 10+ batch corporate enrollment er jonno 15% institutional discount offer ache ebong customized project mentoring provide kora hoy. Apnar company name ebong HR/Finance email ta ki deya jabe? Amra direct official customized quotation invoice pathiye dicchi.`, true);
      showFeedback(`Corporate team expansion detected! Enterprise reply drafted.`);
    } else if (lower.includes('weekend') || lower.includes('timing') || lower.includes('schedule')) {
      streamReplyText(`Walaikum Assalam ${firstName} vai! Amader 3-day AI Bootcamp schedule shudhu Friday & Saturday shondha 7:00 PM theke 10:00 PM porjonto interactive live online Zoom session e hoy. Shob class er full HD recording ebong GitHub source code repository shathe shathe lifetime access hishabe paben.`, true);
      showFeedback(`Schedule inquiry detected! Timing reply drafted.`);
    } else if (lower.includes('certificate') || lower.includes('syllabus') || lower.includes('brochure')) {
      streamReplyText(`Assalamualaikum ${firstName} vai! Ji oboshoy, course sheshe industry-verified digital verifiable credential certificate paben ja LinkedIn e directly add kora jay. Amader comprehensive course syllabus brochure PDF ta ekhane attach kore dicchi: https://biai.com.bd/curriculum/bootcamp-latest.pdf`, true);
      showFeedback(`Syllabus inquiry detected! Curriculum brochure reply drafted.`);
    } else {
      const replyPair = generateSuggestedReplies({
        senderName: selectedEnquiry.sender_name || 'Customer',
        detectedLanguage: detectDialect(text).language,
        programIntent: selectedEnquiry.program_intent || 'Bootcamp',
        triageCategory: selectedEnquiry.triage_category || 'SALES_LEAD',
        normalizedPhone: selectedEnquiry.normalized_phone,
        seats: selectedEnquiry.seats || 1,
        messageContent: text
      });
      streamReplyText(replyPair.primary, true);
      showFeedback(`AI context updated based on customer follow-up.`);
    }

    soundFx.playNewMessage();
    showSimulateModal = false;
    simulateInputText = '';
    scrollChatToBottom(true);
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

    if (viewMode === 'board' && boardInspectorOpen) {
      centerBoardColumn(stage);
    }

    // Persist to D1 in background
    fetch(`/api/v1/enquiries/${id}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getActiveCsrf() },
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
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getActiveCsrf() },
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

  async function ingestCustomMessage() {
    if (!ingestMessage.trim()) return;

    // Fast deterministic parser on client
    const extraction = parseIncomingMessage({
      content: ingestMessage,
      senderRaw: ingestSenderName,
      phoneRaw: ingestPhone,
      channel: ingestChannel
    });
    const newId = enquiries.length > 0 ? Math.max(...enquiries.map(e => e.id)) + 1 : 1;

    const newEnquiry: any = {
      id: newId,
      channel: ingestChannel,
      received_at: new Date().toISOString(),
      sender_name: extraction.extracted_name || ingestSenderName || 'Direct Inbound Customer',
      phone: ingestPhone || extraction.raw_phone || null,
      normalized_phone: extraction.normalized_phone || ingestPhone || null,
      contact_id: `ct_${newId}`,
      detected_language: extraction.detected_language,
      language_confidence: extraction.language_confidence,
      program_intent: extraction.program_intent,
      triage_category: extraction.triage_category,
      urgency: extraction.urgency,
      sentiment: extraction.sentiment,
      pipeline_stage: 'New' as PipelineStage,
      estimated_value_bdt: extraction.estimated_value_bdt || 0,
      seats: extraction.estimated_seats || 1,
      sla_due_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      first_response_at: null,
      message: ingestMessage,
      raw_message: ingestMessage,
      suggested_reply: ingestActiveReplyText || extraction.suggested_replies.primary,
      suggested_reply_alt: ingestGeneratedReplies
        ? (ingestDialect === 'bn' ? ingestGeneratedReplies.en : ingestGeneratedReplies.bn)
        : extraction.suggested_replies.alternate,
      reply_status: 'PENDING',
      flags: extraction.urgency === 'CRITICAL' ? ['PR_RISK'] : []
    };

    enquiries = [newEnquiry, ...enquiries];
    selectedId = newId;
    showParserModal = false;

    // Background server ingestion & D1 persistence
    try {
      const activeCsrf = getActiveCsrf();
      await fetch('/api/v1/enquiries/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeCsrf ? { 'X-CSRF-Token': activeCsrf } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          content: ingestMessage,
          senderRaw: ingestSenderName,
          phoneRaw: ingestPhone,
          channel: ingestChannel
        })
      });
    } catch (e) {
      console.warn('Background sync warning:', e);
    }

    if (extraction.triage_category === 'CRITICAL_ESCALATION') {
      soundFx.playEmergencyAlert();
      showFeedback(`Ingested P0 Critical Ticket #${newId}`);
    } else {
      soundFx.playNewMessage();
      showFeedback(`Ingested Enquiry #${newId} (${extraction.triage_category})`);
    }

    ingestMessage = '';
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    showFeedback(`Copied ${label} to clipboard`);
  }

  function showFeedback(msg: string) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    copyFeedback = msg;
    feedbackTimer = setTimeout(() => { copyFeedback = null; }, 3000);
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
      `"${(e.message || e.raw_message || '').replace(/"/g, '""')}"`
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
<div class="h-dvh w-screen flex flex-col overflow-hidden bg-warm-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans selection:bg-orange-600 selection:text-white">

  <!-- ======================================================== -->
  <!-- 1. TOP COMMAND BAR (AUTHENTIC BIAI ECOSYSTEM HEADER)      -->
  <!-- ======================================================== -->
  <header class="h-14 border-b border-warm-200 dark:border-slate-800 bg-[#FAF9F6] dark:bg-[#080C14] px-4 flex items-center justify-between gap-3 shrink-0 z-30 transition-colors">

    <!-- Left: Authentic BIAI Brand Identity & Ecosystem Navigation -->
    <div class="flex items-center gap-3 md:gap-5">
      <!-- Mobile Drawer Toggle (< 1024px) -->
      <button
        type="button"
        onclick={() => mobileNavOpen = !mobileNavOpen}
        aria-label="Toggle navigation drawer"
        class="lg:hidden p-1.5 rounded-lg border border-warm-200 dark:border-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-warm-100 dark:hover:bg-slate-800 transition">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- Official BIAI Circular Woven Emblem & Spaced Wordmark -->
      <a href="https://biai.com.bd" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2.5 group">
        <img src="/biai-logo.png" alt="Bangladesh Institute of AI" class="w-8 h-8 rounded-full shrink-0 object-contain shadow-xs transition group-hover:scale-105" />
        <span class="font-bold tracking-[0.3em] text-slate-900 dark:text-white text-base">B I A I</span>
      </a>

      <!-- Ecosystem Workspace Navigation Links -->
      <nav class="hidden md:flex items-center gap-1 text-xs font-medium">
        <!-- Active CRM Triage link with authentic BIAI bottom underline bar -->
        <span class="relative py-4 px-3 font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1.5 cursor-default">
          <span>CRM Triage</span>
          <span class="absolute bottom-0 left-2 right-2 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full"></span>
        </span>

        <!-- Switch to Task 2 Corporate Pipeline -->
        <a
          href="https://biaileads.mrong.tech"
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
    <div class="flex-1 max-w-md relative min-w-0">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>
      <input
        id="global-search"
        type="text"
        bind:value={searchQuery}
        placeholder="Search sender, company, phone (+880)... ⌘K"
        class="w-full text-xs pl-9 pr-14 py-1.5 rounded-lg border border-warm-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-600 transition"
      />
      {#if searchQuery}
        <button
          onclick={() => searchQuery = ''}
          class="absolute inset-y-0 right-2 my-auto h-5 px-1.5 text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1">
          <Icon name="x" size={11} />
          <span>Clear</span>
        </button>
      {:else}
        <kbd class="hidden sm:inline-block absolute right-2.5 top-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono pointer-events-none border border-slate-200 dark:border-slate-800 px-1 rounded">⌘K</kbd>
      {/if}
    </div>

    <!-- Right: Utility Controls & Primary CTA -->
    <div class="flex items-center gap-2 shrink-0">
      <!-- Command Messages Button with Unread Badge -->
      <button
        type="button"
        onclick={() => { messagingContext = null; showMessagingModal = true; }}
        class="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-warm-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800 transition flex items-center gap-1.5 shadow-xs"
        title="Open Internal Command Messaging">
        <Icon name="message-square" size={14} class="text-orange-600 dark:text-orange-400" />
        <span class="hidden md:inline">Messages</span>
        {#if unreadSummary.unreadDirectivesCount > 0}
          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-600 text-white animate-pulse">
            {unreadSummary.unreadDirectivesCount}
          </span>
        {:else if unreadSummary.unreadCount > 0}
          <span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-orange-600 text-white">
            {unreadSummary.unreadCount}
          </span>
        {/if}
      </button>

      <!-- Evaluator Mode Sandbox Toggle (Calm state indicator, zero pulse) -->
      <button
        onclick={() => evaluatorMode = !evaluatorMode}
        class={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${evaluatorMode ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-600 dark:text-amber-300' : 'bg-white text-slate-600 border-warm-200 hover:bg-warm-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800 dark:hover:bg-slate-800'}`}
        title="Toggle Time Machine evaluation fixture">
        <span class={`w-1.5 h-1.5 rounded-full ${evaluatorMode ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
        <span class="hidden sm:inline">Evaluator Mode</span>
      </button>

      <!-- CSV Export -->
      <button
        onclick={exportCsv}
        aria-label="Export CSV"
        title="Export active queue to CSV"
        class="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white p-1.5 rounded hover:bg-warm-100 dark:hover:bg-slate-800 transition">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
      </button>

      <!-- Primary Action Button (Authentic BIAI Orange Pill matching Start Building) -->
      <button
        onclick={() => showParserModal = true}
        class="text-xs font-semibold bg-[#C2410C] hover:bg-[#EA580C] text-white px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        <span class="hidden sm:inline">+ Ingest Message</span>
        <span class="sm:hidden">Ingest</span>
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

        <!-- Quick Evaluator Role Selection -->
        <div class="mt-6 pt-5 border-t border-warm-200 dark:border-slate-800">
          <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2.5">
            Quick Evaluator Access (Click to autofill & authenticate):
          </p>
          <div class="grid grid-cols-1 gap-2">
            <button
              type="button"
              onclick={() => { loginEmail = 'admin@biai.com.bd'; loginPassword = 'BiaiAdmin2026!'; handleLogin(); }}
              class="w-full text-left px-3 py-2 rounded-lg bg-warm-50 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700/80 border border-warm-200 dark:border-slate-700 transition flex items-center justify-between group">
              <div>
                <div class="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                  Farhan Ahmed
                </div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  admin@biai.com.bd · Platform Owner (Tier 0)
                </div>
              </div>
              <span class="text-[10px] font-medium text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60 px-2 py-0.5 rounded">
                Full RBAC
              </span>
            </button>

            <button
              type="button"
              onclick={() => { loginEmail = 'supervisor@biai.com.bd'; loginPassword = 'BiaiSuper2026!'; handleLogin(); }}
              class="w-full text-left px-3 py-2 rounded-lg bg-warm-50 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700/80 border border-warm-200 dark:border-slate-700 transition flex items-center justify-between group">
              <div>
                <div class="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                  Nasreen Khan
                </div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  supervisor@biai.com.bd · Supervisor (Tier 2)
                </div>
              </div>
              <span class="text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-950/60 px-2 py-0.5 rounded">
                Escalations
              </span>
            </button>

            <button
              type="button"
              onclick={() => { loginEmail = 'tanvir@biai.com.bd'; loginPassword = 'BiaiSales2026!'; handleLogin(); }}
              class="w-full text-left px-3 py-2 rounded-lg bg-warm-50 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-slate-700/80 border border-warm-200 dark:border-slate-700 transition flex items-center justify-between group">
              <div>
                <div class="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                  Tanvir Islam
                </div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  tanvir@biai.com.bd · Sales Rep (Tier 3)
                </div>
              </div>
              <span class="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                Assigned Queue
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  {:else}

  <!-- ======================================================== -->
  <!-- 2. SANDBOXED EVALUATOR BANNER (CALM & STABLE)             -->
  <!-- ======================================================== -->
  {#if evaluatorMode}
    <div class="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
      <div class="flex items-center gap-2">
        <span class="font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-amber-500"></span>
          Evaluation Harness Active
        </span>
        <span class="text-amber-800 dark:text-amber-300/80">· Fixture Clock:</span>
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
          class="ml-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline text-[11px] flex items-center gap-1">
          <Icon name="x" size={11} />
          <span>Exit</span>
        </button>
      </div>
    </div>
  {/if}

  <!-- ======================================================== -->
  <!-- 3. RECONCILED KPI SUMMARY STRIP                           -->
  <!-- ======================================================== -->
  <div class="h-9 bg-warm-100/80 dark:bg-slate-900/40 border-b border-warm-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs shrink-0 overflow-x-auto min-w-0">
    <div class="flex items-center gap-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
      <div class="flex items-center gap-1.5">
        <span>Scope:</span>
        <span class="font-semibold text-slate-900 dark:text-white capitalize">
          {activeQueue === 'all' ? 'All Inquiries' : `${activeQueue} Queue`}
        </span>
        <span class="text-[11px] text-slate-400 tabular-nums">({filteredEnquiries.length} of {evaluatedEnquiries.length})</span>
      </div>

      <div class="h-3.5 w-[1px] bg-warm-300 dark:bg-slate-800"></div>

      <div class="flex items-center gap-1.5">
        <span>Active Pipeline:</span>
        <span class="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">৳ {totalPipelineValue.toLocaleString()} BDT</span>
      </div>

      <div class="h-3.5 w-[1px] bg-warm-300 dark:bg-slate-800"></div>

      <div class="flex items-center gap-1.5">
        <span>Corporate Demand:</span>
        <span class="font-bold font-mono tabular-nums text-slate-900 dark:text-white">{totalCorporateSeats} Seats</span>
      </div>
    </div>

    <!-- SLA Health Pills -->
    <div class="flex items-center gap-2 font-mono tabular-nums text-[11px] whitespace-nowrap">
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
  <div class="flex-1 flex overflow-hidden min-h-0 relative">

    <!-- ------------------------------------------------------ -->
    <!-- PANE 1: NAVIGATION & BOTTOM-LEFT ACCOUNT MODULE (256px) -->
    <!-- ------------------------------------------------------ -->
    <!-- Desktop Sidebar -->
    <aside class="hidden lg:flex w-64 border-r border-warm-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 flex-col shrink-0 min-h-0">
      <!-- Scrollable Navigation Region -->
      <div class="flex-1 overflow-y-auto overscroll-contain p-3 space-y-4 min-h-0">
        <!-- Triage Queues -->
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Triage Queues
          </div>
          <nav class="space-y-0.5 text-xs">
            {#each [
              { key: 'sales', label: 'Sales Pipeline', dot: 'bg-emerald-500', count: evaluatedEnquiries.filter(e => e.triage_category === 'SALES_LEAD').length },
              { key: 'billing', label: 'Billing Verification', dot: 'bg-amber-500', count: evaluatedEnquiries.filter(e => e.triage_category === 'SUPPORT_BILLING').length },
              { key: 'escalation', label: 'P0 Escalations', dot: 'bg-rose-500', count: evaluatedEnquiries.filter(e => e.triage_category === 'CRITICAL_ESCALATION').length, highlight: true },
              { key: 'careers', label: 'Careers & HR', dot: 'bg-sky-500', count: evaluatedEnquiries.filter(e => e.triage_category === 'CAREERS_HR').length },
              { key: 'spam', label: 'Quarantined Spam', dot: 'bg-slate-400', count: evaluatedEnquiries.filter(e => e.triage_category === 'SPAM_SECURITY').length },
              { key: 'all', label: 'All Records', dot: 'bg-slate-700 dark:bg-slate-300', count: evaluatedEnquiries.length }
            ] as q}
              <button
                type="button"
                onclick={() => { activeQueue = q.key as any; if (viewMode === 'digest') viewMode = 'inbox'; }}
                class={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition ${
                  activeQueue === q.key && viewMode !== 'digest'
                    ? 'bg-orange-50 text-orange-950 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-800 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-warm-100 dark:hover:bg-slate-800 border border-transparent'
                }`}>
                <div class="flex items-center gap-2">
                  <span class={`w-2 h-2 rounded-full ${q.dot}`}></span>
                  <span>{q.label}</span>
                </div>
                <span class={`font-mono text-[11px] tabular-nums ${q.highlight ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                  {q.count}
                </span>
              </button>
            {/each}
          </nav>
        </div>

        <!-- Saved Focus Filters -->
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
            Quick Filters
          </div>
          <div class="space-y-0.5 text-xs">
            <button
              type="button"
              onclick={() => { activeFilter = 'all'; if (viewMode === 'digest') viewMode = 'inbox'; }}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition ${activeFilter === 'all' && viewMode !== 'digest' ? 'text-orange-700 dark:text-orange-300 font-semibold bg-orange-50/50 dark:bg-orange-950/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              All Inquiries
            </button>
            <button
              type="button"
              onclick={() => { activeFilter = 'p0'; if (viewMode === 'digest') viewMode = 'inbox'; }}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${activeFilter === 'p0' && viewMode !== 'digest' ? 'text-rose-700 dark:text-rose-300 font-semibold bg-rose-50/50 dark:bg-rose-950/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              <Icon name="shield-alert" size={13} class="text-rose-500" />
              <span>P0 PR Threats</span>
            </button>
            <button
              type="button"
              onclick={() => { activeFilter = 'at_risk'; if (viewMode === 'digest') viewMode = 'inbox'; }}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${activeFilter === 'at_risk' && viewMode !== 'digest' ? 'text-amber-700 dark:text-amber-300 font-semibold bg-amber-50/50 dark:bg-amber-950/20' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              <Icon name="clock" size={13} class="text-amber-500" />
              <span>At Risk (&lt;12h)</span>
            </button>
            <button
              type="button"
              onclick={() => { activeFilter = 'corporate'; if (viewMode === 'digest') viewMode = 'inbox'; }}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${activeFilter === 'corporate' && viewMode !== 'digest' ? 'text-slate-900 dark:text-white font-semibold bg-warm-100 dark:bg-slate-800' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              <Icon name="building" size={13} class="text-indigo-500" />
              <span>Corporate Whales</span>
            </button>
            <button
              type="button"
              onclick={() => { activeFilter = 'bangla'; if (viewMode === 'digest') viewMode = 'inbox'; }}
              class={`w-full text-left px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 ${activeFilter === 'bangla' && viewMode !== 'digest' ? 'text-slate-900 dark:text-white font-semibold bg-warm-100 dark:bg-slate-800' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
              <span class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span>Bangla Unicode</span>
            </button>
          </div>
        </div>

        <!-- Executive Intelligence (Saturday 00:00 - Friday 23:59 AI Digest) -->
        <div>
          <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center justify-between">
            <span>Executive Insights</span>
            <span class="text-[8.5px] font-mono text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/80 px-1 rounded font-semibold">Sat–Fri</span>
          </div>
          <button
            type="button"
            onclick={() => viewMode = 'digest'}
            class={`w-full text-left p-2.5 rounded-xl border transition group relative overflow-hidden ${
              viewMode === 'digest'
                ? 'bg-gradient-to-br from-orange-500/15 to-amber-500/10 border-orange-500/60 dark:border-orange-500/50 text-slate-900 dark:text-white shadow-xs'
                : 'border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-orange-400/50 hover:bg-orange-50/30 dark:hover:bg-orange-950/20'
            }`}>
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs text-xs font-bold">
                ✨
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-bold truncate flex items-center gap-1.5">
                  <span>Weekly AI Digest</span>
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                  Sat 00:00 – Fri 23:59
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Account Management Module Fixed at Bottom-Left -->
      <div class="p-2.5 border-t border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-900/80 shrink-0">
        <AccountMenu
          {currentUser}
          {theme}
          onToggleTheme={toggleTheme}
          {audioEnabled}
          onToggleAudio={toggleAudio}
          onLogout={handleLogout}
          unreadCount={unreadSummary.unreadCount}
          onOpenAccountControl={() => showAccountModal = true}
          onOpenMessaging={() => { messagingContext = null; showMessagingModal = true; }}
        />
      </div>
    </aside>

    <!-- Mobile Navigation Drawer Overlay (< 1024px) -->
    {#if mobileNavOpen}
      <div class="lg:hidden fixed inset-0 z-40 flex">
        <div
          role="button"
          tabindex="0"
          onclick={() => mobileNavOpen = false}
          onkeydown={(e) => { if (e.key === 'Escape') mobileNavOpen = false; }}
          class="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
          aria-label="Close navigation overlay"></div>

        <div class="relative w-72 max-w-[80vw] bg-white dark:bg-slate-900 border-r border-warm-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-50">
          <div class="p-4 border-b border-warm-200 dark:border-slate-800 flex items-center justify-between">
            <span class="font-bold text-sm tracking-wider text-slate-900 dark:text-white">BIAI CRM NAVIGATION</span>
            <button
              type="button"
              onclick={() => mobileNavOpen = false}
              class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto overscroll-contain p-3 space-y-4 min-h-0">
            <!-- Queues -->
            <div>
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5">Triage Queues</div>
              <nav class="space-y-1 text-xs">
                {#each [
                  { key: 'sales', label: 'Sales Pipeline' },
                  { key: 'billing', label: 'Billing Verification' },
                  { key: 'escalation', label: 'P0 Escalations' },
                  { key: 'careers', label: 'Careers & HR' },
                  { key: 'spam', label: 'Quarantined Spam' },
                  { key: 'all', label: 'All Records' }
                ] as q}
                  <button
                    type="button"
                    onclick={() => { activeQueue = q.key as any; mobileNavOpen = false; }}
                    class={`w-full text-left px-3 py-2 rounded-lg font-medium ${activeQueue === q.key ? 'bg-orange-600 text-white font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-warm-100 dark:hover:bg-slate-800'}`}>
                    {q.label}
                  </button>
                {/each}
              </nav>
            </div>

            <!-- Mobile Executive Insights -->
            <div>
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1.5 flex items-center justify-between">
                <span>Executive Insights</span>
                <span class="text-[9px] font-mono text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/80 px-1 py-0.2 rounded font-semibold">Sat–Fri</span>
              </div>
              <button
                type="button"
                onclick={() => { viewMode = 'digest'; mobileNavOpen = false; }}
                class={`w-full text-left p-2.5 rounded-xl border transition flex items-center gap-2.5 ${
                  viewMode === 'digest'
                    ? 'bg-orange-600 text-white font-semibold border-orange-600'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-warm-100 dark:hover:bg-slate-800 border-warm-200 dark:border-slate-800'
                }`}>
                <span class="text-base">✨</span>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold truncate">Weekly Executive AI Digest</div>
                  <div class="text-[10px] opacity-80 truncate font-mono">Sat 00:00 – Fri 23:59</div>
                </div>
              </button>
            </div>
          </div>

          <div class="p-3 border-t border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-900/80 shrink-0">
            <AccountMenu
              {currentUser}
              {theme}
              onToggleTheme={toggleTheme}
              {audioEnabled}
              onToggleAudio={toggleAudio}
              onLogout={handleLogout}
              unreadCount={unreadSummary.unreadCount}
              onOpenAccountControl={() => { mobileNavOpen = false; showAccountModal = true; }}
              onOpenMessaging={() => { mobileNavOpen = false; messagingContext = null; showMessagingModal = true; }}
            />
          </div>
        </div>
      </div>
    {/if}

    <!-- ------------------------------------------------------ -->
    <!-- PANE 2: CONVERSATION STREAM, KANBAN BOARD, OR DIGEST   -->
    <!-- ------------------------------------------------------ -->
    {#if viewMode === 'digest'}
      <WeeklyExecutiveDigest
        digest={weeklyDigest}
        onClose={() => viewMode = 'inbox'}
        onSelectEnquiry={(id) => {
          selectLead(Number(id));
          viewMode = 'inbox';
        }}
      />
    {:else if viewMode === 'inbox'}
      <section class="flex-1 min-w-[320px] border-r border-warm-200 dark:border-slate-800 bg-warm-50 dark:bg-slate-950 flex flex-col min-h-0 overflow-hidden">
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
              onclick={() => switchViewMode('inbox')}
              class="px-2 py-0.5 rounded font-medium transition bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs">
              Inbox
            </button>
            <button
              onclick={() => switchViewMode('board')}
              class="px-2 py-0.5 rounded font-medium transition text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
              Board
            </button>
          </div>
        </div>

        <!-- Inquiry Cards Scroll Area (Layout Contained & Invariant Geometry) -->
        <div class="work-list flex-1 overflow-y-auto overscroll-contain p-2.5 space-y-2.5 min-h-0">
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
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLead(item.id); } }}
                class={`work-card group relative w-full text-left p-3.5 rounded-xl border transition-colors duration-150 cursor-pointer ${item.railClass} ${
                  isSelected
                    ? 'bg-orange-50/80 border-orange-400 dark:bg-orange-950/30 dark:border-orange-700 ring-2 ring-orange-600/50 dark:ring-orange-500/50'
                    : 'bg-white hover:bg-warm-100/70 border-warm-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 hover:border-warm-300 dark:hover:border-slate-700'
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
                      <span class="font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        ৳ {item.estimated_value_bdt.toLocaleString()}
                      </span>
                    {:else if item.seats && item.seats > 1}
                      <span class="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                        {item.seats} seats
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- Calm Message Body (Strict 2-Line Clamp Without Hover Reflow) -->
                <p class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 my-2 font-bengali leading-relaxed">
                  "{item.message || item.raw_message || ''}"
                </p>

                <!-- Card Footer: Orthogonal Priority & Stable Urgency Badge -->
                <div class="flex items-center justify-between text-[10px] pt-1.5 border-t border-warm-100 dark:border-slate-800/80">
                  <div class="flex items-center gap-1.5 text-slate-500 font-medium truncate">
                    <span>{item.channel}</span>
                    <span>·</span>
                    <span>{(item.detected_language || item.language) === 'BN_SCRIPT' ? 'বাংলা' : (item.detected_language || item.language)}</span>
                    {#if item.program_intent}
                      <span>·</span>
                      <span class="text-orange-600 dark:text-orange-400 font-semibold truncate">{item.program_intent}</span>
                    {/if}
                  </div>

                  <!-- Smart Semantic Urgency Label (One-Lined, No Nested Card) -->
                  <div class="inline-flex items-center gap-1.5 font-mono tabular-nums shrink-0 whitespace-nowrap text-[10px]">
                    {#if item.urgency === 'critical'}
                      <span class="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                      <span class="text-rose-600 dark:text-rose-400 font-semibold">{item.urgencyLabel}</span>
                    {:else if item.urgency === 'at-risk'}
                      <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                      <span class="text-amber-600 dark:text-amber-400 font-semibold">{item.urgencyLabel}</span>
                    {:else if item.urgency === 'met'}
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">SLA Met</span>
                    {:else}
                      <span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                      <span class="text-slate-400 dark:text-slate-500 font-normal">In SLA</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>
    {:else}
      <!-- KANBAN BOARD VIEW (CONTAINED COLUMNS & INVARIANT CARDS) -->
      <section class="flex-1 min-w-0 border-r border-warm-200 dark:border-slate-800 bg-warm-100/50 dark:bg-slate-950 flex flex-col overflow-hidden min-h-0">
        <!-- Board Header with Switcher & Panoramic Status -->
        <div class="h-10 border-b border-warm-200 dark:border-slate-800 px-4 flex items-center justify-between bg-white dark:bg-slate-900 text-xs shrink-0">
          <div class="flex items-center gap-3">
            <span class="font-bold text-slate-900 dark:text-white">Pipeline Stages</span>
            <span class="text-slate-400 font-mono tabular-nums text-[11px]">({filteredEnquiries.length} total)</span>
            {#if boardInspectorOpen}
              <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-950/70 dark:text-orange-300 flex items-center gap-1.5 animate-in fade-in duration-150">
                <span class="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
                <span class="max-w-[130px] sm:max-w-[180px] truncate">Inspecting: {selectedEnquiry?.sender_name || 'Inquiry'}</span>
                <button
                  type="button"
                  onclick={() => boardInspectorOpen = false}
                  class="hover:text-orange-950 dark:hover:text-white ml-0.5 text-xs font-bold leading-none"
                  title="Close inspector and expand all 5 stages (Esc)">×</button>
              </span>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            {#if boardInspectorOpen}
              <button
                type="button"
                onclick={() => boardInspectorOpen = false}
                class="text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-2 py-0.5 rounded border border-warm-200 dark:border-slate-700 hover:bg-warm-100 dark:hover:bg-slate-800 transition flex items-center gap-1"
                title="Expand to panoramic 5-stage pipeline view (Esc)">
                <Icon name="x" size={12} />
                <span class="hidden sm:inline">Show All 5 Stages</span>
                <kbd class="text-[9px] font-mono px-1 py-0.2 rounded bg-warm-200 dark:bg-slate-800 text-slate-500">Esc</kbd>
              </button>
            {/if}

            <div class="flex items-center gap-1 bg-warm-100 dark:bg-slate-800 p-0.5 rounded-md text-[11px]">
              <button
                onclick={() => switchViewMode('inbox')}
                class={`px-2 py-0.5 rounded font-medium transition ${viewMode === 'inbox' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                Inbox
              </button>
              <button
                onclick={() => switchViewMode('board')}
                class={`px-2 py-0.5 rounded font-medium transition ${viewMode === 'board' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
                Board
              </button>
            </div>
          </div>
        </div>

        <!-- 5 Stage Columns (BOARD DOES NOT SCROLL VERTICALLY, COLUMNS FIT VIEWPORT) -->
        <div
          bind:this={boardScrollContainer}
          class="flex-1 overflow-x-auto overflow-y-hidden overscroll-contain p-3.5 flex gap-3 min-w-0 min-h-0">
          {#each salesStages as stage}
            {@const stageItems = filteredEnquiries.filter(e => e.pipeline_stage === stage)}
            {@const stageSum = stageItems.reduce((acc, e) => acc + (e.estimated_value_bdt || 0), 0)}
            <div
              id={`kanban-col-${stage}`}
              class={`kanban-column flex flex-col bg-white/70 dark:bg-slate-900/60 rounded-xl border border-warm-200 dark:border-slate-800 overflow-hidden shadow-xs h-full min-h-0 transition-all duration-200 ${
                boardInspectorOpen ? 'w-72 shrink-0' : 'flex-1 min-w-[200px] max-w-[340px] shrink-0'
              }`}>
              <div class="p-3 border-b border-warm-200 dark:border-slate-800 bg-warm-50 dark:bg-slate-900 flex items-center justify-between shrink-0">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-xs text-slate-800 dark:text-slate-200">{stage}</span>
                  <span class="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded-full bg-warm-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                    {stageItems.length}
                  </span>
                </div>
                {#if stageSum > 0}
                  <span class="font-mono tabular-nums text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    ৳ {(stageSum / 1000).toFixed(0)}k
                  </span>
                {/if}
              </div>

              <!-- Stage Cards (ONLY THIS INNER REGION SCROLLS) -->
              <div class="p-2 overflow-y-auto overscroll-contain space-y-2 flex-1 min-h-0">
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
                      onclick={() => selectLeadOnBoard(item.id, stage)}
                      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLeadOnBoard(item.id, stage); } }}
                      class={`work-card group relative w-full text-left p-3 rounded-lg border transition-colors duration-150 cursor-pointer ${item.railClass} ${
                        isSelected && boardInspectorOpen
                          ? 'bg-orange-50/80 border-orange-400 dark:bg-orange-950/30 dark:border-orange-700 ring-2 ring-orange-600/50'
                          : 'bg-white hover:bg-warm-100/70 border-warm-200 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800'
                      }`}>
                      <div class="flex items-start justify-between gap-1">
                        <span class="font-semibold text-xs text-slate-900 dark:text-white truncate">
                          {item.sender_name}
                        </span>
                        {#if item.estimated_value_bdt}
                          <span class="font-mono tabular-nums text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                            ৳ {item.estimated_value_bdt.toLocaleString()}
                          </span>
                        {/if}
                      </div>

                      <p class="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 my-2 font-bengali leading-relaxed">
                        "{item.message || item.raw_message || ''}"
                      </p>

                      <!-- Smart Semantic Urgency Label (One-Lined, No Nested Card) -->
                      <div class="flex items-center justify-between gap-2 text-[10px] pt-1.5 border-t border-warm-100 dark:border-slate-800/80 font-mono tabular-nums">
                        <span class="text-slate-400 whitespace-nowrap truncate">{item.channel}</span>
                        <span class="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 text-[10px]">
                          {#if item.urgency === 'critical'}
                            <span class="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                            <span class="text-rose-600 dark:text-rose-400 font-semibold">{item.urgencyLabel}</span>
                          {:else if item.urgency === 'at-risk'}
                            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                            <span class="text-amber-600 dark:text-amber-400 font-semibold">{item.urgencyLabel}</span>
                          {:else if item.urgency === 'met'}
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            <span class="text-emerald-600 dark:text-emerald-400 font-semibold">SLA Met</span>
                          {:else}
                            <span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                            <span class="text-slate-400 dark:text-slate-500 font-normal">In SLA</span>
                          {/if}
                        </span>
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
    <!-- (FIT IN ONE PAGE, ZERO SCROLL EXCEPT MESSAGE BODIES)  -->
    <!-- ------------------------------------------------------ -->
    {#if viewMode === 'inbox' || boardInspectorOpen}
      <main class="detail-panel w-full lg:w-[500px] xl:w-[540px] 2xl:w-[580px] shrink-0 border-l border-warm-200 dark:border-slate-800 shadow-xl z-20 bg-white dark:bg-slate-900 flex flex-col h-full min-h-0 overflow-hidden">
        {#if !selectedEnquiry}
          <div class="m-auto text-center py-20 text-slate-400 text-sm">
            Select an inquiry from the stream to inspect.
          </div>
        {:else}
        <!-- Inspector Top Header: Contact Identity & Actions (shrink-0, tight 2-row layout using full horizontal space) -->
        <div class="px-3.5 py-2.5 border-b border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-900/60 shrink-0 space-y-1">
          <!-- Row 1: Name · Short Badge (Hover reveals full badge and company name) | Stage, Directive, Close on Right -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <h2 class="text-sm font-bold text-slate-900 dark:text-white truncate">
                {selectedEnquiry.sender_name}
              </h2>

              <span class="text-slate-400 text-xs select-none">·</span>

              <!-- Short Badge (Tooltip displays full badge reason and organization on hover) -->
              <span
                class={`text-[9.5px] font-bold px-2 py-0.5 rounded tracking-wide shrink-0 cursor-help transition ${
                  selectedEnquiry.businessPriority === 'P0'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                    : (selectedEnquiry as any).shortBadge === 'Corporate'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                      : 'bg-warm-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-warm-200 dark:border-slate-700'
                }`}
                title={(selectedEnquiry as any).badgeTooltip || `${selectedEnquiry.businessPriority} · ${selectedEnquiry.priorityReason}${(selectedEnquiry as any).organization ? ` • ${(selectedEnquiry as any).organization}` : ''}`}>
                {(selectedEnquiry as any).shortBadge || selectedEnquiry.priorityReason}
              </span>
            </div>

            <!-- Right Controls: Stage Select, Directive, Close (X) -->
            <div class="flex items-center gap-1.5 shrink-0">
              {#if (selectedEnquiry as any).ticket_status && (selectedEnquiry as any).ticket_status !== 'OPEN'}
                <span class="text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                  {(selectedEnquiry as any).ticket_status}
                </span>
              {/if}

              <label for="stage-select" class="text-[11px] text-slate-400">Stage:</label>
              <select
                id="stage-select"
                value={selectedEnquiry.pipeline_stage}
                onchange={(e) => transitionStage(selectedEnquiry.id, (e.target as HTMLSelectElement).value as PipelineStage)}
                class="text-xs font-medium border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg px-2 py-0.5 focus:ring-1 focus:ring-orange-600 focus:outline-none">
                {#each salesStages as st}
                  <option value={st}>{st}</option>
                {/each}
              </select>

              <button
                type="button"
                onclick={() => {
                  messagingContext = { type: 'ENQUIRY', id: String(selectedEnquiry.id), label: selectedEnquiry.sender_name };
                  showMessagingModal = true;
                }}
                class="px-2 py-0.5 rounded-lg bg-warm-100 hover:bg-warm-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition flex items-center gap-1 shrink-0"
                title="Dispatch internal command directive for this inquiry">
                <Icon name="message-square" size={12} class="text-orange-600 dark:text-orange-400" />
                <span class="hidden sm:inline">Directive</span>
              </button>

              {#if viewMode === 'board'}
                <button
                  type="button"
                  onclick={() => boardInspectorOpen = false}
                  class="p-0.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-warm-200/80 dark:hover:bg-slate-800 transition flex items-center gap-1 shrink-0 ml-0.5"
                  title="Close detail panel and show all 5 stages (Esc)">
                  <Icon name="x" size={15} />
                </button>
              {/if}
            </div>
          </div>

          <!-- Row 2: Channel & Phone on Left | Received Timestamp on Right (using empty right space) -->
          <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums pt-0.5">
            <div class="flex items-center gap-2.5 truncate">
              <span class="flex items-center gap-1">
                <span class="text-slate-400 font-sans">Channel:</span>
                <span class="font-semibold text-slate-700 dark:text-slate-200">{selectedEnquiry.channel}</span>
              </span>

              <span>•</span>

              {#if selectedEnquiry.normalized_phone || selectedEnquiry.phone}
                <span class="flex items-center gap-1">
                  <span class="text-slate-400 font-sans">Phone:</span>
                  <span class="font-semibold text-slate-700 dark:text-slate-200">
                    {selectedEnquiry.normalized_phone || selectedEnquiry.phone}
                  </span>
                  <button
                    type="button"
                    onclick={() => copyToClipboard(selectedEnquiry.normalized_phone || selectedEnquiry.phone, 'Phone number')}
                    class="text-orange-600 hover:text-orange-700 ml-0.5 inline-flex items-center"
                    title="Copy normalized phone number">
                    <Icon name="copy" size={11} />
                  </button>
                </span>
              {:else}
                <span class="text-amber-600 font-sans inline-flex items-center gap-1">
                  <Icon name="phone-off" size={11} />
                  <span>Missing Phone</span>
                </span>
              {/if}
            </div>

            <!-- Right side: Timestamp -->
            <div class="text-right text-[10.5px] text-slate-400 shrink-0 font-mono">
              <span>Received: {selectedEnquiry.received_at}</span>
            </div>
          </div>
        </div>

        <!-- Inspector Content Body (FIT IN ONE PAGE, ZERO SCROLL EXCEPT MESSAGE BODIES) -->
        <div class="flex-1 flex flex-col min-h-0 p-3 gap-2 overflow-hidden text-xs">

          <!-- SLA Policy & Pacing Card (shrink-0, compact height) -->
          <div class="bg-warm-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-warm-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-slate-500 text-[10.5px]">48-Hour SLA:</span>
                {#if selectedEnquiry.first_response_at}
                  <span class="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 text-xs">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    SLA Met (Logged {selectedEnquiry.first_response_at.slice(0, 16)})
                  </span>
                {:else if selectedEnquiry.is_breached}
                  <span class="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5 text-xs">
                    <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                    SLA Breached ({formatOverdueDuration(selectedEnquiry.sla_hours_remaining)})
                  </span>
                {:else if selectedEnquiry.is_at_risk}
                  <span class="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 text-xs">
                    <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                    At Risk ({selectedEnquiry.sla_formatted})
                  </span>
                {:else}
                  <span class="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs">
                    <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                    In SLA ({selectedEnquiry.sla_formatted})
                  </span>
                {/if}
              </div>
            </div>

            <div class="text-right font-mono tabular-nums text-[10px] text-slate-400 leading-tight">
              <div>Due: {selectedEnquiry.sla_due_at}</div>
              <div>Timezone: Asia/Dhaka</div>
            </div>
          </div>

          <!-- Omnichannel Conversation Stream Container (Takes available flex height) -->
          <div class="flex-1 flex flex-col min-h-0 gap-1.5 overflow-hidden">
            <!-- Stream Subheader with Turns Summary & Action Buttons -->
            <div class="flex items-center justify-between shrink-0">
              <div class="flex items-center gap-1.5">
                <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1">
                  <svg class="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Conversation Stream
                </span>
                <span class="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-warm-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {activeThreadMessages.length} {activeThreadMessages.length === 1 ? 'Turn' : 'Turns'}
                </span>
              </div>

              <div class="flex items-center gap-1.5">
                <!-- Smart Take Note Button -->
                <button
                  type="button"
                  onclick={() => showNoteDrawer = !showNoteDrawer}
                  class={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition border ${
                    showNoteDrawer
                      ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                      : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800/80'
                  }`}>
                  <svg class="w-3 h-3 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>{showNoteDrawer ? 'Close Note' : '📝 + Note'}</span>
                </button>

                <!-- Simulate Follow-up Button -->
                <button
                  type="button"
                  onclick={() => { showSimulateModal = true; simulateChannel = selectedEnquiry.channel; }}
                  class="text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-900/60 border border-orange-200 dark:border-orange-800/80 px-2 py-0.5 rounded-md flex items-center gap-1 transition">
                  <svg class="w-3 h-3 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>+ Simulate Follow-up</span>
                </button>
              </div>
            </div>

            <!-- Smart Internal Notepad Box (Collapsible) -->
            {#if showNoteDrawer}
              <div class="shrink-0 bg-amber-50/95 dark:bg-amber-950/50 border border-amber-300/90 dark:border-amber-700/80 rounded-xl p-2.5 shadow-xs space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                <div class="flex items-center justify-between text-amber-900 dark:text-amber-200 border-b border-amber-200/80 dark:border-amber-800/70 pb-1">
                  <div class="flex items-center gap-1.5 font-bold text-xs">
                    <span>📝 Internal Staff Notepad</span>
                    <span class="text-[10px] font-normal text-amber-700 dark:text-amber-400">• Team only (Not sent to customer)</span>
                  </div>
                  <button
                    type="button"
                    onclick={() => showNoteDrawer = false}
                    class="text-amber-700 hover:text-amber-950 dark:text-amber-400 dark:hover:text-white text-xs leading-none">✕</button>
                </div>

                <!-- Quick Category Tag Chips -->
                <div class="flex flex-wrap items-center gap-1 text-[10px]">
                  <span class="text-amber-800 dark:text-amber-400 font-semibold mr-0.5">Quick Tags:</span>
                  {#each noteQuickTags as tag}
                    <button
                      type="button"
                      onclick={() => {
                        const prefix = `[${tag.replace(/^[^\w\s]+/, '').trim()}]: `;
                        if (!newNoteText.includes(prefix)) {
                          newNoteText = prefix + newNoteText;
                        }
                      }}
                      class="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 text-amber-800 dark:text-amber-200 transition">
                      {tag}
                    </button>
                  {/each}
                </div>

                <!-- Notepad Textarea -->
                <textarea
                  bind:value={newNoteText}
                  rows="2"
                  onkeydown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveInternalNote(); }}
                  placeholder="Jot down phone call outcome, promised discount, or supervisor instruction... (⌘+Enter to save)"
                  class="w-full text-xs p-2 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-white/90 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"></textarea>

                <div class="flex items-center justify-between pt-0.5">
                  <span class="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                    Author: {currentUser?.full_name || 'Staff'}
                  </span>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => { showNoteDrawer = false; newNoteText = ''; }}
                      class="text-[11px] text-slate-500 hover:text-slate-700 dark:text-slate-400 px-2 py-1">
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newNoteText.trim()}
                      onclick={saveInternalNote}
                      class="text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded-lg shadow-2xs transition disabled:opacity-40 flex items-center gap-1">
                      <span>💾 Save Note to Thread</span>
                    </button>
                  </div>
                </div>
              </div>
            {/if}

            <!-- AI Multi-Turn Thread Digest (Visible when multi-turn) -->
            {#if aiThreadDigest && aiThreadDigest.isMultiTurn}
              <div class="shrink-0 bg-orange-50/80 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-900/50 rounded-md px-2.5 py-1 text-[10px] flex items-center justify-between text-orange-800 dark:text-orange-200 animate-in fade-in duration-150">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="font-bold shrink-0">✨ AI Context:</span>
                  <span class="truncate">{aiThreadDigest.summary}</span>
                </div>
                <span class="text-[9px] text-orange-700 dark:text-orange-300 shrink-0 font-medium hidden sm:inline ml-2">
                  {aiThreadDigest.detail}
                </span>
              </div>
            {/if}

            <!-- Scrollable Multi-Turn Message Stream -->
            <div
              bind:this={chatScrollContainer}
              class="flex-1 min-h-[160px] max-h-[380px] lg:max-h-[440px] 2xl:max-h-[500px] overflow-y-auto overscroll-contain p-2.5 rounded-lg border border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-950/60 space-y-2 text-xs">
              {#if activeThreadMessages.length === 0}
                <div class="text-center py-6 text-slate-400 text-xs">
                  No conversation messages recorded yet.
                </div>
              {:else}
                {#each activeThreadMessages as msg (msg.id)}
                  {#if msg.direction === 'INTERNAL_NOTE'}
                    <!-- Internal Staff Call / Discussion Note (Centered memo card) -->
                    <div class="flex justify-center my-1">
                      <div class="max-w-[92%] bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800/60 rounded-xl p-2.5 text-amber-900 dark:text-amber-200 text-xs shadow-2xs">
                        <div class="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-400 font-semibold border-b border-amber-200/70 dark:border-amber-800/60 pb-1 mb-1">
                          <span class="flex items-center gap-1">
                            <span>📝 {msg.senderName}</span>
                          </span>
                          <span class="font-mono text-[9px]">{msg.timestamp.slice(11, 16) || msg.timestamp}</span>
                        </div>
                        <div class="leading-relaxed font-sans whitespace-pre-line text-[11.5px]">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  {:else if msg.direction === 'OUTBOUND'}
                    <!-- Outbound Message Bubble (Right-aligned, Brand Amber/Orange accent) -->
                    <div class="flex flex-col items-end pl-6">
                      <div class="max-w-[90%] bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-2xl rounded-tr-xs p-2.5 shadow-xs text-xs space-y-1">
                        <div class="flex items-center justify-between gap-3 text-[10px] text-orange-100 border-b border-orange-500/50 pb-1">
                          <span class="font-semibold flex items-center gap-1">
                            <span>{msg.senderName}</span>
                          </span>
                          <span class="font-mono text-[9px] text-orange-200">{msg.timestamp.slice(11, 16) || msg.timestamp}</span>
                        </div>
                        <div class="font-bengali leading-relaxed whitespace-pre-line text-[11.5px]">
                          {msg.content}
                        </div>
                        <div class="flex items-center justify-end gap-1 text-[9px] text-orange-200 font-mono pt-0.5">
                          <span>Sent via {msg.channel}</span>
                          <span class="text-white font-bold">✓✓</span>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <!-- Inbound Customer Message Bubble (Left-aligned) -->
                    <div class="flex flex-col items-start pr-6">
                      <div class="max-w-[90%] bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-2xl rounded-tl-xs p-2.5 shadow-2xs text-xs space-y-1">
                        <div class="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 border-b border-warm-100 dark:border-slate-800/80 pb-1">
                          <div class="flex items-center gap-1.5 truncate">
                            <span class="font-bold text-slate-800 dark:text-slate-200 truncate">{msg.senderName}</span>
                            <span class="text-[9px] px-1.5 py-0.2 rounded font-medium
                              {msg.channel === 'WhatsApp' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                               msg.channel === 'Facebook Messenger' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                               msg.channel === 'Website form' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300' :
                               'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'}">
                              {msg.channel}
                            </span>
                            {#if msg.isSimulated}
                              <span class="text-[8.5px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold tracking-tight">
                                Simulated
                              </span>
                            {/if}
                          </div>

                          <div class="flex items-center gap-1 shrink-0 font-mono text-[9px]">
                            <span>{msg.language === 'BN_SCRIPT' ? 'বাংলা' : (msg.language || 'Banglish')}</span>
                            <span>•</span>
                            <span>{msg.timestamp.slice(11, 16) || msg.timestamp}</span>
                          </div>
                        </div>

                        <div class="font-bengali leading-relaxed text-slate-800 dark:text-slate-100 text-[11.5px] whitespace-pre-line">
                          "{msg.content}"
                        </div>
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
          </div>

          <!-- AI Dialect-Matched Reply Composer -->
          <div class="shrink-0 flex flex-col gap-1.5 pt-1">
            <div class="flex items-center justify-between gap-1.5 shrink-0">
              <!-- Left: Title, Subtle AI Badge & Tone Selector -->
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <span>Suggested Reply</span>
                  {#if isGeneratingReply}
                    <span class="inline-flex items-center gap-1 text-[9.5px] text-orange-600 dark:text-orange-400 font-medium lowercase tracking-normal">
                      <span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                      <span class="animate-pulse">generating...</span>
                    </span>
                  {/if}
                </span>

                {#if selectedEnquiry && (selectedEnquiry.businessPriority === 'P0' || selectedEnquiry.triage_category === 'CRITICAL_ESCALATION')}
                  <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shrink-0">
                    Supervisor De-escalation
                  </span>
                {/if}

                <!-- Subtle AI Engine Clickable SVG Icon (No label) -->
                {#if selectedEnquiry}
                  {#if (selectedEnquiry.ai_provider || '').includes('gemini')}
                    <button
                      type="button"
                      onclick={cycleAiProvider}
                      title="AI: Google Gemini 2.5 Flash API (Click to cycle)"
                      aria-label="Google Gemini 2.5 Flash API"
                      class="inline-flex items-center justify-center p-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition shrink-0 cursor-pointer">
                      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"/>
                      </svg>
                    </button>
                  {:else if (selectedEnquiry.ai_provider || '').includes('workers') || (selectedEnquiry.ai_provider || '').includes('llama')}
                    <button
                      type="button"
                      onclick={cycleAiProvider}
                      title="AI: Cloudflare Workers AI · LLaMA 3.3 70B (Click to cycle)"
                      aria-label="Cloudflare Workers AI LLaMA 3.3 70B"
                      class="inline-flex items-center justify-center p-1 rounded-md text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/60 transition shrink-0 cursor-pointer">
                      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={cycleAiProvider}
                      title="AI: Local Heuristic Fallback Engine (Click to cycle)"
                      aria-label="Local Heuristic Fallback Engine"
                      class="inline-flex items-center justify-center p-1 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer">
                      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </button>
                  {/if}
                {/if}

                <!-- Interactive Tone Selector -->
                <div class="flex items-center gap-0.5 bg-warm-100 dark:bg-slate-800 p-0.5 rounded-md text-[10px]">
                  {#each tonePresets as t}
                    <button
                      type="button"
                      onclick={() => applyDialectAndTone(currentDialect, t, true)}
                      class={`px-1.5 py-0.2 rounded font-medium transition ${
                        activeTone === t
                          ? 'bg-orange-600 text-white shadow-xs font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}>
                      {t}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Right: Dialect Pills Only in Same Row (বাংলা | Banglish | EN) -->
              <div class="inline-flex rounded-md bg-warm-100 dark:bg-slate-800 p-0.5 font-mono text-[9.5px] shrink-0">
                <button
                  type="button"
                  onclick={() => applyDialectAndTone('bn', activeTone, true)}
                  class={`px-2 py-0.5 rounded transition ${currentDialect === 'bn' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                  বাংলা
                </button>
                <button
                  type="button"
                  onclick={() => applyDialectAndTone('banglish', activeTone, true)}
                  class={`px-2 py-0.5 rounded transition ${currentDialect === 'banglish' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                  Banglish
                </button>
                <button
                  type="button"
                  onclick={() => applyDialectAndTone('en', activeTone, true)}
                  class={`px-2 py-0.5 rounded transition ${currentDialect === 'en' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                  EN
                </button>
              </div>
            </div>

            <!-- Expanded Height Suggested Reply Textarea with Smooth Animated AI Streaming -->
            <div class="relative w-full">
              <textarea
                bind:value={editableReply}
                onfocus={finishStreamingImmediately}
                oninput={finishStreamingImmediately}
                rows="4"
                class={`w-full resize-none overflow-y-auto overscroll-contain text-xs p-2.5 rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bengali leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-600 min-h-[100px] lg:min-h-[112px] max-h-[140px] transition ${
                  isGeneratingReply
                    ? 'border-orange-400 dark:border-orange-500/60 ring-1 ring-orange-500/25'
                    : 'border-warm-200 dark:border-slate-700'
                }`}
                placeholder={isGeneratingReply ? "Generating suggested reply..." : `Draft your reply in ${currentDialect === 'bn' ? 'বাংলা' : currentDialect === 'banglish' ? 'Banglish' : 'English'}...`}></textarea>

              {#if isGeneratingReply}
                <div class="absolute bottom-2.5 right-2.5 pointer-events-none flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/95 dark:bg-slate-900/95 text-[10px] text-orange-600 dark:text-orange-400 font-medium border border-orange-200 dark:border-orange-900/50 shadow-xs backdrop-blur-xs animate-in fade-in duration-150">
                  <span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-ping"></span>
                  <span>AI Generating...</span>
                </div>
              {/if}
            </div>

            <!-- Reply Actions (Pinned at bottom, shrink-0) -->
            <div class="flex items-center justify-between shrink-0 pt-0.5">
              <div class="flex items-center gap-1.5">
                {#if selectedEnquiry.businessPriority === 'P0'}
                  <button
                    type="button"
                    onclick={() => transitionTicketStatus(selectedEnquiry.id, 'ESCALATED', 'P0 PR risk escalated to supervisor')}
                    class="text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition">
                    <Icon name="shield-alert" size={13} />
                    <span>Escalate</span>
                  </button>
                {/if}

                <button
                  type="button"
                  onclick={() => applyDialectAndTone(currentDialect, activeTone, true)}
                  title="Regenerate suggested reply"
                  class="text-xs font-medium bg-warm-100 hover:bg-warm-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer">
                  <Icon name="refresh-cw" size={12} class={isGeneratingReply ? 'animate-spin text-orange-600' : ''} />
                  <span>Regenerate</span>
                </button>

                <button
                  type="button"
                  onclick={() => { finishStreamingImmediately(); copyToClipboard(editableReply, 'Suggested reply'); }}
                  class="text-xs font-medium bg-warm-100 hover:bg-warm-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 cursor-pointer">
                  <Icon name="copy" size={13} />
                  <span>Copy Reply</span>
                </button>
              </div>

              <button
                type="button"
                onclick={() => approveReply(selectedEnquiry.id)}
                disabled={isSendingReply}
                class="text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm active:scale-[0.98] transition disabled:opacity-50">
                {#if isSendingReply}
                  <div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Approving...</span>
                {:else}
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  <span>Approve & Send Outbound</span>
                {/if}
              </button>
            </div>
          </div>

          <!-- Audit Log Trail (shrink-0, compact at bottom) -->
          <div class="shrink-0 pt-1.5 border-t border-warm-200 dark:border-slate-800 text-[9.5px]">
            <div class="flex items-center justify-between text-slate-400 font-semibold uppercase tracking-wider mb-0.5">
              <span>Record Audit Lineage</span>
              <span class="font-mono text-[9px] lowercase">id: {selectedEnquiry.id}</span>
            </div>
            <div class="font-mono tabular-nums text-slate-500 space-y-0.5 leading-tight truncate">
              <div class="truncate">• [{selectedEnquiry.received_at}] Ingestion via {selectedEnquiry.channel} webhook</div>
              {#if selectedEnquiry.first_response_at}
                <div class="text-emerald-600 dark:text-emerald-400 truncate">• [{selectedEnquiry.first_response_at.slice(0, 16)}] First outbound response approved</div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </main>
    {/if}
  </div>

  <!-- Simulate Customer Follow-up Modal -->
  {#if showSimulateModal && selectedEnquiry}
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulate-modal-title"
      class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overscroll-none animate-in fade-in duration-180">
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-2xl w-full max-w-xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-3 duration-200">
        
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-warm-200 dark:border-slate-800 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/80 text-orange-600 flex items-center justify-center shrink-0">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 id="simulate-modal-title" class="text-sm font-bold text-slate-900 dark:text-white">
                Simulate Omnichannel Follow-up
              </h3>
              <p class="text-[11px] text-slate-500">
                Customer: <span class="font-semibold text-slate-700 dark:text-slate-300">{selectedEnquiry.sender_name}</span> ({selectedEnquiry.phone || selectedEnquiry.channel})
              </p>
            </div>
          </div>
          <button
            type="button"
            onclick={() => showSimulateModal = false}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-warm-100 dark:hover:bg-slate-800 transition">
            <Icon name="x" size={16} />
          </button>
        </div>

        <!-- 4 Quick-Pick Scenarios -->
        <div>
          <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">
            Instant Test Scenarios (1-Click)
          </span>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {#each simulationPresets as preset}
              <button
                type="button"
                onclick={() => executeSimulation(preset.text)}
                class="text-left p-2.5 rounded-lg border border-warm-200 dark:border-slate-800 hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-orange-950/30 transition group flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] font-bold text-slate-800 dark:text-slate-200 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                      {preset.title}
                    </span>
                    <span class="text-[9px] font-medium px-1.5 py-0.2 rounded bg-warm-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {preset.badge}
                    </span>
                  </div>
                  <p class="text-[11px] font-bengali text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                    "{preset.text}"
                  </p>
                </div>
                <div class="mt-2 text-[10px] text-orange-600 font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <span>Simulate this message</span>
                  <span>→</span>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Custom Message Input -->
        <div class="pt-2 border-t border-warm-100 dark:border-slate-800/80 space-y-2">
          <div class="flex items-center justify-between">
            <label for="custom-sim-text" class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Or Type Custom Follow-up
            </label>
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-slate-500">Channel:</span>
              <select
                bind:value={simulateChannel}
                class="text-xs p-1 rounded border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                <option value="WhatsApp">WhatsApp</option>
                <option value="Facebook Messenger">Facebook Messenger</option>
                <option value="Website form">Website form</option>
                <option value="Facebook comment">Facebook comment</option>
              </select>
            </div>
          </div>

          <textarea
            id="custom-sim-text"
            bind:value={simulateInputText}
            rows="2"
            placeholder="e.g. Bhai amar enrollment confirmation ta koto shomoy lagbe? (Bangla, Banglish, or English)"
            class="w-full text-xs p-2.5 rounded-lg border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bengali focus:outline-none focus:ring-1 focus:ring-orange-600"></textarea>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-warm-200 dark:border-slate-800">
          <button
            type="button"
            onclick={() => showSimulateModal = false}
            class="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-warm-100 dark:text-slate-300 dark:hover:bg-slate-800 transition">
            Cancel
          </button>
          <button
            type="button"
            disabled={!simulateInputText.trim()}
            onclick={() => executeSimulation()}
            class="text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white px-4 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span>Send Follow-up Turn</span>
          </button>
        </div>

      </div>
    </div>
  {/if}

  <!-- Ingest Inbound Message Modal (Bounded Transition & Accessible Dismiss) -->
  {#if showParserModal}
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingest-modal-title"
      class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overscroll-none animate-in fade-in duration-180">
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom-3 duration-200">
        <div class="flex items-center justify-between border-b border-warm-200 dark:border-slate-800 pb-3 shrink-0">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-orange-600"></span>
            <h3 id="ingest-modal-title" class="text-sm font-bold text-slate-900 dark:text-white">Ingest Inbound Inquiry / Webhook</h3>
          </div>
          <button
            type="button"
            onclick={() => showParserModal = false}
            class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div class="space-y-3.5 text-xs overflow-y-auto pr-1 flex-1">
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
                class="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-orange-600"
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
              rows="3"
              class="w-full p-3 rounded-lg border border-warm-200 dark:border-slate-700 bg-warm-50 dark:bg-slate-800 text-slate-900 dark:text-white font-bengali leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-600"
              placeholder="Paste raw customer message..."></textarea>
          </div>

          <!-- AI Suggested Reply Preview with 4 Tones & 3 Dialects -->
          <div class="p-3 rounded-xl border border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-950/60 space-y-2.5">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <!-- Left: AI Provider Badge & 4 Message Tone Presets -->
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onclick={cycleIngestAiProvider}
                  title={ingestAiProvider === 'gemini-2.5-flash' ? 'AI: Google Gemini 2.5 Flash API (Click to cycle)' : ingestAiProvider === 'workers-ai' ? 'AI: Cloudflare Workers AI · LLaMA 3.3 70B (Click to cycle)' : 'AI: Local Heuristic Fallback Engine (Click to cycle)'}
                  aria-label="Toggle Ingestion AI Provider"
                  class="inline-flex items-center justify-center p-1 rounded-md hover:bg-warm-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0">
                  {#if ingestAiProvider === 'gemini-2.5-flash'}
                    <svg class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"/>
                    </svg>
                  {:else if ingestAiProvider === 'workers-ai'}
                    <svg class="w-3.5 h-3.5 text-orange-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  {:else}
                    <svg class="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  {/if}
                </button>

                <div class="flex items-center gap-1.5">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tone:</span>
                  <div class="inline-flex rounded-md bg-warm-200/70 dark:bg-slate-800 p-0.5 text-[10px]">
                    {#each ['Professional', 'Friendly', 'Direct', 'Executive'] as t}
                      <button
                        type="button"
                        onclick={() => setIngestTone(t as TonePreset)}
                        class={`px-2 py-0.5 rounded transition font-medium ${
                          ingestTone === t
                            ? 'bg-orange-600 text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}>
                        {t}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- Right: 3 Dialect Switchers (বাংলা | Banglish | EN) -->
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Dialect:</span>
                <div class="inline-flex rounded-md bg-warm-200/70 dark:bg-slate-800 p-0.5 font-mono text-[10px] shrink-0">
                  <button
                    type="button"
                    onclick={() => setIngestDialect('bn')}
                    class={`px-2 py-0.5 rounded transition ${ingestDialect === 'bn' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                    বাংলা
                  </button>
                  <button
                    type="button"
                    onclick={() => setIngestDialect('banglish')}
                    class={`px-2 py-0.5 rounded transition ${ingestDialect === 'banglish' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                    Banglish
                  </button>
                  <button
                    type="button"
                    onclick={() => setIngestDialect('en')}
                    class={`px-2 py-0.5 rounded transition ${ingestDialect === 'en' ? 'bg-orange-600 text-white font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}>
                    EN
                  </button>
                </div>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ingest-reply" class="text-slate-600 dark:text-slate-300 font-semibold text-[11px] flex items-center gap-1">
                  <span>Suggested Outbound Reply</span>
                  <span class="text-[9.5px] font-mono text-orange-600 dark:text-orange-400">({ingestTone} · {ingestDialect === 'bn' ? 'বাংলা' : ingestDialect === 'banglish' ? 'Banglish' : 'EN'})</span>
                </label>
                <span class="text-[10px] text-slate-400">Auto-generated preview</span>
              </div>
              <textarea
                id="ingest-reply"
                value={ingestActiveReplyText}
                oninput={(e) => ingestCustomSuggestedReply = (e.target as HTMLTextAreaElement).value}
                rows="3"
                class="w-full p-2.5 rounded-lg border border-warm-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bengali text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-orange-600"
                placeholder="Suggested outbound reply will appear here..."></textarea>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-warm-200 dark:border-slate-800 shrink-0">
          <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Deterministic Triage Engine</span>
            <span>·</span>
            <span>Zero Hallucination</span>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => showParserModal = false}
              class="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white text-xs">
              Cancel
            </button>
            <button
              type="button"
              onclick={ingestCustomMessage}
              class="px-4 py-1.5 rounded-full bg-[#C2410C] hover:bg-[#EA580C] text-white font-semibold text-xs shadow-sm active:scale-95 transition">
              Parse & Ingest Inquiry
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}

  <!-- Account Control Modal -->
  <AccountControlModal
    isOpen={showAccountModal}
    currentUser={currentUser}
    csrfToken={getActiveCsrf()}
    workspaceType="CRM"
    onClose={() => showAccountModal = false}
    onUserUpdated={(u) => { if (currentUser) currentUser = { ...currentUser, ...u }; }}
  />

  <!-- Messaging Center Modal -->
  <MessagingCenterModal
    isOpen={showMessagingModal}
    currentUser={currentUser}
    csrfToken={getActiveCsrf()}
    initialContext={messagingContext}
    workspaceType="CRM"
    onClose={() => { showMessagingModal = false; messagingContext = null; refreshUnreadMessages(); }}
    onNavigateContext={(type, id) => {
      if (type === 'ENQUIRY') {
        const numId = parseInt(id.replace('ENQ-', ''), 10);
        if (!isNaN(numId)) selectLead(numId);
      }
    }}
  />

  <!-- Toast Notification Feedback (Calm, Non-Bouncing, Accessible Live Region) -->
  {#if copyFeedback}
    <div
      role="status"
      aria-live="polite"
      class="fixed bottom-4 right-4 bg-slate-900 text-white dark:bg-white dark:text-slate-950 px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl z-50 flex items-center gap-2.5 border border-slate-700 dark:border-slate-200 transition-all duration-180">
      <span>{copyFeedback}</span>
      <button
        type="button"
        onclick={() => copyFeedback = null}
        class="text-slate-400 hover:text-white dark:hover:text-slate-900 p-0.5 ml-1"
        aria-label="Dismiss notification">
        <Icon name="x" size={13} />
      </button>
    </div>
  {/if}
</div>
