import { describe, expect, it, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import english from '../../../messages/common/en.json';
import spanish from '../../../messages/common/es.json';
import portuguese from '../../../messages/common/pt-BR.json';
import { useSessionSearch } from './useSessionSearch';

describe('localized conversation-search failures', () => {
  it('updates an existing failure on language change without fetching again', async () => {
    let changeLocale: (value: 'en' | 'pt-BR' | 'es') => void = () => {};
    function Wrapper({ children }: { children: ReactNode }) {
      const [locale, setLocale] = useState<'en' | 'pt-BR' | 'es'>('en');
      changeLocale = setLocale;
      const common = locale === 'en' ? english : locale === 'pt-BR' ? portuguese : spanish;
      return (
        <NextIntlClientProvider
          locale={locale}
          timeZone="UTC"
          messages={{ common }}
          onError={(error) => {
            throw error;
          }}
        >
          {children}
        </NextIntlClientProvider>
      );
    }
    const fetchSessions = mock(async () => {
      throw new ApiError('unavailable', 503);
    });
    const { result } = renderHook(() => useSessionSearch({ isEnabled: true, fetchSessions }), {
      wrapper: Wrapper,
    });
    act(() => result.current.setFilters({ ...result.current.filters, q: 'campaign' }));
    await waitFor(() =>
      expect(result.current.failure?.message).toContain("Couldn't search conversations"),
    );
    expect(fetchSessions).toHaveBeenCalledTimes(1);
    act(() => changeLocale('pt-BR'));
    expect(result.current.failure?.message).toContain('Não foi possível buscar conversas');
    act(() => changeLocale('es'));
    expect(result.current.failure?.message).toContain('No se pudieron buscar conversaciones');
    expect(fetchSessions).toHaveBeenCalledTimes(1);
  });
});
