import { describe, expect, it, mock } from 'bun:test';

import type { AgentRequestPayload, OnboardingPreviewEvent } from '@/lib/onboarding/agentClient';
import {
  BrandBookRunIncompleteError,
  brandBookGenerationStatus,
  brandBookReanalysisPayload,
  brandBookSectionLabel,
  canGenerateBrandBook,
  runBrandBookGeneration,
  reanalysisOutcome,
  waitForBrandBookRefresh,
} from './brandBookGeneration';

function payload(overrides?: {
  brandId?: string;
  brandName?: string;
  userId?: string;
}): AgentRequestPayload {
  return {
    brandProfile: {
      id: overrides?.brandId ?? 'brand-1',
      brand_name: overrides?.brandName ?? 'Pizza Test',
    },
    runContext: {
      user_id: overrides?.userId ?? 'user-1',
      brand_id: overrides?.brandId ?? 'brand-1',
      brand_name: overrides?.brandName ?? 'Pizza Test',
      created_at: '2026-06-24T00:00:00.000Z',
      platform_urls: [],
      integrated_platforms: [],
      brand_voice_tags: [],
      integration_account_ids: [],
    },
  };
}

describe('brandBookGenerationStatus', () => {
  it('announces the run starting', () => {
    expect(brandBookGenerationStatus({ type: 'run', runId: 'r1', reused: false })).toBe(
      'Starting analysis…',
    );
  });

  it('names the section being analyzed while it is running', () => {
    const event: OnboardingPreviewEvent = {
      type: 'status',
      section: 'website',
      status: 'running',
    };
    expect(brandBookGenerationStatus(event)).toBe('Analyzing website…');
  });

  it('ignores non-running section statuses (done/skipped/error)', () => {
    for (const status of ['done', 'skipped', 'error'] as const) {
      expect(brandBookGenerationStatus({ type: 'status', section: 'voice', status })).toBeNull();
    }
  });

  it('shows a finalizing line on a successful complete', () => {
    expect(brandBookGenerationStatus({ type: 'complete', status: 'ok' })).toBe(
      'Finalizing your Brand Book…',
    );
    expect(brandBookGenerationStatus({ type: 'complete', status: 'partial' })).toBe(
      'Finalizing your Brand Book…',
    );
  });

  it('returns null for a failed complete (handled via toast, not the status line)', () => {
    expect(brandBookGenerationStatus({ type: 'complete', status: 'error' })).toBeNull();
  });

  it('returns null for noisy events (stream deltas, pings, errors)', () => {
    expect(brandBookGenerationStatus({ type: 'stream', section: 'voice', delta: 'x' })).toBeNull();
    expect(brandBookGenerationStatus({ type: 'ping' })).toBeNull();
    expect(brandBookGenerationStatus({ type: 'error', message: 'boom' })).toBeNull();
  });
});

describe('brandBookSectionLabel', () => {
  it('maps known sections to friendly labels', () => {
    expect(brandBookSectionLabel('first_impression')).toBe('first impression');
    expect(brandBookSectionLabel('business')).toBe('business model');
  });
});

describe('canGenerateBrandBook', () => {
  it('accepts a payload with a brand id, brand name and user', () => {
    expect(canGenerateBrandBook(payload())).toBe(true);
  });

  it('rejects null/undefined', () => {
    expect(canGenerateBrandBook(null)).toBe(false);
    expect(canGenerateBrandBook(undefined)).toBe(false);
  });

  it('rejects a missing brand id', () => {
    expect(canGenerateBrandBook(payload({ brandId: '' }))).toBe(false);
  });

  it('rejects a missing user id', () => {
    expect(canGenerateBrandBook(payload({ userId: '' }))).toBe(false);
  });

  it('rejects a blank brand name', () => {
    expect(canGenerateBrandBook(payload({ brandName: '' }))).toBe(false);
  });
});

