'use client';

import { Cross2Icon, FileIcon } from '@radix-ui/react-icons';
import { AlertCircle, BookmarkPlus, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatMediaThumb } from './media/ChatMedia';
import { mediaFromAttachment } from './media/media';

export type ChatAttachmentStatus = 'uploading' | 'ready' | 'error';

export type Attachment = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  size?: string;
  status?: ChatAttachmentStatus;
  // Retained so an expired signed URL can be re-minted instead of the attachment being lost.
  storagePath?: string;
  error?: string;
  // The original handle, kept for the life of the composer so "Save to library" can re-upload
  // through the media-library register path without refetching what we just sent.
  file?: File;
  savedAssetId?: string;
  saving?: boolean;
};

type AttachmentsProps = {
  files: Attachment[];
  onRemove?: (id: string) => void;
  onSaveToLibrary?: (id: string) => void;
};

export function Attachments({ files, onRemove, onSaveToLibrary }: AttachmentsProps) {
  if (!files.length) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {files.map((file) => (
        <AttachmentChip
          key={file.id}
          file={file}
          onRemove={onRemove}
          onSaveToLibrary={onSaveToLibrary}
        />
      ))}
    </div>
  );
}

function AttachmentChip({
  file,
  onRemove,
  onSaveToLibrary,
}: {
  file: Attachment;
  onRemove?: (id: string) => void;
  onSaveToLibrary?: (id: string) => void;
}) {
  const isError = file.status === 'error';
  const isUploading = file.status === 'uploading';
  const canSave = Boolean(onSaveToLibrary) && file.status === 'ready' && Boolean(file.file);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border bg-muted/40 p-3 pr-8 transition-colors hover:bg-muted/60',
        isError && 'border-destructive/50 bg-destructive/5',
      )}
    >
      <div className="flex items-center gap-3">
        <AttachmentPreview file={file} />
        <div className="min-w-0">
          <div className="line-clamp-1 max-w-[150px] text-sm font-medium text-foreground">
            {file.name}
          </div>
          <div className={cn('text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
            {isError ? (file.error ?? 'Upload failed') : isUploading ? 'Uploading…' : file.size}
          </div>
        </div>

        {canSave ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={file.saving || Boolean(file.savedAssetId)}
            onClick={() => onSaveToLibrary?.(file.id)}
            aria-label={
              file.savedAssetId ? `${file.name} saved to library` : `Save ${file.name} to library`
            }
            title={file.savedAssetId ? 'Saved to library' : 'Save to library'}
          >
            {file.saving ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : file.savedAssetId ? (
              <Check className="text-emerald-500" aria-hidden="true" />
            ) : (
              <BookmarkPlus aria-hidden="true" />
            )}
          </Button>
        ) : null}
      </div>

      {onRemove && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(file.id);
            }}
            aria-label={`Remove ${file.name}`}
          >
            <Cross2Icon aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AttachmentPreview({ file }: { file: Attachment }) {
  if (file.status === 'uploading') {
    return (
      <div className="flex size-10 items-center justify-center rounded bg-primary/10 text-primary">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (file.status === 'error') {
    return (
      <div className="flex size-10 items-center justify-center rounded bg-destructive/10 text-destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
      </div>
    );
  }

  // An uploaded video used to fall through to a generic file icon. The shared primitive gives it
  // the same poster frame the rest of the transcript shows.
  const media = mediaFromAttachment(file);
  if (media) {
    return (
      <div className="size-10 shrink-0">
        <ChatMediaThumb media={media} />
      </div>
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded bg-primary/10 text-primary">
      <FileIcon width={18} height={18} aria-hidden="true" />
    </div>
  );
}
