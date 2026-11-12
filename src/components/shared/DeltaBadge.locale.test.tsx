import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import en from '../../../messages/common/en.json';
import es from '../../../messages/common/es.json';
import pt from '../../../messages/common/pt-BR.json';
import { DeltaBadge } from './DeltaBadge';

afterEach(cleanup);
describe('delta presentation language boundaries', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    it(`${locale}: localizes movement without changing direction or cost judgement`, () => {
      render(
        <NextIntlClientProvider
          locale={locale}
          messages={{ common: messages }}
          timeZone="UTC"
          onError={(error) => {
            throw error;
          }}
        >
          <DeltaBadge value={-7} goodWhenDown />
        </NextIntlClientProvider>,
      );
      const figure = screen.getByRole('img');
      expect(figure.getAttribute('aria-label')).toContain(
        { en: 'Down', 'pt-BR': 'Caiu', es: 'Bajó' }[locale],
      );
      expect(figure.getAttribute('aria-label')).toContain(
        { en: 'good', 'pt-BR': 'positivo', es: 'positivo' }[locale],
      );
      expect(figure.textContent).toBe(
        new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(0.07),
      );
      expect(figure.className).toContain('text-success');
      expect(figure.querySelector('svg')?.getAttribute('class')).toContain('arrow-down-right');
    });
  }
  it('renders report-owned presentation without a UI provider', () => {
    const html = renderToStaticMarkup(
      <DeltaBadge
        value={-7}
        goodWhenDown
        presentation={{ amount: '7%', ariaLabel: 'Down 7%, good' }}
      />,
    );
    expect(html).toContain('aria-label="Down 7%, good"');
    expect(html).toContain('text-success');
    expect(html).toContain('7%');
  });
});
