import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  organicAnalyticsScopeSchema,
  organicDateRangePresetSchema,
} from '@/lib/schemas/organicMetrics';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  brandId: z.string(),
  integrationAccountId: z.string(),
  range: z.object({
    preset: organicDateRangePresetSchema,
    custom: z
      .object({
        from: z.string(),
        to: z.string(),
      })
      .optional(),
  }),
  forceRefresh: z.boolean().optional(),
  scope: organicAnalyticsScopeSchema.optional(),
  selectedPostId: z.string().optional(),
});

type TikTokUserInfo = {
  open_id: string;
  display_name?: string;
  username?: string;
  avatar_url?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
};

type TikTokVideo = {
  id: string;
  create_time: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
};

type TikTokEdgeResponse = {
  platform: 'tiktok';
  externalAccountId: string;
  warnings?: string[];
  userInfo?: TikTokUserInfo | null;
  videos?: TikTokVideo[];
};

function normalizeTikTokResponse(
  data: TikTokEdgeResponse,
  integrationAccountId: string,
  rangePreset: string,
) {
  const userInfo = data.userInfo ?? null;
  const videos = data.videos ?? [];

  const totalViews = videos.reduce((sum, v) => sum + (v.view_count ?? 0), 0);
  const totalComments = videos.reduce((sum, v) => sum + (v.comment_count ?? 0), 0);
  const totalShares = videos.reduce((sum, v) => sum + (v.share_count ?? 0), 0);
  const totalLikes = videos.reduce((sum, v) => sum + (v.like_count ?? 0), 0);

  const posts = videos.map((v) => ({
    id: v.id,
    caption: v.video_description,
    mediaUrl: v.cover_image_url ?? null,
    permalink: v.share_url,
    timestamp: v.create_time ? new Date(v.create_time * 1000).toISOString() : undefined,
    mediaType: 'VIDEO',
    metrics: {
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
      views: v.view_count ?? 0,
    },
  }));

  return {
    platform: 'tiktok' as const,
    accountId: data.externalAccountId ?? integrationAccountId,
    integrationAccountId,
    range: {
      preset: rangePreset,
      since: '',
      until: '',
    },
    accountProfile: userInfo
      ? {
          displayName: userInfo.display_name ?? null,
          username: userInfo.username ?? null,
          avatarUrl: userInfo.avatar_url ?? null,
          bio: userInfo.bio_description ?? null,
          profileUrl: userInfo.profile_deep_link ?? null,
          isVerified: userInfo.is_verified ?? null,
        }
      : undefined,
    metrics: {
      subscribers: userInfo?.follower_count ?? 0,
      following: userInfo?.following_count ?? 0,
      likes: userInfo?.likes_count ?? totalLikes,
      videoCount: userInfo?.video_count ?? videos.length,
      views: totalViews,
      comments: totalComments,
      shares: totalShares,
    },
    comparison: null,
    posts,
    warnings: data.warnings ?? [],
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data, error } = await supabase.functions.invoke('organic-reporting/tiktok', {
      body: {
        brandId: parsed.data.brandId,
        integrationAccountId: parsed.data.integrationAccountId,
        scope: 'all',
        forceRefresh: parsed.data.forceRefresh ?? false,
      },
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch TikTok organic analytics from edge function' },
        { status: 500 },
      );
    }

    const normalized = normalizeTikTokResponse(
      data as TikTokEdgeResponse,
      parsed.data.integrationAccountId,
      parsed.data.range.preset,
    );
    return NextResponse.json(normalized);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load TikTok organic analytics';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