describe('brandBookReanalysisPayload', () => {
  const base: AgentRequestPayload = {
    ...payload(),
    brandProfile: {
      ...payload().brandProfile,
      website_url: 'https://wrong.example',
      description: 'A business that is not this one',
      brand_voice: { tone: 'wrong' },
      target_audience: { summary: 'wrong' },
    },
    runContext: {
      ...payload().runContext,
      platform_urls: ['https://wrong.example'],
      brand_voice_tags: ['clinical'],
      integration_account_ids: ['5f0c5a6e-8d8b-4c38-9a62-2d8f2d1c0b11'],
    },
    intake: { kind: 'website', url: 'https://wrong.example' } as AgentRequestPayload['intake'],
    preview_run_id: 'run-old',
  };
  const scrape = { url: 'https://right.example' } as Parameters<
    typeof brandBookReanalysisPayload
  >[1]['scrape'];

  it('runs from the new website alone, dropping what the earlier run inferred', () => {
    expect(
      brandBookReanalysisPayload(base, {
        websiteUrl: 'https://right.example',
        scrape,
      }),
    ).toEqual({
      brandProfile: {
        id: 'brand-1',
        brand_name: 'Pizza Test',
        website_url: 'https://right.example',
      },
      runContext: {
        ...base.runContext,
        platform_urls: ['https://right.example'],
        brand_voice_tags: [],
        integration_account_ids: [],
      },
      scrape,
    });
  });

  it('asks the Backend to replace the edit only when the user chose to', () => {
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      discardEditSha256: 'a'.repeat(64),
    });
    // Named by its hash, so the Backend replaces only the edit the user saw.
    expect(out.runContext.discard_brand_md_edit).toBe('a'.repeat(64));
  });

  it("grounds the run on the user's own description and documents", () => {
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      description: '  We rent bikes in Cali.  ',
      documentIds: ['doc-1'],
    });
    expect(out.intake).toEqual({
      kind: 'website',
      brand_name: 'Pizza Test',
      url: 'https://right.example',
      description: 'We rent bikes in Cali.',
    });
    expect(out.document_ids).toEqual(['doc-1']);
  });

  it("puts the user's own account of their customers on the profile the run reads", () => {
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      audience: '  Commuters and tourists in Cali.  ',
    });
    expect(out.brandProfile.target_audience).toEqual({ summary: 'Commuters and tourists in Cali.' });
    expect(out.runContext.integration_account_ids).toEqual([]);
  });

  it('sends the voice tags the user picked', () => {
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      voiceTags: ['Playful', 'Bold'],
    });
    expect(out.runContext.brand_voice_tags).toEqual(['Playful', 'Bold']);
  });

  it('grounds the run on an Instagram profile without making it a draft', () => {
    const instagram = { username: 'acme.cali', biography: 'Bike rentals in Cali' };
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      social: { instagram_profile: instagram as never },
    });
    expect(out.instagram_profile).toEqual(instagram as never);
    expect(out.intake).toBeUndefined();
  });

  it('carries a Facebook Page as intake evidence, the only way the run reads one', () => {
    const facebook = { name: 'Acme Cali', about: 'Bike rentals' };
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      social: { facebook_profile: facebook as never },
    });
    expect(out.facebook_profile).toEqual(facebook as never);
    expect(out.intake).toMatchObject({ kind: 'website', url: 'https://right.example' });
  });

  it('sends documents without a description', () => {
    const out = brandBookReanalysisPayload(base, {
      websiteUrl: 'https://right.example',
      scrape,
      description: '   ',
      documentIds: ['doc-1'],
    });
    expect(out.intake?.description).toBeNull();
    expect(out.document_ids).toEqual(['doc-1']);
  });
});

