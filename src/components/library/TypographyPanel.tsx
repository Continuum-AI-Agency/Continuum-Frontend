'use client';

import { normalizeTemplateFontFamily, type TemplateSourceSummary } from '@continuum/contracts';
import { Loader2, Type, Upload } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NoSpecimenText, TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type BrandFontSummary, fetchBrandFonts } from '@/lib/library/templateSources';
import { partitionLibraryUploadFiles } from './libraryUploadRouting';

// Typography is a panel, not a browse filter, and that is a licensing decision rather than a
// layout one. A brand face is licensed to the brand; the font store never mints a URL for one.
// A font that became a media.assets row would inherit search, share links and signed-URL
// minting — every one of which publishes it. So fonts live in the private brand-docs bucket
// and are listed here as records: family, weight, format, and whether we hold the file.
//
// No specimen is drawn. See typefaceHonesty.tsx for why that is the honest output.

const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

export function TypographyPanel({
  brandId,
  templateSources,
  onReviewFiles,
}: {
  brandId: string;
  templateSources: TemplateSourceSummary[];
  onReviewFiles: (files: File[]) => void;
}) {
  const translateUi = useUiTranslations('library');

  const [fonts, setFonts] = useState<BrandFontSummary[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    fetchBrandFonts(brandId)
      .then(setFonts)
      .catch(() => setFonts([]));
  }, [brandId]);

  useEffect(refresh, [refresh]);

  // Which templates need each family. The reverse of the per-template font check, and the
  // reason typography belongs beside templates rather than buried in brand settings.
  const neededBy = new Map<string, string[]>();
  for (const source of templateSources) {
    for (const family of source.fonts) {
      const key = normalizeTemplateFontFamily(family);
      neededBy.set(key, [...(neededBy.get(key) ?? []), source.assetId]);
    }
  }
  const heldKeys = new Set((fonts ?? []).map((font) => normalizeTemplateFontFamily(font.family)));
  const missingFamilies = [...neededBy.entries()].filter(([key]) => !heldKeys.has(key));

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{translateUi('typography_cab94aba')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            <NoSpecimenText />
          </p>
        </div>
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" /> {translateUi('add_fonts_420422d6')}{' '}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FONT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const { fonts } = partitionLibraryUploadFiles(Array.from(event.target.files ?? []));
            if (fonts.length > 0) onReviewFiles(fonts);
            event.target.value = '';
          }}
        />
      </div>

      {missingFamilies.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {translateUi('missingFontFamilies', { count: missingFamilies.length })}{' '}
        </div>
      ) : null}

      {fonts === null ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {translateUi('loading_fonts_59a92bbd')}{' '}
        </div>
      ) : fonts.length === 0 && neededBy.size === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <Type className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {translateUi('no_fonts_in_the_engine_82813310')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {' '}
            {translateUi('add_the_faces_your_templates_use_th_ecf5e7f3')}{' '}
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60">
          {fonts.map((font) => {
            const key = normalizeTemplateFontFamily(font.family);
            const used = neededBy.get(key)?.length ?? 0;
            return (
              <div
                key={`${font.family}-${font.weight ?? 'x'}-${font.style}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{font.family}</span>
                  <span className="text-xs text-muted-foreground">
                    {font.weight ?? translateUi('regular_667937c3')} · {font.style} ·{' '}
                    {font.format.toUpperCase()}
                    {used > 0
                      ? translateUi('used_by_value0_value1_94988fdb', {
                          value0: String(used),
                          value1: String(used === 1 ? 'template' : 'templates'),
                        })
                      : ''}
                  </span>
                </div>
                <TypefaceHoldBadge held />
              </div>
            );
          })}
          {/* Families a template asks for and we do not have. Listing them here is the only
              place a customer can see the gap before a render shows it to them. */}
          {missingFamilies.map(([key, assetIds]) => {
            const family =
              templateSources
                .flatMap((source) => source.fonts)
                .find((name) => normalizeTemplateFontFamily(name) === key) ?? key;
            return (
              <div
                key={`missing-${key}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{family}</span>
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    {translateUi('fontNeededByTemplates', { count: assetIds.length })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{translateUi('not_uploaded_bfe15267')}</Badge>
                  <TypefaceHoldBadge held={false} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
