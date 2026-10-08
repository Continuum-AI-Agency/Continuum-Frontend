import { expect, test } from 'bun:test';
import { unzipSync, zipSync } from 'fflate';
import {
  matchMissingMediaFiles,
  repairMissingMediaPackage,
  repairMissingMediaZip,
} from './repairMissingMedia';

test('a ZIP filename does not hide its sole real project behind metadata or autosaves', () => {
  const original = zipSync({
    'Project/Scene.aep': new Uint8Array([1]),
    '__MACOSX/Project/._Scene.aep': new Uint8Array([2]),
    'Project/Adobe After Effects Auto-Save/Scene 1.aep': new Uint8Array([3]),
  });
  const repaired = unzipSync(
    repairMissingMediaZip(original, '/Users/designer/logo.ai', new Uint8Array([4]), 'upload.zip'),
  );
  expect(repaired['Project/logo.ai']).toEqual(new Uint8Array([4]));
  expect(repaired['Project/Scene.aep']).toEqual(new Uint8Array([1]));
});

test('batch repair targets each project path even when project basenames are identical', () => {
  const original = zipSync({
    'A/Scene.aep': new Uint8Array([1]),
    'B/Scene.aep': new Uint8Array([2]),
  });
  const repaired = unzipSync(
    repairMissingMediaPackage(original, 'upload.zip', [
      {
        missing: { name: 'Art', file: '/old/art.ai', projectPath: 'A/Scene.aep' },
        replacement: new Uint8Array([3]),
      },
      {
        missing: { name: 'Art', file: '/old/art.psd', projectPath: 'B/Scene.aep' },
        replacement: new Uint8Array([4]),
      },
    ]),
  );
  expect(repaired['A/art.ai']).toEqual(new Uint8Array([3]));
  expect(repaired['B/art.psd']).toEqual(new Uint8Array([4]));
  expect(repaired['B/Scene.aep']).toEqual(new Uint8Array([2]));
});

test('raw AEPs are packaged with the original project bytes and supplied dependencies', () => {
  const source = new Uint8Array([1, 2]);
  const repaired = unzipSync(
    repairMissingMediaPackage(source, 'Scene.aep', [
      {
        missing: { name: 'Art', file: 'C:\\work\\(Footage)\\art.psd' },
        replacement: new Uint8Array([3]),
      },
    ]),
  );
  expect(repaired['Scene.aep']).toEqual(source);
  expect(repaired['(Footage)/art.psd']).toEqual(new Uint8Array([3]));
});

test('ambiguous projects and unsafe archive paths are refused before changing the package', () => {
  expect(() =>
    repairMissingMediaZip(
      zipSync({ 'a.aep': new Uint8Array([1]), 'b.aep': new Uint8Array([2]) }),
      '/old/art.ai',
      new Uint8Array([3]),
      'upload.zip',
    ),
  ).toThrow('Choose');
  expect(() =>
    repairMissingMediaZip(
      zipSync({ '../Scene.aep': new Uint8Array([1]) }),
      '/old/art.ai',
      new Uint8Array([3]),
    ),
  ).toThrow('unsafe');
});

test('folder matching prefers the longest path suffix and keeps duplicate basenames ambiguous', () => {
  const a = { file: new File(['a'], 'art.ai'), folders: ['client', 'A'] };
  const b = { file: new File(['b'], 'art.ai'), folders: ['client', 'B'] };
  const rows = matchMissingMediaFiles(
    [
      { name: 'A', file: '/old/A/art.ai' },
      { name: 'Unknown', file: '/old/art.ai' },
      { name: 'Missing', file: '/old/art.psd' },
    ],
    [a, b],
  );
  expect(rows.map((row) => row.matches)).toEqual([[a], [a, b], []]);
});

test('repairs the selected AEP media path in a Windows ZIP without dropping other entries', () => {
  const original = zipSync({
    'A\\one.aep': new Uint8Array([1]),
    'B\\two.aep': new Uint8Array([2]),
    'B\\(Footage)\\other.png': new Uint8Array([3]),
  });
  const repaired = unzipSync(
    repairMissingMediaZip(
      original,
      'C:\\Users\\designer\\B\\(Footage)\\PTW_logo_purple.png',
      new Uint8Array([4, 5]),
      'two.aep',
    ),
  );
  expect(repaired['B/(Footage)/PTW_logo_purple.png']).toEqual(new Uint8Array([4, 5]));
  expect(repaired['B/(Footage)/other.png']).toEqual(new Uint8Array([3]));
  expect(repaired['A/one.aep']).toEqual(new Uint8Array([1]));
});

test('finds a uniquely named file already in the ZIP', () => {
  const original = zipSync({
    'card.aep': new Uint8Array([1]),
    'loose/PTW_logo_purple.png': new Uint8Array([9]),
  });
  const repaired = unzipSync(
    repairMissingMediaZip(original, 'C:\\work\\(Footage)\\PTW_logo_purple.png'),
  );
  expect(repaired['(Footage)/PTW_logo_purple.png']).toEqual(new Uint8Array([9]));
});

test('repairs honour native ancestor counts and refuse conflicting shared destinations', () => {
  const zip = zipSync({
    'Projects/Promo/main.aep': new Uint8Array([1]),
    'Projects/Promo/other.aep': new Uint8Array([2]),
  });
  const missing = {
    name: 'design',
    file: '/Users/designer/Assets/design.psd',
    projectPath: 'Projects/Promo/main.aep',
    ascend: { base: 2, target: 2 },
  };
  const repaired = unzipSync(
    repairMissingMediaPackage(zip, 'outer.zip', [{ missing, replacement: new Uint8Array([3]) }]),
  );
  expect(repaired['Projects/Assets/design.psd']).toEqual(new Uint8Array([3]));
  expect(() =>
    repairMissingMediaPackage(zip, 'outer.zip', [
      { missing, replacement: new Uint8Array([3]) },
      {
        missing: { ...missing, projectPath: 'Projects/Promo/other.aep' },
        replacement: new Uint8Array([4]),
      },
    ]),
  ).toThrow('same media path');
});
