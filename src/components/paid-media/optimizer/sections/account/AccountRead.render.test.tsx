import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

// CalmRule — the one element that moves — comes from motion/react. A passthrough keeps the
// variant label readable ("calm" on the principal card, "still" on the rest) and the file free
// of a real animation loop. `mock.module` replaces it for the whole process, so this file runs
// on its own.
mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate, ...rest } = props;
      return React.createElement(tag, {
        ...rest,
        'data-anim': typeof animate === 'string' ? animate : undefined,
        ref,
      });
    });
  return {
    motion: { section: passthrough('section'), span: passthrough('span'), div: passthrough('div') },
    useReducedMotion: () => false,
  };
});

import type { AccountCandidate } from '@continuum/contracts';
import {
  ACCOUNT_DETECTOR_META,
  ACTION_FAMILY_COPY,
  accountCandidateAction,
  accountCandidateSchema,
  accountCandidateTitle,
  actionLabel,
  DETECTOR_ACTION_FAMILY,
  titleText,
} from '@continuum/contracts';
import { AccountRead } from './AccountRead';

afterEach(cleanup);

const portfolioNames = new Map([
  ['p1', 'FORMULARIOS // TODOS'],
  ['p2', 'Prueba'],
]);

const candidate = (over: Partial<AccountCandidate>): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'dead_tail:a1',
    detector: 'dead_tail',
    portfolio_ids: ['p1'],
    impact_per_day: 102,
    impact_class: 'recoverable',
    impact_basis: '2 ad sets with 0 results in 7 days, together spending 102/day',
    cta: { kind: 'portfolio', target_id: 'p1' },
    ...over,
  });

/** A detector holding a headline, so the title composes on the client. */
const reallocation = candidate({
  id: 'portfolio_reallocation:p1>p2',
  detector: 'portfolio_reallocation',
  portfolio_ids: ['p1', 'p2'],
  impact_per_day: 66.67,
  impact_class: 'better_price',
  impact_basis: '200/day moved from a portfolio at 90 to one at 60, which is 33% cheaper',
  result_label: 'leads',
  evidence: { portfolio: 'Prospecting' },
  headline: {
    kind: 'efficiency',
    value: 33,
    unit: 'percent',
    label: 'cheaper per result',
    from: 90,
    to: 60,
  },
});

/** A candidate the Backend already stamped with its title and its action. */
const stamped = candidate({
  id: 'dead_tail:stamped',
  title: {
    entity: 'ITESO // AGOSTO - RTG',
    figure: 101,
    unit: 'MXN por lead',
    comparator: '2.9× la referencia de 35 MXN',
    window: 'd7',
  },
  action: { verb: 'restore_delivery', sizing: null },
});

const many = (n: number): AccountCandidate[] =>
  Array.from({ length: n }, (_, i) =>
    candidate({ id: `dead_tail:a${i}`, impact_per_day: 1000 - i * 10 }),
  );

function view(
  candidates: AccountCandidate[],
  over: Partial<Parameters<typeof AccountRead>[0]> = {},
) {
  return render(
    <AccountRead
      candidates={candidates}
      currency="USD"
      dailySpend={1200}
      portfolioNames={portfolioNames}
      {...over}
    />,
  );
}

describe('AccountRead — the cards in rank order', () => {
  it('ranks on discounted money and marks only the first card as the principal one', () => {
    const { container, getAllByText, getAllByTestId } = view([reallocation, candidate({})]);
    const cards = container.querySelectorAll('[data-testid="account-card"]');
    expect(cards).toHaveLength(2);
    // 102 recoverable outranks 66.67 at a better price.
    expect(cards[0]?.getAttribute('data-detector')).toBe('dead_tail');
    expect(cards[0]?.getAttribute('data-lead')).toBe('true');
    expect(cards[1]?.getAttribute('data-lead')).toBe('false');
    expect(getAllByText('Lead')).toHaveLength(1);
    // Only the principal card breathes.
    const rules = getAllByTestId('account-card-rule');
    expect(rules.map((rule) => rule.getAttribute('data-anim'))).toEqual(['calm', 'still']);
  });

  it('renders the root as the cards section', () => {
    const { getByTestId } = view(many(1));
    expect(getByTestId('account-cards').tagName).toBe('SECTION');
  });
});

