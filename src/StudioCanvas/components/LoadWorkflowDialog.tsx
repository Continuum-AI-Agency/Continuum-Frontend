import type { PipelineManifest } from '@continuum/contracts';
import { Download, Ellipsis, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { PipelineContract } from '@/components/ai-studio/PipelineContract';
import { useApplyLibraryWorkflow, WorkflowCard } from '@/components/ai-studio/WorkflowLibrary';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/ToastProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { UiLocale } from '@/i18n/config';
import { useUiErrorMessage } from '@/i18n/errors';
import { useBrandPipelineManifests } from '@/lib/ai-studio/pipelines';
import { useWorkflowLibrary } from '@/lib/ai-studio/useWorkflowLibrary';
import {
  deleteAiStudioWorkflowAction,
  listAiStudioWorkflowsAction,
  updateAiStudioWorkflowAction,
} from '@/lib/ai-studio/workflowActions';
import type { AiStudioWorkflow } from '@/lib/schemas/aiStudio';
import type { WorkflowLibraryItem } from '@/lib/schemas/workflowLibrary';
import { useApplyWorkflow } from '../hooks/useApplyWorkflow';
import {
  filterWorkflowsByQuery,
  partitionSavedWorkflows,
  sortPremades,
  sortWorkflowsByRecency,
} from '../utils/workflowList';

const WORKFLOW_VISIBLE_ROWS = 6;
const WORKFLOW_ROW_HEIGHT = 72;

type MutationState =
  | { kind: 'idle' }
  | { kind: 'renaming'; workflowId: string; pendingName: string }
  | { kind: 'confirming-delete'; workflowId: string }
  | { kind: 'deleting'; workflowId: string }
  | { kind: 'saving'; workflowId: string };

const formatTimestamp = (value: string | undefined, locale: UiLocale = 'en') => {
  if (!value) return 'Unknown date';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'Unknown date';
  return new Date(timestamp).toLocaleDateString(locale);
};

type LoadWorkflowDialogProps = {
  brandProfileId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  /**
   * Turns the picker into an ATTACH picker: choosing a flow hands it to the caller as agent
   * context and loading moves to the row menu. The composer uses this so a person grabs the
   * same three tabs the canvas header offers instead of a separate, thinner list of its own.
   */
  onAttachWorkflow?: (workflow: AiStudioWorkflow) => void;
};

/**
 * The three things a person can reach for, and they are genuinely different kinds.
 *
 * `premade`  — shipped with the product, the same ten for everyone, in their curated order.
 * `saved`    — this brand's own, whole canvases and sub-graph techniques alike.
 * `pipeline` — published for the optimizer to run unattended. A promise, not a template.
 */
type WorkflowTab = 'premade' | 'saved' | 'pipeline';

type WorkflowPanelProps = {
  activeTab: WorkflowTab;
  onTabChange: (tab: WorkflowTab) => void;
  premades: WorkflowLibraryItem[];
  premadesLoading: boolean;
  onUsePremade: (item: WorkflowLibraryItem) => Promise<void> | void;
  pipelines: AiStudioWorkflow[];
  /** Manifests by pipeline id. Absent while the Backend read is still in flight. */
  manifestsById: Map<string, PipelineManifest>;
  onAttachWorkflow?: (workflow: AiStudioWorkflow) => void;
  brandProfileId?: string;
  error: string | null;
  filteredWorkflows: AiStudioWorkflow[];
  isLoading: boolean;
  mutationState: MutationState;
  onApplyWorkflow: (workflow: AiStudioWorkflow) => Promise<void> | void;
  onClose?: () => void;
  onDeleteConfirm: (workflowId: string) => Promise<void> | void;
  onDeleteRequest: (workflowId: string) => void;
  onMutationCancel: () => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onRenameCommit: (workflowId: string, name: string) => Promise<void> | void;
  onRenameRequest: (workflow: AiStudioWorkflow) => void;
  query: string;
};

function WorkflowRow({
  workflow,
  manifest,
  onAttachWorkflow,
  mutationState,
  onApplyWorkflow,
  onDeleteConfirm,
  onDeleteRequest,
  onMutationCancel,
  onRenameCommit,
  onRenameRequest,
}: {
  workflow: AiStudioWorkflow;
  /** Present only on the Pipelines tab — the declared contract plus whether it can run. */
  manifest?: PipelineManifest;
  /**
   * When set, the row's primary click ATTACHES the flow as agent context instead of merging
   * it onto the canvas, and loading moves into the overflow menu. The composer passes this;
   * the canvas header does not.
   */
  onAttachWorkflow?: (workflow: AiStudioWorkflow) => void;
  mutationState: MutationState;
  onApplyWorkflow: (workflow: AiStudioWorkflow) => Promise<void> | void;
  onDeleteConfirm: (workflowId: string) => Promise<void> | void;
  onDeleteRequest: (workflowId: string) => void;
  onMutationCancel: () => void;
  onRenameCommit: (workflowId: string, name: string) => Promise<void> | void;
  onRenameRequest: (workflow: AiStudioWorkflow) => void;
}) {
  const calendarLocale = useUiLocale();

  const translateUi = useUiTranslations('studio');

  const isRenaming = mutationState.kind === 'renaming' && mutationState.workflowId === workflow.id;
  const isConfirmingDelete =
    mutationState.kind === 'confirming-delete' && mutationState.workflowId === workflow.id;
  const isDeleting = mutationState.kind === 'deleting' && mutationState.workflowId === workflow.id;
  const isSaving = mutationState.kind === 'saving' && mutationState.workflowId === workflow.id;

  const renameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  if (isRenaming || isSaving) {
    const pendingName =
      mutationState.kind === 'renaming' ? mutationState.pendingName : workflow.name;
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Input
          ref={renameInputRef}
          defaultValue={pendingName}
          className="h-7 text-xs"
          disabled={isSaving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void onRenameCommit(workflow.id, e.currentTarget.value.trim());
            }
            if (e.key === 'Escape') {
              onMutationCancel();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={isSaving}
          onClick={(e) => {
            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
            void onRenameCommit(workflow.id, input.value.trim());
          }}
        >
          {isSaving ? translateUi('saving_23e39291') : translateUi('save_1509f561')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={isSaving}
          onClick={onMutationCancel}
        >
          {' '}
          {translateUi('cancel_19766ed6')}{' '}
        </Button>
      </div>
    );
  }

  if (isConfirmingDelete || isDeleting) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <p className="text-xs text-foreground">
          {' '}
          {translateUi('delete_e2d0a549')} <span className="font-medium">{workflow.name}</span>
          {translateUi('this_cannot_be_undone_7f5d26a5')}{' '}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-2 text-xs"
            disabled={isDeleting}
            onClick={() => void onDeleteConfirm(workflow.id)}
          >
            {isDeleting ? translateUi('deleting_43b5894c') : translateUi('delete_e2d0a549')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={isDeleting}
            onClick={onMutationCancel}
          >
            {' '}
            {translateUi('cancel_19766ed6')}{' '}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex w-full items-start gap-3 px-3 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 text-left transition-colors hover:text-primary"
        onClick={() =>
          onAttachWorkflow ? onAttachWorkflow(workflow) : void onApplyWorkflow(workflow)
        }
      >
        <p className="truncate text-sm font-medium text-foreground">{workflow.name}</p>
        {workflow.description && (
          <p className="truncate text-xs text-secondary">{workflow.description}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {' '}
          {translateUi('updated_3a5ecca1')}{' '}
          {formatTimestamp(workflow.updatedAt ?? workflow.createdAt, calendarLocale)}
        </p>
        {manifest && <PipelineContract manifest={manifest} className="mt-1.5" />}
      </button>

      <div className="mt-1 flex shrink-0 items-center gap-1">
        <span className="rounded border border-border/70 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
          {onAttachWorkflow ? translateUi('attach_d406ade2') : translateUi('load_8a6bdb6b')}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label={translateUi('options_for_value0_9846f3af', {
                  value0: String(workflow.name),
                })}
                onClick={(e) => e.stopPropagation()}
              >
                <Ellipsis className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            {onAttachWorkflow && (
              <DropdownMenuItem onSelect={() => void onApplyWorkflow(workflow)}>
                <Download className="mr-2 h-3.5 w-3.5" /> {translateUi(
                  'load_onto_canvas_08aab4ef',
                )}{' '}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onRenameRequest(workflow)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> {translateUi('rename_3064d79a')}{' '}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteRequest(workflow.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> {translateUi('delete_e2d0a549')}{' '}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function WorkflowPanel({
  activeTab,
  onTabChange,
  premades,
  premadesLoading,
  onUsePremade,
  pipelines,
  manifestsById,
  onAttachWorkflow,
  brandProfileId,
  error,
  filteredWorkflows,
  isLoading,
  mutationState,
  onApplyWorkflow,
  onClose,
  onDeleteConfirm,
  onDeleteRequest,
  onMutationCancel,
  onQueryChange,
  onRefresh,
  onRenameCommit,
  onRenameRequest,
  query,
}: WorkflowPanelProps) {
  const translateUi = useUiTranslations('studio');

  // Search applies to whichever list is on screen; a query that filters the tab you are not
  // looking at is how a tab reads as empty when it is not.
  const rows = React.useMemo(
    () => (activeTab === 'pipeline' ? filterWorkflowsByQuery(pipelines, query) : filteredWorkflows),
    [activeTab, filteredWorkflows, pipelines, query],
  );
  const savedCount = filteredWorkflows.length;

  return (
    <div className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {translateUi('my_workflows_a749a3fd')}
          </p>
          <p className="text-xs text-muted-foreground">
            {activeTab === 'premade'
              ? translateUi('templates_that_ship_with_continuum__9042db4c')
              : activeTab === 'pipeline'
                ? translateUi('published_for_the_optimizer_to_run__86f56c07')
                : translateUi('your_saved_workflows_search_load_re_b2537890')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={!brandProfileId || isLoading}
            aria-label={translateUi('refresh_workflows_b67b81be')}
            title={
              !brandProfileId
                ? translateUi('select_a_brand_profile_to_load_work_9a35cf7b')
                : translateUi('refresh_workflows_b67b81be')
            }
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              aria-label={translateUi('close_workflow_loader_38308cec')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as WorkflowTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="premade" className="text-xs">
            {' '}
            {translateUi('pre_mades_f8df8130')}{' '}
          </TabsTrigger>
          <TabsTrigger value="saved" className="text-xs">
            {' '}
            {translateUi('saved_b5c120b3')}
            {savedCount > 0 ? ` (${savedCount})` : ''}
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs">
            {' '}
            {translateUi('pipelines_d1a8fffe')}
            {pipelines.length > 0 ? ` (${pipelines.length})` : ''}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'premade' ? (
        <PremadeGrid items={premades} isLoading={premadesLoading} onUse={onUsePremade} />
      ) : (
        <>
          <Input
            placeholder={
              activeTab === 'pipeline'
                ? translateUi('search_your_pipelines_050db05f')
                : translateUi('search_your_saved_workflows_090c7be0')
            }
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            disabled={!brandProfileId}
          />

          {!brandProfileId && (
            <p className="text-xs text-muted-foreground">
              {' '}
              {translateUi('select_a_brand_profile_to_see_your__3277a550')}{' '}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="overflow-hidden rounded-md border border-subtle bg-surface">
            <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
              {isLoading ? (
                <div className="p-3 text-xs text-secondary">
                  {translateUi('loading_workflows_6de60ee0')}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState tab={activeTab} query={query} />
              ) : (
                <div className="divide-y divide-border/70">
                  {rows.map((workflow) => (
                    <WorkflowRow
                      key={workflow.id}
                      workflow={workflow}
                      manifest={
                        activeTab === 'pipeline' ? manifestsById.get(workflow.id) : undefined
                      }
                      onAttachWorkflow={onAttachWorkflow}
                      mutationState={mutationState}
                      onApplyWorkflow={onApplyWorkflow}
                      onDeleteConfirm={onDeleteConfirm}
                      onDeleteRequest={onDeleteRequest}
                      onMutationCancel={onMutationCancel}
                      onRenameCommit={onRenameCommit}
                      onRenameRequest={onRenameRequest}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What an empty tab says. Each one names the action that fills it — "nothing here" with no
 * way forward is the state people screenshot and send to support.
 */
function EmptyState({ tab, query }: { tab: WorkflowTab; query: string }) {
  const translateUi = useUiTranslations('studio');

  if (query) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Download className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">
          {translateUi('nothing_matches_fd6075a1')}
          {query}”
        </p>
        <p className="text-xs text-muted-foreground">
          {translateUi('try_a_different_name_4e761553')}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <Download className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        {tab === 'pipeline'
          ? translateUi('no_pipelines_published_yet_81994b22')
          : translateUi('no_saved_workflows_yet_9668c6f1')}
      </p>
      <p className="text-xs text-muted-foreground">
        {tab === 'pipeline'
          ? translateUi('build_a_canvas_leave_an_input_unwir_7fb2922f')
          : translateUi('build_a_workflow_in_the_canvas_and__3e7c151a')}
      </p>
    </div>
  );
}

/** The pre-mades, with the mini-canvas preview the Templates popover used. */
function PremadeGrid({
  items,
  isLoading,
  onUse,
}: {
  items: WorkflowLibraryItem[];
  isLoading: boolean;
  onUse: (item: WorkflowLibraryItem) => Promise<void> | void;
}) {
  const translateUi = useUiTranslations('studio');

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface">
      <ScrollArea style={{ height: `${WORKFLOW_VISIBLE_ROWS * WORKFLOW_ROW_HEIGHT}px` }}>
        {isLoading ? (
          <div className="p-3 text-xs text-secondary">
            {translateUi('loading_templates_3800ee71')}
          </div>
        ) : items.length === 0 ? (
          <div className="p-3 text-xs text-secondary">
            {translateUi('no_templates_available_805cbc51')}
          </div>
        ) : (
          <div className="grid gap-3 p-3">
            {items.map((item) => (
              <WorkflowCard key={item.id} item={item} onUse={onUse} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function LoadWorkflowDialog({
  brandProfileId,
  open,
  onOpenChange,
  showTrigger = true,
  onAttachWorkflow,
}: LoadWorkflowDialogProps) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

  const applyWorkflowToCanvas = useApplyWorkflow();
  const { show } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [workflows, setWorkflows] = React.useState<AiStudioWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  // Pre-mades first: someone opening this without having saved anything should land on the
  // tab that has something in it, not on their own empty shelf.
  const [activeTab, setActiveTab] = React.useState<WorkflowTab>('premade');
  const [mutationState, setMutationState] = React.useState<MutationState>({ kind: 'idle' });
  const isOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const fetchWorkflows = React.useCallback(async () => {
    if (!brandProfileId) {
      setWorkflows([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await listAiStudioWorkflowsAction(brandProfileId);
      setWorkflows(sortWorkflowsByRecency(result));
    } catch (err) {
      const message = uiErrorText(err);
      setError(message);
      show({ title: translateUi('load_failed_d352597f'), description: message, variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [brandProfileId, show, translateUi, uiErrorText]);

  React.useEffect(() => {
    if (isOpen) {
      void fetchWorkflows();
    }
  }, [fetchWorkflows, isOpen]);

  // A published pipeline leaves the saved list — see partitionSavedWorkflows for why showing
  // it twice makes the third tab meaningless.
  const { saved, pipelines } = React.useMemo(() => partitionSavedWorkflows(workflows), [workflows]);

  const filteredWorkflows = React.useMemo(
    () => filterWorkflowsByQuery(saved, query),
    [query, saved],
  );

  // The Backend read, for the runnability half of the contract. The declared ports are on
  // the row already; `handle_free` is not — it is occupancy, and only the walker knows.
  // Gated on the Pipelines tab so opening the panel on Pre-mades pays nothing.
  const manifests = useBrandPipelineManifests(
    isOpen && activeTab === 'pipeline' ? brandProfileId : undefined,
  );
  const manifestsById = React.useMemo(
    () => new Map((manifests.data ?? []).map((manifest) => [manifest.pipeline_id, manifest])),
    [manifests.data],
  );

  // Fetched only while the panel is open, and cached for 30 minutes by the query — the ten
  // templates are the same for everyone and change about never.
  const library = useWorkflowLibrary({ enabled: isOpen });
  const premades = React.useMemo(() => sortPremades(library.items), [library.items]);
  const applyLibraryWorkflow = useApplyLibraryWorkflow();

  const usePremade = React.useCallback(
    async (item: WorkflowLibraryItem) => {
      await applyLibraryWorkflow(item);
      setOpen(false);
    },
    [applyLibraryWorkflow, setOpen],
  );

  const applyWorkflow = React.useCallback(
    async (workflow: AiStudioWorkflow) => {
      await applyWorkflowToCanvas(workflow);
      setOpen(false);
    },
    [applyWorkflowToCanvas, setOpen],
  );

  const attachWorkflow = React.useCallback(
    (workflow: AiStudioWorkflow) => {
      onAttachWorkflow?.(workflow);
      setOpen(false);
    },
    [onAttachWorkflow, setOpen],
  );

  const handleRenameRequest = React.useCallback((workflow: AiStudioWorkflow) => {
    setMutationState({ kind: 'renaming', workflowId: workflow.id, pendingName: workflow.name });
  }, []);

  const handleRenameCommit = React.useCallback(
    async (workflowId: string, name: string) => {
      if (!brandProfileId) return;
      const trimmed = name.trim();
      if (!trimmed) return;

      setMutationState({ kind: 'saving', workflowId });
      try {
        await updateAiStudioWorkflowAction({ brandProfileId, workflowId, name: trimmed });
        show({
          title: translateUi('workflow_renamed_da70edbe'),
          description: trimmed,
          variant: 'success',
        });
        setMutationState({ kind: 'idle' });
        void fetchWorkflows();
      } catch (err) {
        const message = uiErrorText(err);
        show({
          title: translateUi('rename_failed_d0fbffa5'),
          description: message,
          variant: 'error',
        });
        setMutationState({ kind: 'idle' });
      }
    },
    [brandProfileId, fetchWorkflows, show, translateUi, uiErrorText],
  );

  const handleDeleteRequest = React.useCallback((workflowId: string) => {
    setMutationState({ kind: 'confirming-delete', workflowId });
  }, []);

  const handleDeleteConfirm = React.useCallback(
    async (workflowId: string) => {
      if (!brandProfileId) return;

      setMutationState({ kind: 'deleting', workflowId });
      try {
        await deleteAiStudioWorkflowAction({ brandProfileId, workflowId });
        show({ title: translateUi('workflow_deleted_6721a3e7'), variant: 'success' });
        setMutationState({ kind: 'idle' });
        void fetchWorkflows();
      } catch (err) {
        const message = uiErrorText(err);
        show({
          title: translateUi('delete_failed_8727e2ba'),
          description: message,
          variant: 'error',
        });
        setMutationState({ kind: 'idle' });
      }
    },
    [brandProfileId, fetchWorkflows, show, translateUi, uiErrorText],
  );

  const handleMutationCancel = React.useCallback(() => {
    setMutationState({ kind: 'idle' });
  }, []);

  const panelProps: WorkflowPanelProps = {
    activeTab,
    onTabChange: setActiveTab,
    premades,
    premadesLoading: library.isLoading,
    onUsePremade: usePremade,
    pipelines,
    manifestsById,
    ...(onAttachWorkflow ? { onAttachWorkflow: attachWorkflow } : {}),
    brandProfileId,
    error,
    filteredWorkflows,
    isLoading,
    mutationState,
    onApplyWorkflow: applyWorkflow,
    onClose: () => setOpen(false),
    onDeleteConfirm: handleDeleteConfirm,
    onDeleteRequest: handleDeleteRequest,
    onMutationCancel: handleMutationCancel,
    onQueryChange: setQuery,
    onRefresh: () => {
      void fetchWorkflows();
    },
    onRenameCommit: handleRenameCommit,
    onRenameRequest: handleRenameRequest,
    query,
  };

  if (!showTrigger) {
    if (!isOpen) return null;
    return (
      <div className="fixed right-4 top-20 z-[120] w-[clamp(340px,85vw,500px)] rounded-md border bg-popover text-popover-foreground shadow-lg">
        <WorkflowPanel {...panelProps} />
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> {translateUi('my_workflows_a749a3fd')}{' '}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[clamp(340px,85vw,500px)] p-0">
        <WorkflowPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
}
