import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

// The node badge is the surface a user sees WITHOUT opening the config, so its whole job is to
// say which rung of the type chain a render will use. The brand read is a boundary; the pure
// chain underneath it is not stubbed, because "does this brand resolve to `fallback`" is the
// claim under test.
let inputs: Record<string, unknown> = {};
let isLoading = false;
mock.module('@/lib/brands/useBrandType.client', () => ({
  useBrandType: () => ({ inputs, snapshot: null, facesReady: true, isLoading }),
}));
mock.module('../../stores/useStudioStore', () => ({
  useStudioStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ brandId: 'brand-1' }),
}));

import { ActionBrandNote } from './ActionBrandNote';

afterEach(() => {
  cleanup();
  inputs = {};
  isLoading = false;
});

describe('ActionBrandNote', () => {
  it('names the resolved family and its rung on the burn-in node', () => {
    inputs = { brandKit: { typography: { primary: 'Canela' } } };
    render(<ActionBrandNote actionId="image.text" />);
    const badge = screen.getByText('Canela');
    expect(badge.getAttribute('data-type-source')).toBe('brand-kit');
    expect(badge.getAttribute('title')).toContain('the brand kit');
  });

  it('says plainly that no brand face was found rather than showing a bare family', () => {
    inputs = {};
    render(<ActionBrandNote actionId="image.text" />);
    const badge = screen.getByText(/no brand face/);
    expect(badge.getAttribute('data-type-source')).toBe('fallback');
    expect(badge.getAttribute('title')).toContain('no brand face found');
  });

  it('says nothing at all for an op that resolves no brand value', () => {
    inputs = {};
    const { container } = render(<ActionBrandNote actionId="image.rotate" />);
    expect(container.textContent).toBe('');
  });

  it('shows nothing while the brand is still being read — an empty brand is not "fallback" yet', () => {
    isLoading = true;
    const { container } = render(<ActionBrandNote actionId="image.text" />);
    expect(container.textContent).toBe('');
  });
});
