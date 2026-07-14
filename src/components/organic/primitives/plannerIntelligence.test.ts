import { describe, expect, it } from 'bun:test';
import { derivePlannerInsight } from './plannerIntelligence';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

const draft = (status: OrganicCalendarDraft['status']): OrganicCalendarDraft =>
  ({ id: status, status }) as OrganicCalendarDraft;

const day = (id: string, slots: OrganicCalendarDraft[] = []): OrganicCalendarDay =>
  ({ id, slots }) as OrganicCalendarDay;

describe('derivePlannerInsight', () => {
  it('gives an actionable starting point for an empty week', () => {
    expect(derivePlannerInsight([day('mon'), day('tue')])).toContain('3–5 posts');
  });

  it('puts failed drafts ahead of lower-risk schedule advice', () => {
    expect(derivePlannerInsight([day('mon', [draft('failed')])])).toBe(
      '1 draft needs attention before this plan is ready.',
    );
  });

  it('calls out large coverage gaps', () => {
    const days = [
      day('mon', [draft('scheduled')]),
      day('tue'),
      day('wed'),
      day('thu'),
      day('fri'),
      day('sat'),
      day('sun'),
    ];
    expect(derivePlannerInsight(days)).toBe(
      'Content gap: 6 days are still open in this planning window.',
    );
  });
});
