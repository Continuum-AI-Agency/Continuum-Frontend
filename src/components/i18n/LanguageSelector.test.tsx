import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';

type SaveResult = { success: true } | { success: false; error: string };
const save = mock(
  async (_locale: unknown, _scope: unknown): Promise<SaveResult> => ({ success: true }),
);
const refresh = mock(() => {});
mock.module('@/i18n/actions', () => ({ setUiLocaleAction: save }));
mock.module('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { LanguageSelector } = await import('./LanguageSelector');

afterEach(cleanup);
beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue({ success: true });
  refresh.mockClear();
});

const catalogs = { en, es, 'pt-BR': pt };
function show(locale: UiLocale = 'en', scope: 'account' | 'browser' = 'account') {
  return render(
    <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ common: catalogs[locale] }}>
      <LanguageSelector scope={scope} />
    </NextIntlClientProvider>,
  );
}

describe('lightweight language selector', () => {
  for (const locale of ['en', 'pt-BR', 'es'] as const) {
    it(`shows an accessible, correctly selected language group in ${locale}`, () => {
      show(locale);
      const names = { en: 'English', 'pt-BR': 'Português (Brasil)', es: 'Español' };
      expect(screen.getByRole('radiogroup', { name: catalogs[locale].language })).toBeTruthy();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      expect(screen.getByRole('radio', { name: names[locale] }).getAttribute('aria-checked')).toBe(
        'true',
      );
      fireEvent.click(screen.getByRole('radio', { name: names[locale] }));
      expect(save).not.toHaveBeenCalled();
    });
  }

  it('persists the account preference before refreshing and keeps the current selection while saving', async () => {
    let release: ((result: SaveResult) => void) | undefined;
    save.mockImplementation(
      () =>
        new Promise<SaveResult>((resolve) => {
          release = resolve;
        }),
    );
    show();
    fireEvent.click(screen.getByRole('radio', { name: 'Español' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('es', 'account'));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Português (Brasil)' }));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.({ success: true });
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('supports keyboard selection and the anonymous browser preference', async () => {
    show('en', 'browser');
    const english = screen.getByRole('radio', { name: 'English' });
    act(() => english.focus());
    fireEvent.keyDown(english, { key: 'ArrowRight' });
    await waitFor(() => expect(save).toHaveBeenCalledWith('pt-BR', 'browser'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('keeps the current language and shows localized guidance when persistence fails', async () => {
    save.mockResolvedValue({ success: false, error: pt.languageSaveFailed });
    show('pt-BR');
    fireEvent.click(screen.getByRole('radio', { name: 'Español' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(pt.languageSaveFailed));
    expect(
      screen.getByRole('radio', { name: 'Português (Brasil)' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('handles transport failures without refreshing or changing language', async () => {
    save.mockRejectedValue(new Error('Offline'));
    show();
    fireEvent.click(screen.getByRole('radio', { name: 'Español' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(en.languageSaveFailed));
    expect(screen.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
