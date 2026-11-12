import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, renderHook, screen } from '@testing-library/react';

let pathname = '/organic';
const push = mock((_href: string) => {});
const replace = mock((_href: string) => {});
const refresh = mock(() => {});
mock.module('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace, refresh }),
}));
const { Link, usePathname, useRouter } = await import('./navigation');

afterEach(cleanup);
beforeEach(() => {
  pathname = '/organic';
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
});

describe('navigation with unprefixed UI URLs', () => {
  for (const locale of ['en', 'pt-BR', 'es']) {
    it(`keeps the pathname stable across the ${locale} internal rewrite and browser URL`, () => {
      pathname = `/${locale}/library/asset-123`;
      const view = renderHook(usePathname);
      expect(view.result.current).toBe('/library/asset-123');
      pathname = '/library/asset-123';
      view.rerender();
      expect(view.result.current).toBe('/library/asset-123');
      pathname = `/${locale}`;
      view.rerender();
      expect(view.result.current).toBe('/');
    });
  }

  it('preserves public links, query parameters and deep-link fragments', () => {
    render(<Link href="/share/token?view=grid&amp;page=2#asset-123">Open shared asset</Link>);
    expect(screen.getByRole('link', { name: 'Open shared asset' }).getAttribute('href')).toBe(
      '/share/token?view=grid&page=2#asset-123',
    );
  });

  it('passes navigation and refresh through to Next without changing destinations', () => {
    const { result } = renderHook(useRouter);
    result.current.push('/organic?brand=brand-123#calendar');
    result.current.replace('/login?redirectTo=%2Fforge%2Fproject-123');
    result.current.refresh();
    expect(push).toHaveBeenCalledWith('/organic?brand=brand-123#calendar');
    expect(replace).toHaveBeenCalledWith('/login?redirectTo=%2Fforge%2Fproject-123');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
