import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Motion draws nothing a test can read: a passthrough per tag (cached, so a component keeps its
// identity across renders) that drops the animation props. `mock.module` replaces it for the
// whole process, so this file runs on its own.
mock.module('motion/react', () => {
  const React = require('react');
  const MOTION_PROPS = new Set([
    'animate',
    'exit',
    'initial',
    'layout',
    'layoutId',
    'transition',
    'variants',
  ]);
  const cache = new Map<string, unknown>();
  const passthrough = (tag: string) => {
    const known = cache.get(tag);
    if (known) return known;
    const component = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, {
        ...Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key))),
        ref,
      }),
    );
    cache.set(tag, component);
    return component;
  };
  const Children = ({ children }: { children?: unknown }) =>
    React.createElement(React.Fragment, null, children);
  return {
    motion: new Proxy({}, { get: (_target, tag: string) => passthrough(tag) }),
    AnimatePresence: Children,
    LayoutGroup: Children,
    useReducedMotion: () => false,
  };
});

// The module's reads and writes, recorded. Spread the real module: mock.module replaces it for
// the whole process.
const realOptimizerData = await import('../../../useOptimizerData');
type PlatformCardsAnswer =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; cards: unknown[] };
type AccountReadAnswer = { data: unknown; isLoading: boolean; isError: boolean };
type ApplySent = {
  portfolio_id: string;
  actions: unknown[];
  dryRun: boolean;
  recommendation_id?: string;
};
type StatusSent = { recommendation_id: string; status: string };

/** The apply_audits row the landed write leaves, which its Undo names. */
const AUDIT_ID = '0f0f0f0f-0000-4000-8000-000000000001';

let platformCards: PlatformCardsAnswer = { status: 'loading' };
let accountRead: AccountReadAnswer = { data: null, isLoading: false, isError: false };
let applySent: ApplySent[] = [];
let statusSent: StatusSent[] = [];

mock.module('../../../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerPlatformCards: () => platformCards,
  useOptimizerAccountRead: () => accountRead,
  useAccountApprovals: () => ({ data: undefined }),
  useOptimizerMutations: () => ({
    setStatus: {
      mutate: (input: StatusSent, options?: { onSuccess?: () => void }) => {
        statusSent.push(input);
        options?.onSuccess?.();
      },
      isPending: false,
      variables: undefined,
    },
  }),
  // Real mutations, so the write's response lands in the mutation cache the card reads back.
  useApplyOptimizerActions: () =>
    useMutation({
      mutationFn: async (request: ApplySent) => {
        applySent.push(request);
        return request.dryRun
          ? { ok: true, dryRun: true, results: [{ status: 'would_apply', kind: 'set_budget' }] }
          : {
              ok: true,
              dryRun: false,
              results: [
                {
                  status: 'applied',
                  kind: 'set_budget',
                  legs: [{ status: 'applied', auditId: AUDIT_ID }],
                },
              ],
            };
      },
    }),
  useRevertOptimizerAction: () => useMutation({ mutationFn: async () => null }),
}));

import {
  ACCOUNT_DETECTOR_META,
  type AccountCandidate,
  AD_ACCOUNT_MODE_LABELS,
  type AdAccountMode,
  type BoardModuleSize,
  PortfolioListItemSchema,
} from '@continuum/contracts';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RAISE_GOOGLE_BUDGET } from '../../platformCards/__fixtures__/platformCardActions';
import type { BoardContext, BoardPlatform } from '../types';
import {
  EASYFIT_AUCTION,
  EASYFIT_BRANCH_MOVE,
  EASYFIT_SUSPENDED,
  GOOGLE_PORTFOLIO_ID,
  META_MEASUREMENT_GUARD,
  PINK_CHECKLIST,
  PINK_INTENT_NEGATIVES,
  VIVO_BRAND_TERMS,
  VIVO_BUDGET_WRITE,
  VIVO_INFLATED_CONVERSION,
  VIVO_NEGATIVES_WRITE,
} from './decisions/__fixtures__/decisionCandidates';
import { NOTHING_TO_APPLY_REASON, READ_FINDING_DISMISS_REASON } from './decisions/decisionControl';

const { default: DecisionsStack } = await import('./DecisionsStack');

/** Vivo 47's Google portfolio, as optimizer_list_portfolios lists it. */
const TEST_1 = PortfolioListItemSchema.parse({
  id: GOOGLE_PORTFOLIO_ID,
  name: 'Test 1 — Google Ads (Vivo 47)',
  ad_account_id: '3710693645',
  objective: 'lead',
  level: 'campaign',
  mode: 'efficiency',
  apply_mode: 'recommend',
  daily_total: 1629,
  period_budget: null,
  status: 'active',
  next_realloc_at: null,
  adset_count: 2,
  pending_recommendations: 6,
  platforms: ['google_ads'],
});

