'use client';

import type { FileUIPart } from 'ai';
import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react';
import {
  Attachment as AiAttachment,
  Attachments as AiAttachments,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/ai-elements/attachments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  kind: 'media' | 'document';
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
  // Retained only for retry while the composer is mounted. Removing the chip
  // deliberately does not remove the already-created Library asset.
  file?: File;
};

type AttachmentsProps = {
  files: Attachment[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

const toFilePart = (file: Attachment): FileUIPart & { id: string } => ({
  id: file.id,
  type: 'file',
  filename: file.name,
  mediaType: file.type || 'application/octet-stream',
  url: file.url ?? '',
});

export function Attachments({ files, onRemove, onRetry }: AttachmentsProps) {
  if (!files.length) return null;

  return (
    <AiAttachments variant="list" className="max-w-md">
      {files.map((file) => (
        <AiAttachment
          key={file.id}
          data={toFilePart(file)}
          onRemove={onRemove ? () => onRemove(file.id) : undefined}
          aria-invalid={file.status === 'error'}
          className={cn(file.status === 'error' && 'border-destructive')}
        >
          <AttachmentPreview fallbackIcon={<AttachmentStatusIcon file={file} />} />
          <AttachmentInfo />
          <AttachmentStatus file={file} onRetry={onRetry} />
          <AttachmentRemove label={`Remove ${file.name}`} />
        </AiAttachment>
      ))}
    </AiAttachments>
  );
}

function AttachmentStatus({ file, onRetry }: { file: Attachment; onRetry?: (id: string) => void }) {
  const isDocument = file.kind === 'document';

  if (file.status === 'uploading') {
    return <Badge variant="secondary">{isDocument ? 'Uploading…' : 'Uploading to Library…'}</Badge>;
  }

  if (file.status === 'indexing') {
    return <Badge variant="secondary">Indexing…</Badge>;
  }

  // A temporary document says so on the chip, so the 14-day life is visible at the
  // moment of sending and not only in the toast that has since disappeared.
  if (file.status === 'ready' && isDocument && file.retention === 'ephemeral') {
    return <Badge variant="outline">Temporary · 14d</Badge>;
  }

  if (file.status === 'error') {
    return (
      <div className="flex items-center gap-1">
        <span className="max-w-40 truncate text-xs text-destructive">
          {file.error ?? 'Upload failed'}
        </span>
        {onRetry ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRetry(file.id)}
            aria-label={`Retry ${file.name}`}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    );
  }

  return <Badge variant="secondary">In Library</Badge>;
}

function AttachmentStatusIcon({ file }: { file: Attachment }) {
  if (file.status === 'uploading' || file.status === 'indexing') {
    return <Loader2 className="animate-spin" aria-hidden="true" />;
  }
  if (file.status === 'error') return <AlertCircle aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}
