'use client';

import { AlertCircle, Check, FileText, Loader2, RefreshCw, X } from 'lucide-react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromAttachment } from '@/components/chat/media/media';
import {
  AttachmentAction,
  AttachmentActions,
  Attachment as AttachmentChip,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import type { AgentDocumentAttachment } from '@/lib/agent-references';

// 'indexing' exists because for a DOCUMENT, uploaded does not mean usable — the text
// still has to be extracted, chunked and embedded before the agent can retrieve any of
// it. Folding it into the composer's isUploading gate is what stops a send from racing
// ahead of ingest and the model silently receiving nothing.
export type ChatAttachmentStatus = 'uploading' | 'indexing' | 'ready' | 'error';

export type Attachment = {
  id: string;
  /**
   * Which pipeline this attachment went through. Set at add() time and never
   * undefined, so downstream code branches on a discriminant rather than guessing
   * from which optional fields happen to be populated.
   */
  kind: 'media' | 'document' | 'inline-text';
  assetId?: string;
  versionId?: string;
  /** Set for kind === 'document'. The agent resolves chunks from this server-side. */
  documentId?: string;
  retention?: 'permanent' | 'ephemeral';
  expiresAt?: string;
  name: string;
  /** Media only. A document has no renderable URL and deliberately leaves this unset. */
  url?: string;
  type?: string;
  size?: string;
  status?: ChatAttachmentStatus;
  // Retained so an expired signed URL can be re-minted instead of the attachment being lost.
  storagePath?: string;
  error?: string;
  /** Pasted text carried directly with the next turn; never uploaded or indexed. */
  text?: string;
  // Retained only for retry while the composer is mounted. Removing the chip
  // deliberately does not remove the already-created Library asset.
  file?: File;
};

type AttachmentsProps = {
  files: Attachment[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

const CHIP_STATE = {
  uploading: 'uploading',
  indexing: 'processing',
  error: 'error',
  ready: 'done',
} as const satisfies Record<ChatAttachmentStatus, string>;

/** The composer's pending-attachment chips, shared by every agent chat. */
export function Attachments({ files, onRemove, onRetry }: AttachmentsProps) {
  if (!files.length) return null;

  return (
    <AttachmentGroup>
      {files.map((file) => {
        const media = mediaFromAttachment(file);
        // An error chip shows the error glyph, never a half-uploaded preview.
        const thumb = media && media.kind !== 'file' && file.status !== 'error' ? media : null;

        return (
          <AttachmentChip
            key={file.id}
            size="sm"
            state={file.status ? CHIP_STATE[file.status] : 'done'}
            aria-invalid={file.status === 'error'}
            className="max-w-64"
          >
            <AttachmentMedia variant={thumb ? 'image' : 'icon'}>
              {thumb ? (
                <ChatMediaThumb media={thumb} className="rounded-none" />
              ) : (
                <AttachmentStatusIcon file={file} />
              )}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{file.name}</AttachmentTitle>
              <AttachmentDescription>{statusText(file)}</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              {file.status === 'error' && onRetry ? (
                <AttachmentAction
                  type="button"
                  onClick={() => onRetry(file.id)}
                  aria-label={`Retry ${file.name}`}
                >
                  <RefreshCw aria-hidden="true" />
                </AttachmentAction>
              ) : null}
              {onRemove ? (
                <AttachmentAction
                  type="button"
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  <X aria-hidden="true" />
                </AttachmentAction>
              ) : null}
            </AttachmentActions>
          </AttachmentChip>
        );
      })}
    </AttachmentGroup>
  );
}

function statusText(file: Attachment): string {
  const isDocument = file.kind === 'document';

  if (file.status === 'uploading') return isDocument ? 'Uploading…' : 'Uploading to Library…';
  if (file.status === 'indexing') return 'Indexing…';
  if (file.status === 'error') return file.error ?? 'Upload failed';
  // A temporary document says so on the chip, so the 14-day life is visible at the
  // moment of sending and not only in the toast that has since disappeared.
  if (file.status === 'ready' && isDocument && file.retention === 'ephemeral') {
    return 'Temporary · 14d';
  }
  if (file.status === 'ready' && file.kind === 'inline-text') return 'Included';
  return 'In Library';
}

function AttachmentStatusIcon({ file }: { file: Attachment }) {
  if (file.status === 'uploading' || file.status === 'indexing') {
    return <Loader2 className="animate-spin" aria-hidden="true" />;
  }
  if (file.status === 'error') return <AlertCircle aria-hidden="true" />;
  if (file.kind === 'document') return <FileText aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}

/**
 * The documents a sent user turn carried. Without this a document attachment vanished the
 * moment the turn was sent: the transcript only ever rendered pixels (`ChatMediaGrid`).
 */
export function SentDocumentAttachments({
  documents,
}: {
  documents?: readonly AgentDocumentAttachment[];
}) {
  if (!documents?.length) return null;

  return (
    <AttachmentGroup>
      {documents.map((document) => (
        <AttachmentChip key={document.documentId} size="xs" className="max-w-56">
          <AttachmentMedia>
            <FileText aria-hidden="true" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{document.name ?? 'Document'}</AttachmentTitle>
            <AttachmentDescription>{sentDocumentText(document)}</AttachmentDescription>
          </AttachmentContent>
        </AttachmentChip>
      ))}
    </AttachmentGroup>
  );
}

function sentDocumentText(document: AgentDocumentAttachment): string {
  if (document.retention !== 'ephemeral') return 'Document';
  const expires = document.expiresAt ? new Date(document.expiresAt) : null;
  return expires && !Number.isNaN(expires.getTime())
    ? `Temporary · expires ${expires.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : 'Temporary';
}
