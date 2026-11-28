import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bot, Check, Flag, Spinner, Tag } from '@/components/icons';

const FRONTEND_ROOT = path.resolve(import.meta.dir, '../../..');
const ICON_PACKAGE_IMPORT =
  /from\s+['"](lucide-react|@phosphor-icons\/react|@heroicons\/react|runeicons-react)['"/]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return /\.(tsx?|mts)$/.test(entry.name) ? [full] : [];
  });
}

describe('icon set boundary', () => {
  it('is the only module that imports an icon package', () => {
    const iconsDir = path.join(FRONTEND_ROOT, 'src/components/icons');
    const offenders = ['src', 'tests', 'e2e']
      .flatMap((dir) => sourceFiles(path.join(FRONTEND_ROOT, dir)))
      .filter((file) => !file.startsWith(iconsDir))
      .filter((file) => ICON_PACKAGE_IMPORT.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(FRONTEND_ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe('Rune glyphs', () => {
  it('render as decoration with the stroke on the root so call sites can restyle it', () => {
    const html = renderToStaticMarkup(<Check className="size-4" strokeWidth={3} />);
    expect(html).toContain('class="icon icon-check size-4"');
    expect(html).toContain('stroke-width="3"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<path[^>]*stroke-width/);
  });

  it('stay in the accessibility tree when labelled', () => {
    const html = renderToStaticMarkup(<Flag aria-label="Launch day" />);
    expect(html).toContain('aria-label="Launch day"');
    expect(html).not.toContain('aria-hidden');
  });

  it('keep a fill-only detail unstroked once the stroke moves to the root', () => {
    const html = renderToStaticMarkup(<Tag />);
    expect(html).toMatch(/<path[^>]*fill="currentColor"[^>]*stroke="none"/);
  });

  it('draw the spinner as an open arc', () => {
    expect(renderToStaticMarkup(<Spinner />)).toContain('d="M12 3a9 9 0 1 0 9 9"');
  });
});

describe('gap glyphs', () => {
  it('still render from lucide until Rune draws them', () => {
    expect(renderToStaticMarkup(<Bot />)).toContain('lucide-bot');
  });
});
