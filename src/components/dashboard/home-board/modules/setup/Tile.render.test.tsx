import { afterEach, describe, expect, it } from 'bun:test';
import type { HomeBoardTile } from '@continuum/contracts';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const { homeCtx } = await import('../pacing/__fixtures__/ctx');
const { default: SetupTile } = await import('./Tile');

// A new brand: nothing assigned yet, a Brand Book that already says it books leads.
const ctx = homeCtx({
  adAccounts: [],
  signals: {
    portfolios: [],
    business: {
      calls: ['Agenda tu clase muestra'],
      descriptions: ['Gimnasio con clases de fitness para toda la familia'],
    },
  },
});

function tileAt(size: HomeBoardTile['size']): HomeBoardTile {
  return { id: 'setup', size, urgency: 3, score: 100, why: null };
}

afterEach(cleanup);

describe('SetupTile', () => {
  it('counts the setup steps done and opens the next one with the mode’s verb', () => {
    render(<SetupTile ctx={ctx} tile={tileAt('m')} />);
    expect(screen.getByTestId('home-tile-setup').getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-setup-headline');
    expect(headline.getAttribute('data-value')).toBe('0');
    expect(headline.getAttribute('data-total')).toBe('3');
    expect(headline.textContent).toContain('0 of 3');
    const next = screen.getByTestId('home-setup-next');
    expect(next.textContent).toContain('Connect a provider');
    const start = screen.getByRole('link', { name: /Start/ });
    expect(ctx.board.verb.label).toBe('Start');
    expect(start.getAttribute('href')).toBe('/settings?section=integrations');
    expect(start.className).toContain('hit-area');
  });

  it('shows what the Home already learned from onboarding', () => {
    render(<SetupTile ctx={ctx} tile={tileAt('m')} />);
    const goal = screen.getByTestId('home-setup-goal');
    expect(goal.textContent).toContain(ctx.reading.goal.label);
    expect(goal.textContent).toContain('Read from your Brand Book');
  });

  it('lists the steps left at the large size, their links with hit areas', () => {
    render(<SetupTile ctx={ctx} tile={tileAt('l')} />);
    const list = screen.getByTestId('home-setup-steps');
    expect(list.className).toContain('hit-area-column');
    const links = screen.getAllByTestId('home-setup-step-link');
    expect(links.length).toBe(2);
    for (const link of links) expect(link.className).toContain('hit-area');
  });

  it('opens the first-run setup in its sheet', async () => {
    render(<SetupTile ctx={ctx} tile={tileAt('m')} />);
    fireEvent.click(screen.getByTestId('home-tile-setup-open'));
    expect(await screen.findByTestId('dashboard-first-run')).toBeTruthy();
    expect(screen.getByTestId('dashboard-setup-checklist')).toBeTruthy();
    expect(screen.getByTestId('home-tile-setup-sheet').textContent).toContain(
      ctx.reading.goal.detail,
    );
  });

  it('is missing only when the setup state could not be read', () => {
    render(<SetupTile ctx={{ ...ctx, setup: null }} tile={tileAt('m')} />);
    expect(screen.getByTestId('home-tile-setup').getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toContain(
      'setup steps could not be read',
    );
  });
});
