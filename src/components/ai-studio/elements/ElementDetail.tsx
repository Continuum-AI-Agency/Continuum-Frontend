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

import { elementReferenceAspectRatio, isElementProductCategory } from '@continuum/contracts';
import { History, Loader2, Plus, RotateCw, Star, Upload, X } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useUiErrorMessage } from '@/i18n/errors';
import {
  ELEMENT_CATEGORIES,
  type ElementCategory,
  type ElementFact,
  type ElementRecord,
  elementNodeEmission,
  elementRequiresRightsNote,
  isElementPersonCategory,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { cn } from '@/lib/utils';
import { ElementBoard } from './ElementBoard';
import type { ElementMemberUploader } from './ElementCreateForm';
import { elementCategoryLabel } from './elementPresentation';
import { HeadlessElementReview } from './HeadlessElementReview';

/** The measured cost of one reference generation — the Wave-2 bench run timed 16.7s.
 *  Quoted so the wait is a stated cost rather than an unexplained hang. */

/** A person's reference is the continuity sheet: three image calls, two of them in parallel.
 *  `elements:character-sheet:bench` timed 54.5 s and 64.9 s on the Easy Fit actresses (10-06). */

/** A product's reference is the product continuity sheet: two image calls. */

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
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

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
  // The STORED category decides the sheet's framing: it is what the sheet was generated for.
  const isCharacter = isElementPersonCategory(element.category);
  const isProduct = isElementProductCategory(element.category);
  const sheetNoun = isCharacter
    ? 'character sheet'
    : isProduct
      ? 'product sheet'
      : 'reference sheet';
  const [sheetOpen, setSheetOpen] = React.useState(false);

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
      setUploadError(uiErrorText(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="element-detail">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{translateUi('edit_element_120ab216')}</p>
          <Badge variant="secondary" className="mt-1 h-5 px-2 text-2xs">
            {elementCategoryLabel(category, translateUi)}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          {' '}
          {translateUi('back_76900f1b')}{' '}
        </Button>
      </div>

      <HeadlessElementReview brandId={brandId} element={element} />
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            'flex w-full items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30',
            elementReferenceAspectRatio(element.category) === '3:4'
              ? 'aspect-[3/4]'
              : 'aspect-video',
          )}
        >
          {referenceUrl ? (
            <button
              type="button"
              className="h-full w-full cursor-zoom-in"
              onClick={() => setSheetOpen(true)}
              aria-label={translateUi('open_the_value0_value1_285f773f', {
                value0: String(element.name),
                value1: String(sheetNoun),
              })}
            >
              {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset. */}
              <img
                src={referenceUrl}
                alt={`${element.name} ${sheetNoun}`}
                className="h-full w-full object-contain"
              />
            </button>
          ) : (
            <p className="px-6 text-center text-xs text-muted-foreground">
              {isCharacter
                ? isGenerating
                  ? translateUi('making_the_character_sheet_value0_s_5a43bb3d', {
                      value0: String(elapsed),
                    })
                  : translateUi('no_character_sheet_yet_generate_one_2b040bbc')
                : translateUi('no_reference_sheet_yet_this_element_78f7f667')}
            </p>
          )}
        </div>
        {referenceUrl ? (
          <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
            {/* Above the Elements panel, which is itself a z-[110] sheet. */}
            <DialogContent
              className="z-[120] flex h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-2 sm:max-w-[96vw]"
              overlayClassName="z-[120]"
            >
              <DialogHeader>
                <DialogTitle>{element.name}</DialogTitle>
                <DialogDescription>
                  <a href={referenceUrl} target="_blank" rel="noreferrer" className="underline">
                    {' '}
                    {translateUi('open_full_size_f7eb1c9b')}{' '}
                  </a>
                </DialogDescription>
              </DialogHeader>
              {/* biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset. */}
              <img
                src={referenceUrl}
                alt={`${element.name} ${sheetNoun}`}
                className="min-h-0 flex-1 object-contain"
              />
            </DialogContent>
          </Dialog>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {element.defaultReferenceAssetId
            ? translateUi('elementApprovedSheetGuidance')
            : history.length > 0
              ? translateUi('candidate_sheet_review_it_then_conf_a4ed65eb')
              : translateUi('elementApprovedSheetGuidance')}
        </p>
        {emission?.mode === 'fallback' && emission.droppedCount > 0 ? (
          <p className="text-xs text-destructive">
            {emission.droppedCount} {translateUi('of_28391d3b')} {element.members.length}{' '}
            {translateUi('images_will_be_dropped_generate_a_r_0c2e088c')}{' '}
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
            ? translateUi('generating_sheet_value0_s_9a39f688', { value0: String(elapsed) })
            : isCharacter
              ? translateUi('generate_character_sheet_a94e18cd')
              : isProduct
                ? translateUi('generate_product_sheet_two_paid_ima_f6c757c6')
                : translateUi('generate_candidate_sheet_c1e012a3')}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isGenerating
            ? isCharacter
              ? translateUi('characterSheetGenerationCost')
              : isProduct
                ? translateUi('productSheetGenerationCost')
                : translateUi('elementGenerationCost')
            : isCharacter && history.length === 0
              ? translateUi('the_first_sheet_becomes_this_charac_3b707f88')
              : translateUi('a_generated_sheet_is_only_a_candida_d36cf86f')}
        </p>
        {generateError ? (
          <p className="text-xs text-destructive" role="alert">
            {' '}
            {translateUi('sheet_generation_failed_aa1c37ad')} {generateError.message}
            {translateUi('nothing_changed_the_approved_refere_076322bd')}{' '}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Label
          htmlFor="element-reference-upload"
          className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs hover:bg-muted"
        >
          <Upload className="mr-2 h-3.5 w-3.5" /> {translateUi(
            'upload_existing_sheet_e98a19e6',
          )}{' '}
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
          <Label>{translateUi('history_0e769600')}</Label>
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
                      ? translateUi('reference_value0_current_default_3684040b', {
                          value0: String(version),
                        })
                      : translateUi('review_and_approve_reference_value0_83cb5305', {
                          value0: String(version),
                        })
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
                      alt={translateUi('reference_value0_fede3d8a', { value0: String(version) })}
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
              {' '}
              {translateUi('could_not_change_the_default_611dc0a5')} {setDefaultError.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label>{translateUi('source_images_keyframes_d1b9dd6d')}</Label>
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
                  alt={translateUi('member_value0_04374420', { value0: String(index + 1) })}
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
                aria-label={translateUi('remove_source_value0_a27f9c60', {
                  value0: String(index + 1),
                })}
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

      <ElementBoard element={element} brandId={brandId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-detail-name">{translateUi('name_dcd1d522')}</Label>
          <Input
            id="element-detail-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="element-detail-category">{translateUi('category_292c06f0')}</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as ElementCategory)}>
            <SelectTrigger id="element-detail-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEMENT_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {elementCategoryLabel(value, translateUi)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-detail-guidelines">{translateUi('guidelines_c4f9417b')}</Label>
        <Textarea
          id="element-detail-guidelines"
          rows={2}
          value={guidelines}
          onChange={(event) => setGuidelines(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{translateUi('elementGuidelinesGuidance')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="element-detail-facts">{translateUi('facts_3683709d')}</Label>
        <Textarea
          id="element-detail-facts"
          rows={3}
          value={factsText}
          placeholder={translateUi('height_5_ft_6_in_finish_matte_pink_a3ddf7ad')}
          onChange={(event) => setFactsText(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {translateUi('one_label_value_fact_per_line_72f3e4b2')}
        </p>
      </div>

      {category === 'animation' || category === 'effect' || motionAssetId ? (
        <div className="flex flex-col gap-1.5">
          <Label>{translateUi('motion_clip_74226eaa')}</Label>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="element-motion-upload"
              className="inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs hover:bg-muted"
            >
              <Upload className="mr-2 h-3.5 w-3.5" />{' '}
              {motionAssetId
                ? translateUi('replace_clip_a0b6e7ed')
                : translateUi('upload_clip_95ac507d')}
            </Label>
            {motionAssetId ? (
              <Badge variant="outline">{translateUi('clip_attached_42c32766')}</Badge>
            ) : null}
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
          <Label htmlFor="element-detail-rights">{translateUi('rights_basis_c272d465')}</Label>
          <Input
            id="element-detail-rights"
            value={rightsNote}
            onChange={(event) => setRightsNote(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{translateUi('elementRightsGuidance')}</p>
          {missingRights ? (
            <p className="text-xs text-destructive">
              {translateUi('elementRightsMissing', {
                category: elementCategoryLabel(element.category, translateUi),
              })}
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
          <History className="mr-2 h-4 w-4" /> {translateUi('restore_previous_7ee9e26e')}{' '}
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
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{' '}
          {translateUi('replace_element_f7062476')}{' '}
        </Button>
      </div>
    </div>
  );
}
