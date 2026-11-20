/**
 * End-to-end bench of app localization as a person sees it: a real session in a real browser on
 * a deployed Frontend build, the real Backend and Supabase answering, a real brand's data drawn.
 *
 * For each UI language (en, pt-BR, es) it picks the language in Settings the way a person does,
 * then asserts the outcome at every boundary it crosses:
 *   - Auth: `user_metadata.ui_locale` holds the choice (read back with the service role);
 *   - a new device signing in by magic link opens in that language (the account drives it);
 *   - the navigation reads the catalog's own words for that language;
 *   - each main route renders in it: `<html lang>`, the Backend answered, no next-intl or
 *     hydration error in the console, no page error, no leaked message key, and no long string
 *     from another language's catalog on screen.
 *
 * Writes only the bench user's `ui_locale` (restored to what it was) and a per-session brand pin.
 *
 * A Vercel preview origin is not on the Backend's CORS allowlist (`App/cors.ts`), so for a host
 * that is not, the bench answers the browser's CORS preflight and copies the allow headers onto
 * the real Backend response. Every request still reaches the real Backend; the run says so.
 *
 *   I18N_BENCH_HOST=<host> bun run i18n:release:e2e:bench
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      I18N_BENCH_HOST (required), optional BENCH_EMAIL (default bench@trycontinuum.ai),
 *      I18N_BENCH_BRAND (default StarCraft: Remastered), I18N_BENCH_API
 *      (default https://api.trycontinuum.ai), VERCEL_AUTOMATION_BYPASS_SECRET for a protected
 *      preview, PLAYWRIGHT_EXECUTABLE.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { type BrowserContext, chromium, type Page } from 'playwright';
import { navigationMessageKeys } from '../src/components/navigation/messageKeys';
import { mintSessionBundleForEmail, pinSessionBrand } from './support/auth';
import { createBenchRecorder } from './support/benchRecorder';

const HOST = process.env.I18N_BENCH_HOST;
if (!HOST) throw new Error('I18N_BENCH_HOST is required (the deployed Frontend host)');
const ORIGIN = `https://${HOST}`;
const API = process.env.I18N_BENCH_API ?? 'https://api.trycontinuum.ai';
const EMAIL = process.env.BENCH_EMAIL ?? 'bench@trycontinuum.ai';
const BRAND = process.env.I18N_BENCH_BRAND ?? 'b17d8151-a9b9-4579-b1d2-7e8f01c2e9dc';
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const ALLOWED_ORIGINS = ['https://app.trycontinuum.ai', 'https://app.beta.trycontinuum.ai'];
const RELAY_CORS = !ALLOWED_ORIGINS.includes(ORIGIN);
const ROUTES = ['/dashboard', '/organic', '/scale', '/library', '/forge', '/ai-studio'];
// English last: an account with no preference already reads English, and choosing the
// language already shown saves nothing, so English first would prove nothing about the save.
const LOCALES = ['pt-BR', 'es', 'en'] as const;
type UiLocale = (typeof LOCALES)[number];
const LANGUAGE_NAMES: Record<UiLocale, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
  es: 'Español',
};
const SETTLE_MS = 8_000;
const INTL_CONSOLE =
  /hydration|hydrating|MISSING_MESSAGE|IntlError|INVALID_MESSAGE|FORMATTING_ERROR/i;
// The codemod's catalog keys: a slug and a 7-hex hash, or `m_` and 10 hex.
const LEAKED_KEY = /\b(?:[a-z0-9]+_){2,}[0-9a-f]{7}\b|\bm_[0-9a-f]{10}\b/;

const recorder = createBenchRecorder('i18n-release', [
  `host: ${HOST}`,
  `api: ${API}`,
  RELAY_CORS ? 'CORS: relayed by the bench (origin not on the Backend allowlist)' : 'CORS: real',
]);
const check = (step: string, passed: boolean, detail?: string): void =>
  recorder.record(step, passed ? 'PASS' : 'FAIL', detail);

const messagesDir = path.resolve(import.meta.dir, '../messages');
const catalog = (namespace: string, locale: UiLocale): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(messagesDir, namespace, `${locale}.json`), 'utf8'));
const longStrings = (locale: UiLocale): Set<string> =>
  new Set(
    readdirSync(messagesDir)
      .filter((namespace) => !namespace.startsWith('client-'))
      .flatMap((namespace) => {
        try {
          return Object.values(catalog(namespace, locale));
        } catch {
          return [];
        }
      })
      .filter((value): value is string => typeof value === 'string')
      .filter((value) => value.length >= 40 && !/[{}<>]/.test(value)),
  );
const catalogStrings = Object.fromEntries(LOCALES.map((l) => [l, longStrings(l)])) as Record<
  UiLocale,
  Set<string>
>;
function foreignStrings(text: string, locale: UiLocale): string[] {
  const own = catalogStrings[locale];
  return LOCALES.filter((other) => other !== locale).flatMap((other) =>
    [...catalogStrings[other]].filter((value) => !own.has(value) && text.includes(value)),
  );
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type Browser = Awaited<ReturnType<typeof chromium.launch>>;
const newContext = (browser: Browser, cookies: { name: string; value: string }[] = []) =>
  browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: BYPASS
      ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'samesitenone' }
      : undefined,
    storageState: {
      origins: [],
      cookies: cookies.map((cookie) => ({
        ...cookie,
        domain: HOST as string,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax' as const,
      })),
    },
  });

/** The Settings session: a minted session pinned to the bench brand. */
async function openContext(browser: Browser) {
  const bundle = await mintSessionBundleForEmail(EMAIL);
  await pinSessionBrand(bundle.accessToken, BRAND);
  const context = await newContext(browser, bundle.state.cookies);
  if (RELAY_CORS) await relayCors(context);
  return { context, userId: bundle.userId };
}

