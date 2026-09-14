'use client';

import { FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const FORGE_PROJECT_ACCEPT = '.aep,.aepx,.aet,.zip';

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
          'h-auto min-h-28 w-full flex-col items-start gap-2 whitespace-normal border-dashed px-[var(--card-pad)] py-4 text-left',
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
          Choose a project
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          Drop .aep, .aepx, .aet, or .zip files here. They upload to your Library and are analyzed
          automatically.
        </span>
      </Button>
    </>
  );
}
