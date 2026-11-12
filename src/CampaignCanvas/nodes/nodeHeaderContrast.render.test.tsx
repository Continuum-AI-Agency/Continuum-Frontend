import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentType } from 'react';
import { render } from '@/i18n/__tests__/render';
import type { CampaignNodeProps } from '../types';
import { AdNode } from './AdNode';
import { AdSetNode } from './AdSetNode';
import { AudienceNode } from './AudienceNode';
import { CampaignNode } from './CampaignNode';

// PP-DT-E-canvas-map-node-contrast (deep test 2026-10-31, lane E, low). On the canvas Map every
// node header label — CAMPAIGN, AD SET, AD, AUDIENCE, 12 px bold caps — measured 2.34:1 in light
// and 1.08:1 in dark (axe color-contrast): muted-foreground on the header's fill, which resolved to
// this app's --secondary, the sky-500 brand cyan. The tokens are read from the stylesheet the app
// ships, so the check follows whatever the header and the label are painted with.

const CSS = readFileSync(join(import.meta.dir, '../../app/globals.css'), 'utf8');

/** The custom properties declared directly in the first block whose selector matches. */
function block(selector: RegExp): Record<string, string> {
  const start = CSS.search(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = CSS.indexOf('{', start);
  const body = CSS.slice(open + 1, CSS.indexOf('}', open));
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars[match[1] as string] = (match[2] as string).trim().toLowerCase();
  }
  return vars;
}

const THEMES = {
  light: block(/:root,\s*\[data-theme="light"\]\s*\{/),
  dark: block(/\n\[data-theme="dark"\]\s*\{/),
  'system dark': block(/:root:not\(\[data-theme\]\)\s*\{/),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour token a utility class paints with (`bg-secondary` → --secondary), or null for a
 *  class that names no colour token (`text-xs`, `bg-transparent`). */
function tokenOf(element: Element, prefix: 'bg' | 'text'): string | null {
  for (const name of Array.from(element.classList)) {
    const match = new RegExp(`^${prefix}-([a-z][a-z-]*)$`).exec(name);
    const token = match ? `--${match[1]}` : null;
    if (token && token in THEMES.light) return token;
  }
  return null;
}

const props = (type: string, data: Record<string, unknown>) =>
  ({
    id: `${type}-1`,
    data: { label: `${type} label`, validationStatus: 'valid', ...data },
    selected: false,
    type,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: '',
  }) as never;

const NODES: [string, ComponentType<CampaignNodeProps<never>>, Record<string, unknown>][] = [
  ['CAMPAIGN', CampaignNode as never, { objective: 'OUTCOME_LEADS' }],
  ['AD SET', AdSetNode as never, { budgetAmount: 150, budgetCurrency: 'MXN' }],
  ['AD', AdNode as never, { format: 'single_image' }],
  ['AUDIENCE', AudienceNode as never, {}],
];

afterEach(cleanup);

describe('Campaign canvas node header labels', () => {
  for (const [label, Node, data] of NODES) {
    it(`${label} reads at AA (4.5:1) in light, dark and system dark`, async () => {
      let container: HTMLElement | null = null;
      await act(async () => {
        container = render(
          <ReactFlowProvider>
            <Node {...props(label.toLowerCase().replace(' ', '-'), data)} />
          </ReactFlowProvider>,
        ).container;
      });
      const header = (container as unknown as HTMLElement).querySelector(
        '[data-slot="card-header"]',
      );
      const title = header?.querySelector('[data-slot="card-title"]');
      expect(title?.textContent?.trim().toUpperCase()).toBe(label);
      const fill = tokenOf(header as Element, 'bg');
      const ink = tokenOf(title as Element, 'text');
      expect(fill).not.toBeNull();
      expect(ink).not.toBeNull();
      for (const [theme, vars] of Object.entries(THEMES)) {
        const ratio = contrast(vars[ink as string] as string, vars[fill as string] as string);
        // The whole reading on failure: which theme, which tokens, how far under the floor.
        expect({
          theme,
          ink,
          fill,
          ratio: Number(ratio.toFixed(2)),
          aa: ratio >= 4.5,
        }).toEqual({
          theme,
          ink,
          fill,
          ratio: expect.any(Number),
          aa: true,
        });
      }
    });
  }
});
