'use client';

// The Edit-mode inspector over a durable EditorProjectV2. Visual clips reuse ClipInspector
// through the legacy ClipEffectSpec (mapped both ways by the render executor's reader and
// the projection's writer); caption tracks reuse CaptionEditor through CaptionCue. Audio and
// text clips are edited natively. Every change leaves as a TimelineEdit via timelineEdits.

import {
  type EditorAudioClip,
  type EditorCaptionClip,
  type EditorClip,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTextClip,
  type EditorTextStyle,
  type EditorTrack,
  type EditorVideoClip,
  editorClipAtSpeed,
} from '@continuum/contracts';
import { AlignCenter, AlignLeft, AlignRight, Loader2, Music, Type, Wand2, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ColorField } from '@/components/ui/color-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberScrubField } from '@/components/ui/number-field';
import { SliderField } from '@/components/ui/slider-field';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import {
  LookSection,
  MotionPresetsSection,
} from '@/components/video-studio/motion/ClipMotionSections';
import { KeyframeLane } from '@/components/video-studio/motion/KeyframeLane';
import { TextAnimationPicker } from '@/components/video-studio/motion/TextAnimationPicker';
import type { RunVideoEditorOp } from '@/components/video-studio/types';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import {
  type CaptionPresetId,
  isCaptionPresetId,
  resolveCaptionPreset,
  resolveStyleWithPreset,
} from '@/lib/clips/captionPresets';
import {
  type CaptionStyle,
  DEFAULT_CAPTION_STYLE,
  resolveCaptionStyle,
} from '@/lib/clips/clipCaptionStyle';
import type { TimelineItem } from '@/StudioCanvas/types';
import {
  type ClipEffectSpec,
  type ClipTransform,
  speedFor,
} from '@/StudioCanvas/utils/render/effectSpec';
import type { ClipTransition } from '@/StudioCanvas/utils/render/transitions';
import {
  type CaptionCue,
  captionCueText,
  wordsForCaptionText,
} from '@/StudioCanvas/utils/splice/captionCues';
import { CaptionEditor } from '../CaptionEditor';
import { ClipInspector } from '../ClipInspector';
import {
  type EditorCommandDraft,
  MIN_ASSEMBLY_CLIP_SEC,
  orderedVideoClips,
  removeTransitionOperation,
  upsertTransitionOperation,
  videoTimelineItems,
} from '../editorProjectV2AssemblyModel';
import { editorClipFieldsFromEffectSpec, transitionKind } from '../editorProjectV2Projection';
import type { PlayheadStore } from './playheadStore';
import {
  type EditBuild,
  findClip,
  mainVideoTrack,
  replaceClipEdit,
  simulate,
  type TimelineEdit,
  trimEdit,
} from './timelineEdits';

type VisualClip = EditorVideoClip | EditorOverlayClip;
type CaptionTrack = Extract<EditorTrack, { kind: 'caption' }>;
type Build = (project: EditorProjectV2) => TimelineEdit | null;
type SectionProps<T extends EditorClip> = {
  project: EditorProjectV2;
  clip: T;
  onEdit: (build: EditBuild) => void;
  onDeselect: () => void;
};
/** What the motion sections need beyond the clip: ops, and the playhead to key at. */
type MotionProps = { runOp: RunVideoEditorOp; store: PlayheadStore };

const SECTION_LABEL = 'text-2xs font-semibold uppercase tracking-wide text-muted-foreground';
const SELECT_CLASS =
  'h-8 w-full rounded-md border border-border/70 bg-background px-2 text-xs text-foreground';
/** Long enough to outlast one slider drag's stream of ticks, short enough to feel live. */
const SETTLE_MS = 300;
const TEXT_WEIGHTS = [400, 600, 700, 800, 900];
const ALIGNMENTS = [
  { id: 'left', label: 'Align left', Icon: AlignLeft },
  { id: 'center', label: 'Align center', Icon: AlignCenter },
  { id: 'right', label: 'Align right', Icon: AlignRight },
] as const;
const CROP_EDGES = ['left', 'top', 'right', 'bottom'] as const;
// The keyframe properties a Ken Burns move writes; opacity and 3D stops are not its to drop.
const MOTION_PROPERTIES = new Set([
  'transform.position',
  'transform.scaleX',
  'transform.scaleY',
  'transform.rotationDeg',
]);
// Effect instances the spec round-trips (see clipEffectSpecFromEditorClip). Anything else
// on the clip — stabilize, beauty, audio filters — is invisible to the spec and kept as is.
const SPEC_EFFECT_TYPES = new Set([
  'color_adjustment',
  'video_filter',
  'blur',
  'chroma_key',
  'background_removal',
]);
const SPEC_EFFECT_IDS = new Set([
  'tint',
  'vignette',
  'film_grain',
  'pixelate',
  'chromatic_aberration',
  'vhs',
  'corner_radius',
]);