/**
 * A new device: no cookies at all, signed in through the deployed `/auth/confirm` with a real
 * magic-link token, as a person does. A minted session would not do: the account language
 * rides in the JWT, and a token minted before the change carries the old one.
 */
async function signInFresh(browser: Browser) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) throw new Error(`generateLink failed: ${link.error?.message}`);
  const context = await newContext(browser);
  if (RELAY_CORS) await relayCors(context);
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  if (new URL(page.url()).pathname.startsWith('/login'))
    throw new Error(`Magic-link sign-in landed on ${page.url()}`);
  return { context, page };
}

async function relayCors(context: BrowserContext) {
  const allow = {
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      'Content-Type,Accept,Authorization,Last-Event-ID,X-Supabase-Schema,Mcp-Session-Id',
    'access-control-expose-headers': 'Retry-After,Content-Disposition',
  };
  await context.route(`${API}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: allow });
    const {
      'x-vercel-protection-bypass': _b,
      'x-vercel-set-bypass-cookie': _c,
      ...headers
    } = route.request().headers();
    const response = await route.fetch({ headers });
    return route.fulfill({ response, headers: { ...response.headers(), ...allow } });
  });
}

function watch(page: Page) {
  const seen = { intl: [] as string[], pageErrors: [] as string[], api: [] as number[] };
  page.on('console', (message) => {
    if (INTL_CONSOLE.test(message.text())) seen.intl.push(message.text().slice(0, 160));
  });
  page.on('pageerror', (error) => seen.pageErrors.push(error.message.slice(0, 160)));
  page.on('response', (response) => {
    if (response.url().startsWith(API) && response.request().method() !== 'OPTIONS')
      seen.api.push(response.status());
  });
  return seen;
}

async function htmlLang(page: Page): Promise<string | null> {
  return page.locator('html').getAttribute('lang');
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE,
});
const before = await admin.auth.admin.getUserById((await mintSessionBundleForEmail(EMAIL)).userId);
const userId = before.data.user?.id;
if (!userId) throw new Error(`No Auth user for ${EMAIL}`);
const originalLocale = (before.data.user?.user_metadata?.ui_locale as string | undefined) ?? null;

try {
  const { context } = await openContext(browser);
  const settings = await context.newPage();
  for (const locale of LOCALES) {
    await settings.goto(`${ORIGIN}/settings?section=profile`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await settings
      .getByRole('radiogroup', { name: /^(Language|Idioma)$/ })
      .getByRole('radio', { name: LANGUAGE_NAMES[locale], exact: true })
      .click();
    await settings.waitForFunction((want) => document.documentElement.lang === want, locale, {
      timeout: 30_000,
    });
    check(`${locale}: Settings switches the page language`, (await htmlLang(settings)) === locale);
    const stored = (await admin.auth.admin.getUserById(userId)).data.user?.user_metadata?.ui_locale;
    check(`${locale}: the choice is saved on the account`, stored === locale, String(stored));

    // A new device carries no NEXT_LOCALE cookie: only the account can pick the language.
    const fresh = await signInFresh(browser);
    const page = fresh.page;
    const navLabel = catalog('navigation', locale)[navigationMessageKeys.Settings] as string;
    for (const route of ROUTES) {
      const seen = watch(page);
      const response = await page.goto(`${ORIGIN}${route}`, {
        waitUntil: 'load',
        timeout: 90_000,
      });
      await page.waitForTimeout(SETTLE_MS);
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const label = `${locale} ${route}`;
      check(`${label}: page answered`, (response?.status() ?? 0) < 400, String(response?.status()));
      check(`${label}: <html lang> is ${locale}`, (await htmlLang(page)) === locale);
      check(
        `${label}: navigation in ${locale}`,
        text.includes(navLabel) ||
          (await page.locator('a[href="/settings"]').first().textContent())?.includes(navLabel) ===
            true,
        navLabel,
      );
      check(
        `${label}: the Backend answered`,
        seen.api.some((status) => status < 400),
        seen.api.join(','),
      );
      check(`${label}: no intl/hydration console error`, seen.intl.length === 0, seen.intl[0]);
      check(`${label}: no page error`, seen.pageErrors.length === 0, seen.pageErrors[0]);
      const leaked = text.match(LEAKED_KEY)?.[0];
      check(`${label}: no message key on screen`, !leaked, leaked);
      const foreign = foreignStrings(text, locale);
      check(`${label}: no other language's copy`, foreign.length === 0, foreign[0]?.slice(0, 80));
      page.removeAllListeners('console');
      page.removeAllListeners('pageerror');
      page.removeAllListeners('response');
    }
    await page.screenshot({ path: `/tmp/i18n-release-${locale}-ai-studio.png` });
    await fresh.context.close();
  }
  await context.close();
} finally {
  await admin.auth.admin.updateUserById(userId, { user_metadata: { ui_locale: originalLocale } });
  await browser.close();
}
recorder.print();
process.exit(recorder.failed() ? 1 : 0);
