import type {
  AgentAttachment,
  AgentMentionReference,
} from '@continuum/contracts';
import type { Attachment } from './attachments';

type AttachmentContext = {
  attachments: AgentAttachment[];
  references: AgentMentionReference[];
};

const isReadyLibraryAttachment = (
  attachment: Attachment,
): attachment is Attachment & {
  assetId: string;
  url: string;
} =>
  attachment.status === 'ready' &&
  Boolean(attachment.assetId) &&
  Boolean(attachment.url);

export function buildAgentAttachmentContext(
  files: readonly Attachment[],
  source: AgentMentionReference['source'],
): AttachmentContext {
  const attachments: AgentAttachment[] = [];
  const references: AgentMentionReference[] = [];

  for (const file of files) {
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

  return { attachments, references };
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
