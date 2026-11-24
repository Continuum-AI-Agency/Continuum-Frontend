import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { englishMessages } from '@/i18n/__tests__/render';
import { goalDotItems, healthDotItems, organicDotItems } from './homeDotItems';
import { DRAFT_ROWS, NOW, POSTS } from './modules/organic/__fixtures__/organicWeek';
import { buildOrganicWeek } from './modules/organic/organicWeekModel';

const uiText = createTranslator({
  locale: 'en',
  messages: englishMessages,
  namespace: 'dashboard',
});

describe('Source-to-dot fidelity', () => {
  it('keeps sparse observation dates, zero money and the actual currency', () => {
    const amount = {
      value: 42,
      currency: 'MXN',
      series: [0, 42],
      seriesDates: ['2026-11-01', '2026-11-04'],
      accountCount: 1,
    };
    const items = goalDotItems(
      {
        state: 'ready',
        primary: {
          objective: { id: 'revenue', metric: 'purchase_value', role: 'primary', label: 'Revenue' },
          unit: 'currency',
          amounts: [amount],
          unreported: false,
        },
        headline: amount,
        others: [],
        secondaries: [],
        source: 'team',
        figureWindow: { since: '2026-11-01', until: '2026-11-04' },
        target: { kind: 'none' },
        unanswered: 0,
      },
      uiText,
    );
    expect(items.map((item) => item.id)).toEqual(['2026-11-01', '2026-11-04']);
    expect(items.map((item) => item.number)).toEqual([0, 42]);
    expect(items.map((item) => item.label)).toEqual(['Nov 1', 'Nov 4']);
    expect(items[0]?.value).toContain('0');
    expect(items[0]?.value).toContain('MXN');
    expect(items[0]?.detail).toContain('Revenue');
    expect(items).toHaveLength(2);
  });

  it('does not invent dates when an older model lacks them', () => {
    const amount = { value: 2, currency: null, series: [1, 1], accountCount: 1 };
    const items = goalDotItems(
      {
        state: 'ready',
        primary: {
          objective: { id: 'leads', metric: 'leads', role: 'primary', label: 'Leads' },
          unit: 'count',
          amounts: [amount],
          unreported: false,
        },
        headline: amount,
        others: [],
        secondaries: [],
        source: 'team',
        figureWindow: { since: '2026-11-01', until: '2026-11-04' },
        target: { kind: 'none' },
        unanswered: 0,
      },
      uiText,
    );
    expect(items[0]?.label).toBe('Reported observation 1');
    expect(items[1]?.label).toBe('Reported observation 2');
  });

  it('distinguishes unread, passing and failing checks without making a score', () => {
    const items = healthDotItems(
      [
        {
          id: 'naming',
          label: 'Naming',
          detail: 'Convention not chosen',
          status: 'unreadable',
          fix: null,
        },
        { id: 'billing', label: 'Billing', detail: 'Readable', status: 'pass', fix: null },
        { id: 'tracking', label: 'Tracking', detail: 'Event missing', status: 'fail', fix: null },
      ],
      uiText,
    );
    expect(items.map((item) => item.group)).toEqual(['Needs attention', 'Passing', 'Not read']);
    expect(items.find((item) => item.id === 'naming')?.tone).toBe('unknown');
    expect(items.find((item) => item.id === 'tracking')?.value).toBe('Needs attention');
    expect(items.every((item) => item.number === undefined)).toBe(true);
  });

  it('keeps real post identities and collapses multi-platform approvals into their calendar day', () => {
    const week = buildOrganicWeek({ now: NOW, posts: POSTS, drafts: DRAFT_ROWS });
    const items = organicDotItems(week, uiText);
    expect(items.filter((item) => item.tone === 'positive')).toHaveLength(2);
    expect(items.filter((item) => item.id.includes('2026-11-04:waiting:'))).toHaveLength(1);
    expect(
      items
        .filter((item) => item.id.includes('2026-11-05:scheduled:'))
        .every((item) => item.column === 4),
    ).toBe(true);
    expect(items.some((item) => item.id.includes('published:p-ig'))).toBe(true);
    expect(items.some((item) => item.id.includes('published:p-li'))).toBe(true);
  });
});
