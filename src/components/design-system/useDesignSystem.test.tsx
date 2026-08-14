import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, render } from '@testing-library/react';

// The settings page mounts this hook TWICE for one brand — `DesignSystemSection` for
// the section cards, and the `DesignSystemCard` nested inside it for the uploader. When
// the hook built its own channel topic from the brand id, both mounts produced the same
// string, `supabase.channel()` handed the second mount the first mount's already-
// subscribed channel, and `.on('postgres_changes', …)` threw:
//
//   cannot add `postgres_changes` callbacks for realtime:design-system-<brand> after `subscribe()`
//
// which took /settings?section=brand-intelligence to the global error boundary. The fake
// client below reproduces exactly those two Supabase behaviours — a topic-keyed registry
// and a throw on late binding — so this test fails again the moment the hook goes back to
// naming its own topic.

const BRAND = '32841a24-9e31-480c-8a3a-7ebc3cde0569';

class FakeChannel {
  subscribed = false;
  constructor(readonly topic: string) {}

  on(): FakeChannel {
    if (this.subscribed) {
      throw new Error(
        `cannot add \`postgres_changes\` callbacks for realtime:${this.topic} after \`subscribe()\`.`,
      );
    }
    return this;
  }

  subscribe(callback?: (status: string) => void): FakeChannel {
    this.subscribed = true;
    callback?.('SUBSCRIBED');
    return this;
  }
}

const registry = new Map<string, FakeChannel>();
let claimedTopics: string[] = [];

const fakeClient = {
  channel(topic: string): FakeChannel {
    const existing = registry.get(topic);
    // Supabase hands back the EXISTING channel for a matching topic. That is the whole
    // bug — reproducing it is the point of this fake.
    if (existing) return existing;
    const created = new FakeChannel(topic);
    registry.set(topic, created);
    claimedTopics.push(topic);
    return created;
  },
  removeChannel(channel: FakeChannel): void {
    registry.delete(channel.topic);
  },
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeClient,
}));

mock.module('@/lib/brands/designSystem.client', () => ({
  fetchDesignSystem: async () => ({
    present: false,
    status: null,
    version: null,
    updated_at: null,
    design_system: null,
  }),
}));

const { useDesignSystem } = await import('./useDesignSystem');

function TwoConsumers({ brandId }: { brandId: string }) {
  // Deliberately mirrors DesignSystemSection rendering DesignSystemCard: two independent
  // consumers of the same brand's live state, in one tree.
  useDesignSystem(brandId);
  useDesignSystem(brandId);
  return null;
}

/** Mount and let the initial `fetchDesignSystem` settle, so no state update escapes act. */
async function mountTwoConsumers(brandId: string): Promise<void> {
  await act(async () => {
    render(<TwoConsumers brandId={brandId} />);
  });
}

describe('useDesignSystem realtime subscription', () => {
  beforeEach(() => {
    registry.clear();
    claimedTopics = [];
  });

  it('does not throw when two consumers watch the same brand', async () => {
    await expect(mountTwoConsumers(BRAND)).resolves.toBeUndefined();
  });

  it('gives each consumer its own channel topic', async () => {
    await mountTwoConsumers(BRAND);
    expect(claimedTopics).toHaveLength(2);
    expect(new Set(claimedTopics).size).toBe(2);
  });

  it('keeps the brand id in the topic so the channel stays greppable in devtools', async () => {
    await mountTwoConsumers(BRAND);
    for (const topic of claimedTopics) expect(topic).toContain(`design-system-${BRAND}`);
  });

  it('subscribes to nothing when there is no brand', async () => {
    await mountTwoConsumers('');
    expect(claimedTopics).toHaveLength(0);
  });
});
