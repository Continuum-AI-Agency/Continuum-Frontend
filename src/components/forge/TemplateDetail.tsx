'use client';

import {
  type ApiRenderJob,
  type FontInventoryRow,
  publicationCompsOfParse,
  readableLayerName,
  type TemplateFontCandidatesResponse,
  type TemplateFontPushResponse,
  type TemplateFontReadiness,
  type TemplateRevisionVariant,
  type TemplateSourceSummary,
  templateNameProblem,
  templateSourceSlotEditSchema,
  UNTITLED_TEMPLATE_NAME,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  CircleDot,
  History,
  Layers,
  Loader2,
  Play,
  RectangleHorizontal,
  RefreshCw,
  Rocket,
  Send,
  TestTube2,
  Trash2,
  Type,
  Variable,
  Wrench,
} from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DraftWithAiButton } from '@/components/forge/AiVariationsDialog';
import { ApplyDesignSystemButton } from '@/components/forge/ApplyDesignSystemButton';
import { type CheckRow, CheckTable, type CheckTick, TickBar } from '@/components/forge/CheckTable';
import { FactList } from '@/components/forge/FactList';
import {
  type FontSubstitutionChoice,
  FontSubstitutions,
} from '@/components/forge/FontSubstitutions';
import { ForgeRunProgress } from '@/components/forge/ForgeRunProgress';
import { FormatPreview, previewFormats } from '@/components/forge/FormatPreview';
import type { LayerDraftChange } from '@/components/forge/layerDraft';
import { CommentCount, OpenInLibrary, useLibraryState } from '@/components/forge/libraryState';
import { MappingQuestions } from '@/components/forge/MappingQuestions';
import { OutputSettingsPanel } from '@/components/forge/OutputSettingsPanel';
import { FORGE_STALE_MS, forgeQueryKeys, invalidateForgeBrand } from '@/components/forge/queryKeys';
import { RatioGlyph } from '@/components/forge/RatioGlyph';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { fullSrc, OutputFile } from '@/components/forge/renderOutputMedia';
import { SourceRebindPanel } from '@/components/forge/SourceRebindPanel';
import { TemplateActivity, templateEventsKey } from '@/components/forge/TemplateActivity';
import { TemplateAuthoringEditor } from '@/components/forge/TemplateAuthoringEditor';
import { TemplateLayerEditor } from '@/components/forge/TemplateLayerEditor';
import { TemplateMappingReviewPanel } from '@/components/forge/TemplateMappingReview';
import { TemplateRenders } from '@/components/forge/TemplateRenders';
import {
  TEXT_REPAIR_FONT_MIME,
  TemplateTextRepairCanvas,
  type TextMove,
  textMoveKey,
} from '@/components/forge/TemplateTextRepairCanvas';
import { useForgeRun } from '@/components/forge/useForgeRun';
import { VariableEditor } from '@/components/forge/VariableEditor';
import { VariantsPanel } from '@/components/forge/VariantsPanel';
import { Pill } from '@/components/kibo-ui/pill';
import { Panel } from '@/components/shared/Panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast-imperative';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { downloadLibraryAsset } from '@/lib/library/assetDownload';
import {
  advanceTemplateForgeBundle,
  advanceTemplateForgeRun,
  confirmTemplateRebind,
  editableTemplateFonts,
  type ForgeLadderAction,
  fetchTemplateFontCandidates,
  fetchTemplateFonts,
  fetchTemplateForgeBundle,
  fetchTemplateMappingReview,
  fetchTemplateRevisionVariants,
  fetchTemplateVariables,
  fetchTemplateVariants,
  healTemplateFonts,
  previewTemplateRebind,
  pushTemplateFonts,
  repairTemplateText,
  saveTemplateRevision,
  saveTemplateVariables,
  sendTemplateToForge,
  setTemplateAdoption,
  setTemplateFontAlias,
  type TemplateSlotEdit,
  type TemplateVariable,
  uploadTemplateFontFiles,
} from '@/lib/library/templateSources';
import { uploadNewAssetVersion } from '@/lib/library/versions';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import {
  InlineRename,
  sourceDisplayName,
  TemplateStatusPill,
  templateStatus,
} from './TemplateCard';
import {
  TemplateMorph,
  TemplateWireframe,
  useLatestRenderFrame,
  wireframeFrames,
} from './TemplateWireframe';
import { templateCheckPresentation } from './templateCheckPresentation';
import { useForgePresentationText } from './useForgePresentationText';

// One template, opened, read like a deployment: its picture beside the facts, then the checks it
// has been through — each saying what it looks at and what it found, with the step to take on the
// row that needs it — then everything you edit, one tab each. Technical identifiers live only in
// the Details tab.

/**
 * Which rungs are reachable from where the run is standing.
 *
 * The forge advances itself to `draft_ready` and then stops, because everything past that point
 * writes into a live workspace or spends a render. Those are a person's to take, which is why
 * they are buttons and not a pipeline.
 */
function ladderFor(state: string | undefined): Array<{
  action: ForgeLadderAction;
  label: string;
  Icon: typeof Send;
  hint: string;
}> {
  switch (state) {
    case 'draft_ready':
      return [
        {
          action: 'smoke',
          label: 'Test render',
          Icon: TestTube2,
          hint: 'Renders one watermarked frame to check each variable lands in the right place.',
        },
      ];
    case 'review_ready':
      return [
        {
          action: 'promote',
          label: 'Publish',
          Icon: Rocket,
          hint: 'Makes this template available for your brand to render.',
        },
      ];
    // The stop every from-scratch build reaches: the table and the graph are built and the media
    // variables have no picture yet. Nothing is broken, so the button says what to do next.
    case 'needs_input':
      return [
        {
          action: 'resume',
          label: 'Set up again',
          Icon: RefreshCw,
          hint: 'Runs setup again with your latest variable settings.',
        },
      ];
    case 'failed':
      return [
        {
          action: 'resume',
          label: 'Retry',
          Icon: RefreshCw,
          hint: 'Picks up from the last step that finished.',
        },
      ];
    default:
      return [];
  }
}

/**
 * A starting point for the build name, or blank. The forge names a render table after it and
 * refuses a name that does not fit, so a prefilled name it would refuse is worse than an empty
 * field — the refusal would only arrive at submit.
 */
function buildNameSuggestion(source: TemplateSourceSummary): string {
  const suggestion = sourceDisplayName(source);
  return suggestion === UNTITLED_TEMPLATE_NAME || templateNameProblem(suggestion) ? '' : suggestion;
}

// A design import is changed through its layers; only an After Effects source takes an uploaded project.
const DESIGN_SOURCE: Partial<Record<TemplateRevisionVariant['sourceKind'], string>> = {
  photoshop: 'a Photoshop',
  illustrator: 'an Illustrator',
};

// The font picker's "no override" item: a Select item needs a non-empty value.
const KEEP_FONT = '__current__';

const formatDate = (value: string | null, locale: UiLocale = 'en') =>
  value ? new Date(value).toLocaleDateString(locale, { dateStyle: 'medium' }) : '—';

const JOB_TICK: Record<ApiRenderJob['status'], CheckTick> = {
  finished: 'pass',
  failed: 'fail',
  submitting: 'todo',
  queued: 'todo',
  rendering: 'todo',
};

