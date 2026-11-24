import { describe, expect, test } from 'bun:test';
import { zipSync } from 'fflate';
import { expandFontArchives } from './fontArchive';

const bytes = (n: number) => new Uint8Array(n).fill(1);

describe('expandFontArchives', () => {
  test('replaces a foundry zip with the font files inside it and skips the rest', async () => {
    const zip = zipSync({
      'Montserrat/Montserrat-Bold.ttf': bytes(8),
      'Montserrat/static/Montserrat-Italic.otf': bytes(8),
      'Montserrat/OFL.txt': bytes(8),
      '__MACOSX/Montserrat/._Montserrat-Bold.ttf': bytes(8),
    });
    const loose = new File([bytes(4)], 'Inter.woff2');
    const files = await expandFontArchives([
      new File([zip], 'Montserrat.zip', { type: 'application/zip' }),
      loose,
    ]);
    expect(files.map((file) => file.name).sort()).toEqual([
      'Inter.woff2',
      'Montserrat-Bold.ttf',
      'Montserrat-Italic.otf',
    ]);
    expect(files.find((file) => file.name === 'Montserrat-Bold.ttf')?.size).toBe(8);
  });

  test('an archive that will not open adds nothing and keeps the rest of the drop', async () => {
    const loose = new File([bytes(4)], 'Inter.ttf');
    const files = await expandFontArchives([new File([bytes(16)], 'broken.zip'), loose]);
    expect(files).toEqual([loose]);
  });
});
