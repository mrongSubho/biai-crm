import { describe, it, expect } from 'vitest';
import {
  getSaturdayToFridayWeekRange,
  generateWeeklyExecutiveDigest,
  formatDigestToMarkdown
} from '../src/lib/engine/weekly_digest';

describe('Saturday 00:00 to Friday 23:59 Business Week Engine', () => {
  it('correctly maps Wednesday (mid-week) to previous Saturday and upcoming Friday', () => {
    // 2026-10-28 is Wednesday
    const range = getSaturdayToFridayWeekRange('2026-10-28T12:00:00Z');
    expect(range.startFormatted).toContain('Oct 24, 2026');
    expect(range.endFormatted).toContain('Oct 30, 2026');
    expect(range.cycleRule).toContain('Saturday 00:00 — Friday 23:59');
  });

  it('correctly maps Saturday itself as the start of the week', () => {
    // 2026-10-24 is Saturday
    const range = getSaturdayToFridayWeekRange('2026-10-24T09:00:00Z');
    expect(range.startFormatted).toContain('Oct 24, 2026');
    expect(range.endFormatted).toContain('Oct 30, 2026');
  });

  it('correctly maps Friday as the end of the week', () => {
    // 2026-10-30 20:00 Dhaka time (14:00 UTC) is Friday night before midnight
    const range = getSaturdayToFridayWeekRange('2026-10-30T14:00:00Z');
    expect(range.startFormatted).toContain('Oct 24, 2026');
    expect(range.endFormatted).toContain('Oct 30, 2026');
  });

  it('transitions to the new week on the following Saturday', () => {
    // 2026-10-31 is Saturday (start of next week)
    const range = getSaturdayToFridayWeekRange('2026-10-31T01:00:00Z');
    expect(range.startFormatted).toContain('Oct 31, 2026');
    expect(range.endFormatted).toContain('Nov 6, 2026');
  });
});

describe('Weekly Executive AI Digest Synthesis', () => {
  const sampleEnquiries = [
    {
      id: 1,
      sender_name: 'Mahmud Hasan',
      organization: 'Gazipur Textile Company',
      seats: 40,
      estimated_value_bdt: 600000,
      channel: 'Website form',
      pipeline_stage: 'Contacted',
      language: 'EN',
      triage_category: 'SALES_LEAD',
      sla_status: 'IN_SLA',
      received_at: '2026-10-26 10:05'
    },
    {
      id: 2,
      sender_name: 'Kamrul Islam',
      organization: 'Motijheel Commercial Bank',
      seats: 120,
      estimated_value_bdt: 1500000,
      channel: 'WhatsApp',
      pipeline_stage: 'Contacted',
      language: 'BANGLISH',
      triage_category: 'SALES_LEAD',
      sla_status: 'IN_SLA',
      received_at: '2026-10-26 14:20'
    },
    {
      id: 3,
      sender_name: 'Rafi Ahmed',
      seats: 1,
      estimated_value_bdt: 3500,
      channel: 'WhatsApp',
      pipeline_stage: 'Contacted',
      language: 'BANGLISH',
      triage_category: 'SALES_LEAD',
      sla_status: 'BREACHED',
      is_breached: true,
      received_at: '2026-10-26 09:12'
    },
    {
      id: 4,
      sender_name: 'Tahmina Akter',
      seats: 1,
      estimated_value_bdt: 25000,
      channel: 'Facebook Messenger',
      pipeline_stage: 'Contacted',
      language: 'BN_SCRIPT',
      triage_category: 'SALES_LEAD',
      sla_status: 'MET',
      first_response_at: '2026-10-26 10:00',
      received_at: '2026-10-26 09:40'
    }
  ];

  it('aggregates pipeline value, corporate seats, and SLA compliance correctly', () => {
    const digest = generateWeeklyExecutiveDigest(sampleEnquiries, '2026-10-28T12:00:00');
    expect(digest.metrics.totalInquiries).toBe(4);
    expect(digest.metrics.totalPipelineValueBdt).toBe(2128500);
    expect(digest.metrics.corporateSeats).toBe(160); // 40 + 120
    expect(digest.metrics.corporateDealsCount).toBe(2);
    expect(digest.corporateDeals.length).toBe(2);

    // 2 In-SLA + 1 Met = 3/4 = 75%
    expect(digest.metrics.slaComplianceRate).toBe(75);
    expect(digest.metrics.slaBreachedCount).toBe(1);
  });

  it('formats clean executive markdown briefing', () => {
    const digest = generateWeeklyExecutiveDigest(sampleEnquiries, '2026-10-28T12:00:00');
    const md = formatDigestToMarkdown(digest);
    expect(md).toContain('# BIAI CRM — Weekly Executive AI Digest');
    expect(md).toContain('Saturday 00:00 — Friday 23:59');
    expect(md).toContain('Gazipur Textile Company');
    expect(md).toContain('160 seats');
    expect(md).toContain('Strategic Directives for Upcoming Standup');
  });
});