describe('AccountRead — the title is entity + figure + comparison', () => {
  it('prints the title the Backend stamped, and the verb it chose', () => {
    const { container } = view([stamped]);
    expect(container.querySelector('h3')?.textContent).toBe(
      'ITESO // AGOSTO - RTG: 101 MXN por lead, 2.9× la referencia de 35 MXN',
    );
    expect(container.textContent).toContain('Restaurar la entrega');
    // The figure lives in the title; no second lead figure under it.
    expect(container.querySelector('[data-headline]')).toBeNull();
  });

  it('composes the title on the client when the Backend has not stamped one', () => {
    const { container } = view([reallocation]);
    const expected = accountCandidateTitle(reallocation, 'USD');
    expect(expected).not.toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe(
      titleText(expected as NonNullable<typeof expected>),
    );
    expect(container.textContent).toContain('Prospecting');
    expect(container.querySelector('[data-headline]')).toBeNull();
  });

  it('keeps the money as the support line under a title', () => {
    const { container } = view([reallocation]);
    expect(container.textContent).toContain('$66.67/day · $2,000/mo');
    expect(container.textContent).toContain('leads');
  });

  it('falls back to the detector label and the money figure when there is no headline', () => {
    const { container } = view([candidate({})]);
    expect(container.querySelector('h3')?.textContent).toBe(ACCOUNT_DETECTOR_META.dead_tail.label);
    expect(container.querySelector('[data-headline="money_fallback"]')).toBeTruthy();
    expect(container.textContent).toContain('$102');
    expect(container.textContent).toContain('$3,060/mo');
  });

  it('prints the body under the title', () => {
    const { container } = view([candidate({})]);
    expect(container.textContent).toContain('2 ad sets with 0 results in 7 days');
  });
});

describe('AccountRead — the tier, in words', () => {
  it('says High, Medium and Low against the daily spend', () => {
    // dailySpend 1200 → floor 24: high at 120 and above, medium at 24, low below.
    const { getByText } = view([
      candidate({ id: 'dead_tail:hi', impact_per_day: 400 }),
      candidate({ id: 'dead_tail:mid', impact_per_day: 102 }),
      candidate({ id: 'dead_tail:lo', impact_per_day: 10 }),
    ]);
    expect(getByText('High')).toBeTruthy();
    expect(getByText('Medium')).toBeTruthy();
    expect(getByText('Low')).toBeTruthy();
  });
});

describe('AccountRead — the button says the verb', () => {
  it('labels the button from the action and opens the portfolio the cta names', () => {
    const onOpenPortfolio = mock((_id: string) => {});
    const only = candidate({});
    const { getByTestId } = view([only], { onOpenPortfolio });
    const button = getByTestId('account-card-action');
    expect(button.textContent).toBe(actionLabel(accountCandidateAction(only, 'USD')));
    expect(button.textContent).toContain('Pausar');
    fireEvent.click(button);
    expect(onOpenPortfolio).toHaveBeenCalledWith('p1');
  });

  it('offers no button when the cta is not a portfolio', () => {
    const { queryByTestId } = view([candidate({ cta: { kind: 'none', target_id: null } })], {
      onOpenPortfolio: mock(() => {}),
    });
    expect(queryByTestId('account-card-action')).toBeNull();
  });

  it('offers no button when nobody can open a portfolio', () => {
    const { queryByTestId } = view([candidate({})]);
    expect(queryByTestId('account-card-action')).toBeNull();
  });
});

describe('AccountRead — the way into Jaina', () => {
  it('links to Jaina with a prompt that names the title and the portfolio', () => {
    const { getByTestId } = view([stamped]);
    const href = getByTestId('account-card-jaina').getAttribute('href') ?? '';
    expect(href.startsWith('/scale?tab=jaina&prompt=')).toBe(true);
    const prompt = decodeURIComponent(href.slice('/scale?tab=jaina&prompt='.length));
    expect(prompt).toContain('ITESO // AGOSTO - RTG: 101 MXN por lead');
    expect(prompt).toContain('FORMULARIOS // TODOS');
    expect(getByTestId('account-card-jaina').textContent).toContain('Ask Jaina');
  });

  it('names every portfolio the card is about, and none when none resolve', () => {
    const named = view([reallocation]);
    expect(named.getByTestId('account-card-portfolios').textContent).toBe(
      'FORMULARIOS // TODOS · Prueba',
    );
    cleanup();
    const unnamed = view([candidate({ portfolio_ids: ['unknown'] })]);
    expect(unnamed.queryByTestId('account-card-portfolios')).toBeNull();
    const href = unnamed.getByTestId('account-card-jaina').getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toContain('in the account');
  });
});

