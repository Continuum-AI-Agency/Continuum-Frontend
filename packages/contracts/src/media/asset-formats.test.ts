import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classifyLibraryFile,
  classifyLibraryFileOrGeneric,
  classifyZipEntries,
  htmlBundleEntryPoint,
  isLibraryFontFile,
  isPlayableSidecarPreview,
  LIBRARY_ACCEPT_ATTRIBUTE,
  LIBRARY_FORMATS,
  LIBRARY_PROJECT_FILE_MAX_BYTES,
  LIBRARY_UPLOAD_MAX_BYTES,
  LIBRARY_ZIP_FORMATS,
  libraryStorageBucket,
  libraryUploadRefusal,
} from './asset-formats';

describe('Library format registry', () => {
  it.each([
    ['layout.psd', 'image/vnd.adobe.photoshop', 'design_source'],
    ['deck.pdf', 'application/pdf', 'document'],
    ['logo.ai', 'application/pdf', 'design_source'],
    ['mark.svg', 'image/svg+xml', 'design_source'],
    ['scan.tiff', 'image/tiff', 'design_source'],
    ['photo.heic', 'image/heic', 'design_source'],
    ['scene.aep', 'application/octet-stream', 'after_effects'],
    ['scene.aepx', 'application/xml', 'after_effects'],
    ['template.aet', '', 'after_effects'],
    ['collected-files.zip', 'application/zip', 'after_effects_package'],
    ['camera.mxf', 'application/mxf', 'broadcast_video'],
    ['tape.mxf', 'video/mxf', 'broadcast_video'],
    ['cut.prproj', '', 'premiere_project'],
  ] as const)('accepts %s as %s', (fileName, mimeType, family) => {
    expect(classifyLibraryFile({ fileName, mimeType })).toMatchObject({ accepted: true, family });
  });

  it('does not treat arbitrary image and video MIME prefixes as supported', () => {
    expect(
      classifyLibraryFile({ fileName: 'raw.cr3', mimeType: 'image/x-canon-cr3' }).accepted,
    ).toBe(false);
    expect(
      classifyLibraryFile({ fileName: 'clip.r3d', mimeType: 'video/x-red-r3d' }).accepted,
    ).toBe(false);
  });

  it('lets the Library pickers choose any file', () => {
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toBe('');
  });

  it('files MXF next to project files, not in the 500MB viewer bucket', () => {
    const mxf = classifyLibraryFile({ fileName: 'camera.mxf', mimeType: 'application/mxf' });
    expect(mxf.accepted).toBe(true);
    if (!mxf.accepted) throw new Error('expected MXF');
    expect(mxf.originalKind).toBe('video');
    expect(mxf.previewStrategy).toBe('proxy_transcode');
    expect(libraryStorageBucket(mxf)).toBe('media-source');
  });
});

describe('container video (MKV / AVI / WMV)', () => {
  it.each([
    ['clip.mkv', 'video/x-matroska'],
    ['clip.avi', 'video/x-msvideo'],
    ['clip.avi', 'video/avi'],
    ['clip.wmv', 'video/x-ms-wmv'],
    ['clip.wmv', 'video/x-ms-asf'],
    ['CLIP.MKV', ''],
    ['clip.bin', 'video/x-matroska'],
    ['clip', 'video/x-ms-wmv'],
  ] as const)('%s (%s) plays through a server proxy stored in the viewer bucket', (fileName, mimeType) => {
    const format = classifyLibraryFile({ fileName, mimeType });
    if (!format.accepted) throw new Error(`expected ${fileName} to be accepted`);
    expect(format.family).toBe('container_video');
    expect(format.originalKind).toBe('video');
    expect(format.previewStrategy).toBe('proxy_transcode');
    expect(libraryStorageBucket(format)).toBe('media-library');
  });

  it('accepts a same-stem MP4 sidecar while the proxy is pending', () => {
    expect(
      isPlayableSidecarPreview({ sourceFileName: 'tape.wmv', companionFileName: 'tape.mp4' }),
    ).toBe(true);
  });
});

describe('office documents', () => {
  it.each([
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['old.doc', 'application/msword'],
    ['old.ppt', 'application/vnd.ms-powerpoint'],
    ['old.xls', 'application/vnd.ms-excel'],
    ['brief.docx', 'application/octet-stream'],
    ['upload', 'application/vnd.ms-excel'],
  ] as const)('%s (%s) is an honest no-preview source file', (fileName, mimeType) => {
    const format = classifyLibraryFile({ fileName, mimeType });
    if (!format.accepted) throw new Error(`expected ${fileName} to be accepted`);
    expect(format.family).toBe('office_document');
    expect(format.originalKind).toBe('file');
    expect(format.previewStrategy).toBe('none');
    expect(libraryStorageBucket(format)).toBe('media-source');
  });
});

