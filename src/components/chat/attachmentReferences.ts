import type {
  AgentAttachment,
  AgentDocumentAttachment,
  AgentMentionReference,
} from '@continuum/contracts';
import type { Attachment } from './attachments';

type AttachmentContext = {
  /** Media only — things the model sees as pixels. */
  attachments: AgentAttachment[];
  /** Documents — identities the Backend resolves to chunks server-side. */
  documents: AgentDocumentAttachment[];
  /** Pasted text carried directly in the turn instead of stored or indexed. */
  inlineTexts: Array<{ id: string; name: string; text: string }>;
  references: AgentMentionReference[];
};

const isReadyLibraryAttachment = (
  attachment: Attachment,
): attachment is Attachment & {
  assetId: string;
  url: string;
} =>
  attachment.kind === 'media' &&
  attachment.status === 'ready' &&
  Boolean(attachment.assetId) &&
  Boolean(attachment.url);

const isReadyDocumentAttachment = (
  attachment: Attachment,
): attachment is Attachment & { documentId: string } =>
  attachment.kind === 'document' && attachment.status === 'ready' && Boolean(attachment.documentId);

export function buildAgentAttachmentContext(
  files: readonly Attachment[],
  source: AgentMentionReference['source'],
): AttachmentContext {
  const attachments: AgentAttachment[] = [];
  const documents: AgentDocumentAttachment[] = [];
  const inlineTexts: AttachmentContext['inlineTexts'] = [];
  const references: AgentMentionReference[] = [];

  for (const file of files) {
    if (file.kind === 'inline-text' && file.status === 'ready' && file.text) {
      inlineTexts.push({ id: file.id, name: file.name, text: file.text });
      continue;
    }

    // A document becomes a `document` reference — exactly the shape an @-mention from
    // the Brain folder already produces, which the Organic agent resolves through
    // getDocumentChunks. Routing it through `attachments` instead would put it on the
    // pixels path, where non-image parts are silently dropped.
    if (isReadyDocumentAttachment(file)) {
      documents.push({
        documentId: file.documentId,
        name: file.name,
        mediaType: file.type,
        ...(file.storagePath ? { storagePath: file.storagePath } : {}),
        ...(file.retention ? { retention: file.retention } : {}),
        ...(file.expiresAt ? { expiresAt: file.expiresAt } : {}),
      });
      references.push({
        id: file.documentId,
        type: 'document',
        label: file.name,
        source,
        metadata: {
          mimeType: file.type,
          ...(file.retention ? { retention: file.retention } : {}),
          ...(file.expiresAt ? { expiresAt: file.expiresAt } : {}),
        },
      });
      continue;
    }

    if (!isReadyLibraryAttachment(file)) continue;
    attachments.push({
      assetId: file.assetId,
      ...(file.versionId ? { versionId: file.versionId } : {}),
      url: file.url,
      name: file.name,
      mediaType: file.type,
      ...(file.storagePath ? { storagePath: file.storagePath } : {}),
    });
    references.push({
      id: file.assetId,
      type: 'media_asset',
      label: file.name,
      source,
      metadata: {
        mimeType: file.type,
        mediaType: file.type,
        previewUrl: file.url,
        ...(file.versionId ? { versionId: file.versionId } : {}),
        ...(file.storagePath ? { storagePath: file.storagePath } : {}),
      },
    });
  }

  return { attachments, documents, inlineTexts, references };
}

export function buildInlineTextContextBlock(
  inlineTexts: readonly AttachmentContext['inlineTexts'][number][],
): string {
  if (inlineTexts.length === 0) return '';
  return [
    'The user attached the following pasted text as context for this turn.',
    ...inlineTexts.map(
      (item) => `<pasted_text name=${JSON.stringify(item.name)}>\n${item.text}\n</pasted_text>`,
    ),
  ].join('\n\n');
}

export function mergeAttachmentReferences(
  references: readonly AgentMentionReference[],
  files: readonly Attachment[],
  source: AgentMentionReference['source'],
): AgentMentionReference[] {
  const result = [...references];
  const seen = new Set(result.map((reference) => `${reference.type}:${reference.id}`));

  for (const reference of buildAgentAttachmentContext(files, source).references) {
    const key = `${reference.type}:${reference.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reference);
  }

  return result;
}
