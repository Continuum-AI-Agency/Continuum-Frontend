import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Runs against the local Supabase stack: GoTrue sends the real magic-link template
// (supabase/templates/magic_link.html) into Mailpit, and the specs read it back.
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const BENCH_EMAIL = 'local@continuum.test';
const DASHBOARD = '[data-tour-id="dashboard-overview"]';

type MailpitSummary = { ID: string; Created: string };
type MailpitMessage = { HTML: string; Text: string };

async function readSignInEmail(sentAfter: number): Promise<{ link: URL; code: string }> {
  const query = encodeURIComponent(`to:"${BENCH_EMAIL}"`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    const fresh = messages.find((m) => Date.parse(m.Created) >= sentAfter);
    if (fresh) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${fresh.ID}`)
      ).json()) as MailpitMessage;
      const href = message.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      const code = message.Text.match(/\b(\d{6,10})\b/)?.[1];
      if (!href || !code) {
        throw new Error(`Sign-in email is missing its link or code:\n${message.Text}`);
      }
      return { link: new URL(href.replaceAll('&amp;', '&')), code };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email reached Mailpit for ${BENCH_EMAIL}.`);
}

test('a magic link signs in from a fresh browser session', async ({ browser, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !baseURL) {
    throw new Error('Local Supabase and PLAYWRIGHT_BASE_URL are required for this bench.');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: BENCH_EMAIL,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`Could not issue a real Auth link: ${error?.message ?? 'missing token hash'}`);
  }

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const callback = new URL('/auth/callback?next=/dashboard', baseURL);
    const confirm = new URL('/auth/confirm', baseURL);
    confirm.searchParams.set('token_hash', data.properties.hashed_token);
    confirm.searchParams.set('redirect_to', callback.toString());

    await page.goto(confirm.toString());
    await expect(page).toHaveURL(new URL('/dashboard', baseURL).toString());
    await expect(page.locator(DASHBOARD)).toBeVisible();
  } finally {
    await context.close();
  }
});

// Bug 378: the link is single-use, so a second open (in-app browser then the real
// one, a double click, an email replaced by a resend) used to dead-end on a generic
// "Authentication failed". The emailed code signs in on the device that asked.
test('the emailed code signs in, and the spent link explains itself', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('PLAYWRIGHT_BASE_URL is required for this bench.');

  const requester = await browser.newContext();
  const otherBrowser = await browser.newContext();
  try {
    const page = await requester.newPage();
    await page.goto('/login');
    const sentAfter = Date.now() - 1000;
    await page.getByLabel('Email address').fill(BENCH_EMAIL);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const { link, code } = await readSignInEmail(sentAfter);
    expect(link.pathname).toBe('/auth/confirm');
    expect(link.searchParams.get('type')).toBe('email');
    expect(link.searchParams.get('token_hash')).toBeTruthy();
    // The email's host is the project's SiteURL; the bench serves the same route locally.
    const localLink = new URL(`${link.pathname}${link.search}`, baseURL);

    await page.getByLabel('Code from the email').fill(code);
    await page.getByRole('button', { name: 'Sign in with code' }).click();
    await expect(page).toHaveURL(new URL('/dashboard', baseURL).toString());
    await expect(page.locator(DASHBOARD)).toBeVisible();

    // The code spent the token. Reopening the link where the session lives still lands.
    await page.goto(localLink.toString());
    await expect(page).toHaveURL(new URL('/dashboard', baseURL).toString());
    await expect(page.locator(DASHBOARD)).toBeVisible();

    // Anywhere else, the spent link says what happened instead of "Authentication failed".
    const elsewhere = await otherBrowser.newPage();
    await elsewhere.goto(localLink.toString());
    await expect(elsewhere).toHaveURL(/\/login\?error=link_used$/);
    await expect(elsewhere.getByText('already used or replaced by a newer email')).toBeVisible();
  } finally {
    await requester.close();
    await otherBrowser.close();
  }
});