// Spec fields the V2 writer has no home for: text overlays are text clips, and warmth is not
// in the effect pair. Dropped here so a control cannot show a change that never saves.
const UNMAPPED_SPEC_KEYS = ['text', 'warmth'] as const;

const isVisual = (clip: EditorClip): clip is VisualClip =>
  clip.kind === 'video' || clip.kind === 'overlay';

function patchClipEdit(
  project: EditorProjectV2,
  clipId: string,
  fields: Partial<EditorClip>,
  label: string,
): TimelineEdit | null {
  const found = findClip(project, clipId);
  return found ? replaceClipEdit(project, { ...found.clip, ...fields } as EditorClip, label) : null;
}

/** Several pending edits as ONE revision, each built on the project the previous leaves. */
function combineEdits(project: EditorProjectV2, builds: readonly Build[]): TimelineEdit | null {
  let current = project;
  let label = '';
  const forward: EditorCommandDraft[] = [];
  for (const [index, build] of builds.entries()) {
    const edit = build(current);
    if (!edit) continue;
    label ||= edit.label;
    forward.push(...edit.forward);
    if (index === builds.length - 1) continue;
    try {
      current = simulate(current, edit.forward);
    } catch {
      // The combined commit fails the same way, and the workspace reports that.
    }
  }
  return forward.length > 0 ? { label, forward } : null;
}

/**
 * Sliders report every drag tick and every edit is a server revision, so edits wait here
 * until input settles and then leave as one. Waiting work is keyed so a newer value of the
 * same control replaces the older; `now` folds anything waiting into a discrete edit rather
 * than racing it with a second commit on the same revision.
 */
function useSettledEdits(onEdit: (build: EditBuild) => void) {
  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onEditRef.current = onEdit;
  });
  const jobs = useRef(new Map<string, Build>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The builds run when the workspace applies them, on the project the edit before them
  // left — never on the props this component last rendered with.
  const run = useCallback((extra?: Build) => {
    clearTimeout(timer.current);
    const builds = [...jobs.current.values(), ...(extra ? [extra] : [])];
    jobs.current.clear();
    if (builds.length === 0) return;
    onEditRef.current((current) => combineEdits(current, builds));
  }, []);
  // Deselecting mid-drag keeps the change rather than dropping it.
  useEffect(() => () => run(), [run]);

  const schedule = useCallback(
    (key: string, build: Build) => {
      jobs.current.set(key, build);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => run(), SETTLE_MS);
    },
    [run],
  );
  const now = useCallback((build: Build) => run(build), [run]);
  const flush = useCallback(() => run(), [run]);
  const pending = useCallback(() => jobs.current.size > 0, []);
  return { schedule, now, flush, pending };
}

/** A clip shown with its uncommitted field edits applied; `patch` queues more of them. */
function useClipDraft<T extends EditorClip>(
  project: EditorProjectV2,
  clip: T,
  onEdit: (build: EditBuild) => void,
) {
  const edits = useSettledEdits(onEdit);
  const { pending, schedule } = edits;
  const [draft, setDraft] = useState<Partial<T>>({});
  const fields = useRef<Partial<T>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new server clip is the trigger.
  useEffect(() => {
    if (!pending()) setDraft({});
  }, [clip, pending]);

  const patch = useCallback(
    (next: Partial<T>, label = 'Edit clip') => {
      fields.current = { ...fields.current, ...next };
      setDraft((current) => ({ ...current, ...next }));
      schedule('clip', (latest) => {
        const queued = fields.current;
        fields.current = {};
        return Object.keys(queued).length > 0
          ? patchClipEdit(latest, clip.id, queued as Partial<EditorClip>, label)
          : null;
      });
    },
    [clip.id, schedule],
  );
  return { view: { ...clip, ...draft } as T, patch, edits };
}

// ── Visual clips: ClipInspector over the effect spec ──────────────────────────────────────

/** A visual clip as the spec ClipInspector edits. Ken Burns is read from the clip's own
 *  motion keyframes, so the toggle shows what the clip actually does. */
export function inspectorSpecFor(clip: VisualClip): ClipEffectSpec {
  const spec = clipEffectSpecFromEditorClip(clip);
  if (!clip.keyframes.some((keyframe) => MOTION_PROPERTIES.has(keyframe.property))) return spec;
  const stops = spec.keyframes ?? [];
  return {
    ...spec,
    kenBurns: { from: stops[0]?.transform ?? {}, to: stops.at(-1)?.transform ?? {} },
  };
}

