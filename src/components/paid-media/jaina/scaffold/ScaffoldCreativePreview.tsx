'use client';

import { Sparkles } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';

export function ScaffoldCreativePreview({
  brandId,
  assetId,
  name,
  onGenerate,
  disabled,
}: {
  brandId: string;
  assetId: string | null;
  name: string;
  onGenerate?: (format: 'image' | 'video') => Promise<void>;
  disabled?: boolean;
}) {
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
  const creativeFormatControlId = useId();
  const [preview, setPreview] = useState<{
    url: string;
    thumbnailUrl?: string;
    kind: 'image' | 'video';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<'image' | 'video'>('image');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!assetId || !brandId) return;
    const controller = new AbortController();
    void fetch('/api/library/sign', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId, assetId }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Creative preview is temporarily unavailable.');
        const data = (await response.json()) as {
          signedUrl?: string;
          thumbnailUrl?: string;
          mimeType?: string;
        };
        if (!data.signedUrl) throw new Error('Creative preview is temporarily unavailable.');
        if (!controller.signal.aborted) {
          const kind = data.mimeType?.startsWith('video/') ? 'video' : 'image';
          setFormat(kind);
          setPreview({ url: data.signedUrl, thumbnailUrl: data.thumbnailUrl, kind });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(formatUiError(cause));
      });
    return () => controller.abort();
  }, [brandId, assetId, formatUiError]);
  return (
    <section
      aria-label={uiText('template_55db7eab5961', { v0: name })}
      className="mt-2 flex flex-col gap-2 rounded-lg bg-background/80 p-3"
    >
      <p className="text-xs font-medium">{name}</p>
      {preview ? (
        <ChatMediaCarousel
          items={[{ id: assetId!, ...preview, name }]}
          className="aspect-square max-w-48"
          fallbackSeed={name}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {assetId
            ? uiText('loading_creative_5e196ec')
            : uiText('this_ad_needs_a_creative_2e95c06')}
        </p>
      )}
      {onGenerate ? (
        <label htmlFor={creativeFormatControlId} className="flex items-center gap-2 text-xs">
          {uiText.rich('sentence_0fd66514c7d6', {
            v0: () => (
              <select
                id={creativeFormatControlId}
                aria-label={uiText('creative_format_f211a16')}
                className="rounded bg-background p-1"
                value={format}
                disabled={disabled || busy}
                onChange={(event) => setFormat(event.target.value === 'video' ? 'video' : 'image')}
              >
                <option value="image">{uiText('image_1aa4cb0')}</option>
                <option value="video">{uiText('video_d534be8')}</option>
              </select>
            ),
          })}
        </label>
      ) : null}
      {onGenerate ? (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={disabled || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onGenerate(format);
            } catch (cause) {
              setError(formatUiError(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles className="size-3.5" />
          {uiText('generate_enrich_45de453')}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
