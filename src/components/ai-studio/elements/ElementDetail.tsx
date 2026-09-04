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

import { History, Loader2, Plus, RotateCw, Star, Upload, X } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ELEMENT_CATEGORIES,
  ELEMENT_CATEGORY_LABEL,
  ELEMENT_GUIDELINES_COPY,
  ELEMENT_PREVIEW_COPY,
  ELEMENT_RIGHTS_COPY,
  type ElementCategory,
  type ElementFact,
  type ElementRecord,
  elementNodeEmission,
  elementRequiresRightsNote,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { cn } from '@/lib/utils';
import type { ElementMemberUploader } from './ElementCreateForm';

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
  uploadAsset?: ElementMemberUploader;
  onBack: () => void;
  onGenerateReference: () => void;
  onSetDefaultReference: (assetId: string) => void;
  onAddReference: (assetId: string) => void;
  onRestore: (revisionIndex: number) => void;
  onSave: (input: {
    name: string;
    category: ElementCategory;
    guidelines: string | null;
    rightsNote: string | null;
    facts: ElementFact[];
    memberAssetIds: string[];
    motionAssetId: string | null;
    expectedUpdatedAt: string;
  }) => void;
}

export function ElementDetail({
  element,
  brandId,
  isGenerating = false,
  isSaving = false,
  pendingDefaultAssetId = null,
  generateError = null,
  setDefaultError = null,
  uploadAsset,
  onBack,
  onGenerateReference,
  onSetDefaultReference,
  onAddReference,
  onRestore,
  onSave,
}: ElementDetailProps) {
  const [name, setName] = React.useState(element.name);
  const [category, setCategory] = React.useState(element.category);
  const [guidelines, setGuidelines] = React.useState(element.guidelines ?? '');
  const [rightsNote, setRightsNote] = React.useState(element.rightsNote ?? '');
  const [factsText, setFactsText] = React.useState(
    (element.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`).join('\n'),
  );
  const [memberAssetIds, setMemberAssetIds] = React.useState(
    element.members.map((member) => member.assetId),
  );
  const [motionAssetId, setMotionAssetId] = React.useState(element.motionAssetId ?? null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const upload =
    uploadAsset ?? ((params: { file: File; brandId: string }) => uploadMediaAsset(params));
  const elapsed = useElapsedSeconds(isGenerating);

  const signedUrls = useSignedAssetUrls(brandId, [...element.referenceHistory, ...memberAssetIds]);
  // The PINNED reference, deliberately not "the newest one we have". `resolveElementRefs`
  // emits the raw MEMBERS whenever `defaultReferenceAssetId` is null, so falling back to
  // the newest history entry here would print a picture the model is not going to see
  // directly above the words "this image is what gets sent".
  const referenceAssetId = element.defaultReferenceAssetId ?? element.referenceHistory.at(-1);
  const referenceUrl = referenceAssetId ? signedUrls[referenceAssetId] : undefined;
  const emission = elementNodeEmission(element);
  const needsRights = elementRequiresRightsNote(category);
  const missingRights = needsRights && !rightsNote.trim();

  // Newest first for reading; the version number stays the stored position.
  const history = element.referenceHistory
    .map((assetId, index) => ({ assetId, version: index + 1 }))
    .reverse();

  const facts = factsText
    .split('\n')
    .map((line) => {
      const separator = line.indexOf(':');
      return separator > 0
        ? { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
        : null;
    })
    .filter((fact): fact is ElementFact => Boolean(fact?.label && fact.value))
    .slice(0, 24);

  const uploadOne = async (file: File, target: 'member' | 'sheet' | 'motion') => {
    setUploading(true);
    setUploadError(null);
    try {
      const result = await upload({ file, brandId });
      if (target === 'sheet') onAddReference(result.assetId);
      else if (target === 'motion') setMotionAssetId(result.assetId);
      else setMemberAssetIds((current) => [...current, result.assetId].slice(0, 8));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="element-detail">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Edit Element</p>
          <Badge variant="secondary" className="mt-1 h-5 px-2 text-2xs">
            {ELEMENT_CATEGORY_LABEL[category]}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {referenceUrl ? (
            // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
            <img
              src={referenceUrl}
              alt={`${element.name} reference sheet`}
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="px-6 text-center text-xs text-muted-foreground">
              No reference sheet yet — this Element falls back to its source images.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {element.defaultReferenceAssetId
            ? ELEMENT_PREVIEW_COPY
            : history.length > 0
              ? 'Candidate sheet — review it, then confirm it below.'
              : ELEMENT_PREVIEW_COPY}
        </p>
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
          {isGenerating ? `Generating sheet… ${elapsed}s` : 'Generate candidate sheet'}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isGenerating
            ? ELEMENT_GENERATION_COPY
            : 'A generated sheet is only a candidate. Nothing changes until you confirm it.'}
        </p>
        {generateError ? (
          <p className="text-xs text-destructive" role="alert">
            Sheet generation failed: {generateError.message}. Nothing changed — the approved
            reference and the history are as they were. Try again.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Label
          htmlFor="element-reference-upload"
          className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs hover:bg-muted"
        >
          <Upload className="mr-2 h-3.5 w-3.5" /> Upload existing sheet
        </Label>
        <Input
          id="element-reference-upload"
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void uploadOne(file, 'sheet');
          }}
        />
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                  onClick={() => {
                    if (
                      window.confirm(
                        'Replace the approved reference sheet for every placement of this Element?',
                      )
                    ) {
                      onSetDefaultReference(assetId);
                    }
                  }}
                  aria-label={
                    isDefault
                      ? `Reference ${version} — current default`
                      : `Review and approve reference ${version}`
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
        <Label>Source images / keyframes</Label>
        <div className="flex flex-wrap gap-2">
          {memberAssetIds.map((assetId, index) => (
            <div
              key={assetId}
              className="relative h-14 w-14 overflow-hidden rounded-md border border-border/60 bg-muted/40"
            >
              {signedUrls[assetId] ? (
                // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
                <img
                  src={signedUrls[assetId]}
                  alt={`Member ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xs">
                  {index + 1}
                </span>
              )}
              <button
                type="button"
                className="absolute right-0 top-0 bg-background/90 p-0.5"
                aria-label={`Remove source ${index + 1}`}
                onClick={() =>
                  setMemberAssetIds((current) => current.filter((id) => id !== assetId))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {memberAssetIds.length < 8 ? (
            <Label
              htmlFor="element-member-upload"
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
            </Label>
          ) : null}
        </div>
        <Input
          id="element-member-upload"
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading || memberAssetIds.length >= 8}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void uploadOne(file, 'member');
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-detail-name">Name</Label>
          <Input
            id="element-detail-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-detail-category">Category</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as ElementCategory)}>
            <SelectTrigger id="element-detail-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ELEMENT_CATEGORY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-detail-facts">Facts</Label>
        <Textarea
          id="element-detail-facts"
          rows={3}
          value={factsText}
          placeholder={'Height: 5 ft 6 in\nFinish: Matte pink'}
          onChange={(event) => setFactsText(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">One “label: value” fact per line.</p>
      </div>

      {category === 'animation' || category === 'effect' || motionAssetId ? (
        <div className="flex flex-col gap-1.5">
          <Label>Motion clip</Label>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="element-motion-upload"
              className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs hover:bg-muted"
            >
              <Upload className="mr-2 h-3.5 w-3.5" />{' '}
              {motionAssetId ? 'Replace clip' : 'Upload clip'}
            </Label>
            {motionAssetId ? <Badge variant="outline">Clip attached</Badge> : null}
          </div>
          <Input
            id="element-motion-upload"
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadOne(file, 'motion');
            }}
          />
        </div>
      ) : null}

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

      {uploadError ? (
        <p className="text-xs text-destructive" role="alert">
          {uploadError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!element.revisions?.length || isSaving}
          onClick={() => {
            const index = (element.revisions?.length ?? 1) - 1;
            if (window.confirm('Restore the previous complete Element version?')) onRestore(index);
          }}
        >
          <History className="mr-2 h-4 w-4" /> Restore previous
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isSaving || missingRights || !name.trim() || memberAssetIds.length === 0}
          onClick={() =>
            onSave({
              name: name.trim(),
              category,
              guidelines: guidelines.trim() || null,
              rightsNote: rightsNote.trim() || null,
              facts,
              memberAssetIds,
              motionAssetId,
              expectedUpdatedAt: element.updatedAt,
            })
          }
        >
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Replace Element
        </Button>
      </div>
    </div>
  );
}
