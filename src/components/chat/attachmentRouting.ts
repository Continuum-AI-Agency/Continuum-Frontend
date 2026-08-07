import { hasDocumentExtension } from '@/lib/documents/uploadLimits';

export type ChatAttachmentKind = 'media' | 'document';

/**
 * Decides whether a composer attachment goes to the Media Library (pixels the model
 * can see) or the brand-document pipeline (text the model reads through retrieval).
 *
 * EXTENSION-FIRST, MIME SECOND — deliberately. Browsers report an empty MIME for `.md`
 * and frequently mis-report `.docx`, so a MIME-only classifier silently ships markdown
 * and Word files to the Library, where nothing downstream can read them. That is the
 * same class of failure as the existing bug where a PDF reached the model as nothing.
 *
 * Only the FINAL extension counts: `report.pdf.png` is an image.
 */
export function classifyChatAttachment(file: File): ChatAttachmentKind {
  if (hasDocumentExtension(file.name)) return 'document';

  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) return 'media';

  // A PDF whose name somehow lacks the extension still belongs to the document path.
  if (mime === 'application/pdf') return 'document';

  return 'media';
}
