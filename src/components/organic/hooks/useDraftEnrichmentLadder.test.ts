import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, cleanup, fireEvent, renderHook, screen } from '@testing-library/react';
import * as React from 'react';
import { DestructiveConfirmationProvider } from '@/components/organic/primitives/DestructiveConfirmation';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useDraftEnrichmentLadder } from './useDraftEnrichmentLadder';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;
Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
});

// No mock.module here: it is process-wide in bun, so two spec files mocking the same
// module clobber each other in a batch run. Stubbing fetch keeps this file isolated AND
// exercises the real draftEnrichment client (URL, method, body).
const originalFetch = globalThis.fetch;

type FetchCall = { url: string; body: Record<string, unknown> };
let calls: FetchCall[] = [];
let respond: () => Response;

const okResponse = (stage: 'generate_copy' | 'build_blueprint' = 'generate_copy') =>
  new Response(
    JSON.stringify({
      status: 'queued',
      stage,
      draftId: '11111111-1111-4111-8111-111111111111',
      jobId: 'job-1',
      mediaStage: 'text_only',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const BRAND_ID = 'brand-1';
const onMediaStepMock = vi.fn();

const makeDraft = (over: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft =>
  ({
    id: 'fe-1',
    backendDraftId: 'be-1',
    status: 'draft',
    mediaCount: 0,
    hasCopy: false,
    ...over,
  }) as unknown as OrganicCalendarDraft;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ToastProvider, null, children);

// The rewrite confirmation is answered through the REAL provider, not a module mock:
// mock.module is process-wide in bun and would leak into every sibling spec.
const confirmingWrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    ToastProvider,
    null,
    React.createElement(DestructiveConfirmationProvider, null, children),
  );

// Takes the full props object: a `= BRAND_ID` default would still apply when a test
// passes `undefined` explicitly, quietly defeating the no-brand case.
const ladderFor = (
  draft: OrganicCalendarDraft,
  props: { brandProfileId?: string } = { brandProfileId: BRAND_ID },
) =>
  renderHook(
    () =>
      useDraftEnrichmentLadder(draft, {
        brandProfileId: props.brandProfileId,
        onMediaStep: onMediaStepMock,
      }),
    { wrapper },
  ).result.current;

// `run()` is fire-and-forget, and the request it starts first resolves a token.
// getBrowserAccessToken finds no Supabase session here, and it retries once after a 300ms
// delay before giving up — so a single macrotask yield returns before the fetch is even
// attempted, and every assertion on `calls` saw an empty array.
const TOKEN_RETRY_GRACE_MS = 400;

const settle = async (dispatch: () => void) => {
  await act(async () => {
    dispatch();
    await new Promise((resolve) => setTimeout(resolve, TOKEN_RETRY_GRACE_MS));
  });
};

const stateOf = (draft: OrganicCalendarDraft, step: 'copy' | 'blueprint' | 'media') =>
  ladderFor(draft).steps.find((entry) => entry.id === step)?.state;

beforeEach(() => {
  calls = [];
  respond = () => okResponse();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
    return respond();
  }) as typeof fetch;
  onMediaStepMock.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe('useDraftEnrichmentLadder stage derivation', () => {
  it('an empty draft starts on Copy, with the later rungs locked', () => {
    const draft = makeDraft({ hasCopy: false });

    expect(stateOf(draft, 'copy')).toBe('current');
    expect(stateOf(draft, 'blueprint')).toBe('locked');
    expect(stateOf(draft, 'media')).toBe('locked');
    expect(ladderFor(draft).activeStep).toBe('copy');
    expect(ladderFor(draft).actionLabel).toBe('Generate copy');
  });

  it('copy present but stranded at text_only offers the Blueprint recovery action', () => {
    const draft = makeDraft({ hasCopy: true, mediaStage: 'text_only' });

    expect(stateOf(draft, 'copy')).toBe('done');
    expect(stateOf(draft, 'blueprint')).toBe('current');
    expect(stateOf(draft, 'media')).toBe('locked');
    expect(ladderFor(draft).actionLabel).toBe('Build blueprint');
  });

  it('a blueprinted draft unlocks Media', () => {
    const draft = makeDraft({ hasCopy: true, mediaStage: 'storyboard_ready' });

    expect(stateOf(draft, 'blueprint')).toBe('done');
    expect(stateOf(draft, 'media')).toBe('current');
    expect(ladderFor(draft).actionLabel).toBe('Realize media');
  });

  it('shows Media running while realizing', () => {
    const draft = makeDraft({ hasCopy: true, mediaStage: 'realizing' });

    expect(stateOf(draft, 'media')).toBe('running');
    expect(ladderFor(draft).activeStep).toBeNull();
    expect(ladderFor(draft).isComplete).toBe(false);
  });

  it('a realized draft is complete with no action left', () => {
    const draft = makeDraft({ hasCopy: true, mediaStage: 'realized' });

    expect(ladderFor(draft).steps.map((step) => step.state)).toEqual(['done', 'done', 'done']);
    expect(ladderFor(draft).activeStep).toBeNull();
    expect(ladderFor(draft).actionLabel).toBeNull();
    expect(ladderFor(draft).isComplete).toBe(true);
  });

  it('shows Copy running while the draft streams', () => {
    const draft = makeDraft({ hasCopy: false, status: 'streaming' });

    expect(stateOf(draft, 'copy')).toBe('running');
    expect(ladderFor(draft).activeStep).toBeNull();
  });
});

describe('useDraftEnrichmentLadder backendDraftId race', () => {
  it('disables Copy with "Saving…" until the autosave assigns a backendDraftId', async () => {
    const ladder = ladderFor(makeDraft({ backendDraftId: undefined }));

    expect(ladder.activeStep).toBe('copy');
    expect(ladder.disabledReason).toBe('Saving…');

    await settle(() => ladder.run());
    expect(calls).toHaveLength(0);
  });

  it('posts to the generate-copy route once a backendDraftId exists', async () => {
    const ladder = ladderFor(makeDraft({ backendDraftId: 'be-1' }));

    expect(ladder.disabledReason).toBeNull();
    await settle(() => ladder.run());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/organic/agent/drafts/be-1/generate-copy');
    expect(calls[0].body).toEqual({ brandId: BRAND_ID });
  });

  it('posts to the build-blueprint route for a stranded draft', async () => {
    respond = () => okResponse('build_blueprint');
    const ladder = ladderFor(makeDraft({ hasCopy: true, mediaStage: 'text_only' }));

    await settle(() => ladder.run());

    expect(calls[0].url).toContain('/api/organic/agent/drafts/be-1/build-blueprint');
  });

  // The Media rung goes through useGenerateDraftMedia, which owns its own id guard.
  it('does not call the ladder routes for the Media rung', async () => {
    const ladder = ladderFor(makeDraft({ hasCopy: true, mediaStage: 'storyboard_ready' }));

    await settle(() => ladder.run());

    expect(onMediaStepMock).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('blocks every rung when no brand is selected', () => {
    expect(ladderFor(makeDraft(), {}).disabledReason).toBe('No brand selected');
  });
});

describe('useDraftEnrichmentLadder rewrite', () => {
  it('offers Rewrite once copy exists and media is not yet realized', () => {
    expect(ladderFor(makeDraft({ hasCopy: true, mediaStage: 'text_only' })).canRewriteCopy).toBe(
      true,
    );
    expect(
      ladderFor(makeDraft({ hasCopy: true, mediaStage: 'storyboard_ready' })).canRewriteCopy,
    ).toBe(true);
  });

  it('withholds Rewrite before copy exists', () => {
    expect(ladderFor(makeDraft({ hasCopy: false })).canRewriteCopy).toBe(false);
  });

  // Rewriting under rendered pixels would strand them against a new concept — the
  // Backend 409s (already_realized), so the affordance must not be offered.
  it('withholds Rewrite once media is realizing or realized', () => {
    expect(ladderFor(makeDraft({ hasCopy: true, mediaStage: 'realizing' })).canRewriteCopy).toBe(
      false,
    );
    expect(ladderFor(makeDraft({ hasCopy: true, mediaStage: 'realized' })).canRewriteCopy).toBe(
      false,
    );
  });

  it('sends the destructive regenerate flag', async () => {
    const ladder = ladderFor(makeDraft({ hasCopy: true, mediaStage: 'text_only' }));

    await settle(() => ladder.rewriteCopy());

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/generate-copy');
    expect(calls[0].body).toEqual({ brandId: BRAND_ID, regenerate: true });
  });

  // A rewrite discards the caption and hashtags that are already there. It used to fire on
  // a single click with nothing asked.
  describe('confirmation', () => {
    const renderWithConfirmation = () => {
      const draft = makeDraft({ hasCopy: true, mediaStage: 'text_only' });
      return renderHook(
        () =>
          useDraftEnrichmentLadder(draft, {
            brandProfileId: BRAND_ID,
            onMediaStep: onMediaStepMock,
          }),
        { wrapper: confirmingWrapper },
      );
    };

    it('asks before rewriting, and does not enqueue until answered', async () => {
      const { result } = renderWithConfirmation();

      await settle(() => result.current.rewriteCopy());

      expect(calls).toHaveLength(0);
      expect(screen.getByText('Rewrite the copy?')).toBeTruthy();
    });

    it('no-ops when the confirmation is declined', async () => {
      const { result } = renderWithConfirmation();
      await settle(() => result.current.rewriteCopy());

      await settle(() => fireEvent.click(screen.getByText('Cancel')));

      expect(calls).toHaveLength(0);
    });

    it('enqueues the destructive rewrite once confirmed', async () => {
      const { result } = renderWithConfirmation();
      await settle(() => result.current.rewriteCopy());

      await settle(() => fireEvent.click(screen.getByText('Rewrite copy')));

      expect(calls).toHaveLength(1);
      expect(calls[0].body).toEqual({ brandId: BRAND_ID, regenerate: true });
    });
  });

  it('does not throw when the Backend rejects the enqueue', async () => {
    respond = () =>
      new Response(JSON.stringify({ code: 'already_has_copy', message: 'nope' }), { status: 409 });
    const ladder = ladderFor(makeDraft({ hasCopy: false }));

    await settle(() => ladder.run());

    expect(calls).toHaveLength(1);
  });
});
