import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrandBookResponse } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { FirstRunSetup } from './FirstRunSetup';
import { deriveDashboardSetup } from './setupState';

// PP-DT-H-first-run-checklist-contrast (deep test 2026-10-31, lane H): once The Sound Vault's setup
// checklist rendered, its small muted text measured 4.03:1 at 1440 light — muted-foreground at 80%
// (`text-muted-foreground/80`, `opacity-80`) on the page. AA needs 4.5:1 at that size; the ink
// tokens meet it at full strength. Every text on the first-run surface is checked: its colour token
// and every opacity on the way up, blended over the page, read from the stylesheet the app ships.

const CSS = readFileSync(join(import.meta.dir, '../../../app/globals.css'), 'utf8');

/** The custom properties of the light theme block (`:root, [data-theme="light"]`). */
const LIGHT: Record<string, string> = (() => {
  const start = CSS.search(/:root,\s*\[data-theme="light"\]\s*\{/);
  const open = CSS.indexOf('{', start);
  const body = CSS.slice(open + 1, CSS.indexOf('}', open));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars[match[1] as string] = (match[2] as string).replace(/\/\*.*?\*\//g, '').trim();
  }
  return vars;
})();

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The text colour an element paints with — its own or an ancestor's `text-<token>[/NN]` — and the
 *  alpha it carries: the class's own, times every `opacity-NN` from the element up. */
function paint(element: Element): { token: string; alpha: number } | null {
  let token: string | null = null;
  let alpha = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    for (const name of Array.from(node.classList)) {
      const opacity = /^opacity-(\d+)$/.exec(name);
      if (opacity) alpha *= Number(opacity[1]) / 100;
      const text = /^text-([a-z][a-z-]*)(?:\/(\d+))?$/.exec(name);
      if (!token && text && `--${text[1]}` in LIGHT) {
        token = `--${text[1]}`;
        if (text[2]) alpha *= Number(text[2]) / 100;
      }
    }
  }
  return token ? { token, alpha } : null;
}

const ownText = (element: Element) =>
  Array.from(element.childNodes)
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();

/** A ready Brand Book never scored, refreshed long ago: the card shows "Updated …" and the
 *  "not scored yet" badge, the two smallest texts on the surface. */
const unscoredSetup = deriveDashboardSetup({
  hasConnectedProviders: true,
  hasAssignedAccounts: true,
  brandBook: {
    brand_id: 'brand-1',
    status: 'ready',
    present: true,
    refreshed_at: '2026-07-01T00:00:00.000Z',
    assembled: { report: { readiness: null } },
  } as unknown as BrandBookResponse,
});

afterEach(() => cleanup());

describe('FirstRunSetup — every text meets AA on the page', () => {
  it('paints no text under 4.5:1 in light', () => {
    const { container } = render(
      <FirstRunSetup setup={unscoredSetup} brandBookRefreshedAt="2026-07-01T00:00:00.000Z" />,
    );
    const page = rgb(LIGHT['--background'] as string);
    const failing: string[] = [];
    let checked = 0;
    for (const element of Array.from(container.querySelectorAll('*'))) {
      const text = ownText(element);
      if (!text) continue;
      const painted = paint(element);
      const hex = painted ? LIGHT[painted.token] : undefined;
      if (!painted || !hex?.startsWith('#')) continue;
      const [r, g, b] = rgb(hex);
      const blended = [r, g, b].map((channel, i) =>
        Math.round(channel * painted.alpha + (page[i] as number) * (1 - painted.alpha)),
      ) as [number, number, number];
      const ratio = contrast(blended, page);
      checked += 1;
      if (ratio < 4.5)
        failing.push(`"${text}" ${painted.token}@${painted.alpha} ${ratio.toFixed(2)}:1`);
    }
    expect(container.textContent).toContain('Updated');
    expect(container.textContent).toContain('not scored yet');
    expect(checked).toBeGreaterThan(5);
    expect(failing).toEqual([]);
  });
});