describe('playable sidecar previews for After Effects', () => {
  it('attaches a same-stem movie dropped with the project', () => {
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'Vivo47_v11.aep',
        companionFileName: 'Vivo47_v11.mp4',
      }),
    ).toBe(true);
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'Vivo47_v11.aep',
        companionFileName: 'Vivo47_v11_preview.mov',
      }),
    ).toBe(true);
  });

  it('refuses a movie that is not a sidecar of this project', () => {
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'Vivo47_v11.aep',
        companionFileName: 'other.mp4',
      }),
    ).toBe(false);
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'Vivo47_v11.aep',
        companionFileName: 'Vivo47_v11.png',
      }),
    ).toBe(false);
    expect(
      isPlayableSidecarPreview({ sourceFileName: 'hero.png', companionFileName: 'hero.mp4' }),
    ).toBe(false);
  });

  it('attaches a same-stem movie dropped with an MXF or Premiere project', () => {
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'A001C001.mxf',
        companionFileName: 'A001C001.mp4',
      }),
    ).toBe(true);
    expect(
      isPlayableSidecarPreview({
        sourceFileName: 'spot.prproj',
        companionFileName: 'spot_preview.mp4',
      }),
    ).toBe(true);
  });
});

describe('fonts are accepted but never stored as media', () => {
  it.each([
    ['HeadingNow-Bold.ttf', 'font/ttf'],
    ['DuplicateSlab.otf', ''],
    ['Inter.woff2', 'font/woff2'],
    ['Legacy.woff', 'application/x-font-ttf'],
  ] as const)('classifies %s as a font', (fileName, mimeType) => {
    expect(classifyLibraryFile({ fileName, mimeType })).toMatchObject({
      accepted: true,
      family: 'font',
      // Never drawn: the face is licensed to the brand and is never served to a browser.
      previewStrategy: 'none',
    });
    expect(isLibraryFontFile({ fileName, mimeType })).toBe(true);
  });

  it('does not mistake a template or a creative for a font', () => {
    // The load-bearing direction: a false positive here would send an .aep to the font
    // store, where storeBrandFont would reject it — but a false NEGATIVE would put a
    // licensed face into media.assets, which is where share links and signed URLs live.
    for (const fileName of ['scene.aep', 'collected.zip', 'hero.png', 'cut.mp4', 'deck.pdf']) {
      expect(isLibraryFontFile({ fileName, mimeType: '' })).toBe(false);
    }
  });
});

