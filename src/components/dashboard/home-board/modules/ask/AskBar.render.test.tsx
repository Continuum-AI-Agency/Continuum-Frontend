import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ctxFor } from './__fixtures__/readings';

// The router is the only way out of the bar: every question leaves through push. `mock.module`
// replaces next/navigation for the whole process, so this file runs on its own.
const pushed: string[] = [];
mock.module('next/navigation', () => ({
  useRouter: () => ({
    push: (href: string) => {
      pushed.push(href);
    },
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '',
}));

const { default: AskBar } = await import('./AskBar');

const realFetch = globalThis.fetch;
let fetches = 0;

beforeEach(() => {
  fetches = 0;
  globalThis.fetch = ((..._args: Parameters<typeof fetch>) => {
    fetches += 1;
    return Promise.reject(new Error('the Ask bar must not reach the network'));
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  pushed.length = 0;
  globalThis.fetch = realFetch;
});

const promptOf = (href: string) => new URL(href, 'https://app.test').searchParams.get('prompt');

describe('AskBar', () => {
  it('offers the questions the reading suggests', () => {
    render(<AskBar ctx={ctxFor('fix')} />);
    const suggestions = screen.getAllByTestId('home-ask-suggestion');
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    expect(suggestions[0]?.textContent).toBe(
      'How do I fix this: Leads // Google Ads only lost the campaigns it manages?',
    );
  });

  it('opens Jaina with a suggestion written in, in a new conversation, and asks nothing itself', () => {
    render(<AskBar ctx={ctxFor('approve')} />);
    const [first] = screen.getAllByTestId('home-ask-suggestion');
    if (!first) throw new Error('no suggestion');
    fireEvent.click(first);
    expect(pushed).toHaveLength(1);
    const href = pushed[0] ?? '';
    expect(href.startsWith('/scale?tab=jaina')).toBe(true);
    expect(href).toContain('new=1');
    expect(promptOf(href)).toBe(first.textContent);
    expect(fetches).toBe(0);
  });

  it('opens Jaina with the typed question pre-filled', () => {
    render(<AskBar ctx={ctxFor('operate')} />);
    const input = screen.getByRole('textbox', {
      name: 'Ask Jaina about this brand',
    });
    fireEvent.change(input, {
      target: { value: '  ¿Por qué bajaron los leads?  ' },
    });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(pushed).toHaveLength(1);
    expect(promptOf(pushed[0] ?? '')).toBe('¿Por qué bajaron los leads?');
    expect(fetches).toBe(0);
  });

  it('does nothing on an empty question', () => {
    render(<AskBar ctx={ctxFor('operate')} />);
    const input = screen.getByRole('textbox', {
      name: 'Ask Jaina about this brand',
    });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(pushed).toHaveLength(0);
    expect((screen.getByRole('button', { name: 'Ask Jaina' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
