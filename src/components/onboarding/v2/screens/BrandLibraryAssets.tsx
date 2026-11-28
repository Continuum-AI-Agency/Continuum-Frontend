'use client';

// Logos, typefaces and reference images get a labelled home on the product step. Without
// one, customers dropped them into Brand documents, which only reads text, and then had to
// find and fix them in Knowledge. Everything here lands in the Library: logos and
// references as media tagged `logo` / `reference`, fonts through the Library's own
// typography store and review dialog. The first logo also becomes the brand logo, the one
// Studio and the agents put on what they make, unless the brand already chose one.
//
// Previews come from the files on the person's own machine: an image tile is an object URL
// of the picked file (no download of the original back through a signed URL), and a font
// saved this session gets a specimen drawn from its local bytes.

import { normalizeTemplateFontFamily } from '@continuum/contracts';
import { UploadSimple, Warning } from '@phosphor-icons/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FontSpecimen } from '@/components/brand/FontSpecimen';
import {
  FontUploadReviewDialog,
  type StoredFontFace,
} from '@/components/library/FontUploadReviewDialog';
import { TypographyPanel } from '@/components/library/TypographyPanel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import type { BrandFontSummary } from '@/lib/library/templateSources';
import {
  type BrandLibraryTag,
  isChosenBrandLogo,
  setBrandLogoFromLibrary,
  uploadTaggedLibraryImages,
} from '@/lib/onboarding/libraryAssets';
import { cn } from '@/lib/utils';

type UploadTile = {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'untagged' | 'error';
  localUrl?: string;
  error?: string;
  assetId?: string;
  brandLogo?: 'saving' | 'set' | 'failed';
};

type BrandLogo = { path: string | null; onChange: (path: string) => Promise<void> };

const faceKey = (family: string, weight: number | null, style: string) =>
  `${normalizeTemplateFontFamily(family)}|${weight ?? ''}|${style}`;

// Transparent logos need something behind them to read as transparent.
const CHECKERBOARD = {
  backgroundImage: 'repeating-conic-gradient(var(--muted) 0 25%, transparent 0 50%)',
  backgroundSize: '12px 12px',
};

export function BrandLibraryAssets({
  brandId,
  brandLogo,
  onBusyChange,
}: {
  brandId: string;
  brandLogo: BrandLogo;
  onBusyChange: (busy: boolean) => void;
}) {
  const tUi = useTranslations('onboarding');
  const [pending, setPending] = useState(0);
  const [fontFiles, setFontFiles] = useState<File[]>([]);
  const [fontRevision, setFontRevision] = useState(0);
  const [localFaces, setLocalFaces] = useState<ReadonlyMap<string, File>>(new Map());

  useEffect(() => {
    onBusyChange(pending > 0);
  }, [pending, onBusyChange]);

  const track = useCallback((delta: number) => setPending((count) => count + delta), []);

  const rememberFaces = (stored: StoredFontFace[]) => {
    setLocalFaces((prev) => {
      const next = new Map(prev);
      for (const face of stored) next.set(faceKey(face.family, face.weight, face.style), face.file);
      return next;
    });
    setFontRevision((revision) => revision + 1);
  };

  const specimenFor = (font: BrandFontSummary) => {
    const file = localFaces.get(faceKey(font.family, font.weight, font.style));
    return file ? <FontSpecimen file={file} className="mt-1" /> : null;
  };

  return (
    <section
      aria-labelledby="brand-library-assets-title"
      data-testid="brand-library-assets"
      className="mt-12 border-t border-border pt-10"
    >
      <h2
        id="brand-library-assets-title"
        className="text-xl font-semibold tracking-tight text-foreground"
      >
        {tUi('brandLibraryTitle')}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{tUi('brandLibraryIntro')}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <TaggedImageUploader
          brandId={brandId}
          tag="logo"
          title={tUi('brandLibraryLogosTitle')}
          hint={tUi('brandLibraryLogosHint')}
          brandLogo={brandLogo}
          onPendingChange={track}
        />
        <TaggedImageUploader
          brandId={brandId}
          tag="reference"
          title={tUi('brandLibraryReferencesTitle')}
          hint={tUi('brandLibraryReferencesHint')}
          onPendingChange={track}
        />
      </div>

      <div className="mt-4 rounded-lg border border-border p-4" data-testid="brand-library-fonts">
        <TypographyPanel
          key={fontRevision}
          brandId={brandId}
          templateSources={[]}
          onReviewFiles={setFontFiles}
          renderSpecimen={specimenFor}
          copy={{
            title: tUi('brandLibraryFontsTitle'),
            intro: tUi('brandLibraryFontsIntro'),
            empty: tUi('brandLibraryFontsEmpty'),
            held: tUi('brandLibraryFontSaved'),
          }}
        />
      </div>
      {fontFiles.length > 0 ? (
        <FontUploadReviewDialog
          key={fontFiles.map((file) => `${file.name}:${file.size}`).join('|')}
          brandId={brandId}
          files={fontFiles}
          onClose={() => setFontFiles([])}
          onUploaded={rememberFaces}
        />
      ) : null}
    </section>
  );
}

