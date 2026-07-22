import { describe, expect, it } from 'bun:test';
import type { OrganicSessionMessage } from '@/lib/organic/agent-sessions';
import { restoreSessionFromMessages } from './restoreSession';
import { parseOrganicStreamEvent } from './streamEventParser';

// Fixture = the REAL ui_cards persisted by the backend for a live "create an
// Instagram post" turn on the Pizza Test brand (organic_chat_messages.ui_cards),
// captured verbatim. This locks that the backend's actual response reconstructs
// and renders through the same FE path used on reload — large tool payloads are
// trimmed but every frame keeps its real type/shape (ids, status, kinds).
const PERSISTED_UI_CARDS = [
  {
    type: 'tool.call',
    data: { args: {}, toolName: 'getBrandIntegrationSummary', toolCallId: 'IZSS2shSTAwoPmH9' },
  },
  {
    type: 'tool.result',
    data: {
      ok: true,
      result: { code: 'edge_fallback_failed', status: 'error', summary: 'rpc_failed' },
      toolName: 'getBrandIntegrationSummary',
      toolCallId: 'IZSS2shSTAwoPmH9',
    },
  },
  {
    type: 'tool.call',
    data: {
      args: { limit: 8, query: 'pepperoni pizza', threshold: 0.2 },
      toolName: 'searchMediaLibrary',
      toolCallId: 'HguxwayYEKxhQJXa',
    },
  },
  { type: 'media.search_results', data: { mode: 'text', items: [], query: 'pepperoni pizza' } },
  {
    type: 'tool.result',
    data: {
      ok: true,
      result: { code: 'no_matches', status: 'warning', summary: 'count=0' },
      toolName: 'searchMediaLibrary',
      toolCallId: 'HguxwayYEKxhQJXa',
    },
  },
  {
    type: 'tool.call',
    data: {
      args: {
        query: 'new pepperoni special pizza launch',
        relevantAngles: ['Pepperoni Special Launch'],
      },
      toolName: 'brandGrounding',
      toolCallId: '0uy1aAKRLsD3scyw',
    },
  },
  {
    type: 'tool.result',
    data: {
      ok: true,
      result: { success: true, brandProfile: [{ text: 'Brand Name: Pizza Test' }] },
      toolName: 'brandGrounding',
      toolCallId: '0uy1aAKRLsD3scyw',
    },
  },
  {
    type: 'ui.plan_status',
    data: {
      itemId: 'b7c62a25-3021-4634-8e89-4e3753d4bc80',
      planId: 'b041d0bf-7853-4865-a860-19184316fb39',
      status: 'executing',
    },
  },
  {
    type: 'tool.call',
    data: {
      args: { angle: 'Introducing our new Pepperoni Special pizza!' },
      toolName: 'createPost',
      toolCallId: 'kZ0createPost01',
    },
  },
  {
    type: 'tool.result',
    data: {
      ok: true,
      result: {
        data: {
          jobId: '134294d9-1866-455b-af42-f556479b99dc',
          planId: 'b041d0bf-7853-4865-a860-19184316fb39',
          platform: 'instagram',
          planItemId: 'b7c62a25-3021-4634-8e89-4e3753d4bc80',
        },
      },
      toolName: 'createPost',
      toolCallId: 'kZ0createPost01',
    },
  },
] as const;

function assistantMessage(): OrganicSessionMessage {
  return {
    id: 'a1',
    sessionId: 'pizza:e2e',
    role: 'assistant',
    content: "I've successfully queued and scheduled your new Pepperoni Special post.",
    uiCardFrames: PERSISTED_UI_CARDS as unknown as OrganicSessionMessage['uiCardFrames'],
    createdAt: '2026-06-23T21:00:00Z',
  };
}

describe('backend response → FE rendering alignment (real persisted ui_cards)', () => {
  it('parses every persisted frame to a renderable kind (none invalid)', () => {
    const kinds = PERSISTED_UI_CARDS.map((f) => parseOrganicStreamEvent(f).kind);
    expect(kinds).not.toContain('invalid');
    // Spot-check the discriminated routing the renderer relies on.
    expect(parseOrganicStreamEvent(PERSISTED_UI_CARDS[7]).kind).toBe('planStatus');
    expect(parseOrganicStreamEvent(PERSISTED_UI_CARDS[3]).kind).toBe('mediaSearchResults');
  });

  it('reconstructs the thinking trace, plan status, and media results on reload', () => {
    const { messages, planStatuses } = restoreSessionFromMessages([assistantMessage()]);
    const msg = messages[0]!;

    // 4 distinct tool calls, each with its result merged by toolCallId.
    expect(msg.toolCalls).toHaveLength(4);
    const createPost = msg.toolCalls!.find((t) => t.toolName === 'createPost');
    expect(createPost?.result).toMatchObject({ data: { platform: 'instagram' } });

    // The gap-closer: per-item plan status reseeds from the persisted frame.
    expect(planStatuses).toEqual([
      {
        planId: 'b041d0bf-7853-4865-a860-19184316fb39',
        itemId: 'b7c62a25-3021-4634-8e89-4e3753d4bc80',
        status: 'executing',
        jobId: undefined,
        draftId: undefined,
      },
    ]);

    // Media search panel reconstructs.
    expect(msg.mediaSearchResults).toHaveLength(1);
    expect(msg.mediaSearchResults![0]).toMatchObject({
      type: 'media.search_results',
      data: { query: 'pepperoni pizza' },
    });
  });
});