describe('format parity widening (Wave 0)', () => {
  it.each([
    ['clip.3gp', '', 'container_video', 'video', 'proxy_transcode'],
    ['clip.3g2', 'video/3gpp2', 'container_video', 'video', 'proxy_transcode'],
    ['clip.flv', 'video/x-flv', 'container_video', 'video', 'proxy_transcode'],
    ['scan.bmp', 'image/bmp', 'raster_image', 'image', 'native'],
    ['vo.aiff', 'audio/aiff', 'audio', 'audio', 'proxy_transcode'],
    ['vo.aif', '', 'audio', 'audio', 'proxy_transcode'],
    ['vo.wma', 'audio/x-ms-wma', 'audio', 'audio', 'proxy_transcode'],
    ['plate.tga', '', 'design_source', 'file', 'none'],
    ['plate.exr', 'image/x-exr', 'design_source', 'file', 'none'],
    ['logo.eps', '', 'design_source', 'file', 'companion'],
    ['layout.indd', '', 'design_source', 'file', 'embedded_pages'],
    ['cut.prproj', 'application/octet-stream', 'premiere_project', 'file', 'companion'],
    ['bottle.glb', 'model/gltf-binary', 'model_3d', 'file', 'model_viewer'],
    ['part.STEP', '', 'model_3d', 'file', 'model_viewer'],
    ['part.igs', '', 'model_3d', 'file', 'model_viewer'],
    ['scene.usdz', 'model/vnd.usdz+zip', 'model_3d', 'file', 'model_viewer'],
  ] as const)('%s (%s) is %s, kind %s, preview %s', (fileName, mimeType, family, kind, strategy) => {
    const format = classifyLibraryFile({ fileName, mimeType });
    if (!format.accepted) throw new Error(`expected ${fileName} to be accepted`);
    expect(format.family).toBe(family);
    expect(format.originalKind).toBe(kind);
    expect(format.previewStrategy).toBe(strategy);
  });

  it('files every 3D model and InDesign document in media-source', () => {
    for (const fileName of [
      'a.glb',
      'a.gltf',
      'a.obj',
      'a.stl',
      'a.fbx',
      'a.ply',
      'a.dae',
      'a.3ds',
      'a.stp',
      'a.iges',
      'a.indd',
    ]) {
      const format = classifyLibraryFile({ fileName });
      if (!format.accepted) throw new Error(`expected ${fileName} to be accepted`);
      expect(libraryStorageBucket(format)).toBe('media-source');
    }
  });

  it('never claims one extension for two formats, so extension order cannot decide', () => {
    const extensions = LIBRARY_FORMATS.flatMap((format) => format.extensions);
    expect(new Set(extensions).size).toBe(extensions.length);
  });

  it('is importable by path from an edge function: the module imports nothing', () => {
    const source = readFileSync(join(import.meta.dir, 'asset-formats.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});

describe('accept anything', () => {
  it.each([
    ['notes.txt', 'text/plain'],
    ['mail.eml', 'message/rfc822'],
    ['plan.dwg', ''],
    ['README', ''],
    ['clip.r3d', 'application/octet-stream'],
  ] as const)('%s is a generic file in media-source, never drawn', (fileName, mimeType) => {
    expect(classifyLibraryFile({ fileName, mimeType }).accepted).toBe(false);
    const format = classifyLibraryFileOrGeneric({ fileName, mimeType });
    expect(format).toMatchObject({
      accepted: true,
      family: 'generic',
      originalKind: 'file',
      previewStrategy: 'none',
    });
    expect(libraryStorageBucket(format)).toBe('media-source');
  });

  it('keeps a known format when there is one', () => {
    expect(classifyLibraryFileOrGeneric({ fileName: 'hero.png' }).family).toBe('raster_image');
    expect(classifyLibraryFileOrGeneric({ fileName: 'Inter.woff2' }).family).toBe('font');
  });
});

describe('ZIP contents decide the family', () => {
  it('finds an After Effects Collect Files export', () => {
    expect(
      classifyZipEntries(['Spot/', 'Spot/Spot.aep', 'Spot/(Footage)/a.mov', 'Spot/index.html']),
    ).toBe('aep_package');
    expect(classifyZipEntries(['scene.AEPX'])).toBe('aep_package');
  });

  it('finds an HTML bundle at the root or under one wrapping folder', () => {
    expect(classifyZipEntries(['index.html', 'main.js', 'img/a.png'])).toBe('html_bundle');
    expect(
      classifyZipEntries([
        'banner/',
        'banner/INDEX.HTM',
        'banner/app.js',
        '__MACOSX/banner/._app.js',
      ]),
    ).toBe('html_bundle');
    expect(htmlBundleEntryPoint(['banner/index.html', 'banner/app.js', '.DS_Store'])).toBe(
      'banner/index.html',
    );
    expect(htmlBundleEntryPoint(['site\\index.html', 'site\\a.css'])).toBe('site/index.html');
  });

  it('calls anything else an archive', () => {
    expect(classifyZipEntries(['a/index.html', 'b/index.html'])).toBe('archive');
    expect(classifyZipEntries(['docs/deep/index.html', 'docs/other.txt'])).toBe('archive');
    expect(classifyZipEntries(['__MACOSX/._scene.aep', 'photo.jpg'])).toBe('archive');
    expect(classifyZipEntries([])).toBe('archive');
  });

  it('maps each kind to a format definition', () => {
    expect(LIBRARY_ZIP_FORMATS.aep_package.family).toBe('after_effects_package');
    expect(LIBRARY_ZIP_FORMATS.html_bundle).toMatchObject({
      family: 'html_bundle',
      previewStrategy: 'html_sandbox',
    });
    expect(libraryStorageBucket(LIBRARY_ZIP_FORMATS.html_bundle)).toBe('media-source');
    expect(LIBRARY_ZIP_FORMATS.archive.family).toBe('generic');
    // By extension alone a ZIP is still an AE package, exactly as before.
    expect(classifyLibraryFile({ fileName: 'x.zip' })).toMatchObject({
      family: 'after_effects_package',
    });
  });
});

describe('libraryUploadRefusal (decided before any byte is sent)', () => {
  const MB = 1024 * 1024;

  it('accepts any file under the caps, including unknown types and big documents', () => {
    for (const fileName of ['notes.msg', 'mail.eml', 'a.txt', 'clip.r3d', 'scene.usdz', 'x']) {
      expect(libraryUploadRefusal({ fileName, sizeBytes: 10 * MB })).toBeNull();
    }
    expect(libraryUploadRefusal({ fileName: 'deck.pdf', sizeBytes: 400 * MB })).toBeNull();
    expect(libraryUploadRefusal({ fileName: 'unsized.bin' })).toBeNull();
  });

  it('names every refusal: fonts, the Storage cap, and the forge project-file cap', () => {
    expect(libraryUploadRefusal({ fileName: 'Brand.otf', sizeBytes: 1 })).toContain('is a font');
    expect(
      libraryUploadRefusal({ fileName: 'huge.mov', sizeBytes: LIBRARY_UPLOAD_MAX_BYTES + 1 }),
    ).toBe('huge.mov is 500 MB — uploads are capped at 500 MB right now.');
    expect(
      libraryUploadRefusal({ fileName: 'comp.aep', sizeBytes: LIBRARY_PROJECT_FILE_MAX_BYTES + MB }),
    ).toBe('comp.aep is 251 MB — After Effects projects and packages must be 250 MB or smaller.');
    expect(libraryUploadRefusal({ fileName: 'pkg.zip', sizeBytes: 300 * MB })).toContain(
      'must be 250 MB',
    );
    expect(libraryUploadRefusal({ fileName: 'comp.aep', sizeBytes: 250 * MB })).toBeNull();
  });
});
