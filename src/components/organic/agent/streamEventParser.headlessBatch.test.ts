import { describe, expect, it } from 'bun:test';
import type { HeadlessBatchQuote, HeadlessBatchStatus } from '@continuum/contracts';
import type { OrganicSessionMessage } from '@/lib/organic/agent-sessions';
import { restoreSessionFromMessages } from './restoreSession';
import { parseOrganicStreamEvent } from './streamEventParser';
import type { UiCard } from './types';
import { upsertUiCard } from './useOrganicAgentReducer';

const BRAND = '11111111-1111-4111-8111-111111111111';
const BATCH = '22222222-2222-4222-8222-222222222222';
const OTHER_BATCH = '66666666-6666-4666-8666-666666666666';
const DRAFT = '33333333-3333-4333-8333-333333333333';

function status(batchId: string, state: 'queued' | 'ready'): HeadlessBatchStatus {
  return {
    batchId,
    brandId: BRAND,
    createdAt: '2026-10-18T10:00:00.000Z',
    capUsd: 9,
    expectedUsd: 3.5,
    maxUsd: 15,
    holdUsd: 9,
    items: [
      {
        index: 0,
        format: 'reel',
        draftId: DRAFT,
        jobId: null,
        state,
        reason: null,
        holdUsd: 9,
        redirected: false,
        cover: null,
        outputCount: 1,
      },
    ],
    counts: {
      queued: state === 'queued' ? 1 : 0,
      running: 0,
      needs_cast_approval: 0,
      ready: state === 'ready' ? 1 : 0,
      failed: 0,
    },
    cast: { needed: false, drafts: [], approved: true },
    done: state === 'ready',
  };
}

const quote: HeadlessBatchQuote = {
  items: 2,
  reels: 1,
  stillSets: 1,
  capUsd: 14,
  copyUsd: 0.1,
  castPackUsd: 16,
  boundUsd: 30.1,
  expectedUsd: 4.52,
  maxUsd: 40,
  windowRemainingUsd: 150,
  castApprovalNeeded: true,
  refusal: null,
};

describe('ui.headless_batch', () => {
  it('parses into a headless_batch card', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.headless_batch',
      data: status(BATCH, 'queued'),
    });
    expect(parsed).toEqual({
      kind: 'uiCard',
      card: { type: 'headless_batch', data: status(BATCH, 'queued') },
    });
  });

  it('drops a payload that is not a batch status', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'ui.headless_batch',
      data: { batchId: 'not-a-uuid' },
    });
    expect(parsed.kind).toBe('invalid');
  });

  it('carries the quote on a headlessBatchCreate approval', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'tool.approval_required',
      data: {
        approvalId: 'a1',
        toolCallId: 'c1',
        toolName: 'headlessBatchCreate',
        input: { items: [] },
        batchPreview: quote,
      },
    });
    expect(parsed.kind).toBe('toolApproval');
    if (parsed.kind === 'toolApproval') expect(parsed.approval.batchPreview).toEqual(quote);
  });

  it('keeps the quote when the Backend adds a field to it', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'tool.approval_required',
      data: {
        approvalId: 'a1',
        toolCallId: 'c1',
        toolName: 'headlessBatchCreate',
        input: { items: [] },
        batchPreview: { ...quote, castDrafts: [] },
      },
    });
    expect(parsed.kind === 'toolApproval' && parsed.approval.batchPreview).toEqual(quote);
  });

  it('a plain approval carries no quote', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'tool.approval_required',
      data: { approvalId: 'a1', toolCallId: 'c1', toolName: 'publishDraft', input: {} },
    });
    expect(parsed.kind === 'toolApproval' && 'batchPreview' in parsed.approval).toBe(false);
  });
});

describe('upsertUiCard for headless batches', () => {
  it('replaces the card of the same batch in place, latest wins, and keeps the rest', () => {
    const strip: UiCard = {
      type: 'media_strip',
      data: { toolCallId: 'c1', toolName: 'listDrafts', items: [], total: 0 },
    };
    const first: UiCard = { type: 'headless_batch', data: status(BATCH, 'queued') };
    const other: UiCard = { type: 'headless_batch', data: status(OTHER_BATCH, 'queued') };
    const latest: UiCard = { type: 'headless_batch', data: status(BATCH, 'ready') };

    const cards = upsertUiCard(upsertUiCard(upsertUiCard([strip], first), other), latest);
    expect(cards).toEqual([strip, latest, other]);
  });
});

describe('restoreSessionFromMessages', () => {
  it('restores a persisted ui.headless_batch frame as its latest status', () => {
    const { messages } = restoreSessionFromMessages([
      {
        id: 'a1',
        sessionId: 's1',
        role: 'assistant',
        content: 'Started the batch.',
        createdAt: '',
        uiCardFrames: [
          { type: 'ui.headless_batch', data: status(BATCH, 'queued') },
          { type: 'ui.headless_batch', data: status(BATCH, 'ready') },
        ],
      },
    ]);
    expect(messages[0]?.uiCards).toEqual([
      { type: 'headless_batch', data: status(BATCH, 'ready') },
    ]);
  });

  it("restores every card of a batch to its last frame, across the session's turns", () => {
    const turn = (id: string, frames: OrganicSessionMessage['uiCardFrames']) => ({
      id,
      sessionId: 's1',
      role: 'assistant' as const,
      content: '',
      createdAt: '',
      uiCardFrames: frames,
    });
    const { messages } = restoreSessionFromMessages([
      turn('a1', [{ type: 'ui.headless_batch', data: status(BATCH, 'queued') }]),
      turn('a2', [
        { type: 'ui.headless_batch', data: status(OTHER_BATCH, 'queued') },
        { type: 'ui.headless_batch', data: status(BATCH, 'ready') },
      ]),
    ]);
    expect(messages.map((message) => message.uiCards)).toEqual([
      [{ type: 'headless_batch', data: status(BATCH, 'ready') }],
      [
        { type: 'headless_batch', data: status(OTHER_BATCH, 'queued') },
        { type: 'headless_batch', data: status(BATCH, 'ready') },
      ],
    ]);
  });
});
