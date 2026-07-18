import { describe, expect, it } from 'bun:test';

import { isAcceptedUploadFile } from './useMediaUpload';

function file(name: string, type: string): File {
  return new File(['bytes'], name, { type });
}

describe('isAcceptedUploadFile', () => {
  it('accepts the supported image and video registry', () => {
    expect(isAcceptedUploadFile(file('photo.png', 'image/png'))).toBe(true);
    expect(isAcceptedUploadFile(file('clip.mov', 'video/quicktime'))).toBe(true);
  });

  it('accepts the core design and After Effects set by extension', () => {
    expect(isAcceptedUploadFile(file('intro.aep', ''))).toBe(true);
    expect(isAcceptedUploadFile(file('Intro.AEP', 'application/octet-stream'))).toBe(true);
    expect(isAcceptedUploadFile(file('layout.psd', 'image/vnd.adobe.photoshop'))).toBe(true);
    expect(isAcceptedUploadFile(file('deck.pdf', 'application/pdf'))).toBe(true);
    expect(isAcceptedUploadFile(file('logo.ai', 'application/pdf'))).toBe(true);
    expect(isAcceptedUploadFile(file('mark.svg', 'image/svg+xml'))).toBe(true);
    expect(isAcceptedUploadFile(file('scan.tiff', 'image/tiff'))).toBe(true);
    expect(isAcceptedUploadFile(file('photo.heic', 'image/heic'))).toBe(true);
    expect(isAcceptedUploadFile(file('collected-files.zip', 'application/zip'))).toBe(true);
  });

  it('rejects formats outside the explicit registry', () => {
    expect(isAcceptedUploadFile(file('raw.cr3', 'image/x-canon-cr3'))).toBe(false);
    expect(isAcceptedUploadFile(file('clip.mkv', 'video/x-matroska'))).toBe(false);
    expect(isAcceptedUploadFile(file('aep', ''))).toBe(false);
  });
});
