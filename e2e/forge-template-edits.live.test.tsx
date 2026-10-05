/** Opt-in interaction check against the real local Backend/Forge/Library bench. No mocked fetch.
 * Invoked by forge:template-edits:e2e:bench with a run-owned source and local-only credentials.
 */
import { afterEach, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TemplateLayerEditor } from '@/components/forge/TemplateLayerEditor';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

afterEach(cleanup);
const active = !!process.env.FORGE_EDITS_ASSET_ID;
(active ? test : test.skip)(
  'real editor previews, resets, toggles bold, and saves a separate variant',
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
    await waitFor(() => expect(screen.getByLabelText('Search layers')).toBeTruthy(), {
      timeout: 60_000,
    });
    fireEvent.change(screen.getByLabelText('Search layers'), { target: { value: 'SI' } });
    fireEvent.click(screen.getByRole('button', { name: /^SI Middle Text line/ }));
    const size = screen.getByLabelText('Text size (pt)') as HTMLInputElement;
    expect(size.value).toBe('50');
    fireEvent.change(size, { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview edits' }));
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: 'Preview edits' }).hasAttribute('disabled')).toBe(
          false,
        ),
      { timeout: 60_000 },
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(size.value).toBe('55');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect((screen.getByLabelText('Text size (pt)') as HTMLInputElement).value).toBe('50');
    expect(screen.getByRole('button', { name: 'Save as variant' }).hasAttribute('disabled')).toBe(
      true,
    );
    // This run's source uses held Arial faces on the heading.
    fireEvent.change(screen.getByLabelText('Search layers'), {
      target: { value: 'AMBOS EQUIPOS ANOTAN' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^AMBOS EQUIPOS ANOTAN/ }));
    expect(screen.getByRole('checkbox', { name: 'Bold' }).hasAttribute('data-disabled')).toBe(false);
    fireEvent.click(screen.getByText('Bold', { selector: 'label' }));
    fireEvent.change(screen.getByLabelText('Variant name'), {
      target: { value: 'UI temporary edit variant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }));
    await waitFor(() => expect(saved).not.toBeNull(), { timeout: 90_000 });
    expect(saved).not.toBe(assetId);
    expect(screen.getByText('Saved UI temporary edit variant.')).toBeTruthy();
    await supabase.auth.signOut();
  },
  180_000,
);
