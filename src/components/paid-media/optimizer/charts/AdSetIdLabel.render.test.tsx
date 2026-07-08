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
});