export function TemplateDetail({
  brandId,
  source,
  onBack,
  onOpenVariant,
  onRename,
  onRemove,
  onOpenRender,
  onChanged,
  revisionFile,
  onRevisionTaken,
  initialTab,
  initialComp,
  onDraftChange,
  hyperframesRevisionId,
}: {
  brandId: string;
  source: TemplateSourceSummary;
  onBack: () => void;
  onOpenVariant?: (assetId: string, tab?: string) => void | Promise<void>;
  initialTab?: string;
  /** The composition Edit layers opens on; the template's first when absent. */
  initialComp?: string;
  onRename: (title: string) => void;
  onRemove?: () => void;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
  /** Re-read the template list after something here changed what a card shows. */
  onChanged: () => Promise<void>;
  /** A dropped file to upload as this template's next source revision: opens on that tab. */
  revisionFile?: File;
  onRevisionTaken?: () => void;
  onDraftChange?: LayerDraftChange;
  /** Private HyperFrames composition revision carried in from AI Studio. */
  hyperframesRevisionId?: string;
}) {
  const uiErrorText = useUiErrorMessage();

  const currentUiLocale = useUiLocale();

  const translateUi = useUiTranslations('forge');
  const presentForge = useForgePresentationText();

  const { assetId, templateKey } = source;
  const queryClient = useQueryClient();
  // The undo for an auto-published template: render access off, the Library file kept.
  const [removingFromWorkspace, setRemovingFromWorkspace] = useState(false);
  const removeFromWorkspace = async (key: string) => {
    setRemovingFromWorkspace(true);
    try {
      const result = await setTemplateAdoption({ brandId, templateKey: key, enabled: false });
      if (!result.granted) throw new Error(result.reason ?? 'Render access stayed on.');
      await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.workspaceTemplates(brandId) });
      await onChanged();
      toast.success(translateUi('removed_from_the_render_workspace_53d7c334'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('could_not_remove_it_abd53821'),
      );
    } finally {
      setRemovingFromWorkspace(false);
    }
  };
  const variablesKey = useMemo(
    () => forgeQueryKeys.templateVariables(brandId, assetId, source.versionId),
    [assetId, brandId, source.versionId],
  );
  const fontsKey = useMemo(
    () => forgeQueryKeys.templateFonts(brandId, assetId, source.versionId),
    [assetId, brandId, source.versionId],
  );
  const name = sourceDisplayName(source);
  const { data: variantCatalog } = useQuery({
    queryKey: forgeQueryKeys.templateVariants(brandId),
    queryFn: () => fetchTemplateVariants(brandId),
    staleTime: FORGE_STALE_MS.active,
  });
  const { data: revisionCatalog } = useQuery({
    queryKey: forgeQueryKeys.revisionVariants(brandId, assetId),
    queryFn: () => fetchTemplateRevisionVariants(brandId, assetId),
    staleTime: FORGE_STALE_MS.active,
  });
  const selectedRevisionVariant = revisionCatalog?.find((variant) =>
    variant.revisions.some((revision) => revision.sourceAssetId === assetId),
  );
  const inspectedRevision = selectedRevisionVariant?.revisions.find(
    (revision) => revision.sourceAssetId === assetId,
  );
  const variantRoot =
    variantCatalog?.find((variant) => variant.assetId === assetId)?.rootAssetId ?? assetId;
  const familyVariants =
    variantCatalog?.filter((variant) => variant.rootAssetId === variantRoot) ?? [];
  const { run, pushed, refresh: refreshRun } = useForgeRun(brandId, assetId);
  const multiDelivery = publicationCompsOfParse(source.parse).length > 1;
  const bundleKey = ['template-forge-bundle', brandId, assetId, source.versionId];
  const { data: bundle, refetch: refreshBundle } = useQuery({
    queryKey: bundleKey,
    queryFn: () => fetchTemplateForgeBundle(brandId, assetId),
    enabled: Boolean(source.forgeRunId && multiDelivery),
    refetchInterval: (query) =>
      query.state.data?.activation?.state === 'published' ? false : 5000,
    retry: false,
  });
  const [bundleBusy, setBundleBusy] = useState<string | null>(null);
  // The formats the file delivers — its parse's comps, else its ratio labels — and the one on screen.
  const formats = useMemo(
    () => previewFormats({ parse: source.parse, ratios: source.ratios }),
    [source.parse, source.ratios],
  );
  const [formatId, setFormatId] = useState<string | undefined>(undefined);
  const [editingText, setEditingText] = useState(false);
  const [textMoves, setTextMoves] = useState<Record<string, TextMove>>({});
  const [selectedTextKey, setSelectedTextKey] = useState<string | null>(null);
  const [savedTextRepair, setSavedTextRepair] = useState<{
    versionId: string;
    error: string;
  } | null>(null);
  const [savedMediaRepair, setSavedMediaRepair] = useState<string | null>(null);
  const [savingText, setSavingText] = useState(false);
  // Read once: the dropped file is handed off moments after mount, and the tab must not follow it.
  const [tab, setTab] = useState(initialTab ?? (revisionFile ? 'source' : 'checks'));
  const authorIdentity = `${assetId}:${source.versionId ?? ''}`;
  const [mountedAuthorIdentity, setMountedAuthorIdentity] = useState<string | null>(() =>
    initialTab === 'author' ? authorIdentity : null,
  );
  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
    if (initialTab === 'author') setMountedAuthorIdentity(authorIdentity);
  }, [authorIdentity, initialTab]);
  const selectTab = (value: string) => {
    setTab(value);
    if (value === 'author') setMountedAuthorIdentity(authorIdentity);
  };
  const missingFootage = source.parse?.missingFootage ?? [];
  // Open on a format that has something to show. A parse can list a precomp as a format (KAMAY's
  // "Gradient Background 1" came first), and landing on its empty frame reads as a broken preview.
  const boxedRatios = useMemo(
    () =>
      new Set(
        wireframeFrames(source.parse)
          .filter((frame) => frame.boxes.length > 0)
          .map((frame) => frame.ratio),
      ),
    [source.parse],
  );
  const format =
    formats.find((entry) => entry.id === formatId) ??
    formats.find((entry) => entry.ratio && boxedRatios.has(entry.ratio)) ??
    formats[0];
  const rendered = useLatestRenderFrame(brandId, templateKey, formats, format?.id);
  const { data: editableFonts = [] } = useQuery<FontInventoryRow[]>({
    queryKey: ['template-editable-fonts', brandId],
    queryFn: () => editableTemplateFonts(brandId),
    enabled: editingText,
  });
  const textFrame =
    wireframeFrames(source.parse).find((frame) => frame.comp === format?.comp?.name) ??
    wireframeFrames(source.parse).find((frame) => frame.ratio === format?.ratio);
  const editableTextBoxes =
    textFrame?.boxes.filter((box) => box.kind === 'text' && box.instance) ?? [];
  const selectedTextBox =
    editableTextBoxes.find((box) => textMoveKey(box.instance!) === selectedTextKey) ??
    editableTextBoxes[0];
  const applyTextFont = (font: string) => {
    const instance = selectedTextBox?.instance;
    if (!instance) return;
    const key = textMoveKey(instance);
    setSelectedTextKey(key);
    setTextMoves((previous) => {
      const current = previous[key];
      return {
        ...previous,
        [key]: {
          compId: instance.compId,
          layerId: instance.layerId,
          dx: current?.dx ?? 0,
          dy: current?.dy ?? 0,
          dw: current?.dw ?? 0,
          dh: current?.dh ?? 0,
          ...(font ? { font } : {}),
        },
      };
    });
  };
  const saveTextMoves = async () => {
    if (selectedRevisionVariant) {
      setTab('layers');
      toast.info(translateUi('use_edit_layers_to_save_text_change_621d3061'));
      return;
    }
    const moves = Object.values(textMoves).filter(
      (move) => move.dx !== 0 || move.dy !== 0 || move.dw || move.dh || move.font,
    );
    if (!moves.length || savingText) return;
    setSavingText(true);
    let uploaded = false;
    let applied = false;
    let savedVersionId = '';
    try {
      const repaired = await repairTemplateText(assetId, {
        brandId,
        expectedVersionId: source.versionId,
        moves,
      });
      const bytes = Uint8Array.from(atob(repaired.inlineBase64), (char) => char.charCodeAt(0));
      const file = new File([bytes], repaired.filename, {
        type: repaired.filename.toLowerCase().endsWith('.zip')
          ? 'application/zip'
          : 'application/octet-stream',
      });
      const registered = await uploadNewAssetVersion({
        brandId,
        assetId,
        baseVersionId: source.versionId,
        file,
        note: `Repaired ${moves.length} text layer${moves.length === 1 ? '' : 's'} in Forge`,
      });
      if (!registered.versionId) throw new Error('The Library did not return the repaired version');
      uploaded = true;
      savedVersionId = registered.versionId;
      const inspected = await previewTemplateRebind({
        brandId,
        assetId,
        versionId: registered.versionId,
        expectedVersionId: source.versionId,
      });
      if (inspected.requiresReview || inspected.slots.some((slot) => slot.status === 'missing')) {
        throw new Error('Review the new file version before it can be used.');
      }
      await confirmTemplateRebind({
        brandId,
        assetId,
        versionId: registered.versionId,
        expectedVersionId: source.versionId,
        expectedChecksum: inspected.checksum,
        acceptMissing: false,
      });
      applied = true;
      setTextMoves({});
      setEditingText(false);
      setSavedTextRepair(null);
      await onChanged();
      toast.success(translateUi('text_changes_saved_as_a_new_version_3c7874d5'));
    } catch (error) {
      const message = uiErrorText(error);
      if (applied) {
        toast.error(
          translateUi('text_changes_are_applied_but_this_v_b50a7e09', { value0: String(message) }),
        );
      } else if (uploaded) {
        setSavedTextRepair({ versionId: savedVersionId, error: message });
        setEditingText(false);
        setTextMoves({});
        setTab('source');
      } else {
        toast.error(message);
      }
    } finally {
      setSavingText(false);
    }
  };
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [savedDefaults, setSavedDefaults] = useState<Record<string, unknown>>({});
  const [savedBindings, setSavedBindings] = useState<Record<string, TemplateSlotEdit['binding']>>(
    {},
  );
  const [parseState, setParseState] = useState<string>(source.parseState);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<ForgeLadderAction | 'submit' | null>(null);
  // THE BUILD NAME IS ASKED FOR, never inferred: the forge derives this template's render table
  // from it (`tpl_<slug(name)>_root`, 40 characters, never truncated). The display name above is
  // separate and can change any time; this one cannot.
  const [templateName, setTemplateName] = useState(() => buildNameSuggestion(source));
  const [fontReadiness, setFontReadiness] = useState<TemplateFontReadiness | null>(null);
  const [fontCandidates, setFontCandidates] = useState<TemplateFontCandidatesResponse | null>(null);
  const [fontCheckFailed, setFontCheckFailed] = useState(false);
  const [fontPlan, setFontPlan] = useState<Extract<
    TemplateFontPushResponse,
    { fired: false }
  > | null>(null);
  const [fontResult, setFontResult] = useState<Extract<
    TemplateFontPushResponse,
    { fired: true }
  > | null>(null);
  const [fontBusy, setFontBusy] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [parseSlow, setParseSlow] = useState(false);
  const [fontCheckFocusRequestId, setFontCheckFocusRequestId] = useState(0);
  const activityTrigger = useRef<HTMLButtonElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);

  const loadVariables = useCallback(async () => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: variablesKey,
        queryFn: () => fetchTemplateVariables(brandId, assetId),
        staleTime: FORGE_STALE_MS.lists,
      });
      setVariables(result.variables);
      setParseState(result.parseState);
      // Saved defaults live on the edits, not on the variables — without this they never reappear.
      setSavedDefaults(
        Object.fromEntries(result.edits.map((edit) => [edit.slotKey, edit.defaultValue ?? null])),
      );
      setSavedBindings(
        Object.fromEntries(result.edits.map((edit) => [edit.slotKey, edit.binding ?? null])),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_read_the_variables_ea70990c'),
      );
    }
  }, [assetId, brandId, queryClient, variablesKey, translateUi]);

  useEffect(() => {
    void loadVariables();
  }, [loadVariables]);

  const loadFonts = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      setFontReadiness(null);
      setFontCheckFailed(false);
      try {
        const readiness = await queryClient.fetchQuery({
          queryKey: fontsKey,
          queryFn: () => fetchTemplateFonts(brandId, assetId),
          staleTime: FORGE_STALE_MS.lists,
        });
        if (isCurrent()) setFontReadiness(readiness);
      } catch {
        if (isCurrent()) setFontCheckFailed(true);
      }
    },
    [assetId, brandId, fontsKey, queryClient],
  );

  // What we hold that could stand in for what is missing. Loaded alongside readiness rather than
  // on demand, so the way forward is already on screen when the check goes red — a fix behind a
  // button nobody presses is a fix nobody has.
  const loadFontCandidates = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      try {
        const answer = await fetchTemplateFontCandidates(brandId, assetId);
        if (isCurrent()) setFontCandidates(answer);
      } catch {
        // Silent: the substitution panel is the extra way out, never the reason the check fails.
        if (isCurrent()) setFontCandidates(null);
      }
    },
    [assetId, brandId],
  );

  useEffect(() => {
    let current = true;
    void loadFonts(() => current);
    void loadFontCandidates(() => current);
    return () => {
      current = false;
    };
  }, [loadFontCandidates, loadFonts, source.parseState, source.updatedAt, source.versionId]);

  const refreshEvents = useCallback(
    () => queryClient.invalidateQueries({ queryKey: templateEventsKey(brandId, assetId) }),
    [assetId, brandId, queryClient],
  );
  const reloadFonts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: fontsKey, exact: true });
    await loadFonts();
    await loadFontCandidates();
  }, [fontsKey, loadFontCandidates, loadFonts, queryClient]);

  // Nothing pushes a finished parse to this page, so one opened in the seconds between upload and
  // parse said "Not opened yet" until reloaded while the build card moved on without it. Ask again
  // while it is pending, for two minutes at most — past that the Activity log says why.
  useEffect(() => {
    if (parseState !== 'pending') return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 40) {
        clearInterval(timer);
        setParseSlow(true);
        return;
      }
      void queryClient
        .invalidateQueries({ queryKey: variablesKey, exact: true })
        .then(loadVariables);
    }, 3000);
    return () => clearInterval(timer);
  }, [loadVariables, parseState, queryClient, variablesKey]);

  // The parse landed while this page was open: re-read everything that was read against the
  // pending row. Once, whatever `onChanged`'s identity does between renders.
  const openedPending = useRef(source.parseState === 'pending');
  useEffect(() => {
    if (!openedPending.current || parseState === 'pending') return;
    openedPending.current = false;
    void Promise.all([reloadFonts(), onChanged(), refreshEvents()]);
  }, [onChanged, parseState, refreshEvents, reloadFonts]);

  useEffect(() => {
    if (run?.state) void refreshEvents();
  }, [refreshEvents, run?.state]);

  const onSave = async (edits: TemplateSlotEdit[]) => {
    if (selectedRevisionVariant) {
      const selected = selectedRevisionVariant.revisions.find(
        (revision) =>
          revision.sourceAssetId === assetId && revision.sourceVersionId === source.versionId,
      );
      if (
        !selected ||
        selectedRevisionVariant.original ||
        selected.id !== selectedRevisionVariant.draftHeadRevisionId
      ) {
        setTab('layers');
        toast.info(translateUi('create_a_named_variant_in_edit_laye_822c7172'));
        return false;
      }
      setSaving(true);
      try {
        const saved = await saveTemplateRevision(assetId, {
          brandId,
          parentRevisionId: selected.id,
          variantId: selectedRevisionVariant.variantId,
          expectedHeadRevisionId: selected.id,
          idempotencyKey: crypto.randomUUID(),
          edits: {
            layers: [],
            orders: [],
            slots: edits.map((edit) => templateSourceSlotEditSchema.parse(edit)),
          },
        });
        await invalidateForgeBrand(queryClient, brandId);
        await onChanged();
        await onOpenVariant?.(saved.sourceAssetId, 'variables');
        toast.success(translateUi('saved_template_revision_4e8c385b'));
        return true;
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : translateUi('could_not_save_revision_53e3ddc9'),
        );
        return false;
      } finally {
        setSaving(false);
      }
    }
    setSaving(true);
    try {
      await saveTemplateVariables(brandId, assetId, edits);
      await queryClient.invalidateQueries({ queryKey: variablesKey, exact: true });
      await queryClient.invalidateQueries({ queryKey: forgeQueryKeys.contracts(brandId) });
      await loadVariables();
      toast.success(translateUi('saved_b5c120b3'));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : translateUi('could_not_save_16efcd21'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async () => {
    const problem = templateNameProblem(templateName);
    if (problem) {
      toast.error(translateUi('template_name_value0_fc034d1d', { value0: String(problem) }));
      return;
    }
    setBusy('submit');
    try {
      // No workspace argument: a build always goes to the brand's own space in the shared
      // sub-app. Which one that is, is our deployment topology, not a question for the person
      // naming a template.
      await sendTemplateToForge(brandId, assetId, templateName.trim());
      await Promise.all([onChanged(), refreshRun(), refreshBundle()]);
      toast.success(translateUi('started_ecbc89cd'));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('couldn_t_start_setup_afa41ad7'),
      );
    } finally {
      setBusy(null);
    }
  };

  const onAdvance = async (action: ForgeLadderAction) => {
    setBusy(action);
    try {
      await advanceTemplateForgeRun(brandId, assetId, action);
      await Promise.all([refreshRun(), onChanged()]);
      if (templateKey)
        await queryClient.invalidateQueries({
          queryKey: forgeQueryKeys.contract(brandId, null, templateKey),
        });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_value0_f03141e9', { value0: String(action) }),
      );
    } finally {
      setBusy(null);
      void refreshEvents();
    }
  };

  const onBundleAdvance = async (
    action: 'smoke' | 'promotion-plan' | 'approve' | 'resume',
    options: { confirmation?: string; runId?: string } = {},
  ) => {
    setBundleBusy(action);
    try {
      await advanceTemplateForgeBundle(brandId, assetId, action, options);
      await Promise.all([refreshBundle(), onChanged()]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_value0_f03141e9', { value0: String(action) }),
      );
    } finally {
      setBundleBusy(null);
    }
  };

  const heldFamilies =
    fontReadiness?.fonts.filter((font) => font.held).map((font) => font.family) ?? [];

  const reviewFontInstall = async () => {
    setFontBusy(true);
    setFontResult(null);
    try {
      const plan = await pushTemplateFonts(brandId, assetId, false, heldFamilies);
      if (!plan.fired) setFontPlan(plan);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_review_the_font_install_9d9d907f'),
      );
    } finally {
      setFontBusy(false);
    }
  };

  const installFonts = async () => {
    setFontBusy(true);
    try {
      const result = await pushTemplateFonts(brandId, assetId, true, heldFamilies);
      if (result.fired) setFontResult(result);
      setFontPlan(null);
      await queryClient.invalidateQueries({ queryKey: fontsKey, exact: true });
      await loadFonts();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_install_the_fonts_b351f465'),
      );
    } finally {
      setFontBusy(false);
    }
  };

  // The template's recent renders, read through the SAME cached query the preview's
  // `useLatestRenderFrame` owns (key, fetcher and freshness identical, only the selection differs),
  // so the facts never cost a second jobs read. The list is one page, so no total is claimed.
  const { data: recentJobs } = useQuery({
    queryKey: ['forge-template-frame', brandId, templateKey],
    queryFn: () => apiRendersApi.listJobs(brandId, 10, { templateKey: templateKey ?? '' }),
    enabled: Boolean(templateKey),
    staleTime: 60_000,
    select: (response) => response.items.filter((job) => job.templateKey === templateKey),
  });
  const { data: publishedContract, isError: publishCheckFailed } = useQuery({
    queryKey: forgeQueryKeys.contract(brandId, null, templateKey ?? ''),
    queryFn: () => apiRendersApi.getContract(brandId, templateKey ?? ''),
    enabled: Boolean(templateKey),
    staleTime: 0,
    refetchInterval: 60_000,
    retry: false,
  });
  const publishVerification = publishedContract?.publishCheck ?? null;
  const { data: mappingReview, isError: mappingCheckFailed } = useQuery({
    queryKey: forgeQueryKeys.mappingReview(brandId, assetId, source.versionId, run?.state ?? null),
    queryFn: () => fetchTemplateMappingReview(brandId, assetId),
    enabled: Boolean(source.forgeRunId && parseState === 'parsed'),
    staleTime: FORGE_STALE_MS.active,
    retry: false,
  });
  // The template is a Library asset too: its thread and versions live there.
  const library = useLibraryState(brandId, [assetId]).get(assetId);
  const { data: setCount } = useQuery({
    queryKey: forgeQueryKeys.renderSetList(brandId, templateKey ?? undefined),
    queryFn: () => apiRendersApi.listRenderSets(brandId, templateKey ?? undefined),
    enabled: Boolean(templateKey),
    staleTime: FORGE_STALE_MS.lists,
    select: (response) => response.items.length,
  });

  const nameProblem = templateNameProblem(templateName);
  const status = templateStatus({
    parseState: source.parseState,
    forgeState: run?.state ?? source.forgeState,
    templateKey,
  });
  const ratios = source.ratios;
  const variableCount = variables.length || source.slotCount || 0;
  const unassigned = variables.filter((variable) => variable.role === null).length;

  const fontParseState = fontReadiness?.parseState ?? source.parseState;
  const missingFonts = fontReadiness?.fonts.filter((font) => !font.held).length ?? 0;
  const fontsFact =
    fontParseState === 'pending'
      ? 'Not known yet'
      : fontParseState !== 'parsed'
        ? 'Not known'
        : fontCheckFailed
          ? "Couldn't check"
          : fontReadiness
            ? `${fontReadiness.fonts.length}${missingFonts ? ` · ${missingFonts} missing` : ''}`
            : '…';

  const jobs = recentJobs ?? [];
  const lastFinished = jobs.find((job) => job.status === 'finished');
  const renderedJob = rendered
    ? jobs.find((job) => job.outputs.some((output) => output.url === rendered.url))
    : undefined;
  const drawnRatios = new Set(wireframeFrames(source.parse).map((frame) => frame.ratio));

  const ladder = ladderFor(run?.state);
  const mappingBlocked =
    mappingReview?.identityAvailable === true && mappingReview.state === 'needs_review';
  const ladderButton = (action: ForgeLadderAction | undefined) => {
    if (multiDelivery) return undefined;
    const step = ladder.find((entry) => entry.action === action);
    if (!step) return undefined;
    const { Icon } = step;
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="gap-1"
        title={
          action === 'promote' && mappingBlocked
            ? translateUi('review_the_unconnected_layers_befor_c2384575')
            : presentForge(step.hint)
        }
        disabled={busy !== null || (action === 'promote' && mappingBlocked)}
        onClick={() => void onAdvance(step.action)}
      >
        {busy === step.action ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-3" aria-hidden />
        )}
        {presentForge(step.label)}
      </Button>
    );
  };

  const addFontFiles = async (files: File[]) => {
    if (!files.length) return;
    setFontBusy(true);
    try {
      const { stored, refused } = await uploadTemplateFontFiles(brandId, files);
      if (stored.length)
        toast.success(
          translateUi('fonts_added_value0_664da924', { value0: String(stored.join(', ')) }),
        );
      if (refused.length)
        toast.error(
          translateUi('fonts_not_added_value0_aec8462a', { value0: String(refused.join('; ')) }),
        );
      // The file is read again with the faces just added, so its text is measured now rather
      // than after someone finds a Fix button that nothing else is asking them to press.
      if (stored.length && !selectedRevisionVariant) {
        await healTemplateFonts(brandId, assetId).catch((error: unknown) =>
          toast.error(
            translateUi('fonts_are_stored_but_the_file_was_n_8b4b0652', {
              value0: String(
                error instanceof Error ? error.message : translateUi('unknown_error_3e4443e5'),
              ),
            }),
          ),
        );
        void refreshEvents();
        await queryClient.invalidateQueries({ queryKey: ['template-editable-fonts', brandId] });
      }
      await Promise.all([reloadFonts(), onChanged()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('could_not_add_font_files_a61e6ea0'),
      );
    } finally {
      setFontBusy(false);
    }
  };

  const applyFontSubstitutions = async (choices: FontSubstitutionChoice[]) => {
    if (selectedRevisionVariant) {
      setTab('layers');
      toast.info(translateUi('choose_a_font_face_in_edit_layers_t_4c9aefc5'));
      return;
    }
    setFontBusy(true);
    try {
      // One at a time and in order: each call returns the readiness AFTER it, and a person
      // clearing one substitution while setting another must see the end state, not a race.
      for (const choice of choices) {
        await setTemplateFontAlias(brandId, assetId, {
          requestedFamily: choice.requestedFamily,
          fontId: choice.fontId,
          scope: 'template',
        });
      }
      await Promise.all([reloadFonts(), onChanged()]);
      void refreshEvents();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : translateUi('could_not_use_those_fonts_c45038b1'),
      );
    } finally {
      setFontBusy(false);
    }
  };

  const mappingNeeds =
    run?.state === 'needs_input' ? (run.needs ?? []).filter((need) => need.kind === 'mapping') : [];
  const otherNeeds = (run?.needs ?? []).filter((need) => need.kind !== 'mapping');
  const retryableBuild =
    run?.state === 'needs_input' &&
    (run.needs ?? []).some((need) => need.kind === 'mapping' || need.kind === 'asset');
  const fixable =
    missingFonts > 0 ||
    retryableBuild ||
    parseState === 'failed' ||
    (parseState === 'pending' && parseSlow);

  // The problems every new upload hits, fixed without asking: faces from the package or Google
  // Fonts, and a build re-planned against the columns it made for itself.
  const onFix = async () => {
    if (selectedRevisionVariant) {
      setTab('layers');
      toast.info(translateUi('this_revision_is_preserved_save_rep_b883981d'));
      return;
    }
    setFixing(true);
    try {
      // Always: besides finding missing faces, this reads the file again with every face the
      // brand holds — the formats the forge now ships and text it can now measure.
      const healed = await healTemplateFonts(brandId, assetId);
      const found = [...healed.fromPackage, ...healed.fromGoogle];
      if (found.length)
        toast.success(
          translateUi('fonts_found_value0_9cfdd11c', { value0: String(found.join(', ')) }),
        );
      if (healed.stillMissing.length) {
        toast.error(
          translateUi('still_missing_value0_add_the_font_f_944ca3d8', {
            value0: String(healed.stillMissing.join(', ')),
          }),
        );
      }
      await Promise.all([reloadFonts(), onChanged()]);
      if (retryableBuild) {
        await advanceTemplateForgeRun(brandId, assetId, 'resume');
        await refreshRun();
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_fix_this_template_45b6849e'),
      );
    } finally {
      setFixing(false);
      void refreshEvents();
    }
  };

  const onAnswer = async (decisions: unknown) => {
    setBusy('decisions');
    try {
      await advanceTemplateForgeRun(brandId, assetId, 'decisions', { decisions });
      await Promise.all([refreshRun(), onChanged()]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translateUi('could_not_apply_the_answers_d7d0f051'),
      );
    } finally {
      setBusy(null);
      void refreshEvents();
    }
  };

  const fontsDetail =
    (fontReadiness?.parseState === 'parsed' && fontReadiness.fonts.length > 0) || fontResult ? (
      <div className="flex flex-col gap-2">
        {fontReadiness?.fonts.length ? (
          <ul className="flex flex-wrap gap-1" aria-label={translateUi('typefaces_a6abd3ff')}>
            {fontReadiness.fonts.map((font) => (
              <li key={font.family}>
                <Pill
                  variant={font.held ? 'success' : 'warning'}
                  title={
                    font.via === 'substitute'
                      ? translateUi('we_don_t_have_value0_it_will_render_94b7179c', {
                          value0: String(font.family),
                          value1: String(
                            font.substitutedBy?.family ??
                              translateUi('the_font_you_chose_7084c19e'),
                          ),
                        })
                      : font.held
                        ? font.scope === 'house'
                          ? translateUi('from_continuum_s_shared_font_librar_8f1a6e0d')
                          : translateUi('in_this_brand_s_fonts_cf30420f')
                        : translateUi('not_in_your_upload_your_brand_fonts_dfe97e23')
                  }
                >
                  {/* A substitution never reads as a plain "uploaded". A green tick over a
                      typeface somebody quietly swapped is the 2026-09-15 failure exactly. */}
                  {font.family} ·{' '}
                  {font.via === 'substitute'
                    ? translateUi('value0_substituted_64afc5e6', {
                        value0: String(font.substitutedBy?.family ?? 'substituted'),
                      })
                    : font.held
                      ? translateUi('found_bcc649cf')
                      : translateUi('missing_ffa63583')}
                </Pill>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground">
          {' '}
          {translateUi('we_look_for_missing_fonts_in_your_u_948e8eb5')}{' '}
        </p>
        {/* Always mounted, not gated on `missingFonts`: once a face is substituted the count is
            zero while the panel still offers "Add the real files", and a button wired to an
            input that is no longer in the tree silently does nothing. */}
        {missingFonts > 0 ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="w-fit"
            disabled={fontBusy}
            onClick={() => fontInput.current?.click()}
          >
            {fontBusy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}{' '}
            {translateUi('add_font_files_7ad2d46a')}{' '}
          </Button>
        ) : null}
        {!editingText && fontCandidates && fontCandidates.missing.length > 0 ? (
          <FontSubstitutions
            candidates={fontCandidates}
            busy={fontBusy}
            onUpload={() => fontInput.current?.click()}
            onApply={applyFontSubstitutions}
          />
        ) : null}
        {templateKey && heldFamilies.length > 0 ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="w-fit"
            disabled={fontBusy}
            onClick={() => void reviewFontInstall()}
          >
            {fontBusy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}{' '}
            {translateUi('review_font_install_8b99a35e')}{' '}
          </Button>
        ) : null}
        {fontResult ? (
          <div role="status" className="flex flex-col gap-1">
            {fontResult.linked.length > 0 ? (
              <p className="text-success">
                {' '}
                {translateUi('installed_b92fd7f8')}{' '}
                {fontResult.linked.map((font) => font.postScriptName).join(', ')}
              </p>
            ) : null}
            {fontResult.alreadyLinked.length > 0 ? (
              <p className="text-muted-foreground">
                {' '}
                {translateUi('already_installed_cb70e72b')}{' '}
                {fontResult.alreadyLinked.map((font) => font.postScriptName).join(', ')}
              </p>
            ) : null}
            {fontResult.refused.map((font) => (
              <p key={font.filename} className="text-destructive">
                {' '}
                {translateUi('refused_66b87354')} {font.filename}: {font.reason}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    ) : undefined;

  const buildDetail = (
    <div className="flex flex-col gap-3">
      {!run || run.state === 'failed' || (multiDelivery && !bundle) ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder={translateUi('name_this_template_53fc63a0')}
              aria-label={translateUi('template_name_7b905ed0')}
              aria-invalid={nameProblem !== null && templateName.length > 0}
              inputSize="sm"
              className="w-64"
              disabled={busy !== null}
            />
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={
                busy !== null ||
                source.parseState !== 'parsed' ||
                nameProblem !== null ||
                missingFootage.length > 0
              }
              onClick={onSubmit}
            >
              {busy === 'submit' ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Send className="size-3.5" aria-hidden />
              )}{' '}
              {translateUi('set_up_template_6e4e62fb')}{' '}
            </Button>
          </div>
          <p
            className={
              templateName.length > 0 && nameProblem ? 'text-destructive' : 'text-muted-foreground'
            }
          >
            {templateName.length > 0 && nameProblem
              ? nameProblem
              : translateUi('this_name_is_permanent_once_set_up__644fc854')}
          </p>
        </div>
      ) : null}
      {bundle ? (
        <div className="rounded-md border p-3 space-y-3">
          <p className="font-medium">{translateUi('delivery_templates_554fed86')}</p>
          <p className="text-sm text-muted-foreground">
            {' '}
            {translateUi('each_format_has_its_own_fields_and__265f075f')}{' '}
          </p>
          {bundle.children.map((child) => (
            <div
              key={child.runId}
              className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
            >
              <span>{child.compName}</span>
              <span className="text-muted-foreground">
                {child.state.replaceAll('_', ' ')}
                {child.smoke && typeof child.smoke === 'object' && 'state' in child.smoke
                  ? translateUi('test_value0_1a6be770', {
                      value0: String(String(child.smoke.state)),
                    })
                  : ''}
              </span>
              {child.smokeFiles?.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {' '}
                  {translateUi('view_test_198c1873')} {index + 1}
                </a>
              ))}
              {child.state === 'needs_input' || child.state === 'failed' ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={bundleBusy !== null}
                  onClick={() => void onBundleAdvance('resume', { runId: child.runId })}
                >
                  {' '}
                  {translateUi('retry_setup_8e087204')}{' '}
                </Button>
              ) : null}
            </div>
          ))}
          <div className="flex gap-2">
            {bundle.children.some((child) => child.state === 'draft_ready') ? (
              <Button
                type="button"
                size="sm"
                disabled={bundleBusy !== null}
                onClick={() => void onBundleAdvance('smoke')}
              >
                {' '}
                {translateUi('test_all_formats_16c048fd')}{' '}
              </Button>
            ) : null}
            {bundle.children.every((child) => child.state === 'review_ready') &&
            !bundle.approval ? (
              <Button
                type="button"
                size="sm"
                disabled={bundleBusy !== null}
                onClick={() => void onBundleAdvance('promotion-plan')}
              >
                {' '}
                {translateUi('review_publication_03b9d524')}{' '}
              </Button>
            ) : null}
            {bundle.approval && bundle.activation?.state !== 'published' ? (
              <Button
                type="button"
                size="sm"
                disabled={bundleBusy !== null}
                onClick={() =>
                  void onBundleAdvance('approve', { confirmation: bundle.approval?.confirmation })
                }
              >
                {' '}
                {translateUi('publish_all_formats_d9f2bf1e')}{' '}
              </Button>
            ) : null}
            {bundle.activation?.state === 'published' ? (
              <span className="text-sm text-success">
                {translateUi('all_formats_published_bbc6963f')}
              </span>
            ) : null}
          </div>
        </div>
      ) : !multiDelivery && run ? (
        <ForgeRunProgress run={run} />
      ) : null}
      {!multiDelivery && mappingNeeds.length ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          <MappingQuestions
            key={mappingNeeds.map((need) => need.id).join('|')}
            needs={mappingNeeds}
            busy={busy !== null}
            onAnswer={onAnswer}
          />
        </div>
      ) : null}
      {!multiDelivery && otherNeeds.length ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
          {/*
            An `asset` need is where EVERY from-scratch build lands — the table is built, the
            graph is built, and nobody has chosen the pictures yet. It is answered in the
            Variables tab, then Set up again.
          */}
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {otherNeeds.map((need) => (
              <li key={need.id}>
                {need.slot?.label ? readableLayerName(need.slot.label) : need.id}
                {need.reason ? ` — ${need.reason}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const parseDetail = source.parseError ? (
    <p className="text-destructive">{source.parseError}</p>
  ) : parseState === 'pending' && parseSlow ? (
    <p className="text-muted-foreground">
      {' '}
      {translateUi('opening_the_file_is_taking_longer_t_87ad6546')}{' '}
    </p>
  ) : undefined;
  const detailOf: Record<string, CheckRow['detail']> = {
    parse: parseDetail,
    fonts: fontsDetail,
    build: buildDetail,
    publish: publishVerification ? (
      <div className="flex flex-col gap-2">
        {publishVerification.issues.length ? (
          <ul className="list-disc pl-4">
            {publishVerification.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p>{translateUi('everything_matches_what_you_see_her_7ea8c62e')}</p>
        )}
        {publishVerification.media.length ? (
          <ul
            className="flex flex-col gap-1"
            aria-label={translateUi('media_placement_measurements_af527138')}
          >
            {publishVerification.media.map((slot) => (
              <li key={slot.key}>
                {slot.label}:{' '}
                {slot.box && slot.source
                  ? translateUi('value0_value1_px_image_value2_value_ba16fdfa', {
                      value0: String(slot.source[0]),
                      value1: String(slot.source[1]),
                      value2: String(Math.round(slot.box[2] - slot.box[0])),
                      value3: String(Math.round(slot.box[3] - slot.box[1])),
                      value4: String(slot.comp),
                    })
                  : translateUi('size_not_measured_yet_c8c5a70c')}
                {slot.rigged ? translateUi('placed_at_render_time_4bfe5bed') : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : undefined,
  };
  const checks: CheckRow[] = templateCheckPresentation(
    {
      parseState,
      parseError: source.parseError ?? null,
      variableCount,
      formatCount: ratios.length,
      fontReadiness,
      fontCheckFailed,
      run,
      forgeState: source.forgeState,
      templateKey,
      publishVerification,
      publishCheckFailed,
      mappingReview,
      mappingCheckFailed,
    },
    translateUi,
    currentUiLocale,
  ).map((check) => ({
    name: check.name,
    what: check.what,
    state: check.state,
    result: check.result,
    ticks: check.ticks,
    chips: check.chips?.map((chip) => (
      <Pill key={chip.label} variant={chip.tone}>
        {chip.label}
      </Pill>
    )),
    detail: detailOf[check.id],
    action:
      check.id === 'mapping' && mappingReview?.state === 'needs_review' ? (
        <Button type="button" size="xs" variant="outline" onClick={() => setTab('mapping')}>
          {' '}
          {translateUi('review_layers_f02e6d38')}{' '}
        </Button>
      ) : (
        ladderButton(check.action)
      ),
  }));

  const hasProblem = checks.some((check) => check.state === 'fail' || check.state === 'warn');
  // Investigate used to open the first failing row, which was already open, so pressing it did
  // nothing visible. Now it fixes what can be fixed, and otherwise opens the trail of what happened.
  const footerAction = fixable ? (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="gap-1"
      title={translateUi('opens_your_file_again_looks_for_mis_bacbf4e1')}
      disabled={fixing || busy !== null}
      onClick={() => void onFix()}
    >
      {fixing ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Wrench className="size-3" aria-hidden />
      )}{' '}
      {translateUi('fix_problems_80195a4c')}{' '}
    </Button>
  ) : hasProblem ? (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={() => {
        setActivityOpen(true);
        activityTrigger.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        activityTrigger.current?.focus();
      }}
    >
      {' '}
      {translateUi('investigate_e2641093')}{' '}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col divide-y divide-border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-[var(--card-pad)] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onBack}>
            <ArrowLeft className="size-3.5" aria-hidden /> {translateUi('templates_56b564b7')}{' '}
          </Button>
          <h2 className="min-w-0 text-base font-semibold">
            <InlineRename value={name} onRename={onRename} />
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {/*
              A card never says "published" off a forge run alone: the fleet can finish a job
              against an unpromoted package and hand back a blank frame, which reads as success.
              Only a template key means renderable.
            */}
            {templateKey
              ? publishVerification?.state === 'pass'
                ? translateUi('ready_to_render_6f40bb00')
                : translateUi('published_review_the_layout_8b57a46e')
              : translateUi('not_ready_to_render_yet_229f2f60')}
            {run && !run.done && !pushed ? translateUi('not_updating_live_d3b2957f') : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenVariant && revisionCatalog?.length ? (
            <label className="flex items-center gap-2 text-xs">
              {' '}
              {translateUi('variant_3f19fe84')}{' '}
              <select
                aria-label={translateUi('inspect_template_variant_d7a42b8a')}
                className="h-8 max-w-56 rounded-md border bg-background px-2 text-xs"
                value={selectedRevisionVariant?.variantId ?? ''}
                onChange={(event) => {
                  const variant = revisionCatalog.find(
                    (item) => item.variantId === event.target.value,
                  );
                  const head = variant?.revisions.find(
                    (item) => item.id === variant.draftHeadRevisionId,
                  );
                  if (head) void onOpenVariant(head.sourceAssetId, tab);
                }}
              >
                {revisionCatalog.map((variant) => (
                  <option key={variant.variantId} value={variant.variantId}>
                    {variant.original ? translateUi('original_88d759ea') : variant.name} ·{' '}
                    {variant.publishedHeadRevisionId
                      ? translateUi('published_2ef42ec2')
                      : translateUi('draft_ebf12ef4')}
                    {variant.tags.includes('brand_aligned')
                      ? translateUi('brand_aligned_59119b32')
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="inline-flex items-center gap-2 text-xs">
            {library ? (
              <>
                <CommentCount count={library.commentCount} />
                <span className="tabular-nums text-muted-foreground">
                  {library.versionCount}{' '}
                  {library.versionCount === 1
                    ? translateUi('file_version_0fd9ee74')
                    : translateUi('file_versions_c4fdb7cc')}
                </span>
              </>
            ) : null}
            <OpenInLibrary brandId={brandId} assetId={assetId} />
          </span>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" aria-hidden /> {translateUi('remove_c3812fc4')}{' '}
            </Button>
          ) : null}
          {onOpenVariant && inspectedRevision && parseState === 'parsed' ? (
            <ApplyDesignSystemButton
              brandId={brandId}
              assetId={assetId}
              revision={inspectedRevision}
              designImport={
                selectedRevisionVariant?.sourceKind === 'photoshop' ||
                selectedRevisionVariant?.sourceKind === 'illustrator'
              }
              onCreated={async (saved) => {
                await onChanged();
                await onOpenVariant(saved.sourceAssetId, tab);
              }}
            />
          ) : null}
          <DraftWithAiButton templateKey={templateKey} onOpenRender={onOpenRender} />
          {templateKey ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removingFromWorkspace}
                onClick={() => void removeFromWorkspace(templateKey)}
              >
                {' '}
                {translateUi('remove_from_workspace_bf720619')}{' '}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => onOpenRender?.({ templateKey })}
              >
                <Play className="size-3.5" aria-hidden /> {translateUi(
                  'render_with_this_c249855a',
                )}{' '}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <input
        ref={fontInput}
        type="file"
        multiple
        accept=".ttf,.otf"
        className="sr-only"
        tabIndex={-1}
        aria-label={translateUi('font_files_5870d625')}
        onChange={(event) => {
          void addFontFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {/* The picture on the left; the facts and then the checks on the right, the way a deployment
          reads. Stacked below lg. */}
      <div className="grid divide-y divide-border lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:divide-x lg:divide-y-0">
        {/* The preview: one format at a time at its true shape, the newest render's file for it
            when there is one, else the drawing of its measured boxes — and the badge says which. */}
        <div className="flex min-w-0 flex-col gap-2 p-[var(--card-pad)]">
          <TemplateMorph id={assetId}>
            {format ? (
              <FormatPreview
                label={translateUi('template_preview_df89bd92')}
                formats={formats}
                value={format.id}
                onValueChange={setFormatId}
                wellClassName="h-[min(60vh,40rem)]"
                frame={(picked) => {
                  if (editingText && source.parse)
                    return {
                      mode: 'estimate' as const,
                      node: (
                        <TemplateTextRepairCanvas
                          parse={source.parse}
                          ratio={picked.ratio}
                          comp={picked.comp?.name ?? null}
                          backgroundUrl={
                            rendered?.kind === 'image' &&
                            renderedJob?.templateSource?.versionId === source.versionId
                              ? rendered.url
                              : undefined
                          }
                          moves={textMoves}
                          selectedKey={
                            selectedTextBox?.instance
                              ? textMoveKey(selectedTextBox.instance)
                              : undefined
                          }
                          onSelect={setSelectedTextKey}
                          availableFonts={editableFonts.flatMap((font) =>
                            font.postScriptName ? [font.postScriptName] : [],
                          )}
                          onMove={(move) =>
                            setTextMoves((previous) => ({
                              ...previous,
                              [textMoveKey(move)]: move,
                            }))
                          }
                        />
                      ),
                      caption:
                        'Drag text to move it, drag a corner to resize, or drop a font onto it. Arrow keys also work. Font appearance needs a test render after Save.',
                    };
                  const estimate =
                    picked.ratio && drawnRatios.has(picked.ratio) ? (
                      <TemplateWireframe
                        brandId={brandId}
                        templateKey={templateKey}
                        parse={source.parse}
                        ratio={picked.ratio}
                        comp={picked.comp?.name}
                        className="size-full bg-background"
                      />
                    ) : undefined;
                  if (rendered && renderedJob) {
                    return {
                      mode: 'rendered',
                      at: renderedJob.finishedAt ?? renderedJob.updatedAt,
                      node: (
                        <OutputFile
                          key={fullSrc(rendered)}
                          output={rendered}
                          alt={`${name} · ${picked.ratio ?? picked.label}`}
                          muted
                        />
                      ),
                      estimate,
                      caption: rendered.fileName,
                    };
                  }
                  return estimate ? { mode: 'estimate', node: estimate } : { mode: 'none' };
                }}
              />
            ) : (
              <div className="flex h-[min(60vh,40rem)] items-center justify-center bg-muted/40 text-xs text-muted-foreground">
                {' '}
                {translateUi('no_formats_read_from_this_file_yet_b1657b14')}{' '}
              </div>
            )}
          </TemplateMorph>
          {missingFootage.length > 0 ? (
            <section
              className="rounded-md border border-destructive/50 p-3 text-xs"
              aria-label={translateUi('missing_media_repair_e135544e')}
            >
              <p className="mb-2 font-semibold">
                {missingFootage.length} {translateUi('missing_media_file_fc1331e6')}
                {missingFootage.length === 1 ? '' : 's'}{' '}
                {translateUi('drop_each_replacement_onto_its_name_d19f50c6')}{' '}
              </p>
              <SourceRebindPanel
                repairOnly
                brandId={brandId}
                assetId={assetId}
                expectedVersionId={source.versionId}
                aepName={source.parse?.filename}
                missingFootage={missingFootage}
                onNeedsReview={(versionId) => {
                  setSavedMediaRepair(versionId);
                  setTab('source');
                }}
                onConfirmed={async () => {
                  await Promise.all([onChanged(), loadVariables()]);
                  setSavedMediaRepair(null);
                }}
              />
            </section>
          ) : null}
          {(source.family === 'after_effects' || source.family === 'after_effects_package') &&
          source.parseState === 'parsed' ? (
            <div className="flex flex-wrap items-center gap-2">
              {editingText ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      savingText ||
                      !Object.values(textMoves).some(
                        (move) => move.dx || move.dy || move.dw || move.dh || move.font,
                      )
                    }
                    onClick={() => void saveTextMoves()}
                  >
                    {savingText ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}{' '}
                    {translateUi('save_text_layout_1434bf4c')}{' '}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingText}
                    onClick={() => {
                      setEditingText(false);
                      setTextMoves({});
                    }}
                  >
                    {' '}
                    {translateUi('cancel_19766ed6')}{' '}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    Boolean(savedTextRepair) ||
                    !wireframeFrames(source.parse).some((frame) =>
                      frame.boxes.some((box) => box.kind === 'text' && box.instance),
                    )
                  }
                  title={translateUi('move_and_resize_text_in_your_after__4dae78b8')}
                  onClick={() => setEditingText(true)}
                >
                  {' '}
                  {translateUi('repair_text_81e7778d')}{' '}
                </Button>
              )}
            </div>
          ) : null}
          {editingText ? (
            <div className="flex flex-col gap-2 text-xs">
              <p className="text-muted-foreground">
                {' '}
                {translateUi('select_text_on_the_preview_then_cli_bf730046')}{' '}
              </p>
              {selectedTextBox ? (
                <div className="flex items-center gap-2">
                  <span className="min-w-32 truncate">{selectedTextBox.label}</span>
                  <Select
                    value={textMoves[textMoveKey(selectedTextBox.instance!)]?.font || KEEP_FONT}
                    onValueChange={(value) => applyTextFont(value === KEEP_FONT ? '' : value)}
                  >
                    <SelectTrigger
                      size="sm"
                      className="min-w-0 flex-1 text-xs"
                      aria-label={translateUi('font_for_value0_01fc221c', {
                        value0: String(selectedTextBox.label),
                      })}
                    >
                      <SelectValue
                        items={Object.fromEntries([
                          [KEEP_FONT, 'Keep current font'],
                          ...editableFonts.flatMap((font) =>
                            font.postScriptName
                              ? [[font.postScriptName, `${font.family} · ${font.style}`]]
                              : [],
                          ),
                        ])}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KEEP_FONT}>
                        {translateUi('keep_current_font_9fd078f9')}
                      </SelectItem>
                      {editableFonts.map((font) =>
                        font.postScriptName ? (
                          <SelectItem key={font.id} value={font.postScriptName}>
                            {font.family} · {font.style}
                          </SelectItem>
                        ) : null,
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <fieldset
                className="flex max-h-28 flex-wrap gap-1 overflow-y-auto rounded-md border border-dashed border-input p-2"
                aria-label={translateUi('fonts_available_to_drag_onto_text_d_63f078a5')}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
                }}
                onDrop={(event) => {
                  if (!event.dataTransfer.files.length) return;
                  event.preventDefault();
                  if (!fontBusy) void addFontFiles(Array.from(event.dataTransfer.files));
                }}
              >
                {editableFonts.map((font) => (
                  <Button
                    key={font.id}
                    type="button"
                    variant="outline"
                    size="xs"
                    draggable
                    className="h-auto cursor-grab px-2 py-1 text-left font-normal active:cursor-grabbing"
                    title={translateUi('drag_onto_text_or_click_to_apply_to_86f00a58', {
                      value0: String(selectedTextBox?.label ?? 'selected text'),
                    })}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(TEXT_REPAIR_FONT_MIME, font.postScriptName ?? '');
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => applyTextFont(font.postScriptName ?? '')}
                  >
                    {font.family} · {font.style}
                  </Button>
                ))}
                {editableFonts.length === 0 ? (
                  <span className="text-muted-foreground">
                    {' '}
                    {translateUi('drop_ttf_or_otf_files_here_or_use_a_b51d3aa8')}{' '}
                  </span>
                ) : null}
              </fieldset>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="w-fit"
                disabled={fontBusy}
                onClick={() => fontInput.current?.click()}
              >
                {' '}
                {translateUi('add_font_files_7ad2d46a')}{' '}
              </Button>
              {fontCandidates && fontCandidates.missing.length > 0 ? (
                <FontSubstitutions
                  candidates={fontCandidates}
                  busy={fontBusy}
                  onUpload={() => fontInput.current?.click()}
                  onApply={applyFontSubstitutions}
                />
              ) : null}
            </div>
          ) : null}
          {savedTextRepair ? (
            <div
              role="alert"
              className="rounded border border-warning/40 bg-warning/10 p-3 text-xs"
            >
              <strong>{translateUi('your_text_changes_are_saved_but_not_eb0f1d86')}</strong>{' '}
              {translateUi('the_template_still_uses_the_previou_c548978b')}{' '}
              <p className="mt-1">{savedTextRepair.error}</p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                onClick={() => setTab('source')}
              >
                {' '}
                {translateUi('review_saved_version_ac1e6d7c')}{' '}
              </Button>
            </div>
          ) : null}
          {!rendered && source.parse && drawnRatios.size > 0 ? (
            <p className="text-xs text-muted-foreground">
              {' '}
              {translateUi('this_preview_is_a_quick_layout_chec_3e0fbe85')}{' '}
            </p>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={selectTab} className="min-w-0 gap-0">
          <TabsList
            variant="line"
            className="h-auto min-h-9 w-full flex-wrap justify-start gap-x-3 gap-y-1 border-b px-[var(--card-pad)] py-2"
          >
            <TabsTrigger value="checks">{translateUi('checks_de07d072')}</TabsTrigger>
            <TabsTrigger value="layers">{translateUi('edit_layers_589e52a5')}</TabsTrigger>
            <TabsTrigger value="author">{translateUi('author_d95082a2')}</TabsTrigger>
            <TabsTrigger value="variants" className="flex-none px-0 text-xs">
              {' '}
              {translateUi('variants_63d2643b')}{' '}
              {revisionCatalog?.length ? `(${revisionCatalog.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="variables" className="flex-none px-0 text-xs">
              {' '}
              {translateUi('variables_02db55ba')}{' '}
            </TabsTrigger>
            <TabsTrigger value="mapping" className="flex-none px-0 text-xs">
              {' '}
              {translateUi('connected_layers_b5bc1739')}{' '}
            </TabsTrigger>
            {templateKey ? (
              <TabsTrigger value="output" className="flex-none px-0 text-xs">
                {' '}
                {translateUi('output_b2439bcb')}{' '}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="source" className="flex-none px-0 text-xs">
              {' '}
              {translateUi('replace_file_68ec54a9')}{' '}
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-none px-0 text-xs">
              {' '}
              {translateUi('details_45989de4')}{' '}
            </TabsTrigger>

            {templateKey ? (
              <TabsTrigger value="renders">{translateUi('render_ledger_8068f2c7')}</TabsTrigger>
            ) : null}
          </TabsList>
          <TabsContent value="checks" keepMounted>
            <FactList
              className="p-[var(--card-pad)]"
              facts={[
                {
                  icon: CircleDot,
                  label: translateUi('status_920e413c'),
                  value: <TemplateStatusPill status={status} />,
                },
                {
                  icon: RectangleHorizontal,
                  label: translateUi('formats_9f01769a'),
                  value: ratios.length ? (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {ratios.map((ratio) => (
                        <span
                          key={ratio}
                          className="inline-flex items-center gap-1 font-mono tabular-nums"
                        >
                          <RatioGlyph ratio={ratio} className="text-muted-foreground" />
                          {ratio}
                        </span>
                      ))}
                    </span>
                  ) : (
                    '—'
                  ),
                },
                {
                  icon: Variable,
                  label: translateUi('variables_02db55ba'),
                  numeric: true,
                  value: unassigned ? `${variableCount} · ${unassigned} unassigned` : variableCount,
                },
                {
                  icon: Type,
                  label: translateUi('fonts_3680fcad'),
                  numeric: true,
                  value: fontsFact,
                  ruleBefore: true,
                },
                {
                  icon: History,
                  label: translateUi('last_render_8b8dc7d8'),
                  value: jobs.length ? (
                    <span className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">
                        {lastFinished
                          ? formatRelativeTime(
                              lastFinished.finishedAt ?? lastFinished.updatedAt,
                              undefined,
                              currentUiLocale,
                            )
                          : translateUi('none_finished_b5034cf3')}
                      </span>
                      <TickBar ticks={jobs.map((job) => JOB_TICK[job.status]).reverse()} />
                    </span>
                  ) : (
                    'Never'
                  ),
                },
                {
                  icon: Layers,
                  label: translateUi('sets_fbb0f1b4'),
                  numeric: true,
                  value: setCount ?? '—',
                },
                {
                  icon: CalendarClock,
                  label: translateUi('updated_3a5ecca1'),
                  value: formatDate(source.updatedAt ?? source.createdAt, currentUiLocale),
                },
              ]}
            />

            <Panel title={translateUi('checks_de07d072')} bodyClassName="p-0">
              <CheckTable
                rows={checks}
                action={footerAction}
                focusRowRequest={{ name: 'Fonts', requestId: fontCheckFocusRequestId }}
              />
              <div className="border-t border-border">
                <TemplateActivity
                  ref={activityTrigger}
                  brandId={brandId}
                  assetId={assetId}
                  open={activityOpen}
                  onOpenChange={setActivityOpen}
                />
              </div>
            </Panel>
          </TabsContent>
          <TabsContent value="layers" keepMounted className="p-[var(--card-pad)]">
            <TemplateLayerEditor
              brandId={brandId}
              assetId={assetId}
              active={tab === 'layers'}
              versionId={source.versionId}
              name={source.displayName ?? source.parse?.filename ?? 'Template'}
              parse={source.parse}
              onSaved={async () => {
                await invalidateForgeBrand(queryClient, brandId);
                await Promise.all([onChanged(), loadVariables()]);
              }}
              onOpenVariant={(assetId) => onOpenVariant?.(assetId, 'layers')}
              onDraftChange={onDraftChange}
              hyperframesRevisionId={hyperframesRevisionId}
              onOpenFontRepair={() => setFontCheckFocusRequestId((requestId) => requestId + 1)}
              initialComp={initialComp}
              templateKey={templateKey}
            />
          </TabsContent>
          <TabsContent value="author" keepMounted className="p-[var(--card-pad)]">
            {mountedAuthorIdentity === authorIdentity ? (
              <TemplateAuthoringEditor
                key={`${assetId}:${source.versionId}:author`}
                brandId={brandId}
                assetId={assetId}
                versionId={source.versionId}
                name={source.displayName ?? 'Template'}
                parse={source.parse}
                active={tab === 'author'}
                onSaved={onChanged}
                onOpenVariant={onOpenVariant ? (id) => onOpenVariant(id, 'variants') : undefined}
                onOpenRender={onOpenRender}
                templateKey={templateKey}
                onDraftChange={onDraftChange}
                hyperframesRevisionId={hyperframesRevisionId}
              />
            ) : null}
          </TabsContent>
          <TabsContent value="variables" keepMounted>
            <VariableEditor
              brandId={brandId}
              variables={variables}
              savedDefaults={savedDefaults}
              savedBindings={savedBindings}
              parseState={parseState}
              saving={saving}
              onSave={onSave}
            />
          </TabsContent>
          <TabsContent value="mapping" keepMounted className="p-[var(--card-pad)]">
            <TemplateMappingReviewPanel review={mappingReview ?? null} />
          </TabsContent>
          {templateKey ? (
            <TabsContent value="output" keepMounted className="p-[var(--card-pad)]">
              {/* Renders nothing until the template's contract carries output settings. */}
              {/* The server resolves which binding holds this key; the page never asks. */}
              <OutputSettingsPanel brandId={brandId} templateKey={templateKey} bindingId={null} />
            </TabsContent>
          ) : null}
          <TabsContent value="source" keepMounted className="p-[var(--card-pad)]">
            {selectedRevisionVariant ? (
              <div className="space-y-2 text-xs">
                <p>
                  {DESIGN_SOURCE[selectedRevisionVariant.sourceKind]
                    ? translateUi('this_template_is_built_from_value0__9d2947ba', {
                        value0: String(DESIGN_SOURCE[selectedRevisionVariant.sourceKind]),
                      })
                    : translateUi('this_source_belongs_to_an_immutable_a9b3a9ee')}
                </p>
                {DESIGN_SOURCE[selectedRevisionVariant.sourceKind] ? (
                  <Button size="xs" variant="outline" onClick={() => setTab('layers')}>
                    {' '}
                    {translateUi('edit_layers_589e52a5')}{' '}
                  </Button>
                ) : (
                  <Button size="xs" variant="outline" onClick={() => setTab('variants')}>
                    {' '}
                    {translateUi('open_variants_489f83e0')}{' '}
                  </Button>
                )}
              </div>
            ) : (
              <SourceRebindPanel
                brandId={brandId}
                assetId={assetId}
                expectedVersionId={source.versionId}
                suggestedVersionId={savedTextRepair?.versionId ?? savedMediaRepair ?? undefined}
                aepName={source.parse?.filename}
                sourceFamily={source.family === 'presentation' ? 'presentation' : undefined}
                missingFootage={missingFootage}
                initialFile={revisionFile}
                onInitialFileTaken={onRevisionTaken}
                onConfirmed={async () => {
                  await Promise.all([onChanged(), loadVariables()]);
                  setSavedTextRepair(null);
                  setSavedMediaRepair(null);
                }}
              />
            )}
          </TabsContent>
          <TabsContent value="variants" keepMounted className="p-[var(--card-pad)]">
            <VariantsPanel
              brandId={brandId}
              assetId={assetId}
              expectedVersionId={source.versionId}
              onInspect={(assetId) => onOpenVariant?.(assetId, 'variants')}
              onBranch={(assetId) => onOpenVariant?.(assetId, 'layers')}
              onRender={onOpenRender}
              onEditLayers={() => setTab('layers')}
            />
          </TabsContent>
          <TabsContent value="details" keepMounted className="p-[var(--card-pad)]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">{translateUi('template_id_ef4b6c0a')}</dt>
              <dd className="break-all font-mono">{templateKey ?? '—'}</dd>
              {/* Where the build actually RAN, read off the run. Not a choice and not a control:
                the Details tab is operator plumbing, and a build has exactly one home. */}
              <dt className="text-muted-foreground">{translateUi('rendered_in_19741cbb')}</dt>
              <dd className="break-all font-mono">{run?.application ?? '—'}</dd>
              <dt className="text-muted-foreground">{translateUi('data_table_22c75109')}</dt>
              <dd className="break-all font-mono">{run?.root_table ?? '—'}</dd>
              <dt className="text-muted-foreground">{translateUi('file_id_2b27ef60')}</dt>
              <dd className="break-all font-mono">{assetId}</dd>
              <dt className="text-muted-foreground">{translateUi('original_file_0ee08b32')}</dt>
              <dd>
                {(() => {
                  const original = variantCatalog?.find((variant) => variant.assetId === assetId);
                  return original ? (
                    <Button
                      size="xs"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        void downloadLibraryAsset({
                          brandId,
                          assetId: original.originalAssetId,
                          versionId: original.originalVersionId,
                          fileName: original.originalFileName,
                        }).catch((error) => toast.error(error.message))
                      }
                    >
                      {original.originalFileName}
                    </Button>
                  ) : (
                    '—'
                  );
                })()}
              </dd>
              <dt className="text-muted-foreground">{translateUi('uploaded_3cc3767e')}</dt>
              <dd>{new Date(source.createdAt).toLocaleString(currentUiLocale)}</dd>
              <dt className="text-muted-foreground">{translateUi('file_version_c8df14a9')}</dt>
              <dd className="break-all font-mono">{source.versionId}</dd>
              <dt className="text-muted-foreground">{translateUi('source_file_8cfe49e4')}</dt>
              <dd className="break-all font-mono">{source.parse?.filename ?? '—'}</dd>
            </dl>
          </TabsContent>

          {templateKey ? (
            <TabsContent value="renders" keepMounted>
              <TemplateRenders brandId={brandId} templateKey={templateKey} formats={formats} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>

      <AlertDialog open={fontPlan !== null} onOpenChange={(open) => !open && setFontPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translateUi('install_fonts_on_this_template_22ae3fd4')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {' '}
              {translateUi('we_ll_upload_these_files_privately__dadd16f9')}{' '}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-1 text-xs">
            {fontPlan?.files.map((file) => (
              <li key={file.filename} className="break-all">
                {file.filename} · {file.bytes.toLocaleString(currentUiLocale)}{' '}
                {translateUi('bytes_277089d9')}{' '}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fontBusy}>
              {translateUi('cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction disabled={fontBusy} onClick={() => void installFonts()}>
              {' '}
              {translateUi('install_fonts_9de0db7c')}{' '}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
