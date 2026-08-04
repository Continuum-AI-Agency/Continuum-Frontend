import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { authRedirectTarget, config, isProtectedRoute } from './proxy-config';

function proxyMatches(url: string) {
  const pathname = new URL(url, 'https://app.trycontinuum.ai').pathname;
  return new RegExp(`^${config.matcher[0]}$`).test(pathname);
}

describe('proxy matcher', () => {
  it('keeps the tested matcher identical to the statically analyzable Next.js config', () => {
    const productionSource = readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8');
    const escapedMatcher = JSON.stringify(config.matcher[0]).slice(1, -1);
    expect(productionSource).toContain(`'${escapedMatcher}'`);
  });

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
    expect(proxyMatches('/open/planner?brandId=brand-1')).toBe(true);
    // only /share/<token> is public; lookalike prefixes keep session handling
    expect(proxyMatches('/shared-reports')).toBe(true);
  });

  it('preserves the complete Planner handoff through login', () => {
    expect(isProtectedRoute('/open/planner')).toBe(true);
    expect(
      authRedirectTarget({ pathname: '/open/planner', search: '?brandId=brand-1&draftId=draft-1' }),
    ).toBe('/open/planner?brandId=brand-1&draftId=draft-1');
  });
});
