import { describe, expect, it } from 'bun:test';
import {
  fetchOrganicPostMentionSuggestions,
  organicPostMentionRange,
} from './organic-post-mentions';

describe('organic post mentions', () => {
  it('covers the complete stored social posting history', () => {
    expect(organicPostMentionRange(['2024-02-01', '2026-09-20'], new Date(2026, 8, 22))).toEqual({
      start: '2000-01-01',
      end: '2026-09-22',
    });
    expect(organicPostMentionRange([], new Date(2026, 8, 22))).toEqual({
      start: '2000-01-01',
      end: '2026-09-22',
    });
  });

  it('fetches stored calendar posts only and maps their persisted identity', async () => {
    let sentBody: Record<string, unknown> | null = null;
    const suggestions = await fetchOrganicPostMentionSuggestions({
      brandId: 'brand-1',
      accountIds: { instagram: 'ig-account', tiktok: 'tt-account' },
      start: '2025-01-01',
      end: '2026-01-01',
      fetchImpl: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            databaseCount: 1,
            externalFetched: false,
            posts: [
              {
                id: 'published:instagram:stored-post-1',
                source: 'published_posts',
                platform: 'instagram',
                integrationAccountId: 'ig-account',
                externalPostId: 'stored-post-1',
                timestamp: '2026-01-01T10:00:00.000Z',
                dayId: '2026-01-01',
                timeLabel: '10:00 AM',
                title: 'Launch post',
                caption: 'Our launch caption',
                permalink: 'https://example.test/launch',
                mediaType: 'IMAGE',
                mediaUrl: 'https://example.test/thumb.jpg',
              },
              {
                id: 'external:instagram:provider-only',
                source: 'external',
                platform: 'instagram',
                externalPostId: 'provider-only',
                timestamp: '2026-01-01T10:00:00.000Z',
                dayId: '2026-01-01',
                timeLabel: '10:00 AM',
                title: 'Provider only',
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }) as typeof fetch,
    });

    expect(sentBody).toMatchObject({
      brandId: 'brand-1',
      start: '2025-01-01',
      end: '2026-01-01',
      includeExternal: false,
      accountsByPlatform: {
        instagram: [{ integrationAccountId: 'ig-account' }],
        tiktok: [{ integrationAccountId: 'tt-account' }],
      },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      key: 'organic_post:instagram:stored-post-1',
      label: 'Launch post',
      group: 'Published',
      reference: {
        id: 'stored-post-1',
        type: 'organic_post',
        metadata: {
          platform: 'instagram',
          integrationAccountId: 'ig-account',
          publishedAt: '2026-01-01T10:00:00.000Z',
          permalink: 'https://example.test/launch',
        },
      },
      preview: { kind: 'image', url: 'https://example.test/thumb.jpg' },
    });
  });
});
