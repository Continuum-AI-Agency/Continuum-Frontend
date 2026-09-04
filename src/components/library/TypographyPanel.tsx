'use client';

import type { TemplateSource } from '@continuum/contracts';
import { Loader2, Type, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NO_SPECIMEN_NOTE, TypefaceHoldBadge } from '@/components/brand/typefaceHonesty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type BrandFontSummary,
  fetchBrandFonts,
  uploadBrandFont,
} from '@/lib/library/templateSources';

// Typography is a panel, not a browse filter, and that is a licensing decision rather than a
// layout one. A brand face is licensed to the brand; the font store never mints a URL for one.
// A font that became a media.assets row would inherit search, share links and signed-URL
// minting — every one of which publishes it. So fonts live in the private brand-docs bucket
// and are listed here as records: family, weight, format, and whether we hold the file.
//
// No specimen is drawn. See typefaceHonesty.tsx for why that is the honest output.

const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2';

/** `HeadingNow-36CompBold.otf` -> `HeadingNow 36CompBold`. A starting point the user edits. */
function familyFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function TypographyPanel({
  brandId,
  templateSources,
}: {
  brandId: string;
  templateSources: TemplateSource[];
}) {
  const [fonts, setFonts] = useState<BrandFontSummary[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    fetchBrandFonts(brandId)
      .then(setFonts)
      .catch(() => setFonts([]));
  }, [brandId]);

  useEffect(refresh, [refresh]);

  const onFiles = useCallback(
    async (fileList: FileList | null) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0) return;
      setUploading(true);
      let stored = 0;
      for (const file of files) {
        try {
          await uploadBrandFont({ brandId, family: familyFromFileName(file.name), file });
          stored += 1;
        } catch (error) {
          toast.error(
            `${file.name}: ${error instanceof Error ? error.message : 'could not be stored'}`,
          );
        }
      }
      setUploading(false);
      if (stored > 0) {
        toast.success(`${stored} ${stored === 1 ? 'face' : 'faces'} added to the engine.`);
        refresh();
      }
    },
    [brandId, refresh],
  );

  // Which templates need each family. The reverse of the per-template font check, and the
  // reason typography belongs beside templates rather than buried in brand settings.
  const neededBy = new Map<string, string[]>();
  for (const source of templateSources) {
    for (const family of source.fonts) {
      const key = family.toLowerCase().replace(/[\s_-]+/g, '');
      neededBy.set(key, [...(neededBy.get(key) ?? []), source.assetId]);
    }
  }
  const heldKeys = new Set(
    (fonts ?? []).map((font) => font.family.toLowerCase().replace(/[\s_-]+/g, '')),
  );
  const missingFamilies = [...neededBy.entries()].filter(([key]) => !heldKeys.has(key));

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Typography</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{NO_SPECIMEN_NOTE}</p>
        </div>
        <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Add fonts
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FONT_ACCEPT}
          className="hidden"
          onChange={(event) => {
            void onFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {missingFamilies.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          {missingFamilies.length} {missingFamilies.length === 1 ? 'family' : 'families'} used by
          your templates {missingFamilies.length === 1 ? 'is' : 'are'} not in the engine. A render
          that needs one still finishes — in a face that is not yours.
        </div>
      ) : null}

      {fonts === null ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading fonts…
        </div>
      ) : fonts.length === 0 && neededBy.size === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <Type className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No fonts in the engine</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the faces your templates use. They are stored privately and never served to a
            browser.
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60">
          {fonts.map((font) => {
            const key = font.family.toLowerCase().replace(/[\s_-]+/g, '');
            const used = neededBy.get(key)?.length ?? 0;
            return (
              <div
                key={`${font.family}-${font.weight ?? 'x'}-${font.style}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{font.family}</span>
                  <span className="text-xs text-muted-foreground">
                    {font.weight ?? 'regular'} · {font.style} · {font.format.toUpperCase()}
                    {used > 0 ? ` · used by ${used} ${used === 1 ? 'template' : 'templates'}` : ''}
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
                .find((name) => name.toLowerCase().replace(/[\s_-]+/g, '') === key) ?? key;
            return (
              <div
                key={`missing-${key}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{family}</span>
                  <span className="text-xs text-muted-foreground">
                    needed by {assetIds.length} {assetIds.length === 1 ? 'template' : 'templates'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">not uploaded</Badge>
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
