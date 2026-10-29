// Regression: a canvas run used to crash the whole authenticated app to the global 500.
//
// CanvasComposerRunTail subscribes TWICE — once through useAgentRunStream for the durable
// event log, once in its own effect for the run row. Both used to build the identical
// topic `agent-run:canvas:<runId>`. A Supabase Realtime topic is a global namespace on the
// browser client, so the second `supabase.channel(...)` was handed the FIRST channel back,
// already flipped to `joining` by its synchronous `.subscribe()` — and a late `.on(...)`
// on a joining channel throws. The throw escaped the post-auth layout to global-error.tsx.
// Now each tail joins its own table's row-broadcast topic: `<events table>:<runId>` and
// `<runs table>:<runId>`.
//
// The fake client below models exactly those two SDK behaviours (topic dedupe, and the
// post-subscribe `.on` guard). Without them the bug is invisible to a test.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AgentRunDto } from '@continuum/contracts';
import { act, cleanup, render } from '@testing-library/react';

type FakeChannel = {
  topic: string;
  joining: boolean;
  bindings: { type: string; event: string }[];
  on: (type: string, filter: { event: string }, callback: unknown) => FakeChannel;
  subscribe: (callback?: (status: string) => void) => FakeChannel;
};

const channels: FakeChannel[] = [];
const removed: string[] = [];

const makeChannel = (topic: string): FakeChannel => {
  const channel: FakeChannel = {
    topic: `realtime:${topic}`,
    joining: false,
    bindings: [],
    on: (type, filter) => {
      // RealtimeChannel.on: throws for late bindings once joining or joined.
      if (channel.joining) {
        throw new Error(
          `cannot add \`${type}\` callbacks for ${channel.topic} after \`subscribe()\`.`,
        );
      }
      channel.bindings.push({ type, event: filter.event });
      return channel;
    },
    subscribe: (callback) => {
      // Synchronous, exactly as the SDK does it — this is what makes the collision fatal.
      channel.joining = true;
      callback?.('SUBSCRIBED');
      return channel;
    },
  };
  return channel;
};

const queryStub = {
  select: () => queryStub,
  eq: () => queryStub,
  maybeSingle: async () => ({ data: null }),
};

const fakeClient = {
  // RealtimeClient.channel: returns the EXISTING channel when the topic already exists.
  channel: (topic: string): FakeChannel => {
    const existing = channels.find((candidate) => candidate.topic === `realtime:${topic}`);
    if (existing) return existing;
    const created = makeChannel(topic);
    channels.push(created);
    return created;
  },
  removeChannel: async (channel: FakeChannel) => {
    removed.push(channel.topic);
    const index = channels.indexOf(channel);
    if (index >= 0) channels.splice(index, 1);
  },
  schema: () => ({ from: () => queryStub }),
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeClient,
}));

// No token — the event-log backlog fetch exits before touching the network.
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => null,
}));

import { CanvasComposerRunTail, DurableAiStudioRunTail } from './CanvasComposerRunTail';

const run: AgentRunDto = {
  runId: '28f1aa84-4c34-4c7c-9cdd-2009f58ceacb',
  agent: 'canvas',
  sessionId: 'room_1',
  status: 'running',
  createdAt: '2026-07-28T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  channels.length = 0;
  removed.length = 0;
});

const topicsOpen = () => channels.map((channel) => channel.topic).sort();

describe('CanvasComposerRunTail realtime subscriptions', () => {
  it('opens two DISTINCT channels — one for the event log, one for the run row', () => {
    render(<CanvasComposerRunTail run={run} />);

    expect(topicsOpen()).toEqual([
      `realtime:ai_studio_canvas_composer_run_events:${run.runId}`,
      `realtime:ai_studio_canvas_composer_runs:${run.runId}`,
    ]);
    for (const channel of channels) {
      expect(channel.bindings).toEqual([{ type: 'broadcast', event: '*' }]);
    }
  });

  it('tails the HyperFrames event log and authoritative run row', () => {
    render(<DurableAiStudioRunTail run={{ ...run, agent: 'hyperframes' }} />);

    expect(topicsOpen()).toEqual([
      `realtime:ai_studio_hyperframe_run_events:${run.runId}`,
      `realtime:ai_studio_hyperframe_runs:${run.runId}`,
    ]);
  });

  it('removes every channel it opened on unmount', () => {
    const { unmount } = render(<CanvasComposerRunTail run={run} />);
    const opened = topicsOpen();
    unmount();

    expect(removed.sort()).toEqual(opened);
    expect(channels).toHaveLength(0);
  });

  // Remount is the navigate-away-and-back path. A topic left in the client's registry by
  // a bare `unsubscribe()` would be handed back here, dead and already joined.
  it('survives a remount without reusing a stale channel', async () => {
    const first = render(<CanvasComposerRunTail run={run} />);
    const stale = [...channels];
    first.unmount();
    expect(() => render(<CanvasComposerRunTail run={run} />)).not.toThrow();
    // The new channels open once the old ones have left.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(channels).toHaveLength(2);
    for (const channel of channels) expect(stale).not.toContain(channel);
  });
});
