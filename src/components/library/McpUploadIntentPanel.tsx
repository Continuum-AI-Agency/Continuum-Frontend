'use client';

import { CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
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
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('library');

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
        translateUi('value0_image_value1_ready_in_the_li_5d522909', {
          count: Number(uploaded.length),
        }),
      );
      router.refresh();
    } catch (error) {
      setState('error');
      setMessage(uiErrorText(error));
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
              {' '}
              {translateUi('cloud_mcp_image_handoff_2f46d11c')}{' '}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {' '}
            {translateUi('upload_up_to_5fc858fa')} {MAX_FILES}{' '}
            {translateUi('images_they_will_enter_the_library__e2293175')}{' '}
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
              {invalidFile.name} {translateUi('is_not_a_supported_raster_image_2f828e19')}{' '}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="cursor-pointer rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
            {' '}
            {translateUi('choose_images_2d39bc2f')}{' '}
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
                    ? translateUi('only_the_first_value0_images_will_b_5f1fc5e9', {
                        count: Number(MAX_FILES),
                      })
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
            {state === 'completed'
              ? translateUi('completed_22a970d2')
              : `Upload ${files.length || ''}`.trim()}
          </Button>
        </div>
      </div>
    </section>
  );
}
