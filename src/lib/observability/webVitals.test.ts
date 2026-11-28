import { describe, expect, it } from 'bun:test';
import { routeAt, routeCommitted, routeTemplate } from './webVitals';

describe('routeTemplate', () => {
  it('replaces each param value with its name', () => {
    expect(routeTemplate('/en/library', { locale: 'en' })).toBe('/[locale]/library');
    expect(routeTemplate('/es/forge/abc-123', { locale: 'es', runId: 'abc-123' })).toBe(
      '/[locale]/forge/[runId]',
    );
  });

  it('replaces every segment of a catch-all', () => {
    expect(routeTemplate('/en/docs/a/b', { locale: 'en', slug: ['a', 'b'] })).toBe(
      '/[locale]/docs/[slug]/[slug]',
    );
  });

  it('matches encoded segments', () => {
    expect(routeTemplate('/en/tag/a%20b', { locale: 'en', tag: 'a b' })).toBe(
      '/[locale]/tag/[tag]',
    );
  });
});

describe('routeAt', () => {
  it('answers the route on screen at a time, and the first route before any commit', () => {
    const beforeAny = performance.now() - 1;
    routeCommitted('/[locale]/organic');
    const between = performance.now();
    routeCommitted('/[locale]/library');

    expect(routeAt(beforeAny)).toBe('/[locale]/organic');
    expect(routeAt(between)).toBe('/[locale]/organic');
    expect(routeAt(performance.now() + 1)).toBe('/[locale]/library');
  });
});
