import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../messages/navigation/en.json';
import es from '../../../messages/navigation/es.json';
import pt from '../../../messages/navigation/pt-BR.json';
import { useNavigation } from './useNavigation';

afterEach(cleanup);

for (const locale of ['en', 'pt-BR', 'es'] as const) {
  const messages = { en, es, 'pt-BR': pt }[locale];
  describe(`navigation presentation in ${locale}`, () => {
    it('localizes controls while preserving product names and destinations', () => {
      const { result } = renderHook(useNavigation, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <NextIntlClientProvider
            locale={locale}
            timeZone="UTC"
            messages={{ navigation: messages }}
          >
            {children}
          </NextIntlClientProvider>
        ),
      });
      expect(result.current.labelForHref('/dashboard', 'fallback')).toBe(messages.navHome);
      expect(result.current.labelForHref('/forge', 'fallback')).toBe('Forge');
      expect(
        result.current.items
          .find((item) => item.href === '/scale')
          ?.items?.find((item) => item.href === '/scale?tab=jaina')?.label,
      ).toBe('Jaina');
      expect(result.current.groups.map((group) => group.label)).toEqual([
        null,
        'Organic +',
        'Performance +',
        'Creative +',
      ]);
      expect(result.current.labelForHref('/unknown', 'Authored destination')).toBe(
        'Authored destination',
      );
      expect(result.current.getSuggestions('/organic').map((item) => item.href)).toEqual([
        '/organic?tab=planner',
        '/organic?tab=agent',
        '/organic?tab=metrics',
      ]);
    });
  });
}
