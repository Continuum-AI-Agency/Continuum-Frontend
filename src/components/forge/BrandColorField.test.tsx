/**
 * BrandColorField against a mocked brand read: palette colour tokens become swatches (typography
 * and unresolvable aliases do not), a click picks the swatch's six-digit hex, the current value
 * wears the ring, and the free hex field stays beside them.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { BrandTypeInputs } from '@continuum/contracts';

const loadMock = mock(
  async (): Promise<BrandTypeInputs> => ({
    designSystem: {
      tokens: [
        token('--brand-orange', '#FF6600'),
        token('--ink', '#abc'),
        // same colour again under another name: one swatch
        token('--accent', 'var(--brand-orange)', '#ff6600'),
        // an alias nothing resolved: offering it would offer a colour that does not exist
        token('--mystery', 'var(--nowhere)'),
        { ...token('--t-body', '16px'), kind: 'dimension' },
      ],
    } as unknown as BrandTypeInputs['designSystem'],
  }),
);

mock.module('@/lib/brands/brandTypeInputs.client', () => ({
  loadBrandTypeInputs: loadMock,
  brandTypeInputsQueryKey: (brandId?: string) => ['brand-type-inputs', brandId] as const,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrandColorField } from './BrandColorField';

const BRAND = '22222222-2222-4222-8222-222222222222';

function token(name: string, value: string, resolvedValue: string | null = null) {
  return { name, value, kind: 'color', resolvedValue, definedIn: null, description: null };
}

function renderField(value: string | null, onChange = mock((_hex: string) => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BrandColorField brandId={BRAND} value={value} onChange={onChange} label="Background" />
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(() => {
  cleanup();
  loadMock.mockClear();
});

describe('BrandColorField', () => {
  test('offers each resolvable palette colour once, as six-digit hex', async () => {
    renderField(null);
    const orange = await screen.findByRole('button', { name: 'Background: --brand-orange' });
    expect(orange.getAttribute('title')).toBe('--brand-orange #ff6600');
    expect(screen.getByRole('button', { name: 'Background: --ink' }).getAttribute('title')).toBe(
      '--ink #aabbcc',
    );
    expect(screen.getAllByRole('button', { name: /^Background: / })).toHaveLength(2);
    expect(loadMock).toHaveBeenCalledWith(BRAND);
  });

  test('picks a swatch and rings the selected one', async () => {
    const onChange = renderField('#AABBCC');
    const ink = await screen.findByRole('button', { name: 'Background: --ink' });
    expect(ink.getAttribute('aria-pressed')).toBe('true');
    expect(ink.className).toContain('ring-2');
    const orange = screen.getByRole('button', { name: 'Background: --brand-orange' });
    expect(orange.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(orange);
    expect(onChange).toHaveBeenCalledWith('#ff6600');
  });

  test('keeps the free hex field beside the palette', async () => {
    renderField('#123456');
    await screen.findByRole('button', { name: 'Background: --ink' });
    const free = screen.getByRole('button', { name: 'Background colour' });
    expect(free.textContent).toContain('#123456');
  });
});
