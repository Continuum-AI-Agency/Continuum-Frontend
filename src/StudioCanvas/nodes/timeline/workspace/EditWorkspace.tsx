'use client';

import {
  type EditorClip,
  type EditorProjectV2,
  type EditorTrack,
  editorRenderBlockers,
  PLATFORM_EXPORT_PRESETS,
  type PlatformExportPresetId,
  TEXT_TEMPLATES,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import {
  ArrowLeft,
  AudioLines,
  Captions,
  ChevronDown,
  Clapperboard,
  Command as CommandIcon,
  Download,
  Music,
  Redo2,
  Sparkles,
  Undo2,
  Waves,
} from 'lucide-react';
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/ToastProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EditorAgentPanel } from '@/components/video-studio/agent/EditorAgentPanel';
import { BriefDialog, type BriefSeed } from '@/components/video-studio/brief/BriefDialog';
import {
  briefOffered,
  placesAsset,
  placesFirstFootage,
  rememberBriefOffered,
} from '@/components/video-studio/brief/briefGoals';
import { VariantSwitcher } from '@/components/video-studio/brief/VariantSwitcher';
import { ExportDialog } from '@/components/video-studio/export/ExportDialog';
import {
  motionClipActions,
  motionPaletteGroups,
} from '@/components/video-studio/motion/motionActions';
import {
  type TemplatePlacement,
  TextTemplateShelf,
} from '@/components/video-studio/motion/TextTemplateShelf';
import {
  TRANSITION_LABELS,
  type TransitionInput,
} from '@/components/video-studio/motion/TransitionSeam';
import { GraphPoolPanel } from '@/components/video-studio/sources/GraphPoolPanel';
import { QuickStartPanel } from '@/components/video-studio/sources/QuickStartPanel';
import {
  VIDEO_STUDIO_ASSET_DRAG_TYPE,
  type VideoStudioContext,
} from '@/components/video-studio/types';
import { runVideoEditorOp } from '@/lib/api/videoEditorOps.client';
import { cn } from '@/lib/utils';
import type { TimelineInputSource } from '../../../types';
import { orderedVideoClips } from '../editorProjectV2AssemblyModel';
import { probeAudioDuration, probeVideoDuration } from '../mediaProbe';
import { useExactPreviewUrls } from '../useClipPreviewUrls';
import {
  TIMELINE_SHORTCUT_KEYS,
  type TimelineShortcut,
  useTimelineKeymap,
} from '../useTimelineKeymap';
import { CommandPalette, type PaletteAction } from './CommandPalette';
import { EditStage } from './EditStage';
import { EditTimeline, type TimelineDrop } from './EditTimeline';
import { importMediaFile } from './importMedia';
import { type ImportInFlight, MediaPanel, projectSources } from './MediaPanel';
import { createPlayheadStore, useSettledPlayhead } from './playheadStore';
import {
  addMarkerEdit,
  addTrackDraft,
  addTrackEdit,
  type ClipRef,
  deleteClipsEdit,
  duplicateClipsEdit,
  findClip,
  type LaneKind,
  laneKindForAsset,
  mainVideoTrack,
  pasteClipsEdit,
  placeAssetEdit,
  removeTrackEdit,
  replaceClipEdit,
  splitEdit,
  trackStateEdit,
  trimToPlayheadEdit,
} from './timelineEdits';
import type { EditorProjectController } from './useEditorProject';
import { WorkspaceInspector } from './WorkspaceInspector';

// Stable: the preview-URL hook re-runs whenever its pool changes identity.
const NO_POOL: TimelineInputSource[] = [];

// The heavy docks re-render only when their own inputs change, never on a playhead move.
const Inspector = memo(WorkspaceInspector);
const Media = memo(MediaPanel);
const Palette = memo(CommandPalette);
const AgentPanel = memo(EditorAgentPanel);
const GraphPanel = memo(GraphPoolPanel);
const GeneratePanel = memo(QuickStartPanel);
const TextShelf = memo(TextTemplateShelf);

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'The request failed.';

const acceptsDrag = (event: React.DragEvent) =>
  event.dataTransfer.types.includes('Files') ||
  event.dataTransfer.types.includes(VIDEO_STUDIO_ASSET_DRAG_TYPE);

/** ⌘C copies clips only when clips are selected and no text is — text copy stays native. */
const hasTextSelection = () => (window.getSelection()?.toString() ?? '').length > 0;

/** Any open dialog — ⌘K, Export, a Library picker — outranks the Brief offering itself. */
const aDialogIsOpen = () =>
  document.querySelector(
    '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"]',
  ) !== null;

