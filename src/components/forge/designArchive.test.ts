import { expect, test } from 'bun:test';
import { zipSync } from 'fflate';
import { expandDesignArchives } from './designArchive';

test('expands nested PSD/AI and fonts, skips macOS files, preserves AE packages and plain archives', async () => {
  const zip = (name: string, entries: Record<string, Uint8Array>) =>
    new File([zipSync(entries)], name);
  const bytes = new Uint8Array([1, 2, 3]);
  const designs = zip('designs.zip', {
    'VIVO/PAUTAS.ai': bytes,
    'VIVO/PAUTAS-14.psd': bytes,
    '__MACOSX/VIVO/._PAUTAS.ai': bytes,
    'VIVO/._PAUTAS-14.psd': bytes,
    'VIVO/Fonts/Brand.otf': bytes,
    'preview.jpg': bytes,
  });
  const ae = zip('project.zip', { 'project.aep': bytes, 'footage.psd': bytes });
  const other = zip('other.zip', { 'readme.txt': bytes });
  const files = await expandDesignArchives([designs, ae, other]);
  expect(files.map((f) => f.name)).toEqual([
    'PAUTAS.ai',
    'PAUTAS-14.psd',
    'Brand.otf',
    'project.zip',
    'other.zip',
  ]);
  expect(new Uint8Array(await files[0].arrayBuffer())).toEqual(bytes);
  expect(files[0].type).toBe('application/postscript');
  expect(files[1].type).toBe('image/vnd.adobe.photoshop');
  expect(files[3]).toBe(ae);
  expect(files[4]).toBe(other);
  await expect(
    expandDesignArchives([zip('unsafe.zip', { '../escape.psd': bytes })]),
  ).rejects.toThrow();
});

test('a web component project stays one ZIP, even with a Photoshop file among its assets', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const project = new File(
    [
      zipSync({
        'hello/forge-component.json': bytes,
        'hello/src/main.js': bytes,
        'hello/assets/backdrop.psd': bytes,
      }),
    ],
    'hello.zip',
  );
  const files = await expandDesignArchives([project]);
  expect(files).toEqual([project]);
});

// EasyFit 2026-11-12: "Neusa Font.zip" beside an Illustrator file stayed a ZIP, every ZIP counts as
// a project, so it was uploaded as a template that never parsed and its fonts never reached the
// font library. A ZIP of nothing but fonts opens into them; a package that carries fonts does not.
test('a ZIP of only fonts opens into its fonts; a page that ships its fonts stays one package', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const fonts = new File(
    [
      zipSync({
        'Neusa/Neusa-Regular.otf': bytes,
        'Neusa/Neusa-SemiBold.ttf': bytes,
        'Neusa/License.txt': bytes,
        '__MACOSX/Neusa/._Neusa-Regular.otf': bytes,
      }),
    ],
    'Neusa Font.zip',
  );
  const page = new File([zipSync({ 'index.html': bytes, 'fonts/Brand.otf': bytes })], 'page.zip');
  const files = await expandDesignArchives([fonts, page]);
  expect(files.map((f) => f.name)).toEqual(['Neusa-Regular.otf', 'Neusa-SemiBold.ttf', 'page.zip']);
  expect(files[0].type).toBe('font/otf');
  expect(files[1].type).toBe('font/ttf');
  expect(files[2]).toBe(page);
});
