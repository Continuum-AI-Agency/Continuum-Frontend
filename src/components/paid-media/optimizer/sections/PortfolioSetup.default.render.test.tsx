import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { PortfolioSuggestion } from '@continuum/contracts';
// PortfolioSetup's subtree statically imports several hooks from useOptimizerData; spread the
// real module so every export exists, then override only the four the suggestion-create path
// uses (the overridden ones never touch the network — the others are not mounted in this view).
import * as realData from '../useOptimizerData';

const createMutate = mock(() => {});

const suggestion: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads · Efficiency',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 1600,
  cpa_target: 36,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 4200, conv14: 60 },
  reason: 'Grouped by objective',
};

mock.module('../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdAccounts: () => ({
    data: [
      { platform: 'meta', account_id: 'act_1', name: 'Acct', status: 'ACTIVE', currency: 'USD' },
    ],
  }),
  useOptimizerSuggestions: () => ({
    data: { suggestions: [suggestion], diagnostics: null, reason: null },
    isLoading: false,
    isError: false,
  }),
  useOptimizerAccountSnapshots: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerMutations: () => ({
    create: { mutate: createMutate, isPending: false },
    enroll: { mutate: mock(() => {}), isPending: false },
    run: { mutate: mock(() => {}), isPending: false },
  }),
}));

const { PortfolioSetup } = await import('./PortfolioSetup');

afterEach(() => {
  cleanup();
  createMutate.mockClear();
});

describe('PortfolioSetup — suggestion creates start in Recommend, not Observe', () => {
  it('creates the suggested portfolio in recommend mode', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);

    fireEvent.click(screen.getByRole('button', { name: /^Create$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const [payload] = createMutate.mock.calls[0] as [{ config: { apply_mode: string } }];
    expect(payload.config.apply_mode).toBe('recommend');
  });

  it('tells the operator it starts in Recommend and proposes moves', () => {
    render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('Starts in Recommend');
    // The old copy promising an Observe soak must be gone.
    expect(document.body.textContent).not.toContain('Starts in Observe');
  });
});
