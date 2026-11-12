import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { render } from '@/i18n/__tests__/render';
import en from '../../../messages/admin/en.json';
import es from '../../../messages/admin/es.json';
import pt from '../../../messages/admin/pt-BR.json';
import { BrandAccessEditor } from './BrandAccessEditor';

afterEach(cleanup);
const locales = [
  {
    locale: 'en',
    admin: en,
    valid: '125.75',
    foreign: '125,75',
    over: '1,000.01',
  },
  {
    locale: 'pt-BR',
    admin: pt,
    valid: '125,75',
    foreign: '125.75',
    over: '1.000,01',
  },
  {
    locale: 'es',
    admin: es,
    valid: '125,75',
    foreign: '125.75',
    over: '1.000,01',
  },
] as const;
describe('BrandAccessEditor locale and USD identity', () => {
  for (const { locale, admin, valid, foreign, over } of locales)
    it(`parses ${locale} decimal input strictly and keeps the USD cap`, () => {
      const save = mock(async (_amount: number, _reason: string) => true);
      const view = render(
        <NextIntlClientProvider locale={locale} timeZone="UTC" messages={{ admin }}>
          <BrandAccessEditor
            brandId="brand-1"
            brandName="Nome escrito pelo cliente"
            access={null}
            live
            pending={false}
            onToggleProduct={() => {}}
            onSetContract={() => {}}
            onFullAccess={() => {}}
            onAddCredits={save}
            onSetClient={() => {}}
          />
        </NextIntlClientProvider>,
      );
      const amount = view.getByRole('textbox', {
        name: admin.credits_to_add_usd_468d9b1,
      });
      const reason = view.getByRole('textbox', {
        name: admin.reason_for_the_credits_327b09b,
      });
      const submit = view.getByRole('button', {
        name: admin.add_credits_d22feb6,
      }) as HTMLButtonElement;
      fireEvent.change(reason, {
        target: { value: 'Customer request — unchanged' },
      });
      fireEvent.change(amount, { target: { value: foreign } });
      expect(submit.disabled).toBe(true);
      expect(amount.getAttribute('aria-invalid')).toBe('true');
      fireEvent.change(amount, { target: { value: over } });
      expect(submit.disabled).toBe(true);
      fireEvent.change(amount, { target: { value: valid } });
      expect(submit.disabled).toBe(false);
      fireEvent.click(submit);
      expect(save).toHaveBeenCalledWith(125.75, 'Customer request — unchanged');
    });
});
