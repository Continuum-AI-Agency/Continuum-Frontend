import { expect, it } from 'bun:test';
import { FORGE_PROJECT_FILE_MAX_BYTES } from '@continuum/contracts';
import { strFromU8, unzipSync } from 'fflate';
import { packageProjectFolder } from './projectFolder';

it('packages project dependencies without flattening paths or changing bytes', async () => {
  const entries = [
    { file: new File(['project'], 'main.aep'), folders: ['Package', 'Projects', 'TEMPLATE'] },
    { file: new File(['artwork'], 'general.ai'), folders: ['Package', 'Downloads', 'Sources'] },
    { file: new File(['font'], 'brand.otf'), folders: ['Package', 'Fonts'] },
    { file: new File(['other artwork'], 'general.ai'), folders: ['Package', 'Other'] },
  ];
  const archive = await packageProjectFolder(entries);
  expect(archive.name).toBe('Package.zip');
  expect(archive.type).toBe('application/zip');
  const unpacked = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  expect(Object.keys(unpacked)).toEqual(
    entries.map(({ file, folders }) => [...folders, file.name].join('/')),
  );
  for (const { file, folders } of entries) {
    expect(strFromU8(unpacked[[...folders, file.name].join('/')])).toBe(await file.text());
  }
  expect(await archive.arrayBuffer()).toEqual(
    await (await packageProjectFolder(entries)).arrayBuffer(),
  );
});

it('rejects invalid folders and oversize packages before reading their contents', async () => {
  const file = new File(['x'], 'main.aep');
  await expect(packageProjectFolder([])).rejects.toThrow('Choose a folder');
  await expect(packageProjectFolder([{ file, folders: ['..'] }])).rejects.toThrow('unsafe');
  await expect(
    packageProjectFolder([
      { file, folders: ['Package'] },
      { file, folders: ['Package'] },
    ]),
  ).rejects.toThrow('duplicate');
  Object.defineProperty(file, 'size', { value: FORGE_PROJECT_FILE_MAX_BYTES + 1 });
  file.arrayBuffer = () => {
    throw new Error('must not read');
  };
  await expect(packageProjectFolder([{ file, folders: ['Package'] }])).rejects.toThrow(
    'upload limit',
  );
});
