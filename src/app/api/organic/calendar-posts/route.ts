import { plannerInstantFromDayTime, resolvePlannerTimeZone } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';
import { mintSignedUrls, type SignablePath } from '@/lib/media/signed-urls';
import {
  type CalendarPostAccountsByPlatform,
  calendarPostAccountsByPlatformSchema,
  calendarPostsResponseSchema,
  formatCalendarDayId,
  formatPostedDayId,
  formatPostedTimeLabel,
  normalizeCalendarPlatform,
  shouldFetchExternalCalendarPosts,
} from '@/lib/organic/calendar-posts';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { normalizeInstagramOrganicMetricsResponse } from '@/lib/organic-metrics/normalize';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchPublishedPostPages, type PublishedPostRow } from './publishedPostPages';

const calendarPostsRequestSchema = z.object({
  brandId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountsByPlatform: calendarPostAccountsByPlatformSchema,
  includeExternal: z.boolean().optional(),
  forceRefreshExternal: z.boolean().optional(),
});

type TikTokVideo = {
  id: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
};

type TikTokEdgeResponse = {
  videos?: TikTokVideo[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readMediaUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (!Array.isArray(value)) return null;
  const first = value.find(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return first?.trim() ?? null;
}

function toTimestampRange(start: string, end: string, timeZone: string) {
  const nextDay = new Date(`${end}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const startIso = plannerInstantFromDayTime({ dayId: start, timeOfDay: '00:00', timeZone });
  const nextStartIso = plannerInstantFromDayTime({
    dayId: nextDay.toISOString().slice(0, 10),
    timeOfDay: '00:00',
    timeZone,
  });
  return {
    startIso: startIso ?? `${start}T00:00:00.000Z`,
    endIso: nextStartIso
      ? new Date(Date.parse(nextStartIso) - 1).toISOString()
      : `${end}T23:59:59.999Z`,
  };
}

function mapTimestampToPostFields(timestamp: string, timeZone: string) {
  const parsed = new Date(timestamp);
  const dayId = Number.isNaN(parsed.getTime())
    ? timestamp.slice(0, 10)
    : (formatPostedDayId(timestamp, timeZone) ?? formatCalendarDayId(parsed));
  return {
    dayId,
    timeLabel: formatPostedTimeLabel(timestamp, timeZone),
  };
}

// The durable {bucket, path} for a published post's thumbnail, read from the original
// placement snapshot. `media_urls` holds the 24h signed URL sent to Meta at publish time
// and expires; re-signing this durable ref on every read keeps the calendar thumbnail live.
function durableThumbRef(snapshot: Record<string, unknown>): SignablePath | null {
  const assets = Array.isArray(snapshot.publishingAssets) ? snapshot.publishingAssets : [];
  for (const asset of assets) {
    const record = asRecord(asset);
    if (
      record.kind === 'image' &&
      typeof record.storagePath === 'string' &&
      typeof record.bucket === 'string'
    ) {
      return { path: record.storagePath, bucket: record.bucket };
    }
  }
  const ms = asRecord(asRecord(snapshot.creative).mediaSuggestion);
  if (typeof ms.url === 'string' && typeof ms.bucket === 'string' && !/^https?:/i.test(ms.url)) {
    return { path: ms.url, bucket: ms.bucket };
  }
  const hyperframe = asRecord(ms.hyperframe);
  if (typeof hyperframe.coverPath === 'string' && typeof hyperframe.bucket === 'string') {
    return { path: hyperframe.coverPath, bucket: hyperframe.bucket };
  }
  return null;
}

function mapPublishedPost(
  row: PublishedPostRow,
  freshThumbnailUrl: string | null,
  timeZone: string,
): OrganicCalendarPostedContent {
  const snapshot = asRecord(row.content_snapshot);
  const timestamp = row.published_at || row.created_at;
  const caption = row.caption ?? readString(snapshot.caption) ?? undefined;
  const title = readString(snapshot.title) ?? caption?.slice(0, 72) ?? 'Published post';
  const mediaUrl =
    freshThumbnailUrl ?? readMediaUrl(row.media_urls) ?? readMediaUrl(snapshot.mediaUrls);
  const { dayId, timeLabel } = mapTimestampToPostFields(timestamp, timeZone);
  const platform = normalizeCalendarPlatform(row.platform);

  return {
    id: `published:${platform}:${row.platform_post_id}`,
    source: 'published_posts',
    platform,
    integrationAccountId: row.platform_account_id,
    externalPostId: row.platform_post_id,
    timestamp,
    dayId,
    timeLabel,
    title,
    caption,
    permalink: row.permalink ?? undefined,
    mediaType: row.post_type,
    mediaUrl,
    thumbnailUrl: mediaUrl,
  };
}

function mapAnalyticsPost(args: {
  post: OrganicPost;
  platform: OrganicPlatformKey;
  integrationAccountId: string;
  timeZone: string;
}): OrganicCalendarPostedContent | null {
  const { post, platform, integrationAccountId, timeZone } = args;
  if (!post.timestamp) return null;

  const { dayId, timeLabel } = mapTimestampToPostFields(post.timestamp, timeZone);
  const caption = post.caption ?? post.title;

  return {
    id: `external:${platform}:${post.id}`,
    source: 'external',
    platform,
    integrationAccountId,
    externalPostId: post.id,
    timestamp: post.timestamp,
    dayId,
    timeLabel,
    title: post.title ?? caption?.slice(0, 72) ?? 'Published post',
    caption,
    permalink: post.permalink,
    mediaType: post.mediaType ?? post.mediaProductType,
    mediaUrl: post.mediaUrl ?? null,
    thumbnailUrl: post.thumbnailUrl ?? post.mediaUrl ?? null,
  };
}

function mapTikTokVideo(
  video: TikTokVideo,
  integrationAccountId: string,
  timeZone: string,
): OrganicCalendarPostedContent | null {
  if (!video.id || !video.create_time) return null;
  const timestamp = new Date(video.create_time * 1000).toISOString();
  const { dayId, timeLabel } = mapTimestampToPostFields(timestamp, timeZone);
  const caption = video.video_description;

  return {
    id: `external:tiktok:${video.id}`,
    source: 'external',
    platform: 'tiktok',
    integrationAccountId,
    externalPostId: video.id,
    timestamp,
    dayId,
    timeLabel,
    title: caption?.slice(0, 72) || 'TikTok post',
    caption,
    permalink: video.share_url,
    mediaType: 'VIDEO',
    mediaUrl: video.cover_image_url ?? null,
    thumbnailUrl: video.cover_image_url ?? null,
  };
}

function dedupePosts(posts: OrganicCalendarPostedContent[]): OrganicCalendarPostedContent[] {
  const byKey = new Map<string, OrganicCalendarPostedContent>();
  for (const post of posts) {
    const key = post.permalink
      ? `${post.platform}:url:${post.permalink}`
      : `${post.platform}:id:${post.externalPostId ?? post.id}`;
    const existing = byKey.get(key);
    if (!existing || existing.source === 'external') {
      byKey.set(key, post);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchExternalPosts(params: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  brandId: string;
  start: string;
  end: string;
  accountsByPlatform: CalendarPostAccountsByPlatform;
  forceRefresh: boolean;
  timeZone: string;
}): Promise<OrganicCalendarPostedContent[]> {
  const posts: OrganicCalendarPostedContent[] = [];
  const { supabase, brandId, start, end, accountsByPlatform, forceRefresh, timeZone } = params;

  for (const platform of ['instagram', 'facebook', 'youtube'] as const) {
    for (const account of accountsByPlatform[platform]) {
      const { data, error } = await supabase.functions.invoke('organic-reporting/analytics', {
        body: {
          brandId,
          integrationAccountId: account.integrationAccountId,
          platform,
          range: { preset: 'custom', custom: { from: start, to: end } },
          scope: 'posts',
          forceRefresh,
        },
      });
      if (error) continue;

      const normalized = normalizeInstagramOrganicMetricsResponse(data);
      posts.push(
        ...(normalized.posts ?? [])
          .map((post) =>
            mapAnalyticsPost({
              post,
              platform: normalizeCalendarPlatform(platform),
              integrationAccountId: account.integrationAccountId,
              timeZone,
            }),
          )
          .filter((post): post is OrganicCalendarPostedContent => post !== null),
      );
    }
  }

  for (const account of accountsByPlatform.tiktok) {
    const { data, error } = await supabase.functions.invoke('organic-reporting/tiktok', {
      body: {
        brandId,
        integrationAccountId: account.integrationAccountId,
        scope: 'all',
        forceRefresh,
      },
    });
    if (error) continue;

    const videos = ((data as TikTokEdgeResponse | null)?.videos ?? [])
      .map((video) => mapTikTokVideo(video, account.integrationAccountId, timeZone))
      .filter((post): post is OrganicCalendarPostedContent => post !== null)
      .filter((post) => post.dayId >= start && post.dayId <= end);
    posts.push(...videos);
  }

  return posts;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = calendarPostsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: brand, error: brandError } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('timezone')
    .eq('id', parsed.data.brandId)
    .single();
  if (brandError || !brand) {
    return NextResponse.json({ error: 'Brand unavailable' }, { status: 403 });
  }
  const timeZone = resolvePlannerTimeZone(brand.timezone);
  const { startIso, endIso } = toTimestampRange(parsed.data.start, parsed.data.end, timeZone);
  const organicSchema = supabase.schema('organic' as never) as unknown as {
    from: (table: 'organic_published_posts') => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          or: (filters: string) => {
            order: (column: string, options: { ascending: boolean }) => PostPageQuery;
          };
        };
      };
    };
  };
  type PostPageQuery = {
    order: (column: string, options: { ascending: boolean }) => PostPageQuery;
    range: (
      from: number,
      to: number,
    ) => Promise<{
      data: PublishedPostRow[] | null;
      error: { message: string } | null;
    }>;
  };

  const postQuery = organicSchema
    .from('organic_published_posts')
    .select(
      'brand_id, caption, content_snapshot, created_at, draft_id, ig_user_id, instagram_post_id, media_urls, permalink, platform, platform_account_id, platform_post_id, post_type, published_at',
    )
    .eq('brand_id', parsed.data.brandId)
    .or(
      `and(published_at.gte.${startIso},published_at.lte.${endIso}),and(published_at.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`,
    )
    .order('published_at', { ascending: true })
    .order('platform', { ascending: true })
    .order('platform_account_id', { ascending: true })
    .order('platform_post_id', { ascending: true });

  const { rows, error } = await fetchPublishedPostPages((from, to) => postQuery.range(from, to));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const thumbRefByRow = new Map<PublishedPostRow, SignablePath>();
  for (const row of rows) {
    const ref = durableThumbRef(asRecord(row.content_snapshot));
    if (ref) thumbRefByRow.set(row, ref);
  }
  const signedByPath = await mintSignedUrls([...thumbRefByRow.values()]);
  const databasePosts = rows.map((row) =>
    mapPublishedPost(row, signedByPath.get(thumbRefByRow.get(row)?.path ?? '') ?? null, timeZone),
  );
  const shouldFetchExternal = shouldFetchExternalCalendarPosts({
    databaseCount: databasePosts.length,
    includeExternal: parsed.data.includeExternal,
  });
  const externalPosts = shouldFetchExternal
    ? await fetchExternalPosts({
        supabase,
        brandId: parsed.data.brandId,
        start: parsed.data.start,
        end: parsed.data.end,
        accountsByPlatform: parsed.data.accountsByPlatform,
        forceRefresh: parsed.data.forceRefreshExternal ?? false,
        timeZone,
      })
    : [];

  const response = calendarPostsResponseSchema.parse({
    posts: dedupePosts([...databasePosts, ...externalPosts]),
    databaseCount: databasePosts.length,
    externalFetched: shouldFetchExternal,
  });

  return NextResponse.json(response);
}
