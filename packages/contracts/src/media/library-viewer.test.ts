import { describe, expect, test } from 'bun:test';
import { libraryViewerManifestSchema, viewerFamily } from './library-viewer';

describe('viewerFamily', () => {
  test('3D formats, including the CAD ones the Backend converts, go to the model viewer', () => {
    for (const name of [
      'duck.glb',
      'box.gltf',
      'head.OBJ',
      'part.stl',
      'bunny.fbx',
      'scan.ply',
      'elf.dae',
      'as1.stp',
      'cube.igs',
    ]) {
      expect(viewerFamily({ fileName: name })).toBe('model_3d');
    }
  });

  test('InDesign is paged, every zip asks the Backend, and plain media or documents are not ours', () => {
    expect(viewerFamily({ fileName: 'brochure.indd' })).toBe('paged');
    expect(viewerFamily({ fileName: 'banner.zip', mimeType: 'application/zip' })).toBe(
      'html_bundle',
    );
    expect(viewerFamily({ fileName: 'clip.mp4', mimeType: 'video/mp4' })).toBeNull();
    expect(viewerFamily({ fileName: 'brief.pdf', mimeType: 'application/pdf' })).toBeNull();
    expect(viewerFamily({ fileName: 'unknown.xyz' })).toBeNull();
  });
});

describe('libraryViewerManifestSchema', () => {
  const ids = {
    assetId: '00000000-0000-4000-8000-000000000001',
    versionId: '00000000-0000-4000-8000-000000000002',
  };

  test('parses each family the Backend answers', () => {
    expect(
      libraryViewerManifestSchema.parse({
        family: 'model_3d',
        ...ids,
        model: { url: 'https://x.test/m.glb', format: 'glb', converted: true },
        modelError: null,
        posterUrl: null,
      }).family,
    ).toBe('model_3d');
    expect(
      libraryViewerManifestSchema.parse({
        family: 'paged',
        ...ids,
        pageCount: 2,
        pages: [{ page: 1, url: 'https://x.test/p1.jpg', width: 256, height: 362 }],
      }).family,
    ).toBe('paged');
    expect(libraryViewerManifestSchema.parse({ family: 'none', ...ids }).family).toBe('none');
  });

  test('refuses a model format the viewer cannot load', () => {
    expect(
      libraryViewerManifestSchema.safeParse({
        family: 'model_3d',
        ...ids,
        model: { url: 'https://x.test/m.step', format: 'step', converted: false },
        modelError: null,
        posterUrl: null,
      }).success,
    ).toBe(false);
  });
});
