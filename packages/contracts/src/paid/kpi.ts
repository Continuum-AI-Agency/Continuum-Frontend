import type { WindowMetrics } from '@continuum/optimization-engine';

/** The measured optimizer field selected by a Meta ad set's declared goal. */
export type KpiWindowField = keyof WindowMetrics;

/**
 * Resolve Meta's declared optimization goal to the field used by the optimizer.
 * Goals that do not have a corresponding metric in the shared engine return
 * undefined so callers can apply their existing safe fallback.
 */
export function kpiFieldForOptimizationGoal(
  goal: string | null | undefined,
  promotedEventType?: string | null,
): KpiWindowField | undefined {
  const value = (goal ?? '').trim().toUpperCase();
  if (!value) return undefined;

  switch (value) {
    case 'LEAD_GENERATION':
    case 'QUALITY_LEAD':
      return 'leads';
    case 'LINK_CLICKS':
      return 'clicks';
    case 'LANDING_PAGE_VIEWS':
      return 'landingPageViews';
    case 'THRUPLAY':
    case 'VIDEO_VIEWS':
    case 'POST_ENGAGEMENT':
    case 'PAGE_LIKES':
    case 'EVENT_RESPONSES':
      return 'impressions';
    case 'VALUE':
      return 'purchases';
    case 'OFFSITE_CONVERSIONS':
    case 'ONSITE_CONVERSIONS':
      return (promotedEventType ?? '').toUpperCase().includes('LEAD') ? 'leads' : 'purchases';
    default:
      return undefined;
  }
}
