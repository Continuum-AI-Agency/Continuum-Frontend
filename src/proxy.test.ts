import { describe, expect, it } from 'bun:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from './proxy';

function proxyMatches(url: string) {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe('proxy matcher', () => {
  it('does not run for Vercel internals and host-level probes', () => {
    expect(proxyMatches('/_vercel/insights/view')).toBe(false);
    expect(proxyMatches('/_vercel/speed-insights/vitals')).toBe(false);
    expect(proxyMatches('/.well-known/appspecific/com.chrome.devtools.json')).toBe(false);
    expect(proxyMatches('/socket.io/?EIO=4&transport=polling')).toBe(false);
  });

  it('does not run for metadata and static asset paths', () => {
    expect(proxyMatches('/_next/static/chunks/app.js')).toBe(false);
    expect(proxyMatches('/_next/image?url=%2Flogo.png&w=64&q=75')).toBe(false);
    expect(proxyMatches('/favicon.ico')).toBe(false);
    expect(proxyMatches('/robots.txt')).toBe(false);
    expect(proxyMatches('/sitemap.xml')).toBe(false);
    expect(proxyMatches('/icon.png')).toBe(false);
    expect(proxyMatches('/manifest.json')).toBe(false);
  });

  it('does not run for the anonymous share-link viewer', () => {
    expect(proxyMatches('/share/tok_abc123')).toBe(false);
  });

  it('still runs for app routes that need auth/session handling', () => {
    expect(proxyMatches('/dashboard')).toBe(true);
    expect(proxyMatches('/scale/campaign-canvas')).toBe(true);
    expect(proxyMatches('/settings?section=integrations')).toBe(true);
    // only /share/<token> is public; lookalike prefixes keep session handling
    expect(proxyMatches('/shared-reports')).toBe(true);
  });
});
