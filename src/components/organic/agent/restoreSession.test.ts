import { describe, expect, it } from 'bun:test';
import type { OrganicSessionMessage } from '@/lib/organic/agent-sessions';
import { restoreSessionFromMessages } from './restoreSession';

function message(partial: Partial<OrganicSessionMessage>): OrganicSessionMessage {
  return {
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: '',
    uiCardFrames: [],
    createdAt: '',
    ...partial,
  };
}

describe('restoreSessionFromMessages', () => {
  it('keeps plain messages untouched and attaches no cards', () => {
    const { messages, pipelineCards, bulkRuns } = restoreSessionFromMessages([
      message({ id: 'u1', role: 'user', content: 'hi' }),
      message({ id: 'a1', role: 'assistant', content: 'hello' }),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ id: 'u1', role: 'user', content: 'hi', metadata: undefined });
    expect(messages[1]!.uiCards).toBeUndefined();
    expect(pipelineCards).toHaveLength(0);
    expect(bulkRuns).toHaveLength(0);
  });

  it('re-attaches a persisted plan card frame to its message', () => {
    // Full ProposedPlan — parseUiPlanCard strictly validates proposedPlanSchema
    // (items.min(1) + required fields), so the persisted frame must be complete.
    const planItem = {
      itemId: 'item_1',
      kind: 'create_post',
      platform: 'instagram',
      scheduledAt: '2026-06-15T12:00:00Z',
      format: 'post',
      trendId: null,
      trendTitle: null,
      angle: 'Test angle',
      objective: 'follow',
      audienceSegment: 'everyone',
      rationale: 'because evidence',
      guidancePrompt: null,
      draftId: null,
      jobId: null,
      dependsOn: [],
      status: 'pending',
      creativeBrief: null,
    };
    const { messages } = restoreSessionFromMessages([
      message({
        content: 'Here is a plan',
        uiCardFrames: [
          {
            type: 'ui.plan_card',
            data: {
              planId: 'plan_1',
              sessionId: 's1',
              brandId: 'b1',
              userId: 'u1',
              weekStart: '2026-06-15',
              title: 'IG week',
              summary: 'A test plan',
              items: [planItem],
              evidence: [],
              estimatedDurationSeconds: 60,
              status: 'proposed',
              createdAt: '2026-06-12T00:00:00Z',
            },
          },
        ],
      }),
    ]);

    expect(messages[0]!.uiCards).toHaveLength(1);
    expect(messages[0]!.uiCards![0]).toMatchObject({
      type: 'plan_card',
      data: { planId: 'plan_1' },
    });
  });

  it('routes a bulk_run frame to bulkRuns', () => {
    const { bulkRuns } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.bulk_run',
            data: { runId: 'run_bulk_1', planId: 'bulk_1', brandId: 'b1', total: 12 },
          },
        ],
      }),
    ]);

    expect(bulkRuns).toEqual([{ runId: 'run_bulk_1', planId: 'bulk_1', total: 12 }]);
  });

  it('seeds pipeline cards from persisted pipeline frames', () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.pipeline_card',
            data: { jobId: 'job_1', brandId: 'b1', status: 'completed', planId: 'plan_1' },
          },
        ],
      }),
    ]);

    expect(pipelineCards).toHaveLength(1);
    expect(pipelineCards[0]).toMatchObject({ jobId: 'job_1', status: 'completed' });
  });

  it('ignores unparseable frames without throwing', () => {
    const { messages, pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: 'ui.plan_card', data: {} },
          null,
          'garbage',
          42,
        ] as unknown as OrganicSessionMessage['uiCardFrames'],
      }),
    ]);

    expect(messages[0]!.uiCards).toBeUndefined();
    expect(pipelineCards).toHaveLength(0);
  });

  it('rehydrates a tool call + its result into the message thinking trace', () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'tool.call',
            data: { toolCallId: 'tc1', toolName: 'listTrends', args: { q: 'x' } },
          },
          {
            type: 'tool.result',
            data: { toolCallId: 'tc1', toolName: 'listTrends', ok: true, result: { ok: true } },
          },
        ],
      }),
    ]);

    expect(messages[0]!.toolCalls).toHaveLength(1);
    expect(messages[0]!.toolCalls![0]).toMatchObject({
      toolCallId: 'tc1',
      toolName: 'listTrends',
      result: { ok: true },
    });
  });

  it('replays a persisted media strip onto its turn, refs only', () => {
    const strip = {
      toolCallId: 'tc3',
      toolName: 'listOwnInstagramMedia',
      items: [
        {
          ref: { type: 'platform', platform: 'instagram', mediaId: '1789' },
          kind: 'video',
          w: null,
          h: null,
          permalink: 'https://www.instagram.com/reel/abc/',
          label: 'Launch reel',
        },
      ],
      total: 31,
    };
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'tool.result',
            data: { toolCallId: 'tc3', toolName: 'listOwnInstagramMedia', ok: true },
          },
          { type: 'ui.media_strip', data: strip },
          // The same strip persisted twice is still one strip (one React key per tool call).
          { type: 'ui.media_strip', data: strip },
        ],
      }),
    ]);

    expect(messages[0]!.uiCards).toEqual([{ type: 'media_strip', data: strip }]);
  });

  // Sessions persisted before the strip carry only the tool result. They reload with no strip
  // (the FE no longer rebuilds one from each tool's result shape) and must not throw.
  it('an old post-tool result with no strip reloads with no card and no crash', () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: 'tool.call', data: { toolCallId: 'tc2', toolName: 'listDrafts', args: {} } },
          {
            type: 'tool.result',
            data: {
              toolCallId: 'tc2',
              toolName: 'listDrafts',
              ok: true,
              result: { drafts: [{ draftId: 'd1', platform: 'instagram', caption: 'Hi' }] },
            },
          },
        ],
      }),
    ]);

    expect(messages[0]!.uiCards).toBeUndefined();
    expect(messages[0]!.toolCalls?.[0]?.toolName).toBe('listDrafts');
  });

  it('rehydrates media search results onto the message', () => {
    const { messages } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          { type: 'media.search_results', data: { query: 'navy suits', mode: 'text', items: [] } },
        ],
      }),
    ]);

    expect(messages[0]!.mediaSearchResults).toHaveLength(1);
    expect(messages[0]!.mediaSearchResults![0]).toMatchObject({ type: 'media.search_results' });
  });

  it('collects ui.plan_status frames so the reducer can reseed per-item status', () => {
    const { planStatuses } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.plan_status',
            data: { planId: 'plan_1', itemId: 'item_1', status: 'completed' },
          },
          {
            type: 'ui.plan_status',
            data: { planId: 'plan_1', itemId: 'item_2', status: 'executing' },
          },
        ],
      }),
    ]);

    expect(planStatuses).toEqual([
      {
        planId: 'plan_1',
        itemId: 'item_1',
        status: 'completed',
        jobId: undefined,
        draftId: undefined,
      },
      {
        planId: 'plan_1',
        itemId: 'item_2',
        status: 'executing',
        jobId: undefined,
        draftId: undefined,
      },
    ]);
  });

  it('merges a draft.blueprint_ready storyboard onto its pipeline card by draftId', () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.pipeline_card',
            data: { jobId: 'job_1', brandId: 'b1', status: 'running', draftId: 'd1' },
          },
          {
            type: 'draft.blueprint_ready',
            data: {
              jobId: 'blueprint_job',
              brandId: 'b1',
              draftId: 'd1',
              previewRevision: 'revision-1',
              previews: [{ role: 'scene_1', signedUrl: 'https://cdn/scene_1.png' }],
            },
          },
        ],
      }),
    ]);

    expect(pipelineCards).toHaveLength(1);
    expect(pipelineCards[0]!.preview?.images).toEqual(['https://cdn/scene_1.png']);
    expect(pipelineCards[0]!.checkpoint?.blueprintReady).toBe(true);
    expect(pipelineCards[0]!.checkpoint?.previewRevision).toBe('revision-1');
    // Replayed signatures are stale on arrival: the card must rank re-signed media above them.
    expect(pipelineCards[0]!.previewStale).toBe(true);
  });

  // Bug #220 on the reload path. previews and previewRevision fail independently:
  // signing a 512px frame can miss while the blueprint (and its approval token)
  // succeeded. Gating the merge on previews threw the token away, so a reloaded card
  // showed "Awaiting media choice" with no action.
  it('restores the approval token even when the blueprint carried no previews', () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.pipeline_card',
            data: { jobId: 'job_1', brandId: 'b1', status: 'completed', draftId: 'd1' },
          },
          {
            type: 'draft.blueprint_ready',
            data: {
              jobId: 'blueprint_job',
              brandId: 'b1',
              draftId: 'd1',
              previewRevision: 'revision-2',
            },
          },
        ],
      }),
    ]);

    expect(pipelineCards).toHaveLength(1);
    expect(pipelineCards[0]!.checkpoint?.blueprintReady).toBe(true);
    expect(pipelineCards[0]!.checkpoint?.awaitingMediaChoice).toBe(true);
    expect(pipelineCards[0]!.checkpoint?.previewRevision).toBe('revision-2');
    // No previews means no preview block — not an empty one that would blank the card.
    expect(pipelineCards[0]!.preview).toBeUndefined();
    expect(pipelineCards[0]!.previewStale).toBeUndefined();
  });

  // The blueprint frame is older than a realize that followed it, so replaying it must
  // not walk a finished card back to "awaiting choice".
  it('does not reopen the media choice on a card whose media already settled', () => {
    const { pipelineCards } = restoreSessionFromMessages([
      message({
        uiCardFrames: [
          {
            type: 'ui.pipeline_card',
            data: {
              jobId: 'job_1',
              brandId: 'b1',
              status: 'completed',
              draftId: 'd1',
              checkpoint: { textReady: true, blueprintReady: true, mediaStatus: 'ready' },
            },
          },
          {
            type: 'draft.blueprint_ready',
            data: {
              jobId: 'blueprint_job',
              brandId: 'b1',
              draftId: 'd1',
              previewRevision: 'revision-3',
            },
          },
        ],
      }),
    ]);

    expect(pipelineCards[0]!.checkpoint?.mediaStatus).toBe('ready');
    expect(pipelineCards[0]!.checkpoint?.awaitingMediaChoice).toBeUndefined();
    expect(pipelineCards[0]!.checkpoint?.previewRevision).toBe('revision-3');
  });
});
