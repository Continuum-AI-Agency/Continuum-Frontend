'use client';

import { Cross2Icon, FileIcon } from '@radix-ui/react-icons';

import { Button } from '@/components/ui/button';

export type Attachment = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  size?: string;
};

type AttachmentsProps = {
  files: Attachment[];
  onRemove?: (id: string) => void;
};

export function Attachments({ files, onRemove }: AttachmentsProps) {
  if (!files.length) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {files.map((file) => (
        <div
          key={file.id}
          className="relative overflow-hidden rounded-lg border bg-muted/40 p-3 pr-8 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-3">
            <div className="rounded bg-primary/10 p-2 text-primary">
              <FileIcon width={18} height={18} aria-hidden="true" />
            </div>
            <div>
              <div className="line-clamp-1 max-w-[150px] text-sm font-medium text-foreground">
                {file.name}
              </div>
              {file.size && <div className="text-xs text-muted-foreground">{file.size}</div>}
            </div>
          </div>
          {onRemove && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(file.id);
                }}
                aria-label={`Remove ${file.name}`}
              >
                <Cross2Icon aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
