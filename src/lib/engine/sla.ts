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
    const overdueHours = Math.abs(Math.round(hoursRemaining));
    return {
      slaDueAt: slaDueAt.toISOString(),
      status: 'BREACHED',
      hoursRemaining,
      isBreached: true,
      isAtRisk: true,
      formattedTimeRemaining: `${overdueHours}h Overdue`
    };
  }

  if (hoursRemaining <= 12) {
    const rounded = Math.round(hoursRemaining);
    return {
      slaDueAt: slaDueAt.toISOString(),
      status: 'AT_RISK',
      hoursRemaining,
      isBreached: false,
      isAtRisk: true,
      formattedTimeRemaining: `${rounded}h left (At Risk)`
    };
  }

  const rounded = Math.round(hoursRemaining);
  return {
    slaDueAt: slaDueAt.toISOString(),
    status: 'IN_SLA',
    hoursRemaining,
    isBreached: false,
    isAtRisk: false,
    formattedTimeRemaining: `${rounded}h left`
  };
}
