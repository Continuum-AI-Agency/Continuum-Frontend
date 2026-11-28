import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { RequestOptions } from '@/lib/api/http.types';

const seen: Array<RequestOptions<unknown>> = [];
let response: unknown;
mock.module('@/lib/api/http', () => ({
  request: async (options: RequestOptions<unknown>) => {
    seen.push(options);
    return options.schema?.parse(response) ?? response;
  },
}));
const { interactWatchman, watchmanReads, watchmanQueryKeys } = await import('./api');
const BRAND = '11111111-1111-4111-8111-111111111111';
const WM = '22222222-2222-4222-8222-222222222222';
beforeEach(() => {
  seen.length = 0;
  response = undefined;
});
describe('Watchman HTTP boundaries', () => {
  it('uses brand-scoped dashboard and conversation endpoints', async () => {
    response = {
      brand_id: BRAND,
      generated_at: '2026-11-26T10:00:00Z',
      can_manage: true,
      partial: false,
      issues: [],
      teammates: [],
      work: [],
      needs_you: [],
    };
    await watchmanReads.dashboard(BRAND);
    expect(seen[0]?.path).toBe(`/api/watchman/dashboard?brandId=${BRAND}`);
    response = {
      conversation_id: 'thread:a/b?',
      watchman_id: WM,
      version: 0,
      events: [],
      messages: [],
    };
    await watchmanReads.conversation(BRAND, WM, 'thread:a/b?');
    expect(seen[1]?.path).toContain('conversationId=thread%3Aa%2Fb%3F');
    expect(watchmanQueryKeys.all(BRAND)).not.toEqual(watchmanQueryKeys.all(WM));
  });
  it('rejects a dashboard response for another brand', async () => {
    response = { brand_id: WM, generated_at: '2026-11-26T10:00:00Z', can_manage: true, partial: false, issues: [], teammates: [], work: [], needs_you: [] };
    await expect(watchmanReads.dashboard(BRAND)).rejects.toThrow('Dashboard response brand mismatch');
  });
  it('refuses malformed generated output and ambiguous input', async () => {
    response = { html: '<script>bad()</script>' };
    const input = {
      brand_id: BRAND,
      watchman_id: WM,
      conversation_id: 'thread',
      request_id: '33333333-3333-4333-8333-333333333333',
      message: 'Investigate performance',
    };
    await expect(interactWatchman(input)).rejects.toThrow();
    expect(() =>
      interactWatchman({
        ...input,
        action: { type: 'reply', conversation_id: 'thread', text: 'both' },
      }),
    ).toThrow();
    expect(seen).toHaveLength(1);
  });
});
