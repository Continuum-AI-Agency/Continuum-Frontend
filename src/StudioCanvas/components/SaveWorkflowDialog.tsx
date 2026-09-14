import {
  type CanvasTechniquePort,
  type EditorPipelineConfiguration,
  type EditorProjectSourceSlot,
  ELEMENT_CATEGORIES,
  type ElementCategory,
  editorProjectSourceSlots,
  isElementPersonCategory,
  type PipelineAgentGuide,
  type PipelinePortBinding,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, X } from 'lucide-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { coerceToastOptions, throwToastError, useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ELEMENT_CATEGORY_LABEL } from '@/lib/ai-studio/elements';
import { draftPipelineGuide, publishPipeline } from '@/lib/ai-studio/pipelines';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { getVideoProject } from '@/lib/api/videoProjects.client';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { inferTechniquePorts } from '../utils/techniqueFragment';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const WORKFLOW_PAYLOAD_MAX_BYTES = 200 * 1024 * 1024;

const saveWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  description: z.string().optional(),
});

/**
 * Saving and PUBLISHING are different acts, so they are one deliberate choice rather than
 * two buttons that look alike.
 *
 * A workflow is for you: load it, wire it up, change your mind. A pipeline is a promise to
 * a machine — its declared ports are the whole contract, and the DCO may run it unattended
 * against a live ad account. That is why publishing writes its own metadata flag and why
 * `readPipeline` refuses anything without one: every saved subgraph being silently eligible
 * is exactly the accident this choice exists to prevent.
 */
type SaveKind = 'workflow' | 'pipeline';

type SaveWorkflowFormValues = z.infer<typeof saveWorkflowSchema>;

type PipelinePortDirection = 'input' | 'output';
type PipelineBindings = Record<string, PipelinePortBinding>;
type EditorPortConfiguration = EditorPipelineConfiguration & {
  slots: EditorProjectSourceSlot[];
};

const bindingKey = (direction: PipelinePortDirection, portId: string) => `${direction}:${portId}`;

const lines = (value: string): string[] =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const canConfigurePipelinePort = (direction: PipelinePortDirection, port: CanvasTechniquePort) =>
  direction === 'input'
    ? ['image', 'video', 'audio', 'media'].includes(port.dataType ?? '')
    : port.dataType === 'image';

const bindingForPort = (
  direction: PipelinePortDirection,
  port: CanvasTechniquePort,
  bindings: PipelineBindings,
  editorConfigurations: Readonly<Record<string, EditorPortConfiguration>>,
): PipelinePortBinding => {
  const explicit = bindings[bindingKey(direction, port.id)];
  if (explicit) return explicit;
  const slot = direction === 'input' ? editorConfigurations[port.nodeRef]?.slots[0] : undefined;
  return slot
    ? { kind: 'editor_source', slotId: slot.slotId, mediaKind: slot.mediaKind }
    : { kind: 'asset' };
};

