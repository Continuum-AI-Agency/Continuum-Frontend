import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, render } from '@testing-library/react';

// The settings page mounts this hook TWICE for one brand — `DesignSystemSection` for
// the section cards, and the `DesignSystemCard` nested inside it for the uploader. When
// the hook built its own channel from the brand id, both mounts produced the same topic,
// `supabase.channel()` handed the second mount the first mount's already-subscribed
// channel, and its late `.on(…)` threw — which took /settings?section=brand-intelligence
// to the global error boundary. The fake client below reproduces exactly those two
// Supabase behaviours — a topic-keyed registry and a throw on late binding — so this test
// fails again the moment the hook goes back to binding its own channel.

const BRAND = '32841a24-9e31-480c-8a3a-7ebc3cde0569';

class FakeChannel {
  subscribed = false;
  constructor(readonly topic: string) {}

  on(): FakeChannel {
    if (this.subscribed) {
      throw new Error(
        `cannot add callbacks for realtime:${this.topic} after \`subscribe()\`.`,
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

  afterEach(() => {
    cleanup();
  });

  it('does not throw when two consumers watch the same brand', async () => {
    await expect(mountTwoConsumers(BRAND)).resolves.toBeUndefined();
  });

  it("shares the brand's one row-broadcast channel between both consumers", async () => {
    await mountTwoConsumers(BRAND);
    expect(claimedTopics).toEqual([`brand_design_systems:${BRAND}`]);
  });

  it('subscribes to nothing when there is no brand', async () => {
    await mountTwoConsumers('');
    expect(claimedTopics).toHaveLength(0);
  });
});
