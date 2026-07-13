import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { useDraftGeneration } from './useDraftGeneration';

// Deliberately no mock.module: it is process-wide in bun, so mocking the store or the
// ladder client here would clobber sibling specs (and be clobbered by them, depending on
// load order). Stubbing fetch is per-file and exercises the real ladder client end to end.
//
// Consequently these tests assert the OBSERVABLE contract — which request goes out, and
// when none does — rather than the store writes, which the store's own spec covers.
const originalFetch = globalThis.fetch;

type FetchCall = { url: string; body: Record<string, unknown> };
let calls: FetchCall[] = [];
let respond: () => Response;

const okResponse = () =>
  new Response(
    JSON.stringify({
      status: 'queued',
      stage: 'generate_copy',
      draftId: '11111111-1111-4111-8111-111111111111',
      jobId: 'job-1',
      mediaStage: 'text_only',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const BRAND_ID = 'brand-1';

const draft = (over: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft =>
  ({
    id: 'fe-1',
    backendDraftId: 'be-1',
    status: 'draft',
    mediaCount: 0,
    platforms: ['instagram'],
    ...over,
  }) as unknown as OrganicCalendarDraft;

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ToastProvider, null, children);

// Takes the full props object: a `= BRAND_ID` default would still apply when a test
// passes `undefined` explicitly, quietly defeating the no-brand case.
const hookFor = (
  drafts: OrganicCalendarDraft[],
  props: { brandProfileId?: string } = { brandProfileId: BRAND_ID },
) =>
  renderHook(() => useDraftGeneration({ brandProfileId: props.brandProfileId, drafts }), {
    wrapper,
  }).result.current;

beforeEach(() => {
  calls = [];
  respond = () => okResponse();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
    return respond();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('handleRegenerate', () => {
  it('rewrites copy through the ladder with the destructive regenerate flag', async () => {
    const hook = hookFor([draft()]);

    await act(async () => hook.handleRegenerate('fe-1'));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/api/organic/agent/drafts/be-1/generate-copy');
    expect(calls[0].body).toEqual({ brandId: BRAND_ID, regenerate: true });
  });

  // The old batch path early-returned unless the draft carried a seedTrendId, so a
  // manual draft could never be regenerated. It can now.
  it('regenerates a manual draft that has no seed trend', async () => {
    const hook = hookFor([draft({ seedTrendId: undefined, origin: 'manual' })]);

    await act(async () => hook.handleRegenerate('fe-1'));

    expect(calls).toHaveLength(1);
  });

  it('refuses to regenerate a draft that has not been persisted yet', async () => {
    const hook = hookFor([draft({ backendDraftId: undefined })]);

    await act(async () => hook.handleRegenerate('fe-1'));

    expect(calls).toHaveLength(0);
  });

  it('refuses to regenerate without a brand', async () => {
    const hook = hookFor([draft()], {});

    await act(async () => hook.handleRegenerate('fe-1'));

    expect(calls).toHaveLength(0);
  });

  it('ignores an unknown draft id', async () => {
    const hook = hookFor([draft()]);

    await act(async () => hook.handleRegenerate('missing'));

    expect(calls).toHaveLength(0);
  });

  it('swallows a Backend rejection instead of throwing at the call site', async () => {
    respond = () =>
      new Response(JSON.stringify({ code: 'already_realized', message: 'media is realized' }), {
        status: 409,
      });
    const hook = hookFor([draft()]);

    await act(async () => hook.handleRegenerate('fe-1'));

    expect(calls).toHaveLength(1);
  });
});
