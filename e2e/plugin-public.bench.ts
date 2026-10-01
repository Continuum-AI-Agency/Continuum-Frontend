import assert from 'node:assert/strict';

// Read the real rendered application pages, without a browser or authentication.
const base = process.env['PLUGIN_WEB_BASE_URL'] ?? 'http://127.0.0.1:3155';
const startedAt = new Date().toISOString();
const results: { step: string; grade: 'PASS' | 'FAIL'; detail?: string }[] = [];
for (const [path, expected] of Object.entries({
  '/support': [
    'mailto:product@trycontinuum.ai',
    'Connecting Continuum',
    'href="/privacy"',
    'href="/terms"',
  ],
  '/privacy': [
    'not intended for children under 13',
    'Users aged 13–17',
    'parent or legal guardian',
    'privacy@continuum.ai',
    'September 30, 2026',
  ],
  '/terms': [
    'not intended for children under 13',
    'Users aged 13–17',
    'parent or legal guardian',
    'September 30, 2026',
  ],
})) {
  try {
    const response = await fetch(`${base}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, 'Page must be public without a login redirect');
    const html = await response.text();
    assert(html.includes('<h1'), 'Rendered page heading is required');
    for (const text of expected) assert(html.includes(text), `Missing rendered content: ${text}`);
    results.push({ step: `rendered public ${path}`, grade: 'PASS' });
  } catch (error) {
    results.push({
      step: path,
      grade: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
const fail = results.filter((result) => result.grade === 'FAIL').length;
console.log(
  JSON.stringify({
    bench: 'plugin-public',
    startedAt,
    results,
    counts: { pass: results.length - fail, warn: 0, skip: 0, fail },
    exitCode: fail ? 1 : 0,
  }),
);
process.exitCode = fail ? 1 : 0;
