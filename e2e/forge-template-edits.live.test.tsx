/** Opt-in interaction check against the real local Backend/Forge/Library bench. No mocked fetch.
 * Invoked by forge:template-edits:e2e:bench with a run-owned source and local-only credentials.
 */
import { afterEach, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TemplateLayerEditor } from '@/components/forge/TemplateLayerEditor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

afterEach(cleanup);
const active = !!process.env.FORGE_EDITS_ASSET_ID;
(active ? test : test.skip)(
  'real editor previews, resets, re-stacks, moves, toggles bold, and forks a separate variant',
  async () => {
    const assetId = process.env.FORGE_EDITS_ASSET_ID!;
    const brandId = process.env.FORGE_EDITS_BRAND_ID!;
    const versionId = process.env.FORGE_EDITS_VERSION_ID!;
    expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toBe('127.0.0.1');
    const supabase = createSupabaseBrowserClient();
    const login = await supabase.auth.signInWithPassword({
      email: 'local@continuum.test',
      password: 'localdev123',
    });
    expect(login.error).toBeNull();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let saved: string | null = null;
    render(
      <QueryClientProvider client={queryClient}>
        <TemplateLayerEditor
          brandId={brandId}
          assetId={assetId}
          versionId={versionId}
          name="Editor bench"
          active
          onSaved={async () => undefined}
          onOpenVariant={(id) => {
            saved = id;
          }}
        />
      </QueryClientProvider>,
    );
    // The shell paints at once; editing starts when the layer list has landed.
    await screen.findByRole('list', { name: 'Layers' }, { timeout: 60_000 });
    fireEvent.change(screen.getByLabelText('Search layers'), { target: { value: 'SI' } });
    fireEvent.click(screen.getByRole('button', { name: /^SI\s*Middle Text line/ }));
    const size = screen.getByLabelText('Text size (pt)') as HTMLInputElement;
    expect(size.value).toBe('50');
    fireEvent.change(size, { target: { value: '55' } });
    fireEvent.blur(size);
    // Previews run on their own after a pause; no button to press.
    await waitFor(() => expect(screen.getByText('Preview up to date')).toBeTruthy(), {
      timeout: 60_000,
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByLabelText('Text size (pt)') as HTMLInputElement).value).toBe('55');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((screen.getByLabelText('Text size (pt)') as HTMLInputElement).value).toBe('50');
    // The bench hands over a variant (Arial applied), so Save writes it and a fork is the option.
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Save as new variant' }).hasAttribute('disabled'),
    ).toBe(true);
    // Re-stack the default comp and move its top layer: the bench reads both back natively.
    fireEvent.change(screen.getByLabelText('Search layers'), { target: { value: '' } });
    const list = screen.getByRole('list', { name: 'Layers' });
    fireEvent.click(within(list).getByRole('button', { name: 'Send 250 backward' }));
    fireEvent.click(within(list).getByRole('button', { name: /^250/ }));
    for (const [label, value] of [
      ['Position X', '300'],
      ['Rotation', '5'],
    ] as const) {
      const field = screen.getByLabelText(label) as HTMLInputElement;
      fireEvent.change(field, { target: { value } });
      fireEvent.blur(field);
    }
    await waitFor(() => expect(screen.getByText('Preview up to date')).toBeTruthy(), {
      timeout: 60_000,
    });
    expect(screen.queryByRole('alert')).toBeNull();
    // This run's source uses held Arial faces on the heading.
    fireEvent.change(screen.getByLabelText('Search layers'), {
      target: { value: 'AMBOS EQUIPOS ANOTAN' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^AMBOS EQUIPOS ANOTAN/ }));
    expect(screen.getByRole('checkbox', { name: 'Bold' }).hasAttribute('data-disabled')).toBe(
      false,
    );
    fireEvent.click(screen.getByText('Bold', { selector: 'label' }));
    fireEvent.change(screen.getByLabelText('Variant name'), {
      target: { value: 'UI temporary edit variant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as new variant' }));
    await waitFor(() => expect(saved).not.toBeNull(), { timeout: 90_000 });
    expect(saved).not.toBe(assetId);
    expect(screen.getByText('Saved UI temporary edit variant.')).toBeTruthy();
    await supabase.auth.signOut();
  },
  180_000,
);
