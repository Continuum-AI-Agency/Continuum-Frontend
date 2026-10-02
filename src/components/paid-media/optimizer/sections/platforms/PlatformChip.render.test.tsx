import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { PlatformChip, platformColor } from './PlatformChip';
import { AD_PLATFORMS } from './platformTabsModel';

afterEach(cleanup);

// The tokens are read from the stylesheet the app actually ships, so a retuned shade that
// collides with --primary, or a Google -fg that drops under AA, fails here and not in review.
const CSS = readFileSync(join(import.meta.dir, '../../../../../app/globals.css'), 'utf8');

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

describe('PlatformChip', () => {
  it('names the platform beside a dot — never a logo alone', () => {
    const { getAllByTestId } = render(
      <>
        <PlatformChip platform="meta" />
        <PlatformChip platform="google_ads" />
        <PlatformChip platform="tiktok_ads" />
      </>,
    );
    const chips = getAllByTestId('platform-chip');
    expect(chips.map((chip) => chip.textContent)).toEqual(['Meta', 'Google', 'TikTok']);
    for (const chip of chips) expect(chip.querySelector('svg')).toBeNull();
  });

  it('resolves the three chips to three different tokens, none of them --primary', () => {
    const { getAllByTestId } = render(
      <>
        <PlatformChip platform="meta" />
        <PlatformChip platform="google_ads" />
        <PlatformChip platform="tiktok_ads" />
      </>,
    );
    const tokens = getAllByTestId('platform-chip').map((chip) => chip.getAttribute('data-token'));
    expect(tokens).toEqual(['--platform-meta', '--platform-google', '--platform-tiktok']);
    expect(new Set(tokens).size).toBe(3);
    expect(tokens).not.toContain('--primary');
    const dots = getAllByTestId('platform-chip').map(
      (chip) => chip.querySelector('span')?.className ?? '',
    );
    expect(dots.map((dot) => dot.match(/bg-platform-[a-z]+/)?.[0])).toEqual([
      'bg-platform-meta',
      'bg-platform-google',
      'bg-platform-tiktok',
    ]);
  });
});

describe('the --platform-* tokens in globals.css', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    it(`defines a solid, -soft and -fg for each platform in ${theme}`, () => {
      for (const platform of AD_PLATFORMS) {
        const token = platformColor(platform).token;
        for (const suffix of ['', '-soft', '-fg']) {
          expect(vars[`${token}${suffix}`]).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    });

    it(`keeps the three platforms apart, and TikTok off --primary, in ${theme}`, () => {
      const solids = AD_PLATFORMS.map((platform) => vars[platformColor(platform).token]);
      expect(new Set(solids).size).toBe(3);
      const tiktok = vars['--platform-tiktok'] as string;
      const primary = vars['--primary'] as string;
      expect(tiktok).not.toBe(primary);
      // Visibly distinct, not merely a different hex: the hues must sit apart.
      const hue = (hex: string) => {
        const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [
          number,
          number,
          number,
        ];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
      };
      expect(Math.abs(hue(tiktok) - hue(primary))).toBeGreaterThan(25);
    });

    it(`passes WCAG AA for every chip's text on its own surface in ${theme}`, () => {
      for (const platform of AD_PLATFORMS) {
        const token = platformColor(platform).token;
        expect(
          contrast(vars[`${token}-fg`] as string, vars[`${token}-soft`] as string),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('maps every token into the Tailwind theme', () => {
    for (const platform of AD_PLATFORMS) {
      const token = platformColor(platform).token;
      for (const suffix of ['', '-soft', '-fg']) {
        expect(CSS).toContain(`--color${token.slice(1)}${suffix}: var(${token}${suffix});`);
      }
    }
  });
});
