import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { act } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import en from '@/i18n/emergency/en.json';
import es from '@/i18n/emergency/es.json';
import pt from '@/i18n/emergency/pt-BR.json';
import GlobalError from './global-error';

afterEach(() => {
  mock.restore();
});

describe('provider-independent emergency UI', () => {
  // A tab opened before a deploy keeps calling the old build's Server Action ids. reset() only
  // re-renders that same stale bundle, so on 2026-11-10 onboarding's "Reload" put the user back on
  // step 3 to fail again. Only a page load fetches the current build.
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    it(`renders ${locale} without a router or translation provider and reloads the page`, async () => {
      document.cookie = `NEXT_LOCALE=${locale};path=/`;
      const reload = spyOn(window.location, 'reload').mockImplementation(() => {});
      // global-error renders its own <html>, so it mounts on a document, as Next mounts it.
      const output = document.implementation.createHTMLDocument();
      const root = createRoot(output);
      try {
        await act(async () => root.render(<GlobalError />));
        expect(output.documentElement.lang).toBe(locale);
        expect(output.querySelector('h1')?.textContent).toBe(messages.title);
        const button = output.querySelector('button');
        expect(button?.textContent).toBe(messages.reload);
        await act(async () => {
          button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(reload).toHaveBeenCalledTimes(1);
      } finally {
        await act(async () => root.unmount());
        document.cookie = 'NEXT_LOCALE=;Max-Age=0;path=/';
      }
    });
  }
});
