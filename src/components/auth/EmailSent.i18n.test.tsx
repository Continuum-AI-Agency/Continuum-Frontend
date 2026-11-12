import { afterEach, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { render } from '@/i18n/__tests__/render';
import en from '../../../messages/auth/en.json';
import es from '../../../messages/auth/es.json';
import pt from '../../../messages/auth/pt-BR.json';
import commonEn from '../../../messages/common/en.json';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import { EmailSent } from './EmailSent';

afterEach(cleanup);
for (const [locale, auth, common] of [
  ['en', en, commonEn],
  ['pt-BR', pt, commonPt],
  ['es', es, commonEs],
] as const) {
  test(`${locale}: localized code validation keeps schema messages and code bytes independent of UI language`, async () => {
    const t = createTranslator({
      locale,
      namespace: 'auth',
      messages: { auth },
      onError: (error) => {
        throw error;
      },
    });
    const verify = mock((_code: string) => {});
    const view = render(
      <NextIntlClientProvider
        locale={locale}
        timeZone="UTC"
        messages={{ auth, common }}
        onError={(error) => {
          throw error;
        }}
      >
        <EmailSent email="account@example.com" onVerifyCode={verify} />
      </NextIntlClientProvider>,
    );
    const field = view.getByRole('textbox');
    const form = field.closest('form')!;
    await act(async () => {
      fireEvent.change(field, { target: { value: '12' } });
      fireEvent.submit(form);
    });
    expect(await view.findByText(t('emailCodeRequired'))).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(field, { target: { value: ' 123456 ' } });
      fireEvent.submit(form);
    });
    await waitFor(() => expect(verify).toHaveBeenCalledWith('123456'));
    expect(view.container.textContent).toContain('account@example.com');
  });
}
