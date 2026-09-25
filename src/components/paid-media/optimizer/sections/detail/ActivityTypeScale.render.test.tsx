import { afterEach, describe, expect, it } from 'bun:test';
import type { AdhocSuggestionGate } from '@continuum/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';

import type { DailyReadRow } from './dailyReadModel';
import { DailyReadList } from './DailyReadList';
import { SuggestionAsk } from './SuggestionAsk';

afterEach(cleanup);

const SUB_XS = /text-(2|3)xs/;

const gate = (
  category: AdhocSuggestionGate['category'],
  canRequest = true,
): AdhocSuggestionGate => ({
  category,
  state: 'none',
  requests_used: 0,
  requests_left: canRequest ? 3 : 0,
  can_request: canRequest,
  retry_after: null,
  reason: canRequest ? null : 'daily_limit',
});

const askedRow: DailyReadRow = {
  id: 'asked-1',
  module: 'audience',
  category: 'Audiences',
  tier: 'low',
  tierLabel: 'Not sized',
  title: 'Find new broad audiences for prospecting',
  reason: 'Delivers leads well below target with low frequency.',
  basis: 'Asked for',
  isHero: false,
  origin: 'asked',
  detail: {
    steps: ['Create new broad prospecting ad sets.', 'Allocate initial test budgets.'],
    figures: [
      { label: 'Spend/day', value: 26.41, unit: 'currency' },
      { label: 'Frequency 7d', value: 1.25, unit: 'multiple' },
    ],
  },
  nextNote: 'Nothing is switched on.',
  cta: { kind: 'build', rowKey: null, label: 'Take this on' },
};

const heroRow: DailyReadRow = {
  id: 'brief-1',
  module: 'pause',
  category: 'Pausing',
  tier: 'high',
  tierLabel: 'High impact',
  title: 'Pause · ITESO // AGOSTO - RTG',
  reason: null,
  basis: 'CPP 14d above the robust reference.',
  isHero: true,
  origin: 'brief',
  cta: { kind: 'queue_row', rowKey: 'rec:1', label: 'Review the pause' },
};

describe('SuggestionAsk — +2 type scale', () => {
  it('gives each of the three options its own icon', () => {
    render(
      <SuggestionAsk
        error="The worker is busy."
        gates={[gate('audience'), gate('budget', false), gate('creative')]}
        onAsk={() => undefined}
        pending={null}
      />,
    );
    for (const category of ['audience', 'budget', 'creative']) {
      const icon = screen.getByTestId(`suggestion-ask-icon:${category}`);
      expect(icon.querySelector('svg')).not.toBeNull();
      expect(icon.className).toContain('size-12');
    }
    expect(screen.getByTestId('suggestion-ask-icon:audience').innerHTML).toContain('lucide-users');
    expect(screen.getByTestId('suggestion-ask-icon:budget').innerHTML).toContain(
      'lucide-arrow-left-right',
    );
    expect(screen.getByTestId('suggestion-ask-icon:creative').innerHTML).toContain(
      'lucide-image-plus',
    );
  });

  it('uses no text-2xs or text-3xs anywhere, notes and error included', () => {
    render(
      <SuggestionAsk
        error="The worker is busy."
        gates={[gate('audience'), gate('budget', false), gate('creative')]}
        onAsk={() => undefined}
        pending={null}
      />,
    );
    const section = screen.getByTestId('suggestion-ask');
    expect(section.outerHTML).not.toMatch(SUB_XS);
    expect(within(section).getByRole('heading').className).toContain('text-xl');
    for (const button of within(section).getAllByRole('button')) {
      expect(button.className).toContain('h-10');
      expect(button.className).toContain('w-full');
    }
  });
});

describe('DailyReadList — +2 type scale', () => {
  it('uses no text-2xs or text-3xs anywhere and shows figures as stat chips', () => {
    render(
      <DailyReadList
        currency="MXN"
        failure={{ rowId: 'asked-1', message: 'Could not build it.' }}
        onCta={() => undefined}
        onDismiss={() => undefined}
        rows={[askedRow, heroRow]}
        source="brief"
      />,
    );
    const section = screen.getByTestId('daily-read');
    expect(section.outerHTML).not.toMatch(SUB_XS);
    expect(screen.getByText(askedRow.title).className).toContain('text-lg');
    const value = screen.getByText('1.25×');
    expect(value.className).toContain('text-lg');
    expect(value.parentElement?.className).toContain('rounded-lg');
    for (const button of within(section).getAllByRole('button')) {
      expect(button.className).toContain('h-10');
    }
  });
});
