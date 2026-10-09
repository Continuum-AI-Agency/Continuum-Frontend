import type { Locator, Page, Request, Response } from '@playwright/test';

// The L1 oracle of the Performance+ campaign (docs/perfplus-campaign/01-method.md, "Cinco
// carriles" → L1 · UI funcional), as a helper any Playwright spec attaches to a page:
//
//   * zero `console.error` on the page (a short allowlist of third-party noise, each entry
//     with its reason — never a product line);
//   * zero responses ≥ 500 and zero failed requests to OUR origins — the page's own origin,
//     the local Backend on :4000 and the Supabase project (REST, auth and edge functions);
//   * every click helper proves the click DID something: a DOM mutation or a network
//     request within N ms (`clickExpectingEffect`);
//   * the page shows a DEFINED state — content, a named empty state or a named error state —
//     never a blank area (`expectDefinedState`).
//
// The pure parts (origin classification, the allowlist, the report reducer and the failure
// formatter) have no Playwright runtime dependency so `bun test` covers them in
// `l1Invariants.test.ts`; only TYPES are imported from @playwright/test. The browser-facing
// parts (`attachL1`, `clickExpectingEffect`, `expectDefinedState`) are exercised by the
// bench itself (`perfplus-l1.bench.spec.ts`).

/* ------------------------------------------------------------------------- */
/* Origins                                                                    */
/* ------------------------------------------------------------------------- */

/** The hosts whose failures are OURS: the local Backend and the Supabase project. The page's
 *  own origin is added per page by `attachL1`. */
export const OWN_HOST_PATTERNS: readonly RegExp[] = [
  /^(localhost|127\.0\.0\.1|\[::1\]):4000$/,
  /\.supabase\.co$/,
];

/** Is `url` served by one of our origins? `pageOrigin` is the origin the browser opened. */
export function isOwnOrigin(url: string, pageOrigin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin === pageOrigin) return true;
  return OWN_HOST_PATTERNS.some((pattern) => pattern.test(parsed.host));
}

/* ------------------------------------------------------------------------- */
/* Allowlists — every entry carries the reason it is noise and not a finding  */
/* ------------------------------------------------------------------------- */

export type AllowlistEntry = { pattern: RegExp; reason: string };

/** `console.error` lines that are third-party noise, not product behaviour. Keep this SHORT:
 *  an entry that matches a product line turns a finding into silence. */
export const CONSOLE_ERROR_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    pattern: /Download the React DevTools/,
    reason: 'React dev build banner; printed by React itself, not by product code',
  },
  {
    pattern: /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
    reason:
      'Chromium reports this benign layout-loop notice as an error; it carries no stack and no product frame',
  },
];

/** Failed requests that the PAGE initiated the failure of (cancellation), not the server. */
export const FAILED_REQUEST_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    pattern: /^net::ERR_ABORTED$/,
    reason:
      'the page aborted the request itself (navigation away, AbortController on unmount, React Query cancel); nothing answered badly',
  },
];

