'use client';

// Picks the logo a share link shows instead of the brand kit's: any image in
// the brand's Library. None selected = the brand kit logo.

import type { MediaAsset } from '@continuum/contracts';
import { useEffect, useState } from 'react';

const PICKER_LIMIT = 48;

export function ShareLogoPicker({
  brandId,
  value,
  onChange,
}: {
  brandId: string;
  value: string | undefined;
  onChange: (assetId: string | undefined) => void;
}) {
  const [images, setImages] = useState<MediaAsset[]>([]);

  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ brandId, kind: 'image', limit: String(PICKER_LIMIT) });
    void fetch(`/api/library/assets?${query}`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((body: { items?: MediaAsset[] }) => {
        if (live) setImages(body.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [brandId]);

  const option = (selected: boolean) =>
    `flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-2xs ${
      selected ? 'border-primary ring-2 ring-primary' : 'border-border'
    }`;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        aria-pressed={!value}
        data-logo-option="brand-kit"
        className={option(!value)}
        onClick={() => onChange(undefined)}
      >
        Brand kit
      </button>
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          aria-pressed={value === image.id}
          aria-label={image.title ?? image.fileName}
          data-logo-option={image.id}
          className={option(value === image.id)}
          onClick={() => onChange(image.id)}
        >
          {image.thumbnailUrl || image.signedUrl ? (
            // Signed storage URL, cross-origin and short-lived; next/image adds nothing.
            <img
              src={image.thumbnailUrl ?? image.signedUrl ?? ''}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            (image.title ?? image.fileName).slice(0, 8)
          )}
        </button>
      ))}
    </div>
  );
}
