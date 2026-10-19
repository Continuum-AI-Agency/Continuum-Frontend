'use client';

// The Layers tab editor: a template's layer stack, a live layout preview and the selected layer's
// inspector, in one bounded workspace whose panes scroll on their own. Edits autosave to a private
// draft, and a version save never rewrites the golden source: on the original upload it forks a new
// variant; on a variant it writes that variant's next revision (or forks another, if asked).
//
// Loading is staged so nothing waits on what it does not need. The shell paints at once from the
// parse the page already holds; the layer list and the default comp's scene load in parallel,
// each stored per source version so only a first open reaches the forge; fields, fonts and the
// variants list load when they are opened or needed. An edit shows in the preview immediately
// (layerPreviewSvg.ts) and the forge's composed preview replaces that guess after a pause.

import type {
  MediaAsset,
  TemplateAuthoringArtifactCommit,
  TemplateAuthoringCommand,
  TemplateAuthoringDocument,
  TemplateEditableLayer,
  TemplateLayerEdit,
  TemplatePreview,
  TemplateRevision,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Circle,
  CircleHelp,
  Copy,
  GitFork,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { usePanelRef } from 'react-resizable-panels';
import { z } from 'zod';
import { AuthoredTemplateLayerPreview as TemplateLayerPreview } from '@/components/forge/AuthoredTemplateLayerPreview';
import { DesignLayersPanel } from '@/components/forge/DesignLayersPanel';
import {
  appendLayerDraftCommand,
  commandsFromLayerSnapshot,
  type LayerDraftChange,
  type LayerDraftState,
} from '@/components/forge/layerDraft';
import {
  createLayerHistory,
  endLayerHistoryGroup,
  isLayerHistoryDirty,
  type LayerDraftSnapshot,
  type LayerHistory,
  markLayerHistorySaved,
  redoLayerHistory,
  undoLayerHistory,
  updateLayerHistory,
} from '@/components/forge/layerHistory';
import type { PreviewEdits } from '@/components/forge/layerPreviewSvg';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import {
  TemplateAuthoringPreparationPanel,
  templatePreparationSummary,
} from '@/components/forge/TemplateAuthoringPreparationPanel';
import { TemplateColourFields } from '@/components/forge/TemplateColourFields';
import { TemplateLayerAuthoredMasks } from '@/components/forge/TemplateLayerAuthoredMasks';
import { TemplateLayerInspector } from '@/components/forge/TemplateLayerInspector';
import { type StackRow, TemplateLayerList } from '@/components/forge/TemplateLayerList';
import { TemplateLayerMaskCreator } from '@/components/forge/TemplateLayerMaskCreator';
import { TemplateLayerTimeline } from '@/components/forge/TemplateLayerTimeline';
import { TemplateWireframe } from '@/components/forge/TemplateWireframe';
import { templateAuthoringEqual } from '@/components/forge/templateAuthoringEquality';
import {
  sampleAuthoredRenderNodes,
  sampleMotionChannel,
} from '@/components/forge/templateAuthoringMotion';
import {
  canMutateTemplateAuthoringSourceGroup,
  canUngroupTemplateNode,
  projectTemplateAuthoringCommands,
  supportsAnimatedDirectChildUngroup,
  templateArtworkPreviewKey,
  templateAuthoringGroupHasMotion,
  templateAuthoringSourceGroupMemberIds,
} from '@/components/forge/templateAuthoringProjection';
import { compareTemplateDrafts } from '@/components/forge/templateDraftComparison';
import {
  readTemplateAuthoringViewState,
  saveTemplateAuthoringViewState,
  templateAuthoringViewStateKey,
} from '@/components/forge/templateDraftRecovery';
import {
  templateAuthoringWorkspaceIdentity,
  useTemplateAuthoringDraft,
} from '@/components/forge/useTemplateAuthoringDraft';
import { useTemplateAuthoringLifecycle } from '@/components/forge/useTemplateAuthoringLifecycle';
import { Pill } from '@/components/kibo-ui/pill';
import { LibraryMediaPickerDialog } from '@/components/library/editor/LibraryMediaPickerDialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NumberScrubField } from '@/components/ui/number-field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { stageHyperframesRevisionForForge } from '@/lib/api/hyperframesAgent.client';
import {
  editableTemplateFonts,
  fetchPinnedArtworkPreview,
  fetchTemplateAuthoringDraft,
  fetchTemplateAuthoringFontPreview,
  fetchTemplateAuthoringWorkspacePreview,
  fetchTemplateLayerInventory,
  fetchTemplateLayerScene,
  fetchTemplateRevisionVariants,
  fetchTemplateVariables,
  previewTemplateRevision,
  putTemplateAuthoringDraft,
} from '@/lib/library/templateSources';

type Edits = Record<string, TemplateLayerEdit>;
type TemplateLayerSaveTarget = TemplateAuthoringArtifactCommit['saveTo'];
type Changes = { edits: TemplateLayerEdit[]; orders: { compId: number; layerIds: number[] }[] };
type AuthoringComposition = TemplateAuthoringDocument['compositions'][number];
type AuthoringFontChoice = TemplateAuthoringDocument['fontChoices'][number];

const authoringFontChoiceKey = (font: AuthoringFontChoice) =>
  'fontId' in font
    ? font.fontId
    : `${font.kind}:${font.packageChecksum}:${font.postScriptName}:${font.sha256}`;
const authoringFontRef = (font: AuthoringFontChoice) =>
  'fontId' in font
    ? { fontId: font.fontId, postScriptName: font.postScriptName, sha256: font.sha256 }
    : {
        kind: font.kind,
        packageChecksum: font.packageChecksum,
        postScriptName: font.postScriptName,
        sha256: font.sha256,
      };
const authoringFontChoiceForRef = (
  fonts: readonly AuthoringFontChoice[],
  ref: NonNullable<TemplateAuthoringDocument['nodes'][number]['fontRef']>,
) =>
  fonts.find((font) =>
    'fontId' in ref
      ? 'fontId' in font &&
        font.fontId === ref.fontId &&
        font.postScriptName === ref.postScriptName &&
        font.sha256 === ref.sha256
      : !('fontId' in font) &&
        font.kind === ref.kind &&
        font.packageChecksum === ref.packageChecksum &&
        font.postScriptName === ref.postScriptName &&
        font.sha256 === ref.sha256,
  );

const authoringCompositionKey = (composition: AuthoringComposition) =>
  composition.artboardId ? `draft:${composition.artboardId}` : `aep:${composition.compId}`;
const authoringCompositionTarget = (composition: AuthoringComposition) =>
  composition.artboardId
    ? { artboardId: composition.artboardId }
    : composition.compId !== null
      ? { compId: composition.compId }
      : null;

const NO_CHANGES: Changes = { edits: [], orders: [] };
const NO_LAYERS: readonly TemplateEditableLayer[] = [];
// Static group structure and three-channel Position/Scale/Rotation motion have exact
// compiler receipts. Parent timing and opacity remain unsupported by AE semantics.
const generatedGroupStructureReadbackVerified = true;
const generatedGroupMotionReadbackVerified = true;
const EMPTY_DRAFT: LayerDraftSnapshot = {
  edits: {},
  orders: {},
  nodeOrders: {},
  exposures: {},
  operations: [],
};
/** A composed preview asks the forge to rewrite the file, so it waits for a pause. */
const PREVIEW_DELAY_MS = 800;
const EDIT_FIELDS = [
  'fontSize',
  'font',
  'visible',
  'text',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
  'opacity',
] as const;
const same = templateAuthoringEqual;
const artboardLockCopy = (reason: string | null | undefined) => {
  if (reason === null) return null;
  if (reason === 'authoring_artboard_preflight_pending' || reason == null)
    return 'Composition size editing is waiting for a verified source check.';
  return reason.startsWith('authoring_')
    ? 'Composition size editing is unavailable for this source.'
    : reason;
};
const hasChanges = (c: Changes) => c.edits.length > 0 || c.orders.length > 0;
const layerKey = (layer: Pick<TemplateEditableLayer, 'compId' | 'layerId'>) =>
  `${layer.compId}:${layer.layerId}`;
const byLayer = (list: TemplateLayerEdit[]): Record<number, TemplateLayerEdit> =>
  Object.fromEntries(list.map((e) => [e.layerId, e]));

function imageDimensions(url: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
    image.onerror = () => reject(new Error('The pinned image preview could not be loaded.'));
    image.src = url;
  });
}

