import type { OrganicCalendarDay } from './types';

export function derivePlannerInsight(days: readonly OrganicCalendarDay[]): string {
  const drafts = days.flatMap((day) => day.slots);
  const failed = drafts.filter((draft) => draft.status === 'failed').length;
  const scheduled = drafts.filter(
    (draft) => draft.status === 'scheduled' || draft.status === 'published',
  ).length;
  const coveredDays = days.filter((day) => day.slots.length > 0).length;

  if (drafts.length === 0) {
    return 'Start with 3–5 posts across at least two days to shape a useful week.';
  }
  if (failed > 0) {
    return `${failed} ${failed === 1 ? 'draft needs' : 'drafts need'} attention before this plan is ready.`;
  }
  if (scheduled === 0) {
    return `${drafts.length} ${drafts.length === 1 ? 'draft needs' : 'drafts need'} a schedule before this week is ready.`;
  }

  const openDays = Math.max(days.length - coveredDays, 0);
  if (openDays >= 4) {
    return `Content gap: ${openDays} days are still open in this planning window.`;
  }

  return `Plan check: ${drafts.length} posts across ${coveredDays} ${coveredDays === 1 ? 'day' : 'days'}; review timing before publishing.`;
}
