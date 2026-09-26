import type { AgentMentionReference } from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';
import {
  calendarPostsResponseSchema,
  type CalendarPostAccountsByPlatform,
  formatCalendarDayId,
} from '@/lib/organic/calendar-posts';

const POST_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;

export function organicPostMentionRange(_dayIds: readonly string[], now = new Date()) {
  return { start: '2000-01-01', end: formatCalendarDayId(now) };
}

function accountsByPlatform(accountIds: Record<string, string>): CalendarPostAccountsByPlatform {
  return Object.fromEntries(
    POST_PLATFORMS.map((platform) => [
      platform,
      accountIds[platform]
        ? [{ integrationAccountId: accountIds[platform] }]
        : [],
    ]),
  ) as CalendarPostAccountsByPlatform;
}

function toSuggestion(post: {
  id: string;
  platform: string;
  integrationAccountId?: string;
  externalPostId?: string;
  timestamp: string;
  dayId: string;
  timeLabel: string;
  title: string;
  caption?: string;
  permalink?: string;
  mediaType?: string;
  mediaUrl?: string | null;
}): AgentMentionSuggestion | null {
  if (!post.externalPostId || !POST_PLATFORMS.includes(post.platform as (typeof POST_PLATFORMS)[number])) {
    return null;
  }
  const reference: AgentMentionReference = {
    id: post.externalPostId,
    type: 'organic_post',
    label: post.title || post.caption?.slice(0, 72) || 'Published post',
    source: 'organic',
    metadata: {
      platform: post.platform,
      integrationAccountId: post.integrationAccountId,
      publishedAt: post.timestamp,
      mediaType: post.mediaType,
      permalink: post.permalink,
    },
  };
  return {
    key: `organic_post:${post.platform}:${post.externalPostId}`,
    label: reference.label,
    type: reference.type,
    source: reference.source,
    group: 'Published',
    description: [post.platform, post.dayId, post.timeLabel, post.caption?.slice(0, 100)]
      .filter(Boolean)
      .join(' · '),
    badge: 'published',
    reference,
    ...(post.mediaUrl
      ? {
          preview: {
            url: post.mediaUrl,
            kind: /video|reel/i.test(post.mediaType ?? '') ? ('video' as const) : ('image' as const),
            label: post.title,
          },
        }
      : {}),
  };
}

export async function fetchOrganicPostMentionSuggestions(input: {
  brandId: string;
  accountIds: Record<string, string>;
  start: string;
  end: string;
  fetchImpl?: typeof fetch;
}): Promise<AgentMentionSuggestion[]> {
  const response = await (input.fetchImpl ?? fetch)('/api/organic/calendar-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brandId: input.brandId,
      start: input.start,
      end: input.end,
      accountsByPlatform: accountsByPlatform(input.accountIds),
      includeExternal: false,
    }),
  });
  if (!response.ok) throw new Error('Unable to load published posts.');
  const parsed = calendarPostsResponseSchema.parse(await response.json());
  return parsed.posts
    .filter((post) => post.source === 'published_posts')
    .map(toSuggestion)
    .filter((suggestion): suggestion is AgentMentionSuggestion => suggestion !== null);
}
