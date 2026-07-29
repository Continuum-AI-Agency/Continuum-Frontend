'use client';

import { CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { completeMcpUploadIntent, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

const MAX_FILES = 8;
const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

type Props = {
  brandId: string;
};

export function McpUploadIntentPanel({ brandId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uploadIntentId = searchParams.get('mcpUploadIntent');
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const invalidFile = useMemo(
    () => files.find((file) => !ACCEPTED_IMAGE_TYPES.has(file.type)),
    [files],
  );

  if (!uploadIntentId) return null;

  const finish = async () => {
    if (files.length < 1 || files.length > MAX_FILES || invalidFile) return;
    setState('uploading');
    setMessage(null);
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadMediaAsset({ file, brandId }));
      }
      await completeMcpUploadIntent({
        brandId,
        uploadIntentId,
        assetRefs: uploaded.map((asset) => ({
          asset_id: asset.assetId,
          version_id: asset.versionId,
        })),
      });
      setState('completed');
      setMessage(
        `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} ready in the Library and Cloud MCP.`,
      );
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The upload handoff failed.');
    }
  };

  return (
    <section
      className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4"
      aria-labelledby="mcp-upload-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {state === 'completed' ? (
              <CheckCircle2 className="size-4 text-emerald-500" />
            ) : (
              <CloudUpload className="size-4 text-primary" />
            )}
            <h2 id="mcp-upload-title" className="text-sm font-semibold">
              Cloud MCP image handoff
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload up to {MAX_FILES} images. They will enter the Library as pinned versions that
            Canvas and Organic generation can reference.
          </p>
          {message ? (
            <p
              className={`mt-2 text-xs ${state === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}
              role="status"
            >
              {message}
            </p>
          ) : null}
          {invalidFile ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {invalidFile.name} is not a supported raster image.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="cursor-pointer rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
            Choose images
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              multiple
              disabled={state === 'uploading' || state === 'completed'}
              onChange={(event) => {
                const next = Array.from(event.target.files ?? []).slice(0, MAX_FILES);
                setFiles(next);
                setState('idle');
                setMessage(
                  (event.target.files?.length ?? 0) > MAX_FILES
                    ? `Only the first ${MAX_FILES} images will be uploaded.`
                    : null,
                );
              }}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={
              state === 'uploading' ||
              state === 'completed' ||
              files.length === 0 ||
              Boolean(invalidFile)
            }
            onClick={() => void finish()}
          >
            {state === 'uploading' ? <Loader2 className="size-4 animate-spin" /> : null}
            {state === 'completed' ? 'Completed' : `Upload ${files.length || ''}`.trim()}
          </Button>
        </div>
      </div>
    </section>
  );
}
