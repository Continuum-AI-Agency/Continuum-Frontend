import { describe, expect, it, mock } from 'bun:test';
import { act } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import en from '@/i18n/emergency/en.json';
import es from '@/i18n/emergency/es.json';
import pt from '@/i18n/emergency/pt-BR.json';
import GlobalError from './global-error';

describe('provider-independent emergency UI', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    it(`renders ${locale} and resets without a router or translation provider`, async () => {
      document.cookie = `NEXT_LOCALE=${locale};path=/`;
      const output = document.implementation.createHTMLDocument();
      const root = createRoot(output);
      const reset = mock(() => {});
      try {
        await act(async () =>
          root.render(<GlobalError error={new Error('private diagnostic')} reset={reset} />),
        );
        expect(output.documentElement.lang).toBe(locale);
        expect(output.querySelector('h1')?.textContent).toBe(messages.title);
        expect(output.body.textContent).not.toContain('private diagnostic');
        const button = output.querySelector('button');
        expect(button?.textContent).toBe(messages.reload);
        await act(async () => {
          button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(reset).toHaveBeenCalledTimes(1);
      } finally {
        await act(async () => root.unmount());
        document.cookie = 'NEXT_LOCALE=;Max-Age=0;path=/';
      }
    });
  }
});
