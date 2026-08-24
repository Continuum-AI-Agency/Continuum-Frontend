'use client';

// One Element: its reference, every reference it has ever had, its members, and the
// two text fields.
//
// The history strip reads `referenceHistory` — a list of ASSETS, not asset versions.
// `library_internal.register_asset_version` guards the storage path and Studio writes
// outside it, so each regeneration is a new library asset and "set as default" flips
// one pointer instead of promoting a version.

import { Loader2, RotateCw, Star } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ELEMENT_CATEGORY_LABEL,
  ELEMENT_GUIDELINES_COPY,
  ELEMENT_PREVIEW_COPY,
  ELEMENT_RIGHTS_COPY,
  type ElementRecord,
  elementDefaultReferenceAssetId,
  elementNodeEmission,
  elementRequiresRightsNote,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';

export interface ElementDetailProps {
  element: ElementRecord;
  brandId: string;
  isGenerating?: boolean;
  isSaving?: boolean;
  onBack: () => void;
  onGenerateReference: () => void;
  onSetDefaultReference: (assetId: string) => void;
  onSave: (input: { guidelines: string | null; rightsNote: string | null }) => void;
}

export function ElementDetail({
  element,
  brandId,
  isGenerating = false,
  isSaving = false,
  onBack,
  onGenerateReference,
  onSetDefaultReference,
  onSave,
}: ElementDetailProps) {
  const [guidelines, setGuidelines] = React.useState(element.guidelines ?? '');
  const [rightsNote, setRightsNote] = React.useState(element.rightsNote ?? '');

  const signedUrls = useSignedAssetUrls(brandId, [
    ...element.referenceHistory,
    ...element.members.map((member) => member.assetId),
  ]);
  const referenceAssetId = elementDefaultReferenceAssetId(element);
  const referenceUrl = referenceAssetId ? signedUrls[referenceAssetId] : undefined;
  const emission = elementNodeEmission(element);
  const needsRights = elementRequiresRightsNote(element.category);
  const missingRights = needsRights && !rightsNote.trim();

  return (
    <div className="flex flex-col gap-4" data-testid="element-detail">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{element.name}</p>
          <Badge variant="secondary" className="mt-1 h-5 px-2 text-2xs">
            {ELEMENT_CATEGORY_LABEL[element.category]}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {referenceUrl ? (
            // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
            <img
              src={referenceUrl}
              alt={`${element.name} reference`}
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="px-6 text-center text-xs text-muted-foreground">
              No reference yet — this Element sends its {element.members.length} images instead.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{ELEMENT_PREVIEW_COPY}</p>
        {emission?.mode === 'fallback' && emission.droppedCount > 0 ? (
          <p className="text-xs text-destructive">
            {emission.droppedCount} of {element.members.length} images will be dropped — generate a
            reference to send one image instead.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onGenerateReference}
          disabled={isGenerating || element.members.length === 0}
        >
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="mr-2 h-4 w-4" />
          )}
          {element.referenceHistory.length === 0 ? 'Generate reference' : 'Regenerate'}
        </Button>
      </div>

      {element.referenceHistory.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>History</Label>
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="element-history-strip">
            {element.referenceHistory.map((assetId, index) => {
              const isDefault = assetId === element.defaultReferenceAssetId;
              const historyUrl = signedUrls[assetId];
              return (
                <button
                  type="button"
                  key={assetId}
                  onClick={() => onSetDefaultReference(assetId)}
                  aria-label={`Use reference ${index + 1} as default`}
                  aria-pressed={isDefault}
                  className={cn(
                    'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/40',
                    isDefault ? 'border-brand-primary ring-2 ring-brand-primary/40' : 'border-border/60',
                  )}
                >
                  {historyUrl ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                    <img
                      src={historyUrl}
                      alt={`Reference ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xs">
                      v{index + 1}
                    </span>
                  )}
                  {isDefault ? (
                    <Star className="absolute right-0.5 top-0.5 h-3 w-3 fill-current text-brand-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label>Images</Label>
        <div className="flex flex-wrap gap-2">
          {element.members.map((member, index) => (
            <div
              key={member.assetId}
              className="h-14 w-14 overflow-hidden rounded-md border border-border/60 bg-muted/40"
            >
              {signedUrls[member.assetId] ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                <img
                  src={signedUrls[member.assetId]}
                  alt={`Member ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xs">
                  {index + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-detail-guidelines">Guidelines</Label>
        <Textarea
          id="element-detail-guidelines"
          rows={2}
          value={guidelines}
          onChange={(event) => setGuidelines(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{ELEMENT_GUIDELINES_COPY}</p>
      </div>

      {needsRights ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-detail-rights">Rights basis</Label>
          <Input
            id="element-detail-rights"
            value={rightsNote}
            onChange={(event) => setRightsNote(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{ELEMENT_RIGHTS_COPY}</p>
          {missingRights ? (
            <p className="text-xs text-destructive">
              A {ELEMENT_CATEGORY_LABEL[element.category]} Element needs a rights basis.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={isSaving || missingRights}
          onClick={() =>
            onSave({
              guidelines: guidelines.trim() || null,
              rightsNote: rightsNote.trim() || null,
            })
          }
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save changes
        </Button>
      </div>
    </div>
  );
}
