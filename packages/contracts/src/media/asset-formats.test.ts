import { describe, expect, it } from 'bun:test';
import { classifyLibraryFile, LIBRARY_ACCEPT_ATTRIBUTE } from './asset-formats';

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
