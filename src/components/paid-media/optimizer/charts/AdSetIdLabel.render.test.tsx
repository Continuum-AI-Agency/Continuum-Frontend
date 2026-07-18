import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { AdSetIdLabel } from './AdSetIdLabel';

afterEach(cleanup);

describe('AdSetIdLabel', () => {
  it('renders the id and exposes the full value via title for the clipped case', () => {
    const { getByText, getByTitle } = render(<AdSetIdLabel id="act_123::adset_456" />);
    expect(getByText('act_123::adset_456')).toBeTruthy();
    expect(getByTitle('act_123::adset_456')).toBeTruthy();
  });

  it('uses the token type size, never a px literal', () => {
    const { getByText } = render(<AdSetIdLabel id="a1" />);
    const el = getByText('a1');
    expect(el.className).toContain('text-2xs');
    expect(el.className).not.toMatch(/text-\[\d/);
  });

  it('renders the human name (not mono) with the raw id kept in the title', () => {
    const { getByText, queryByText } = render(
      <AdSetIdLabel id="act_123::adset_456" name="Prospecting — Broad" />,
    );
    const el = getByText('Prospecting — Broad');
    expect(el.getAttribute('title')).toBe('Prospecting — Broad · act_123::adset_456');
    // The name replaces the raw id on the surface (id lives only in the title).
    expect(queryByText('act_123::adset_456')).toBeNull();
    expect(el.className).not.toContain('font-mono');
  });

  it('falls back to the mono raw id when the name is empty', () => {
    const { getByText } = render(<AdSetIdLabel id="act_123::adset_456" name="" />);
    const el = getByText('act_123::adset_456');
    expect(el.className).toContain('font-mono');
    expect(el.getAttribute('title')).toBe('act_123::adset_456');
  });
});
