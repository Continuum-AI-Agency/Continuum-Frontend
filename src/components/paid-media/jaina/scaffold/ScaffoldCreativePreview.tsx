'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChatMediaCarousel } from '@/components/chat/media/ChatMedia';
import { Button } from '@/components/ui/button';

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
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Creative preview unavailable.');
      });
    return () => controller.abort();
  }, [brandId, assetId]);
  return (
    <section
      aria-label={`Creative for ${name}`}
      className="mt-2 flex flex-col gap-2 rounded-md border p-3"
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
          {assetId ? 'Loading creative…' : 'This ad needs a creative.'}
        </p>
      )}
      {onGenerate ? (
        <label className="flex items-center gap-2 text-xs">
          Format
          <select
            aria-label="Creative format"
            className="rounded border bg-background p-1"
            value={format}
            disabled={disabled || busy}
            onChange={(event) => setFormat(event.target.value === 'video' ? 'video' : 'image')}
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
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
              setError(cause instanceof Error ? cause.message : 'Creative request failed.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles className="size-3.5" />
          Generate / Enrich
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
