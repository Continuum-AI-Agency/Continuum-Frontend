import { describe, expect, it } from 'bun:test';
import {
  createFolderCollections,
  type FolderFile,
  folderFilesFromDrop,
  folderFilesFromInput,
  folderPaths,
  foldersOf,
} from './folderUpload';

const file = (name: string, relativePath = '') => {
  const value = new File(['x'], name);
  Object.defineProperty(value, 'webkitRelativePath', { value: relativePath });
  return value;
};

describe('folder upload', () => {
  it('reads the folders a file sat in from its relative path', () => {
    expect(foldersOf('Shoot/Day 1/a.mp4')).toEqual(['Shoot', 'Day 1']);
    expect(foldersOf('a.mp4')).toEqual([]);
    expect(
      folderFilesFromInput([file('a.mp4', 'Shoot/a.mp4'), file('.DS_Store', 'Shoot/.DS_Store')]),
    ).toEqual([{ file: expect.any(File), folders: ['Shoot'] }]);
  });

  it('lists every folder once, parents first, including ones holding only folders', () => {
    const entries: FolderFile[] = [
      { file: file('c.png'), folders: ['Shoot', 'Day 1', 'Stills'] },
      { file: file('a.mp4'), folders: ['Shoot', 'Day 2'] },
      { file: file('b.mp4'), folders: ['Shoot', 'Day 2'] },
    ];
    expect(folderPaths(entries).map((path) => path.join('/'))).toEqual([
      'Shoot',
      'Shoot/Day 1',
      'Shoot/Day 2',
      'Shoot/Day 1/Stills',
    ]);
  });

  it('nests each collection under its parent folder', async () => {
    const created: Array<{ name: string; parentId: string | null }> = [];
    const ids = await createFolderCollections(
      [['Shoot'], ['Shoot', 'Day 1'], ['Shoot', 'Day 1', 'Stills']],
      async (input) => {
        created.push(input);
        return { id: `id-${created.length}` };
      },
    );
    expect(created).toEqual([
      { name: 'Shoot', parentId: null },
      { name: 'Day 1', parentId: 'id-1' },
      { name: 'Stills', parentId: 'id-2' },
    ]);
    expect(ids.get('Shoot/Day 1/Stills')).toBe('id-3');
  });

  it('walks a dropped folder through the entry API, across readEntries batches', async () => {
    const fileEntry = (name: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      file: (resolve: (value: File) => void) => resolve(file(name)),
    });
    const dir = (name: string, batches: unknown[][]) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        const queue = [...batches, []];
        return {
          readEntries: (resolve: (value: unknown[]) => void) => resolve(queue.shift() ?? []),
        };
      },
    });
    const root = dir('Shoot', [[fileEntry('a.mp4')], [dir('Day 1', [[fileEntry('b.png')]])]]);
    const items = [
      { kind: 'file', webkitGetAsEntry: () => root },
      { kind: 'file', webkitGetAsEntry: () => fileEntry('loose.pdf') },
    ] as unknown as DataTransferItemList;
    const walked = await folderFilesFromDrop(items);
    expect(walked?.map((entry) => `${entry.folders.join('/')}|${entry.file.name}`)).toEqual([
      'Shoot|a.mp4',
      'Shoot/Day 1|b.png',
      '|loose.pdf',
    ]);
    const flat = [{ kind: 'file', webkitGetAsEntry: () => fileEntry('a.mp4') }];
    expect(await folderFilesFromDrop(flat as unknown as DataTransferItemList)).toBeNull();
  });
});
