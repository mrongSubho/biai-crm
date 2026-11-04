import type { SlaStatus } from '../types/crm.ts';

export interface SlaCalculationResult {
  slaDueAt: string;
  status: SlaStatus;
  hoursRemaining: number;
  isBreached: boolean;
  isAtRisk: boolean;
  formattedTimeRemaining: string;
}

/**
 * Calculates 48-hour SLA status relative to a reference time.
 * In production, referenceTime defaults to current real time (new Date()).
 * In test/simulation mode, evaluators can pass a simulated reference time.
 */
export function calculateSlaStatus(
  receivedAtStr: string,
  firstResponseAtStr?: string | null,
  simulatedReferenceTime?: Date | string | null
): SlaCalculationResult {
  const receivedAt = new Date(receivedAtStr);
  // Default SLA window is 48 hours
  const slaDueAt = new Date(receivedAt.getTime() + 48 * 60 * 60 * 1000);

  // If already responded before SLA deadline
  if (firstResponseAtStr) {
    const respondedAt = new Date(firstResponseAtStr);
    if (respondedAt <= slaDueAt) {
      return {
        slaDueAt: slaDueAt.toISOString(),
        status: 'MET',
        hoursRemaining: 0,
        isBreached: false,
        isAtRisk: false,
        formattedTimeRemaining: 'SLA Met'
      };
    }
  }

  // Determine current evaluation time (simulated or real)
  const evalTime = simulatedReferenceTime 
    ? new Date(simulatedReferenceTime) 
    : new Date();

  const diffMs = slaDueAt.getTime() - evalTime.getTime();
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    const overdueStr = formatOverdueDuration(hoursRemaining);
    return {
      slaDueAt: slaDueAt.toISOString(),
      status: 'BREACHED',
      hoursRemaining,
      isBreached: true,
      isAtRisk: true,
      formattedTimeRemaining: overdueStr
    };
  }

  if (hoursRemaining <= 12) {
    const formatted = formatDurationHm(hoursRemaining);
    return {
      slaDueAt: slaDueAt.toISOString(),
      status: 'AT_RISK',
      hoursRemaining,
      isBreached: false,
      isAtRisk: true,
      formattedTimeRemaining: `${formatted} left`
    };
  }

  const formatted = formatDurationHm(hoursRemaining);
  return {
    slaDueAt: slaDueAt.toISOString(),
    status: 'IN_SLA',
    hoursRemaining,
    isBreached: false,
    isAtRisk: false,
    formattedTimeRemaining: `${formatted} left`
  };
}

/**
 * Formats a duration in decimal hours to positive human-readable string:
 * e.g. 1.9166667 -> "1h 55m", 2.0 -> "2h", 0.75 -> "45m"
 */
export function formatDurationHm(hoursDecimal: number): string {
  const absTotalMinutes = Math.round(Math.abs(hoursDecimal) * 60);
  const h = Math.floor(absTotalMinutes / 60);
  const m = absTotalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats overdue duration strictly positive: e.g. "1h 55m overdue", "2h overdue", "45m overdue"
 */
export function formatOverdueDuration(hoursDecimal: number): string {
  return `${formatDurationHm(hoursDecimal)} overdue`;
}
