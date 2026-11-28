import { describe, expect, it, mock } from 'bun:test';

import { UPLOAD_CONCURRENCY, uploadTaggedLibraryImages } from './libraryAssets';

const png = (name: string) => new File(['png'], name, { type: 'image/png' });

describe('uploadTaggedLibraryImages', () => {
  it('uploads every file, then tags all of them in one call', async () => {
    const files = [png('a.png'), png('b.png'), png('c.png')];
    const upload = mock(async ({ file }: { file: File }) => ({ assetId: `id-${file.name}` }));
    const tag = mock(async () => undefined);
    const settled: [number, boolean][] = [];

    const result = await uploadTaggedLibraryImages(
      { brandId: 'brand-1', files, tag: 'logo' },
      (index, outcome) => settled.push([index, outcome.ok]),
      { upload, tag },
    );

    expect(result).toEqual({ tagged: true });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(tag).toHaveBeenCalledTimes(1);
    expect(tag).toHaveBeenCalledWith('brand-1', ['id-a.png', 'id-b.png', 'id-c.png'], 'logo');
    expect(settled.sort()).toEqual([
      [0, true],
      [1, true],
      [2, true],
    ]);
  });

  it(`never runs more than ${UPLOAD_CONCURRENCY} uploads at once`, async () => {
    let running = 0;
    let peak = 0;
    const upload = async ({ file }: { file: File }) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((done) => setTimeout(done, 5));
      running -= 1;
      return { assetId: file.name };
    };

    await uploadTaggedLibraryImages(
      {
        brandId: 'brand-1',
        files: Array.from({ length: 8 }, (_, i) => png(`${i}.png`)),
        tag: 'reference',
      },
      () => {},
      { upload, tag: async () => undefined },
    );

    expect(peak).toBe(UPLOAD_CONCURRENCY);
  });

  it('tags only the files that uploaded, and reports each failure by index', async () => {
    const upload = async ({ file }: { file: File }) => {
      if (file.name === 'bad.png') throw new Error('quota');
      return { assetId: `id-${file.name}` };
    };
    const tag = mock(async () => undefined);
    const failures: [number, unknown][] = [];

    await uploadTaggedLibraryImages(
      { brandId: 'brand-1', files: [png('ok.png'), png('bad.png')], tag: 'logo' },
      (index, outcome) => {
        if (!outcome.ok) failures.push([index, (outcome.error as Error).message]);
      },
      { upload, tag },
    );

    expect(tag).toHaveBeenCalledWith('brand-1', ['id-ok.png'], 'logo');
    expect(failures).toEqual([[1, 'quota']]);
  });

  it('says the batch is untagged when the tag call fails, without losing the uploads', async () => {
    const result = await uploadTaggedLibraryImages(
      { brandId: 'brand-1', files: [png('a.png')], tag: 'logo' },
      () => {},
      {
        upload: async () => ({ assetId: 'id-a' }),
        tag: async () => {
          throw new Error('edge function 500');
        },
      },
    );
    expect(result).toEqual({ tagged: false });
  });

  it('makes no tag call when nothing uploaded', async () => {
    const tag = mock(async () => undefined);
    await uploadTaggedLibraryImages(
      { brandId: 'brand-1', files: [png('bad.png')], tag: 'logo' },
      () => {},
      {
        upload: async () => {
          throw new Error('quota');
        },
        tag,
      },
    );
    expect(tag).not.toHaveBeenCalled();
  });
});
