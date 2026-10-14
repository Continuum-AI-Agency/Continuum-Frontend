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