/**
 * A visual clip with an edited spec written back. Constant speed keeps the SOURCE span, so
 * the clip's length follows the rate. Everything the spec cannot express — crop, masks,
 * anchors, effects it has no field for, opacity and 3D keyframes — is kept; motion keyframes
 * are rewritten only when the edit touched motion.
 */
export function clipWithEffectSpec<T extends VisualClip>(
  clip: T,
  spec: ClipEffectSpec,
  motionChanged: boolean,
): T {
  const rate = clip.kind === 'video' ? clip.playbackRate : 1;
  const nextRate = clip.kind === 'video' ? speedFor(spec) : 1;
  const retimed =
    clip.kind === 'video' && rate !== nextRate ? editorClipAtSpeed(clip, nextRate) : clip;
  const durationSec = retimed.durationSec;
  const stretch = durationSec / clip.durationSec;
  const mapped = editorClipFieldsFromEffectSpec(clip.id, spec, durationSec);
  const base = spec.transform ?? {};
  // ClipInspector's Ken Burns stops are absolute; anchor them to where the clip already sits.
  const stop = (at: ClipTransform): ClipTransform => ({
    offsetX: base.offsetX,
    offsetY: base.offsetY,
    rotate: base.rotate,
    scale: (base.scale ?? 1) * (at.scale ?? 1),
  });
  const motion =
    motionChanged && spec.kenBurns
      ? editorClipFieldsFromEffectSpec(
          clip.id,
          {
            ...spec,
            keyframes: undefined,
            kenBurns: { from: stop(spec.kenBurns.from), to: stop(spec.kenBurns.to) },
          },
          durationSec,
        ).keyframes
      : [];
  const kept = clip.keyframes
    .filter((keyframe) => !(motionChanged && MOTION_PROPERTIES.has(keyframe.property)))
    .map((keyframe) => ({ ...keyframe, timeSec: keyframe.timeSec * stretch }));
  const owned = (effect: EditorVideoClip['effects'][number]) =>
    SPEC_EFFECT_TYPES.has(effect.effectType) || SPEC_EFFECT_IDS.has(effect.effectId);
  const next = {
    ...clip,
    transform: {
      ...mapped.transform,
      anchorX: clip.transform.anchorX,
      anchorY: clip.transform.anchorY,
    },
    effects: [...clip.effects.filter((effect) => !owned(effect)), ...mapped.effects],
    blendMode: mapped.blendMode,
    keyframes: [...kept, ...motion],
  };
  return (clip.kind === 'video' ? { ...next, playbackRate: nextRate, durationSec } : next) as T;
}

/** Source-time trims from ClipInspector as timeline edge drags. */
function trimFromSource(
  project: EditorProjectV2,
  clipId: string,
  range: { startSec?: number; endSec?: number },
  sourceDurationSec?: number,
): TimelineEdit | null {
  const found = findClip(project, clipId);
  if (!found || !isVisual(found.clip)) return null;
  const { clip } = found;
  const rate = clip.kind === 'video' ? clip.playbackRate : 1;
  const sourceIn = clip.sourceInSec ?? 0;
  const edge = range.startSec !== undefined ? 'start' : 'end';
  const sourceSec = range.startSec ?? range.endSec;
  if (sourceSec === undefined) return null;
  const atSec = clip.timelineStartSec + (sourceSec - sourceIn) / rate;
  return trimEdit(project, clipId, edge, atSec, sourceDurationSec);
}

/** The transition INTO a main-track clip from the one before it; undefined removes it. */
function transitionEdit(
  project: EditorProjectV2,
  clipId: string,
  next: ClipTransition | undefined,
): TimelineEdit | null {
  const main = mainVideoTrack(project);
  const order = orderedVideoClips(main);
  const index = order.findIndex((clip) => clip.id === clipId);
  if (!main || index < 1) return null;
  const fromClipId = order[index - 1].id;
  const existing = project.transitions.find(
    (transition) =>
      transition.trackId === main.id &&
      transition.fromClipId === fromClipId &&
      transition.toClipId === clipId,
  );
  if (!next) {
    if (!existing) return null;
    const { label, forward } = removeTransitionOperation(project, existing.id);
    return { label, forward };
  }
  const kind = transitionKind(next);
  const operation = upsertTransitionOperation(project, {
    trackId: main.id,
    fromClipId,
    toClipId: clipId,
    transitionType: kind.transitionType,
    durationSec: next.durationSec,
  });
  // The operation keeps the old direction/id; slides and wipes carry theirs in these.
  return {
    label: operation.label,
    forward: operation.forward.map((draft) =>
      draft.commandType === 'upsert_transition'
        ? {
            ...draft,
            transition: {
              ...draft.transition,
              transitionId: kind.transitionId,
              parameters: kind.parameters,
            },
          }
        : draft,
    ),
  };
}

