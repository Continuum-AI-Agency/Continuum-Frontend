import { afterEach, describe, expect, it } from 'bun:test';
import type { BrandBookResponse } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { FirstRunSetup } from './FirstRunSetup';
import { deriveDashboardSetup } from './setupState';

function readyBook(): BrandBookResponse {
  return {
    brand_id: 'brand-1',
    status: 'ready',
    present: true,
    refreshed_at: '2026-07-01T00:00:00.000Z',
    assembled: { report: { readiness: { overall_score: 80, findings: [] } } },
  } as unknown as BrandBookResponse;
}

const emptySetup = deriveDashboardSetup({
  hasConnectedProviders: false,
  hasAssignedAccounts: false,
  brandBook: null,
});

const readySetup = deriveDashboardSetup({
  hasConnectedProviders: true,
  hasAssignedAccounts: true,
  brandBook: readyBook(),
});

function href(container: HTMLElement, testId: string): string | null {
  return container.querySelector(`[data-testid="${testId}"]`)?.getAttribute('href') ?? null;
}

afterEach(() => cleanup());

describe('FirstRunSetup checklist', () => {
  it('renders all five activation steps with in-context CTAs', () => {
    const { container } = render(<FirstRunSetup setup={emptySetup} brandBookRefreshedAt={null} />);

    const checklist = container.querySelector('[data-testid="dashboard-setup-checklist"]');
    expect(checklist).not.toBeNull();
    expect(checklist?.textContent).toContain('Connect a provider');
    expect(checklist?.textContent).toContain('Assign an account to this brand');
    expect(checklist?.textContent).toContain('Generate your Brand Book');
    expect(checklist?.textContent).toContain('Add competitors');
    expect(checklist?.textContent).toContain('Create your first plan');
  });

  it('points Connect and Assign at the integrations setup surface', () => {
    const { container } = render(<FirstRunSetup setup={emptySetup} brandBookRefreshedAt={null} />);

    expect(href(container, 'setup-step-cta-connect')).toBe('/settings?section=integrations');
    expect(href(container, 'setup-step-cta-assign')).toBe('/settings?section=integrations');
    expect(href(container, 'setup-step-cta-competitors')).toBe('/competitor-spy');
    expect(href(container, 'setup-step-cta-first_plan')).toBe('/organic');
  });

  it('shows setup progress out of the tracked steps', () => {
    const { container } = render(<FirstRunSetup setup={emptySetup} brandBookRefreshedAt={null} />);

    expect(container.textContent).toContain('0 of 3 done');
  });
});

describe('FirstRunSetup workflow map', () => {
  it('renders the full system loop as navigable nodes', () => {
    const { container } = render(<FirstRunSetup setup={emptySetup} brandBookRefreshedAt={null} />);

    const map = container.querySelector('[data-testid="dashboard-workflow-map"]');
    expect(map).not.toBeNull();
    for (const key of [
      'brand-context',
      'connect-data',
      'discover-signals',
      'generate-content',
      'measure',
      'optimize',
    ]) {
      expect(container.querySelector(`[data-testid="workflow-node-${key}"]`)).not.toBeNull();
    }
  });
});

describe('FirstRunSetup Brand Book milestone', () => {
  it('prompts generation when the Brand Book is not ready', () => {
    const { container } = render(<FirstRunSetup setup={emptySetup} brandBookRefreshedAt={null} />);

    const milestone = container.querySelector('[data-testid="brand-book-milestone"]');
    expect(milestone?.textContent).toContain('Generate your Brand Book');
    expect(href(container, 'brand-book-milestone-generate')).toBe('/settings?section=brand-book');
  });

  it('surfaces the ready state with a readiness score and a view link', () => {
    const { container } = render(
      <FirstRunSetup setup={readySetup} brandBookRefreshedAt="2026-07-01T00:00:00.000Z" />,
    );

    const milestone = container.querySelector('[data-testid="brand-book-milestone"]');
    expect(milestone?.textContent).toContain('Brand Book ready');
    expect(milestone?.textContent).toContain('80');
    expect(href(container, 'brand-book-milestone-view')).toBe('/settings?section=brand-book');
  });
});
