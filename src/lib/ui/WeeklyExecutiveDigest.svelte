<script lang="ts">
  import Icon from './Icon.svelte';
  import { formatDigestToMarkdown, type WeeklyExecutiveDigestData } from '../engine/weekly_digest';

  let {
    digest,
    onClose,
    onSelectEnquiry
  }: {
    digest: WeeklyExecutiveDigestData;
    onClose: () => void;
    onSelectEnquiry: (id: number | string) => void;
  } = $props();

  let copied = $state(false);

  function copyMarkdown() {
    const text = formatDigestToMarkdown(digest);
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2500);
  }

  function handlePrint() {
    window.print();
  }
</script>

<div class="flex-1 flex flex-col min-h-0 bg-warm-50/40 dark:bg-slate-950/60 overflow-hidden text-slate-800 dark:text-slate-100">
  <!-- Top Navigation & Action Header -->
  <div class="p-4 border-b border-warm-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
          ✨
        </span>
        <h1 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
          Weekly Executive AI Digest
        </h1>
        <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-200 font-bold border border-orange-200 dark:border-orange-800/80">
          Week {digest.weekRange.weekNumber} · {digest.weekRange.year}
        </span>
      </div>

      <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
        <span>Cycle: <strong>{digest.weekRange.startFormatted} — {digest.weekRange.endFormatted}</strong></span>
        <span>•</span>
        <span class="text-[11px] text-orange-600 dark:text-orange-400 font-sans font-medium">{digest.weekRange.cycleRule}</span>
      </div>
    </div>

    <!-- Right Utility Buttons -->
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onclick={copyMarkdown}
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-warm-100 hover:bg-warm-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-2xs">
        {#if copied}
          <span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Copied Brief!</span>
        {:else}
          <Icon name="copy" size={13} />
          <span>Copy Exec Brief</span>
        {/if}
      </button>

      <button
        type="button"
        onclick={handlePrint}
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-warm-100 hover:bg-warm-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 shadow-2xs hidden sm:inline-flex">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        <span>Print Report</span>
      </button>

      <button
        type="button"
        onclick={onClose}
        class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition flex items-center gap-1.5 shadow-sm">
        <Icon name="x" size={13} />
        <span>Back to Stream</span>
      </button>
    </div>
  </div>

  <!-- Scrollable Report Canvas -->
  <div class="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-6 min-h-0">
    
    <!-- 1. Executive Scorecard Tiles (4 Metrics) -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <!-- Total Inbound Leads -->
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span>Total Inbound Leads</span>
          <span class="text-orange-500">📥</span>
        </div>
        <div class="mt-2">
          <div class="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {digest.metrics.totalInquiries}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 truncate">
            Avg Deal: ৳ {digest.metrics.averageDealValueBdt.toLocaleString()} BDT
          </div>
        </div>
      </div>

      <!-- Active Pipeline GMV -->
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span>Pipeline Valuation</span>
          <span class="text-emerald-500">৳</span>
        </div>
        <div class="mt-2">
          <div class="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            ৳ {digest.metrics.totalPipelineValueBdt.toLocaleString()}
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 truncate">
            Estimated gross deal potential
          </div>
        </div>
      </div>

      <!-- Corporate Demand -->
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span>Corporate Upskill Seats</span>
          <span class="text-indigo-500">🏢</span>
        </div>
        <div class="mt-2">
          <div class="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            {digest.metrics.corporateSeats} Seats
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 truncate">
            {digest.metrics.corporateDealsCount} enterprise cohorts in pipeline
          </div>
        </div>
      </div>

      <!-- 48-Hour SLA Compliance Rate -->
      <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs flex flex-col justify-between">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span>48h SLA Compliance</span>
          <span class={digest.metrics.slaComplianceRate >= 80 ? 'text-emerald-500' : 'text-rose-500'}>⚡</span>
        </div>
        <div class="mt-2">
          <div class="text-2xl font-bold font-mono text-slate-900 dark:text-white flex items-baseline gap-1.5">
            <span>{digest.metrics.slaComplianceRate}%</span>
            <span class="text-[10px] font-sans font-semibold text-emerald-600 dark:text-emerald-400">
              {digest.metrics.slaMetCount + digest.metrics.slaInCount} on track
            </span>
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5 truncate">
            {digest.metrics.slaBreachedCount > 0 ? `${digest.metrics.slaBreachedCount} breached · ` : ''}{digest.metrics.slaAtRiskCount} at risk (&lt;12h)
          </div>
        </div>
      </div>
    </div>

    <!-- 2. AI Executive Synthesis & Market Signals (Hero Briefing Box) -->
    <div class="bg-gradient-to-br from-orange-50/90 via-white to-amber-50/80 dark:from-slate-900 dark:via-slate-900 dark:to-orange-950/30 border border-orange-200 dark:border-orange-900/60 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base text-orange-600 dark:text-orange-400">💡</span>
          <h2 class="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            AI Executive Synthesis & Strategic Observations
          </h2>
        </div>
        <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-200">
          Generated via Llama-3 Triage Model
        </span>
      </div>

      <!-- TLDR -->
      <p class="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans font-medium">
        {digest.executiveSynthesis.tldr}
      </p>

      <!-- Market Signals Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {#each digest.executiveSynthesis.marketSignals as sig}
          <div class="bg-white/80 dark:bg-slate-900/80 border border-warm-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2 shadow-2xs">
            <span class="text-orange-600 dark:text-orange-400 mt-0.5 shrink-0 font-bold">•</span>
            <span class="leading-relaxed">{sig}</span>
          </div>
        {/each}
      </div>

      <!-- Risk & Escalation Register -->
      <div class="bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
        <span class="shrink-0 text-sm">🛡️</span>
        <div class="leading-relaxed">
          <strong class="font-bold">Risk & Escalation Register:</strong> {digest.executiveSynthesis.riskAndEscalationReport}
        </div>
      </div>
    </div>

    <!-- 3. Analytical Deep-Dive: Funnel & Corporate Whales (2-Column Grid) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
      
      <!-- Left (7 Cols): Funnel Velocity & Linguistic Distribution -->
      <div class="lg:col-span-7 space-y-5">
        
        <!-- Pipeline Velocity by Stage -->
        <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>📊</span>
              <span>Pipeline Stage Velocity</span>
            </h3>
            <span class="text-[10px] text-slate-400 font-mono">5-Stage Funnel</span>
          </div>

          <div class="space-y-2.5 pt-1">
            {#each digest.funnelStages as stage}
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-semibold text-slate-800 dark:text-slate-200">
                    {stage.stage} ({stage.count})
                  </span>
                  <div class="flex items-center gap-2 font-mono text-[11px]">
                    <span class="font-bold text-slate-900 dark:text-white">৳ {stage.valueBdt.toLocaleString()}</span>
                    <span class="text-slate-400 text-[10px]">({stage.percentage}%)</span>
                  </div>
                </div>

                <div class="w-full bg-warm-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-300 {
                      stage.stage === 'Paid' ? 'bg-emerald-500' :
                      stage.stage === 'Interested' ? 'bg-orange-500' :
                      stage.stage === 'Contacted' ? 'bg-amber-500' :
                      stage.stage === 'Lost' ? 'bg-slate-400' : 'bg-sky-500'
                    }"
                    style="width: {Math.max(4, stage.percentage)}%"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Omnichannel Inflow & Dialect Distribution -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- Channels -->
          <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-2.5">
            <h4 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
              <span>🌐</span>
              <span>Channel Inflow</span>
            </h4>
            <div class="space-y-2 text-xs">
              {#each digest.channelDistribution as ch}
                <div class="flex items-center justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{ch.channel}</span>
                  <div class="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                    {ch.count} <span class="text-[10px] text-slate-400 font-normal">({ch.percentage}%)</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Linguistic Dialects -->
          <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs space-y-2.5">
            <h4 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
              <span>🗣️</span>
              <span>Linguistic Dialect</span>
            </h4>
            <div class="space-y-2 text-xs">
              {#each digest.dialectDistribution as d}
                <div class="flex items-center justify-between">
                  <span class="text-slate-600 dark:text-slate-400">{d.dialect}</span>
                  <div class="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                    {d.count} <span class="text-[10px] text-slate-400 font-normal">({d.percentage}%)</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Right (5 Cols): High-Value Corporate Whales -->
      <div class="lg:col-span-5 space-y-3">
        <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>🏢</span>
              <span>Enterprise Deal Spotlight</span>
            </h3>
            <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
              ≥ 10 Seats
            </span>
          </div>

          {#if digest.corporateDeals.length === 0}
            <div class="text-center py-8 text-slate-400 text-xs">
              No enterprise deals detected in this window.
            </div>
          {:else}
            <div class="space-y-2.5">
              {#each digest.corporateDeals as deal}
                <button
                  type="button"
                  onclick={() => onSelectEnquiry(deal.id)}
                  class="w-full text-left p-3 rounded-xl border border-warm-200 dark:border-slate-800 bg-warm-50/50 dark:bg-slate-950/60 hover:border-orange-500/60 hover:bg-orange-50/30 dark:hover:bg-slate-800/80 transition group space-y-1.5 shadow-2xs">
                  
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="text-xs font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition truncate">
                        {deal.senderName}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {deal.organization}
                      </div>
                    </div>

                    <div class="text-right shrink-0">
                      <div class="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ৳ {deal.valueBdt.toLocaleString()}
                      </div>
                      <div class="text-[10px] text-purple-600 dark:text-purple-400 font-semibold font-mono">
                        {deal.seats} Seats
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-warm-200/60 dark:border-slate-800/60">
                    <span>Stage: <strong class="text-slate-700 dark:text-slate-300">{deal.stage}</strong></span>
                    <span>Via {deal.channel}</span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- 4. Strategic Directives for Upcoming Standup -->
    <div class="bg-white dark:bg-slate-900 border border-warm-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
          <span>🎯</span>
          <span>AI Action Directives for Next Week's Leadership Standup</span>
        </h3>
        <span class="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">
          High-Priority Execution
        </span>
      </div>

      <div class="space-y-2">
        {#each digest.executiveSynthesis.strategicActionItems as item, idx}
          <div class="p-3 rounded-lg border border-warm-200/80 dark:border-slate-800 bg-warm-50/40 dark:bg-slate-950/40 flex items-start gap-3">
            <span class="w-5 h-5 rounded-full bg-orange-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
              {idx + 1}
            </span>
            <div class="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
              {item}
            </div>
          </div>
        {/each}
      </div>
    </div>

  </div>
</div>