/**
 * Edit mode: CapCut's layout over the durable project. Media | Graph | Generate on the
 * left, the stage in the middle, Inspector | Agent on the right, the timeline below.
 * Every change is a committed revision — this page's edits, the quick ops, the agent and
 * MCP all land on the same history, and the realtime subscription keeps it live.
 *
 * The playhead lives in a store, not in this component's state: only the stage, the
 * playhead line and the clock follow it every frame. Actions read it when they run.
 */
export function EditWorkspace({
  controller,
  brandId,
  origin,
  productionAvailable,
  onOpenProduction,
}: {
  controller: EditorProjectController & {
    project: NonNullable<EditorProjectController['project']>;
  };
  brandId: string;
  origin: 'canvas' | 'library';
  productionAvailable: boolean;
  onOpenProduction: () => void;
}) {
  const { project, apply, runOp, undo, redo, canUndo, canRedo, busy, refresh } = controller;
  const { show } = useToast();
  const [store] = useState(createPlayheadStore);
  const settledSec = useSettledPlayhead(store);
  const [selection, setSelection] = useState<string[]>([]);
  const [leftTab, setLeftTab] = useState('media');
  const [rightTab, setRightTab] = useState('inspector');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefSeed, setBriefSeed] = useState<BriefSeed | null>(null);
  const [variantsRead, setVariantsRead] = useState(0);
  const [draftRunning, setDraftRunning] = useState(false);
  const [importing, setImporting] = useState<ImportInFlight[]>([]);
  const [imported, setImported] = useState<VideoEditorPoolAsset[]>([]);
  const [sourceDurations, setSourceDurations] = useState<ReadonlyMap<string, number>>(new Map());
  const clipboard = useRef<ClipRef[]>([]);
  // Stable callbacks read the latest selection and project through these.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const projectRef = useRef<EditorProjectV2>(project);
  projectRef.current = project;

  const urls = useExactPreviewUrls(project, brandId, NO_POOL);

  // A clip that vanished (split, ripple, an agent edit) drops out of the selection.
  useEffect(() => {
    setSelection((current) => {
      const kept = current.filter((id) => findClip(project, id));
      return kept.length === current.length ? current : kept;
    });
  }, [project]);

  const openBrief = useCallback((seed: BriefSeed | null = null) => {
    setBriefSeed(seed);
    setBriefOpen(true);
  }, []);
  // The first footage THIS page places (drop, recording, Library import) offers the Brief,
  // once per project, as soon as the placed clip is on screen — but never over another
  // dialog or a running agent turn. Clips that arrive over realtime never set `offerFor`.
  const offerFor = useRef<string | null>(null);
  const agentRunning = useRef(false);
  const onAgentRunning = useCallback((running: boolean) => {
    agentRunning.current = running;
  }, []);
  useEffect(() => {
    const assetId = offerFor.current;
    if (!assetId || !placesAsset(project, assetId)) return;
    offerFor.current = null;
    if (project.brief || briefOffered(project.projectId)) return;
    if (agentRunning.current || aDialogIsOpen()) return;
    rememberBriefOffered(project.projectId);
    openBrief();
  }, [openBrief, project]);

  // Source lengths bound trim handles; probe each asset once off its preview URL.
  useEffect(() => {
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (!('source' in clip) || clip.source.sourceType !== 'library_asset') continue;
        if (clip.kind === 'overlay' && clip.mediaKind === 'image') continue;
        const assetId = clip.source.assetId;
        const url = urls.get(clip.id);
        if (!url || sourceDurations.has(assetId)) continue;
        const known = imported.find((asset) => asset.assetId === assetId)?.durationSec;
        const probe = known
          ? Promise.resolve(known)
          : (clip.kind === 'audio' ? probeAudioDuration(url) : probeVideoDuration(url)).catch(
              () => 0,
            );
        void probe.then((seconds) => {
          if (seconds > 0) setSourceDurations((current) => new Map(current).set(assetId, seconds));
        });
        setSourceDurations((current) =>
          current.has(assetId) ? current : new Map(current).set(assetId, 0),
        );
      }
    }
  }, [imported, project, sourceDurations, urls]);
  const sourceDurationFor = useCallback(
    (clipId: string) => {
      const clip = findClip(projectRef.current, clipId)?.clip;
      if (!clip || !('source' in clip) || clip.source.sourceType !== 'library_asset') {
        return undefined;
      }
      return sourceDurations.get(clip.source.assetId) || undefined;
    },
    [sourceDurations],
  );
  const previewUrlFor = useCallback((clipId: string) => urls.get(clipId), [urls]);

  // A file that had to upload first is placed here, on the project as it stands then.
  const placeImported = useCallback(
    (asset: VideoEditorPoolAsset, at?: { atSec?: number; trackId?: string; newTrack?: boolean }) =>
      apply((current) => {
        if (placesFirstFootage(current, asset)) offerFor.current = asset.assetId;
        const atSec = at?.atSec ?? store.getSec();
        if (!at?.newTrack) return placeAssetEdit(current, asset, { atSec, trackId: at?.trackId });
        const add = addTrackDraft(current, laneKindForAsset(asset));
        if (add.commandType !== 'add_track') return null;
        const placed = placeAssetEdit(
          { ...current, tracks: [...current.tracks, add.track] },
          asset,
          { atSec, trackId: add.track.id },
        );
        return { label: placed.label, forward: [add, ...placed.forward] };
      }),
    [apply, store],
  );

  // An asset already in the Library (the Media tab, the Graph pool, a drag) is placed by
  // the same `add_clip` op the agent and MCP use. One at a time: a multi-pick lands in order.
  const placements = useRef<Promise<void>>(Promise.resolve());
  const addAsset = useCallback(
    (
      asset: VideoEditorPoolAsset,
      at?: { atSec?: number; trackId?: string; newTrack?: boolean },
    ) => {
      const place = async () => {
        const current = projectRef.current;
        const lane = current.tracks.find((track) => track.id === at?.trackId);
        if (placesFirstFootage(current, asset)) offerFor.current = asset.assetId;
        try {
          const output = await runOp('add_clip', {
            assetId: asset.assetId,
            atSec: Math.max(0, at?.atSec ?? store.getSec()),
            ...(lane && lane.kind === laneKindForAsset(asset) ? { trackId: lane.id } : {}),
            ...(at?.newTrack ? { newTrack: true } : {}),
          });
          setSelection([output.clipId]);
        } catch (error) {
          if (offerFor.current === asset.assetId) offerFor.current = null;
          show({
            title: `Could not add ${asset.title}`,
            description: errorText(error),
            variant: 'error',
          });
        }
      };
      const next = placements.current.then(place);
      placements.current = next;
      return next;
    },
    [runOp, show, store],
  );

  const importFiles = useCallback(
    (files: readonly File[], at?: { atSec: number; trackId?: string }) => {
      let offset = 0;
      for (const file of files) {
        const id = crypto.randomUUID();
        setImporting((current) => [...current, { id, name: file.name }]);
        const placeAt = at ? { ...at, atSec: at.atSec + offset } : undefined;
        offset += 0.001;
        void importMediaFile(brandId, file)
          .then(async (asset) => {
            setImported((current) => [...current, asset]);
            await placeImported(asset, placeAt);
          })
          .catch((error) =>
            show({
              title: `Could not import ${file.name}`,
              description: errorText(error),
              variant: 'error',
            }),
          )
          .finally(() => setImporting((current) => current.filter((item) => item.id !== id)));
      }
    },
    [placeImported, brandId, show],
  );

  /** Motion ops report only failure; success is on the stage and the timeline already. */
  const runQuiet = useCallback(
    async <T,>(label: string, run: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await run();
      } catch (error) {
        show({ title: `${label} failed`, description: errorText(error), variant: 'error' });
        return undefined;
      }
    },
    [show],
  );

  const placeTemplate = useCallback(
    async (placement: TemplatePlacement, atSec?: number) => {
      const template = TEXT_TEMPLATES[placement.template];
      const output = await runQuiet(`Add ${template.label}`, () =>
        runOp('add_text', {
          template: placement.template,
          text: placement.text,
          ...(placement.secondaryText ? { secondaryText: placement.secondaryText } : {}),
          startSec: Math.max(0, atSec ?? store.getSec()),
          durationSec: template.defaultDurationSec,
        }),
      );
      if (!output) return;
      setSelection([output.clipId]);
      setRightTab('inspector');
    },
    [runOp, runQuiet, store],
  );
  const onPlaceTemplate = useCallback(
    (placement: TemplatePlacement) => void placeTemplate(placement),
    [placeTemplate],
  );

  const onDrop = useCallback(
    (drop: TimelineDrop, at: { atSec: number; trackId?: string }) => {
      if (drop.kind === 'asset') void addAsset(drop.asset, at);
      else if (drop.kind === 'template') void placeTemplate(drop.placement, at.atSec);
      else importFiles(drop.files, at);
    },
    [addAsset, importFiles, placeTemplate],
  );

  const addTransition = useCallback(
    (input: TransitionInput) =>
      void runQuiet(TRANSITION_LABELS[input.type], () => runOp('add_transition', input)),
    [runOp, runQuiet],
  );

  const quickOp = useCallback(
    async (label: string, run: () => Promise<unknown>) => {
      try {
        const output = (await run()) as { commit?: { summary?: string } } | undefined;
        show({ title: label, description: output?.commit?.summary ?? 'Done.' });
      } catch (error) {
        show({ title: `${label} failed`, description: errorText(error), variant: 'error' });
      }
    },
    [show],
  );
  const detectBeats = useCallback(
    (clipId?: string) =>
      quickOp('Detect beats', () =>
        runOp('get_beats', {
          ...(clipId ? { clipId } : {}),
          force: projectRef.current.markers.some((marker) => marker.kind === 'beat'),
        }),
      ),
    [quickOp, runOp],
  );
  const cutPauses = useCallback(
    (clipId?: string) =>
      quickOp('Cut pauses', () => runOp('cut_silence', clipId ? { clipId } : {})),
    [quickOp, runOp],
  );
  const autoCaptions = useCallback(
    () => quickOp('Auto-captions', () => runOp('set_captions', {})),
    [quickOp, runOp],
  );
  const cutOnBeat = useCallback(() => {
    const primary = projectRef.current.tracks
      .filter((track) => track.kind === 'video' && track.enabled)
      .sort((a, b) => a.order - b.order)[0];
    const selected = primary?.clips.filter((clip) => selectionRef.current.includes(clip.id)) ?? [];
    const sources = selected.length ? selected : (primary?.clips ?? []);
    return quickOp('Quick cuts', () =>
      runOp('beat_cut', {
        mode: sources.length === 1 ? 'jump_cuts' : 'switch_shots',
        everyNBeats: 0.5,
        clipIds: sources.map((clip) => clip.id),
      }),
    );
  }, [quickOp, runOp]);
  const setFormat = useCallback(
    (preset: PlatformExportPresetId) =>
      quickOp(`Format: ${PLATFORM_EXPORT_PRESETS[preset].label}`, () =>
        runOp('set_format', { preset }),
      ),
    [quickOp, runOp],
  );

  const deleteClips = useCallback(
    (ids: readonly string[], ripple: boolean) => {
      setSelection([]);
      void apply((current) => deleteClipsEdit(current, ids, ripple));
    },
    [apply],
  );

  // Every action reads the playhead and selection when it runs, so none of these closures
  // goes stale and none needs rebuilding while playback moves.
  const shortcuts = useMemo(
    (): Partial<Record<TimelineShortcut, () => boolean | undefined | void>> => ({
      togglePlay: () => store.toggle(),
      shuttleBack: () => {
        store.pause();
        store.seek(Math.max(0, store.getSec() - 1));
      },
      pause: () => store.pause(),
      shuttleForward: () => store.play(),
      split: () =>
        void apply((current) => splitEdit(current, selectionRef.current, store.getSec())),
      trimStartToPlayhead: () =>
        void apply((current) =>
          trimToPlayheadEdit(current, selectionRef.current, 'start', store.getSec()),
        ),
      trimEndToPlayhead: () =>
        void apply((current) =>
          trimToPlayheadEdit(current, selectionRef.current, 'end', store.getSec()),
        ),
      rippleDelete: () => deleteClips(selectionRef.current, true),
      undo: () => void undo(),
      redo: () => void redo(),
      copy: () => {
        if (selectionRef.current.length === 0 || hasTextSelection()) return false;
        clipboard.current = selectionRef.current.flatMap(
          (id) => findClip(projectRef.current, id) ?? [],
        );
        return undefined;
      },
      paste: () =>
        void apply((current) => pasteClipsEdit(current, clipboard.current, store.getSec())),
      duplicate: () => void apply((current) => duplicateClipsEdit(current, selectionRef.current)),
      palette: () => setPaletteOpen(true),
      marker: () => void apply((current) => addMarkerEdit(current, store.getSec())),
      deselect: () => setSelection([]),
    }),
    [apply, deleteClips, redo, store, undo],
  );
  useTimelineKeymap({
    enabled: !paletteOpen && !exportOpen && !briefOpen,
    getPlayheadSec: store.getSec,
    totalSec: project.durationSec,
    onSeek: store.seek,
    handlers: shortcuts,
  });
  const onShortcut = useCallback(
    (shortcut: TimelineShortcut) => void shortcuts[shortcut]?.(),
    [shortcuts],
  );

  // A clip's menu acts on the selection when the clip is part of it, else on that clip.
  const clipActions = useMemo(() => {
    const targetsFor = (clipId: string) =>
      selectionRef.current.includes(clipId) ? selectionRef.current : [clipId];
    return {
      split: (clipId: string) =>
        void apply((current) => splitEdit(current, targetsFor(clipId), store.getSec())),
      rippleDelete: (clipId: string) => deleteClips(targetsFor(clipId), true),
      deleteLeaveGap: (clipId: string) => deleteClips(targetsFor(clipId), false),
      copy: (clipId: string) => {
        clipboard.current = targetsFor(clipId).flatMap(
          (id) => findClip(projectRef.current, id) ?? [],
        );
      },
      duplicate: (clipId: string) =>
        void apply((current) => duplicateClipsEdit(current, targetsFor(clipId))),
      toggleClipAudio: (clipId: string) =>
        void apply((current) => {
          const clip = findClip(current, clipId)?.clip;
          return clip?.kind === 'video'
            ? replaceClipEdit(
                current,
                { ...clip, audioEnabled: !clip.audioEnabled },
                'Toggle clip audio',
              )
            : null;
        }),
      cutPauses: (clipId: string) => void cutPauses(clipId),
      detectBeats: (clipId: string) => void detectBeats(clipId),
      ...motionClipActions({
        targetsFor,
        clipOf: (id) => findClip(projectRef.current, id)?.clip,
        getPlayheadSec: store.getSec,
        runOp,
        runQuiet,
      }),
    };
  }, [apply, cutPauses, deleteClips, detectBeats, runOp, runQuiet, store]);

  const onAddTrack = useCallback(
    (kind: LaneKind) => void apply((current) => addTrackEdit(current, kind)),
    [apply],
  );
  const onTrackState = useCallback(
    (track: EditorTrack, state: { muted?: boolean; locked?: boolean; enabled?: boolean }) =>
      void apply((current) => trackStateEdit(current, track.id, state)),
    [apply],
  );
  const onRemoveTrack = useCallback(
    (track: EditorTrack) => void apply(removeTrackEdit(track)),
    [apply],
  );
  const onDetectBeats = useCallback(() => void detectBeats(), [detectBeats]);
  const onAddMarker = useCallback(() => void shortcuts.marker?.(), [shortcuts]);
  const onDeselect = useCallback(() => setSelection([]), []);
  const onEdit = apply;

  const refreshProject = useCallback(async () => {
    await refresh();
  }, [refresh]);
  const addAssetToTimeline = useCallback(
    (asset: VideoEditorPoolAsset, atSec?: number) =>
      addAsset(asset, atSec === undefined ? undefined : { atSec }),
    [addAsset],
  );
  const studio = useMemo(
    (): VideoStudioContext => ({
      projectId: project.projectId,
      brandId,
      project,
      selection: { clipIds: selection },
      playheadSec: settledSec,
      runOp,
      refresh: refreshProject,
      seek: store.seek,
      addAssetToTimeline,
    }),
    [addAssetToTimeline, brandId, project, refreshProject, runOp, selection, settledSec, store],
  );

  const blockers = editorRenderBlockers(project);
  const presetId = project.exportSettings.presetId as PlatformExportPresetId | undefined;
  const formatLabel =
    presetId && presetId in PLATFORM_EXPORT_PRESETS
      ? PLATFORM_EXPORT_PRESETS[presetId].label
      : `${project.canvas.width}×${project.canvas.height}`;
  const sources = useMemo(() => projectSources(project, imported), [imported, project]);
  const previewForAsset = useCallback(
    (asset: VideoEditorPoolAsset) => {
      const clip = projectRef.current.tracks
        .flatMap((track): EditorClip[] => track.clips)
        .find(
          (candidate) =>
            'source' in candidate &&
            candidate.source.sourceType === 'library_asset' &&
            candidate.source.assetId === asset.assetId,
        );
      return clip ? urls.get(clip.id) : undefined;
    },
    [urls],
  );
  const onDrafted = useCallback(() => setVariantsRead((count) => count + 1), []);
  // A variant opened a moment ago may not have read its siblings yet, and its switcher then
  // counts only itself: redrafting "all" would quietly redraft one. Count them here.
  const redraft = useCallback(
    (variants: number) => {
      const { brief, projectId } = projectRef.current;
      if (!brief) return;
      void runVideoEditorOp(projectId, 'list_variants', {})
        .then((listed) => listed.variants.length)
        .catch(() => 0)
        .then((siblings) =>
          // Synchronous, like the click it answers: the dialog seeds itself as it opens.
          flushSync(() => openBrief({ ...brief, variants: Math.max(variants, siblings) })),
        );
    },
    [openBrief],
  );
  const onImportFiles = useCallback((files: File[]) => importFiles(files), [importFiles]);
  const onAddAsset = useCallback(
    (asset: VideoEditorPoolAsset, options?: { newTrack?: boolean }) =>
      void addAsset(asset, options),
    [addAsset],
  );

  const canExport = blockers.length === 0;
  const hasSelection = selection.length > 0;
  const selectedId = selection.length === 1 ? selection[0] : undefined;
  const selectedClip = selectedId ? findClip(project, selectedId)?.clip : undefined;
  const transitionsFromSelected = orderedVideoClips(mainVideoTrack(project))
    .slice(0, -1)
    .some((clip) => clip.id === selectedId);
  const paletteGroups = useMemo((): Array<{ heading: string; actions: PaletteAction[] }> => {
    const key = TIMELINE_SHORTCUT_KEYS;
    const run = (shortcut: TimelineShortcut) => () => void shortcuts[shortcut]?.();
    return [
      {
        heading: 'Timeline',
        actions: [
          { id: 'play', label: 'Play / pause', shortcut: key.togglePlay, run: run('togglePlay') },
          { id: 'split', label: 'Split at playhead', shortcut: key.split, run: run('split') },
          {
            id: 'trim-start',
            label: 'Trim start to playhead',
            shortcut: key.trimStartToPlayhead,
            run: run('trimStartToPlayhead'),
          },
          {
            id: 'trim-end',
            label: 'Trim end to playhead',
            shortcut: key.trimEndToPlayhead,
            run: run('trimEndToPlayhead'),
          },
          {
            id: 'ripple',
            label: 'Ripple delete selection',
            shortcut: key.rippleDelete,
            disabled: !hasSelection,
            run: run('rippleDelete'),
          },
          {
            id: 'copy',
            label: 'Copy selection',
            shortcut: key.copy,
            disabled: !hasSelection,
            run: run('copy'),
          },
          { id: 'paste', label: 'Paste at playhead', shortcut: key.paste, run: run('paste') },
          {
            id: 'duplicate',
            label: 'Duplicate selection',
            shortcut: key.duplicate,
            disabled: !hasSelection,
            run: run('duplicate'),
          },
          {
            id: 'marker',
            label: 'Add marker at playhead',
            shortcut: key.marker,
            run: run('marker'),
          },
          { id: 'undo', label: 'Undo', shortcut: key.undo, disabled: !canUndo, run: run('undo') },
          { id: 'redo', label: 'Redo', shortcut: key.redo, disabled: !canRedo, run: run('redo') },
          ...(['video', 'overlay', 'text', 'caption', 'audio'] as const).map((kind) => ({
            id: `track-${kind}`,
            label: `Add ${kind === 'caption' ? 'captions' : kind} track`,
            run: () => onAddTrack(kind),
          })),
        ],
      },
      {
        heading: 'Quick edits',
        actions: [
          { id: 'cut-pauses', label: 'Cut pauses', run: () => void cutPauses() },
          { id: 'captions', label: 'Auto-captions', run: () => void autoCaptions() },
          { id: 'beat-cut', label: 'Quick cuts on the beat', run: () => void cutOnBeat() },
          { id: 'beats', label: 'Detect beats', run: () => void detectBeats() },
        ],
      },
      ...motionPaletteGroups({
        selectedClip,
        transitionsToNext: transitionsFromSelected,
        actions: clipActions,
        placeTemplate: onPlaceTemplate,
        openTextTab: () => setLeftTab('text'),
      }),
      {
        heading: 'Format',
        actions: Object.values(PLATFORM_EXPORT_PRESETS).map((preset) => ({
          id: `format-${preset.id}`,
          label: `Format for ${preset.label} (${preset.width}×${preset.height})`,
          run: () => void setFormat(preset.id),
        })),
      },
      {
        heading: 'Project',
        actions: [
          { id: 'first-cut', label: 'First cut from a brief…', run: () => openBrief() },
          { id: 'export', label: 'Export…', disabled: !canExport, run: () => setExportOpen(true) },
          { id: 'agent', label: 'Ask the agent', run: () => setRightTab('agent') },
          { id: 'generate', label: 'Generate media', run: () => setLeftTab('generate') },
          ...(productionAvailable
            ? [{ id: 'production', label: 'Open Production mode', run: onOpenProduction }]
            : []),
        ],
      },
    ];
  }, [
    autoCaptions,
    canExport,
    canRedo,
    canUndo,
    clipActions,
    cutOnBeat,
    cutPauses,
    detectBeats,
    hasSelection,
    onAddTrack,
    onOpenProduction,
    onPlaceTemplate,
    openBrief,
    productionAvailable,
    selectedClip,
    setFormat,
    shortcuts,
    transitionsFromSelected,
  ]);

  const toolbarExtra = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => void cutPauses()}
        >
          <AudioLines className="size-3.5" /> Cut pauses
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => void autoCaptions()}
        >
          <Captions className="size-3.5" /> Auto-captions
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => void cutOnBeat()}
        >
          <Music className="size-3.5" /> Quick cuts
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" />}
          >
            <Clapperboard className="size-3.5" /> Collage <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {(['stack', 'side_by_side', 'grid'] as const).map((layout) => (
              <DropdownMenuItem
                key={layout}
                onSelect={() => {
                  const ids = selectionRef.current;
                  void quickOp('Collage', () =>
                    runOp('collage', { clipIds: ids, layout, atSec: store.getSec() }),
                  );
                }}
              >
                {layout === 'stack'
                  ? 'Film strips'
                  : layout === 'side_by_side'
                    ? 'Side by side'
                    : 'Four-panel grid'}
              </DropdownMenuItem>
            ))}
            <div className="px-2 py-1 text-xs text-muted-foreground">
              Select 2–4 picture clips first.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => void detectBeats()}
        >
          <Waves className="size-3.5" /> Beats
        </Button>
      </div>
    ),
    [autoCaptions, cutOnBeat, cutPauses, detectBeats, quickOp, runOp, store],
  );

  const key = TIMELINE_SHORTCUT_KEYS;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop anywhere to import; the Media tab's Import button is the keyboard path.
    <div
      className="flex h-[var(--app-content-h)] min-h-[600px] w-full flex-col overflow-hidden bg-background"
      data-testid="video-studio-edit"
      onDragOver={(event) => {
        if (!acceptsDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!acceptsDrag(event)) return;
        event.preventDefault();
        const payload = event.dataTransfer.getData(VIDEO_STUDIO_ASSET_DRAG_TYPE);
        if (payload) return;
        importFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <Link
          href={origin === 'library' ? '/library' : '/ai-studio'}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-8')}
          aria-label={`Back to ${origin === 'library' ? 'Library' : 'Canvas'}`}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">{project.title}</h1>
          <p className="text-2xs text-muted-foreground" data-testid="project-revision">
            Revision {project.revision}
            {busy ? ` · ${busy.replaceAll('_', ' ')}…` : ''}
          </p>
        </div>
        <div className="ml-2 flex items-center">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={() => void undo()}
                />
              }
            >
              <Undo2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>
              Undo <span className="ml-1 text-muted-foreground">{key.undo}</span>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={() => void redo()}
                />
              }
            >
              <Redo2 className="size-4" />
            </TooltipTrigger>
            <TooltipContent>
              Redo <span className="ml-1 text-muted-foreground">{key.redo}</span>
            </TooltipContent>
          </Tooltip>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-xs"
                aria-label="Format"
              />
            }
          >
            {formatLabel} <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.values(PLATFORM_EXPORT_PRESETS).map((preset) => (
              <DropdownMenuItem key={preset.id} onClick={() => void setFormat(preset.id)}>
                {preset.label}
                <span className="ml-auto pl-3 text-2xs text-muted-foreground">
                  {preset.width}×{preset.height}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <VariantSwitcher
          studio={studio}
          origin={origin}
          reloadKey={variantsRead}
          onRedraft={redraft}
        />
        <div className="ml-auto flex items-center gap-2">
          {draftRunning ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs"
              data-testid="draft-running"
              onClick={() => setBriefOpen(true)}
            >
              <Spinner className="size-3.5" /> Drafting…
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            onClick={() => openBrief()}
          >
            <Sparkles className="size-3.5" /> First cut
          </Button>
          {productionAvailable ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              onClick={onOpenProduction}
            >
              <Clapperboard className="size-3.5" /> Production
            </Button>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-xs"
                  aria-label="Command palette"
                  onClick={() => setPaletteOpen(true)}
                />
              }
            >
              <CommandIcon className="size-3.5" /> K
            </TooltipTrigger>
            <TooltipContent>
              Every action <span className="ml-1 text-muted-foreground">{key.palette}</span>
            </TooltipContent>
          </Tooltip>
          {blockers.length > 0 ? (
            <span
              className="max-w-56 truncate text-2xs text-muted-foreground"
              data-testid="render-blocker"
              title={blockers.join(' ')}
            >
              {blockers[0]}
            </span>
          ) : null}
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!canExport}
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-3.5" /> Export
          </Button>
        </div>
      </header>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel id="studio-top" defaultSize="62%" minSize="30%">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel id="studio-left" defaultSize="22%" minSize="14%" className="min-w-0">
              <Tabs
                value={leftTab}
                onValueChange={(value) => setLeftTab(String(value))}
                className="flex h-full min-h-0 flex-col"
              >
                <TabsList className="mx-2 mt-2 shrink-0">
                  <TabsTrigger value="media">Media</TabsTrigger>
                  <TabsTrigger value="text">Text</TabsTrigger>
                  <TabsTrigger value="graph">Graph</TabsTrigger>
                  <TabsTrigger value="generate">Generate</TabsTrigger>
                </TabsList>
                {/* Kept mounted: a recording in progress lives here and survives a tab switch. */}
                <TabsContent value="media" keepMounted className="min-h-0 flex-1">
                  <Media
                    brandId={brandId}
                    assets={sources}
                    previewUrlFor={previewForAsset}
                    importing={importing}
                    onImportFiles={onImportFiles}
                    onAddAsset={onAddAsset}
                  />
                </TabsContent>
                <TabsContent value="text" className="min-h-0 flex-1">
                  <TextShelf
                    aspect={project.canvas.width / project.canvas.height}
                    onPlace={onPlaceTemplate}
                  />
                </TabsContent>
                <TabsContent value="graph" className="min-h-0 flex-1 overflow-y-auto">
                  <GraphPanel studio={studio} />
                </TabsContent>
                <TabsContent value="generate" className="min-h-0 flex-1 overflow-y-auto">
                  <GeneratePanel studio={studio} />
                </TabsContent>
              </Tabs>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="studio-stage" defaultSize="52%" minSize="30%" className="min-w-0">
              <EditStage
                project={project}
                urls={urls}
                store={store}
                selectedClipId={selectedId}
                onEdit={onEdit}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="studio-right" defaultSize="26%" minSize="16%" className="min-w-0">
              <Tabs
                value={rightTab}
                onValueChange={(value) => setRightTab(String(value))}
                className="flex h-full min-h-0 flex-col"
              >
                <TabsList className="mx-2 mt-2 shrink-0">
                  <TabsTrigger value="inspector">Inspector</TabsTrigger>
                  <TabsTrigger value="agent">Agent</TabsTrigger>
                </TabsList>
                <TabsContent value="inspector" className="min-h-0 flex-1 p-2">
                  <Inspector
                    project={project}
                    clipId={selectedId}
                    previewUrl={selectedId ? urls.get(selectedId) : undefined}
                    sourceDurationSec={selectedId ? sourceDurationFor(selectedId) : undefined}
                    onEdit={onEdit}
                    runOp={runOp}
                    store={store}
                    onDeselect={onDeselect}
                  />
                </TabsContent>
                <TabsContent value="agent" className="min-h-0 flex-1">
                  <AgentPanel studio={studio} onRunningChange={onAgentRunning} />
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="studio-timeline" defaultSize="38%" minSize="20%">
          <EditTimeline
            project={project}
            store={store}
            selection={selection}
            onSelectionChange={setSelection}
            previewUrlFor={previewUrlFor}
            sourceDurationFor={sourceDurationFor}
            onEdit={onEdit}
            onDrop={onDrop}
            clipActions={clipActions}
            onShortcut={onShortcut}
            onAddTrack={onAddTrack}
            onTrackState={onTrackState}
            onRemoveTrack={onRemoveTrack}
            onDetectBeats={onDetectBeats}
            onAddMarker={onAddMarker}
            onTransition={addTransition}
            toolbarExtra={toolbarExtra}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <ExportDialog studio={studio} open={exportOpen} onOpenChange={setExportOpen} />
      <BriefDialog
        studio={studio}
        open={briefOpen}
        onOpenChange={setBriefOpen}
        sources={sources}
        seed={briefSeed}
        origin={origin}
        onDrafted={onDrafted}
        onRunningChange={setDraftRunning}
      />
      <Palette open={paletteOpen} onOpenChange={setPaletteOpen} groups={paletteGroups} />
    </div>
  );
}