function VisualClipInspector({
  project,
  clip,
  onEdit,
  onDeselect,
  sourceDurationSec,
  runOp,
  store,
}: SectionProps<VisualClip> & MotionProps & { sourceDurationSec?: number }) {
  const { view, patch, edits } = useClipDraft(project, clip, onEdit);
  const { pending, schedule, now } = edits;
  const main = mainVideoTrack(project);
  const onMain = Boolean(main?.clips.some((candidate) => candidate.id === clip.id));
  const spec = useMemo(() => inspectorSpecFor(clip), [clip]);
  const committedTransition = useMemo(
    () =>
      main
        ? videoTimelineItems({ ...project, tracks: [main] }).find((item) => item.id === clip.id)
            ?.transition
        : undefined,
    [clip.id, main, project],
  );
  const [draftSpec, setDraftSpec] = useState<ClipEffectSpec>();
  const [draftTransition, setDraftTransition] = useState<{ value?: ClipTransition }>();
  const queuedSpec = useRef<{ spec: ClipEffectSpec; motion: boolean } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new server clip is the trigger.
  useEffect(() => {
    if (pending()) return;
    setDraftSpec(undefined);
    setDraftTransition(undefined);
  }, [clip, committedTransition, pending]);

  const effects = draftSpec ?? spec;
  const rate = clip.kind === 'video' ? clip.playbackRate : 1;
  const sourceIn = clip.sourceInSec ?? 0;
  const item: TimelineItem = {
    id: clip.id,
    order: 0,
    sourceNodeId: clip.id,
    kind: clip.kind === 'overlay' && clip.mediaKind === 'image' ? 'image' : 'video',
    trimStartSec: sourceIn,
    trimEndSec: sourceIn + clip.durationSec * rate,
    // Layers render muted; only a main-sequence video clip carries sound.
    muteAudio: clip.kind === 'video' ? !clip.audioEnabled : true,
    effects,
    transition: draftTransition ? draftTransition.value : committedTransition,
  };

  const setEffects = (patchSpec: Partial<ClipEffectSpec>) => {
    if (UNMAPPED_SPEC_KEYS.some((key) => key in patchSpec)) return;
    const next = { ...effects, ...patchSpec };
    queuedSpec.current = {
      spec: next,
      motion: Boolean(queuedSpec.current?.motion) || 'kenBurns' in patchSpec,
    };
    setDraftSpec(next);
    schedule('effects', (latest) => {
      const queued = queuedSpec.current;
      queuedSpec.current = null;
      const found = findClip(latest, clip.id);
      if (!queued || !found || !isVisual(found.clip)) return null;
      const next = clipWithEffectSpec(found.clip, queued.spec, queued.motion);
      if (JSON.stringify(next) === JSON.stringify(found.clip)) return null;
      return replaceClipEdit(latest, next, 'speed' in patchSpec ? 'Change speed' : 'Edit clip');
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {/* ClipInspector is its own full-height scroller; flattened so the crop block below
          scrolls with it instead of hiding behind a second scrollbar. */}
      <div className="shrink-0 *:h-auto *:overflow-visible">
        <ClipInspector
          item={item}
          context={onMain ? 'base' : 'overlay'}
          durationSec={(clip.durationSec * rate) / (clip.kind === 'video' ? speedFor(effects) : 1)}
          sourceDurationSec={sourceDurationSec}
          label={clip.name ?? 'Clip'}
          onTrim={(range) =>
            now((latest) => trimFromSource(latest, clip.id, range, sourceDurationSec))
          }
          onSetStill={(sec) =>
            now((latest) =>
              patchClipEdit(
                latest,
                clip.id,
                { durationSec: Math.max(MIN_ASSEMBLY_CLIP_SEC, sec) },
                'Set duration',
              ),
            )
          }
          onSetMute={(mute) => {
            if (clip.kind !== 'video') return;
            now((latest) =>
              patchClipEdit(
                latest,
                clip.id,
                { audioEnabled: !mute },
                mute ? 'Mute clip' : 'Unmute clip',
              ),
            );
          }}
          onSetEffects={setEffects}
          onSetTransition={(next) => {
            setDraftTransition({ value: next });
            schedule('transition', (latest) => transitionEdit(latest, clip.id, next));
          }}
          onClose={onDeselect}
        />
      </div>
      <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 p-3">
        <span className={SECTION_LABEL}>Crop</span>
        {CROP_EDGES.map((edge) => (
          <SliderField
            key={edge}
            label={`Crop ${edge}`}
            value={view.crop[edge]}
            min={0}
            max={0.45}
            step={0.01}
            format={{ style: 'percent', maximumFractionDigits: 0 }}
            onChange={(value) => patch({ crop: { ...view.crop, [edge]: value } }, 'Crop clip')}
          />
        ))}
      </div>
      <MotionPresetsSection clip={clip} getPlayheadSec={store.getSec} runOp={runOp} />
      <KeyframeLane clip={clip} store={store} onEdit={now} onSettle={schedule} />
      <LookSection clip={clip} runOp={runOp} />
    </div>
  );
}

// ── Audio and text clips: native V2 fields ────────────────────────────────────────────────

function InspectorHeader({
  icon,
  label,
  onDeselect,
}: {
  icon: ReactNode;
  label: string;
  onDeselect: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate text-xs font-semibold">{label}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        aria-label="Deselect clip"
        onClick={onDeselect}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function AudioClipInspector({
  project,
  clip,
  onEdit,
  onDeselect,
  store,
}: SectionProps<EditorAudioClip> & Pick<MotionProps, 'store'>) {
  const { view, patch, edits } = useClipDraft(project, clip, onEdit);
  const fadeMax = Math.min(5, view.durationSec);
  const setSpeed = (playbackRate: number) => {
    patch(editorClipAtSpeed(view, playbackRate), 'Change speed');
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-lg border border-border/60 p-3">
      <InspectorHeader
        icon={<Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        label={clip.name ?? 'Audio'}
        onDeselect={onDeselect}
      />
      <span className={SECTION_LABEL}>Audio</span>
      <SliderField
        label="Volume"
        value={view.volume}
        min={0}
        max={2}
        step={0.05}
        format={{ style: 'percent', maximumFractionDigits: 0 }}
        onChange={(volume) => patch({ volume }, 'Change volume')}
      />
      <SliderField
        label="Fade in"
        value={Math.min(view.fadeInSec, fadeMax)}
        min={0}
        max={fadeMax}
        step={0.1}
        suffix="s"
        onChange={(fadeInSec) => patch({ fadeInSec }, 'Fade in')}
      />
      <SliderField
        label="Fade out"
        value={Math.min(view.fadeOutSec, fadeMax)}
        min={0}
        max={fadeMax}
        step={0.1}
        suffix="s"
        onChange={(fadeOutSec) => patch({ fadeOutSec }, 'Fade out')}
      />
      <SliderField
        label="Speed"
        value={view.playbackRate}
        min={0.25}
        max={4}
        step={0.05}
        suffix="x"
        onChange={setSpeed}
      />
      <KeyframeLane clip={clip} store={store} onEdit={edits.now} onSettle={edits.schedule} />
    </div>
  );
}

function TextClipInspector({
  project,
  clip,
  onEdit,
  onDeselect,
  runOp,
  store,
}: SectionProps<EditorTextClip> & MotionProps) {
  const { view, patch, edits } = useClipDraft(project, clip, onEdit);
  const ids = useId();
  const [text, setText] = useState(clip.text);
  const [font, setFont] = useState(clip.style.fontFamily);
  useEffect(() => {
    setText(clip.text);
    setFont(clip.style.fontFamily);
  }, [clip.text, clip.style.fontFamily]);

  const setStyle = (next: Partial<EditorTextStyle>, label = 'Style text') =>
    patch({ style: { ...view.style, ...next } }, label);
  const setPosition = (axis: 'x' | 'y', value: number) =>
    patch(
      { transform: { ...view.transform, position: { ...view.transform.position, [axis]: value } } },
      'Move text',
    );
  // Typing is not a revision: text and font commit on blur or Enter, never mid-word.
  const commitText = () => {
    if (!text.trim()) {
      setText(view.text);
    } else if (text !== view.text) {
      patch({ text }, 'Edit text');
      edits.flush();
    }
  };
  const commitFont = () => {
    const family = font.trim();
    if (!family) {
      setFont(view.style.fontFamily);
    } else if (family !== view.style.fontFamily) {
      setStyle({ fontFamily: family }, 'Change font');
      edits.flush();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-border/60 p-3">
        <InspectorHeader
          icon={<Type className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          label={clip.name ?? 'Text'}
          onDeselect={onDeselect}
        />
        <span className={SECTION_LABEL}>Text</span>
        <Textarea
          aria-label="Text content"
          value={text}
          className="min-h-16 text-xs"
          onChange={(event) => setText(event.target.value)}
          onBlur={commitText}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              commitText();
            }
          }}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${ids}-font`} className="text-2xs">
            Font
          </Label>
          <Input
            id={`${ids}-font`}
            value={font}
            className="h-8 text-xs"
            onChange={(event) => setFont(event.target.value)}
            onBlur={commitFont}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitFont();
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberScrubField
            label="Size"
            value={view.style.fontSizePx}
            min={1}
            max={2000}
            step={1}
            suffix="px"
            onChange={(fontSizePx) => setStyle({ fontSizePx })}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-weight`} className="text-2xs">
              Weight
            </Label>
            <select
              id={`${ids}-weight`}
              className={SELECT_CLASS}
              value={view.style.fontWeight}
              onChange={(event) => setStyle({ fontWeight: Number(event.target.value) })}
            >
              {TEXT_WEIGHTS.map((weight) => (
                <option key={weight} value={weight}>
                  {weight}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-2xs">
          <div className="flex flex-col gap-1">
            Color
            <ColorField
              label="Text"
              value={view.style.color}
              onChange={(color) => setStyle({ color })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              Background
              {view.style.backgroundColor ? (
                <button
                  type="button"
                  className="text-3xs text-muted-foreground hover:text-foreground"
                  onClick={() => setStyle({ backgroundColor: undefined })}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <ColorField
              label="Text background"
              value={view.style.backgroundColor ?? null}
              onChange={(backgroundColor) => setStyle({ backgroundColor })}
            />
          </div>
          <div className="flex flex-col gap-1">
            Outline
            <ColorField
              label="Text outline"
              value={view.style.outlineColor ?? null}
              onChange={(outlineColor) => setStyle({ outlineColor })}
            />
          </div>
          <SliderField
            label="Outline width"
            value={view.style.outlineWidthPx}
            min={0}
            max={20}
            step={0.5}
            suffix="px"
            onChange={(outlineWidthPx) => setStyle({ outlineWidthPx })}
          />
        </div>
        <div className="flex gap-1">
          {ALIGNMENTS.map(({ id, label, Icon }) => (
            <Button
              key={id}
              variant={view.style.alignment === id ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              aria-label={label}
              aria-pressed={view.style.alignment === id}
              onClick={() => setStyle({ alignment: id })}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>
        <SliderField
          label="Position X"
          value={view.transform.position.x}
          min={0}
          max={1}
          step={0.01}
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          onChange={(value) => setPosition('x', value)}
        />
        <SliderField
          label="Position Y"
          value={view.transform.position.y}
          min={0}
          max={1}
          step={0.01}
          format={{ style: 'percent', maximumFractionDigits: 0 }}
          onChange={(value) => setPosition('y', value)}
        />
        <span className={SECTION_LABEL}>Animation</span>
        <TextAnimationPicker
          animationIn={view.animationIn}
          animationOut={view.animationOut}
          onPick={(field, id) => {
            const value = id === 'none' ? undefined : id;
            patch(
              field === 'animationIn' ? { animationIn: value } : { animationOut: value },
              'Animate text',
            );
            edits.flush();
          }}
        />
      </div>
      <MotionPresetsSection clip={clip} getPlayheadSec={store.getSec} runOp={runOp} />
      <KeyframeLane clip={clip} store={store} onEdit={edits.now} onSettle={edits.schedule} />
    </div>
  );
}

// ── Captions: CaptionEditor over the whole caption track ──────────────────────────────────

const MIN_CAPTION_SEC = 0.01;

const leadClip = (clips: readonly EditorCaptionClip[]): EditorCaptionClip | undefined =>
  clips.reduce<EditorCaptionClip | undefined>(
    (lead, clip) => (!lead || clip.timelineStartSec < lead.timelineStartSec ? clip : lead),
    undefined,
  );

function cueForClip(clip: EditorCaptionClip, trackColor: string): CaptionCue {
  const endSec = clip.timelineStartSec + clip.durationSec;
  return {
    id: clip.id,
    startSec: clip.timelineStartSec,
    endSec,
    words:
      clip.words.length > 0
        ? // Stored from the clip's start; CaptionEditor works in timeline seconds.
          clip.words.map(({ text, startSec, endSec: wordEnd, emphasis }) => ({
            text,
            startSec: clip.timelineStartSec + startSec,
            endSec: clip.timelineStartSec + wordEnd,
            ...(emphasis ? { emphasis } : {}),
          }))
        : wordsForCaptionText(clip.text, clip.timelineStartSec, endSec),
    ...(clip.style.color !== trackColor ? { style: { textColor: clip.style.color } } : {}),
  };
}

/** The track's shared look, as the CaptionStyle the editor edits. V2 has no preset id. */
function captionStyleFromClip(
  clip: EditorCaptionClip,
  canvasHeight: number,
  presetId: CaptionPresetId,
): CaptionStyle {
  const { style } = clip;
  return {
    presetId,
    textColor: style.color,
    highlightColor: clip.highlightColor ?? DEFAULT_CAPTION_STYLE.highlightColor,
    outlineColor: style.outlineColor ?? '#000000',
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontSizeFrac: style.fontSizePx / canvasHeight,
    outlineWidthFrac: style.fontSizePx > 0 ? style.outlineWidthPx / style.fontSizePx : 0,
    position: { xFrac: clip.transform.position.x, yFrac: clip.transform.position.y },
    ...(style.backgroundColor ? { backgroundColor: style.backgroundColor } : {}),
    ...(clip.highlightMode === 'none' ? { activeWordMode: 'none' as const } : {}),
  };
}

export function captionClipWithStyle(
  clip: EditorCaptionClip,
  style: CaptionStyle,
  canvasHeight: number,
): EditorCaptionClip {
  // Re-resolved only for its type: the preset resolver already fills a position.
  const resolved = resolveCaptionStyle(resolveStyleWithPreset(style));
  const fontSizePx = Math.min(2000, Math.max(1, (resolved.fontSizeFrac ?? 0.055) * canvasHeight));
  return {
    ...clip,
    style: {
      ...clip.style,
      fontFamily: resolved.fontFamily ?? 'Inter',
      fontSizePx,
      fontWeight: Math.min(900, Math.max(100, Math.round(resolved.fontWeight ?? 700))),
      color: resolved.textColor,
      outlineColor: resolved.outlineColor,
      outlineWidthPx: Math.min(100, (resolved.outlineWidthFrac ?? 0) * fontSizePx),
      backgroundColor: resolved.backgroundColor,
    },
    transform: {
      ...clip.transform,
      position: { x: resolved.position.xFrac, y: resolved.position.yFrac, unit: 'normalized' },
    },
    highlightMode: resolved.activeWordMode === 'none' ? 'none' : 'word',
    highlightColor: resolved.highlightColor,
  };
}

/**
 * Edited cues back into caption-track drafts: changed, added (an SRT import) and removed
 * clips. A cue emptied of text keeps its clip — V2 captions cannot be blank.
 */
export function captionCueDrafts(
  track: CaptionTrack,
  cues: readonly CaptionCue[],
): EditorCommandDraft[] {
  const byId = new Map(track.clips.map((clip) => [clip.id, clip]));
  const template = leadClip(track.clips);
  const trackColor = template?.style.color ?? DEFAULT_CAPTION_STYLE.textColor;
  const kept = new Set<string>();
  const drafts: EditorCommandDraft[] = [];
  for (const cue of cues) {
    const existing = byId.get(cue.id);
    if (existing) kept.add(existing.id);
    // Compared as the editor was given it, so a clip nobody touched is never rewritten.
    if (existing && JSON.stringify(cue) === JSON.stringify(cueForClip(existing, trackColor))) {
      continue;
    }
    const text = captionCueText(cue).trim();
    const base =
      existing ?? (template && { ...template, id: crypto.randomUUID(), name: 'Caption' });
    if (!text || !base) continue;
    const clipStart = Math.max(0, cue.startSec);
    const next: EditorCaptionClip = {
      ...base,
      timelineStartSec: clipStart,
      durationSec: Math.max(MIN_CAPTION_SEC, cue.endSec - cue.startSec),
      text,
      words: cue.words.slice(0, 200).map((word, index) => {
        const original = existing?.words[index];
        const startSec = Math.max(0, word.startSec - clipStart);
        return {
          ...(original?.text === word.text ? original : {}),
          text: word.text,
          startSec,
          endSec: Math.max(startSec, word.endSec - clipStart),
          emphasis: word.emphasis,
        };
      }),
      style: { ...base.style, color: cue.style?.textColor ?? trackColor },
    };
    drafts.push({ commandType: 'upsert_clip', trackId: track.id, clip: next });
  }
  for (const clip of track.clips) {
    if (!kept.has(clip.id)) {
      drafts.push({ commandType: 'remove_clip', trackId: track.id, clipId: clip.id });
    }
  }
  return drafts;
}

function captionTrackIn(project: EditorProjectV2, trackId: string): CaptionTrack | undefined {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  return track?.kind === 'caption' && !track.locked ? track : undefined;
}

function CaptionTrackInspector({
  project,
  track,
  clipId,
  onEdit,
  onDeselect,
  runOp,
}: {
  project: EditorProjectV2;
  track: CaptionTrack;
  clipId: string;
  onEdit: (build: EditBuild) => void;
  onDeselect: () => void;
  runOp: RunVideoEditorOp;
}) {
  const { show } = useToast();
  const { schedule, pending } = useSettledEdits(onEdit);
  const [selectedCueId, setSelectedCueId] = useState(clipId);
  const [presetId, setPresetId] = useState<CaptionPresetId>('classic');
  const [draftCues, setDraftCues] = useState<CaptionCue[]>();
  const [draftStyle, setDraftStyle] = useState<CaptionStyle>();
  const [captioning, setCaptioning] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new server track is the trigger.
  useEffect(() => {
    if (pending()) return;
    setDraftCues(undefined);
    setDraftStyle(undefined);
  }, [track, pending]);

  const ordered = useMemo(
    () => track.clips.toSorted((left, right) => left.timelineStartSec - right.timelineStartSec),
    [track.clips],
  );
  const lead = leadClip(ordered);
  const trackColor = lead?.style.color ?? DEFAULT_CAPTION_STYLE.textColor;
  const cues = useMemo(
    () => draftCues ?? ordered.map((clip) => cueForClip(clip, trackColor)),
    [draftCues, ordered, trackColor],
  );
  const style =
    draftStyle ?? (lead ? captionStyleFromClip(lead, project.canvas.height, presetId) : undefined);

  const changeCues = (next: CaptionCue[]) => {
    setDraftCues(next);
    schedule('cues', (latest) => {
      const current = captionTrackIn(latest, track.id);
      const forward = current ? captionCueDrafts(current, next) : [];
      return forward.length > 0 ? { label: 'Edit captions', forward } : null;
    });
  };
  const changeStyle = (next: CaptionStyle) => {
    if (isCaptionPresetId(next.presetId)) setPresetId(next.presetId);
    setDraftStyle(next);
    schedule('style', (latest) => {
      const current = captionTrackIn(latest, track.id);
      if (!current || current.clips.length === 0) return null;
      return {
        label: 'Restyle captions',
        forward: current.clips.map((clip) => ({
          commandType: 'upsert_clip' as const,
          trackId: current.id,
          clip: captionClipWithStyle(clip, next, latest.canvas.height),
        })),
      };
    });
  };
  const autoCaption = async () => {
    setCaptioning(true);
    try {
      await runOp('set_captions', { style: presetId });
    } catch (error) {
      show({
        title: 'Auto-captions failed',
        description: error instanceof Error ? error.message : 'Captions could not be generated.',
        variant: 'error',
      });
    } finally {
      setCaptioning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="h-7 gap-1.5 text-2xs"
          disabled={captioning}
          onClick={() => void autoCaption()}
        >
          {captioning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Wand2 className="h-3 w-3" />
          )}
          {captioning ? 'Captioning…' : `Auto-captions · ${resolveCaptionPreset(presetId).label}`}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          aria-label="Deselect clip"
          onClick={onDeselect}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex min-h-96 flex-1 flex-col">
        <CaptionEditor
          cues={cues}
          selectedId={selectedCueId}
          style={style}
          onSelect={setSelectedCueId}
          onChangeCues={changeCues}
          onChangeStyle={changeStyle}
        />
      </div>
    </div>
  );
}

// ── Entry ────────────────────────────────────────────────────────────────────────────────

function InspectorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-border/60 p-4 text-center text-2xs text-muted-foreground">
      {children}
    </div>
  );
}

export function WorkspaceInspector({
  project,
  clipId,
  sourceDurationSec,
  onEdit,
  runOp,
  store,
  onDeselect,
}: {
  project: EditorProjectV2;
  clipId: string | undefined;
  previewUrl?: string;
  sourceDurationSec?: number;
  onEdit: (build: EditBuild) => void;
  runOp: RunVideoEditorOp;
  store: PlayheadStore;
  onDeselect: () => void;
}): ReactNode {
  const found = clipId ? findClip(project, clipId) : undefined;
  if (!found) return <InspectorNote>Select a clip to edit it.</InspectorNote>;
  const { clip, track } = found;
  if (track.locked) return <InspectorNote>Unlock {track.name} to edit this clip.</InspectorNote>;
  const section = { project, onEdit, onDeselect };
  const motion = { runOp, store };
  switch (clip.kind) {
    case 'video':
    case 'overlay':
      return (
        <VisualClipInspector
          key={clip.id}
          {...section}
          {...motion}
          clip={clip}
          sourceDurationSec={sourceDurationSec}
        />
      );
    case 'audio':
      return <AudioClipInspector key={clip.id} {...section} clip={clip} store={store} />;
    case 'text':
      return <TextClipInspector key={clip.id} {...section} {...motion} clip={clip} />;
    case 'caption':
      return track.kind === 'caption' ? (
        <CaptionTrackInspector
          key={clip.id}
          {...section}
          track={track}
          clipId={clip.id}
          runOp={runOp}
        />
      ) : null;
    default:
      return <InspectorNote>This clip has no inspector yet.</InspectorNote>;
  }
}
