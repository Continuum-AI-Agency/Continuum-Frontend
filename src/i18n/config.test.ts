import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { matchBrowserLocale } from './browserLocale';
import { isUiLocale } from './config';
import { externalPathname, isLocalizedPage } from './paths';
import { resolveUiLocale } from './routing';

describe('UI locale resolution', () => {
  it('uses explicit browser preference, account preference, browser negotiation, then English', () => {
    expect(resolveUiLocale({ cookie: 'es', account: 'pt-BR', acceptLanguage: 'en' })).toBe('es');
    expect(resolveUiLocale({ cookie: 'invalid', account: 'pt-BR', acceptLanguage: 'es' })).toBe(
      'pt-BR',
    );
    expect(resolveUiLocale({ acceptLanguage: 'fr, es-MX;q=0.9, en;q=0.5' })).toBe('es');
    expect(resolveUiLocale({ cookie: '__proto__', account: null })).toBe('en');
  });
  it('handles weighted regional preferences, exclusions, malformed values and unsupported languages', () => {
    expect(matchBrowserLocale('es;q=0, pt-PT;q=0.5, en;q=0.9')).toBe('en');
    expect(matchBrowserLocale('pt-PT')).toBe('pt-BR');
    expect(matchBrowserLocale('es-AR;q=0.8,en;q=invalid')).toBe('es');
    expect(matchBrowserLocale('fr;q=1.2,de;q=-1,*')).toBe('en');
    expect(matchBrowserLocale('es-MX;q=0.8,pt-PT;q=0.8')).toBe('es');
    expect(matchBrowserLocale('pt-PT;q=0.8,es-MX;q=0.8')).toBe('pt-BR');
    expect(isUiLocale('pt')).toBe(false);
  });
});

describe('locale routing boundaries', () => {
  it('keeps every current App Router protocol handler outside the locale rewrite', () => {
    const app = path.resolve(import.meta.dir, '../app');
    function handlers(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? handlers(file) : entry.name === 'route.ts' ? [file] : [];
      });
    }
    const routes = handlers(app);
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      const route =
        '/' +
        path
          .relative(app, path.dirname(file))
          .split(path.sep)
          .filter((segment) => !/^\(.*\)$/.test(segment))
          .map((segment) => (segment.startsWith('[') ? 'fixture' : segment))
          .join('/');
      expect(isLocalizedPage(route)).toBe(false);
    }
  });
  it('keeps callback and API protocols outside localized UI routing', () => {
    for (const path of [
      '/api/organic/calendar-posts',
      '/auth/callback',
      '/auth/confirm',
      '/oauth/start',
      '/oauth/callback',
      '/callback',
      '/invite/callback',
      '/share/token/download',
      '/share/token/download-all',
      '/share/token/events',
    ]) {
      expect(isLocalizedPage(path)).toBe(false);
    }
  });
  it('localizes public pages and preserves dynamic path segments', () => {
    expect(isLocalizedPage('/share/token')).toBe(true);
    expect(isLocalizedPage('/oauth/consent')).toBe(true);
    expect(externalPathname('/pt-BR/organic')).toBe('/organic');
    expect(externalPathname('/es/studio/video/project')).toBe('/studio/video/project');
    expect(externalPathname('/studio/video/project')).toBe('/studio/video/project');
  });
});
