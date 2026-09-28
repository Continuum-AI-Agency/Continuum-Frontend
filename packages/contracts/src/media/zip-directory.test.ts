import { describe, expect, it } from 'bun:test';
import { strToU8, zipSync } from 'fflate';
import { classifyZipEntries, htmlBundleManifest } from './asset-formats';
import { readZipDirectory, readZipEntryNames } from './zip-directory';

function reader(bytes: Uint8Array) {
  const reads: Array<[number, number]> = [];
  return {
    reads,
    read: async (start: number, end: number) => {
      reads.push([start, end]);
      return bytes.slice(start, end);
    },
  };
}

describe('readZipEntryNames', () => {
  it('reads every entry name from the central directory with range reads', async () => {
    const zip = zipSync({
      'banner/index.html': strToU8('<html></html>'),
      'banner/js/app.js': strToU8('console.log(1)'),
      'banner/img/ñandú.png': new Uint8Array(70_000).fill(7),
    });
    const { read, reads } = reader(zip);
    expect(await readZipEntryNames(zip.byteLength, read)).toEqual([
      'banner/index.html',
      'banner/js/app.js',
      'banner/img/ñandú.png',
    ]);
    expect(reads[0]).toEqual([Math.max(0, zip.byteLength - (22 + 0xffff)), zip.byteLength]);
  });

  it('locates each entry for serving it: method, sizes and local header offset', async () => {
    const body = strToU8('<html><body>hello</body></html>'.repeat(20));
    const zip = zipSync({ 'a.txt': strToU8('a'), 'index.html': [body, { level: 6 }] });
    const directory = (await readZipDirectory(zip.byteLength, reader(zip).read)) ?? [];
    const index = directory.find((entry) => entry.name === 'index.html');
    expect(index?.method).toBe(8);
    expect(index?.size).toBe(body.byteLength);
    expect(index?.compressedSize).toBeLessThan(body.byteLength);
    const local = new DataView(zip.buffer, zip.byteOffset + (index?.localHeaderOffset ?? 0));
    expect(local.getUint32(0, true)).toBe(0x04034b50);
  });

  it('finds the directory past an archive comment', async () => {
    const zip = zipSync({ 'comp.aep': new Uint8Array(10) }, { comment: 'x'.repeat(500) });
    expect(await readZipEntryNames(zip.byteLength, reader(zip).read)).toEqual(['comp.aep']);
  });

  it('answers null for bytes that are not a zip', async () => {
    const bytes = strToU8('not a zip at all, just some text that is long enough');
    expect(await readZipEntryNames(bytes.byteLength, reader(bytes).read)).toBeNull();
  });

  it('feeds classifyZipEntries and htmlBundleManifest', async () => {
    const html = zipSync({
      'index.html': strToU8('<html></html>'),
      'style.css': strToU8('body{}'),
      '__MACOSX/._index.html': strToU8('x'),
    });
    const names = (await readZipEntryNames(html.byteLength, reader(html).read)) ?? [];
    expect(classifyZipEntries(names)).toBe('html_bundle');
    expect(htmlBundleManifest(names)).toEqual({ entry: 'index.html', fileCount: 2 });
    const archive = zipSync({ 'notes.txt': strToU8('hi') });
    const archiveNames = (await readZipEntryNames(archive.byteLength, reader(archive).read)) ?? [];
    expect(classifyZipEntries(archiveNames)).toBe('archive');
    expect(htmlBundleManifest(archiveNames)).toBeNull();
  });
});