/** A comp's stack, front first (index 0 is the top). */
export function stackOf(layers: readonly TemplateEditableLayer[], compId: number | null) {
  return layers
    .filter((l) => l.compId === compId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((l) => l.layerId);
}

/**
 * The pending edits after one change to `layer`. A value equal to the file's drops out, and a
 * layer with nothing left is no longer edited. Visibility on a layer whose Show field is shared
 * across formats moves every layer that field drives.
 */
export function applyLayerChange(
  edits: Edits,
  layers: readonly TemplateEditableLayer[],
  layer: TemplateEditableLayer,
  change: Partial<TemplateLayerEdit>,
): Edits {
  const result = { ...edits };
  const targets =
    change.visible !== undefined && layer.visibilitySlotKeys.length
      ? layers.filter((l) =>
          l.visibilitySlotKeys.some((key) => layer.visibilitySlotKeys.includes(key)),
        )
      : [layer];
  for (const target of targets) {
    const key = layerKey(target);
    const next: TemplateLayerEdit = {
      ...edits[key],
      compId: target.compId,
      layerId: target.layerId,
      ...(target.designLayerId != null
        ? { designLayerId: target.designLayerId, artboardId: target.artboardId }
        : {}),
      ...change,
    };
    for (const field of EDIT_FIELDS)
      if (next[field] !== undefined && same(next[field], target[field])) delete next[field];
    if (EDIT_FIELDS.some((field) => next[field] !== undefined)) result[key] = next;
    else delete result[key];
  }
  return result;
}

/** The revision that pins this exact file, alone or as one of several packages. */
const pins = (revision: TemplateRevision, assetId: string, versionId: string | null) =>
  (revision.sourceAssetId === assetId && revision.sourceVersionId === versionId) ||
  !!revision.sources?.some(
    (source) => source.assetId === assetId && source.versionId === versionId,
  );

const nameSchema = z.object({ name: z.string().trim().min(1, 'Name your variant').max(120) });
const Skeleton = ({ className }: { className: string }) => (
  <span aria-hidden className={`block animate-pulse rounded-md bg-muted/70 ${className}`} />
);

export function TemplateLayerEditor({
  brandId,
  assetId,
  versionId,
  name,
  parse,
  onSaved,
  onOpenVariant,
  onDraftChange,
  hyperframesRevisionId,
  onOpenFontRepair,
  initialComp,
  templateKey,
}: {
  brandId: string;
  assetId: string;
  versionId: string | null;
  name: string;
  /** The parse the page already holds: the shell paints from it before any layer data arrives. */
  parse?: TemplatePreview | null;
  onSaved: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void | Promise<void>;
  initialComp?: string;
  templateKey?: string | null;
  onDraftChange?: LayerDraftChange;
  /** Private composition revision carried in from AI Studio, awaiting a seed-aware editor route. */
  hyperframesRevisionId?: string;
  /** Move from an exact preparation font diagnostic to Forge's existing Fonts check. */
  onOpenFontRepair?: () => void;
}) {
  const [history, setHistory] = useState<LayerHistory>(() => createLayerHistory(EMPTY_DRAFT));
  const historyRef = useRef(history);
  historyRef.current = history;
  const { edits, orders, exposures } = history.present;
  const [pinnedVersionId, setPinnedVersionId] = useState<string | null>(null);
  const [sourceChanged, setSourceChanged] = useState(false);
  const effectiveVersionId = pinnedVersionId ?? versionId;
  const revisionCatalog = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId),
    enabled: active && !!effectiveVersionId,
  });
  const currentVariant = revisionCatalog.data?.find((item) =>
    item.revisions.some((revision) => pins(revision, assetId, effectiveVersionId)),
  );
  const currentRevision = currentVariant?.revisions.find((revision) =>
    pins(revision, assetId, effectiveVersionId),
  );
  const originalVariant = revisionCatalog.data?.find((item) => item.original);
  const originalRevision = originalVariant?.revisions.find(
    (revision) => revision.id === originalVariant.draftHeadRevisionId,
  );
  const variantChoices = (revisionCatalog.data ?? [])
    .filter((item) => !item.original)
    .flatMap((item) => {
      const revision = item.revisions.find((revision) => revision.id === item.draftHeadRevisionId);
      return revision ? [{ assetId: revision.sourceAssetId, name: item.name }] : [];
    });
  const [selected, setSelected] = useState<string | null>(null);
  const [groupSelectionIds, setGroupSelectionIds] = useState<string[]>([]);
  const [compId, setCompId] = useState<number | null>(null);
  const [draftArtboardId, setDraftArtboardId] = useState<string | null>(null);
  const [newArtboardName, setNewArtboardName] = useState('New composition');
  const [search, setSearch] = useState('');
  const [artboardWidth, setArtboardWidth] = useState('');
  const [artboardHeight, setArtboardHeight] = useState('');
  const [playheadSec, setPlayheadSec] = useState(0);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [preparationDetailsOpen, setPreparationDetailsOpen] = useState(false);
  const [creationToolsOpen, setCreationToolsOpen] = useState(false);
  const wideWorkspace = useMediaQuery('(min-width: 1024px)');
  const timelinePanel = usePanelRef();
  const previousTimelineSize = useRef<number | null>(null);
  const repairPanel = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [layerValidity, setLayerValidity] = useState<Record<string, string[]>>({});
  const [layerInputs, setLayerInputs] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedVariant, setSavedVariant] = useState<{
    assetId: string;
    name: string;
    artifactId: string;
    versionId: string;
    published: boolean;
  } | null>(null);
  const [newText, setNewText] = useState('');
  const [fontPreview, setFontPreview] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [fontChoiceId, setFontChoiceId] = useState('');
  const [seedImporting, setSeedImporting] = useState(false);
  const [seedImportError, setSeedImportError] = useState<string | null>(null);
  const [fontRetry, setFontRetry] = useState(0);
  const [artworkPickerOpen, setArtworkPickerOpen] = useState(false);
  const [repairFootageItemId, setRepairFootageItemId] = useState<number | null>(null);
  const [artworkRetryFootageItemId, setArtworkRetryFootageItemId] = useState<number | null>(null);
  const artworkRelinkAttemptRef = useRef(0);
  const [artworkPreviewUrls, setArtworkPreviewUrls] = useState<Record<string, string>>({});
  const [artworkMessage, setArtworkMessage] = useState<string | null>(null);
  const [artworkRetry, setArtworkRetry] = useState(0);
  const openArtworkCreation = () => {
    artworkRelinkAttemptRef.current += 1;
    setArtworkRetryFootageItemId(null);
    setRepairFootageItemId(null);
    setArtworkMessage(null);
    setArtworkPickerOpen(true);
  };
  const form = useForm<{ name: string }>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: `${name} variant` },
  });
  const sourceKey = `${brandId}:${assetId}:${versionId ?? ''}`;
  useEffect(() => {
    setLayerValidity({});
    setLayerInputs({});
  }, [sourceKey]);
  const relinkSourceKeyRef = useRef(sourceKey);
  relinkSourceKeyRef.current = sourceKey;
  const authoringScope = useMemo(
    () => (effectiveVersionId ? { brandId, assetId, baseVersionId: effectiveVersionId } : null),
    [brandId, assetId, effectiveVersionId],
  );
  const sourceKeyRef = useRef(sourceKey);
  const savedRevisionKeyRef = useRef<string | null>(null);
  const pushSnapshot = (snapshot: LayerDraftSnapshot, group: string | null = null) => {
    const wasDirty = isLayerHistoryDirty(historyRef.current);
    const next = updateLayerHistory(historyRef.current, snapshot, group);
    historyRef.current = next;
    setHistory(next);
    if (!wasDirty && isLayerHistoryDirty(next)) setPinnedVersionId(versionId);
    if (!isLayerHistoryDirty(next)) setPinnedVersionId(null);
  };
  const closeHistoryGroup = () => {
    const next = endLayerHistoryGroup(historyRef.current);
    historyRef.current = next;
    setHistory(next);
    setTimeout(() => void flushDraftRef.current(), 0);
  };
  const moveHistory = (move: (current: LayerHistory) => LayerHistory) => {
    const wasDirty = isLayerHistoryDirty(historyRef.current);
    const next = move(historyRef.current);
    historyRef.current = next;
    setHistory(next);
    setLayerInputs({});
    setLayerValidity({});
    if (!wasDirty && isLayerHistoryDirty(next)) setPinnedVersionId(versionId);
    if (!isLayerHistoryDirty(next)) setPinnedVersionId(null);
  };
  const discard = useCallback(() => {
    const next = createLayerHistory(EMPTY_DRAFT);
    historyRef.current = next;
    setHistory(next);
    setPinnedVersionId(null);
    setSourceChanged(false);
    setError(null);
    setLayerInputs({});
    setLayerValidity({});
    updateDraftRef.current([]);
    void flushDraftRef.current();
  }, []);
  const flushDraftRef = useRef<() => Promise<boolean>>(async () => false);
  const updateDraftRef = useRef<
    (commands: ReturnType<typeof commandsFromLayerSnapshot>, immediate?: boolean) => void
  >(() => {});
  const saveDraft = useCallback(() => flushDraftRef.current(), []);
  const dirty = isLayerHistoryDirty(history);
  useEffect(() => {
    if (sourceKeyRef.current === sourceKey) return;
    if (savedRevisionKeyRef.current === sourceKey) {
      savedRevisionKeyRef.current = null;
      if (isLayerHistoryDirty(historyRef.current)) {
        setSourceChanged(true);
        return;
      }
      sourceKeyRef.current = sourceKey;
      const next = createLayerHistory(EMPTY_DRAFT);
      historyRef.current = next;
      setHistory(next);
      setPinnedVersionId(null);
      setSourceChanged(false);
      return;
    }
    const sameAsset = sourceKeyRef.current.startsWith(`${brandId}:${assetId}:`);
    if (sameAsset && dirty) {
      setSourceChanged(true);
      return;
    }
    sourceKeyRef.current = sourceKey;
    setPinnedVersionId(null);
    setSourceChanged(false);
    form.reset({ name: `${name} variant` });
    discard();
  }, [sourceKey, brandId, assetId, dirty, name, form, discard]);

  const changes = useMemo<Changes>(
    () => ({
      edits: Object.values(edits),
      orders: Object.entries(orders).map(([id, layerIds]) => ({ compId: Number(id), layerIds })),
    }),
    [edits, orders],
  );
  const [settled, setSettled] = useState<Changes>(NO_CHANGES);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(changes), hasChanges(changes) ? PREVIEW_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [changes]);

  const ready = active && !!effectiveVersionId;
  const restoreDraft = useCallback(
    (snapshot: LayerDraftSnapshot) => {
      const restored: LayerHistory = {
        past: same(snapshot, EMPTY_DRAFT) ? [] : [structuredClone(EMPTY_DRAFT)],
        present: structuredClone(snapshot),
        future: [],
        baseline: structuredClone(EMPTY_DRAFT),
        group: null,
      };
      historyRef.current = restored;
      setHistory(restored);
      setPinnedVersionId(same(snapshot, EMPTY_DRAFT) ? null : versionId);
    },
    [versionId],
  );
  const authoringCommands = useMemo(
    () => commandsFromLayerSnapshot(history.present),
    [history.present],
  );
  const authoredMaskIdsByNode = useMemo(() => {
    const ids = new Map<string, Set<string>>();
    for (const command of authoringCommands) {
      if (command.type === 'mask.create') {
        const nodeIds = ids.get(command.nodeId) ?? new Set<string>();
        nodeIds.add(command.draftMaskId);
        ids.set(command.nodeId, nodeIds);
      } else if (command.type === 'mask.delete') {
        ids.get(command.nodeId)?.delete(command.draftMaskId);
      }
    }
    return ids;
  }, [authoringCommands]);
  const authoringDraft = useTemplateAuthoringDraft({
    scope: authoringScope,
    enabled: ready,
    commands: authoringCommands,
    onRestore: restoreDraft,
  });
  flushDraftRef.current = authoringDraft.save;
  updateDraftRef.current = authoringDraft.update;
  const workspaceSeed =
    authoringDraft.persistedDraft?.seed ?? authoringDraft.serverDraft?.seed ?? null;
  useEffect(() => {
    if (workspaceSeed) setSeedImportError(null);
  }, [workspaceSeed?.artifactId, workspaceSeed?.packageChecksum]);
  const currentWorkspaceIdentity =
    workspaceSeed && authoringDraft.persistedDraft
      ? templateAuthoringWorkspaceIdentity(
          {
            kind: 'hyperframes_seed',
            artifactId: workspaceSeed.artifactId,
            packageChecksum: workspaceSeed.packageChecksum,
            sourceRevisionId: workspaceSeed.sourceRevisionId,
            sourceHtmlSha256: workspaceSeed.sourceHtmlSha256,
            extractedSceneSha256: workspaceSeed.extractedSceneSha256,
          },
          authoringDraft.persistedDraft.sourceChecksum,
        )
      : authoringDraft.workspaceIdentity;
  const canQueryPinnedSourceViews =
    !workspaceSeed && currentWorkspaceIdentity?.startsWith('pinned_source:') === true;
  const hasUncompiledLifecycle = authoringCommands.length > 0;
  const baseInventory = useQuery({
    queryKey: ['forge-layer-inventory', brandId, assetId, effectiveVersionId],
    queryFn: () => fetchTemplateLayerInventory(brandId, assetId, effectiveVersionId as string),
    enabled: ready && authoringDraft.ready && canQueryPinnedSourceViews,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const baseScene = useQuery({
    queryKey: ['forge-layer-scene', brandId, assetId, effectiveVersionId, compId],
    queryFn: () => fetchTemplateLayerScene(brandId, assetId, effectiveVersionId as string, compId),
    enabled: ready && authoringDraft.ready && canQueryPinnedSourceViews,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const workspacePreview = useQuery({
    queryKey: [
      'forge-authoring-workspace-preview',
      authoringDraft.userId,
      brandId,
      assetId,
      effectiveVersionId,
      workspaceSeed?.artifactId,
      workspaceSeed?.packageChecksum,
      authoringDraft.persistedDraft?.revision,
      compId,
    ],
    queryFn: async () => {
      const revision = authoringDraft.persistedDraft?.revision;
      if (!revision) throw new Error('The private workspace draft is not saved yet.');
      return fetchTemplateAuthoringWorkspacePreview(
        assetId,
        { brandId, baseVersionId: effectiveVersionId as string },
        revision,
        compId ?? undefined,
      );
    },
    enabled:
      ready &&
      authoringDraft.ready &&
      !!workspaceSeed &&
      !!authoringDraft.userId &&
      !!authoringDraft.persistedDraft?.revision,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const inventoryData = workspaceSeed ? workspacePreview.data : baseInventory.data;
  useEffect(() => {
    if (!initialComp || !inventoryData) return;
    const requested = inventoryData.comps.find((comp) => comp.name === initialComp);
    if (requested) setCompId(requested.id);
  }, [initialComp, inventoryData?.comps]);
  const inventoryError = workspaceSeed ? workspacePreview.error : baseInventory.error;
  const inventoryIsError = workspaceSeed ? workspacePreview.isError : baseInventory.isError;
  const inventoryRefetch = workspaceSeed ? workspacePreview.refetch : baseInventory.refetch;
  const sceneData = workspaceSeed ? workspacePreview.data : baseScene.data;
  const sceneError = workspaceSeed ? workspacePreview.error : baseScene.error;
  const sceneIsError = workspaceSeed ? workspacePreview.isError : baseScene.isError;
  const sceneIsFetching = workspaceSeed ? workspacePreview.isFetching : baseScene.isFetching;
  const authoringDocument = useMemo(() => {
    const source = authoringDraft.sourceDocument;
    if (!source) return null;
    const projectedDraft = authoringDraft.serverDraft ?? authoringDraft.persistedDraft;
    return projectedDraft?.projectedDocument && same(projectedDraft.commands, authoringCommands)
      ? projectedDraft.projectedDocument
      : projectTemplateAuthoringCommands(source, authoringCommands);
  }, [
    authoringDraft.sourceDocument,
    authoringDraft.serverDraft,
    authoringDraft.persistedDraft,
    authoringCommands,
  ]);
  const relinkDocumentRef = useRef(authoringDocument);
  relinkDocumentRef.current = authoringDocument;
  const viewStateKey =
    authoringDraft.userId && authoringScope && currentWorkspaceIdentity
      ? templateAuthoringViewStateKey(
          authoringDraft.userId,
          authoringScope,
          currentWorkspaceIdentity,
        )
      : null;
  const loadedViewStateKeyRef = useRef<string | null>(null);
  const restoredViewCompositionKeyRef = useRef<string | null>(null);
  const [viewStateReadyKey, setViewStateReadyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!viewStateKey || !authoringDraft.ready || !authoringDocument) {
      if (!viewStateKey) {
        loadedViewStateKeyRef.current = null;
        setViewStateReadyKey(null);
      }
      return;
    }
    if (loadedViewStateKeyRef.current === viewStateKey) return;
    setViewStateReadyKey(null);
    let cancelled = false;
    void readTemplateAuthoringViewState(
      authoringDraft.userId!,
      authoringScope!,
      currentWorkspaceIdentity!,
    )
      .then((savedView) => {
        if (cancelled) return;
        loadedViewStateKeyRef.current = viewStateKey;
        const composition = savedView
          ? authoringDocument.compositions.find(
              (item) => authoringCompositionKey(item) === savedView.compositionKey,
            )
          : null;
        if (composition && savedView) {
          const compositionKey = authoringCompositionKey(composition);
          restoredViewCompositionKeyRef.current = compositionKey;
          setDraftArtboardId(composition.artboardId ?? null);
          setCompId(composition.compId ?? composition.sourceCompId);
          setSelected(
            savedView.selectedNodeId && composition.nodeIds.includes(savedView.selectedNodeId)
              ? savedView.selectedNodeId
              : null,
          );
          const durationSec = composition.durationSec;
          const maximum =
            typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0
              ? durationSec
              : Number.POSITIVE_INFINITY;
          setPlayheadSec(Math.min(Math.max(0, savedView.playheadSec), maximum));
        }
        setViewStateReadyKey(viewStateKey);
      })
      .catch(() => {
        if (!cancelled) {
          loadedViewStateKeyRef.current = viewStateKey;
          setViewStateReadyKey(viewStateKey);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewStateKey, authoringDraft.ready, authoringDocument]);
  const selectedAuthoringComposition = authoringDocument?.compositions.find((item) =>
    draftArtboardId !== null
      ? item.artboardId === draftArtboardId
      : item.compId === (compId ?? inventoryData?.compId ?? null),
  );
  useEffect(() => {
    if (draftArtboardId === null || selectedAuthoringComposition) return;
    setDraftArtboardId(null);
    setCompId(inventoryData?.compId ?? null);
    setSelected(null);
  }, [draftArtboardId, selectedAuthoringComposition, inventoryData?.compId]);
  useEffect(() => {
    setArtboardWidth(
      selectedAuthoringComposition?.width == null ? '' : String(selectedAuthoringComposition.width),
    );
    setArtboardHeight(
      selectedAuthoringComposition?.height == null
        ? ''
        : String(selectedAuthoringComposition.height),
    );
  }, [
    selectedAuthoringComposition?.artboardId,
    selectedAuthoringComposition?.compId,
    selectedAuthoringComposition?.width,
    selectedAuthoringComposition?.height,
  ]);
  const onPlayheadChange = useCallback((seconds: number) => setPlayheadSec(seconds), []);
  const artworkRefs = useMemo(
    () => [
      ...new Map(
        (authoringDocument?.nodes ?? [])
          .filter((node) => node.kind === 'artwork' && node.artworkAssetRef)
          .map(
            (node) =>
              [templateArtworkPreviewKey(node.artworkAssetRef!), node.artworkAssetRef!] as const,
          ),
      ).values(),
    ],
    [authoringDocument?.nodes],
  );
  // Reuse exact pinned image previews across gestures; a relink or owner/workspace change refetches.
  const artworkRefsKey = JSON.stringify(artworkRefs);
  useEffect(() => {
    let cancelled = false;
    const refs = artworkRefs;
    if (!refs.length) {
      setArtworkPreviewUrls({});
      return () => {
        cancelled = true;
      };
    }
    setArtworkMessage('Loading previews for pinned image versions…');
    void Promise.all(
      refs.map(async (ref) => {
        const version = await fetchPinnedArtworkPreview(brandId, ref);
        if (!version.signedUrl) throw new Error('Pinned image preview unavailable.');
        return [templateArtworkPreviewKey(ref), version.signedUrl] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        setArtworkPreviewUrls(Object.fromEntries(entries));
        setArtworkMessage(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setArtworkMessage(
          reason instanceof Error ? reason.message : 'Pinned image preview unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [artworkRefsKey, brandId, authoringDraft.userId, currentWorkspaceIdentity, artworkRetry]);
  const removedSourceNodeIds = useMemo(() => {
    const projectedIds = new Set(authoringDocument?.nodes.map((node) => node.nodeId) ?? []);
    return (authoringDraft.sourceDocument?.nodes ?? [])
      .filter((node) => node.sourceRef && !projectedIds.has(node.nodeId))
      .map((node) => node.nodeId);
  }, [authoringDraft.sourceDocument, authoringDocument]);
  const fontChoices = authoringDraft.sourceDocument?.fontChoices ?? [];
  const fontChoice =
    fontChoices.find((font) => authoringFontChoiceKey(font) === fontChoiceId) ??
    fontChoices[0] ??
    null;
  useEffect(() => {
    if (!effectiveVersionId || !fontChoice || typeof FontFace === 'undefined') {
      setFontPreview('idle');
      setFontFamily(null);
      return;
    }
    let cancelled = false;
    setFontPreview('loading');
    const family = fontChoice.postScriptName;
    const seedPins =
      workspaceSeed && authoringDraft.persistedDraft
        ? {
            seedArtifactId: workspaceSeed.artifactId,
            seedPackageChecksum: workspaceSeed.packageChecksum,
            expectedRevision: authoringDraft.persistedDraft.revision,
          }
        : undefined;
    void fetchTemplateAuthoringFontPreview(
      assetId,
      { brandId, baseVersionId: effectiveVersionId },
      fontChoice,
      seedPins,
    )
      .then(async ({ bytes }) => {
        const face = await new FontFace(family, bytes).load();
        if (cancelled) return;
        document.fonts.add(face);
        setFontFamily(family);
        setFontPreview('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setFontFamily(null);
          setFontPreview('error');
        }
      });
    return () => {
      cancelled = true;
    };
    // The exact font is immutable within this owner/source/workspace; saving a revision does not remeasure it.
  }, [
    assetId,
    brandId,
    effectiveVersionId,
    workspaceSeed?.artifactId,
    workspaceSeed?.packageChecksum,
    authoringDraft.userId,
    currentWorkspaceIdentity,
    fontChoice && authoringFontChoiceKey(fontChoice),
    fontRetry,
  ]);

  const composed = useQuery({
    queryKey: ['forge-layer-preview', brandId, assetId, effectiveVersionId, compId, settled],
    queryFn: async () => ({
      view: await previewTemplateRevision(assetId, {
        brandId,
        parentRevisionId: currentRevision!.id,
        edits: { layers: settled.edits, orders: settled.orders, slots: [] },
        ...(compId ? { compId } : {}),
      }),
      changes: settled,
    }),
    enabled: ready && !workspaceSeed && !!currentRevision && !!inventoryData && hasChanges(settled),
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const layers = useMemo(() => {
    if (!authoringDocument) return inventoryData?.layers ?? NO_LAYERS;
    const sourceNodes = new Map(
      authoringDocument.nodes.flatMap((node) =>
        node.sourceRef
          ? [[`aep:${node.sourceRef.compId}:${node.sourceRef.layerId}`, node] as const]
          : [],
      ),
    );
    return (inventoryData?.layers ?? NO_LAYERS).map((layer) => {
      const node = sourceNodes.get(`aep:${layer.compId}:${layer.layerId}`);
      if (!node) return layer;
      const reason =
        Object.values(node.transformLocks).find(Boolean) ??
        'Source relationships are preserved; transform editing is unavailable for this layer.';
      return {
        ...layer,
        transformLocks: {
          ...layer.transformLocks,
          ...node.transformLocks,
          ...(!node.capabilities.transform
            ? {
                position: reason,
                rotation: reason,
                scale: reason,
                opacity: reason,
                x: reason,
                y: reason,
                width: reason,
                height: reason,
              }
            : {}),
        },
        visibilityReason: node.capabilities.visibility
          ? layer.visibilityReason
          : (node.visibilityReason ?? 'Visibility editing is unavailable for this source layer.'),
        ...(!node.capabilities.font
          ? { fontReason: node.fontReason ?? 'Font editing is unavailable for this source layer.' }
          : {}),
      };
    });
  }, [inventoryData?.layers, authoringDocument]);
  const byNodeId = useMemo(
    () => new Map(layers.map((layer) => [`aep:${layer.compId}:${layer.layerId}`, layer])),
    [layers],
  );
  const authoringNodes = useMemo(
    () => new Map((authoringDocument?.nodes ?? []).map((node) => [node.nodeId, node])),
    [authoringDocument],
  );
  const authoringLayerNames = useMemo(
    () =>
      new Map([
        ...layers.map(
          (layer) =>
            [
              `aep:${layer.compId}:${layer.layerId}`,
              `${layer.comp} · ${layer.text || layer.name}`,
            ] as const,
        ),
        ...(authoringDocument?.nodes.map(
          (node) => [node.nodeId, node.textContent || node.name || 'Untitled layer'] as const,
        ) ?? []),
        ...(inventoryData?.comps.map((comp) => [`comp:${comp.id}`, comp.name] as const) ?? []),
      ]),
    [inventoryData?.comps, layers, authoringDocument],
  );
  const shownComp =
    draftArtboardId !== null
      ? (selectedAuthoringComposition?.sourceCompId ?? null)
      : (compId ?? inventoryData?.compId ?? null);
  const selectedCompositionKey = selectedAuthoringComposition
    ? authoringCompositionKey(selectedAuthoringComposition)
    : shownComp === null
      ? null
      : `aep:${shownComp}`;
  useEffect(() => setGroupSelectionIds([]), [selectedCompositionKey]);
  useEffect(() => {
    if (restoredViewCompositionKeyRef.current === selectedCompositionKey) {
      restoredViewCompositionKeyRef.current = null;
      return;
    }
    setPlayheadSec(0);
  }, [selectedCompositionKey]);
  const comp = inventoryData?.comps.find((c) => c.id === shownComp);
  const compName = selectedAuthoringComposition?.name ?? comp?.name;
  const fileStack = useMemo(() => stackOf(layers, shownComp), [layers, shownComp]);
  const nodeIdsForComp = (id: number | null) =>
    id === null
      ? []
      : (authoringDocument?.compositions.find((composition) => composition.compId === id)
          ?.nodeIds ?? stackOf(layers, id).map((layerId) => `aep:${id}:${layerId}`));
  const firstEditable = (ids: string[]) =>
    ids.find((id) => {
      const node = authoringNodes.get(id);
      if (node) return node.kind === 'text' && !node.textReason;
      const source = byNodeId.get(id);
      return source?.kind === 'text' && !source.textReason;
    }) ??
    ids[0] ??
    null;
  const nodeIdsForSelectedComposition =
    selectedAuthoringComposition?.nodeIds ?? nodeIdsForComp(shownComp);
  const authoredRenderNodes = useMemo(
    () =>
      sampleAuthoredRenderNodes(
        authoringDocument?.nodes ?? [],
        nodeIdsForSelectedComposition,
        playheadSec,
      ),
    [authoringDocument, nodeIdsForSelectedComposition, playheadSec],
  );
  const containingCompForNode = (nodeId: string) => {
    const composition = authoringDocument?.compositions.find((candidate) =>
      candidate.nodeIds.includes(nodeId),
    );
    const source = /^aep:(\d+):\d+$/.exec(nodeId);
    return composition ? authoringCompositionKey(composition) : source ? `aep:${source[1]}` : null;
  };
  const selectedId =
    selected && containingCompForNode(selected) === selectedCompositionKey
      ? selected
      : firstEditable(nodeIdsForSelectedComposition);
  const selectedNode = selectedId ? authoringNodes.get(selectedId) : undefined;
  useEffect(() => {
    if (
      !viewStateKey ||
      viewStateReadyKey !== viewStateKey ||
      !authoringDraft.userId ||
      !authoringScope ||
      !currentWorkspaceIdentity ||
      !selectedCompositionKey
    )
      return;
    const timer = setTimeout(() => {
      void saveTemplateAuthoringViewState({
        userId: authoringDraft.userId!,
        scope: authoringScope,
        workspaceIdentity: currentWorkspaceIdentity!,
        compositionKey: selectedCompositionKey,
        selectedNodeId: selectedId,
        playheadSec,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }, 120);
    return () => clearTimeout(timer);
  }, [
    viewStateKey,
    viewStateReadyKey,
    authoringDraft.userId,
    authoringScope,
    currentWorkspaceIdentity,
    selectedCompositionKey,
    selectedId,
    playheadSec,
  ]);
  const selectedSourceRef =
    selectedNode?.sourceRef ??
    (selectedId?.startsWith('aep:')
      ? (() => {
          const [, compValue, layerValue] = selectedId.split(':');
          return { compId: Number(compValue), layerId: Number(layerValue) };
        })()
      : null);
  const layer = selectedSourceRef
    ? byNodeId.get(`aep:${selectedSourceRef.compId}:${selectedSourceRef.layerId}`)
    : undefined;

  const fields = useQuery({
    queryKey: forgeQueryKeys.templateVariables(brandId, assetId, effectiveVersionId ?? ''),
    queryFn: () => fetchTemplateVariables(brandId, assetId),
    enabled: ready && fieldsOpen,
  });
  const fonts = useQuery({
    queryKey: ['forge-layer-fonts', brandId],
    queryFn: () => editableTemplateFonts(brandId),
    // Only Bold reads the font inventory.
    enabled: ready && layer?.kind === 'text' && !layer.textReason,
  });
  const variants = revisionCatalog;

  // What is on screen: the composed preview of the settled edits when there are any and it is for
  // this comp, else the unedited scene — with every edit made since applied on top, at once.
  const draftOnlyArtboard =
    draftArtboardId !== null && selectedAuthoringComposition?.sourceCompId === null;
  const composedView =
    !workspaceSeed &&
    shownComp !== null &&
    hasChanges(settled) &&
    composed.data?.view.compId === shownComp
      ? composed.data
      : null;
  const shownScene =
    composedView?.view ??
    (!draftOnlyArtboard && sceneData && (shownComp === null || sceneData.compId === shownComp)
      ? sceneData
      : null);
  const previewCompId = shownScene?.compId ?? selectedAuthoringComposition?.sourceCompId ?? null;
  const previewArtboard = selectedAuthoringComposition
    ? { width: selectedAuthoringComposition.width, height: selectedAuthoringComposition.height }
    : shownScene
      ? (() => {
          const composition = authoringDocument?.compositions.find(
            (item) => item.compId === shownScene.compId,
          );
          return composition ? { width: composition.width, height: composition.height } : undefined;
        })()
      : undefined;
  const renderedFor = composedView?.changes ?? NO_CHANGES;
  const previewEdits = useMemo<PreviewEdits | undefined>(() => {
    if (!shownScene)
      return draftOnlyArtboard
        ? { compId: null, layers: [], rendered: {}, current: {}, renderedOrder: [], order: [] }
        : undefined;
    const sceneComp = shownScene.compId;
    const stableOrder =
      (selectedAuthoringComposition?.sourceCompId === sceneComp
        ? selectedAuthoringComposition.nodeIds
        : authoringDocument?.compositions.find((composition) => composition.compId === sceneComp)
            ?.nodeIds) ?? stackOf(layers, sceneComp).map((id) => `aep:${sceneComp}:${id}`);
    const orderedLayers = stableOrder
      .map((nodeId) => authoringNodes.get(nodeId))
      .flatMap((node) => (node?.sourceRef ? [node.sourceRef.layerId] : []));
    const projectedCurrent = byLayer(
      Object.values(edits).filter((edit) => edit.compId === sceneComp),
    );
    const hasGroupCommands = authoringCommands.some(
      (command) => command.type === 'layer.group' || command.type === 'layer.ungroup',
    );
    if (hasGroupCommands && authoringDocument) {
      const sourceNodes = new Map(
        (authoringDraft.sourceDocument?.nodes ?? []).map((node) => [node.nodeId, node]),
      );
      for (const node of authoringDocument.nodes) {
        if (!node.sourceRef || node.sourceRef.compId !== sceneComp || !node.position) continue;
        let worldX = node.position[0];
        let worldY = node.position[1];
        let parentId = node.parentNodeId;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId);
          const parent = authoringNodes.get(parentId);
          if (!parent) break;
          if (parent.kind === 'group' && parent.position) {
            worldX += parent.position[0];
            worldY += parent.position[1];
          }
          parentId = parent.parentNodeId;
        }
        const source = sourceNodes.get(node.nodeId);
        const nativeEdit = edits[layerKey(node.sourceRef)];
        if (nativeEdit && source?.position) {
          worldX += (nativeEdit.x ?? source.position[0]) - source.position[0];
          worldY += (nativeEdit.y ?? source.position[1]) - source.position[1];
        }
        projectedCurrent[node.sourceRef.layerId] = {
          ...projectedCurrent[node.sourceRef.layerId],
          x: worldX,
          y: worldY,
        };
      }
    }
    if (authoringDocument) {
      for (const node of authoringDocument.nodes) {
        if (!node.sourceRef || node.sourceRef.compId !== sceneComp) continue;
        const layerId = node.sourceRef.layerId;
        const current = projectedCurrent[layerId] ?? {};
        if (
          node.capabilities.timing &&
          node.timingReason === null &&
          node.inSec !== null &&
          node.outSec !== null
        )
          projectedCurrent[layerId] = {
            ...current,
            visible:
              playheadSec >= node.inSec && playheadSec < node.outSec
                ? (current.visible ?? node.visible)
                : false,
          };
        if (!node.capabilities.keyframes) continue;
        for (const channel of node.keyframeChannels) {
          if (channel.reason !== null) continue;
          const sample = sampleMotionChannel(channel, playheadSec);
          if (sample.value === null) continue;
          if (
            (channel.channel === 'position' || channel.channel === 'scale') &&
            Array.isArray(sample.value)
          ) {
            projectedCurrent[layerId] = {
              ...projectedCurrent[layerId],
              ...(channel.channel === 'position'
                ? { x: sample.value[0]!, y: sample.value[1]! }
                : { scale: [sample.value[0]!, sample.value[1]!] as [number, number] }),
            };
          } else if (typeof sample.value === 'number') {
            const property =
              channel.channel === 'rotation'
                ? 'rotation'
                : channel.channel === 'opacity'
                  ? 'opacity'
                  : null;
            if (property)
              projectedCurrent[layerId] = {
                ...projectedCurrent[layerId],
                [property]: sample.value,
              };
          }
        }
      }
    }
    return {
      compId: sceneComp,
      layers,
      rendered: byLayer(renderedFor.edits),
      current: projectedCurrent,
      renderedOrder:
        renderedFor.orders.find((o) => o.compId === sceneComp)?.layerIds ??
        stackOf(layers, sceneComp),
      order: orderedLayers.length
        ? orderedLayers
        : (orders[sceneComp] ?? stackOf(layers, sceneComp)),
    };
  }, [
    shownScene,
    draftOnlyArtboard,
    selectedAuthoringComposition,
    layers,
    renderedFor,
    edits,
    orders,
    authoringDocument,
    authoringNodes,
    authoringCommands,
    authoringDraft.sourceDocument,
    playheadSec,
  ]);
  const markup =
    shownScene?.svg ??
    (draftOnlyArtboard && selectedAuthoringComposition?.width && selectedAuthoringComposition.height
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${selectedAuthoringComposition.width} ${selectedAuthoringComposition.height}"></svg>`
      : '');

  const query = search.trim().toLowerCase();
  const baseNodeIds = nodeIdsForSelectedComposition;
  const searchableNodeIds = query
    ? [
        ...new Set([
          ...(authoringDocument?.nodes.map((node) => node.nodeId) ?? []),
          ...layers.map((candidate) => `aep:${candidate.compId}:${candidate.layerId}`),
        ]),
      ]
    : baseNodeIds;
  const listed = query
    ? searchableNodeIds.filter((id) => {
        const node = authoringNodes.get(id);
        return `${node?.name ?? ''} ${node?.textContent ?? ''} ${compName ?? ''}`
          .toLowerCase()
          .includes(query);
      })
    : baseNodeIds;
  const rows: StackRow[] = listed.flatMap((id) => {
    const node = authoringNodes.get(id);
    const sourceLayer = node?.sourceRef
      ? byNodeId.get(`aep:${node.sourceRef.compId}:${node.sourceRef.layerId}`)
      : byNodeId.get(id);
    if (!node && !sourceLayer) return [];
    return [
      {
        id,
        label:
          node?.textContent ||
          node?.name ||
          sourceLayer?.text ||
          sourceLayer?.name ||
          'Untitled layer',
        detail: sourceLayer
          ? query
            ? compName
            : sourceLayer.text && sourceLayer.text !== sourceLayer.name
              ? sourceLayer.name
              : undefined
          : 'New layer',
        kind: node?.kind ?? sourceLayer!.kind,
        hidden: sourceLayer
          ? !(edits[layerKey(sourceLayer)]?.visible ?? sourceLayer.visible)
          : !node!.visible,
        visibilityLocked: sourceLayer ? !!sourceLayer.visibilityReason : !!node!.visibilityReason,
        edited: sourceLayer ? !!edits[layerKey(sourceLayer)] : id.startsWith('draft:'),
        groupable:
          node?.capabilities.grouping === true &&
          node.groupingReason === null &&
          !node.parentNodeId,
      },
    ];
  });
  const groupSelectionNodes = groupSelectionIds.map((id) => authoringNodes.get(id));
  const groupSelectionReady =
    groupSelectionNodes.length >= 2 &&
    groupSelectionNodes.length <= 32 &&
    groupSelectionNodes.every(
      (node) =>
        node &&
        node.capabilities.grouping === true &&
        node.groupingReason === null &&
        !node.parentNodeId &&
        containingCompForNode(node.nodeId) === selectedCompositionKey,
    );
  const selectedGroupHasMotion =
    selectedNode?.kind === 'group' && authoringDocument
      ? templateAuthoringGroupHasMotion(authoringDocument, selectedNode.nodeId)
      : false;
  const canUngroupAnimatedSelected =
    selectedNode?.kind === 'group' &&
    !!authoringDocument &&
    supportsAnimatedDirectChildUngroup(authoringDocument, selectedNode.nodeId);
  const canUngroupSelected =
    selectedNode?.kind === 'group' &&
    !!authoringDocument &&
    (!selectedGroupHasMotion || canUngroupAnimatedSelected) &&
    canUngroupTemplateNode(authoringCommands, selectedNode.nodeId, authoringDocument);
  const canMutateSelectedGroup =
    selectedNode?.kind === 'group' &&
    !selectedGroupHasMotion &&
    (selectedNode.sourceRef
      ? !!authoringDocument &&
        canMutateTemplateAuthoringSourceGroup(authoringDocument, selectedNode.nodeId)
      : generatedGroupStructureReadbackVerified);
  const verifiedSourceGroupMotion =
    selectedNode?.kind === 'group' &&
    !!selectedNode.sourceRef &&
    !!authoringDocument &&
    templateAuthoringSourceGroupMemberIds(authoringDocument, selectedNode.nodeId) !== null &&
    selectedNode.capabilities.keyframes === true &&
    selectedNode.keyframeChannels.some(
      (channel) =>
        channel.reason === null &&
        (channel.channel === 'position' ||
          channel.channel === 'scale' ||
          channel.channel === 'rotation'),
    );

  // The private seed preview owns geometry; the existing variant endpoint owns asset lineage.
  const lineage =
    currentVariant && currentRevision
      ? {
          role: currentVariant.original ? ('golden' as const) : ('variant' as const),
          parent:
            !currentVariant.original && originalRevision && originalVariant
              ? { assetId: originalRevision.sourceAssetId, name: originalVariant.name }
              : null,
        }
      : undefined;
  const onVariant = lineage?.role === 'variant';
  const previewing =
    sceneIsFetching || (hasChanges(changes) && (settled !== changes || composed.isFetching));
  const staleSource = authoringDraft.status === 'source-mismatch';
  const draftDifferences = authoringDraft.serverDraft
    ? compareTemplateDrafts(
        authoringCommands,
        authoringDraft.serverDraft.commands,
        authoringLayerNames,
      )
    : [];
  const busy = saving || !inventoryData || !authoringDraft.ready || staleSource;
  const hasUnreconciledLocalCommands = authoringDraft.recoveries.some(
    (recovery) => recovery.commands.length > 0 || recovery.persistedCommands.length > 0,
  );
  const canBootstrapEmptyDraft =
    !authoringDraft.persistedDraft &&
    !authoringDraft.serverDraft &&
    authoringDraft.status === 'saved' &&
    authoringCommands.length === 0;
  const canAttachHyperframesSeed =
    !!hyperframesRevisionId &&
    (canBootstrapEmptyDraft ||
      (!!authoringDraft.persistedDraft &&
        authoringDraft.persistedDraft.revision > 0 &&
        !authoringDraft.persistedDraft.commands.length)) &&
    authoringDraft.ready &&
    authoringDraft.status === 'saved' &&
    !authoringDraft.dirty &&
    !dirty &&
    !sourceChanged &&
    !workspaceSeed &&
    !authoringDraft.persistedDraft?.commands.length &&
    !authoringDraft.serverDraft?.requiresReconciliation &&
    !hasUnreconciledLocalCommands &&
    !seedImporting;
  const attachHyperframesSeed = async () => {
    if (!canAttachHyperframesSeed || !hyperframesRevisionId || !effectiveVersionId) return;
    setSeedImporting(true);
    setSeedImportError(null);
    try {
      let emptyDraft = authoringDraft.persistedDraft;
      if (!emptyDraft) {
        try {
          emptyDraft = await putTemplateAuthoringDraft(assetId, {
            brandId,
            baseVersionId: effectiveVersionId,
            expectedRevision: 0,
            commands: [],
          });
        } catch (writeError) {
          // The bootstrap is idempotent only after an exact owner/scope read proves that an empty
          // draft won the revision-zero CAS. Never retry a blind write over a concurrent draft.
          const existing = await fetchTemplateAuthoringDraft(
            assetId,
            brandId,
            effectiveVersionId,
          ).catch(() => null);
          const expectedChecksum = authoringDraft.sourceDocument?.sourceChecksum;
          if (
            !existing ||
            existing.requiresReconciliation ||
            existing.seed ||
            existing.commands.length ||
            existing.revision < 1 ||
            existing.scope.brandId !== brandId ||
            existing.scope.assetId !== assetId ||
            existing.scope.baseVersionId !== effectiveVersionId ||
            !expectedChecksum ||
            existing.sourceChecksum !== expectedChecksum
          )
            throw writeError;
          emptyDraft = existing;
        }
        if (
          emptyDraft.revision < 1 ||
          emptyDraft.commands.length ||
          emptyDraft.requiresReconciliation ||
          emptyDraft.seed ||
          emptyDraft.scope.brandId !== brandId ||
          emptyDraft.scope.assetId !== assetId ||
          emptyDraft.scope.baseVersionId !== effectiveVersionId ||
          emptyDraft.sourceChecksum !== authoringDraft.sourceDocument?.sourceChecksum
        )
          throw new Error(
            'Forge did not confirm an empty private draft for this exact source. Your local work is unchanged.',
          );
      }
      const result = await stageHyperframesRevisionForForge(hyperframesRevisionId, {
        brandId,
        assetId,
        baseVersionId: effectiveVersionId,
        expectedDraftRevision: emptyDraft.revision,
      });
      if (result.artifact.purpose !== 'workspace_seed')
        throw new Error('Forge returned an artifact that is not a private workspace seed.');
      authoringDraft.refresh();
      toast.success('Private composition attached to this Forge workspace.');
    } catch (reason) {
      // The server can complete the private export and attach before the response reaches the
      // browser. Re-read the owner-scoped draft so a lost response cannot leave the UI offering
      // a second import against an already attached seed.
      authoringDraft.refresh();
      setSeedImportError(
        reason instanceof Error ? reason.message : 'Could not attach the private composition.',
      );
    } finally {
      setSeedImporting(false);
    }
  };
  const authoringLifecycle = useTemplateAuthoringLifecycle({
    active,
    enabled: hasUncompiledLifecycle && !staleSource && !sourceChanged,
    scope: effectiveVersionId ? { brandId, assetId, baseVersionId: effectiveVersionId } : null,
    revision: authoringDraft.revision,
    syncStatus: authoringDraft.status,
    draftDirty:
      authoringDraft.dirty ||
      !same(authoringCommands, authoringDraft.persistedDraft?.commands ?? []),
    persistedDraft: authoringDraft.persistedDraft,
    sourceDocument: authoringDraft.sourceDocument,
    parse,
  });
  useEffect(() => {
    if (authoringLifecycle.state === 'needs-input' || authoringLifecycle.state === 'failed')
      setPreparationDetailsOpen(true);
  }, [authoringLifecycle.state, authoringLifecycle.preparation?.artifactId]);

  useEffect(() => {
    const artifact = authoringLifecycle.artifact;
    if (
      !savedVariant ||
      savedVariant.published ||
      artifact?.state !== 'committed' ||
      artifact.artifactId !== savedVariant.artifactId ||
      artifact.commit?.versionId !== savedVariant.versionId
    )
      return;
    setSavedVariant((receipt) =>
      receipt &&
      receipt.artifactId === artifact.artifactId &&
      receipt.versionId === artifact.commit?.versionId
        ? { ...receipt, published: true }
        : receipt,
    );
  }, [authoringLifecycle.artifact, savedVariant]);

  const preparationSummary = templatePreparationSummary(
    authoringLifecycle,
    authoringDraft.status,
    authoringDraft.dirty,
    authoringDocument?.dependencies ?? [],
  );
  const showRepair = () => {
    setPreparationDetailsOpen(true);
    requestAnimationFrame(() => repairPanel.current?.scrollIntoView({ block: 'nearest' }));
  };

  const compositionError =
    hasChanges(changes) && settled === changes && composed.isError && !composed.isFetching;
  const currentComposition =
    hasChanges(changes) && composedView && same(changes, composedView.changes);
  const fidelity = currentComposition
    ? 'Composed preview'
    : hasChanges(changes)
      ? 'Local estimate'
      : 'Source preview';
  const previewLabel =
    sceneIsError && !shownScene
      ? 'Preview unavailable'
      : previewing
        ? `${fidelity} · updating`
        : compositionError
          ? currentComposition
            ? 'Composed preview · refresh unavailable'
            : 'Local estimate · composition unavailable'
          : fidelity;
  // Until the layer list lands, the shell stands in for it from the parse the page holds.
  const defaultComp = parse?.comps.find((c) => c.isDelivery) ?? parse?.comps[0];
  // A full parse counts the comp's layers; the compact one the page may hold does not.
  const placeholderRows =
    typeof defaultComp?.layerCount === 'number' && defaultComp.layerCount > 0
      ? defaultComp.layerCount
      : 6;

  const editLayer = (
    target: TemplateEditableLayer,
    change: Partial<TemplateLayerEdit>,
    group: string | null = null,
  ) => {
    const current = historyRef.current.present;
    const nextEdits = applyLayerChange(current.edits, layers, target, change);
    const targets =
      change.visible !== undefined && target.visibilitySlotKeys.length
        ? layers.filter((candidate) =>
            candidate.visibilitySlotKeys.some((key) => target.visibilitySlotKeys.includes(key)),
          )
        : [target];
    let next = { ...current, edits: nextEdits };
    for (const candidate of targets) {
      const edit = {
        compId: candidate.compId,
        layerId: candidate.layerId,
        ...change,
      };
      next = appendLayerDraftCommand(next, {
        type: 'layer.edit',
        nodeId: `aep:${candidate.compId}:${candidate.layerId}`,
        edit,
      });
    }
    pushSnapshot(next, group);
  };
  const editAndPersistGesture = (
    target: TemplateEditableLayer,
    change: Partial<TemplateLayerEdit>,
    group: string | null = null,
  ) => {
    editLayer(target, change, group);
    if (change.visible !== undefined || change.font !== undefined)
      setTimeout(() => void flushDraftRef.current(), 0);
  };
  const inspectorFor = (target: TemplateEditableLayer, idPrefix: string) => (
    <TemplateLayerInspector
      idPrefix={idPrefix}
      layer={target}
      edit={edits[layerKey(target)]}
      fonts={fonts.data ?? []}
      disabled={!authoringDraft.ready || staleSource}
      inputValues={layerInputs[layerKey(target)] ?? {}}
      invalidFields={layerValidity[layerKey(target)] ?? []}
      onInputValue={(field, value) =>
        setLayerInputs((current) => ({
          ...current,
          [layerKey(target)]: { ...current[layerKey(target)], [field]: value },
        }))
      }
      onEdit={(change, group) => editAndPersistGesture(target, change, group ?? null)}
      onEditCommit={closeHistoryGroup}
      onValidity={(invalid) =>
        setLayerValidity((current) => ({ ...current, [layerKey(target)]: invalid }))
      }
    />
  );
  const selectLayer = (identity: number | string) => {
    const nodeId =
      typeof identity === 'number'
        ? layers.find(
            (candidate) => candidate.layerId === identity && candidate.compId === shownComp,
          )
          ? `aep:${shownComp}:${identity}`
          : null
        : identity;
    const node = nodeId ? authoringNodes.get(nodeId) : undefined;
    if (!node) {
      if (nodeId?.startsWith('aep:')) {
        const target = layers.find(
          (candidate) => `aep:${candidate.compId}:${candidate.layerId}` === nodeId,
        );
        if (target) setSelected(nodeId);
      }
      return;
    }
    if (!nodeId) return;
    const containingComposition = authoringDocument?.compositions.find((composition) =>
      composition.nodeIds.includes(nodeId),
    );
    if (!containingComposition) return;
    if (containingComposition.artboardId) {
      setDraftArtboardId(containingComposition.artboardId);
      setCompId(containingComposition.sourceCompId);
    } else if (containingComposition.compId !== null) {
      setDraftArtboardId(null);
      if (containingComposition.compId !== shownComp) setCompId(containingComposition.compId);
    }
    if (node.fontRef) {
      const choice = authoringFontChoiceForRef(fontChoices, node.fontRef);
      if (choice) setFontChoiceId(authoringFontChoiceKey(choice));
    }
    setSelected(nodeId);
  };
  const reorder = (order: Array<number | string>) => {
    if (selectedAuthoringComposition?.artboardId) {
      const nodeOrder = order.map((id) => (typeof id === 'string' ? id : null));
      if (nodeOrder.some((id) => id === null)) return;
      recordAuthoringCommand({
        type: 'composition.order',
        artboardId: selectedAuthoringComposition.artboardId,
        nodeIds: nodeOrder as string[],
      });
      return;
    }
    if (shownComp === null) return;
    const nodeOrder = order.map((id) => (typeof id === 'number' ? `aep:${shownComp}:${id}` : id));
    let snapshot = historyRef.current.present;
    if (authoringDraft.sourceDocument) {
      const next = { ...snapshot.nodeOrders };
      const legacyOrder = nodeOrder
        .map((id) => /^aep:\d+:(\d+)$/.exec(id)?.[1])
        .filter((id): id is string => !!id)
        .map(Number);
      const nextLegacyOrders = { ...snapshot.orders };
      if (legacyOrder.length === nodeOrder.length && !same(legacyOrder, fileStack))
        nextLegacyOrders[shownComp] = legacyOrder;
      else delete nextLegacyOrders[shownComp];
      const sourceOrder =
        authoringDraft.sourceDocument.compositions.find(
          (composition) => composition.compId === shownComp,
        )?.nodeIds ?? fileStack.map((id) => `aep:${shownComp}:${id}`);
      if (same(nodeOrder, sourceOrder)) delete next[shownComp];
      else next[shownComp] = nodeOrder;
      snapshot = { ...snapshot, nodeOrders: next, orders: nextLegacyOrders };
      snapshot = appendLayerDraftCommand(snapshot, {
        type: 'composition.order',
        compId: shownComp,
        nodeIds: nodeOrder,
      });
    } else {
      const numericOrder = order.map((id) =>
        typeof id === 'number' ? id : Number(id.split(':')[2]),
      );
      const next = { ...snapshot.orders };
      if (same(numericOrder, fileStack)) delete next[shownComp];
      else next[shownComp] = numericOrder;
      snapshot = { ...snapshot, orders: next };
      snapshot = appendLayerDraftCommand(snapshot, {
        type: 'composition.order',
        compId: shownComp,
        layerIds: numericOrder,
      });
    }
    pushSnapshot(snapshot);
    setTimeout(() => void flushDraftRef.current(), 0);
  };
  const recordAuthoringCommand = (
    command: import('@continuum/contracts').TemplateAuthoringCommand,
    group: string | null = null,
    immediate = true,
  ) => {
    const snapshot = appendLayerDraftCommand(historyRef.current.present, command);
    pushSnapshot(snapshot, group);
    if (immediate) setTimeout(() => void flushDraftRef.current(), 0);
  };
  const editGeneratedGroup = (
    node: NonNullable<typeof selectedNode>,
    edit: Extract<TemplateAuthoringCommand, { type: 'layer.edit' }>['edit'],
    group: string | null = null,
    immediate = true,
  ) => {
    if (
      node.kind !== 'group' ||
      !authoringDocument ||
      templateAuthoringGroupHasMotion(authoringDocument, node.nodeId)
    )
      return false;
    const verifiedSourceGroup =
      !!node.sourceRef &&
      !!authoringDocument &&
      canMutateTemplateAuthoringSourceGroup(authoringDocument, node.nodeId);
    const groupCommand = authoringCommands.find(
      (command): command is Extract<TemplateAuthoringCommand, { type: 'layer.group' }> =>
        command.type === 'layer.group' && command.nodeId === node.nodeId,
    );
    if (node.sourceRef ? !verifiedSourceGroup : !groupCommand) return false;
    const allowed = new Set(['position', 'x', 'y', 'scale', 'rotation', 'compId', 'layerId']);
    if (!Object.keys(edit).length || Object.keys(edit).some((key) => !allowed.has(key)))
      return false;
    const position =
      'position' in edit
        ? edit.position
        : 'compId' in edit && (edit.x !== undefined || edit.y !== undefined)
          ? ([edit.x ?? node.position?.[0] ?? 0, edit.y ?? node.position?.[1] ?? 0] as [
              number,
              number,
            ])
          : undefined;
    const transform = {
      ...(position === undefined ? {} : { position }),
      ...(edit.scale === undefined ? {} : { scale: edit.scale }),
      ...(edit.rotation === undefined ? {} : { rotation: edit.rotation }),
    };
    if (!Object.keys(transform).length) return false;
    recordAuthoringCommand(
      { type: 'layer.group.transform', nodeId: node.nodeId, transform },
      group,
      immediate,
    );
    return true;
  };
  const createMask = (draft: import('@/components/forge/templateAuthoringMasks').MaskDraft) => {
    if (!selectedNode || !authoringDraft.sourceDocument || staleSource || !authoringDraft.ready)
      return;
    recordAuthoringCommand({
      type: 'mask.create',
      draftMaskId: crypto.randomUUID(),
      nodeId: selectedNode.nodeId,
      ...draft,
    });
  };
  const maskMutationWriterProof = true;
  const updateAuthoredMask = (
    nodeId: string,
    draftMaskId: string,
    patch: Extract<
      import('@continuum/contracts').TemplateAuthoringCommand,
      { type: 'mask.update' }
    >['patch'],
  ) => {
    if (!maskMutationWriterProof || !authoringDraft.ready || staleSource) return;
    recordAuthoringCommand({ type: 'mask.update', nodeId, draftMaskId, patch });
  };
  const deleteAuthoredMask = (nodeId: string, draftMaskId: string) => {
    if (!maskMutationWriterProof || !authoringDraft.ready || staleSource) return;
    recordAuthoringCommand({ type: 'mask.delete', nodeId, draftMaskId });
  };
  const createArtboard = () => {
    if (
      !authoringDraft.ready ||
      !authoringDocument ||
      staleSource ||
      selectedAuthoringComposition?.artboardReason !== null
    )
      return;
    const artboardId = crypto.randomUUID();
    recordAuthoringCommand({
      type: 'artboard.create',
      artboardId,
      name: newArtboardName.trim() || 'New composition',
      width: Math.round(selectedAuthoringComposition?.width ?? 1080),
      height: Math.round(selectedAuthoringComposition?.height ?? 1080),
      frameRate: selectedAuthoringComposition?.frameRate ?? 30,
      durationSec: selectedAuthoringComposition?.durationSec ?? 15,
    });
    setDraftArtboardId(artboardId);
    setCompId(null);
    setSelected(null);
    setNewArtboardName('New composition');
  };
  const duplicateArtboard = () => {
    if (
      !authoringDraft.ready ||
      !selectedAuthoringComposition ||
      selectedAuthoringComposition.artboardReason !== null ||
      staleSource
    )
      return;
    const artboardId = crypto.randomUUID();
    const source = selectedAuthoringComposition.artboardId
      ? { sourceArtboardId: selectedAuthoringComposition.artboardId }
      : selectedAuthoringComposition.compId !== null
        ? { sourceCompId: selectedAuthoringComposition.compId }
        : null;
    if (!source) return;
    recordAuthoringCommand({
      type: 'artboard.duplicate',
      artboardId,
      ...source,
      name: `${selectedAuthoringComposition.name ?? 'Composition'} copy`.slice(0, 180),
    });
    setDraftArtboardId(artboardId);
    setCompId(selectedAuthoringComposition.compId ?? selectedAuthoringComposition.sourceCompId);
    setSelected(null);
  };
  const resizeArtboard = () => {
    const width = Number(artboardWidth);
    const height = Number(artboardHeight);
    const target =
      selectedAuthoringComposition && authoringCompositionTarget(selectedAuthoringComposition);
    if (
      !selectedAuthoringComposition ||
      !target ||
      selectedAuthoringComposition.artboardReason !== null ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 4 ||
      height < 4 ||
      width > 30_000 ||
      height > 30_000 ||
      (width === selectedAuthoringComposition.width &&
        height === selectedAuthoringComposition.height)
    )
      return;
    recordAuthoringCommand({ type: 'artboard.resize', ...target, width, height });
  };
  const editAuthoredNode = (
    node: NonNullable<typeof selectedNode>,
    edit: Extract<
      import('@continuum/contracts').TemplateAuthoringCommand,
      { type: 'layer.edit' }
    >['edit'],
    group: string | null = null,
    immediate = true,
  ) => {
    if (node.kind === 'group') {
      editGeneratedGroup(node, edit, group, immediate);
      return;
    }
    if (node.nodeId.startsWith('draft:')) {
      if ('compId' in edit) return;
      recordAuthoringCommand({ type: 'layer.edit', nodeId: node.nodeId, edit }, group, immediate);
      return;
    }
    const sourceRef = node.sourceRef;
    const target =
      sourceRef &&
      layers.find(
        (candidate) =>
          candidate.compId === sourceRef.compId && candidate.layerId === sourceRef.layerId,
      );
    if (target) editLayer(target, edit);
  };
  const createText = () => {
    const composition = selectedAuthoringComposition;
    const target = composition && authoringCompositionTarget(composition);
    if (
      !composition ||
      !target ||
      composition.creationReason ||
      !fontChoice ||
      !fontFamily ||
      !newText.trim()
    )
      return;
    const nodeId = `draft:${crypto.randomUUID()}` as const;
    recordAuthoringCommand({
      type: 'text.create',
      nodeId,
      ...target,
      name: 'Text layer',
      text: newText.trim(),
      fontRef: authoringFontRef(fontChoice),
      fontSize: 48,
      fillColor: [1, 1, 1],
      position: [
        Math.round((composition.width ?? 0) / 2),
        Math.round((composition.height ?? 0) / 2),
      ],
    });
    setSelected(nodeId);
    setNewText('');
  };
  const createShape = (shape: 'rectangle' | 'ellipse') => {
    const composition = selectedAuthoringComposition;
    const target = composition && authoringCompositionTarget(composition);
    if (!composition || !target || composition.shapeCreationReason) return;
    const nodeId = `draft:${crypto.randomUUID()}` as const;
    recordAuthoringCommand({
      type: 'shape.create',
      nodeId,
      ...target,
      shape,
      name: shape === 'rectangle' ? 'Rectangle' : 'Ellipse',
      position: [
        Math.round((composition.width ?? 400) / 2),
        Math.round((composition.height ?? 300) / 2),
      ],
      size: [240, 140],
      fill: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 0.24 },
      stroke: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 1, width: 2 },
    });
    setSelected(nodeId);
  };
  const createArtwork = async (asset: MediaAsset) => {
    const composition = selectedAuthoringComposition;
    const target = composition && authoringCompositionTarget(composition);
    if (!composition || !target || composition.creationReason) return;
    if (!asset.headVersionId || !asset.checksum || !/^[a-f0-9]{64}$/i.test(asset.checksum)) {
      setArtworkMessage(
        'This Library image has no verified immutable version checksum. Choose a versioned image.',
      );
      return;
    }
    const assetRef = {
      assetId: asset.id,
      versionId: asset.headVersionId,
      sha256: asset.checksum.toLowerCase(),
    };
    setArtworkMessage('Verifying the selected image version…');
    try {
      const version = await fetchPinnedArtworkPreview(brandId, assetRef);
      const url = version.signedUrl;
      if (!url) throw new Error('A private preview for this exact image version is unavailable.');
      const [naturalWidth, naturalHeight] =
        version.width && version.height
          ? [version.width, version.height]
          : await imageDimensions(url);
      if (!(naturalWidth > 0 && naturalHeight > 0))
        throw new Error('The selected image has no readable dimensions.');
      if (
        !(
          composition.width &&
          composition.height &&
          composition.width > 0 &&
          composition.height > 0
        )
      ) {
        throw new Error('This composition has no verified dimensions for image placement.');
      }
      const fit = Math.min(
        (composition.width * 0.8) / naturalWidth,
        (composition.height * 0.8) / naturalHeight,
        1,
      );
      const size: [number, number] = [
        Math.max(1, Math.round(naturalWidth * fit)),
        Math.max(1, Math.round(naturalHeight * fit)),
      ];
      const nodeId = `draft:${crypto.randomUUID()}` as const;
      setArtworkPreviewUrls((current) => ({
        ...current,
        [templateArtworkPreviewKey(assetRef)]: url,
      }));
      recordAuthoringCommand({
        type: 'artwork.create',
        nodeId,
        ...target,
        name: (asset.title ?? asset.fileName).slice(0, 200),
        position: [Math.round(composition.width / 2), Math.round(composition.height / 2)],
        size,
        assetRef,
      });
      setSelected(nodeId);
      setArtworkMessage('Image added from its pinned Library version.');
    } catch (reason) {
      setArtworkMessage(
        reason instanceof Error ? reason.message : 'Could not verify the selected image version.',
      );
    }
  };
  const openDependencyRepair = (footageItemId: number, preserveRetryTarget = false) => {
    const dependency = authoringDocument?.dependencies.find(
      (item) => item.footageItemId === footageItemId,
    );
    if (!dependency || dependency.relinkReason !== null) return;
    artworkRelinkAttemptRef.current += 1;
    if (!preserveRetryTarget) setArtworkRetryFootageItemId(null);
    const target = dependency.affectedLayers[0];
    if (target) {
      setDraftArtboardId(null);
      setCompId(target.compId);
      setSelected(`aep:${target.compId}:${target.layerUid}`);
    }
    setArtworkMessage(null);
    setRepairFootageItemId(footageItemId);
    setArtworkPickerOpen(true);
  };
  const relinkDependency = async (footageItemId: number, asset: MediaAsset) => {
    const dependency = authoringDocument?.dependencies.find(
      (item) => item.footageItemId === footageItemId,
    );
    if (!authoringDocument || !dependency || dependency.relinkReason !== null) {
      setArtworkRetryFootageItemId(null);
      setArtworkMessage(
        'This package dependency is no longer available for relinking. Refresh the draft and review its exact package target.',
      );
      return;
    }
    const requestSourceKey = sourceKey;
    const requestSourceChecksum = authoringDocument.sourceChecksum;
    const requestStillTargetsCurrentSource = () => {
      const currentDocument = relinkDocumentRef.current;
      const currentDependency = currentDocument?.dependencies.find(
        (item) => item.footageItemId === footageItemId,
      );
      return (
        requestSourceKey === relinkSourceKeyRef.current &&
        requestSourceChecksum === currentDocument?.sourceChecksum &&
        currentDependency?.relinkReason === null &&
        currentDependency.mediaCode === dependency.mediaCode &&
        currentDependency.footageFramerate === dependency.footageFramerate &&
        currentDependency.width === dependency.width &&
        currentDependency.height === dependency.height &&
        JSON.stringify(currentDependency.affectedLayers) ===
          JSON.stringify(dependency.affectedLayers)
      );
    };
    if (!asset.headVersionId || !asset.checksum || !/^[a-f0-9]{64}$/i.test(asset.checksum)) {
      setArtworkRetryFootageItemId(footageItemId);
      setArtworkMessage(
        'This Library image has no verified immutable version checksum. Choose a versioned PNG or JPEG.',
      );
      return;
    }
    const assetRef = {
      assetId: asset.id,
      versionId: asset.headVersionId,
      sha256: asset.checksum.toLowerCase(),
    };
    const attempt = ++artworkRelinkAttemptRef.current;
    setArtworkMessage('Verifying the selected image version and dimensions…');
    try {
      const version = await fetchPinnedArtworkPreview(brandId, assetRef);
      const mimeType = version.mimeType?.toLowerCase();
      const expectedMimeType =
        dependency.mediaCode === 'png!' && dependency.footageFramerate === 0
          ? 'image/png'
          : dependency.mediaCode === 'ZPEG' && dependency.footageFramerate === 0
            ? 'image/jpeg'
            : null;
      if (!expectedMimeType || mimeType !== expectedMimeType)
        throw new Error(
          'This package dependency needs a Library image with the exact verified media format.',
        );
      if (
        !dependency.width ||
        !dependency.height ||
        version.width !== dependency.width ||
        version.height !== dependency.height
      )
        throw new Error(
          `Choose an image with the exact ${dependency.width} × ${dependency.height} dimensions required by this package dependency.`,
        );
      if (!requestStillTargetsCurrentSource()) return;
      recordAuthoringCommand({ type: 'dependency.relink', footageItemId, assetRef });
      if (attempt === artworkRelinkAttemptRef.current) {
        setArtworkRetryFootageItemId(null);
        setArtworkMessage(
          'The pinned Library version is queued for this private package. Forge will verify the relink during compilation.',
        );
        setRepairFootageItemId(null);
      }
    } catch (reason) {
      if (attempt !== artworkRelinkAttemptRef.current || !requestStillTargetsCurrentSource())
        return;
      setArtworkRetryFootageItemId(footageItemId);
      setArtworkMessage(
        reason instanceof Error ? reason.message : 'Could not verify the selected Library image.',
      );
    }
  };
  const handleLibraryAssetPick = (assets: MediaAsset[]) => {
    const asset = assets[0];
    if (!asset) return;
    const footageItemId = repairFootageItemId;
    setArtworkPickerOpen(false);
    if (footageItemId !== null) {
      void relinkDependency(footageItemId, asset);
      return;
    }
    void createArtwork(asset);
  };
  const duplicateSelected = () => {
    if (!selectedNode || selectedNode.duplicateReason) return;
    const nodeId = `draft:${crypto.randomUUID()}` as const;
    recordAuthoringCommand({
      type: 'layer.duplicate',
      nodeId,
      sourceNodeId: selectedNode.nodeId,
      name: `${selectedNode.name ?? selectedNode.textContent ?? 'Layer'} copy`,
    });
    setSelected(nodeId);
  };
  const deleteSelected = () => {
    if (!selectedNode || selectedNode.deleteReason) return;
    recordAuthoringCommand({ type: 'layer.delete', nodeId: selectedNode.nodeId });
    const remaining = baseNodeIds.filter((id) => id !== selectedNode.nodeId);
    setSelected(remaining[0] ?? null);
  };
  const createGroup = () => {
    const target =
      selectedAuthoringComposition && authoringCompositionTarget(selectedAuthoringComposition);
    if (!groupSelectionReady || !target) return;
    const nodeId = `draft:${crypto.randomUUID()}` as const;
    recordAuthoringCommand({
      type: 'layer.group',
      nodeId,
      ...target,
      name: 'Group',
      memberNodeIds: [...groupSelectionIds],
    });
    setGroupSelectionIds([]);
    setSelected(nodeId);
  };
  const ungroupSelected = () => {
    if (!canUngroupSelected || selectedNode?.kind !== 'group') return;
    const groupCommand = authoringCommands.find(
      (command): command is Extract<TemplateAuthoringCommand, { type: 'layer.group' }> =>
        command.type === 'layer.group' && command.nodeId === selectedNode.nodeId,
    );
    const memberNodeIds =
      groupCommand?.memberNodeIds ??
      (authoringDocument
        ? templateAuthoringSourceGroupMemberIds(authoringDocument, selectedNode.nodeId)
        : null);
    if (!memberNodeIds?.length) return;
    recordAuthoringCommand({ type: 'layer.ungroup', nodeId: selectedNode.nodeId });
    setSelected(memberNodeIds[0] ?? null);
  };
  const reset = () => {
    pushSnapshot(EMPTY_DRAFT);
    setLayerInputs({});
    setLayerValidity({});
    setError(null);
    setTimeout(() => void flushDraftRef.current(), 0);
  };
  const save = async (saveTo: TemplateLayerSaveTarget, openAfterSave = true): Promise<boolean> => {
    if (hasUncompiledLifecycle) {
      if (Object.values(layerValidity).some((fields) => fields.length > 0)) {
        setError('Correct the highlighted layer properties before publishing.');
        return false;
      }
      if (
        busy ||
        !lineage ||
        !currentRevision ||
        !currentVariant ||
        !dirty ||
        !authoringLifecycle.canPublish
      ) {
        setError(
          'This authoring change stays private until its exact package passes verification and receives review.',
        );
        return false;
      }
      let variantName: string | undefined;
      if (saveTo === 'new_variant') {
        if (!(await form.trigger('name'))) return false;
        variantName = form.getValues('name').trim();
      }
      const savedSnapshot = structuredClone(historyRef.current.present);
      const identity = sourceKeyRef.current;
      setSaving(true);
      setError(null);
      let committed: Awaited<ReturnType<typeof authoringLifecycle.reviewAndCommit>>;
      try {
        committed = await authoringLifecycle.reviewAndCommit({
          saveTo,
          parentRevisionId: currentRevision.id,
          expectedHeadRevisionId:
            saveTo === 'new_variant' ? currentRevision.id : currentVariant.draftHeadRevisionId,
          ...(saveTo === 'this_variant' ? { variantId: currentVariant.variantId } : {}),
          ...(variantName ? { name: variantName } : {}),
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save the verified package.');
        setSaving(false);
        return false;
      }
      const result = committed?.commit;
      if (!result) {
        setError(
          'The verified package did not return a saved version. Your private draft is retained.',
        );
        setSaving(false);
        return false;
      }
      if (sourceKeyRef.current === identity) {
        const next = markLayerHistorySaved(historyRef.current, savedSnapshot);
        historyRef.current = next;
        setHistory(next);
      }
      if (saveTo === 'this_variant')
        savedRevisionKeyRef.current = `${brandId}:${assetId}:${result.versionId}`;
      setSavedVariant({
        assetId: result.assetId,
        name: variantName ?? name,
        artifactId: committed!.artifactId,
        versionId: result.versionId,
        published: committed!.state === 'committed',
      });
      try {
        await onSaved();
      } catch {
        setError('Package saved as a version. The template list could not refresh.');
      }
      const stillDirty =
        sourceKeyRef.current.startsWith(`${brandId}:${assetId}:`) &&
        isLayerHistoryDirty(historyRef.current);
      if (saveTo === 'new_variant' && openAfterSave && !stillDirty) onOpenVariant?.(result.assetId);
      if (stillDirty)
        setError('The reviewed version was saved. Your newer edits stay in this private draft.');
      setSaving(false);
      return !stillDirty;
    }
    return false;
  };
  const draftState: LayerDraftState = {
    dirty: authoringDraft.dirty,
    busy: !authoringDraft.ready || authoringDraft.status === 'saving',
    saveLabel: 'Save private draft',
    save: saveDraft,
    discard,
    status: authoringDraft.status,
    retry: authoringDraft.retry,
  };
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChange?.(draftState);
  }, [
    onDraftChange,
    draftState.dirty,
    draftState.busy,
    draftState.status,
    draftState.save,
    draftState.discard,
    draftState.retry,
  ]);
  useEffect(() => () => onDraftChangeRef.current?.(null), []);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      )
        return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        moveHistory(event.shiftKey ? redoLayerHistory : undoLayerHistory);
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        moveHistory(redoLayerHistory);
      } else if (event.key.toLowerCase() === 'd' && selectedNode && !selectedNode.duplicateReason) {
        event.preventDefault();
        duplicateSelected();
      } else if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        selectedNode &&
        !selectedNode.deleteReason
      ) {
        event.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, versionId, selectedNode]);

  if (!effectiveVersionId)
    return (
      <p className="text-xs text-muted-foreground">
        Import and parse the source to edit its layers.
      </p>
    );
  return (
    <>
      <section
        aria-label="Template layer editor"
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card [&_.text-3xs]:text-[length:max(12px,0.75rem)] [&_.text-2xs]:text-[length:max(12px,0.75rem)] [&_.text-3xs]:leading-snug [&_.text-2xs]:leading-snug [&_button]:text-[length:max(12px,0.75rem)] [--text-xs:max(12px,0.75rem)] [--text-sm:max(14px,0.875rem)] lg:h-[min(56rem,calc(100dvh-9rem))]"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full break-words text-sm font-medium" title={name}>
              {name}
            </span>
            {!lineage ? (
              <span role="status" className="text-xs text-muted-foreground">
                {variants.isError && workspaceSeed
                  ? 'Template history unavailable'
                  : 'Loading template history…'}
              </span>
            ) : null}
            {lineage?.role === 'golden' ? (
              <Pill variant="warning">
                <Lock className="size-3" aria-hidden /> Golden source
              </Pill>
            ) : null}
            {onVariant ? (
              <Pill variant="violet">
                <GitFork className="size-3" aria-hidden /> Variant
              </Pill>
            ) : null}
            {onVariant && lineage?.parent ? (
              <Button
                size="xs"
                variant="link"
                className="h-auto px-0"
                disabled={!onOpenVariant}
                onClick={() => lineage.parent && onOpenVariant?.(lineage.parent.assetId)}
              >
                of {lineage.parent.name}
              </Button>
            ) : null}
            {lineage ? (
              <p className="text-xs text-muted-foreground">
                {onVariant
                  ? 'Save writes this variant’s next revision.'
                  : 'Your original upload stays intact. Publishing creates a variant.'}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {shownScene ? (
              <span
                role="status"
                className="flex items-center gap-1 text-2xs text-muted-foreground"
              >
                {previewing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                {previewLabel}
              </span>
            ) : null}
            {authoringDraft.status !== 'saved' || authoringDraft.revision > 0 ? (
              <span role="status" aria-live="polite" className="text-2xs text-muted-foreground">
                {authoringDraft.status === 'loading' ? 'Loading private draft…' : null}
                {authoringDraft.status === 'saving' ? 'Saving private draft…' : null}
                {authoringDraft.status === 'saved'
                  ? `Draft saved${authoringDraft.revision ? ` · revision ${authoringDraft.revision}` : ''}`
                  : null}
                {authoringDraft.status === 'unsaved' || authoringDraft.status === 'error'
                  ? 'Draft not saved'
                  : null}
                {authoringDraft.status === 'conflict'
                  ? 'Draft conflict · local copy preserved'
                  : null}
                {authoringDraft.status === 'source-mismatch'
                  ? 'Source changed · local copy preserved'
                  : null}
              </span>
            ) : null}
            {authoringDraft.status === 'error' ||
            authoringDraft.status === 'unsaved' ||
            authoringDraft.error ? (
              <Button size="xs" variant="outline" onClick={() => void authoringDraft.retry()}>
                Retry draft save
              </Button>
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Undo layer change"
              title="Undo (⌘Z)"
              disabled={saving || history.past.length === 0}
              onClick={() => moveHistory(undoLayerHistory)}
            >
              <Undo2 aria-hidden />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Redo layer change"
              title="Redo (⇧⌘Z)"
              disabled={saving || history.future.length === 0}
              onClick={() => moveHistory(redoLayerHistory)}
            >
              <Redo2 aria-hidden />
            </Button>
            <Button size="sm" variant="ghost" disabled={saving || !dirty} onClick={reset}>
              <RotateCcw data-icon="inline-start" aria-hidden /> Reset
            </Button>
          </div>
        </header>

        {workspaceSeed ? (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
            data-testid="hyperframes-seed-attached"
          >
            <p className="font-medium text-foreground">Private composition workspace attached</p>
            <p className="mt-1 text-muted-foreground">
              Editing this composition privately. Your original source and published versions stay
              intact.
            </p>
          </div>
        ) : hyperframesRevisionId ? (
          <div
            className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
            data-testid="hyperframes-seed-handoff"
          >
            <p className="font-medium text-foreground">
              HyperFrames composition ready for this source
            </p>
            <p className="mt-1 text-muted-foreground">
              Forge will privately stage and verify the composition package, then attach it as this
              workspace’s editable source. Nothing is published by this step.
            </p>
            {hasUnreconciledLocalCommands ? (
              <p className="mt-2 text-amber-700 dark:text-amber-300">
                Resolve the saved local recovery copies before attaching a different workspace
                package. They remain available in the recovery list below.
              </p>
            ) : authoringDraft.persistedDraft?.commands.length ? (
              <p className="mt-2 text-amber-700 dark:text-amber-300">
                Save or reset the existing private authoring commands before attaching the
                composition.
              </p>
            ) : null}
            {seedImportError ? (
              <p role="alert" className="mt-2 text-destructive">
                {seedImportError}
              </p>
            ) : null}
            <Button
              size="xs"
              className="mt-2"
              disabled={!canAttachHyperframesSeed}
              onClick={() => void attachHyperframesSeed()}
            >
              {seedImporting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden /> Preparing private workspace…
                </>
              ) : canBootstrapEmptyDraft ? (
                'Create private draft and import'
              ) : (
                'Import into this Forge workspace'
              )}
            </Button>
          </div>
        ) : null}

        {authoringDraft.serverDraft ? (
          <div role="alert" className="border-b border-border px-3 py-2 text-xs">
            <p className="text-destructive">
              {authoringDraft.serverDraft.requiresReconciliation
                ? `The pinned source changed. Current source: ${authoringDraft.serverDraft.currentSource.templateSourceVersionId ?? authoringDraft.serverDraft.currentSource.assetHeadVersionId ?? 'unavailable'}. Authoring is paused; both snapshots are preserved.`
                : 'A newer server draft exists. Both snapshots are preserved; review the differences before choosing one.'}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">
                Review changes in both copies
              </summary>
              <div className="mt-2 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Layer or setting</th>
                      <th className="px-2 py-1.5 font-medium">
                        This copy · rev {authoringDraft.revision}
                      </th>
                      <th className="px-2 py-1.5 font-medium">
                        Saved copy · rev {authoringDraft.serverDraft.revision}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftDifferences.map((difference, index) => (
                      <tr key={`${difference.label}:${index}`} className="border-t border-border">
                        <th className="px-2 py-1.5 font-medium">{difference.label}</th>
                        <td className="px-2 py-1.5 text-muted-foreground">{difference.local}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{difference.server}</td>
                      </tr>
                    ))}
                    {!draftDifferences.length ? (
                      <tr>
                        <td colSpan={3} className="px-2 py-2 text-muted-foreground">
                          Both copies contain the same changes.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </details>
            <Button
              size="xs"
              variant="outline"
              className="mt-2"
              onClick={() => void authoringDraft.adoptServerDraft()}
            >
              Use server draft · keep local recovery
            </Button>
          </div>
        ) : null}
        {authoringDraft.recoveries.length ? (
          <div className="border-b border-border px-3 py-2 text-xs">
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Browse saved recovery copies ({authoringDraft.recoveries.length})
              </summary>
              <ul className="mt-2 grid gap-2">
                {authoringDraft.recoveries.map((recovery) => (
                  <li
                    key={recovery.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                  >
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-muted-foreground">
                        {recovery.reason === 'conflict'
                          ? `Conflict copy · revision ${recovery.revision}${recovery.serverRevision === undefined ? '' : ` / saved ${recovery.serverRevision}`}`
                          : recovery.reason === 'source-change'
                            ? 'Previous source copy'
                            : 'Local recovery'}
                        {' · '}
                        {new Date(recovery.savedAt).toLocaleString()}
                        {' · source '}
                        {recovery.scope.baseVersionId.slice(0, 8)}
                      </summary>
                      <div className="mt-2 overflow-x-auto rounded-md border border-border">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-muted/60 text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1.5 font-medium">Layer or setting</th>
                              <th className="px-2 py-1.5 font-medium">Recovery copy</th>
                              <th className="px-2 py-1.5 font-medium">Saved baseline</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareTemplateDrafts(
                              recovery.commands,
                              recovery.serverCommands ?? recovery.persistedCommands,
                              authoringLayerNames,
                            ).map((difference, index) => (
                              <tr
                                key={`${difference.label}:${index}`}
                                className="border-t border-border"
                              >
                                <th className="px-2 py-1.5 font-medium">{difference.label}</th>
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  {difference.local}
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground">
                                  {difference.server}
                                </td>
                              </tr>
                            ))}
                            {!compareTemplateDrafts(
                              recovery.commands,
                              recovery.serverCommands ?? recovery.persistedCommands,
                              authoringLayerNames,
                            ).length ? (
                              <tr>
                                <td colSpan={3} className="px-2 py-2 text-muted-foreground">
                                  No changes in this copy.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </details>
                    {(() => {
                      const recoveryIdentity =
                        recovery.workspaceIdentity ??
                        templateAuthoringWorkspaceIdentity(undefined, recovery.sourceChecksum);
                      const matchesWorkspace =
                        !!currentWorkspaceIdentity && recoveryIdentity === currentWorkspaceIdentity;
                      return (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={
                            !!authoringDraft.serverDraft?.requiresReconciliation ||
                            !matchesWorkspace
                          }
                          onClick={() => void authoringDraft.restoreRecovery(recovery.id)}
                        >
                          {authoringDraft.serverDraft?.requiresReconciliation
                            ? 'Restore unavailable for changed source'
                            : !matchesWorkspace
                              ? 'Different workspace · preserved'
                              : 'Restore this copy'}
                        </Button>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : (
          authoringDraft.error?.split(' · ').map((message) => (
            <p
              key={message}
              role="alert"
              className="border-b border-border px-3 py-2 text-xs text-destructive"
            >
              {message}
            </p>
          ))
        )}
        {sourceChanged ? (
          <p
            role="status"
            className="border-b border-border px-3 py-2 text-xs text-muted-foreground"
          >
            The source version changed while this draft was open. Your edits stay pinned to the
            original version; save may report a conflict. Undo all edits or Reset to load the latest
            version.
          </p>
        ) : null}

        <ResizablePanelGroup
          orientation={wideWorkspace ? 'horizontal' : 'vertical'}
          className="min-h-0 flex-1 max-lg:min-h-[70rem]"
          aria-label="Authoring workspace panes"
        >
          <ResizablePanel
            id="forge-layers"
            defaultSize={wideWorkspace ? '18%' : '25%'}
            minSize={wideWorkspace ? 180 : 220}
            maxSize={wideWorkspace ? '35%' : '45%'}
          >
            <aside className="flex h-full min-h-0 flex-col" aria-label="Layer workspace">
              <div className="min-h-0 max-h-[55%] shrink overflow-y-auto flex flex-col gap-2 border-b border-border p-2">
                <Select
                  value={draftArtboardId ? `draft:${draftArtboardId}` : `aep:${shownComp ?? ''}`}
                  disabled={!inventoryData}
                  onValueChange={(value) => {
                    if (value.startsWith('draft:')) {
                      const artboardId = value.slice('draft:'.length);
                      const composition = authoringDocument?.compositions.find(
                        (item) => item.artboardId === artboardId,
                      );
                      setDraftArtboardId(artboardId);
                      setCompId(composition?.sourceCompId ?? null);
                      setSelected(firstEditable(composition?.nodeIds ?? []));
                    } else {
                      const nextCompId = Number(value.slice('aep:'.length));
                      setDraftArtboardId(null);
                      setCompId(nextCompId);
                      setSelected(firstEditable(nodeIdsForComp(nextCompId)));
                    }
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Composition" className="w-full min-w-0">
                    <SelectValue placeholder="Composition">
                      <span className="truncate">{compName ?? defaultComp?.name}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {authoringDocument?.compositions.map((composition) => (
                      <SelectItem
                        key={authoringCompositionKey(composition)}
                        value={authoringCompositionKey(composition)}
                      >
                        {composition.name ?? 'Untitled composition'}
                        {composition.artboardId ? ' · draft' : ''}
                      </SelectItem>
                    )) ??
                      inventoryData?.comps.map((c) => (
                        <SelectItem key={c.id} value={`aep:${c.id}`}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="Search layers"
                  placeholder="Search text or layer name"
                  className="h-8 text-xs"
                  disabled={!inventoryData}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {authoringDraft.sourceDocument ? (
                  <FieldSet className="flex-row items-center gap-1" aria-label="Create layer tools">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Add rectangle layer"
                      title="Add rectangle"
                      disabled={
                        busy ||
                        staleSource ||
                        !selectedAuthoringComposition ||
                        !!selectedAuthoringComposition.shapeCreationReason
                      }
                      onClick={() => createShape('rectangle')}
                    >
                      <RectangleHorizontal aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Add ellipse layer"
                      title="Add ellipse"
                      disabled={
                        busy ||
                        staleSource ||
                        !selectedAuthoringComposition ||
                        !!selectedAuthoringComposition.shapeCreationReason
                      }
                      onClick={() => createShape('ellipse')}
                    >
                      <Circle aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Add text layer tools"
                      title="Add text"
                      disabled={
                        busy ||
                        staleSource ||
                        !selectedAuthoringComposition ||
                        !!selectedAuthoringComposition.creationReason
                      }
                      onClick={() => {
                        setCreationToolsOpen(true);
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLInputElement>(
                              '[aria-label="New text layer content"]',
                            )
                            ?.focus(),
                        );
                      }}
                    >
                      <Type aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Add Library image"
                      title="Add image from Library"
                      disabled={
                        busy ||
                        staleSource ||
                        !selectedAuthoringComposition ||
                        !!selectedAuthoringComposition.creationReason
                      }
                      onClick={() => {
                        setCreationToolsOpen(true);
                        openArtworkCreation();
                      }}
                    >
                      <ImageIcon aria-hidden />
                    </Button>
                  </FieldSet>
                ) : null}
                {authoringDraft.sourceDocument ? (
                  <>
                    <Collapsible open={creationToolsOpen} onOpenChange={setCreationToolsOpen}>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium hover:bg-accent">
                        Create and artboard tools
                        <ChevronDown
                          className={`size-3 transition-transform ${creationToolsOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="flex flex-col gap-2 border-t border-border p-2">
                        <p className="text-2xs font-medium text-muted-foreground">
                          Draft artboards
                        </p>
                        <Input
                          aria-label="New artboard name"
                          className="h-8 text-xs"
                          maxLength={180}
                          value={newArtboardName}
                          onChange={(event) => setNewArtboardName(event.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              busy ||
                              staleSource ||
                              selectedAuthoringComposition?.artboardReason !== null
                            }
                            onClick={createArtboard}
                          >
                            <Plus aria-hidden /> Add artboard
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              busy ||
                              staleSource ||
                              selectedAuthoringComposition?.artboardReason !== null ||
                              !(
                                selectedAuthoringComposition?.artboardId ||
                                selectedAuthoringComposition?.compId !== null
                              )
                            }
                            onClick={duplicateArtboard}
                          >
                            <Copy aria-hidden /> Duplicate
                          </Button>
                        </div>
                        <p className="text-2xs font-medium text-muted-foreground">
                          Composition size
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            aria-label="Composition width"
                            inputMode="numeric"
                            type="number"
                            min={4}
                            max={30_000}
                            step={1}
                            className="h-8 text-xs"
                            value={artboardWidth}
                            disabled={
                              busy ||
                              staleSource ||
                              selectedAuthoringComposition?.artboardReason !== null
                            }
                            onChange={(event) => setArtboardWidth(event.target.value)}
                          />
                          <Input
                            aria-label="Composition height"
                            inputMode="numeric"
                            type="number"
                            min={4}
                            max={30_000}
                            step={1}
                            className="h-8 text-xs"
                            value={artboardHeight}
                            disabled={
                              busy ||
                              staleSource ||
                              selectedAuthoringComposition?.artboardReason !== null
                            }
                            onChange={(event) => setArtboardHeight(event.target.value)}
                          />
                        </div>
                        {selectedAuthoringComposition?.artboardReason === null ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              busy ||
                              staleSource ||
                              !Number.isInteger(Number(artboardWidth)) ||
                              !Number.isInteger(Number(artboardHeight)) ||
                              Number(artboardWidth) < 4 ||
                              Number(artboardHeight) < 4 ||
                              Number(artboardWidth) > 30_000 ||
                              Number(artboardHeight) > 30_000 ||
                              (Number(artboardWidth) === selectedAuthoringComposition.width &&
                                Number(artboardHeight) === selectedAuthoringComposition.height)
                            }
                            onClick={resizeArtboard}
                          >
                            Apply composition size
                          </Button>
                        ) : (
                          <p className="text-2xs text-muted-foreground">
                            {artboardLockCopy(selectedAuthoringComposition?.artboardReason)}
                          </p>
                        )}
                        <p className="text-2xs font-medium text-muted-foreground">Add shape</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              busy ||
                              staleSource ||
                              !!selectedAuthoringComposition?.shapeCreationReason
                            }
                            onClick={() => createShape('rectangle')}
                          >
                            Rectangle
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={
                              busy ||
                              staleSource ||
                              !!selectedAuthoringComposition?.shapeCreationReason
                            }
                            onClick={() => createShape('ellipse')}
                          >
                            Ellipse
                          </Button>
                        </div>
                        {selectedAuthoringComposition?.shapeCreationReason ? (
                          <p className="text-2xs text-muted-foreground">
                            {selectedAuthoringComposition.shapeCreationReason}
                          </p>
                        ) : null}
                        <p className="text-2xs font-medium text-muted-foreground">Add image</p>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={
                            busy ||
                            staleSource ||
                            !selectedAuthoringComposition ||
                            selectedAuthoringComposition.creationReason !== null
                          }
                          onClick={openArtworkCreation}
                        >
                          <Plus aria-hidden /> Choose from Library
                        </Button>
                        <p className="text-2xs font-medium text-muted-foreground">Add text</p>
                        <Input
                          aria-label="New text layer content"
                          className="h-8 text-xs"
                          placeholder="Text to add"
                          value={newText}
                          onChange={(event) => setNewText(event.target.value)}
                        />
                        <Select
                          value={fontChoice ? authoringFontChoiceKey(fontChoice) : ''}
                          onValueChange={setFontChoiceId}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label="Authorized text font"
                            className="w-full"
                          >
                            <SelectValue placeholder="Choose an authorized font">
                              {fontChoice?.postScriptName}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {fontChoices.map((font) => (
                              <SelectItem
                                key={authoringFontChoiceKey(font)}
                                value={authoringFontChoiceKey(font)}
                              >
                                {font.postScriptName} · {font.scope}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p role="status" className="text-2xs text-muted-foreground">
                          {fontPreview === 'loading' ? 'Verifying authorized font…' : null}
                          {fontPreview === 'ready' ? 'Exact font verified for preview.' : null}
                          {fontPreview === 'error' ? (
                            <>
                              <span>This font could not be verified.</span>{' '}
                              <button
                                type="button"
                                className="underline"
                                onClick={() => setFontRetry((attempt) => attempt + 1)}
                              >
                                Retry
                              </button>
                            </>
                          ) : null}
                          {fontPreview === 'idle' && !fontChoice
                            ? 'No authorized font is available for new text.'
                            : null}
                        </p>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={
                            busy ||
                            staleSource ||
                            !newText.trim() ||
                            fontPreview !== 'ready' ||
                            !fontChoice ||
                            !!selectedAuthoringComposition?.creationReason
                          }
                          onClick={createText}
                        >
                          <Plus aria-hidden /> Add text layer
                        </Button>
                        {selectedAuthoringComposition?.creationReason ? (
                          <p className="text-2xs text-muted-foreground">
                            {selectedAuthoringComposition.creationReason}
                          </p>
                        ) : null}
                      </CollapsibleContent>
                    </Collapsible>
                    <LibraryMediaPickerDialog
                      brandId={brandId}
                      excludeAssetIds={[]}
                      accept="image"
                      open={artworkPickerOpen}
                      onOpenChange={(open) => {
                        setArtworkPickerOpen(open);
                        if (!open) setRepairFootageItemId(null);
                      }}
                      copy={{
                        title: 'Add Library image',
                        description:
                          repairFootageItemId === null
                            ? 'Choose a PNG or JPEG version already in this brand Library. The selected version stays pinned in this draft.'
                            : 'Choose a verified Library image with the exact format and dimensions required by this package dependency.',
                        confirm: repairFootageItemId === null ? 'Add image' : 'Relink dependency',
                      }}
                      onPickAssets={handleLibraryAssetPick}
                    />
                  </>
                ) : null}
                {selectedNode ? (
                  <div className="flex gap-1">
                    {selectedNode.kind === 'group' ? (
                      <Button
                        size="xs"
                        variant="outline"
                        className="flex-1"
                        disabled={busy || staleSource || !canUngroupSelected}
                        title={
                          selectedGroupHasMotion && !canUngroupAnimatedSelected
                            ? 'Ungroup requires a static group and supported direct-child motion; unsupported or nested animation stays locked.'
                            : canUngroupSelected
                              ? undefined
                              : 'Ungroup needs a verified generated group in this draft with supported 2D transforms.'
                        }
                        onClick={ungroupSelected}
                      >
                        Ungroup
                      </Button>
                    ) : null}
                    <Button
                      size="xs"
                      variant="outline"
                      className="flex-1"
                      disabled={busy || staleSource || !!selectedNode.duplicateReason}
                      title={selectedNode.duplicateReason ?? undefined}
                      onClick={duplicateSelected}
                    >
                      <Copy aria-hidden /> Duplicate
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      className="flex-1"
                      disabled={busy || staleSource || !!selectedNode.deleteReason}
                      title={selectedNode.deleteReason ?? undefined}
                      onClick={deleteSelected}
                    >
                      <Trash2 aria-hidden /> Delete
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="max-h-72 min-h-24 flex-1 overflow-y-auto p-1 lg:max-h-none">
                {rows.some((row) => row.groupable) ? (
                  <div className="flex items-center justify-between gap-2 px-1 pb-1">
                    <span className="text-2xs text-muted-foreground">
                      {groupSelectionIds.length
                        ? `${groupSelectionIds.length} group members selected`
                        : 'Select eligible layers to group'}
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy || staleSource || !groupSelectionReady}
                      onClick={createGroup}
                    >
                      <Layers aria-hidden /> Group
                    </Button>
                  </div>
                ) : null}
                {inventoryData ? (
                  <TemplateLayerList
                    label="Layers"
                    rows={rows}
                    selectedId={selectedId}
                    groupSelectionIds={groupSelectionIds}
                    onToggleGroupSelection={(id) =>
                      setGroupSelectionIds((current) =>
                        current.includes(String(id))
                          ? current.filter((selectedId) => selectedId !== String(id))
                          : [...current, String(id)],
                      )
                    }
                    onSelect={selectLayer}
                    onReorder={
                      query ||
                      (selectedAuthoringComposition?.orderReason ?? comp?.orderReason) ||
                      staleSource
                        ? undefined
                        : reorder
                    }
                    onToggleVisible={(id) => {
                      const node = authoringNodes.get(String(id));
                      const target = node?.sourceRef
                        ? byNodeId.get(`aep:${node.sourceRef.compId}:${node.sourceRef.layerId}`)
                        : byNodeId.get(String(id));
                      if (target) {
                        editLayer(target, {
                          visible: !(edits[layerKey(target)]?.visible ?? target.visible),
                        });
                      } else if (
                        node?.nodeId.startsWith('draft:') &&
                        node.capabilities.visibility &&
                        !node.visibilityReason
                      ) {
                        recordAuthoringCommand({
                          type: 'layer.edit',
                          nodeId: node.nodeId,
                          edit: { visible: !node.visible },
                        });
                      }
                    }}
                  />
                ) : inventoryIsError ? (
                  <div
                    role="alert"
                    className="flex flex-col items-start gap-2 p-2 text-xs text-destructive"
                  >
                    {inventoryError?.message}
                    <Button size="xs" variant="outline" onClick={() => void inventoryRefetch()}>
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div
                    role="status"
                    aria-label="Reading template layers…"
                    className="flex flex-col gap-1 p-1"
                  >
                    {Array.from({ length: Math.min(placeholderRows, 12) }, (_, i) => (
                      <Skeleton key={i} className="h-7 w-full" />
                    ))}
                  </div>
                )}
              </div>
              {comp?.orderReason || query ? (
                <p className="border-t border-border p-2 text-2xs text-muted-foreground">
                  {query ? 'Clear the search to re-order layers.' : comp?.orderReason}
                </p>
              ) : null}
            </aside>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize layer pane" />
          <ResizablePanel
            id="forge-canvas"
            defaultSize={wideWorkspace ? '60%' : '45%'}
            minSize={wideWorkspace ? 280 : 320}
          >
            <div className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/40">
              <SectionHeader
                title={compName ?? defaultComp?.name ?? 'Composition'}
                action={
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Canvas shortcuts"
                          title="Canvas shortcuts"
                        />
                      }
                    >
                      <CircleHelp aria-hidden />
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="end" className="w-80">
                      <h3 className="text-sm font-semibold">Canvas shortcuts</h3>
                      <ul className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
                        <li>Select a layer; hold Shift to select several.</li>
                        <li>Drag to move. Arrow keys nudge; Shift moves 10 px.</li>
                        <li>Hold Space and drag to pan. Wheel or plus/minus zooms.</li>
                        <li>Shift+2 frames the selection; 0 fits the artboard.</li>
                        <li>Ctrl/Cmd+D duplicates; Delete removes an eligible layer.</li>
                        <li>Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</li>
                      </ul>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Edits save privately. Publishing requires verification and your review.
                      </p>
                    </PopoverContent>
                  </Popover>
                }
                meta={
                  <span
                    className="max-w-40 truncate text-2xs text-muted-foreground"
                    title={selectedNode?.name ?? layer?.name}
                  >
                    {selectedNode || layer
                      ? `Selected: ${selectedNode?.name ?? selectedNode?.textContent ?? layer?.name ?? 'Layer'}`
                      : 'Select a layer'}
                  </span>
                }
              />
              <ResizablePanelGroup
                orientation="vertical"
                className="min-h-0 flex-1"
                aria-label="Canvas and timeline panes"
              >
                <ResizablePanel id="forge-artboard" defaultSize="70%" minSize={100}>
                  <div className="relative flex h-full min-h-0 items-center justify-center p-2">
                    {markup ? (
                      <TemplateLayerPreview
                        markup={markup}
                        controls={
                          layer?.compId === previewCompId ? inspectorFor(layer, 'preview') : null
                        }
                        previewEdits={previewEdits}
                        layers={layers}
                        compId={previewCompId}
                        authoredNodes={authoringDocument?.nodes ?? []}
                        authoredRenderNodes={authoredRenderNodes}
                        authoredNodeIds={
                          selectedAuthoringComposition?.nodeIds ??
                          authoringDocument?.compositions.find(
                            (composition) => composition.compId === previewCompId,
                          )?.nodeIds ??
                          []
                        }
                        sourceChecksum={authoringDraft.sourceDocument?.sourceChecksum ?? null}
                        artboard={previewArtboard}
                        artworkPreviewUrls={artworkPreviewUrls}
                        removedSourceNodeIds={removedSourceNodeIds}
                        selectedNodeId={selectedId}
                        onSelectNode={selectLayer}
                        onAuthoredGestureCommit={(nodeId, edit) => {
                          const node = authoringNodes.get(nodeId);
                          if (
                            !node?.capabilities.transform ||
                            node.transformLocks.position ||
                            node.sourceRef
                          )
                            return;
                          if (node.kind === 'group') {
                            editGeneratedGroup(node, edit);
                            return;
                          }
                          recordAuthoringCommand({ type: 'layer.edit', nodeId, edit });
                        }}
                        onDuplicateNode={
                          selectedNode && !selectedNode.duplicateReason && !staleSource
                            ? duplicateSelected
                            : undefined
                        }
                        onDeleteNode={
                          selectedNode && !selectedNode.deleteReason && !staleSource
                            ? deleteSelected
                            : undefined
                        }
                        layer={
                          previewCompId !== null && layer?.compId === previewCompId
                            ? layer
                            : undefined
                        }
                        edit={layer ? edits[layerKey(layer)] : undefined}
                        edits={edits}
                        fonts={fonts.data ?? []}
                        disabled={staleSource}
                        onSelect={selectLayer}
                        onGestureCommit={({ edits: gestureEdits, selectionIds, group }) => {
                          let snapshot = historyRef.current.present;
                          for (const gestureEdit of gestureEdits) {
                            const target = layers.find(
                              (candidate) =>
                                candidate.compId === gestureEdit.compId &&
                                candidate.layerId === gestureEdit.layerId,
                            );
                            if (!target) continue;
                            const { compId: _compId, layerId: _layerId, ...change } = gestureEdit;
                            const nextEdits = applyLayerChange(
                              snapshot.edits,
                              layers,
                              target,
                              change,
                            );
                            snapshot = appendLayerDraftCommand(
                              { ...snapshot, edits: nextEdits },
                              {
                                type: 'layer.edit',
                                nodeId: `aep:${target.compId}:${target.layerId}`,
                                edit: gestureEdit,
                              },
                            );
                          }
                          pushSnapshot(snapshot, group);
                          const firstSelected = selectionIds.find((id) =>
                            byNodeId.has(`aep:${previewCompId}:${id}`),
                          );
                          if (firstSelected !== undefined) selectLayer(firstSelected);
                          setTimeout(() => void flushDraftRef.current(), 0);
                        }}
                        onEdit={(target, change, group, end) => {
                          if (Object.keys(change).length > 0)
                            editAndPersistGesture(target, change, group ?? null);
                          if (end) closeHistoryGroup();
                        }}
                      />
                    ) : parse && defaultComp ? (
                      <TemplateWireframe
                        brandId={brandId}
                        templateKey={null}
                        parse={parse}
                        comp={defaultComp.name}
                        className="size-full animate-pulse rounded-md"
                      />
                    ) : (
                      <Skeleton className="size-full" />
                    )}
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle aria-label="Resize timeline pane" />
                <ResizablePanel
                  id="forge-timeline"
                  panelRef={timelinePanel}
                  defaultSize="35%"
                  minSize={140}
                  maxSize="75%"
                >
                  <div className="h-full overflow-y-auto">
                    <TemplateLayerTimeline
                      compact
                      onMotionOpenChange={(open) => {
                        if (open) {
                          previousTimelineSize.current =
                            timelinePanel.current?.getSize().asPercentage ?? null;
                          timelinePanel.current?.resize('70%');
                        } else if (previousTimelineSize.current !== null) {
                          timelinePanel.current?.resize(`${previousTimelineSize.current}%`);
                          previousTimelineSize.current = null;
                        }
                      }}
                      node={selectedNode ?? null}
                      durationSec={selectedAuthoringComposition?.durationSec ?? null}
                      compositionFrameRate={selectedAuthoringComposition?.frameRate ?? null}
                      playheadSec={playheadSec}
                      onPlayheadChange={onPlayheadChange}
                      disabled={busy || staleSource}
                      groupMotionVerified={
                        generatedGroupMotionReadbackVerified || verifiedSourceGroupMotion
                      }
                      onCommand={recordAuthoringCommand}
                    />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
              <p id="template-preview-help" className="sr-only">
                Click a layer for controls. Drag to move; arrow keys nudge, Shift moves 10 px. Edits
                save privately as you work; version saving stays locked until verification and
                review.
              </p>
              {sceneIsError || compositionError || shownScene?.warnings.length ? (
                <div className="max-h-24 overflow-y-auto border-t border-border px-3 py-2">
                  {sceneIsError || compositionError ? (
                    <div className="flex items-center justify-between gap-2">
                      <p role="alert" className="text-xs text-destructive">
                        {(compositionError ? composed.error : sceneError)?.message}
                      </p>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={previewing}
                        onClick={() =>
                          void (compositionError
                            ? composed.refetch()
                            : workspaceSeed
                              ? workspacePreview.refetch()
                              : baseScene.refetch())
                        }
                      >
                        Retry preview
                      </Button>
                    </div>
                  ) : null}
                  {shownScene?.warnings.map((w) => (
                    <p key={w} className="text-2xs text-muted-foreground">
                      {w}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle aria-label="Resize properties pane" />
          <ResizablePanel
            id="forge-properties"
            defaultSize={wideWorkspace ? '22%' : '30%'}
            minSize={wideWorkspace ? 220 : 260}
            maxSize={wideWorkspace ? '40%' : '55%'}
          >
            <aside
              className="h-full min-h-0 overflow-y-auto p-3"
              aria-label="Properties and repair"
            >
              {hasUncompiledLifecycle ? (
                <Collapsible
                  open={preparationDetailsOpen}
                  onOpenChange={setPreparationDetailsOpen}
                  className="mb-3 border-b border-border pb-3"
                >
                  <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs font-medium text-foreground">
                    Repair and checks
                    <ChevronDown
                      className={`size-3 transition-transform ${preparationDetailsOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="flex flex-col gap-2 pt-2">
                    <div ref={repairPanel}>
                      <TemplateAuthoringPreparationPanel
                        workflow={authoringLifecycle}
                        syncStatus={authoringDraft.status}
                        draftDirty={authoringDraft.dirty}
                        draftRevision={authoringDraft.revision}
                        onOpenFontRepair={onOpenFontRepair}
                        dependencies={authoringDocument?.dependencies ?? []}
                        reviewInVersionAction
                        authoringDocument={authoringDocument}
                        onInspectComposition={(nextCompId) => {
                          const composition = authoringDocument?.compositions.find(
                            (item) => item.compId === nextCompId,
                          );
                          if (!composition) return;
                          setDraftArtboardId(null);
                          setCompId(nextCompId);
                          setSelected(firstEditable(composition.nodeIds));
                          setCreationToolsOpen(true);
                        }}
                        onRelinkDependency={openDependencyRepair}
                      />
                      {artworkMessage ? (
                        <p role="status" className="mt-2 text-2xs text-muted-foreground">
                          {artworkMessage}
                          {artworkRetryFootageItemId !== null ||
                          (!artworkMessage
                            .toLowerCase()
                            .includes('package dependency is no longer available') &&
                            (artworkMessage.toLowerCase().includes('unavailable') ||
                              artworkMessage.toLowerCase().includes('could not'))) ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                className="underline"
                                onClick={() => {
                                  if (artworkRetryFootageItemId !== null) {
                                    openDependencyRepair(artworkRetryFootageItemId, true);
                                  } else if (
                                    authoringDocument?.nodes.some(
                                      (node) => node.kind === 'artwork' && node.artworkAssetRef,
                                    )
                                  ) {
                                    setArtworkRetry((attempt) => attempt + 1);
                                  } else {
                                    openArtworkCreation();
                                  }
                                }}
                              >
                                {artworkRetryFootageItemId === null &&
                                authoringDocument?.nodes.some(
                                  (node) => node.kind === 'artwork' && node.artworkAssetRef,
                                )
                                  ? 'Retry pinned preview'
                                  : 'Choose image again'}
                              </button>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              {layer ? (
                <>
                  {inspectorFor(layer, 'inspector')}
                  {selectedNode?.capabilities.text ? (
                    <label
                      htmlFor="layer-text-content"
                      className="mt-3 flex flex-col gap-1 text-2xs text-muted-foreground"
                    >
                      Text content
                      <Input
                        id="layer-text-content"
                        aria-label="Layer text content"
                        maxLength={20000}
                        className="text-xs text-foreground"
                        value={selectedNode.textContent ?? ''}
                        disabled={!authoringDraft.ready || staleSource}
                        onChange={(event) =>
                          editAuthoredNode(
                            selectedNode,
                            { text: event.target.value },
                            `text:${selectedNode.nodeId}`,
                            false,
                          )
                        }
                        onBlur={closeHistoryGroup}
                      />
                    </label>
                  ) : null}
                  {selectedNode ? (
                    <TemplateLayerMaskCreator
                      node={selectedNode}
                      sourceChecksum={authoringDraft.sourceDocument?.sourceChecksum ?? null}
                      disabled={!authoringDraft.ready || staleSource}
                      onCreate={createMask}
                    />
                  ) : null}
                  {selectedNode ? (
                    <TemplateLayerAuthoredMasks
                      nodeId={selectedNode.nodeId}
                      masks={selectedNode.masks ?? []}
                      authoredMaskIds={authoredMaskIdsByNode.get(selectedNode.nodeId) ?? new Set()}
                      geometry={
                        selectedNode.maskSourceGeometry?.status === 'verified'
                          ? selectedNode.maskSourceGeometry
                          : null
                      }
                      disabled={!authoringDraft.ready || staleSource}
                      mutationsAvailable={maskMutationWriterProof}
                      onUpdate={updateAuthoredMask}
                      onDelete={deleteAuthoredMask}
                    />
                  ) : null}
                </>
              ) : selectedNode?.nodeId.startsWith('draft:') ? (
                <div className="flex flex-col gap-4">
                  <section
                    className="flex flex-col gap-2"
                    aria-label={`Authored ${selectedNode.kind} layer`}
                  >
                    <h4 className="text-xs font-medium text-foreground">
                      {`Authored ${selectedNode.kind}`}
                    </h4>
                    <p className="text-sm font-medium">{selectedNode.name ?? 'New layer'}</p>
                    {selectedNode.kind === 'shape' && selectedNode.shape && selectedNode.size ? (
                      <p className="text-2xs text-muted-foreground">
                        {selectedNode.shape === 'rectangle' ? 'Rectangle' : 'Ellipse'} ·{' '}
                        {selectedNode.size[0]} × {selectedNode.size[1]} px
                      </p>
                    ) : null}
                    {selectedNode.textContent !== null ? (
                      <p className="break-words text-xs text-muted-foreground">
                        {selectedNode.textContent}
                      </p>
                    ) : null}
                    {selectedNode.kind === 'text' && selectedNode.textReason ? (
                      <p className="text-2xs text-muted-foreground">{selectedNode.textReason}</p>
                    ) : null}
                    {selectedNode.capabilities.text ? (
                      <label
                        htmlFor="draft-text-content"
                        className="flex flex-col gap-1 text-2xs text-muted-foreground"
                      >
                        Text content
                        <Input
                          id="draft-text-content"
                          aria-label="Draft text content"
                          maxLength={20000}
                          className="text-xs text-foreground"
                          value={selectedNode.textContent ?? ''}
                          disabled={!authoringDraft.ready || staleSource}
                          onChange={(event) =>
                            editAuthoredNode(
                              selectedNode,
                              { text: event.target.value },
                              `text:${selectedNode.nodeId}`,
                              false,
                            )
                          }
                          onBlur={closeHistoryGroup}
                        />
                      </label>
                    ) : null}
                  </section>
                  {selectedNode.capabilities.transform ||
                  (selectedNode.kind === 'group' &&
                    (canMutateSelectedGroup || selectedGroupHasMotion)) ? (
                    <section className="grid grid-cols-2 gap-2" aria-label="Draft layer transform">
                      {(['X', 'Y'] as const).map((axis, index) => (
                        <NumberScrubField
                          key={axis}
                          label={`${axis} position`}
                          ariaLabel={`${axis} position`}
                          suffix="px"
                          value={selectedNode.position?.[index] ?? 0}
                          disabled={
                            !authoringDraft.ready ||
                            staleSource ||
                            (!!selectedNode.transformLocks.position && !canMutateSelectedGroup) ||
                            (selectedNode.kind === 'group' && !canMutateSelectedGroup)
                          }
                          onChange={(value) =>
                            editAuthoredNode(
                              selectedNode,
                              {
                                position:
                                  index === 0
                                    ? [value, selectedNode.position?.[1] ?? 0]
                                    : [selectedNode.position?.[0] ?? 0, value],
                              },
                              `number:${selectedNode.nodeId}:position:${axis}`,
                              false,
                            )
                          }
                          onCommit={closeHistoryGroup}
                        />
                      ))}
                      {selectedNode.transformLocks.position ? (
                        <p className="col-span-2 text-2xs text-muted-foreground">
                          {selectedNode.transformLocks.position}
                        </p>
                      ) : null}
                      {selectedNode.kind !== 'group' ? (
                        <>
                          <NumberScrubField
                            label="Rotation"
                            ariaLabel="Draft rotation"
                            suffix="°"
                            step={0.1}
                            min={-36_000}
                            max={36_000}
                            value={selectedNode.rotation ?? 0}
                            disabled={
                              !authoringDraft.ready ||
                              staleSource ||
                              !!selectedNode.transformLocks.rotation
                            }
                            onChange={(value) =>
                              editAuthoredNode(
                                selectedNode,
                                { rotation: value },
                                `number:${selectedNode.nodeId}:rotation`,
                                false,
                              )
                            }
                            onCommit={closeHistoryGroup}
                          />
                          <NumberScrubField
                            label="Opacity"
                            ariaLabel="Draft opacity"
                            suffix="%"
                            min={0}
                            max={100}
                            value={selectedNode.opacity ?? 100}
                            disabled={
                              !authoringDraft.ready ||
                              staleSource ||
                              !!selectedNode.transformLocks.opacity
                            }
                            onChange={(value) =>
                              editAuthoredNode(
                                selectedNode,
                                { opacity: value },
                                `number:${selectedNode.nodeId}:opacity`,
                                false,
                              )
                            }
                            onCommit={closeHistoryGroup}
                          />
                          {(['X', 'Y'] as const).map((axis, index) => (
                            <NumberScrubField
                              key={axis}
                              label={`Scale ${axis}`}
                              ariaLabel={`Draft scale ${axis}`}
                              suffix="%"
                              step={0.1}
                              min={0.01}
                              max={10_000}
                              value={selectedNode.scale?.[index] ?? 100}
                              disabled={
                                !authoringDraft.ready ||
                                staleSource ||
                                !!selectedNode.transformLocks.scale
                              }
                              onChange={(value) =>
                                editAuthoredNode(
                                  selectedNode,
                                  {
                                    scale:
                                      index === 0
                                        ? [value, selectedNode.scale?.[1] ?? 100]
                                        : [selectedNode.scale?.[0] ?? 100, value],
                                  },
                                  `number:${selectedNode.nodeId}:scale:${axis}`,
                                  false,
                                )
                              }
                              onCommit={closeHistoryGroup}
                            />
                          ))}
                        </>
                      ) : null}
                      {selectedNode.kind === 'group' ? (
                        <>
                          {!canMutateSelectedGroup ? (
                            <p className="col-span-2 text-2xs text-muted-foreground">
                              {selectedGroupHasMotion
                                ? canUngroupSelected
                                  ? 'Group transform controls stay locked while this group contains motion. Ungroup can bake only a constant translation into supported direct-child tracks.'
                                  : 'Static group edits and ungroup are locked while unsupported or nested motion must stay intact.'
                                : 'Group transforms and ungroup stay locked until native writer readback verifies this group structure.'}
                            </p>
                          ) : null}
                          <NumberScrubField
                            label="Group rotation"
                            ariaLabel="Group rotation"
                            suffix="°"
                            step={0.1}
                            min={-36_000}
                            max={36_000}
                            className="col-span-2"
                            value={selectedNode.rotation ?? 0}
                            disabled={
                              !authoringDraft.ready || staleSource || !canMutateSelectedGroup
                            }
                            onChange={(value) =>
                              editGeneratedGroup(
                                selectedNode,
                                { rotation: value },
                                `number:${selectedNode.nodeId}:rotation`,
                                false,
                              )
                            }
                            onCommit={closeHistoryGroup}
                          />
                          {(['X', 'Y'] as const).map((axis, index) => (
                            <NumberScrubField
                              key={axis}
                              label={`Group scale ${axis}`}
                              ariaLabel={`Group scale ${axis}`}
                              suffix="%"
                              step={0.1}
                              min={0.01}
                              max={10_000}
                              value={selectedNode.scale?.[index] ?? 100}
                              disabled={
                                !authoringDraft.ready || staleSource || !canMutateSelectedGroup
                              }
                              onChange={(value) =>
                                editGeneratedGroup(
                                  selectedNode,
                                  {
                                    scale:
                                      index === 0
                                        ? [value, selectedNode.scale?.[1] ?? 100]
                                        : [selectedNode.scale?.[0] ?? 100, value],
                                  },
                                  `number:${selectedNode.nodeId}:scale:${axis}`,
                                  false,
                                )
                              }
                              onCommit={closeHistoryGroup}
                            />
                          ))}
                        </>
                      ) : null}
                    </section>
                  ) : null}
                  {selectedNode.sourceRef ? (
                    <TemplateLayerMaskCreator
                      node={selectedNode}
                      sourceChecksum={authoringDraft.sourceDocument?.sourceChecksum ?? null}
                      disabled={!authoringDraft.ready || staleSource}
                      onCreate={createMask}
                    />
                  ) : null}
                  {selectedNode.sourceRef ? (
                    <TemplateLayerAuthoredMasks
                      nodeId={selectedNode.nodeId}
                      masks={selectedNode.masks ?? []}
                      authoredMaskIds={authoredMaskIdsByNode.get(selectedNode.nodeId) ?? new Set()}
                      geometry={
                        selectedNode.maskSourceGeometry?.status === 'verified'
                          ? selectedNode.maskSourceGeometry
                          : null
                      }
                      disabled={!authoringDraft.ready || staleSource}
                      mutationsAvailable={maskMutationWriterProof}
                      onUpdate={updateAuthoredMask}
                      onDelete={deleteAuthoredMask}
                    />
                  ) : null}
                  {selectedNode.capabilities.font ? (
                    <label
                      htmlFor="draft-text-size"
                      className="flex flex-col gap-1 text-2xs text-muted-foreground"
                    >
                      Text size
                      <Input
                        id="draft-text-size"
                        type="number"
                        min={1}
                        max={1000}
                        className="h-8 text-xs text-foreground"
                        aria-label="Draft text size"
                        value={selectedNode.fontSize ?? 48}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isFinite(value))
                            editAuthoredNode(selectedNode, { fontSize: value });
                        }}
                      />
                    </label>
                  ) : null}
                  {!selectedNode.capabilities.transform && !selectedNode.capabilities.font ? (
                    <p className="text-xs text-muted-foreground">
                      Controls become available after the server confirms writer support.
                    </p>
                  ) : null}
                </div>
              ) : inventoryData ? (
                <p className="text-xs text-muted-foreground">Select a layer to edit it.</p>
              ) : (
                <div className="flex flex-col gap-3" aria-hidden>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-44" />
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-11" />
                    ))}
                  </div>
                </div>
              )}
              {fonts.isError ? (
                <p role="alert" className="mt-3 text-xs text-destructive">
                  Available font faces could not be loaded.
                </p>
              ) : null}
              {templateKey ? (
                <TemplateColourFields
                  brandId={brandId}
                  assetId={assetId}
                  templateKey={templateKey}
                />
              ) : null}
              <Collapsible
                open={fieldsOpen}
                onOpenChange={setFieldsOpen}
                className="mt-5 border-t border-border pt-3"
              >
                <CollapsibleTrigger className="group flex w-full items-center justify-between text-xs font-medium text-foreground">
                  Fields each render row asks for
                  <ChevronDown
                    className="size-3 transition-transform group-data-[panel-open]:rotate-180"
                    aria-hidden
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-2 pt-2">
                  {fields.isPending ? <Skeleton className="h-16 w-full" /> : null}
                  {fields.isError ? (
                    <p role="alert" className="text-xs text-destructive">
                      Template fields could not be loaded.
                    </p>
                  ) : null}
                  {fields.data?.variables.map((field) => (
                    <label
                      key={field.key}
                      htmlFor={`expose-${field.key}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Checkbox
                        id={`expose-${field.key}`}
                        disabled={field.reserved || !authoringDraft.ready || staleSource}
                        checked={exposures[field.key] ?? field.exposed ?? true}
                        onCheckedChange={(exposed) => {
                          const next = { ...historyRef.current.present.exposures };
                          if (exposed === (field.exposed ?? true)) delete next[field.key];
                          else next[field.key] = exposed;
                          let snapshot = { ...historyRef.current.present, exposures: next };
                          snapshot = appendLayerDraftCommand(snapshot, {
                            type: 'exposure.set',
                            slotKey: field.key,
                            exposed,
                          });
                          pushSnapshot(snapshot);
                          setTimeout(() => void flushDraftRef.current(), 0);
                        }}
                      />
                      <span className="min-w-0 truncate">
                        {field.label} <span className="text-muted-foreground">· {field.kind}</span>
                      </span>
                    </label>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <footer className="flex flex-col gap-2 border-t border-border px-3 py-2">
          {hasUncompiledLifecycle ? (
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0" role="status" aria-live="polite">
                <p className="text-xs font-medium text-foreground">
                  {preparationSummary.label}
                  {authoringLifecycle.artifact ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · revision {authoringLifecycle.artifact.draftRevision}
                    </span>
                  ) : null}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={preparationSummary.detail}
                >
                  {preparationSummary.detail}
                </p>
              </div>
              {preparationSummary.action === 'fonts' && onOpenFontRepair ? (
                <Button size="xs" variant="outline" onClick={onOpenFontRepair}>
                  Resolve fonts
                </Button>
              ) : preparationSummary.action === 'save' && authoringDraft.status === 'error' ? (
                <Button size="xs" variant="outline" onClick={() => void authoringDraft.retry()}>
                  Retry draft save
                </Button>
              ) : preparationSummary.action === 'checks' ? (
                <Button size="xs" variant="outline" onClick={showRepair}>
                  {preparationSummary.label.includes('Artwork')
                    ? 'Relink artwork'
                    : preparationSummary.label.includes('format')
                      ? 'Review format checks'
                      : 'Review checks'}
                </Button>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="shrink-0"
                onClick={() => setPreparationDetailsOpen((open) => !open)}
              >
                {preparationDetailsOpen ? 'Hide preparation details' : 'Show preparation details'}
              </Button>
            </div>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save('new_variant');
            }}
            className="flex flex-wrap items-start gap-2"
          >
            <div className="min-w-48 flex-1 flex flex-col gap-1">
              <Input
                aria-label="Variant name"
                className="h-8 text-xs"
                disabled={saving}
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>
            {onVariant ? (
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  !lineage ||
                  !dirty ||
                  (hasUncompiledLifecycle && !authoringLifecycle.canPublish)
                }
                onClick={() => void save('this_variant')}
              >
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Review and publish revision
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              variant={onVariant ? 'outline' : 'default'}
              disabled={
                busy ||
                !lineage ||
                !dirty ||
                (hasUncompiledLifecycle && !authoringLifecycle.canPublish)
              }
            >
              {saving && !onVariant ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {onVariant ? 'Review and publish new variant' : 'Review and publish variant'}
            </Button>
          </form>
          {savedVariant ? (
            <div role="status" className="flex items-center gap-2 text-xs">
              {savedVariant.published
                ? `Published ${savedVariant.name}.`
                : `Version created for ${savedVariant.name} · publication confirmation pending.`}
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  try {
                    await onSaved();
                    onOpenVariant?.(savedVariant.assetId);
                  } catch {
                    setError('Variant saved. The template list could not refresh. Try again.');
                  }
                }}
              >
                Open variant
              </Button>
            </div>
          ) : null}
          <Collapsible open={variantsOpen} onOpenChange={setVariantsOpen}>
            <CollapsibleTrigger className="group flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
              Variants of this template
              <ChevronDown
                className="size-3 transition-transform group-data-[panel-open]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-wrap items-center gap-1 pt-1 text-2xs text-muted-foreground">
              {variants.isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
              {variants.isSuccess && !variantChoices.length ? 'None yet.' : null}
              {variantChoices.map((v) => (
                <Button
                  key={v.assetId}
                  variant="ghost"
                  size="xs"
                  disabled={!onOpenVariant}
                  onClick={() => onOpenVariant?.(v.assetId)}
                >
                  {v.name}
                </Button>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </footer>
      </section>
      {inventoryData &&
      'designImport' in inventoryData &&
      inventoryData.designImport &&
      currentRevision &&
      currentVariant ? (
        <DesignLayersPanel
          brandId={brandId}
          assetId={assetId}
          revisionId={currentRevision.id}
          expectedHeadRevisionId={
            currentVariant.original ? currentRevision.id : currentVariant.draftHeadRevisionId
          }
          variantId={currentVariant.original ? undefined : currentVariant.variantId}
          onSaved={async (saved) => {
            await onSaved();
            await revisionCatalog.refetch();
            await onOpenVariant?.(saved.sourceAssetId);
          }}
        />
      ) : null}
    </>
  );
}
