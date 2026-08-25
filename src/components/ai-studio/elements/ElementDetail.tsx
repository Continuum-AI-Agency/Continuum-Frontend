'use client';

// One Element: its reference, every reference it has ever had, its members, and the
// two text fields.
//
// The history strip reads `referenceHistory` — a list of ASSETS, not asset versions.
// `library_internal.register_asset_version` guards the storage path and Studio writes
// outside it, so each regeneration is a new library asset and "set as default" flips
// one pointer instead of promoting a version.
//
// Newest first, because the entry a user reaches for after a regeneration is the one
// that just arrived. The version NUMBER stays tied to the stored position, so an
// entry keeps its name when a newer one lands above it.

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
  elementNodeEmission,
  elementRequiresRightsNote,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { cn } from '@/lib/utils';

/** The measured cost of one reference generation — the Wave-2 bench run timed 16.7s.
 *  Quoted so the wait is a stated cost rather than an unexplained hang. */
const ELEMENT_GENERATION_COPY = 'One paid image call, usually 15–20 seconds.';

/**
 * Seconds actually elapsed since the generation started.
 *
 * A real clock delta, never a synthetic percentage: a progress bar for a call whose
 * completion we cannot observe would be an invention, and a user who watches an
 * invented bar stall learns to distrust every other indicator in the product.
 */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

export interface ElementDetailProps {
  element: ElementRecord;
  brandId: string;
  isGenerating?: boolean;
  isSaving?: boolean;
  /** The history entry currently being pinned, so the strip can show which one moved. */
  pendingDefaultAssetId?: string | null;
  /** Surfaced verbatim. A generation that fails after ~17s of spinner and says nothing
   *  is indistinguishable from one that succeeded and changed nothing. */
  generateError?: Error | null;
  setDefaultError?: Error | null;
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
  pendingDefaultAssetId = null,
  generateError = null,
  setDefaultError = null,
  onBack,
  onGenerateReference,
  onSetDefaultReference,
  onSave,
}: ElementDetailProps) {
  const [guidelines, setGuidelines] = React.useState(element.guidelines ?? '');
  const [rightsNote, setRightsNote] = React.useState(element.rightsNote ?? '');
  const elapsed = useElapsedSeconds(isGenerating);

  const signedUrls = useSignedAssetUrls(brandId, [
    ...element.referenceHistory,
    ...element.members.map((member) => member.assetId),
  ]);
  // The PINNED reference, deliberately not "the newest one we have". `resolveElementRefs`
  // emits the raw MEMBERS whenever `defaultReferenceAssetId` is null, so falling back to
  // the newest history entry here would print a picture the model is not going to see
  // directly above the words "this image is what gets sent".
  const referenceAssetId = element.defaultReferenceAssetId;
  const referenceUrl = referenceAssetId ? signedUrls[referenceAssetId] : undefined;
  const emission = elementNodeEmission(element);
  const needsRights = elementRequiresRightsNote(element.category);
  const missingRights = needsRights && !rightsNote.trim();

  // Newest first for reading; the version number stays the stored position.
  const history = element.referenceHistory
    .map((assetId, index) => ({ assetId, version: index + 1 }))
    .reverse();

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
              {history.length === 0
                ? `No reference yet — this Element sends its ${element.members.length} images instead.`
                : `No reference pinned — this Element sends its ${element.members.length} images instead. Pick one below to pin it.`}
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
          {isGenerating
            ? `Generating reference… ${elapsed}s`
            : history.length === 0
              ? 'Generate reference'
              : 'Regenerate'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isGenerating
            ? ELEMENT_GENERATION_COPY
            : history.length === 0
              ? ELEMENT_GENERATION_COPY
              : 'A regeneration is added to the history below — nothing you already pinned changes.'}
        </p>
        {generateError ? (
          <p className="text-xs text-destructive" role="alert">
            Reference generation failed: {generateError.message}. Nothing changed — the pinned
            reference and the history are as they were. Try again.
          </p>
        ) : null}
      </div>

      {history.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>History</Label>
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="element-history-strip">
            {history.map(({ assetId, version }) => {
              const isDefault = assetId === element.defaultReferenceAssetId;
              const isPending = assetId === pendingDefaultAssetId;
              const historyUrl = signedUrls[assetId];
              return (
                <button
                  type="button"
                  key={assetId}
                  // The current default is not a target: pinning what is already pinned
                  // is a round trip that changes nothing.
                  disabled={isDefault || isPending}
                  onClick={() => onSetDefaultReference(assetId)}
                  aria-label={
                    isDefault
                      ? `Reference ${version} — current default`
                      : `Use reference ${version} as default`
                  }
                  aria-pressed={isDefault}
                  className={cn(
                    'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/40',
                    isDefault
                      ? 'border-brand-primary ring-2 ring-brand-primary/40'
                      : 'border-border/60',
                    isPending ? 'opacity-60' : null,
                  )}
                >
                  {historyUrl ? (
                    // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                    <img
                      src={historyUrl}
                      alt={`Reference ${version}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xs">
                      v{version}
                    </span>
                  )}
                  {isPending ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  ) : isDefault ? (
                    <Star className="absolute right-0.5 top-0.5 h-3 w-3 fill-current text-brand-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {setDefaultError ? (
            <p className="text-xs text-destructive" role="alert">
              Could not change the default: {setDefaultError.message}
            </p>
          ) : null}
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
