'use client';

import {
  type Automation,
  type AutomationCapabilitiesResponse,
  type AutomationWorkflowDefinition,
  type AutomationWorkflowNode,
  type AutomationWorkflowValidation,
  type TestAutomationWorkflowResponse,
  validateAutomationWorkflow,
} from '@continuum/contracts';
import {
  addEdge,
  BackgroundVariant,
  type Connection,
  type ConnectionLineComponent,
  type EdgeTypes,
  type NodeTypes,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import {
  AlertCircle,
  Beaker,
  Cable,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Cloud,
  Lock,
  PanelLeftClose,
  PanelRightClose,
  Save,
  Search,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Canvas } from '@/components/ai-elements/canvas';
import { Connection as CanvasConnection } from '@/components/ai-elements/connection';
import { Controls as CanvasControls } from '@/components/ai-elements/controls';
import { Panel as CanvasPanel } from '@/components/ai-elements/panel';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  fetchAutomation,
  fetchAutomationCapabilities,
  fetchAutomationWebhookResources,
  fetchAutomationWorkflow,
  publishAutomationWorkflow,
  saveAutomationWorkflowDraft,
  testAutomationWorkflow,
  unpublishAutomationWorkflow,
  updateAutomation,
  useAutomationRunDetail,
  useRunAutomationNow,
  validateAutomationWorkflowForPublish,
} from '@/lib/automations/automations';
import {
  type ResolvedNodeCapability,
  resolveNodeLifecycle,
} from '@/lib/automations/capability-lifecycle';
import { cn } from '@/lib/utils';
import {
  applyDefinitionToCanvasNodes,
  errorMessage,
  IconButton,
  issueCount,
  type SaveState,
  type VersionState,
  WebhookManager,
  type WebhookResources,
  WorkflowInspector,
} from './AutomationWorkspacePanels';
import { AUTOMATION_NODE_CATALOG, createAutomationWorkflowNode } from './automationNodeCatalog';
import { PublishReadinessDialog } from './PublishReadinessDialog';
import { type RightRailTab, RightRailTabs } from './runs/RightRailTabs';
import { RunHistoryPanel } from './runs/RunHistoryPanel';
import { useActiveRun } from './runs/useActiveRun';
import { WorkflowCanvasContextMenu, type WorkflowMenuTarget } from './WorkflowCanvasContextMenu';
import { type WorkflowCanvasEdge, WorkflowEdge } from './WorkflowEdge';
import { type WorkflowCanvasNode, WorkflowNodeCard } from './WorkflowNodeCard';
import {
  evaluateWorkflowConnection,
  findCompatibleWorkflowConnection,
  toCanvasEdges,
  toCanvasNodes,
  toWorkflowDefinition,
} from './workflowCanvasModel';
import {
  liveExecutionsByNodeId,
  testExecutionsByNodeId,
  workflowEdgeExecutionState,
} from './workflowVisualState';

const nodeTypes: NodeTypes = { workflow: WorkflowNodeCard };
const edgeTypes: EdgeTypes = { workflow: WorkflowEdge };
const workflowConnectionLine = CanvasConnection as ConnectionLineComponent<WorkflowCanvasNode>;

type ActiveOperation = 'test' | 'run' | 'publish' | 'unpublish' | 'toggle' | null;
type CanvasDensity = 'overview' | 'compact' | 'detail';

const operationLabel: Record<Exclude<ActiveOperation, null>, string> = {
  test: 'Testing',
  run: 'Queuing',
  publish: 'Publishing',
  unpublish: 'Unpublishing',
  toggle: 'Updating',
};

const nextNodePosition = (count: number) => ({
  x: 120 + (count % 4) * 310,
  y: 120 + (Math.floor(count / 4) % 4) * 210,
});

function WorkflowStatusBadge({ isPublished, enabled }: { isPublished: boolean; enabled: boolean }) {
  if (!isPublished) {
    return (
      <Badge variant="warning">
        <Save aria-hidden="true" />
        Unpublished draft
      </Badge>
    );
  }
  return (
    <Badge variant={enabled ? 'success' : 'muted'}>
      {enabled ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}
      {enabled ? 'Published · active' : 'Published · paused'}
    </Badge>
  );
}

// The palette advertises what you would GET if you dropped the node, so it
// resolves the lifecycle of the node the factory actually builds rather than
// reading the bundled constant keyed by type.
const paletteCapabilities = (
  capabilities: AutomationCapabilitiesResponse | null,
): Map<AutomationWorkflowNode['type'], ResolvedNodeCapability> =>
  new Map(
    AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).map((item) => [
      item.type,
      resolveNodeLifecycle({
        node: createAutomationWorkflowNode({
          type: item.type,
          position: { x: 0, y: 0 },
          id: `palette-${item.type}`,
        }),
        capabilities,
      }),
    ]),
  );

