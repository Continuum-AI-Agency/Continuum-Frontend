import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { AgentRequestPayload, OnboardingPreviewEvent } from '@/lib/onboarding/agentClient';

// The dialog's contract: a run that does not finish changes nothing and says so; a run that
// finishes carries the user's own evidence and their discard choice to the Backend.

type RunOptions = {
  payload: AgentRequestPayload;
  onEvent?: (event: OnboardingPreviewEvent) => void;
};

let streamed: OnboardingPreviewEvent[] = [];
const runOnboardingPreview = mock(async (options: RunOptions) => {
  for (const event of streamed) options.onEvent?.(event);
  return { runId: 'run-1' };
});
const approveOnboardingBrandProfile = mock(async () => ({}));
const refresh = mock();
const show = mock();

class PreviewRateLimitedError extends Error {
  retryAfterSeconds = 10;
}

const agentClient = await import('@/lib/onboarding/agentClient');
mock.module('@/lib/onboarding/agentClient', () => ({
  ...agentClient,
  runOnboardingPreview,
  approveOnboardingBrandProfile,
  PreviewRateLimitedError,
}));
mock.module('@/components/onboarding/v2/state/jobRunners', () => ({
  readOnboardingSource: async (_brandId: string, url: string) =>
    url.includes('instagram.com')
      ? { kind: 'instagram', via: 'test', instagram_profile: { username: 'acme.cali' } }
      : { kind: 'web', via: 'test', scrape: { url } },
}));
const navigation = await import('next/navigation');
mock.module('next/navigation', () => ({ ...navigation, useRouter: () => ({ refresh }) }));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ show }) }));
// The rebuilt book: newer than the one on screen, so the dialog stops waiting at once.
const fetchBrandBookClient = mock(async () => ({ refreshed_at: '2026-11-21T10:05:00Z' }));
mock.module('@/lib/brands/useBrandBook.client', () => ({ fetchBrandBookClient }));

const { BrandDnaReanalyze } = await import('./BrandDnaReanalyze');

const PAYLOAD: AgentRequestPayload = {
  brandProfile: { id: 'brand-1', brand_name: 'Acme' },
  runContext: {
    user_id: 'user-1',
    brand_id: 'brand-1',
    brand_name: 'Acme',
    created_at: '2026-11-21T00:00:00.000Z',
    platform_urls: [],
    integrated_platforms: [],
    brand_voice_tags: ['Bold'],
    integration_account_ids: [],
  },
};

function open(isEdited = true, payload: AgentRequestPayload = PAYLOAD) {
  render(
    <BrandDnaReanalyze
      brandId="brand-1"
      payload={payload}
      currentWebsite="https://wrong.example"
      isEdited={isEdited}
      documents={[{ id: '0f1e2d3c-4b5a-4968-8776-655443322110', name: 'Brand guide.pdf' }]}
      refreshedAt="2026-11-21T10:00:00Z"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Re-analyze from website' }));
}

function submit(url = 'right.example') {
  fireEvent.change(screen.getByLabelText('Website'), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
}

describe('BrandDnaReanalyze', () => {
  beforeEach(() => {
    streamed = [];
    for (const fn of [runOnboardingPreview, approveOnboardingBrandProfile, refresh, show]) {
      fn.mockClear();
    }
  });
  afterEach(cleanup);

  it('reports a run that never finished as a failure that changed nothing', async () => {
    streamed = [{ type: 'error', message: 'worker died' }];
    open();
    submit();

    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0]?.[0]).toMatchObject({
      variant: 'error',
      description: expect.stringContaining('nothing changed'),
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Re-analyze' })).toBeTruthy();
  });

  it("sends the user's words, documents, social page, voice and discard choice, then approves", async () => {
    streamed = [{ type: 'complete', status: 'ok' }];
    open();
    fireEvent.click(screen.getByRole('checkbox', { name: /Replace my edits/ }));
    fireEvent.change(screen.getByLabelText('What does your business do? (optional)'), {
      target: { value: 'We rent bikes in Cali.' },
    });
    fireEvent.change(screen.getByLabelText('Instagram or Facebook page (optional)'), {
      target: { value: 'instagram.com/acme.cali' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Playful' }));
    fireEvent.change(screen.getByLabelText('Who are your customers? (optional)'), {
      target: { value: 'Commuters in Cali.' },
    });
    submit();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = runOnboardingPreview.mock.calls[0]?.[0].payload;
    expect(sent?.brandProfile.website_url).toBe('https://right.example/');
    expect(sent?.runContext).toMatchObject({
      brand_voice_tags: ['Bold', 'Playful'],
      discard_brand_md_edit: true,
    });
    expect(sent?.intake).toMatchObject({ description: 'We rent bikes in Cali.' });
    expect(sent?.document_ids).toEqual(['0f1e2d3c-4b5a-4968-8776-655443322110']);
    expect(sent?.instagram_profile).toMatchObject({ username: 'acme.cali' });
    expect(sent?.brandProfile.target_audience).toEqual({ summary: 'Commuters in Cali.' });
    expect(approveOnboardingBrandProfile).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0]).toMatchObject({
      variant: 'success',
      description: expect.stringContaining('now comes from https://right.example/'),
    });
  });

  it('keeps the edits unless asked, and leaves out unticked documents and voice tags', async () => {
    streamed = [{ type: 'complete', status: 'ok' }];
    open();
    expect(
      screen.getByRole('checkbox', { name: /Replace my edits/ }).getAttribute('aria-checked'),
    ).toBe('false');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Brand guide.pdf' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bold' }));
    submit();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = runOnboardingPreview.mock.calls[0]?.[0].payload;
    expect(sent?.runContext.discard_brand_md_edit).toBeUndefined();
    expect(sent?.intake).toBeUndefined();
    expect(sent?.instagram_profile).toBeUndefined();
    expect(sent?.runContext.brand_voice_tags).toEqual([]);
    expect(approveOnboardingBrandProfile).not.toHaveBeenCalled();
    // The kept edits still override the new analysis, and the message says so.
    expect(show.mock.calls[0]?.[0]).toMatchObject({
      variant: 'success',
      description: expect.stringContaining('Your edits still take priority'),
    });
  });

  it('starts from what the user wrote about the business at onboarding', () => {
    open(false, {
      ...PAYLOAD,
      intake: {
        kind: 'description',
        brand_name: 'Acme',
        url: null,
        description: 'Bike rentals for commuters in Cali.',
      },
    });

    expect(
      (screen.getByLabelText('What does your business do? (optional)') as HTMLTextAreaElement)
        .value,
    ).toBe('Bike rentals for commuters in Cali.');
  });

  it('refuses a website in the social page field and runs nothing', async () => {
    open(false);
    fireEvent.change(screen.getByLabelText('Instagram or Facebook page (optional)'), {
      target: { value: 'right.example' },
    });
    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(
      screen.getByLabelText('Instagram or Facebook page (optional)').getAttribute('aria-invalid'),
    ).toBe('true');
    expect(runOnboardingPreview).not.toHaveBeenCalled();
  });

  it('refuses an address that is not a website and ties the error to the field', () => {
    open(false);
    submit('not a website');

    const field = screen.getByLabelText('Website');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByRole('alert');
    expect(field.getAttribute('aria-describedby')).toBe(error.id);
    expect(runOnboardingPreview).not.toHaveBeenCalled();
  });
});
