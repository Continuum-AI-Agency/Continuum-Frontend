import { describe, expect, test } from 'bun:test';
import {
  CONSOLE_ERROR_ALLOWLIST,
  expectL1Clean,
  FAILED_REQUEST_ALLOWLIST,
  formatL1Failures,
  isOwnOrigin,
  type L1Event,
  l1Failures,
  matchAllowlist,
  summarizeL1,
} from './l1Invariants';

const PAGE = 'http://localhost:3112';

describe('isOwnOrigin', () => {
  test('the page origin, the local Backend and the Supabase project are ours', () => {
    expect(isOwnOrigin('http://localhost:3112/scale?tab=performance', PAGE)).toBe(true);
    expect(isOwnOrigin('http://localhost:4000/api/goals', PAGE)).toBe(true);
    expect(isOwnOrigin('http://127.0.0.1:4000/healthz', PAGE)).toBe(true);
    expect(
      isOwnOrigin('https://nkejqgyushulohxwtytl.supabase.co/functions/v1/optimizer-status', PAGE),
    ).toBe(true);
    expect(isOwnOrigin('https://nkejqgyushulohxwtytl.supabase.co/rest/v1/brands', PAGE)).toBe(true);
  });

  test('third parties are not ours', () => {
    expect(isOwnOrigin('https://graph.facebook.com/v21.0/act_1/insights', PAGE)).toBe(false);
    expect(isOwnOrigin('https://fonts.gstatic.com/x.woff2', PAGE)).toBe(false);
    expect(isOwnOrigin('http://localhost:3000/other-dev-server', PAGE)).toBe(false);
  });

  test('an unparseable url is not ours', () => {
    expect(isOwnOrigin('not a url', PAGE)).toBe(false);
  });
});

describe('allowlists', () => {
  test('every entry carries a reason', () => {
    for (const entry of [...CONSOLE_ERROR_ALLOWLIST, ...FAILED_REQUEST_ALLOWLIST]) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  test('a product error line is never excused', () => {
    expect(matchAllowlist('Error: Minified React error #418', CONSOLE_ERROR_ALLOWLIST)).toBeNull();
    expect(
      matchAllowlist(
        '[paid-media] route error: TypeError: x is undefined',
        CONSOLE_ERROR_ALLOWLIST,
      ),
    ).toBeNull();
    expect(
      matchAllowlist(
        'Failed to load resource: the server responded with a status of 500',
        CONSOLE_ERROR_ALLOWLIST,
      ),
    ).toBeNull();
  });

  test('a page-initiated abort is excused, a connection failure is not', () => {
    expect(matchAllowlist('net::ERR_ABORTED', FAILED_REQUEST_ALLOWLIST)).not.toBeNull();
    expect(matchAllowlist('net::ERR_CONNECTION_REFUSED', FAILED_REQUEST_ALLOWLIST)).toBeNull();
    expect(matchAllowlist('net::ERR_FAILED', FAILED_REQUEST_ALLOWLIST)).toBeNull();
  });
});

describe('summarizeL1', () => {
  const events: L1Event[] = [
    { kind: 'console', text: 'Warning: Each child should have a key', location: 'app.js:1' },
    { kind: 'console', text: 'Download the React DevTools for a better experience', location: '' },
    { kind: 'pageerror', message: 'TypeError: cannot read properties of undefined' },
    { kind: 'response', url: `${PAGE}/api/paid-metrics`, status: 500, method: 'POST' },
    { kind: 'response', url: `${PAGE}/api/paid-metrics`, status: 200, method: 'POST' },
    { kind: 'response', url: `${PAGE}/missing.png`, status: 404, method: 'GET' },
    {
      kind: 'response',
      url: 'https://nkejqgyushulohxwtytl.supabase.co/functions/v1/optimizer-status',
      status: 503,
      method: 'POST',
    },
    { kind: 'response', url: 'https://graph.facebook.com/x', status: 500, method: 'GET' },
    {
      kind: 'requestfailed',
      url: 'http://localhost:4000/api/goals',
      method: 'GET',
      errorText: 'net::ERR_CONNECTION_REFUSED',
    },
    {
      kind: 'requestfailed',
      url: `${PAGE}/scale?_rsc=1`,
      method: 'GET',
      errorText: 'net::ERR_ABORTED',
    },
    {
      kind: 'requestfailed',
      url: 'https://cdn.example.com/x.js',
      method: 'GET',
      errorText: 'net::ERR_FAILED',
    },
  ];

  test('console errors and page errors are counted; allowlisted noise is reported as ignored', () => {
    const report = summarizeL1(events, PAGE);
    expect(report.consoleErrors).toHaveLength(2);
    expect(report.consoleErrors[0]).toContain('Each child should have a key');
    expect(report.consoleErrors[0]).toContain('app.js:1');
    expect(report.consoleErrors[1]).toContain('pageerror TypeError');
    expect(report.ignored.some((line) => line.includes('React DevTools'))).toBe(true);
  });

  test('only ≥500 responses from our origins are server errors', () => {
    const report = summarizeL1(events, PAGE);
    expect(report.serverErrors).toEqual([
      '500 POST localhost:3112/api/paid-metrics',
      '503 POST nkejqgyushulohxwtytl.supabase.co/functions/v1/optimizer-status',
    ]);
  });

  test('only failed requests to our origins count, and an abort is excused', () => {
    const report = summarizeL1(events, PAGE);
    expect(report.failedRequests).toEqual([
      'net::ERR_CONNECTION_REFUSED GET localhost:4000/api/goals',
    ]);
    expect(report.ignored.some((line) => line.includes('ERR_ABORTED'))).toBe(true);
  });

  test('a quiet page yields an empty report', () => {
    const report = summarizeL1(
      [{ kind: 'response', url: `${PAGE}/scale`, status: 200, method: 'GET' }],
      PAGE,
    );
    expect(report).toEqual({
      consoleErrors: [],
      serverErrors: [],
      failedRequests: [],
      ignored: [],
    });
  });
});

describe('l1Failures / formatL1Failures / expectL1Clean', () => {
  test('one failure per broken invariant, with the first line and the overflow count', () => {
    const failures = l1Failures({
      consoleErrors: ['console.error a', 'console.error b', 'console.error c'],
      serverErrors: [],
      failedRequests: ['net::ERR_FAILED GET localhost:4000/x'],
      ignored: ['noise'],
    });
    expect(failures).toEqual([
      { invariant: 'console-errors', evidence: 'console.error a (+2 more)' },
      { invariant: 'failed-requests', evidence: 'net::ERR_FAILED GET localhost:4000/x' },
    ]);
  });

  test('the message names the surface, the viewport and each invariant on its own line', () => {
    const message = formatL1Failures('/scale?tab=jaina @375', [
      { invariant: 'console-errors', evidence: 'x' },
      { invariant: 'server-errors', evidence: '500 GET y' },
    ]);
    expect(message).toBe(
      '[/scale?tab=jaina @375] console-errors: x\n[/scale?tab=jaina @375] server-errors: 500 GET y',
    );
  });

  test('expectL1Clean passes a clean report and throws on a dirty one', () => {
    const clean = { consoleErrors: [], serverErrors: [], failedRequests: [], ignored: ['n'] };
    expect(() => expectL1Clean(clean, 'p')).not.toThrow();
    expect(() =>
      expectL1Clean({ ...clean, serverErrors: ['502 GET localhost:4000/api'] }, '/scale @1280'),
    ).toThrow('[/scale @1280] server-errors: 502 GET localhost:4000/api');
  });
});
