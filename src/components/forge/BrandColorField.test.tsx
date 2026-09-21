/**
 * BrandColorField against a mocked brand read: palette colour tokens become swatches (typography
 * and unresolvable aliases do not), a click picks the swatch's six-digit hex, the current value
 * wears the ring, and the free hex field stays beside them.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { BrandTypeInputs } from '@continuum/contracts';

const designSystemInputs = (): BrandTypeInputs => ({
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
});

let inputs = designSystemInputs();

const loadMock = mock(async (): Promise<BrandTypeInputs> => inputs);

mock.module('@/lib/brands/brandTypeInputs.client', () => ({
  loadBrandTypeInputs: loadMock,
  brandTypeInputsQueryKey: (brandId?: string) => ['brand-type-inputs', brandId] as const,
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrandColorField } from './BrandColorField';
import { installPickerDomGlobals } from '@/components/automations/workspace/pickers/pickerTestHarness';

// Base UI waits on a MutationObserver as a popup or dialog animates; happy-dom's, lifted per file
// (a global shim in the shared setup drops other files' tests).
installPickerDomGlobals();

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

const openPalette = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Background brand palette' }));
};

beforeEach(() => {
  inputs = designSystemInputs();
});

afterEach(() => {
  cleanup();
  loadMock.mockClear();
});

describe('BrandColorField', () => {
  test('offers each resolvable palette colour once, as six-digit hex', async () => {
    renderField(null);
    // Whether the content element has been REMOVED yet depends on that animation finishing,
    // which happy-dom decides at random. So: either it is gone, or it is still mounted and
    // already marked closed. What must never hold is a palette still standing open.
    const lingering = screen.queryByRole('button', { name: 'Background: --brand-orange' });
    if (lingering) {
      expect(
        lingering.closest('[data-slot="popover-content"]')?.hasAttribute('data-closed'),
      ).toBe(true);
    }
    await openPalette();
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
    await openPalette();
    const ink = await screen.findByRole('button', { name: 'Background: --ink' });
    expect(ink.getAttribute('aria-pressed')).toBe('true');
    expect(ink.className).toContain('ring-2');
    const orange = screen.getByRole('button', { name: 'Background: --brand-orange' });
    expect(orange.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(orange);
    expect(onChange).toHaveBeenCalledWith('#ff6600');
    // Picking closes the palette. Wait on the TRIGGER's `aria-expanded`, not on the swatch
    // disappearing: Base UI keeps the popover content mounted through its exit animation, and
    // a `waitFor` that only ever reads the removed element gets no mutation to re-check
    // against under happy-dom — this used to burn the whole 5s timeout and fail. Once the
    // trigger reports closed, the content is gone and the swatch with it.
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Background brand palette' })
          .getAttribute('aria-expanded'),
      ).toBe('false');
    });
    // Whether the content element has been REMOVED yet depends on that animation finishing,
    // which happy-dom decides at random. So: either it is gone, or it is still mounted and
    // already marked closed. What must never hold is a palette still standing open.
    const lingering = screen.queryByRole('button', { name: 'Background: --brand-orange' });
    if (lingering) {
      expect(
        lingering.closest('[data-slot="popover-content"]')?.hasAttribute('data-closed'),
      ).toBe(true);
    }
  });

  test('keeps the free hex field beside the palette', async () => {
    renderField('#123456');
    await screen.findByRole('button', { name: 'Background brand palette' });
    const free = screen.getByRole('button', { name: 'Background colour' });
    expect(free.textContent).toContain('#123456');
  });

  test('a hash-less imported value still rings its swatch and paints the free field', async () => {
    renderField('FF6600');
    await openPalette();
    const orange = await screen.findByRole('button', { name: 'Background: --brand-orange' });
    expect(orange.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Background colour' }).textContent).toContain(
      '#ff6600',
    );
  });

  test('a value that is not hex rings nothing and reaches the free field as typed', async () => {
    renderField('orange');
    await openPalette();
    await screen.findByRole('button', { name: 'Background: --ink' });
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Background colour' }).textContent).toContain(
      'orange',
    );
  });

  test('uses the first valid palette by authority instead of mixing stale sources', async () => {
    inputs = {
      ...designSystemInputs(),
      brandMd: { colors: [{ value: '#112233', name: 'Brand Book' }], typography: [] },
      brandKit: { colors: ['#445566'] },
    };
    renderField(null);
    await openPalette();

    expect(screen.getByRole('button', { name: 'Background: --brand-orange' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Background: Brand Book' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Background: Brand color 1' })).toBeNull();
  });

  test('falls back from an unusable design system to Brand Book colours', async () => {
    inputs = {
      designSystem: {
        tokens: [token('--not-a-colour', 'var(--missing)')],
      } as unknown as BrandTypeInputs['designSystem'],
      brandMd: {
        colors: [
          { value: '#1234', role: 'primary' },
          { value: '#aabbcc', name: 'Ocean' },
        ],
        typography: [],
      },
      brandKit: { colors: ['#445566'] },
    };
    renderField(null);
    await openPalette();

    expect(screen.getByRole('button', { name: 'Background: primary' }).getAttribute('title')).toBe(
      'primary #112233',
    );
    expect(screen.getByRole('button', { name: 'Background: Ocean' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Background: Brand color 1' })).toBeNull();
  });

  test('falls back to detected profile colours when richer sources have none', async () => {
    inputs = {
      designSystem: { tokens: [] } as unknown as BrandTypeInputs['designSystem'],
      brandMd: { colors: [], typography: [] },
      brandKit: { colors: ['778899', '#778899', 'not-a-colour'] },
    };
    renderField(null);
    await openPalette();

    const stored = screen.getByRole('button', { name: 'Background: Brand color 1' });
    expect(stored.getAttribute('title')).toBe('Brand color 1 #778899');
    expect(screen.getAllByRole('button', { name: /^Background: Brand color/ })).toHaveLength(1);
  });

  test('keeps only the free picker when the brand has no valid colours', async () => {
    inputs = { brandKit: { colors: ['transparent'] } };
    renderField(null);

    await screen.findByRole('button', { name: 'Background colour' });
    expect(screen.queryByRole('button', { name: 'Background brand palette' })).toBeNull();
  });
});