function TaggedImageUploader({
  brandId,
  tag,
  title,
  hint,
  brandLogo,
  onPendingChange,
}: {
  brandId: string;
  tag: BrandLibraryTag;
  title: string;
  hint: string;
  brandLogo?: BrandLogo;
  onPendingChange: (delta: number) => void;
}) {
  const tUi = useTranslations('onboarding');
  const uiErrorMessage = useUiErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const [tiles, setTiles] = useState<UploadTile[]>([]);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const patchTile = (key: string, patch: Partial<UploadTile>) =>
    setTiles((prev) => prev.map((tile) => (tile.key === key ? { ...tile, ...patch } : tile)));

  const makeBrandLogo = async (key: string, assetId: string) => {
    if (!brandLogo) return;
    patchTile(key, { brandLogo: 'saving' });
    try {
      await brandLogo.onChange(await setBrandLogoFromLibrary(brandId, assetId));
      setTiles((prev) =>
        prev.map((tile) =>
          tile.key === key
            ? { ...tile, brandLogo: 'set' }
            : tile.brandLogo === 'set'
              ? { ...tile, brandLogo: undefined }
              : tile,
        ),
      );
    } catch {
      patchTile(key, { brandLogo: 'failed' });
    }
  };

  const handleFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'));
    const refused = files.filter((file) => !file.type.startsWith('image/'));
    const keys = images.map(() => crypto.randomUUID());
    const added: UploadTile[] = [
      ...images.map((file, index) => {
        const localUrl = URL.createObjectURL(file);
        objectUrls.current.push(localUrl);
        return { key: keys[index], name: file.name, status: 'uploading' as const, localUrl };
      }),
      ...refused.map((file) => ({
        key: crypto.randomUUID(),
        name: file.name,
        status: 'error' as const,
        error: tUi('brandLibraryNotImage'),
      })),
    ];
    setTiles((prev) => [...prev, ...added]);
    if (images.length === 0) return;

    const uploaded = new Map<string, string>();
    onPendingChange(1);
    try {
      const { tagged } = await uploadTaggedLibraryImages(
        { brandId, files: images, tag },
        (index, outcome) => {
          if (outcome.ok) uploaded.set(keys[index], outcome.assetId);
          else patchTile(keys[index], { status: 'error', error: uiErrorMessage(outcome.error) });
        },
      );
      for (const [key, assetId] of uploaded) {
        patchTile(
          key,
          tagged
            ? { status: 'done', assetId }
            : { status: 'untagged', assetId, error: tUi('brandLibraryTagFailed', { tag }) },
        );
      }
      // In drop order, not upload order: the file they put first is the one they meant.
      const first = keys.find((key) => uploaded.has(key));
      if (brandLogo && first && !isChosenBrandLogo(brandLogo.path)) {
        await makeBrandLogo(first, uploaded.get(first) as string);
      }
    } finally {
      onPendingChange(-1);
    }
  };

  const uploading = tiles.filter((tile) => tile.status === 'uploading').length;
  const landed = tiles.some((tile) => tile.status === 'done' || tile.status === 'untagged');

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target, with a button alternative inside
    <div
      data-testid={`brand-library-${tag}`}
      onDragEnter={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes('Files')) setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        void handleFiles(Array.from(event.dataTransfer.files ?? []));
      }}
      className={cn(
        'rounded-lg border border-dashed border-border p-4 motion-safe:transition-colors',
        dragActive &&
          'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]',
      )}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        data-testid={`brand-library-${tag}-input`}
        onChange={(event) => {
          void handleFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
        >
          <UploadSimple className="mr-1.5 h-4 w-4" />
          {uploading > 0
            ? tUi('brandLibraryUploading', { count: uploading })
            : tUi('brandLibraryAddImages')}
        </Button>
        {landed ? (
          <Link
            href={`/library?tags=${tag}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            {tUi('brandLibraryViewInLibrary')}
          </Link>
        ) : null}
      </div>

      {tiles.length > 0 ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <li key={tile.key} data-status={tile.status} className="min-w-0 text-xs">
              <div
                className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40"
                style={tag === 'logo' && tile.localUrl ? CHECKERBOARD : undefined}
              >
                {tile.localUrl ? (
                  // biome-ignore lint/performance/noImgElement: a local object URL of the picked file
                  <img
                    src={tile.localUrl}
                    alt=""
                    className={cn(
                      'h-full w-full',
                      tag === 'logo' ? 'object-contain p-2' : 'object-cover',
                      tile.status === 'uploading' && 'opacity-60',
                    )}
                  />
                ) : (
                  <Warning className="h-5 w-5 text-amber-600" />
                )}
                {tile.brandLogo === 'set' ? (
                  <Badge variant="success" className="absolute top-1 left-1">
                    {tUi('brandLibraryBrandLogo')}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate text-foreground" title={tile.name}>
                {tile.name}
              </p>
              <p
                className={cn(
                  'text-muted-foreground',
                  tile.error && 'text-amber-700 dark:text-amber-500',
                )}
              >
                {tile.status === 'uploading'
                  ? tUi('brandLibraryUploadingOne')
                  : tile.brandLogo === 'failed'
                    ? tUi('brandLibraryBrandLogoFailed')
                    : tile.status === 'done'
                      ? tUi('brandLibrarySaved')
                      : tile.error}
              </p>
              {brandLogo && tile.assetId && tile.brandLogo !== 'set' ? (
                <button
                  type="button"
                  disabled={tile.brandLogo === 'saving'}
                  onClick={() => {
                    onPendingChange(1);
                    void makeBrandLogo(tile.key, tile.assetId as string).finally(() =>
                      onPendingChange(-1),
                    );
                  }}
                  className="text-left text-primary underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {tUi('brandLibraryMakeBrandLogo')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
