'use client';

import { FORGE_PROJECT_FILE_MAX_MB, type TemplateSourceSummary } from '@continuum/contracts';
import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const FORGE_PROJECT_ACCEPT = '.aep,.aepx,.aet,.zip';

/** The Library upload records no checksum above this size, so a bigger file has nothing to match. */
const HASHED_UP_TO_BYTES = 64 * 1024 * 1024;

/** sha256 hex of a dropped file, the same digest the upload stores as the source's checksum. */
export async function fileSha256(file: Blob): Promise<string | null> {
  if (file.size > HASHED_UP_TO_BYTES) return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  }
}

export type DroppedFileMatch =
  | { kind: 'same'; source: TemplateSourceSummary }
  | { kind: 'named'; source: TemplateSourceSummary }
  | { kind: 'new' };

/**
 * A dropped file against the templates already here: the same bytes (open that one, upload
 * nothing), the same file name (a new revision, or a new template — the person says which), or new.
 * A source that recorded no checksum never matches on bytes.
 */
export function matchDroppedFile(
  fileName: string,
  checksum: string | null,
  sources: readonly TemplateSourceSummary[],
): DroppedFileMatch {
  const same = checksum
    ? sources.find((source) => source.sourceChecksum?.toLowerCase() === checksum.toLowerCase())
    : undefined;
  if (same) return { kind: 'same', source: same };
  const named = sources.find((source) => source.parse?.filename === fileName);
  return named ? { kind: 'named', source: named } : { kind: 'new' };
}

/**
 * Storage's size refusal as a sentence naming the limit. The TUS endpoint answers 413 before a byte
 * moves, which the resumable client reports only as a status; a direct upload carries the text.
 */
export function uploadRefusal(
  file: { name: string; sizeBytes: number },
  error: string | undefined,
): string | null {
  if (!error || !/exceeded the maximum allowed size|failed \(413\)/i.test(error)) return null;
  const megabytes = Math.max(1, Math.round(file.sizeBytes / (1024 * 1024)));
  return `${file.name} is ${megabytes} MB, over the ${FORGE_PROJECT_FILE_MAX_MB} MB upload limit, so it was not uploaded. Ask an admin to raise the limit.`;
}

export function partitionForgeProjectFiles(files: File[]): { accepted: File[]; rejected: File[] } {
  return files.reduce<{ accepted: File[]; rejected: File[] }>(
    (result, file) => {
      const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      (['.aep', '.aepx', '.aet', '.zip'].includes(extension)
        ? result.accepted
        : result.rejected
      ).push(file);
      return result;
    },
    { accepted: [], rejected: [] },
  );
}

export function ForgeProjectDrop({
  onFiles,
  onRejected,
}: {
  onFiles: (files: File[]) => void;
  onRejected: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const choose = () => input.current?.click();
  const receive = (files: File[]) => {
    const { accepted, rejected } = partitionForgeProjectFiles(files);
    if (rejected.length) onRejected(rejected);
    if (accepted.length) onFiles(accepted);
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={FORGE_PROJECT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Project files"
        onChange={(event) => {
          receive(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={cn(
          'h-full min-h-40 w-full flex-col items-center justify-center gap-2 whitespace-normal rounded-xl border-dashed px-[var(--card-pad)] py-6 text-center',
          dragDepth > 0 && 'border-primary bg-primary/5',
        )}
        onClick={choose}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragDepth((depth) => Math.max(0, depth - 1));
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          receive(Array.from(event.dataTransfer.files));
        }}
      >
        <span className="flex items-center gap-2 text-sm">
          <FileUp aria-hidden />
          New template
        </span>
        <span className="max-w-60 text-xs font-normal text-muted-foreground">
          Drop an After Effects project (.aep, .aepx, .aet or .zip) or click to choose one.
        </span>
      </Button>
    </>
  );
}
