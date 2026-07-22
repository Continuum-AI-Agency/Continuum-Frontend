import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { TooltipProvider } from '@/components/ui/tooltip';
import { AdSetIdLabel } from './AdSetIdLabel';

afterEach(cleanup);

function renderLabel(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('AdSetIdLabel', () => {
  it('renders the id and exposes the full value via title for the clipped case', () => {
    const { getByText, getByTitle } = renderLabel(<AdSetIdLabel id="act_123::adset_456" />);
    expect(getByText('act_123::adset_456')).toBeTruthy();
    expect(getByTitle('act_123::adset_456')).toBeTruthy();
  });

  it('uses the token type size, never a px literal', () => {
    const { getByText } = renderLabel(<AdSetIdLabel id="a1" />);
    const el = getByText('a1');
    expect(el.className).toContain('text-2xs');
    expect(el.className).not.toMatch(/text-\[\d/);
  });

  it('renders the human name (not mono) with the raw id kept in the title', () => {
    const { getByText, queryByText } = renderLabel(
      <AdSetIdLabel id="act_123::adset_456" name="Prospecting — Broad" />,
    );
    const el = getByText('Prospecting — Broad');
    expect(el.getAttribute('title')).toBe('Prospecting — Broad · act_123::adset_456');
    // The name replaces the raw id on the surface (id lives only in the title/tooltip).
    expect(queryByText('act_123::adset_456')).toBeNull();
    expect(el.className).not.toContain('font-mono');
  });

  it('falls back to the mono raw id when the name is empty', () => {
    const { getByText } = renderLabel(<AdSetIdLabel id="act_123::adset_456" name="" />);
    const el = getByText('act_123::adset_456');
    expect(el.className).toContain('font-mono');
    expect(el.getAttribute('title')).toBe('act_123::adset_456');
  });

  it('keeps the campaign name out of the visible trigger (tooltip-only context)', () => {
    const { getByText, queryByText } = renderLabel(
      <AdSetIdLabel
        id="act_123::adset_456"
        name="Prospecting — Broad"
        campaignName="Spring Campaign"
      />,
    );
    // The trigger shows only the name; the campaign is surfaced through the tooltip.
    expect(getByText('Prospecting — Broad')).toBeTruthy();
    expect(queryByText('Spring Campaign')).toBeNull();
  });
});
