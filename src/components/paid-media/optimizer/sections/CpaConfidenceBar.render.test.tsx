import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { TooltipProvider } from '@/components/ui/tooltip';
import { cycleItemsMixed } from '../charts/__fixtures__/optimizerFixtures';
import { CpaConfidenceBar } from './CpaConfidenceBar';

afterEach(cleanup);

const [gainer, , held] = cycleItemsMixed;

function renderRow(item: (typeof cycleItemsMixed)[number], name?: string) {
  return render(
    <TooltipProvider>
      <CpaConfidenceBar item={item} maxCpa={74} currency="USD" name={name} />
    </TooltipProvider>,
  );
}

describe('CpaConfidenceBar', () => {
  it('renders a HeldPill (not a $0.00 CI) for a held ad set, no hardcoded amber', () => {
    const { getByText, container } = renderRow(held);
    expect(getByText('Held · CBO/lifetime')).toBeTruthy();
    expect(getByText('budget unchanged')).toBeTruthy();
    expect(container.innerHTML).toContain('bg-warning');
    expect(container.innerHTML).not.toMatch(/amber-/);
  });

  it('renders the CPA estimate + confidence interval for a scored ad set', () => {
    const { getByText, container } = renderRow(gainer);
    expect(getByText('act_1::adset_gainer')).toBeTruthy();
    expect(container.textContent).toContain('$22');
    expect(container.textContent).toContain('$16');
    expect(container.textContent).toContain('$30');
    expect(container.textContent).toContain('55ev');
  });

  it('shows the human ad-set name (id kept in the title) when a name is supplied', () => {
    const { getByText, queryByText } = renderRow(gainer, 'Prospecting — Broad');
    const label = getByText('Prospecting — Broad');
    expect(label.getAttribute('title')).toBe('Prospecting — Broad · act_1::adset_gainer');
    expect(queryByText('act_1::adset_gainer')).toBeNull();
  });

  it('labels a held ad set with its name, not the raw id', () => {
    const { getByText } = renderRow(held, 'Retargeting — 30d');
    expect(getByText('Retargeting — 30d')).toBeTruthy();
    expect(getByText('Held · CBO/lifetime')).toBeTruthy();
  });
});