describe('AccountRead — a guard names what it poisons', () => {
  const guard = candidate({
    id: 'measurement_integrity:acct',
    detector: 'measurement_integrity',
    impact_per_day: 9000,
    impact_basis: 'purchase absent from 2 sibling campaigns for 31 hours',
    cta: { kind: 'none', target_id: null },
  });

  it('puts the banner above the cards and keeps the guard out of the ranking', () => {
    const { container } = view([candidate({}), guard]);
    const banner = container.querySelector('[data-guard="measurement_integrity"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('31 hours');
    const cards = container.querySelectorAll('[data-testid="account-card"]');
    expect([...cards].map((card) => card.getAttribute('data-detector'))).toEqual(['dead_tail']);
    const first = cards[0] as Element;
    expect(
      Boolean(
        (banner as Element).compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    // dead_tail prices itself off a conversion count, so the guard casts doubt on it.
    expect(first.textContent).toContain('affected by the guard');
  });

  it('does not mark a card the guard has no bearing on', () => {
    const untouched = candidate({
      id: 'testing_discipline:acct',
      detector: 'testing_discipline',
      impact_class: 'deferred',
    });
    const { container } = view([guard, untouched]);
    expect(container.textContent).not.toContain('affected by the guard');
  });
});

describe('AccountRead — four, then the rest behind one control', () => {
  it('shows four and prices what skipping the rest costs', () => {
    const { getAllByTestId, getByRole } = view(many(6));
    expect(getAllByTestId('account-card')).toHaveLength(4);
    const toggle = getByRole('button', { name: /2 more/ });
    // 960 + 950 = 1910 a day sits behind the control, and it says so.
    expect(toggle.textContent).toContain('1,910');
    expect(toggle.textContent).toContain('between them');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals the rest as more cards in the same grid', () => {
    const { getAllByTestId, getByRole } = view(many(6));
    fireEvent.click(getByRole('button', { name: /2 more/ }));
    expect(getAllByTestId('account-card')).toHaveLength(6);
    expect(getByRole('button', { name: /Hide the rest/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('offers no control when four or fewer fired', () => {
    const { queryByText } = view(many(4));
    expect(queryByText(/more ·/)).toBeNull();
  });
});

describe('AccountRead — the card says what it will actually do', () => {
  it('says so when a card acts unattended', () => {
    const { container } = view([candidate({ state: 'autopilot' })]);
    expect(container.textContent).toContain('Acts on its own, within your limits.');
  });

  it('names the family standing in the way when a choice was lowered', () => {
    const { getByTestId } = view([candidate({ state: 'recommend', state_lowered: true })]);
    const note = getByTestId('state-lowered').textContent ?? '';
    expect(note).toContain('does not allow it yet — it will recommend.');
    expect(note).toContain(ACTION_FAMILY_COPY[DETECTOR_ACTION_FAMILY.dead_tail].label);
  });

  it('stays quiet on a plain recommend or when nobody has been asked', () => {
    const { container } = view([
      candidate({ state: 'recommend' }),
      candidate({ id: 'dead_tail:b' }),
    ]);
    expect(container.textContent).not.toContain('Acts on its own');
    expect(container.textContent).not.toContain('does not allow it yet');
  });

  it('says when a velocity cap, not the gap, set the number', () => {
    const { container } = view([candidate({ capped_by: 'velocity' })]);
    expect(container.textContent).toContain('per-cycle ceiling');
  });
});

describe('AccountRead — a quiet day', () => {
  it('renders nothing at all when no card and no guard fired', () => {
    const { container, queryByTestId } = view([]);
    expect(queryByTestId('account-cards')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('AccountRead — nothing of the old surface survives', () => {
  it('never prints the sentence header, the check count or the draft note', () => {
    const guard = candidate({
      id: 'measurement_integrity:acct',
      detector: 'measurement_integrity',
      cta: { kind: 'none', target_id: null },
    });
    const { container, getByRole } = view([guard, ...many(6)], { onOpenPortfolio: mock(() => {}) });
    fireEvent.click(getByRole('button', { name: /more ·/ }));
    const text = container.textContent ?? '';
    expect(text).not.toContain('Across the account');
    expect(text).not.toContain('checks could not run');
    expect(text).not.toContain('Draft read');
    expect(text).not.toContain('Nothing to move');
  });
});