describe('runBrandBookGeneration', () => {
  const events = (...list: OnboardingPreviewEvent[]) =>
    mock(async (options: { onEvent?: (event: OnboardingPreviewEvent) => void }) => {
      for (const event of list) options.onEvent?.(event);
      return { runId: 'run-1' };
    });
  const complete = (status: 'ok' | 'partial' | 'error'): OnboardingPreviewEvent => ({
    type: 'complete',
    status,
  });

  it('resolves when a website-only run completes; the Backend commits it', async () => {
    const approve = mock(async () => ({}));
    const seen: string[] = [];
    const run = await runBrandBookGeneration({
      payload: payload(),
      runPreview: events({ type: 'run', runId: 'run-1', reused: false }, complete('ok')),
      approve,
      onEvent: (event) => seen.push(event.type),
    });
    expect(approve).not.toHaveBeenCalled();
    expect(seen).toEqual(['run', 'complete']);
    expect(run.runId).toBe('run-1');
  });

  it('throws when the stream reports an error, even though the stream itself ended normally', async () => {
    await expect(
      runBrandBookGeneration({
        payload: payload(),
        runPreview: events({ type: 'error', message: 'worker died' }, complete('error')),
        approve: mock(async () => ({})),
      }),
    ).rejects.toMatchObject({ name: 'Error', reason: 'worker died' });
  });

  it('throws when a website-only run is only partial, because the Backend does not commit it', async () => {
    await expect(
      runBrandBookGeneration({
        payload: payload(),
        runPreview: events(complete('partial')),
        approve: mock(async () => ({})),
      }),
    ).rejects.toBeInstanceOf(BrandBookRunIncompleteError);
  });

  it('throws when the stream ends without a completion', async () => {
    await expect(
      runBrandBookGeneration({
        payload: payload(),
        runPreview: events({ type: 'run', runId: 'run-1', reused: false }),
        approve: mock(async () => ({})),
      }),
    ).rejects.toBeInstanceOf(BrandBookRunIncompleteError);
  });

  it("approves a run grounded on the user's own evidence, naming that run", async () => {
    const draft = { ...payload(), intake: { kind: 'website' } as AgentRequestPayload['intake'] };
    const approve = mock(async () => ({}));
    await runBrandBookGeneration({
      payload: draft,
      runPreview: events(complete('partial')),
      approve,
    });
    expect(approve).toHaveBeenCalledWith({
      payload: { ...draft, preview_run_id: 'run-1' },
      signal: undefined,
    });
  });

  it('never approves a draft whose run failed', async () => {
    const approve = mock(async () => ({}));
    await expect(
      runBrandBookGeneration({
        payload: { ...payload(), intake: { kind: 'website' } as AgentRequestPayload['intake'] },
        runPreview: events(complete('error')),
        approve,
      }),
    ).rejects.toBeInstanceOf(BrandBookRunIncompleteError);
    expect(approve).not.toHaveBeenCalled();
  });
});

describe('waitForBrandBookRefresh', () => {
  const sleep = mock(async () => {});
  const books = (...refreshed: (string | null)[]) => {
    const queue = [...refreshed];
    return mock(async () => ({ refreshed_at: queue.shift() ?? null }));
  };

  it('resolves once the book has been rebuilt since the run started', async () => {
    const fetchBook = books('2026-11-21T10:00:00Z', '2026-11-21T10:00:00Z', '2026-11-21T10:01:00Z');
    const fresh = await waitForBrandBookRefresh({
      brandId: 'brand-1',
      refreshedBefore: '2026-11-21T10:00:00Z',
      fetchBook,
      sleep,
    });
    expect(fresh).toEqual({ refreshed_at: '2026-11-21T10:01:00Z' });
    expect(fetchBook).toHaveBeenCalledTimes(3);
  });

  it('gives up after the timeout and says so', async () => {
    const fetchBook = mock(async () => ({ refreshed_at: '2026-11-21T10:00:00Z' }));
    const fresh = await waitForBrandBookRefresh({
      brandId: 'brand-1',
      refreshedBefore: '2026-11-21T10:00:00Z',
      fetchBook,
      timeoutMs: 6_000,
      intervalMs: 2_000,
      sleep,
    });
    expect(fresh).toBeNull();
    expect(fetchBook).toHaveBeenCalledTimes(3);
  });
});

describe('reanalysisOutcome', () => {
  const book = (edited: boolean) => ({ refreshed_at: '2026-11-21T10:01:00Z', brand_md_is_edited: edited });

  it('does not claim the analysis was saved while the page has not updated', () => {
    expect(reanalysisOutcome({ fresh: null, commitError: null, keptEdits: false, discardRequested: true })).toEqual({
      title: 'brandDnaReanalyzeFinished',
      description: 'brandDnaReanalyzeDoneLater',
      variant: 'info',
    });
  });

  it('says the analysis was not saved when the Backend recorded a failed commit', () => {
    expect(
      reanalysisOutcome({ fresh: null, commitError: 'write failed', keptEdits: false, discardRequested: false }),
    ).toEqual({
      title: 'brandDnaReanalyzeFailed',
      description: 'brandDnaReanalyzeNotSaved',
      variant: 'error',
    });
  });

  it('says so when the edit it was told to replace is still there', () => {
    expect(
      reanalysisOutcome({ fresh: book(true), commitError: null, keptEdits: false, discardRequested: true }),
    ).toMatchObject({ description: 'brandDnaReanalyzeDoneEditKept', variant: 'success' });
  });

  it('reports kept edits and a clean swap as they are', () => {
    expect(
      reanalysisOutcome({ fresh: book(true), commitError: null, keptEdits: true, discardRequested: false }).description,
    ).toBe('brandDnaReanalyzeDoneKeptEdits');
    expect(
      reanalysisOutcome({ fresh: book(false), commitError: null, keptEdits: false, discardRequested: true }).description,
    ).toBe('brandDnaReanalyzeDoneDescription');
  });
});
