'use client';

import type { FileUIPart } from 'ai';
import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react';
import {
  Attachment as AiAttachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments as AiAttachments,
} from '@/components/ai-elements/attachments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChatAttachmentStatus = 'uploading' | 'ready' | 'error';

export type Attachment = {
  id: string;
  assetId?: string;
  versionId?: string;
  name: string;
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

function AttachmentStatus({
  file,
  onRetry,
}: {
  file: Attachment;
  onRetry?: (id: string) => void;
}) {
  if (file.status === 'uploading') {
    return <Badge variant="secondary">Uploading to Library…</Badge>;
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
  if (file.status === 'uploading') return <Loader2 className="animate-spin" aria-hidden="true" />;
  if (file.status === 'error') return <AlertCircle aria-hidden="true" />;
  return <Check aria-hidden="true" />;
}
