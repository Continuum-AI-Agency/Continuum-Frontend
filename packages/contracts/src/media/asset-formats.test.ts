import { describe, expect, it } from 'bun:test';
import {
  classifyLibraryFile,
  isLibraryFontFile,
  isPlayableSidecarPreview,
  LIBRARY_ACCEPT_ATTRIBUTE,
  libraryStorageBucket,
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
      classifyLibraryFile({ fileName: 'clip.mkv', mimeType: 'video/x-matroska' }).accepted,
    ).toBe(false);
  });

  it('publishes one picker accept value from the registry', () => {
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.aep');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.psd');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.zip');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.mxf');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.prproj');
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

  it('offers fonts on the drop target', () => {
    for (const extension of ['.ttf', '.otf', '.woff', '.woff2']) {
      expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain(extension);
    }
  });
});