/** The allowlist entry that excuses `text`, or null when it is a real finding. */
export function matchAllowlist(
  text: string,
  allowlist: readonly AllowlistEntry[],
): AllowlistEntry | null {
  return allowlist.find((entry) => entry.pattern.test(text)) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Events and the report                                                      */
/* ------------------------------------------------------------------------- */

export type L1ConsoleEvent = { kind: 'console'; text: string; location: string };
export type L1PageErrorEvent = { kind: 'pageerror'; message: string };
export type L1ResponseEvent = { kind: 'response'; url: string; status: number; method: string };
export type L1RequestFailedEvent = {
  kind: 'requestfailed';
  url: string;
  method: string;
  errorText: string;
};
export type L1Event = L1ConsoleEvent | L1PageErrorEvent | L1ResponseEvent | L1RequestFailedEvent;

export type L1Report = {
  /** `console.error` lines and uncaught page errors, minus the allowlist. */
  consoleErrors: string[];
  /** Responses with status ≥ 500 from our origins. */
  serverErrors: string[];
  /** Requests to our origins that never got a response, minus the allowlist. */
  failedRequests: string[];
  /** What the allowlists excused, with the reason — visible, never silent. */
  ignored: string[];
};

const shortUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}${parsed.search.slice(0, 60)}`;
  } catch {
    return url.slice(0, 160);
  }
};

/** Reduces the raw events a page emitted into the report. Pure. */
export function summarizeL1(events: readonly L1Event[], pageOrigin: string): L1Report {
  const report: L1Report = { consoleErrors: [], serverErrors: [], failedRequests: [], ignored: [] };
  for (const event of events) {
    switch (event.kind) {
      case 'console': {
        const line = `console.error ${event.text.slice(0, 300)}${event.location ? ` (${event.location})` : ''}`;
        const excused = matchAllowlist(event.text, CONSOLE_ERROR_ALLOWLIST);
        if (excused) report.ignored.push(`${line} — allowlisted: ${excused.reason}`);
        else report.consoleErrors.push(line);
        break;
      }
      case 'pageerror':
        report.consoleErrors.push(`pageerror ${event.message.slice(0, 300)}`);
        break;
      case 'response':
        if (event.status >= 500 && isOwnOrigin(event.url, pageOrigin)) {
          report.serverErrors.push(`${event.status} ${event.method} ${shortUrl(event.url)}`);
        }
        break;
      case 'requestfailed': {
        if (!isOwnOrigin(event.url, pageOrigin)) break;
        const line = `${event.errorText} ${event.method} ${shortUrl(event.url)}`;
        const excused = matchAllowlist(event.errorText, FAILED_REQUEST_ALLOWLIST);
        if (excused) report.ignored.push(`${line} — allowlisted: ${excused.reason}`);
        else report.failedRequests.push(line);
        break;
      }
    }
  }
  return report;
}

export type L1Invariant = 'console-errors' | 'server-errors' | 'failed-requests';

export type L1Failure = { invariant: L1Invariant; evidence: string };

/** One failure per broken invariant, each carrying its first evidence line and the count. */
export function l1Failures(report: L1Report): L1Failure[] {
  const failures: L1Failure[] = [];
  const push = (invariant: L1Invariant, lines: string[]) => {
    if (lines.length === 0) return;
    const more = lines.length > 1 ? ` (+${lines.length - 1} more)` : '';
    failures.push({ invariant, evidence: `${lines[0]}${more}` });
  };
  push('console-errors', report.consoleErrors);
  push('server-errors', report.serverErrors);
  push('failed-requests', report.failedRequests);
  return failures;
}

/** The message a broken surface fails with: surface, viewport, invariant, evidence — one line
 *  per invariant so the list reporter names everything at once. */
export function formatL1Failures(
  label: string,
  failures: readonly { invariant: string; evidence: string }[],
): string {
  return failures.map((f) => `[${label}] ${f.invariant}: ${f.evidence}`).join('\n');
}

/** Throws when the report carries any finding. `label` names the surface and viewport. */
export function expectL1Clean(report: L1Report, label = 'page'): void {
  const failures = l1Failures(report);
  if (failures.length > 0) throw new Error(formatL1Failures(label, failures));
}

/* ------------------------------------------------------------------------- */
/* attachL1                                                                   */
/* ------------------------------------------------------------------------- */

export type L1Handle = {
  /** The report of everything observed since attach (or since the last `reset`). */
  report(): L1Report;
  /** Drops the events seen so far — between two surfaces on the same page. */
  reset(): void;
  /** Stops listening. */
  detach(): void;
};

/** Listens to the page's console, uncaught errors, responses and failed requests. The page's
 *  origin is read at report time from `page.url()`, so a page attached before its first
 *  navigation still classifies its own requests correctly. */
export function attachL1(page: Page, options: { pageOrigin?: string } = {}): L1Handle {
  let events: L1Event[] = [];

  const onConsole = (message: {
    type(): string;
    text(): string;
    location(): { url: string; lineNumber: number };
  }) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    events.push({
      kind: 'console',
      text: message.text(),
      location: location.url ? `${shortUrl(location.url)}:${location.lineNumber}` : '',
    });
  };
  const onPageError = (error: Error) => {
    events.push({ kind: 'pageerror', message: error.message });
  };
  const onResponse = (response: Response) => {
    events.push({
      kind: 'response',
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  };
  const onRequestFailed = (request: Request) => {
    events.push({
      kind: 'requestfailed',
      url: request.url(),
      method: request.method(),
      errorText: request.failure()?.errorText ?? 'unknown',
    });
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const pageOrigin = () => {
    if (options.pageOrigin) return options.pageOrigin;
    try {
      return new URL(page.url()).origin;
    } catch {
      return '';
    }
  };

  return {
    report: () => summarizeL1(events, pageOrigin()),
    reset: () => {
      events = [];
    },
    detach: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
    },
  };
}

/* ------------------------------------------------------------------------- */
/* clickExpectingEffect                                                       */
/* ------------------------------------------------------------------------- */

declare global {
  interface Window {
    __l1Mutations?: number;
    __l1Observer?: MutationObserver;
  }
}

const DEFAULT_EFFECT_WINDOW_MS = 2000;

/** Installs (once per document) a MutationObserver that counts mutations, and zeroes it. */
async function armMutationCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__l1Mutations = 0;
    if (!window.__l1Observer) {
      window.__l1Observer = new MutationObserver((records) => {
        window.__l1Mutations = (window.__l1Mutations ?? 0) + records.length;
      });
      window.__l1Observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
  });
}

/** Mutations since the counter was armed; `null` when the document is gone (a navigation —
 *  itself an effect). */
async function readMutationCount(page: Page): Promise<number | null> {
  try {
    const count = await page.evaluate(() => window.__l1Mutations);
    // A fresh document after navigation has no counter — the navigation IS the effect.
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

export type ClickEffect = { effect: 'mutation' | 'request' | 'navigation'; afterMs: number };

/** Clicks `locator` and proves the click did something: a DOM mutation, a network request or
 *  a navigation within `within` ms (default 2000). Throws naming the invariant otherwise.
 *  `label` names the control in the error. */
export async function clickExpectingEffect(
  locator: Locator,
  options: { within?: number; label?: string } = {},
): Promise<ClickEffect> {
  const page = locator.page();
  const within = options.within ?? DEFAULT_EFFECT_WINDOW_MS;
  const label =
    options.label ??
    (await locator
      .evaluate((el) => el.textContent?.trim().slice(0, 60) ?? '')
      .catch(() => 'control'));

  await armMutationCounter(page);
  let requests = 0;
  const onRequest = () => {
    requests += 1;
  };
  page.on('request', onRequest);
  const startedAt = Date.now();
  try {
    await locator.click();
    while (Date.now() - startedAt < within) {
      if (requests > 0) return { effect: 'request', afterMs: Date.now() - startedAt };
      const mutations = await readMutationCount(page);
      if (mutations === null) return { effect: 'navigation', afterMs: Date.now() - startedAt };
      if (mutations > 0) return { effect: 'mutation', afterMs: Date.now() - startedAt };
      await page.waitForTimeout(50);
    }
  } finally {
    page.off('request', onRequest);
  }
  throw new Error(
    `click-effect: "${label}" produced no DOM mutation and no network request within ${within}ms`,
  );
}

/* ------------------------------------------------------------------------- */
/* expectDefinedState                                                         */
/* ------------------------------------------------------------------------- */

/** Named EMPTY states, derived from the components under test:
 *  - `data-testid` ending in `-empty` (Optimizer: `anchor-empty`, `tiktok-empty`,
 *    `wizard-platform-empty`; Canvas: `canvas-record-empty`), `jaina-empty-state`;
 *  - the headlines the shared `EmptyState` primitive prints on these surfaces, because the
 *    primitive itself carries no marker (`src/components/shared/state/EmptyState.tsx`). */
export const EMPTY_STATE_SELECTORS: readonly string[] = [
  '[data-testid$="-empty"]',
  '[data-testid="jaina-empty-state"]',
];
export const EMPTY_STATE_HEADLINES: readonly string[] = [
  'No active or paused campaigns', // CampaignsTab
  'Nothing else in the queue.', // approvals/QueueList
  'No actions match.', // approvals/QueueTable
  'Select an Ad Account', // jaina/JainaEmptyState
  'No portfolios on this ad account', // optimizer onboarding notice
];

/** Named ERROR states: `role="alert"` (shared `ErrorRetryState`, PaidMediaDashboard, Campaigns,
 *  Canvas record bar), the Optimizer's `*-error` / `*-unavailable` / `*-blocked` test ids and
 *  `optimizer-refresh-failed`, and the `/scale` route error boundary (`error.tsx`). */
export const ERROR_STATE_SELECTORS: readonly string[] = [
  '[role="alert"]',
  '[data-testid$="-error"]',
  '[data-testid$="-unavailable"]',
  '[data-testid$="-blocked"]',
  '[data-testid="optimizer-refresh-failed"]',
];
export const ERROR_STATE_HEADLINES: readonly string[] = [
  'Something went wrong', // app/(post-auth)/scale/error.tsx
];

/** LOADING markers the page must leave before its state counts: `aria-busy` (the Optimizer
 *  skeleton, the Campaigns table), the `Skeleton` primitive (`data-slot="skeleton"`), a
 *  `role="status"` that SAYS it is loading, and hand-rolled skeleton pulses (JainaChatSurface).
 *  A pulse only counts when it is a BAR, not a dot: the Jaina header's live indicator is a 6px
 *  `animate-pulse` circle that never leaves (JainaHeader.tsx), so a pulse narrower than
 *  `PULSE_MIN_WIDTH_PX` is an indicator, not a skeleton. */
export const LOADING_SELECTORS: readonly string[] = [
  '[aria-busy="true"]',
  '[data-slot="skeleton"]',
];
export const LOADING_STATUS_TEXT = /loading|cargando/i;
export const PULSE_SELECTOR = '.animate-pulse';
export const PULSE_MIN_WIDTH_PX = 24;

/** Fewer visible characters than this in the main region is a blank area, not content. */
export const MIN_CONTENT_CHARS = 40;

export type DefinedState =
  | { kind: 'content'; chars: number }
  | { kind: 'empty'; name: string }
  | { kind: 'error'; name: string };

type DefinedStateProbe = {
  loading: number;
  chars: number;
  empty: string | null;
  error: string | null;
};

function probeDefinedState(page: Page): Promise<DefinedStateProbe> {
  return page.evaluate(
    ({
      emptySelectors,
      emptyHeadlines,
      errorSelectors,
      errorHeadlines,
      loadingSelectors,
      loadingStatusText,
      pulseSelector,
      pulseMinWidth,
    }) => {
      const isVisible = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const style = window.getComputedStyle(el);
        return style.visibility !== 'hidden' && style.display !== 'none';
      };
      const root = document.querySelector('main') ?? document.body;
      const visibleText = (el: Element): string => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let text = '';
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || !isVisible(parent)) continue;
          text += `${node.textContent ?? ''} `;
        }
        return text.replace(/\s+/g, ' ').trim();
      };
      const firstVisible = (selectors: string[]): Element | null => {
        for (const selector of selectors) {
          for (const el of Array.from(root.querySelectorAll(selector))) {
            if (isVisible(el)) return el;
          }
        }
        return null;
      };
      const nameOf = (el: Element): string =>
        el.getAttribute('data-testid') ?? el.getAttribute('role') ?? el.tagName.toLowerCase();
      const text = visibleText(root);
      const headline = (headlines: string[]) => headlines.find((h) => text.includes(h)) ?? null;
      const emptyEl = firstVisible([...emptySelectors]);
      const errorEl = firstVisible([...errorSelectors]);
      const loadingMarkers = [...loadingSelectors].reduce(
        (count, selector) =>
          count + Array.from(root.querySelectorAll(selector)).filter(isVisible).length,
        0,
      );
      const loadingStatuses = Array.from(root.querySelectorAll('[role="status"]')).filter(
        (el) => isVisible(el) && new RegExp(loadingStatusText, 'i').test(el.textContent ?? ''),
      ).length;
      const skeletonPulses = Array.from(root.querySelectorAll(pulseSelector)).filter(
        (el) =>
          isVisible(el) &&
          el.getBoundingClientRect().width >= pulseMinWidth &&
          (el.textContent ?? '').trim().length === 0,
      ).length;
      const loading = loadingMarkers + loadingStatuses + skeletonPulses;
      return {
        loading,
        chars: text.length,
        empty: emptyEl ? nameOf(emptyEl) : headline([...emptyHeadlines]),
        error: errorEl
          ? `${nameOf(errorEl)}: ${(errorEl.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)}`
          : headline([...errorHeadlines]),
      };
    },
    {
      emptySelectors: EMPTY_STATE_SELECTORS,
      emptyHeadlines: EMPTY_STATE_HEADLINES,
      errorSelectors: ERROR_STATE_SELECTORS,
      errorHeadlines: ERROR_STATE_HEADLINES,
      loadingSelectors: LOADING_SELECTORS,
      // A RegExp does not survive page.evaluate serialisation; its source does.
      loadingStatusText: LOADING_STATUS_TEXT.source,
      pulseSelector: PULSE_SELECTOR,
      pulseMinWidth: PULSE_MIN_WIDTH_PX,
    },
  );
}

/** Asserts the page shows a defined state — content, a named empty state or a named error
 *  state — once its loading markers have settled. Throws naming the invariant
 *  (`defined-state`) with what was seen instead. Returns the state so the caller can record
 *  WHICH defined state it was: an error state satisfies this invariant and is still worth a
 *  note. */
export async function expectDefinedState(
  page: Page,
  options: { label?: string; settleMs?: number } = {},
): Promise<DefinedState> {
  const label = options.label ?? 'page';
  const settleMs = options.settleMs ?? 60_000;
  const startedAt = Date.now();
  let probe = await probeDefinedState(page);
  // A page that is still loading has no state yet. Wait for the markers to go, then for a
  // moment of stability so a skeleton swapped for content is read after the swap.
  while (Date.now() - startedAt < settleMs) {
    probe = await probeDefinedState(page);
    if (probe.loading === 0 && (probe.chars >= MIN_CONTENT_CHARS || probe.empty || probe.error)) {
      break;
    }
    await page.waitForTimeout(250);
  }
  if (probe.error) return { kind: 'error', name: probe.error };
  if (probe.empty) return { kind: 'empty', name: probe.empty };
  if (probe.loading > 0) {
    throw new Error(
      `[${label}] defined-state: still loading after ${settleMs}ms (${probe.loading} loading marker(s) visible, ${probe.chars} chars of text)`,
    );
  }
  if (probe.chars < MIN_CONTENT_CHARS) {
    throw new Error(
      `[${label}] defined-state: blank area — ${probe.chars} visible chars in <main>, no named empty state, no named error state`,
    );
  }
  return { kind: 'content', chars: probe.chars };
}
