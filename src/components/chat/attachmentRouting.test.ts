import { describe, expect, it } from 'bun:test';
import { classifyChatAttachment } from './attachmentRouting';

function file(name: string, type = ''): File {
  return new File(['x'], name, { type });
}

describe('classifyChatAttachment', () => {
  it('routes images and video to the Library', () => {
    expect(classifyChatAttachment(file('shot.png', 'image/png'))).toBe('media');
    expect(classifyChatAttachment(file('clip.mp4', 'video/mp4'))).toBe('media');
    expect(classifyChatAttachment(file('photo.heic', 'image/heic'))).toBe('media');
  });

  it('routes documents to the document pipeline', () => {
    expect(classifyChatAttachment(file('brief.pdf', 'application/pdf'))).toBe('document');
    expect(classifyChatAttachment(file('deck.pptx'))).toBe('document');
    expect(classifyChatAttachment(file('data.csv', 'text/csv'))).toBe('document');
  });

  // The whole reason the classifier is extension-first. Browsers report '' for .md and
  // frequently mis-report .docx; classifying on MIME alone ships those to the Media
  // Library, where nothing downstream can read them.
  it('classifies by extension even when the browser reports no MIME at all', () => {
    expect(classifyChatAttachment(file('notes.md', ''))).toBe('document');
    expect(classifyChatAttachment(file('contract.docx', ''))).toBe('document');
    expect(classifyChatAttachment(file('sheet.xlsx', ''))).toBe('document');
  });

  it('classifies by extension when the browser reports a wrong MIME', () => {
    expect(classifyChatAttachment(file('contract.docx', 'application/octet-stream'))).toBe(
      'document',
    );
  });

  it('is case-insensitive about the extension', () => {
    expect(classifyChatAttachment(file('BRIEF.PDF', ''))).toBe('document');
  });

  // Only the FINAL extension counts — otherwise an image whose name merely contains
  // ".pdf" would be sent down the text-extraction path.
  it('uses only the final extension', () => {
    expect(classifyChatAttachment(file('report.pdf.png', 'image/png'))).toBe('media');
  });

  it('falls back to the document path for a PDF whose name lost its extension', () => {
    expect(classifyChatAttachment(file('download', 'application/pdf'))).toBe('document');
  });

  it('defaults unknown files to media rather than burning an embed on them', () => {
    expect(classifyChatAttachment(file('mystery.bin', ''))).toBe('media');
  });
});
