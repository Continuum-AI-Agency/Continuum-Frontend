import { describe, expect, it } from 'bun:test';

import { isAcceptedUploadFile } from './useMediaUpload';

function file(name: string, type: string): File {
  return new File(['bytes'], name, { type });
}

describe('isAcceptedUploadFile', () => {
  it('accepts images and videos by mime prefix', () => {
    expect(isAcceptedUploadFile(file('photo.png', 'image/png'))).toBe(true);
    expect(isAcceptedUploadFile(file('clip.mov', 'video/quicktime'))).toBe(true);
  });

  it('accepts .aep by extension when the browser reports no useful mime', () => {
    expect(isAcceptedUploadFile(file('intro.aep', ''))).toBe(true);
    expect(isAcceptedUploadFile(file('Intro.AEP', 'application/octet-stream'))).toBe(true);
  });

  it('still silently rejects genuinely unsupported files', () => {
    expect(isAcceptedUploadFile(file('doc.pdf', 'application/pdf'))).toBe(false);
    expect(isAcceptedUploadFile(file('archive.zip', ''))).toBe(false);
    expect(isAcceptedUploadFile(file('aep', ''))).toBe(false);
  });
});