function NodePalette({
  locked,
  capabilities,
  onAdd,
}: {
  locked: boolean;
  capabilities: AutomationCapabilitiesResponse | null;
  onAdd: (type: AutomationWorkflowNode['type']) => void;
}) {
  const capabilityByType = useMemo(() => paletteCapabilities(capabilities), [capabilities]);

  return (
    <Command className="rounded-none bg-transparent">
      <CommandInput disabled={locked} placeholder="Find a node…" />
      <CommandList className="max-h-none flex-1">
        <CommandEmpty>No matching node.</CommandEmpty>
        {AUTOMATION_NODE_CATALOG.map((group) => (
          <CommandGroup
            key={group.category}
            heading={group.label}
            className="px-2 pb-2 [&_[cmdk-group-heading]]:pt-2"
          >
            <p className="px-2 pb-1.5 text-[11px] leading-4 text-muted-foreground">
              {group.description}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const capability = capabilityByType.get(item.type);
              const lifecycle = capability?.lifecycle ?? 'production';
              const unavailable = capability?.availability === 'unavailable';
              return (
                <CommandItem
                  key={item.type}
                  disabled={locked}
                  value={`${item.label} ${item.description} ${item.type}`}
                  onSelect={() => onAdd(item.type)}
                  className={cn(
                    'items-start py-2.5',
                    (lifecycle === 'preview' || unavailable) && 'opacity-55 grayscale-[0.35]',
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-card">
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      {item.label}
                      {unavailable ? (
                        <Badge variant="destructive">Unavailable</Badge>
                      ) : lifecycle === 'preview' ? (
                        <Badge variant="muted">Preview</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function LoadingWorkspace({ message }: { message: string }) {
  return (
    <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
      <div className="flex items-center gap-2">
        <Spinner />
        {message}
      </div>
    </div>
  );
}

function Workspace({ automation: initialAutomation }: { automation: Automation }) {
  const { fitView, screenToFlowPosition, setViewport, zoomTo } = useReactFlow<
    WorkflowCanvasNode,
    WorkflowCanvasEdge
  >();
  const { activeRunId, focusRun } = useActiveRun();
  const [automation, setAutomation] = useState(initialAutomation);
  const [base, setBase] = useState<AutomationWorkflowDefinition | null>(null);
  const [revision, setRevision] = useState(0);
  const [versionId, setVersionId] = useState('');
  const [versionState, setVersionState] = useState<VersionState>('published');
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowCanvasEdge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasDensity, setCanvasDensity] = useState<CanvasDensity>('detail');
  const [menuTarget, setMenuTarget] = useState<WorkflowMenuTarget>({
    kind: 'pane',
    position: { x: 0, y: 0 },
  });
  const [connectionFeedback, setConnectionFeedback] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState<RightRailTab>('inspector');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [activeOperation, setActiveOperation] = useState<ActiveOperation>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestAutomationWorkflowResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceCapabilities, setSourceCapabilities] =
    useState<AutomationCapabilitiesResponse | null>(null);
  const [webhookResources, setWebhookResources] = useState<WebhookResources>({
    endpoints: [],
    destinations: [],
  });
  const lastSavedRef = useRef('');
  const lastConnectionEvaluationRef = useRef<ReturnType<typeof evaluateWorkflowConnection>>({
    valid: false,
    code: 'incomplete',
    reason: 'Choose both an output and an input.',
  });
  const liveRunQuery = useAutomationRunDetail(activeRunId ?? undefined);
  const runNowMutation = useRunAutomationNow(automation.brandId);

  const locked = automation.isPublished || versionState !== 'draft';
  const definition = useMemo(
    () => (base ? toWorkflowDefinition({ base, nodes, edges }) : null),
    [base, edges, nodes],
  );
  const validation = useMemo<AutomationWorkflowValidation | null>(
    () => (definition ? validateAutomationWorkflow(definition) : null),
    [definition],
  );
  const executionByNodeId = useMemo(() => {
    if (activeRunId) {
      return liveExecutionsByNodeId(liveRunQuery.data?.nodeRuns ?? []);
    }
    return testExecutionsByNodeId(testResult);
  }, [activeRunId, liveRunQuery.data?.nodeRuns, testResult]);
  const selected = nodes.find((node) => node.id === selectedId)?.data.workflowNode ?? null;
  const selectedExecution = selectedId ? executionByNodeId.get(selectedId) : undefined;
  const selectedNodeRuns = useMemo(
    () => (liveRunQuery.data?.nodeRuns ?? []).filter((nodeRun) => nodeRun.nodeId === selectedId),
    [liveRunQuery.data?.nodeRuns, selectedId],
  );
  const busy = activeOperation !== null;

  useEffect(() => {
    void fetchAutomationCapabilities(automation.brandId)
      .then(setSourceCapabilities)
      .catch(() => setSourceCapabilities(null));
    void fetchAutomationWebhookResources(automation.brandId)
      .then(setWebhookResources)
      .catch(() => setWebhookResources({ endpoints: [], destinations: [] }));
  }, [automation.brandId]);

  useEffect(() => {
    let cancelled = false;
    void fetchAutomationWorkflow(automation.id)
      .then((response) => {
        if (cancelled) return;
        const nextLocked = response.version.state !== 'draft';
        const localValidation = validateAutomationWorkflow(response.version.definition);
        setBase(response.version.definition);
        setNodes(
          toCanvasNodes({
            definition: response.version.definition,
            validation: localValidation,
            locked: nextLocked,
          }),
        );
        setEdges(toCanvasEdges({ definition: response.version.definition }));
        setRevision(response.version.revision);
        setVersionId(response.version.id);
        setVersionState(response.version.state);
        lastSavedRef.current = JSON.stringify(response.version.definition);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(errorMessage(error, 'Could not load this workflow.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [automation.id, setEdges, setNodes]);

  useEffect(() => {
    if (!definition || locked) return;
    const serialized = JSON.stringify(definition);
    if (serialized === lastSavedRef.current) return;
    setSaveState('saving');
    setTestResult(null);
    const timer = setTimeout(() => {
      void saveAutomationWorkflowDraft(automation.id, {
        definition,
        expectedRevision: revision,
      })
        .then((response) => {
          setRevision(response.version.revision);
          lastSavedRef.current = JSON.stringify(response.version.definition);
          setSaveState('saved');
        })
        .catch((error: unknown) => {
          setSaveState('error');
          setMessage(errorMessage(error, 'Could not save this draft.'));
        });
    }, 900);
    return () => clearTimeout(timer);
  }, [automation.id, definition, locked, revision]);

  useEffect(() => {
    if (selectedId && !nodes.some((node) => node.id === selectedId)) {
      setSelectedId(null);
    }
  }, [nodes, selectedId]);

  useEffect(() => {
    if (!connectionFeedback) return;
    const timer = window.setTimeout(() => setConnectionFeedback(null), 3_000);
    return () => window.clearTimeout(timer);
  }, [connectionFeedback]);

  const addNode = useCallback(
    (type: AutomationWorkflowNode['type'], position?: { x: number; y: number }) => {
      if (locked) return;
      const workflowNode = createAutomationWorkflowNode({
        type,
        position: position ?? nextNodePosition(nodes.length),
      });
      setNodes((current) => [
        ...current,
        {
          id: workflowNode.id,
          type: 'workflow',
          position: workflowNode.position,
          data: { workflowNode, locked: false, issues: [] },
        },
      ]);
      setSelectedId(workflowNode.id);
      setRightOpen(true);
    },
    [locked, nodes.length, setNodes],
  );

  const addConnectedNode = useCallback(
    (sourceId: string, type: AutomationWorkflowNode['type']) => {
      if (locked) return;
      const sourceNode = nodes.find((node) => node.id === sourceId);
      if (!sourceNode) return;

      const outgoingCount = edges.filter((edge) => edge.source === sourceId).length;
      const workflowNode = createAutomationWorkflowNode({
        type,
        position: {
          x: sourceNode.position.x + 320,
          y: sourceNode.position.y + outgoingCount * 72,
        },
      });
      const nextNode: WorkflowCanvasNode = {
        id: workflowNode.id,
        type: 'workflow',
        position: workflowNode.position,
        data: { workflowNode, locked: false, issues: [] },
      };
      const candidateNodes = [...nodes, nextNode];
      const connection = findCompatibleWorkflowConnection({
        sourceId,
        targetId: workflowNode.id,
        nodes: candidateNodes,
        edges,
      });

      if (!connection) {
        toast.error('These steps cannot connect directly', {
          description: 'Choose a compatible node or add it separately from the node library.',
        });
        return;
      }

      setNodes((current) => [...current, nextNode]);
      setEdges((current) =>
        addEdge<WorkflowCanvasEdge>(
          {
            ...connection,
            id: `e:${connection.source}:${connection.sourceHandle}:${connection.target}:${connection.targetHandle}`,
            type: 'workflow',
            data: {
              status: 'idle',
              sourceLabel: sourceNode.data.workflowNode.label,
              targetLabel: workflowNode.label,
              sourcePort: connection.sourceHandle,
              targetPort: connection.targetHandle,
            },
          },
          current,
        ),
      );
      setSelectedId(workflowNode.id);
      setRightOpen(true);
      setConnectionFeedback(`${workflowNode.label} added and connected.`);
    },
    [edges, locked, nodes, setEdges, setNodes],
  );

  const patchSelected = useCallback(
    (patch: Partial<AutomationWorkflowNode>) => {
      if (!selectedId || locked) return;
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedId
            ? {
                ...node,
                data: {
                  ...node.data,
                  workflowNode: { ...node.data.workflowNode, ...patch } as AutomationWorkflowNode,
                },
              }
            : node,
        ),
      );
    },
    [locked, selectedId, setNodes],
  );

  const configureNode = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
    setRightTab('inspector');
    setRightOpen(true);
  }, []);

  // The one way anything selects a node and brings it into view: the publish
  // dialog's blocker rows, an edge endpoint, and a validation issue all land here.
  const focusNode = useCallback(
    (nodeId: string) => {
      setSelectedId(nodeId);
      setNodes((current) => current.map((node) => ({ ...node, selected: node.id === nodeId })));
      setRightTab('inspector');
      setRightOpen(true);
      void fitView({ nodes: [{ id: nodeId }], duration: 240, padding: 0.8 });
    },
    [fitView, setNodes],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      if (locked) return;
      const original = nodes.find((node) => node.id === nodeId);
      if (!original) return;
      const nextId = `node-${crypto.randomUUID().slice(0, 8)}`;
      const workflowNode = {
        ...structuredClone(original.data.workflowNode),
        id: nextId,
        label: `${original.data.workflowNode.label} copy`,
        position: {
          x: original.position.x + 48,
          y: original.position.y + 48,
        },
      } as AutomationWorkflowNode;
      setNodes((current) => [
        ...current,
        {
          id: nextId,
          type: 'workflow',
          position: workflowNode.position,
          data: { workflowNode, locked: false, issues: [] },
        },
      ]);
      setSelectedId(nextId);
      setRightOpen(true);
    },
    [locked, nodes, setNodes],
  );

  const toggleNodeDisabled = useCallback(
    (nodeId: string) => {
      if (locked) return;
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  workflowNode: {
                    ...node.data.workflowNode,
                    disabled: !node.data.workflowNode.disabled,
                  } as AutomationWorkflowNode,
                },
              }
            : node,
        ),
      );
    },
    [locked, setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      if (locked) return;
      const removedNode = nodes.find((node) => node.id === nodeId);
      if (!removedNode) return;
      const removedEdges = edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
      setNodes((current) => current.filter((node) => node.id !== nodeId));
      setEdges((current) =>
        current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      );
      setSelectedId((current) => (current === nodeId ? null : current));
      toast('Node deleted', {
        description: removedNode.data.workflowNode.label,
        action: {
          label: 'Undo',
          onClick: () => {
            setNodes((current) =>
              current.some((node) => node.id === nodeId) ? current : [...current, removedNode],
            );
            setEdges((current) => [
              ...current,
              ...removedEdges.filter(
                (edge) => !current.some((candidate) => candidate.id === edge.id),
              ),
            ]);
          },
        },
      });
    },
    [edges, locked, nodes, setEdges, setNodes],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      if (locked) return;
      const removedEdge = edges.find((edge) => edge.id === edgeId);
      if (!removedEdge) return;
      setEdges((current) => current.filter((edge) => edge.id !== edgeId));
      toast('Connection deleted', {
        action: {
          label: 'Undo',
          onClick: () =>
            setEdges((current) =>
              current.some((edge) => edge.id === edgeId) ? current : [...current, removedEdge],
            ),
        },
      });
    },
    [edges, locked, setEdges],
  );

  const selectAllNodes = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })));
  }, [setNodes]);

  const selectEdgeEndpoint = useCallback(
    (edgeId: string, endpoint: 'source' | 'target') => {
      const edge = edges.find((candidate) => candidate.id === edgeId);
      if (!edge) return;
      focusNode(edge[endpoint]);
    },
    [edges, focusNode],
  );

  // The publish dialog's escape hatch hands back a whole definition; the canvas
  // is the source of truth for node state, so the patch lands node by node and
  // the existing autosave effect persists it.
  const applyDefinition = useCallback(
    (next: AutomationWorkflowDefinition) => {
      setNodes((current) => applyDefinitionToCanvasNodes({ nodes: current, definition: next }));
    },
    [setNodes],
  );

  const displayNodes = useMemo<WorkflowCanvasNode[]>(
    () =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          locked,
          issues: validation?.issues.filter((issue) => issue.nodeId === node.id) ?? [],
          capability: resolveNodeLifecycle({
            node: node.data.workflowNode,
            capabilities: sourceCapabilities,
          }),
          execution: executionByNodeId.get(node.id),
          onConfigure: configureNode,
          onDuplicate: duplicateNode,
          onToggleDisabled: toggleNodeDisabled,
          onDelete: deleteNode,
        },
      })),
    [
      configureNode,
      deleteNode,
      duplicateNode,
      executionByNodeId,
      locked,
      nodes,
      sourceCapabilities,
      toggleNodeDisabled,
      validation?.issues,
    ],
  );

  const displayEdges = useMemo<WorkflowCanvasEdge[]>(() => {
    const nodeLabels = new Map(nodes.map((node) => [node.id, node.data.workflowNode.label]));
    return edges.map((edge) => ({
      ...edge,
      type: 'workflow',
      data: {
        status: workflowEdgeExecutionState(edge, executionByNodeId),
        sourceLabel: nodeLabels.get(edge.source) ?? edge.source,
        targetLabel: nodeLabels.get(edge.target) ?? edge.target,
        sourcePort: edge.sourceHandle ?? 'output',
        targetPort: edge.targetHandle ?? 'input',
      },
    }));
  }, [edges, executionByNodeId, nodes]);

  const runOperation = useCallback(
    async <Result,>({
      operation,
      action,
      onSuccess,
      onFailure,
      fallback,
    }: {
      operation: Exclude<ActiveOperation, null>;
      action: () => Promise<Result>;
      onSuccess: (result: Result) => void;
      onFailure?: (message: string) => void;
      fallback: string;
    }) => {
      setActiveOperation(operation);
      setMessage(null);
      try {
        onSuccess(await action());
      } catch (error) {
        const failure = errorMessage(error, fallback);
        setMessage(failure);
        onFailure?.(failure);
      } finally {
        setActiveOperation(null);
      }
    },
    [],
  );

  const handleTest = () => {
    if (!definition) return;
    focusRun(null);
    const selectedTriggerId = selected?.type.startsWith('trigger.') ? selected.id : undefined;
    void runOperation({
      operation: 'test',
      action: () => testAutomationWorkflow(automation.id, definition, selectedTriggerId),
      onSuccess: (result) => {
        setTestResult(result);
        const completed = result.nodeExecutions.filter(
          (execution) => execution.status === 'completed',
        ).length;
        const failed = result.nodeExecutions.filter(
          (execution) => execution.status === 'failed',
        ).length;
        setMessage(
          failed > 0
            ? `Test completed with ${failed} failed node${failed === 1 ? '' : 's'}.`
            : `Server test passed ${completed}/${result.nodeExecutions.length} nodes${
                selectedTriggerId ? ` from ${selected?.label ?? selectedTriggerId}` : ''
              }.`,
        );
      },
      fallback: 'Workflow test failed.',
    });
  };

  const handlePublish = () => {
    if (!definition) return;
    setPublishError(null);
    void runOperation({
      operation: 'publish',
      onFailure: setPublishError,
      action: async () => {
        const preflight = await validateAutomationWorkflowForPublish(automation.id, definition);
        if (!preflight.ok) {
          const failures = preflight.issues
            .filter((issue) => issue.severity === 'error')
            .slice(0, 3)
            .map((issue) => issue.message)
            .join(' ');
          throw new Error(failures || 'Workflow is not ready to publish.');
        }
        return publishAutomationWorkflow(automation.id);
      },
      onSuccess: (response) => {
        setVersionState(response.version.state);
        setRevision(response.version.revision);
        setVersionId(response.version.id);
        setAutomation((current) => ({
          ...current,
          enabled: true,
          isPublished: true,
          workflowStatus: 'published',
          activeVersionId: response.version.id,
          draftVersionId: null,
        }));
        setPublishOpen(false);
        setMessage(
          `Published, locked, and active · ${response.actionNodeIds.length} live action${
            response.actionNodeIds.length === 1 ? '' : 's'
          } granted.`,
        );
      },
      fallback: 'Could not publish workflow.',
    });
  };

  const handleUnpublish = () => {
    void runOperation({
      operation: 'unpublish',
      action: () => unpublishAutomationWorkflow(automation.id),
      onSuccess: (response) => {
        setVersionState(response.version.state);
        setRevision(response.version.revision);
        setVersionId(response.version.id);
        setAutomation((current) => ({
          ...current,
          enabled: false,
          isPublished: false,
          workflowStatus: 'draft',
          activeVersionId: null,
          draftVersionId: response.version.id,
        }));
        setMessage('Unpublished. This version is editable and no longer active.');
      },
      fallback: 'Could not unpublish workflow.',
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void fitView({ duration: 260, padding: 0.16 });
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        void zoomTo(1, { duration: 220 });
        return;
      }
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setLeftOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllNodes();
        return;
      }
      if (
        !locked &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'd' &&
        selectedId
      ) {
        event.preventDefault();
        duplicateNode(selectedId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [duplicateNode, fitView, locked, selectAllNodes, selectedId, zoomTo]);

  const menuNode =
    menuTarget.kind === 'node'
      ? (nodes.find((node) => node.id === menuTarget.nodeId)?.data.workflowNode ?? null)
      : null;
  const liveRun = liveRunQuery.data?.run;
  const liveRunTone =
    liveRun?.status === 'completed'
      ? 'success'
      : liveRun?.status === 'failed'
        ? 'error'
        : liveRun?.status === 'queued'
          ? 'warning'
          : 'info';

  if (loadError) {
    return <LoadingWorkspace message={loadError} />;
  }
  if (!base || !definition || !validation) {
    return <LoadingWorkspace message="Loading workflow…" />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delay={250}>
        <div className="automation-workspace-shell fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground md:left-[var(--app-sidebar-width,3.5rem)]">
          <header className="flex min-h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/automations"
                    aria-label="Back to automations"
                    className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </Link>
                }
              />
              <TooltipContent>Back to automations</TooltipContent>
            </Tooltip>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold">{automation.name}</h1>
                <WorkflowStatusBadge
                  isPublished={automation.isPublished}
                  enabled={automation.enabled}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {saveState === 'saving'
                  ? 'Saving draft…'
                  : saveState === 'saved'
                    ? `Draft saved · revision ${revision}`
                    : saveState === 'error'
                      ? 'Draft save failed'
                      : `${nodes.length} nodes · ${edges.length} connections`}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="hidden items-center gap-2 rounded-md border px-2 py-1.5 lg:flex">
                <span className="text-xs text-muted-foreground">Active</span>
                <Switch
                  checked={automation.enabled}
                  disabled={versionState !== 'published' || busy}
                  onCheckedChange={(enabled) => {
                    void runOperation({
                      operation: 'toggle',
                      action: () => updateAutomation(automation.id, { enabled }),
                      onSuccess: (next) => {
                        setAutomation(next);
                        setMessage(enabled ? 'Automation resumed.' : 'Automation paused.');
                      },
                      fallback: 'Could not update automation status.',
                    });
                  }}
                  aria-label="Toggle automation"
                />
              </div>

              <WebhookManager
                automation={automation}
                versionId={versionId}
                versionState={versionState}
                saveState={saveState}
                selected={selected}
                locked={locked}
                resources={webhookResources}
                onRefresh={async () => {
                  setWebhookResources(await fetchAutomationWebhookResources(automation.brandId));
                }}
                onEndpointCreated={(endpointId) => {
                  if (selected?.type !== 'trigger.webhook') return;
                  patchSelected({
                    config: { ...selected.config, endpointId },
                  });
                  setMessage('Inbound endpoint created. Copy its signing secret before closing.');
                }}
              />

              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={handleTest}
                title={
                  selected?.type.startsWith('trigger.')
                    ? `Test from ${selected.label}`
                    : 'Test all enabled triggers'
                }
              >
                {activeOperation === 'test' ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Beaker data-icon="inline-start" />
                )}
                <span className="hidden xl:inline">
                  {selected?.type.startsWith('trigger.')
                    ? 'Test selected trigger'
                    : 'Test workflow'}
                </span>
                <span className="xl:hidden">Test</span>
              </Button>

              {versionState === 'published' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !automation.enabled}
                  onClick={() => {
                    void runOperation({
                      operation: 'run',
                      // The mutation — not the bare fetch — so the runs query is
                      // invalidated and the new run appears in the Runs tab now
                      // rather than at the next five-second poll.
                      action: () => runNowMutation.mutateAsync(automation.id),
                      onSuccess: (runId) => {
                        setTestResult(null);
                        focusRun(runId);
                        setRightTab('runs');
                        setRightOpen(true);
                        setMessage(`Run queued · ${runId.slice(0, 8)}`);
                      },
                      fallback: 'Could not queue workflow run.',
                    });
                  }}
                >
                  {activeOperation === 'run' ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <CirclePlay data-icon="inline-start" />
                  )}
                  Run now
                </Button>
              ) : null}

              {versionState === 'published' ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={handleUnpublish}>
                  {activeOperation === 'unpublish' ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Unlock data-icon="inline-start" />
                  )}
                  <span className="hidden xl:inline">Unpublish to edit</span>
                  <span className="xl:hidden">Unpublish</span>
                </Button>
              ) : versionState === 'draft' ? (
                <Button
                  size="sm"
                  disabled={!validation.ok || saveState === 'saving' || busy}
                  onClick={() => {
                    setPublishError(null);
                    setPublishOpen(true);
                  }}
                >
                  {activeOperation === 'publish' ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Cloud data-icon="inline-start" />
                  )}
                  Publish
                </Button>
              ) : null}

              <IconButton
                label={rightOpen ? 'Close inspector' : 'Open inspector'}
                onClick={() => setRightOpen((open) => !open)}
              >
                <PanelRightClose aria-hidden="true" />
              </IconButton>
            </div>
          </header>

          <AnimatePresence initial={false}>
            {message ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="shrink-0 border-b bg-muted/45"
              >
                <Alert className="rounded-none border-0 px-4 py-2">
                  {testResult?.nodeExecutions.some((execution) => execution.status === 'failed') ? (
                    <AlertCircle aria-hidden="true" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  <AlertTitle className="sr-only">Workflow update</AlertTitle>
                  <AlertDescription className="flex w-full items-center text-xs">
                    {message}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto size-7"
                      onClick={() => setMessage(null)}
                      aria-label="Dismiss message"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </AlertDescription>
                </Alert>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex min-h-0 flex-1">
            <motion.aside
              initial={false}
              animate={{ width: leftOpen ? '17rem' : '3rem' }}
              transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              className="relative shrink-0 overflow-hidden border-r bg-card"
            >
              <div className="flex h-12 items-center border-b px-2">
                {leftOpen ? (
                  <div className="min-w-0 px-2">
                    <h2 className="text-xs font-medium">Node library</h2>
                    <p className="text-[11px] text-muted-foreground">
                      {AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).length} typed steps
                    </p>
                  </div>
                ) : (
                  <Search className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <IconButton
                  label={leftOpen ? 'Collapse node library' : 'Open node library'}
                  className={cn(leftOpen && 'ml-auto')}
                  onClick={() => setLeftOpen((open) => !open)}
                >
                  {leftOpen ? (
                    <PanelLeftClose aria-hidden="true" />
                  ) : (
                    <ChevronRight aria-hidden="true" />
                  )}
                </IconButton>
              </div>
              {leftOpen ? (
                <div className="h-[calc(100%-3rem)]">
                  {locked ? (
                    <Alert className="m-2 w-auto py-2">
                      <Lock aria-hidden="true" />
                      <AlertTitle className="text-xs">Published version</AlertTitle>
                      <AlertDescription className="text-xs">
                        Unpublish to change this graph.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className={cn('h-full', locked && 'h-[calc(100%-5.5rem)]')}>
                    <NodePalette
                      locked={locked}
                      capabilities={sourceCapabilities}
                      onAdd={addNode}
                    />
                  </div>
                </div>
              ) : null}
            </motion.aside>

            <main className="relative min-w-0 flex-1">
              <WorkflowCanvasContextMenu
                target={menuTarget}
                locked={locked}
                node={menuNode}
                onAddNode={addNode}
                onAddConnectedNode={addConnectedNode}
                onOpenLibrary={() => setLeftOpen(true)}
                onConfigureNode={configureNode}
                onDuplicateNode={duplicateNode}
                onToggleNode={toggleNodeDisabled}
                onDeleteNode={deleteNode}
                onDeleteEdge={deleteEdge}
                onFitView={() => void fitView({ duration: 260, padding: 0.16 })}
                onResetZoom={() => {
                  void setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 220 });
                }}
                onSelectAll={selectAllNodes}
                onSelectEdgeSource={(edgeId) => selectEdgeEndpoint(edgeId, 'source')}
                onSelectEdgeTarget={(edgeId) => selectEdgeEndpoint(edgeId, 'target')}
                onOpenInspector={() => setRightOpen(true)}
                onUnpublish={handleUnpublish}
              >
                <div className="h-full w-full">
                  <Canvas<WorkflowCanvasNode, WorkflowCanvasEdge>
                    nodes={displayNodes}
                    edges={displayEdges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={locked ? undefined : onNodesChange}
                    onEdgesChange={locked ? undefined : onEdgesChange}
                    onConnect={
                      locked
                        ? undefined
                        : (connection) => {
                            const sourceNode = nodes.find((node) => node.id === connection.source);
                            const targetNode = nodes.find((node) => node.id === connection.target);
                            setEdges((current) =>
                              addEdge<WorkflowCanvasEdge>(
                                {
                                  ...connection,
                                  id: `e:${connection.source}:${connection.sourceHandle}:${connection.target}:${connection.targetHandle}`,
                                  type: 'workflow',
                                  data: {
                                    status: 'idle',
                                    sourceLabel:
                                      sourceNode?.data.workflowNode.label ?? connection.source,
                                    targetLabel:
                                      targetNode?.data.workflowNode.label ?? connection.target,
                                    sourcePort: connection.sourceHandle ?? 'output',
                                    targetPort: connection.targetHandle ?? 'input',
                                  },
                                },
                                current,
                              ),
                            );
                            setConnectionFeedback('Connection added.');
                          }
                    }
                    isValidConnection={(candidate) => {
                      const evaluation = evaluateWorkflowConnection({
                        connection: candidate as Connection,
                        nodes,
                        edges,
                      });
                      lastConnectionEvaluationRef.current = evaluation;
                      return evaluation.valid;
                    }}
                    onConnectEnd={(_, state) => {
                      if (!state.isValid) {
                        setConnectionFeedback(lastConnectionEvaluationRef.current.reason);
                      }
                    }}
                    connectionLineComponent={workflowConnectionLine}
                    onNodeClick={(_, node) => configureNode(node.id)}
                    onNodeContextMenu={(event, node) => {
                      event.preventDefault();
                      setSelectedId(node.id);
                      setMenuTarget({ kind: 'node', nodeId: node.id });
                    }}
                    onEdgeClick={(_, edge) => {
                      setEdges((current) =>
                        current.map((candidate) => ({
                          ...candidate,
                          selected: candidate.id === edge.id,
                        })),
                      );
                    }}
                    onEdgeContextMenu={(event, edge) => {
                      event.preventDefault();
                      setMenuTarget({ kind: 'edge', edgeId: edge.id });
                    }}
                    onPaneClick={() => setSelectedId(null)}
                    onPaneContextMenu={(event) => {
                      event.preventDefault();
                      setMenuTarget({
                        kind: 'pane',
                        position: screenToFlowPosition({
                          x: event.clientX,
                          y: event.clientY,
                        }),
                      });
                    }}
                    onMove={(_, viewport) => {
                      const nextDensity =
                        viewport.zoom < 0.55
                          ? 'overview'
                          : viewport.zoom < 0.9
                            ? 'compact'
                            : 'detail';
                      setCanvasDensity((current) =>
                        current === nextDensity ? current : nextDensity,
                      );
                    }}
                    nodesDraggable={!locked}
                    nodesConnectable={!locked}
                    elementsSelectable
                    selectionOnDrag={!locked}
                    minZoom={0.15}
                    maxZoom={2}
                    deleteKeyCode={locked ? null : ['Backspace', 'Delete']}
                    colorMode="light"
                    className={cn(
                      'studio-canvas automation-workflow-canvas',
                      `automation-density-${canvasDensity}`,
                    )}
                    backgroundProps={{
                      variant: BackgroundVariant.Dots,
                      gap: 20,
                      size: 1,
                      color: 'var(--studio-grid-dot)',
                    }}
                  >
                    <CanvasControls position="bottom-left" showInteractive={!locked} />

                    {liveRun ? (
                      <CanvasPanel
                        position="top-center"
                        className="border-0 bg-transparent shadow-none"
                      >
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Pill
                                variant={
                                  liveRun.status === 'completed'
                                    ? 'success'
                                    : liveRun.status === 'failed'
                                      ? 'destructive'
                                      : liveRun.status === 'queued'
                                        ? 'warning'
                                        : 'violet'
                                }
                                className="bg-card/95 px-3 py-1.5 shadow-sm backdrop-blur"
                              >
                                <PillIndicator
                                  variant={liveRunTone}
                                  pulse={
                                    liveRun.status === 'queued' || liveRun.status === 'running'
                                  }
                                />
                                {liveRun.status === 'queued'
                                  ? 'Queued'
                                  : liveRun.status === 'running'
                                    ? 'Running'
                                    : liveRun.status === 'completed'
                                      ? 'Run complete'
                                      : 'Run failed'}
                              </Pill>
                            }
                          />
                          <TooltipContent>
                            Live server run {liveRun.runId.slice(0, 8)}
                          </TooltipContent>
                        </Tooltip>
                      </CanvasPanel>
                    ) : null}

                    <CanvasPanel
                      position="top-right"
                      className="flex items-center gap-0 overflow-hidden rounded-lg border-border/80 bg-card/92 p-0 shadow-sm backdrop-blur"
                    >
                      <span className="px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
                        {nodes.length} nodes
                      </span>
                      <span className="border-l border-border/70 px-2.5 py-2 font-mono text-[10px] text-muted-foreground">
                        {edges.length} connections
                      </span>
                      {locked ? (
                        <span className="flex items-center gap-1.5 border-l border-border/70 px-2.5 py-2 text-[10px] font-medium text-muted-foreground">
                          <Lock aria-hidden="true" />
                          Read only
                        </span>
                      ) : null}
                    </CanvasPanel>

                    <CanvasPanel
                      position="bottom-center"
                      className={cn(
                        'flex items-center gap-2 rounded-lg border-border/80 bg-card/94 px-3 py-2 shadow-sm backdrop-blur',
                        connectionFeedback
                          ? 'border-primary/40'
                          : validation.ok
                            ? 'border-success/30'
                            : 'border-destructive/40',
                      )}
                    >
                      {connectionFeedback ? (
                        <Cable className="size-4 text-primary" aria-hidden="true" />
                      ) : validation.ok ? (
                        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
                      ) : (
                        <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                      )}
                      <span className="text-xs font-medium">
                        {connectionFeedback ??
                          (validation.ok
                            ? testResult
                              ? 'Validated · server test complete'
                              : 'Structure valid · test before publishing'
                            : `${issueCount(validation, 'error')} publishing blocker${issueCount(validation, 'error') === 1 ? '' : 's'}`)}
                      </span>
                      {!connectionFeedback && issueCount(validation, 'warning') > 0 ? (
                        <Badge variant="warning">
                          {issueCount(validation, 'warning')} warnings
                        </Badge>
                      ) : null}
                    </CanvasPanel>
                  </Canvas>
                </div>
              </WorkflowCanvasContextMenu>
            </main>

            <AnimatePresence initial={false}>
              {rightOpen ? (
                <motion.aside
                  initial={{ opacity: 0, x: 18, width: 0 }}
                  animate={{ opacity: 1, x: 0, width: '22rem' }}
                  exit={{ opacity: 0, x: 18, width: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  className="shrink-0 overflow-hidden border-l"
                >
                  <div className="h-full w-[22rem]">
                    <RightRailTabs
                      tab={rightTab}
                      onTabChange={setRightTab}
                      inspector={
                        <WorkflowInspector
                          selected={selected}
                          brandId={automation.brandId}
                          locked={locked}
                          validation={validation}
                          execution={selectedExecution}
                          evidence={
                            testResult?.evidence.filter((event) => event.nodeId === selectedId) ??
                            []
                          }
                          nodeRuns={selectedNodeRuns}
                          checks={
                            testResult?.checks.filter(
                              (check) => !check.nodeId || check.nodeId === selectedId,
                            ) ?? []
                          }
                          actionReceipts={
                            testResult?.actionReceipts.filter(
                              (receipt) => receipt.nodeId === selectedId,
                            ) ?? []
                          }
                          sourceCapabilities={sourceCapabilities}
                          webhookDestinations={webhookResources.destinations}
                          webhookEndpoints={webhookResources.endpoints}
                          onPatch={patchSelected}
                          onSelectIssue={focusNode}
                          onMessage={setMessage}
                        />
                      }
                      runs={
                        <RunHistoryPanel
                          automationId={automation.id}
                          activeRunId={activeRunId}
                          onFocusRun={(runId) => {
                            setTestResult(null);
                            focusRun(runId);
                          }}
                        />
                      }
                    />
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>

          <PublishReadinessDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            definition={definition}
            capabilities={sourceCapabilities}
            testResult={testResult}
            // The escape hatch patches the canvas locally and the draft saves on
            // a debounce, but the server publishes its STORED draft — so Publish
            // stays shut until that write lands.
            publishing={activeOperation === 'publish' || saveState === 'saving'}
            testing={activeOperation === 'test'}
            errorMessage={publishError}
            onFocusNode={(nodeId) => {
              setPublishOpen(false);
              focusNode(nodeId);
            }}
            onApplyDefinition={applyDefinition}
            onRunTest={handleTest}
            onConfirmPublish={handlePublish}
          />

          {busy ? (
            <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs">
              <Spinner />
              {operationLabel[activeOperation]}
            </div>
          ) : null}
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}

export function AutomationWorkspace({ automationId }: { automationId: string }) {
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAutomation(automationId)
      .then((result) => {
        if (!cancelled) setAutomation(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, 'Could not load this automation.'));
      });
    return () => {
      cancelled = true;
    };
  }, [automationId]);

  if (error) return <LoadingWorkspace message={error} />;
  if (!automation) return <LoadingWorkspace message="Loading automation…" />;

  return (
    <ReactFlowProvider>
      <Workspace automation={automation} />
    </ReactFlowProvider>
  );
}