function PipelinePortBindingEditor({
  direction,
  ports,
  bindings,
  editorConfigurations,
  onChange,
}: {
  direction: PipelinePortDirection;
  ports: CanvasTechniquePort[];
  bindings: PipelineBindings;
  editorConfigurations: Readonly<Record<string, EditorPortConfiguration>>;
  onChange: (key: string, binding: PipelinePortBinding) => void;
}) {
  const configurable = ports.filter((port) => canConfigurePipelinePort(direction, port));
  if (configurable.length === 0) return null;

  return (
    <div className="mt-2 grid gap-2 border-t border-border/70 pt-2">
      <p className="font-medium text-primary">
        {direction === 'input' ? 'Input meaning' : 'Output meaning'}
      </p>
      {configurable.map((port) => {
        const key = bindingKey(direction, port.id);
        const binding = bindingForPort(direction, port, bindings, editorConfigurations);
        const label = port.label ?? port.handleId ?? port.id;
        const editorConfiguration =
          direction === 'input' ? editorConfigurations[port.nodeRef] : undefined;
        if (editorConfiguration) {
          return (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="truncate text-muted-foreground">{label}</span>
              {editorConfiguration.slots.length > 0 ? (
                <Select
                  value={binding.kind === 'editor_source' ? binding.slotId : undefined}
                  onValueChange={(slotId) => {
                    const slot = editorConfiguration.slots.find(
                      (candidate) => candidate.slotId === slotId,
                    );
                    if (slot) {
                      onChange(key, {
                        kind: 'editor_source',
                        slotId: slot.slotId,
                        mediaKind: slot.mediaKind,
                      });
                    }
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-44"
                    aria-label={`${label} editor source slot`}
                  >
                    <SelectValue
                      items={Object.fromEntries(
                        editorConfiguration.slots.map((slot) => [slot.slotId, slot.label]),
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {editorConfiguration.slots.map((slot) => (
                      <SelectItem key={slot.slotId} value={slot.slotId}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-danger">No media clips to replace</span>
              )}
            </div>
          );
        }
        const semanticKind =
          binding.kind === 'element_candidate' ? 'element_candidate' : binding.kind;
        const category =
          binding.kind === 'element'
            ? binding.allowedCategories[0]
            : binding.kind === 'element_candidate'
              ? binding.category
              : null;

        return (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <span className="truncate text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1.5">
              <Select
                value={semanticKind}
                onValueChange={(value) =>
                  onChange(
                    key,
                    value === 'asset'
                      ? { kind: 'asset' }
                      : value === 'element'
                        ? { kind: 'element', allowedCategories: ['general'] }
                        : { kind: 'element_candidate', category: 'general' },
                  )
                }
              >
                <SelectTrigger size="sm" className="w-32" aria-label={`${label} ${direction} type`}>
                  <SelectValue
                    items={{
                      asset: 'Asset',
                      element: 'Element',
                      element_candidate: 'Element candidate',
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  {direction === 'input' ? (
                    <SelectItem value="element">Element</SelectItem>
                  ) : (
                    <SelectItem value="element_candidate">Element candidate</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {category ? (
                <Select
                  value={category}
                  onValueChange={(value) =>
                    onChange(
                      key,
                      direction === 'input'
                        ? {
                            kind: 'element',
                            allowedCategories: [value as ElementCategory],
                          }
                        : binding.kind === 'element_candidate'
                          ? { ...binding, category: value as ElementCategory }
                          : { kind: 'element_candidate', category: value as ElementCategory },
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-32"
                    aria-label={`${label} ${direction === 'input' ? 'Element' : 'candidate'} category`}
                  >
                    <SelectValue items={ELEMENT_CATEGORY_LABEL} />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEMENT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {ELEMENT_CATEGORY_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {binding.kind === 'element_candidate' && isElementPersonCategory(binding.category) ? (
                <Input
                  className="h-7 w-48 text-xs"
                  aria-label={`${label} candidate rights note`}
                  placeholder="Rights basis"
                  value={binding.rightsNote ?? ''}
                  onChange={(event) =>
                    onChange(key, {
                      ...binding,
                      rightsNote: event.target.value,
                    })
                  }
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {direction === 'output' &&
      configurable.some(
        (port) => bindings[bindingKey(direction, port.id)]?.kind === 'element_candidate',
      ) ? (
        <p className="text-muted-foreground">
          A candidate is created only after quality checks pass. It never replaces a default Element
          automatically.
        </p>
      ) : null}
    </div>
  );
}

type SaveWorkflowDialogProps = {
  brandProfileId?: string;
  roomId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  /**
   * Save these nodes instead of the whole canvas.
   *
   * The canvas menu passes the current selection so right-click → Save means "save what I
   * picked"; the header passes nothing and saves everything. One dialog either way — two
   * doors onto the same act is how "Save as starter" became a fourth save flavour nobody
   * could tell apart from the other three.
   */
  selection?: StudioNode[];
};

export function SaveWorkflowDialog({
  brandProfileId,
  roomId,
  open,
  onOpenChange,
  showTrigger = true,
  selection,
}: SaveWorkflowDialogProps) {
  const { nodes, edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDraftingGuide, setIsDraftingGuide] = React.useState(false);
  const [kind, setKind] = React.useState<SaveKind>('workflow');
  const [pipelineBindings, setPipelineBindings] = React.useState<PipelineBindings>({});
  const [editorConfigurations, setEditorConfigurations] = React.useState<
    Record<string, EditorPortConfiguration>
  >({});
  const [loadingEditorConfigurations, setLoadingEditorConfigurations] = React.useState(false);
  const [agentGuide, setAgentGuide] = React.useState<PipelineAgentGuide | null>(null);

  const isOpen = open ?? internalOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  const scopedNodes = selection?.length ? selection : nodes;
  const isSelectionScoped = Boolean(selection?.length);
  const timelineProjects = React.useMemo(
    () =>
      scopedNodes.flatMap((node) => {
        if (node.type !== 'timelineEditor') return [];
        const projectId = (node.data as { videoProjectId?: unknown }).videoProjectId;
        return typeof projectId === 'string' && projectId ? [{ nodeRef: node.id, projectId }] : [];
      }),
    [scopedNodes],
  );

  React.useEffect(() => {
    if (!isOpen || kind !== 'pipeline' || timelineProjects.length === 0) {
      setEditorConfigurations({});
      setLoadingEditorConfigurations(false);
      return;
    }
    let cancelled = false;
    setLoadingEditorConfigurations(true);
    void Promise.all(
      timelineProjects.map(async ({ nodeRef, projectId }) => {
        const project = await getVideoProject(projectId);
        return [
          nodeRef,
          {
            nodeRef,
            projectId,
            projectRevision: project.revision,
            projectFingerprint: project.fingerprint,
            slots: editorProjectSourceSlots(project),
          },
        ] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setEditorConfigurations(Object.fromEntries(entries));
      })
      .catch((cause) => {
        if (!cancelled) {
          setEditorConfigurations({});
          setError(
            cause instanceof Error ? cause.message : 'Could not load the editor configuration.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEditorConfigurations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, kind, timelineProjects]);

  // Only the edges wholly inside the selection are PERSISTED, so a captured subgraph
  // re-applies without dangling connections to nodes that were left behind.
  const scopedEdges = React.useMemo(() => {
    if (!isSelectionScoped) return edges;
    const ids = new Set(scopedNodes.map((node) => node.id));
    return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [isSelectionScoped, scopedNodes, edges]);

  // Inference reads the FULL edge list even when the save is scoped: a boundary is only
  // visible from both sides, so an edge arriving from a node left outside is exactly what
  // makes an input port. Feeding it `scopedEdges` would report a closed box with no ports.
  // Recomputed only while the panel is open — the pass walks every node and edge, and the
  // header re-renders on every canvas change.
  const ports = React.useMemo(
    () => (isOpen && kind === 'pipeline' ? inferTechniquePorts(scopedNodes, edges) : null),
    [isOpen, kind, scopedNodes, edges],
  );

  const pipelineMetadata = React.useMemo(() => {
    if (!ports) return null;
    return {
      version: 1 as const,
      kind: 'generation' as const,
      inputPorts: ports.inputPorts.map((port) =>
        canConfigurePipelinePort('input', port)
          ? (() => {
              const pipelineBinding = bindingForPort(
                'input',
                port,
                pipelineBindings,
                editorConfigurations,
              );
              return {
                ...port,
                ...(pipelineBinding.kind === 'editor_source'
                  ? { dataType: pipelineBinding.mediaKind }
                  : {}),
                pipelineBinding,
              };
            })()
          : port,
      ),
      outputPorts: ports.outputPorts.map((port) =>
        canConfigurePipelinePort('output', port)
          ? {
              ...port,
              pipelineBinding:
                pipelineBindings[bindingKey('output', port.id)] ?? ({ kind: 'asset' } as const),
            }
          : port,
      ),
      editorConfigurations: timelineProjects.flatMap(({ nodeRef }) => {
        const configuration = editorConfigurations[nodeRef];
        if (!configuration) return [];
        const { slots: _slots, ...pinned } = configuration;
        return [pinned];
      }),
    };
  }, [editorConfigurations, pipelineBindings, ports, timelineProjects]);

  // A pipeline with no ports parses as published and then refuses every run — `readPipeline`
  // answers "it declares no input or output ports". The panel already SAYS that in red; it
  // also has to refuse, or the toast reads "Pipeline published" over a contract that cannot
  // be given anything or read back.
  const pipelineHasNoPorts =
    kind === 'pipeline' &&
    ports !== null &&
    ports.inputPorts.length + ports.outputPorts.length === 0;
  const pipelineCandidateNeedsRights =
    kind === 'pipeline' &&
    ports?.outputPorts.some((port) => {
      const binding = pipelineBindings[bindingKey('output', port.id)];
      return (
        binding?.kind === 'element_candidate' &&
        isElementPersonCategory(binding.category) &&
        !binding.rightsNote?.trim()
      );
    });
  const editorConfigurationMissing = timelineProjects.some(
    ({ nodeRef }) => !editorConfigurations[nodeRef]?.slots.length,
  );

  const form = useForm<SaveWorkflowFormValues>({
    resolver: zodResolver(saveWorkflowSchema),
    defaultValues: {
      name: '',
      description: '',
    },
    mode: 'onSubmit',
  });

  const closePanel = React.useCallback(() => {
    setOpen(false);
    form.reset();
    setError(null);
    setKind('workflow');
    setPipelineBindings({});
    setEditorConfigurations({});
    setAgentGuide(null);
  }, [form, setOpen]);

  const draftGuide = async () => {
    if (!brandProfileId || !pipelineMetadata || !(await form.trigger('name'))) return;
    setIsDraftingGuide(true);
    setError(null);
    const values = form.getValues();
    const snapshot = serializeWorkflowSnapshot(scopedNodes, scopedEdges, defaultEdgeType);
    try {
      const draft = await draftPipelineGuide({
        brand_profile_id: brandProfileId,
        name: values.name.trim(),
        ...(values.description?.trim() ? { description: values.description.trim() } : {}),
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        ...(roomId ? { source_room_id: roomId } : {}),
        pipeline: pipelineMetadata,
      });
      form.setValue('description', draft.description, { shouldDirty: true });
      setAgentGuide(draft.agent_guide);
    } catch (err) {
      const summary = values.description?.trim() || `${values.name.trim()} creative pipeline.`;
      form.setValue('description', summary, { shouldDirty: true });
      setAgentGuide({
        version: 1,
        use_when: [`The task matches the declared inputs and outputs of ${values.name.trim()}.`],
        avoid_when: [],
        input_guidance: pipelineMetadata.inputPorts.map((port) => ({
          input_id: port.id,
          instruction: `Supply ${port.label ?? port.id} as ${port.dataType ?? 'text'}.`,
        })),
        invocation_notes: [],
      });
      setError('The automatic draft failed. A manual guide is ready for review below.');
    } finally {
      setIsDraftingGuide(false);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!brandProfileId) {
      setError('Select a brand profile to save workflows.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const snapshot = serializeWorkflowSnapshot(scopedNodes, scopedEdges, defaultEdgeType);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (payloadBytes > WORKFLOW_PAYLOAD_MAX_BYTES) {
        throwToastError({
          title: 'Workflow too large to save',
          description: `${formatMiB(payloadBytes)} (max ${formatMiB(WORKFLOW_PAYLOAD_MAX_BYTES)}). Remove large media inputs.`,
          variant: 'error',
        });
      }
      if (kind === 'pipeline') {
        if (loadingEditorConfigurations || editorConfigurationMissing) {
          throw new Error('Choose a reusable editor source slot before publishing.');
        }
        if (!pipelineMetadata || !agentGuide) {
          throw new Error('Draft or write the agent guide before publishing.');
        }
        await publishPipeline({
          brand_profile_id: brandProfileId,
          name: values.name.trim(),
          description: values.description?.trim() || `${values.name.trim()} creative pipeline.`,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          ...(roomId ? { source_room_id: roomId } : {}),
          pipeline: pipelineMetadata,
          agent_guide: agentGuide,
        });
      } else {
        await createAiStudioWorkflowAction({
          brandProfileId,
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          metadata: {
            created_via: 'canvas_ui',
            ...(roomId ? { source_room_id: roomId } : {}),
          },
        });
      }
      show({
        title: kind === 'pipeline' ? 'Pipeline published' : 'Workflow saved',
        description: values.name,
        variant: 'success',
      });
      closePanel();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save workflow';
      const toastOptions = coerceToastOptions(err, {
        title: 'Save failed',
        description: message,
        variant: 'error',
      });
      setError(toastOptions.description ?? toastOptions.title);
      show(toastOptions);
    } finally {
      setIsSaving(false);
    }
  });

  const panel = (
    <form onSubmit={onSubmit} className="grid gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">
            {kind === 'pipeline'
              ? 'Publish pipeline'
              : isSelectionScoped
                ? 'Save selection'
                : 'Save workflow'}
          </p>
          <p className="text-xs text-muted-foreground">
            {kind === 'pipeline'
              ? `Publish ${isSelectionScoped ? 'these nodes' : 'this canvas'} for the optimizer to run on its own.`
              : `Store ${isSelectionScoped ? 'the selected nodes' : 'this canvas'} as a reusable template for your brand.`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={closePanel}
          aria-label="Close workflow saver"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="workflow-name">Name</Label>
        <ToggleGroup
          value={kind}
          onValueChange={(value) => {
            const next = value as unknown as string;
            if (next === 'workflow' || next === 'pipeline') setKind(next);
          }}
          className="grid grid-cols-2"
          aria-label="Save as"
        >
          <ToggleGroupItem value="workflow" className="text-xs">
            Workflow
          </ToggleGroupItem>
          <ToggleGroupItem value="pipeline" className="text-xs">
            Pipeline
          </ToggleGroupItem>
        </ToggleGroup>

        {kind === 'pipeline' ? (
          <div className="rounded-md border border-subtle bg-surface p-2 text-xs">
            {ports && ports.inputPorts.length + ports.outputPorts.length > 0 ? (
              <>
                <p className="text-secondary">
                  <span className="font-medium text-primary">
                    {ports.inputPorts.length} input
                    {ports.inputPorts.length === 1 ? '' : 's'}
                  </span>{' '}
                  and{' '}
                  <span className="font-medium text-primary">
                    {ports.outputPorts.length} output
                    {ports.outputPorts.length === 1 ? '' : 's'}
                  </span>{' '}
                  — the whole contract. Everything else is fixed.
                </p>
                {ports.inputPorts.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Takes: {ports.inputPorts.map((port) => port.label ?? port.handleId).join(', ')}
                  </p>
                )}
                <PipelinePortBindingEditor
                  direction="input"
                  ports={ports.inputPorts}
                  bindings={pipelineBindings}
                  editorConfigurations={editorConfigurations}
                  onChange={(key, binding) =>
                    setPipelineBindings((current) => ({ ...current, [key]: binding }))
                  }
                />
                <PipelinePortBindingEditor
                  direction="output"
                  ports={ports.outputPorts}
                  bindings={pipelineBindings}
                  editorConfigurations={editorConfigurations}
                  onChange={(key, binding) =>
                    setPipelineBindings((current) => ({ ...current, [key]: binding }))
                  }
                />
                {ports.truncated && (
                  <p className="mt-1 text-warning">
                    More ports than a pipeline can declare — only the first 12 a side are kept.
                  </p>
                )}
                {loadingEditorConfigurations ? (
                  <p className="mt-1 text-muted-foreground">
                    Loading saved editor configuration...
                  </p>
                ) : null}
              </>
            ) : (
              // Publishing this would hand the optimizer a graph it can run but never
              // steer, which is a worse outcome than refusing: it looks configurable and
              // produces the same creative every time.
              <p className="text-danger">
                {isSelectionScoped ? 'This selection' : 'This canvas'} declares no ports, so a
                pipeline could not be given anything or read anything back. Leave a required input
                unwired — a reference image or a prompt — then publish.
              </p>
            )}
          </div>
        ) : null}

        <Input id="workflow-name" placeholder="Launch creative flow" {...form.register('name')} />
        {form.formState.errors.name?.message && (
          <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="workflow-description">Description</Label>
        <Textarea
          id="workflow-description"
          placeholder="Optional notes for your team"
          rows={3}
          {...form.register('description')}
        />
      </div>

      {kind === 'pipeline' ? (
        <div className="grid gap-2 rounded-md border border-subtle bg-surface p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-primary">Agent guide</p>
              <p className="text-muted-foreground">
                Review what another agent will use to select and invoke this pipeline.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!brandProfileId || isDraftingGuide || pipelineHasNoPorts}
              onClick={draftGuide}
            >
              {isDraftingGuide ? 'Drafting...' : agentGuide ? 'Redraft' : 'Draft guide'}
            </Button>
          </div>
          {agentGuide ? (
            <>
              <div className="grid gap-1">
                <Label htmlFor="pipeline-use-when">Use when · one per line</Label>
                <Textarea
                  id="pipeline-use-when"
                  rows={2}
                  value={agentGuide.use_when.join('\n')}
                  onChange={(event) =>
                    setAgentGuide((current) =>
                      current ? { ...current, use_when: lines(event.target.value) } : current,
                    )
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pipeline-avoid-when">Avoid when · one per line</Label>
                <Textarea
                  id="pipeline-avoid-when"
                  rows={2}
                  value={agentGuide.avoid_when.join('\n')}
                  onChange={(event) =>
                    setAgentGuide((current) =>
                      current ? { ...current, avoid_when: lines(event.target.value) } : current,
                    )
                  }
                />
              </div>
              {pipelineMetadata?.inputPorts.map((port) => {
                const guidance = agentGuide.input_guidance.find(
                  (item) => item.input_id === port.id,
                );
                return (
                  <div key={port.id} className="grid gap-1">
                    <Label htmlFor={`pipeline-guide-${port.id}`}>
                      {port.label ?? port.id} guidance
                    </Label>
                    <Input
                      id={`pipeline-guide-${port.id}`}
                      value={guidance?.instruction ?? ''}
                      onChange={(event) =>
                        setAgentGuide((current) => {
                          if (!current) return current;
                          const rest = current.input_guidance.filter(
                            (item) => item.input_id !== port.id,
                          );
                          return {
                            ...current,
                            input_guidance: event.target.value
                              ? [...rest, { input_id: port.id, instruction: event.target.value }]
                              : rest,
                          };
                        })
                      }
                    />
                  </div>
                );
              })}
              <div className="grid gap-1">
                <Label htmlFor="pipeline-invocation-notes">Invocation notes · one per line</Label>
                <Textarea
                  id="pipeline-invocation-notes"
                  rows={2}
                  value={agentGuide.invocation_notes.join('\n')}
                  onChange={(event) =>
                    setAgentGuide((current) =>
                      current
                        ? { ...current, invocation_notes: lines(event.target.value) }
                        : current,
                    )
                  }
                />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Draft the guide, then edit it before publication. If drafting fails, these fields open
              with a manual starting point.
            </p>
          )}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Ready to save {scopedNodes.length} node{scopedNodes.length === 1 ? '' : 's'} and{' '}
        {scopedEdges.length} connection{scopedEdges.length === 1 ? '' : 's'}
        {isSelectionScoped ? ' from your selection.' : '.'}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!brandProfileId && (
        <p className="text-xs text-muted-foreground">Select a brand before saving a workflow.</p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={
            !brandProfileId ||
            isSaving ||
            pipelineHasNoPorts ||
            pipelineCandidateNeedsRights ||
            loadingEditorConfigurations ||
            editorConfigurationMissing ||
            (kind === 'pipeline' && !agentGuide)
          }
          title={
            !brandProfileId
              ? 'Select a brand before saving a workflow.'
              : pipelineHasNoPorts
                ? 'A pipeline needs at least one declared port.'
                : pipelineCandidateNeedsRights
                  ? 'A person Element candidate needs a rights basis.'
                  : loadingEditorConfigurations
                    ? 'Loading the saved editor configuration.'
                    : editorConfigurationMissing
                      ? 'Choose a reusable editor source slot before publishing.'
                      : kind === 'pipeline' && !agentGuide
                        ? 'Draft and review the agent guide before publishing.'
                        : undefined
          }
        >
          {isSaving
            ? kind === 'pipeline'
              ? 'Publishing...'
              : 'Saving...'
            : kind === 'pipeline'
              ? 'Publish pipeline'
              : isSelectionScoped
                ? 'Save selection'
                : 'Save workflow'}
        </Button>
      </div>
    </form>
  );

  // A Base UI Popover positions against its TRIGGER. Opened from the canvas context menu
  // there is no trigger to anchor to, and the panel never became visible — the menu item
  // fired, the state flipped, and nothing was on screen. (It is still in the DOM, which is
  // why a jsdom query finds it and a person does not; assert what is SHOWN, not what
  // mounted.) LoadWorkflowDialog carries the same branch for the same reason, which is why
  // Load Workflow opens from that menu and Save did not.
  if (!showTrigger) {
    if (!isOpen) return null;
    return (
      <div
        className="fixed right-4 top-20 z-[120] w-[clamp(320px,80vw,460px)] rounded-md border bg-popover text-popover-foreground shadow-lg"
        data-testid="save-workflow-panel"
      >
        {panel}
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closePanel())}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Upload className="mr-2 h-4 w-4" /> Save
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[clamp(320px,80vw,460px)] p-0">
        {panel}
      </PopoverContent>
    </Popover>
  );
}
