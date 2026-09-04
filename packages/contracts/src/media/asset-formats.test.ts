import { describe, expect, it } from 'bun:test';
import {
  classifyLibraryFile,
  isLibraryFontFile,
  LIBRARY_ACCEPT_ATTRIBUTE,
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
  ] as const)('accepts %s as %s', (fileName, mimeType, family) => {
    expect(classifyLibraryFile({ fileName, mimeType })).toMatchObject({ accepted: true, family });
  });

  it('does not treat arbitrary image and video MIME prefixes as supported', () => {
    expect(classifyLibraryFile({ fileName: 'raw.cr3', mimeType: 'image/x-canon-cr3' }).accepted).toBe(
      false,
    );
    expect(classifyLibraryFile({ fileName: 'clip.mkv', mimeType: 'video/x-matroska' }).accepted).toBe(
      false,
    );
  });

  it('publishes one picker accept value from the registry', () => {
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.aep');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.psd');
    expect(LIBRARY_ACCEPT_ATTRIBUTE).toContain('.zip');
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
