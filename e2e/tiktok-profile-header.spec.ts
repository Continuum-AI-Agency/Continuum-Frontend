import { expect, test } from '@playwright/test';

// Proves the TikTok scope->surface chain that TikTok's app review turns on:
// real login -> real /organic page -> real OrganicMetricsDashboard -> the
// account profile header actually painting user.info.basic + user.info.profile
// fields on screen.
//
// COVERAGE GAP (deliberate, and the only one): the live TikTok Display API call
// is stubbed at /api/organic-analytics/tiktok. Reaching it needs an access token
// from a TikTok account enrolled as a sandbox target user, which cannot exist on
// the local stack (edge functions run without TikTok secrets locally). The
// stubbed payload is a verbatim-shaped Display API response, and the route's own
// normalization of that shape is covered separately by
// src/app/api/organic-analytics/tiktok/route.test.ts. Everything downstream of
// the HTTP response here is the real product.
//
// Prereqs: local stack hydrated + a seeded TikTok integration on the local brand.
//   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
//   bun run tiktok:profile:e2e:bench

const EMAIL = process.env.E2E_PASSWORD_EMAIL ?? 'local@continuum.test';
const PASSWORD = process.env.E2E_PASSWORD_SECRET ?? 'localdev123';

const TIKTOK_ANALYTICS = {
  platform: 'tiktok',
  accountId: '-000gMzG46Rj3m4r0BsaWICx27rn7BSIxNZM',
  integrationAccountId: '-000gMzG46Rj3m4r0BsaWICx27rn7BSIxNZM',
  range: { preset: 'last_7d', since: '', until: '' },
  accountProfile: {
    displayName: 'Continuum AI',
    username: 'continuumai',
    avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
    bio: 'Marketing intelligence for modern brands.',
    profileUrl: 'https://www.tiktok.com/@continuumai',
    isVerified: true,
  },
  metrics: {
    subscribers: 12300,
    following: 184,
    likes: 4100,
    videoCount: 27,
    views: 5400,
    comments: 8,
    shares: 3,
  },
  comparison: null,
  posts: [
    {
      id: '7300000000000000001',
      caption: 'How we cut reporting time in half',
      mediaUrl: 'https://p16.tiktokcdn.com/cover.jpeg',
      permalink: 'https://www.tiktok.com/@continuumai/video/7300000000000000001',
      timestamp: '2025-10-09T07:33:20.000Z',
      mediaType: 'VIDEO',
      metrics: { likes: 120, comments: 8, shares: 3, views: 5400 },
    },
  ],
  warnings: [],
};

test('TikTok account profile header renders every requested scope on the real metrics surface', async ({
  page,
}) => {
  await page.route('**/api/organic-analytics/tiktok', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TIKTOK_ANALYTICS),
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: /^password login$/i }).click();
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

  await page.goto('/organic');
  await page.locator('[data-tour-id="organic-metrics-tab"]').click();

  const header = page.locator('section[aria-label="TikTok account profile"]');
  await expect(header).toBeVisible({ timeout: 30_000 });

  // user.info.basic — display name + avatar.
  await expect(header.getByText('Continuum AI')).toBeVisible();
  await expect(header.locator('img')).toHaveAttribute(
    'src',
    'https://p16.tiktokcdn.com/avatar.jpeg',
  );

  // user.info.profile — username, verified badge, bio, profile deep link.
  await expect(header.getByText('@continuumai')).toBeVisible();
  await expect(header.getByLabel('Verified account')).toBeVisible();
  await expect(header.getByText('Marketing intelligence for modern brands.')).toBeVisible();
  await expect(header.getByRole('link', { name: /view on tiktok/i })).toHaveAttribute(
    'href',
    'https://www.tiktok.com/@continuumai',
  );

  // user.info.stats — the pre-existing KPI tiles must still paint alongside it.
  await expect(page.getByText('12.3K').or(page.getByText('12,300')).first()).toBeVisible();

  if (process.env.TIKTOK_PROFILE_BENCH_SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.TIKTOK_PROFILE_BENCH_SCREENSHOT_DIR}/tiktok-profile-header.png`,
      fullPage: true,
    });
  }
});