const VIVO_CARDS: AccountCandidate[] = [
  VIVO_BUDGET_WRITE,
  VIVO_NEGATIVES_WRITE,
  EASYFIT_SUSPENDED,
  VIVO_INFLATED_CONVERSION,
  VIVO_BRAND_TERMS,
];

const calls = { actions: 0, created: 0, selected: [] as string[] };

function renderStack({
  platform = 'google_ads',
  mode = 'approve',
  size = 'm',
}: {
  platform?: BoardPlatform;
  mode?: AdAccountMode;
  size?: BoardModuleSize;
} = {}) {
  const ctx: BoardContext = {
    brandId: 'brand-vivo',
    platform,
    adAccountId: platform === 'meta' ? 'act_521903353286118' : null,
    currency: 'MXN',
    portfolios: platform === 'google_ads' ? [TEST_1] : [],
    reading: {
      platform,
      mode,
      modeLabel: AD_ACCOUNT_MODE_LABELS[mode],
      modeReason: 'Motivo de la lectura.',
      result: {
        label: 'leads',
        count: null,
        platformReported: null,
        costPerResult: null,
        goal: null,
        spend: null,
        currency: 'MXN',
        windowDays: 30,
      },
      board: [],
      hidden: [],
      asks: [],
    },
    onOpenActions: () => {
      calls.actions += 1;
    },
    onOpenActivity: () => {},
    onSelectPortfolio: (portfolioId) => {
      calls.selected.push(portfolioId);
    },
    onCreatePortfolio: () => {
      calls.created += 1;
    },
  };
  // A fresh client per render: the mutation cache the cards read is this test's alone.
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DecisionsStack
          ctx={ctx}
          slot={{ module: 'decisions', size, score: 70, reason: '6 decisiones esperan.' }}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const titles = () => screen.queryAllByTestId('decision-title').map((node) => node.textContent);

function cardTitled(title: string): HTMLElement {
  const card = screen
    .getAllByTestId('decision-card')
    .find((node) => within(node).queryByTestId('decision-title')?.textContent === title);
  if (!card) throw new Error(`no card titled ${title}`);
  return card;
}

beforeEach(() => {
  platformCards = { status: 'loading' };
  accountRead = { data: null, isLoading: false, isError: false };
  applySent = [];
  statusSent = [];
  calls.actions = 0;
  calls.created = 0;
  calls.selected = [];
});

afterEach(cleanup);

describe('DecisionsStack · Google, you approve', () => {
  it('stacks the cards in impact order under the filters and their counts', () => {
    platformCards = { status: 'ready', cards: VIVO_CARDS };
    renderStack();
    expect(screen.getByTestId('board-module-decisions-reason').textContent).toBe(
      '6 decisiones esperan.',
    );
    // m shows three: the dark account first, then the high P8 finding, then the priced card.
    expect(titles()).toEqual([
      'No campaign in the account has served for 5 days: one cause for the whole account',
      'La mayor parte de lo que Google llama conversión es una visita',
      '2 search terms in VIVO 47-EKATAR spent $2,172 MXN in 30 days without a conversion',
    ]);
    expect(screen.getByTestId('decisions-show-more').textContent).toBe('Show 2 more');
    expect(screen.getByRole('button', { name: 'All, 5' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Fix, 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clean, 1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Grow, 2' }));
    expect(screen.getByTestId('decisions-list').getAttribute('data-filter')).toBe('grow');
    expect(titles()).toEqual([
      'El 54% del gasto compra gente que ya te buscaba',
      'VIVO 47-EKATAR loses 28% of impressions to budget with leads at $773 MXN',
    ]);
    expect(
      screen.getAllByTestId('decision-card').every((card) => card.dataset.group === 'grow'),
    ).toBe(true);
  });

  it('draws the evidence bars from the card and its price as the impact', () => {
    platformCards = { status: 'ready', cards: [VIVO_NEGATIVES_WRITE] };
    renderStack();
    const card = screen.getByTestId('decision-card');
    expect(within(card).getByTestId('decision-impact').textContent).toBe('$72.40 MXN/day');
    const bars = within(card).getAllByTestId('decision-bar');
    expect(bars.map((bar) => bar.dataset.tone)).toEqual(['above', 'above']);
    expect(bars[0]?.textContent).toContain('"vivo 47 center"');
    expect(bars[0]?.textContent).toContain('$1,206 MXN');
  });

  it('opens the approval with the exact write, asking the platform first', async () => {
    platformCards = { status: 'ready', cards: [VIVO_BUDGET_WRITE] };
    renderStack();
    fireEvent.click(screen.getByTestId('decision-approve'));
    await screen.findByTestId('platform-card-action-preview');
    expect(applySent).toEqual([
      {
        portfolio_id: GOOGLE_PORTFOLIO_ID,
        actions: [RAISE_GOOGLE_BUDGET],
        dryRun: true,
        recommendation_id: '099715be-19c7-4c04-9cac-1e416391498a',
      },
    ]);
    expect(screen.getByTestId('platform-card-action-change').textContent).toContain('→');
  });

  it('says Applied beside the Undo once the write lands, and offers it no second time', async () => {
    platformCards = { status: 'ready', cards: [VIVO_BUDGET_WRITE] };
    renderStack();
    expect(screen.getByTestId('decision-dismiss')).toBeTruthy();
    fireEvent.click(screen.getByTestId('decision-approve'));
    const dialog = await screen.findByTestId('platform-card-action-dialog');
    const confirm = within(dialog).getByTestId('platform-card-action-confirm') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await screen.findByTestId('platform-card-action-result');
    expect(applySent.map((request) => request.dryRun)).toEqual([true, false]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(await screen.findByTestId('platform-card-undo')).toBeTruthy();
    const card = screen.getByTestId('decision-card');
    expect(card.dataset.applied).toBe('true');
    expect(within(card).getByTestId('decision-applied').textContent).toBe('Applied');
    expect(within(card).queryByTestId('decision-approve')).toBeNull();
    expect(within(card).queryByTestId('decision-dismiss')).toBeNull();
  });

  it('dismisses a card by recording its recommendation as rejected', () => {
    platformCards = { status: 'ready', cards: [VIVO_NEGATIVES_WRITE] };
    renderStack();
    fireEvent.click(screen.getByTestId('decision-dismiss'));
    expect(statusSent).toEqual([
      { recommendation_id: '655b7c7e-0027-4036-8f21-970ef088a470', status: 'rejected' },
    ]);
    expect(screen.getByTestId('decision-dismissed').textContent).toBe('Dismissed');
  });

  it("names the card's portfolio and opens it", () => {
    platformCards = { status: 'ready', cards: [VIVO_BUDGET_WRITE] };
    renderStack();
    const link = screen.getByTestId('decision-portfolio');
    expect(link.textContent).toBe('Test 1 — Google Ads (Vivo 47)');
    fireEvent.click(link);
    expect(calls.selected).toEqual([GOOGLE_PORTFOLIO_ID]);
  });

  it('shows the rest of the stack on request, and reviews all in Actions', () => {
    platformCards = { status: 'ready', cards: VIVO_CARDS };
    renderStack();
    fireEvent.click(screen.getByTestId('decisions-show-more'));
    expect(titles()).toHaveLength(5);
    fireEvent.click(screen.getByTestId('decisions-review-all'));
    expect(calls.actions).toBe(1);
  });
});

describe('DecisionsStack · Meta, autopilot', () => {
  beforeEach(() => {
    accountRead = {
      data: {
        read: {
          candidates: [EASYFIT_AUCTION, EASYFIT_BRANCH_MOVE],
          guards: [META_MEASUREMENT_GUARD],
          ceiling_defaults: {},
          currency: 'MXN',
          scale_per_day: 1660,
        },
      },
      isLoading: false,
      isError: false,
    };
  });

  it('reads the guard first and shows the autopilot move queued, with its two branches', () => {
    renderStack({ platform: 'meta', mode: 'operate', size: 'l' });
    expect(titles()[0]).toBe(ACCOUNT_DETECTOR_META.measurement_integrity.label);
    const move = screen
      .getAllByTestId('decision-card')
      .find((card) => card.dataset.control === 'queued');
    if (!move) throw new Error('the branch move is queued');
    expect(within(move).getByTestId('decision-queued').textContent).toBe('Queued');
    expect(within(move).getByTestId('decision-doubted')).toBeTruthy();
    const bars = within(move).getAllByTestId('decision-bar');
    expect(bars.map((bar) => bar.textContent)).toEqual(['ITESO$557 MXN', 'ALEIRA$331 MXN']);
  });

  it('disables what a read finding cannot do, and says why', () => {
    renderStack({ platform: 'meta', mode: 'approve', size: 'l' });
    const auction = screen
      .getAllByTestId('decision-card')
      .find((card) => card.dataset.group === 'clean');
    if (!auction) throw new Error('the auction finding is on the board');
    const approve = within(auction).getByTestId('decision-unavailable');
    expect(approve.hasAttribute('disabled')).toBe(true);
    expect(auction.textContent).toContain(NOTHING_TO_APPLY_REASON);
    expect(within(auction).getByTestId('decision-dismiss').hasAttribute('disabled')).toBe(true);
    expect(auction.textContent).toContain(READ_FINDING_DISMISS_REASON);
  });

  it('says plainly when there is no read yet', () => {
    accountRead = { data: null, isLoading: false, isError: false };
    renderStack({ platform: 'meta', mode: 'operate' });
    expect(screen.getByTestId('board-module-decisions-empty').textContent).toContain(
      'has not read this account yet',
    );
    expect(screen.getByTestId('board-module-decisions').dataset.moduleState).toBe('missing');
  });
});

describe('DecisionsStack · the other modes', () => {
  it('copies the negatives for the client when Continuum only recommends', async () => {
    const copied: string[] = [];
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
    });
    platformCards = { status: 'ready', cards: [PINK_INTENT_NEGATIVES] };
    renderStack({ mode: 'recommend' });
    fireEvent.click(screen.getByTestId('decision-copy'));
    await waitFor(() => expect(screen.getByTestId('decision-copy').textContent).toBe('Copied'));
    expect(copied).toEqual(['curso iso 27001 gratis\niso 27001 pdf\niso 27001 tarea']);
  });

  it('opens the steps of a fix and locks the write that waits for it', () => {
    platformCards = { status: 'ready', cards: [VIVO_BUDGET_WRITE, VIVO_INFLATED_CONVERSION] };
    renderStack({ mode: 'fix' });
    const fix = cardTitled('La mayor parte de lo que Google llama conversión es una visita');
    expect(within(fix).queryByTestId('decision-steps')).toBeNull();
    const button = within(fix).getByTestId('decision-fix');
    expect(button.textContent).toBe('Fix in Google Ads');
    fireEvent.click(button);
    expect(within(fix).getAllByTestId('decision-step')).toHaveLength(2);
    expect(within(fix).getByTestId('decision-open-platform').getAttribute('href')).toBe(
      'https://ads.google.com/aw/campaigns',
    );

    const locked = screen
      .getAllByTestId('decision-card')
      .find((card) => card.dataset.control === 'locked');
    if (!locked) throw new Error('the budget write waits for the fix');
    expect(within(locked).getByTestId('decision-locked').hasAttribute('disabled')).toBe(true);
    expect(locked.textContent).toContain(
      'Waits for the fix first: La mayor parte de lo que Google llama conversión es una visita',
    );
  });

  it('marks the steps change history verified', () => {
    platformCards = { status: 'ready', cards: [PINK_CHECKLIST] };
    renderStack({ mode: 'fix' });
    const toggle = screen.getByTestId('decision-steps-toggle');
    expect(toggle.textContent).toBe('Steps · 3');
    fireEvent.click(toggle);
    const steps = screen.getAllByTestId('decision-step');
    expect(steps.map((step) => step.dataset.status)).toEqual(['done', 'done', 'pending']);
  });

  it('calls the steps what the client does on an account the client runs', () => {
    platformCards = { status: 'ready', cards: [PINK_CHECKLIST] };
    renderStack({ mode: 'recommend' });
    expect(screen.getByTestId('decision-steps-toggle').textContent).toBe(
      'What the client does · 3',
    );
  });

  it('offers the first portfolio in setup', () => {
    platformCards = { status: 'ready', cards: [] };
    renderStack({ mode: 'setup' });
    expect(screen.queryByTestId('decisions-review-all')).toBeNull();
    fireEvent.click(screen.getByTestId('decision-create'));
    expect(calls.created).toBe(1);
  });
});

describe('DecisionsStack · size and state', () => {
  it('shows the count, the split by tier and the top card at size s', () => {
    platformCards = { status: 'ready', cards: VIVO_CARDS };
    renderStack({ size: 's' });
    expect(screen.getByTestId('decisions-count').textContent).toBe('5');
    expect(screen.getByTestId('decisions-summary').textContent).toContain(
      'decisions wait · 2 high · 3 medium',
    );
    expect(screen.getAllByTestId('decision-card')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'All, 5' })).toBeNull();
  });

  it('holds its footprint while the cards load', () => {
    platformCards = { status: 'loading' };
    renderStack();
    expect(screen.getByTestId('board-module-decisions-skeleton')).toBeTruthy();
  });

  it('says a failed read failed, never that nothing waits', () => {
    platformCards = { status: 'error' };
    renderStack();
    expect(screen.getByTestId('board-module-decisions-error').textContent).toContain(
      'could not be read',
    );
    expect(screen.getByTestId('board-module-decisions').dataset.moduleState).toBe('error');
    expect(screen.queryByTestId('decisions-empty')).toBeNull();
  });
});
