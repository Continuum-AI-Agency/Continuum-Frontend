'use client';

import {
  EDITOR_CUT_KINDS,
  type EditorCutKind,
  PLATFORM_EXPORT_PRESET_IDS,
  PLATFORM_EXPORT_PRESETS,
  type PlatformExportPresetId,
  platformExportPresetIdSchema,
  type VideoEditorOpOutput,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import { Film, Sparkles, TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations, useTranslations as useUiTranslations } from 'next-intl';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { type StudioVideoOrigin, studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import { cn } from '@/lib/utils';
import { useStudioMetadata } from '@/StudioCanvas/hooks/useStudioMetadata';
import { isPermanentError } from '../export/variantExports';
import { formatDuration, signAsset } from '../sources/PoolAssetCard';
import type { VideoStudioContext } from '../types';
import {
  type BriefFields,
  CUT_KIND_LABELS,
  chipActive,
  DEFAULT_BRIEF_FIELDS,
  DEFAULT_FINISH,
  describeBrief,
  type FinishFields,
  finishInput,
  GOAL_CHIPS,
  MOOD_CHIPS,
} from './briefGoals';

type DraftStatus = VideoEditorOpOutput<'draft_cut_status'>;
/** A redraft starts from the brief a project was drafted from. */
export type BriefSeed = BriefFields & { text: string };

type Variant = NonNullable<DraftStatus['variants']>[number];

const POLL_START_MS = 1_000;
const POLL_MAX_MS = 4_000;
/** draft_cut reads at most this many sources (its sourceAssetIds max). */
const MAX_SOURCES = 20;
/** The format choice that sends no preset, so the draft keeps the project's own format. */
const KEEP_FORMAT = 'keep';
type FormatChoice = PlatformExportPresetId | typeof KEEP_FORMAT;
const KIND_ITEMS = Object.fromEntries(
  EDITOR_CUT_KINDS.map((kind) => [kind, CUT_KIND_LABELS[kind]]),
);

const terminal = (status: DraftStatus | null) =>
  status?.state === 'completed' || status?.state === 'failed';

function FootageRow({
  asset,
  brandId,
  checked,
  disabled,
  onToggle,
}: {
  asset: VideoEditorPoolAsset;
  brandId: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const translateUi = useUiTranslations('studio');

  const displayLocale = useLocale();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const id = `brief-footage-${asset.assetId}`;
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onToggle} />
      <HoverCard
        openDelay={300}
        onOpenChange={(open) => {
          if (open && !mediaUrl)
            void signAsset(brandId, asset.assetId, asset.versionId).then(setMediaUrl);
        }}
      >
        <HoverCardTrigger
          render={<Label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-xs" />}
        >
          <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{asset.title}</span>
          {asset.origin !== 'project' ? (
            <span className="shrink-0 text-2xs text-muted-foreground">
              {translateUi('from_75857a45')} {asset.origin}
            </span>
          ) : null}
          {asset.durationSec ? (
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatDuration(asset.durationSec, displayLocale)}
            </span>
          ) : null}
        </HoverCardTrigger>
        <HoverCardContent className="w-72 space-y-2 p-3">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-muted">
            {mediaUrl ? (
              <video
                src={mediaUrl}
                poster={asset.thumbnailUrl}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <Film className="size-8 text-muted-foreground" />
            )}
          </div>
          <p className="truncate text-xs font-medium">{asset.title}</p>
        </HoverCardContent>
      </HoverCard>
    </li>
  );
}

function FinishSwitch({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        <span id={`${id}-hint`} className="truncate text-2xs text-muted-foreground">
          {hint}
        </span>
      </div>
      <Switch
        id={id}
        size="sm"
        aria-describedby={`${id}-hint`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/**
 * Footage + goal → first cuts. The goal is typed or picked from chips; draft_cut reads the
 * footage's spoken lines and cuts to it, and draft_cut_status reports until every variant
 * is a project. Polling outlives the dialog: close it and the cuts still land, announced by
 * a toast (with Undo) or, on failure, an error toast. The summary stays until the next open.
 */
export function BriefDialog({
  studio,
  origin,
  open,
  onOpenChange,
  sources,
  seed,
  onDrafted,
  onRunningChange,
}: {
  studio: VideoStudioContext;
  /** Kept when a summary's "Open B" switches variants. */
  origin: StudioVideoOrigin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Footage already in the project; checked by default. */
  sources: readonly VideoEditorPoolAsset[];
  seed: BriefSeed | null;
  /** A draft landed or was undone: the variants are worth reading again. */
  onDrafted: () => void;
  onRunningChange: (running: boolean) => void;
}): React.ReactNode {
  const registryText = useStudioMetadata();
  const displayLocale = useLocale();
  const errorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

  const uiText = useTranslations('common');
  const router = useRouter();
  const { show } = useToast();
  const { projectId } = studio;
  const [fields, setFields] = useState<BriefFields>(DEFAULT_BRIEF_FIELDS);
  const [typed, setTyped] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatChoice>(KEEP_FORMAT);
  const [captions, setCaptions] = useState(true);
  const [finish, setFinish] = useState<FinishFields>(DEFAULT_FINISH);
  const [pool, setPool] = useState<VideoEditorPoolAsset[]>([]);
  // Project footage is in unless unticked; pool footage is out unless ticked.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The revision the draft replaced — what the completion toast's Undo restores.
  const beforeRevision = useRef<number | null>(null);
  const latest = useRef({ studio, open, onDrafted, onRunningChange, show });
  latest.current = { studio, open, onDrafted, onRunningChange, show };

  const drafting = starting || (jobId !== null && !terminal(status));
  useEffect(() => latest.current.onRunningChange(drafting), [drafting]);

  // Each opening re-reads the brief from the seed (a redraft) or starts blank, and the
  // format from the project — unless a draft is running, which reopens on its progress.
  // Reset before the dialog can accept typing; a delayed effect can erase the first edit.
  // biome-ignore lint/correctness/useExhaustiveDependencies: an opening is the only trigger
  useLayoutEffect(() => {
    if (!open || drafting) return;
    setFields(
      seed
        ? {
            kind: seed.kind,
            targetDurationSec: seed.targetDurationSec,
            variants: seed.variants,
          }
        : DEFAULT_BRIEF_FIELDS,
    );
    setTyped(seed?.text ?? null);
    setFormat(KEEP_FORMAT);
    setCaptions(true);
    setFinish(DEFAULT_FINISH);
    setToggled(new Set());
    setError(null);
    setStatus(null);
    setJobId(null);
    runVideoEditorOp(projectId, 'get_pool', {})
      .then((result) => setPool(result.assets))
      .catch(() => setPool([]));
    // The timeline's words are heard (and kept per version) while the brief is written, so
    // the draft reads them instead of waiting on speech-to-text. Nothing shows; a failure
    // only leaves the draft to hear them itself.
    runVideoEditorOp(projectId, 'get_transcript', {}).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let delay = POLL_START_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed = (message: string) => {
      if (!latest.current.open) {
        latest.current.show({
          title: translateUi('first_cut_failed_4cd95693'),
          description: message,
          variant: 'error',
        });
      }
    };
    const undo = (toRevision: number) =>
      latest.current.studio
        .runOp('undo', { toRevision })
        .then(() => {
          latest.current.onDrafted();
          latest.current.show({
            title: translateUi('first_cut_undone_a2796084'),
            description: translateUi('restored_revision_value0_5391dc31', {
              value0: String(toRevision),
            }),
          });
        })
        .catch((undoError: unknown) =>
          latest.current.show({
            title: translateUi('undo_failed_c7abe568'),
            description: errorText(undoError),
            variant: 'error',
          }),
        );
    const completed = async (done: DraftStatus) => {
      await latest.current.studio.refresh();
      latest.current.onDrafted();
      const variants = done.variants ?? [];
      const warnings = done.warnings ?? [];
      const toRevision = beforeRevision.current;
      latest.current.show({
        title:
          variants.length > 1
            ? translateUi('value0_first_cuts_ready_60b6f3e7', {
                count: Number(variants.length),
              })
            : translateUi('first_cut_ready_ea5c32e4'),
        description: [
          variants
            .map(
              (variant) => `${variant.label} ${formatDuration(variant.durationSec, displayLocale)}`,
            )
            .join(' · '),
          ...warnings,
        ].join(' — '),
        variant: warnings.length > 0 ? 'warning' : 'success',
        durationMs: 15_000,
        ...(toRevision === null
          ? {}
          : {
              action: {
                label: uiText('undo_a8283ad'),
                onClick: () => void undo(toRevision),
              },
            }),
      });
    };
    const tick = async () => {
      try {
        const next = await runVideoEditorOp(projectId, 'draft_cut_status', {
          jobId,
        });
        if (cancelled) return;
        setStatus(next);
        setError(null);
        if (next.state === 'failed') return failed(translateUi('draftFailedFallback'));
        if (next.state === 'completed') return await completed(next);
      } catch (pollError) {
        if (cancelled) return;
        console.warn('[BriefDialog] Draft status read failed', pollError);
        if (isPermanentError(pollError)) {
          const message = errorText(pollError);
          setStatus({ jobId, state: 'failed' });
          setError(message);
          return failed(message);
        }
        setError(errorText(pollError));
      }
      delay = Math.min(delay * 1.5, POLL_MAX_MS);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, POLL_START_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, projectId, translateUi, errorText, displayLocale]);

  // draft_cut cuts video only: a finished cut's music bed is on the timeline but is not footage.
  const footage = useMemo(() => {
    const own = sources.filter((asset) => asset.kind === 'video');
    const ownIds = new Set(own.map((asset) => asset.assetId));
    const extra = pool.filter((asset) => asset.kind === 'video' && !ownIds.has(asset.assetId));
    return [
      ...own.map((asset) => ({ asset, own: true })),
      ...extra.map((asset) => ({ asset, own: false })),
    ];
  }, [pool, sources]);
  const checked = (entry: { asset: VideoEditorPoolAsset; own: boolean }) =>
    entry.own !== toggled.has(entry.asset.assetId);
  const chosen = footage.filter(checked).map((entry) => entry.asset.assetId);
  const tooMany = chosen.length > MAX_SOURCES;
  const text = typed ?? describeBrief(fields);
  const patch = (next: Partial<BriefFields>) => setFields((current) => ({ ...current, ...next }));
  const finishWith = (next: Partial<FinishFields>) =>
    setFinish((current) => ({ ...current, ...next }));

  const projectPreset = platformExportPresetIdSchema.safeParse(
    studio.project.exportSettings.presetId,
  );
  const kindItems = Object.fromEntries(
    EDITOR_CUT_KINDS.map((kind) => [kind, registryText(CUT_KIND_LABELS[kind])]),
  );
  const formatItems: Record<string, string> = {
    [KEEP_FORMAT]: translateUi('projectFormatOption', {
      format: projectPreset.success
        ? registryText(PLATFORM_EXPORT_PRESETS[projectPreset.data].label)
        : studio.project.canvas.width + '×' + studio.project.canvas.height,
    }),
    ...Object.fromEntries(
      PLATFORM_EXPORT_PRESET_IDS.map((id) => [id, registryText(PLATFORM_EXPORT_PRESETS[id].label)]),
    ),
  };

  const submit = async () => {
    setStarting(true);
    setJobId(null);
    setStatus(null);
    setError(null);
    beforeRevision.current = studio.project.revision;
    try {
      const started = await studio.runOp('draft_cut', {
        brief: text.trim(),
        ...fields,
        ...(format === KEEP_FORMAT ? {} : { preset: format }),
        captions,
        ...finishInput(finish, captions),
        sourceAssetIds: chosen,
      });
      setStatus({ jobId: started.jobId, state: started.state });
      setJobId(started.jobId);
    } catch (startError) {
      console.error('[BriefDialog] Draft start failed', startError);
      setError(errorText(startError));
    } finally {
      setStarting(false);
    }
  };

  // Closed first: Next keeps this page mounted (hidden) behind the sibling it opens.
  const openVariant = (variant: Variant) => {
    onOpenChange(false);
    if (variant.projectId !== projectId) {
      router.push(studioVideoHref({ projectId: variant.projectId, origin }));
    }
  };

  const progress = status?.progress !== undefined ? Math.round(status.progress * 100) : null;
  const failure =
    status?.state === 'failed' ? (error ?? translateUi('draftFailedFallback')) : error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="brief-dialog">
        <DialogHeader>
          <DialogTitle>{translateUi('first_cut_e5063f71')}</DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('say_what_you_want_every_spoken_line_a3467a4a')}{' '}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brief-text">{translateUi('what_do_you_want_3e17dbf9')}</Label>
          <Textarea
            id="brief-text"
            value={text}
            maxLength={2_000}
            disabled={drafting}
            className="min-h-20 resize-none text-sm"
            onChange={(event) => setTyped(event.target.value)}
          />
          <fieldset className="flex flex-wrap gap-1.5" aria-label={uiText('goals_116cd39')}>
            {GOAL_CHIPS.map((chip) => {
              const active = chipActive(chip.patch, fields);
              return (
                <Button
                  key={chip.label}
                  type="button"
                  size="sm"
                  variant={active ? 'secondary' : 'outline'}
                  aria-pressed={active}
                  disabled={drafting}
                  className={cn('h-7 rounded-full px-3 text-xs', active && 'ring-1 ring-primary')}
                  onClick={() => patch(chip.patch)}
                >
                  {registryText(chip.label)}
                </Button>
              );
            })}
          </fieldset>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
            <Label className="text-xs">{uiText('kind_f5387f9')}</Label>
            <Select<EditorCutKind>
              value={fields.kind}
              onValueChange={(kind) => patch({ kind })}
              disabled={drafting}
            >
              <SelectTrigger
                size="sm"
                className="w-full text-xs"
                aria-label={uiText('kind_f5387f9')}
              >
                <SelectValue items={kindItems} />
              </SelectTrigger>
              <SelectContent>
                {EDITOR_CUT_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind} className="text-xs">
                    {registryText(CUT_KIND_LABELS[kind])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
            <Label className="text-xs">{uiText('format_2f34366')}</Label>
            <Select<FormatChoice> value={format} onValueChange={setFormat} disabled={drafting}>
              <SelectTrigger
                size="sm"
                className="w-full text-xs"
                aria-label={uiText('format_2f34366')}
              >
                <SelectValue items={formatItems} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(formatItems).map(([id, label]) => (
                  <SelectItem key={id} value={id} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-2">
            <Label className="text-xs">{translateUi('length_adc95605')}</Label>
            <Slider
              aria-label={translateUi('length_in_seconds_3b8e12b5')}
              min={5}
              max={180}
              step={1}
              value={[fields.targetDurationSec]}
              disabled={drafting}
              onValueChange={([seconds]) => {
                if (seconds !== undefined) patch({ targetDurationSec: seconds });
              }}
            />
            <span className="text-right text-xs tabular-nums" data-testid="brief-length">
              {fields.targetDurationSec} s
            </span>
          </div>
          <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
            <Label className="text-xs">{uiText('variants_63d2643')}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              aria-label={uiText('variants_63d2643')}
              value={String(fields.variants)}
              onValueChange={(value) => {
                const count = Number(value as string);
                if (count >= 1 && count <= 5) patch({ variants: count });
              }}
            >
              {[1, 2, 3, 4, 5].map((count) => (
                <ToggleGroupItem key={count} value={String(count)} disabled={drafting}>
                  {count}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <Label htmlFor="brief-captions" className="text-xs">
              {' '}
              {translateUi('word_timed_captions_3626d2db')}{' '}
            </Label>
            <Switch
              id="brief-captions"
              size="sm"
              checked={captions}
              disabled={drafting}
              onCheckedChange={setCaptions}
            />
          </div>
        </div>

        <fieldset
          className="flex flex-col gap-2 rounded-md border p-3"
          aria-label={translateUi('finish_a6c7a84b')}
          data-testid="brief-finish"
        >
          <legend className="px-1 text-xs font-medium">{translateUi('finish_a6c7a84b')}</legend>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <FinishSwitch
              id="brief-music"
              label={uiText('music_6eb00b4')}
              hint={translateUi('execution_closure_aa5fbd65')}
              checked={finish.music}
              disabled={drafting}
              onChange={(music) => finishWith({ music })}
            />
            <FinishSwitch
              id="brief-hook-title"
              label={translateUi('hook_title_1a3e5923')}
              hint={translateUi('execution_closure_1b9f639e')}
              checked={finish.hookTitle}
              disabled={drafting}
              onChange={(hookTitle) => finishWith({ hookTitle })}
            />
            <FinishSwitch
              id="brief-broll"
              label={translateUi('b_roll_814c745d')}
              hint={translateUi('execution_closure_486ea3d7')}
              checked={finish.broll}
              disabled={drafting}
              onChange={(broll) => finishWith({ broll })}
            />
            <FinishSwitch
              id="brief-brand-captions"
              label={translateUi('brand_captions_922292eb')}
              hint={
                captions
                  ? translateUi('in_your_brand_s_type_and_colours_ca08edb7')
                  : translateUi('needs_word_timed_captions_8e315814')
              }
              checked={captions && finish.brandCaptions}
              disabled={drafting || !captions}
              onChange={(brandCaptions) => finishWith({ brandCaptions })}
            />
          </div>
          {finish.music ? (
            <div className="flex flex-col gap-1.5">
              <Input
                inputSize="sm"
                aria-label={translateUi('music_mood_a620eb21')}
                placeholder={translateUi('mood_or_leave_it_to_the_brief_3b66c874')}
                value={finish.mood}
                maxLength={300}
                disabled={drafting}
                className="text-xs"
                onChange={(event) => finishWith({ mood: event.target.value })}
              />
              <fieldset
                className="flex flex-wrap gap-1.5"
                aria-label={translateUi('moods_6bae2b46')}
              >
                {MOOD_CHIPS.map((mood) => {
                  const active = finish.mood === mood;
                  return (
                    <Button
                      key={mood}
                      type="button"
                      size="sm"
                      variant={active ? 'secondary' : 'outline'}
                      aria-pressed={active}
                      disabled={drafting}
                      className={cn(
                        'h-6 rounded-full px-2.5 text-2xs',
                        active && 'ring-1 ring-primary',
                      )}
                      onClick={() => finishWith({ mood: active ? '' : mood })}
                    >
                      {mood}
                    </Button>
                  );
                })}
              </fieldset>
            </div>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium">{translateUi('footage_it_will_use_b7e0a3e0')}</span>
          {footage.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              {' '}
              {translateUi('drop_a_video_or_recording_on_the_wo_79b2b5ea')}{' '}
            </p>
          ) : (
            <ul className="max-h-40 overflow-y-auto rounded-md border" data-testid="brief-footage">
              {footage.map((entry) => (
                <FootageRow
                  key={entry.asset.assetId}
                  asset={entry.asset}
                  brandId={studio.brandId}
                  checked={checked(entry)}
                  disabled={drafting}
                  onToggle={() =>
                    setToggled((current) => {
                      const next = new Set(current);
                      if (!next.delete(entry.asset.assetId)) next.add(entry.asset.assetId);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          )}
          {tooMany ? (
            <p className="text-xs text-destructive" data-testid="brief-too-many">
              {' '}
              {translateUi('a_first_cut_reads_at_most_7af20171')} {MAX_SOURCES}{' '}
              {translateUi('clips_untick_a626b31b')} {chosen.length - MAX_SOURCES}.
            </p>
          ) : null}
        </div>

        {jobId && !terminal(status) ? (
          <div className="flex flex-col gap-1.5" data-testid="brief-progress">
            <Progress value={progress} />
            <span className="text-xs text-muted-foreground" data-testid="brief-phase">
              {status?.phase ??
                (status?.state === 'running'
                  ? translateUi('drafting_1f91c1e4')
                  : translateUi('queued_661ff40a'))}
              {progress !== null ? ` · ${progress}%` : '…'}
            </span>
          </div>
        ) : null}

        {failure ? (
          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {failure}
          </p>
        ) : null}
        {status?.state === 'completed' ? (
          <div className="flex flex-col gap-2 rounded-md border p-3" data-testid="brief-summary">
            <ul className="flex flex-col gap-2">
              {(status.variants ?? []).map((variant) => (
                <li
                  key={variant.projectId}
                  data-variant={variant.label}
                  className="flex items-start gap-2 text-xs"
                >
                  <span className="w-4 shrink-0 font-semibold">{variant.label}</span>
                  <span className="w-10 shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(variant.durationSec, displayLocale)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {variant.headline ? (
                      <span className="font-semibold" data-testid="brief-headline">
                        “{variant.headline}”
                      </span>
                    ) : null}
                    <span>{variant.angle}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-2xs"
                    onClick={() => openVariant(variant)}
                  >
                    {' '}
                    {translateUi('open_ed077f3d')} {variant.label}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {status?.warnings?.map((warning) => (
          <p key={warning} className="text-xs text-amber-600 dark:text-amber-500">
            {warning}
          </p>
        ))}

        <DialogFooter>
          <Button
            onClick={() => void submit()}
            disabled={drafting || chosen.length === 0 || tooMany || text.trim().length === 0}
            data-testid="brief-submit"
          >
            {drafting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {drafting
              ? translateUi('drafting_bafe3bfa')
              : translateUi('draft_value0_cut_value1_62779d61', {
                  count: Number(fields.variants),
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
