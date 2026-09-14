import type { Page } from '@playwright/test';

// Shared colour measurement for the contrast benches.
//
// Two things here look like overkill and are not. Computed colours come back in whatever
// space the author wrote — `color-mix(in oklch, …)` stays `oklab(…)`, whose components are
// not 0-255 sRGB — so conversion goes through a 1x1 canvas readback rather than a regex.
// And a tint is translucent, so its real contrast depends on whatever it is painted over;
// `effectiveBackground` composites ancestors until it reaches something opaque.

export const MIN_CONTRAST = 4.5;

/** The surfaces the app actually paints controls on. A tint that clears the floor on the
 *  page background can fail on a card, which is how two variants shipped under it. */
export const SURFACES = [
  ['page', 'var(--background)'],
  ['card', 'var(--card)'],
] as const;

export interface Swatch {
  key: string;
  background: string;
  label: string;
  fill: string | null;
}

export function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const [r, g, b] = (color.match(/-?[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
    const channel = (value: number) => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Seed the theme before boot so ThemeProvider applies it through its own code path. */
export async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((next) => {
    window.localStorage.setItem('theme', JSON.stringify(next));
  }, theme);
}

/** Render one swatch per (surface × variant) and read back its real colours. */
export async function measureSwatches(
  page: Page,
  items: { key: string; surface: string; className: string; tag: 'button' | 'span' }[],
): Promise<Swatch[]> {
  return page.evaluate((specs) => {
    const panel = document.createElement('div');
    panel.id = 'contrast-panel';
    panel.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:var(--background);padding:20px;display:flex;gap:24px;align-items:flex-start';
    const columns = new Map<string, HTMLElement>();
    const rendered: { key: string; el: HTMLElement }[] = [];

    for (const spec of specs) {
      let column = columns.get(spec.surface);
      if (!column) {
        column = document.createElement('div');
        column.style.cssText = `background:${spec.surface};padding:14px;border-radius:10px;display:flex;flex-direction:column;gap:10px;align-items:flex-start`;
        columns.set(spec.surface, column);
        panel.append(column);
      }
      const el = document.createElement(spec.tag);
      el.className = spec.className;
      el.textContent = 'Campaigns';
      column.append(el);
      rendered.push({ key: spec.key, el });
    }
    document.body.append(panel);

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const toRgba = (value: string): number[] => {
      if (!ctx) return [0, 0, 0, 1];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const asRgb = (value: string) => {
      const [r, g, b] = toRgba(value);
      return `rgb(${r}, ${g}, ${b})`;
    };
    const effectiveBackground = (start: Element): string => {
      const layers: number[][] = [];
      let cursor: Element | null = start;
      while (cursor) {
        const parsed = toRgba(getComputedStyle(cursor).backgroundColor);
        if (parsed[3] > 0) {
          layers.push(parsed);
          if (parsed[3] >= 1) break;
        }
        cursor = cursor.parentElement;
      }
      let [r, g, b] = [255, 255, 255];
      for (const [lr, lg, lb, la] of layers.reverse()) {
        r = lr * la + r * (1 - la);
        g = lg * la + g * (1 - la);
        b = lb * la + b * (1 - la);
      }
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    };

    return rendered.map(({ key, el }) => {
      const fill = toRgba(getComputedStyle(el, '::before').backgroundColor);
      return {
        key,
        background: effectiveBackground(el),
        label: asRgb(getComputedStyle(el).color),
        fill: fill[3] > 0 ? `rgb(${fill[0]}, ${fill[1]}, ${fill[2]})` : null,
      };
    });
  }, items);
}
