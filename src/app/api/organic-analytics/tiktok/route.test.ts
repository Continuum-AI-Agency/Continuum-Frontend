import { beforeEach, describe, expect, it, mock } from 'bun:test';

// A realistic slice of what TikTok's Display API returns for
// user/info/ + video/list/, as the fetch-tiktok-data edge function forwards it.
const EDGE_RESPONSE = {
  platform: 'tiktok',
  externalAccountId: '-000gMzG46Rj3m4r0BsaWICx27rn7BSIxNZM',
  userInfo: {
    open_id: '-000gMzG46Rj3m4r0BsaWICx27rn7BSIxNZM',
    display_name: 'Continuum AI',
    username: 'continuumai',
    avatar_url: 'https://p16.tiktokcdn.com/avatar.jpeg',
    bio_description: 'Marketing intelligence for modern brands.',
    profile_deep_link: 'https://www.tiktok.com/@continuumai',
    is_verified: true,
    follower_count: 12300,
    following_count: 184,
    likes_count: 4100,
    video_count: 27,
  },
  videos: [
    {
      id: '7300000000000000001',
      create_time: 1_760_000_000,
      cover_image_url: 'https://p16.tiktokcdn.com/cover.jpeg',
      share_url: 'https://www.tiktok.com/@continuumai/video/7300000000000000001',
      video_description: 'How we cut reporting time in half',
      like_count: 120,
      comment_count: 8,
      share_count: 3,
      view_count: 5400,
    },
  ],
};

const state: { invoked: unknown[]; edgeData: unknown; edgeError: unknown } = {
  invoked: [],
  edgeData: EDGE_RESPONSE,
  edgeError: null,
};

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
        error: null,
      }),
    },
    functions: {
      invoke: async (name: string, options: unknown) => {
        state.invoked.push({ name, options });
        return { data: state.edgeData, error: state.edgeError };
      },
    },
  }),
}));

const { POST } = await import('./route');

function buildRequest() {
  return new Request('http://localhost/api/organic-analytics/tiktok', {
    method: 'POST',
    body: JSON.stringify({
      brandId: 'b69ecf70-25d7-4909-a88e-41efc95c0850',
      integrationAccountId: 'acct-1',
      range: { preset: 'last_7d' },
    }),
  });
}

beforeEach(() => {
  state.invoked = [];
  state.edgeData = EDGE_RESPONSE;
  state.edgeError = null;
});

describe('POST /api/organic-analytics/tiktok', () => {
  // Regression: the route previously dropped every user.info.profile field
  // during normalization, so the scopes we request had no surface in the UI.
  it('carries the account profile through normalization', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accountProfile).toEqual({
      displayName: 'Continuum AI',
      username: 'continuumai',
      avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
      bio: 'Marketing intelligence for modern brands.',
      profileUrl: 'https://www.tiktok.com/@continuumai',
      isVerified: true,
    });
  });

  it('still reports the account stats alongside the profile', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(body.metrics).toMatchObject({
      subscribers: 12300,
      following: 184,
      likes: 4100,
      videoCount: 27,
      views: 5400,
      comments: 8,
      shares: 3,
    });
  });

  it('omits the account profile when the edge returned no user info', async () => {
    state.edgeData = { ...EDGE_RESPONSE, userInfo: null };

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.accountProfile).toBeUndefined();
    // Videos still normalize, so the account stays usable without a profile.
    expect(body.posts).toHaveLength(1);
  });

  it('tolerates a user info payload missing the optional profile fields', async () => {
    state.edgeData = {
      ...EDGE_RESPONSE,
      userInfo: { open_id: 'abc', display_name: 'Continuum AI', follower_count: 5 },
    };

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(body.accountProfile).toEqual({
      displayName: 'Continuum AI',
      username: null,
      avatarUrl: null,
      bio: null,
      profileUrl: null,
      isVerified: null,
    });
  });
});
