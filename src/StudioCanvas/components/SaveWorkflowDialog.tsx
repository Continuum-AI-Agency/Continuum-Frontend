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
import { useTranslations as useUiTranslations } from 'next-intl';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { elementCategoryLabel } from '@/components/ai-studio/elements/elementPresentation';
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
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { useValidationErrorMap } from '@/i18n/validation';
import { draftPipelineGuide, publishPipeline } from '@/lib/ai-studio/pipelines';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { getVideoProject } from '@/lib/api/videoProjects.client';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { inferTechniquePorts } from '../utils/techniqueFragment';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const WORKFLOW_PAYLOAD_MAX_BYTES = 200 * 1024 * 1024;

const saveWorkflowSchema = (translateUi: ReturnType<typeof useUiTranslations<'studio'>>) =>
  z.object({
    name: z.string().min(1, translateUi('validationWorkflowNameRequired')),
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

type SaveWorkflowFormValues = z.infer<ReturnType<typeof saveWorkflowSchema>>;

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
  const translateUi = useUiTranslations('studio');

  const configurable = ports.filter((port) => canConfigurePipelinePort(direction, port));
  if (configurable.length === 0) return null;

  return (
    <div className="mt-2 grid gap-2 border-t border-border/70 pt-2">
      <p className="font-medium text-foreground">
        {direction === 'input'
          ? translateUi('input_meaning_3df44444')
          : translateUi('output_meaning_bf71c714')}
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
                    aria-label={translateUi('value0_editor_source_slot_5493a10e', {
                      value0: String(label),
                    })}
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
                <span className="text-danger">
                  {translateUi('no_media_clips_to_replace_02fa30f8')}
                </span>
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
                <SelectTrigger
                  size="sm"
                  className="w-32"
                  aria-label={translateUi('value0_value1_type_45edf808', {
                    value0: String(label),
                    value1: String(direction),
                  })}
                >
                  <SelectValue
                    items={{
                      asset: 'Asset',
                      element: 'Element',
                      element_candidate: 'Element candidate',
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">{translateUi('asset_80d298c9')}</SelectItem>
                  {direction === 'input' ? (
                    <SelectItem value="element">{translateUi('element_4e5b548d')}</SelectItem>
                  ) : (
                    <SelectItem value="element_candidate">
                      {translateUi('element_candidate_3e7a96ef')}
                    </SelectItem>
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
                          : {
                              kind: 'element_candidate',
                              category: value as ElementCategory,
                            },
                    )
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-32"
                    aria-label={translateUi('elementCategoryLabel', {
                      label,
                      direction,
                    })}
                  >
                    <SelectValue
                      items={Object.fromEntries(
                        ELEMENT_CATEGORIES.map((category) => [
                          category,
                          elementCategoryLabel(category, translateUi),
                        ]),
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {ELEMENT_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {elementCategoryLabel(value, translateUi)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {binding.kind === 'element_candidate' && isElementPersonCategory(binding.category) ? (
                <Input
                  className="h-7 w-48 text-xs"
                  aria-label={translateUi('value0_candidate_rights_note_1c1f010d', {
                    value0: String(label),
                  })}
                  placeholder={translateUi('rights_basis_c272d465')}
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
          {' '}
          {translateUi('a_candidate_is_created_only_after_q_881e7a4f')}{' '}
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
  const validationErrorMap = useValidationErrorMap();

  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

  const { nodes, edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDraftingGuide, setIsDraftingGuide] = React.useState(false);
  const [guideSource, setGuideSource] = React.useState<'model' | 'fallback' | null>(null);
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
          setError(uiErrorText(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEditorConfigurations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, kind, timelineProjects, uiErrorText]);

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
    resolver: zodResolver(saveWorkflowSchema(translateUi), {
      error: validationErrorMap,
    }),
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
    setGuideSource(null);
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
      setGuideSource(draft.source ?? 'model');
    } catch (err) {
      // No invented guide: the Backend already falls back to a rule-based one when its writer
      // model fails, so reaching here means the request itself was refused (e.g. an input on
      // an occupied handle). Say why, and let the author fix it and redraft.
      const toastOptions = coerceToastOptions(err, {
        title: translateUi('could_not_draft_the_guide_8fbd3a35'),
        description: uiErrorText(err),
        variant: 'error',
      });
      setError(toastOptions.description ?? toastOptions.title);
    } finally {
      setIsDraftingGuide(false);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!brandProfileId) {
      setError(translateUi('select_a_brand_profile_to_save_work_0b42fdd4'));
      return;
    }
    // The description is what another agent reads to decide whether to run this pipeline,
    // so a filler line like "<name> creative pipeline." is worse than refusing.
    const description = values.description?.trim() ?? '';
    if (kind === 'pipeline' && !description) {
      form.setError('description', {
        message: translateUi('describe_what_this_pipeline_makes_a_21abf041'),
      });
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const snapshot = serializeWorkflowSnapshot(scopedNodes, scopedEdges, defaultEdgeType);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (payloadBytes > WORKFLOW_PAYLOAD_MAX_BYTES) {
        throwToastError({
          title: translateUi('workflow_too_large_to_save_143e70d8'),
          description: translateUi('value0_max_value1_remove_large_medi_bd0ca6a0', {
            value0: String(formatMiB(payloadBytes)),
            value1: String(formatMiB(WORKFLOW_PAYLOAD_MAX_BYTES)),
          }),
          variant: 'error',
        });
      }
      if (kind === 'pipeline') {
        if (loadingEditorConfigurations || editorConfigurationMissing) {
          throw new LocalizedUiError(translateUi('choose_a_reusable_editor_source_slo_b886ea9c'));
        }
        if (!pipelineMetadata || !agentGuide) {
          throw new LocalizedUiError(translateUi('pipelineGuideRequired'));
        }
        await publishPipeline({
          brand_profile_id: brandProfileId,
          name: values.name.trim(),
          description,
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
          description: description || undefined,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          metadata: {
            created_via: 'canvas_ui',
            ...(roomId ? { source_room_id: roomId } : {}),
          },
        });
      }
      show({
        title:
          kind === 'pipeline'
            ? translateUi('pipeline_published_f2dd44d3')
            : translateUi('workflow_saved_077e94fd'),
        description: values.name,
        variant: 'success',
      });
      closePanel();
    } catch (err) {
      const message = uiErrorText(err);
      const toastOptions = coerceToastOptions(err, {
        title: translateUi('save_failed_53ad6f99'),
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
          <p className="text-sm font-semibold text-foreground">
            {kind === 'pipeline'
              ? translateUi('publish_pipeline_a760fceb')
              : isSelectionScoped
                ? translateUi('save_selection_dd183ea6')
                : translateUi('save_workflow_e77921c8')}
          </p>
          <p className="text-xs text-muted-foreground">
            {kind === 'pipeline'
              ? translateUi('publish_value0_for_the_optimizer_to_bca8d0c2', {
                  value0: String(
                    isSelectionScoped
                      ? translateUi('these_nodes_336e7d13')
                      : translateUi('this_canvas_83f0df16'),
                  ),
                })
              : translateUi('store_value0_as_a_reusable_template_fe6bbc78', {
                  value0: String(
                    isSelectionScoped
                      ? translateUi('the_selected_nodes_e7eacff5')
                      : translateUi('this_canvas_83f0df16'),
                  ),
                })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={closePanel}
          aria-label={translateUi('close_workflow_saver_d0726d9e')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="workflow-name">{translateUi('name_dcd1d522')}</Label>
        <ToggleGroup
          value={kind}
          onValueChange={(value) => {
            const next = value as unknown as string;
            if (next === 'workflow' || next === 'pipeline') setKind(next);
          }}
          className="grid grid-cols-2"
          aria-label={translateUi('save_as_60af8a30')}
        >
          <ToggleGroupItem value="workflow" className="text-xs">
            {' '}
            {translateUi('workflow_2e2d5c56')}{' '}
          </ToggleGroupItem>
          <ToggleGroupItem value="pipeline" className="text-xs">
            {' '}
            {translateUi('pipeline_37e1c775')}{' '}
          </ToggleGroupItem>
        </ToggleGroup>

        {kind === 'pipeline' ? (
          <div className="rounded-md border border-subtle bg-surface p-2 text-xs">
            {ports && ports.inputPorts.length + ports.outputPorts.length > 0 ? (
              <>
                <p className="text-secondary">
                  <span className="font-medium text-foreground">
                    {ports.inputPorts.length} {translateUi('input_c96c6d5b')}{' '}
                    {ports.inputPorts.length === 1 ? '' : 's'}
                  </span>{' '}
                  {translateUi('and_6201111b')}{' '}
                  <span className="font-medium text-foreground">
                    {ports.outputPorts.length} {translateUi('output_e0ee8bb5')}{' '}
                    {ports.outputPorts.length === 1 ? '' : 's'}
                  </span>{' '}
                  {translateUi('the_whole_contract_everything_else__04f020f4')}{' '}
                </p>
                {ports.inputPorts.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {' '}
                    {translateUi('takes_6228c88a')}{' '}
                    {ports.inputPorts.map((port) => port.label ?? port.handleId).join(', ')}
                  </p>
                )}
                <PipelinePortBindingEditor
                  direction="input"
                  ports={ports.inputPorts}
                  bindings={pipelineBindings}
                  editorConfigurations={editorConfigurations}
                  onChange={(key, binding) =>
                    setPipelineBindings((current) => ({
                      ...current,
                      [key]: binding,
                    }))
                  }
                />
                <PipelinePortBindingEditor
                  direction="output"
                  ports={ports.outputPorts}
                  bindings={pipelineBindings}
                  editorConfigurations={editorConfigurations}
                  onChange={(key, binding) =>
                    setPipelineBindings((current) => ({
                      ...current,
                      [key]: binding,
                    }))
                  }
                />
                {ports.truncated && (
                  <p className="mt-1 text-warning">
                    {' '}
                    {translateUi('more_ports_than_a_pipeline_can_decl_1e9440cd')}{' '}
                  </p>
                )}
                {loadingEditorConfigurations ? (
                  <p className="mt-1 text-muted-foreground">
                    {' '}
                    {translateUi('loading_saved_editor_configuration_76da4a02')}{' '}
                  </p>
                ) : null}
              </>
            ) : (
              // Publishing this would hand the optimizer a graph it can run but never
              // steer, which is a worse outcome than refusing: it looks configurable and
              // produces the same creative every time.
              <p className="text-danger">
                {isSelectionScoped
                  ? translateUi('this_selection_1e0997de')
                  : translateUi('this_canvas_c4679bf5')}{' '}
                {translateUi('declares_no_ports_so_a_pipeline_cou_c586fb52')}{' '}
              </p>
            )}
          </div>
        ) : null}

        <Input
          id="workflow-name"
          placeholder={translateUi('launch_creative_flow_65b989d4')}
          {...form.register('name')}
        />
        {form.formState.errors.name?.message && (
          <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="workflow-description">
          {kind === 'pipeline'
            ? translateUi('what_it_makes_and_when_to_use_it_75d6bf54')
            : translateUi('description_526e0087')}
        </Label>
        <Textarea
          id="workflow-description"
          placeholder={
            kind === 'pipeline'
              ? translateUi('makes_9_16_launch_images_of_a_chara_2d38c4eb')
              : translateUi('optional_notes_for_your_team_8f687a50')
          }
          rows={3}
          aria-invalid={Boolean(form.formState.errors.description)}
          {...form.register('description')}
        />
        {form.formState.errors.description?.message && (
          <p className="text-xs text-danger">{form.formState.errors.description.message}</p>
        )}
      </div>

      {kind === 'pipeline' ? (
        <div className="grid gap-2 rounded-md border border-subtle bg-surface p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">{translateUi('agent_guide_e58f91e6')}</p>
              <p className="text-muted-foreground">
                {' '}
                {translateUi('review_what_another_agent_will_use__4870ea8d')}{' '}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!brandProfileId || isDraftingGuide || pipelineHasNoPorts}
              onClick={draftGuide}
            >
              {isDraftingGuide
                ? translateUi('drafting_c86753f7')
                : agentGuide
                  ? translateUi('redraft_d7eac419')
                  : translateUi('draft_guide_fadad9d9')}
            </Button>
          </div>
          {agentGuide ? (
            <>
              {guideSource === 'fallback' ? (
                <p className="text-xs text-muted-foreground">
                  {' '}
                  {translateUi('drafted_from_the_pipeline_s_inputs__46be92c0')}{' '}
                </p>
              ) : null}
              <div className="grid gap-1">
                <Label htmlFor="pipeline-use-when">
                  {translateUi('use_when_one_per_line_bf069d8f')}
                </Label>
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
                <Label htmlFor="pipeline-avoid-when">
                  {translateUi('avoid_when_one_per_line_378174c0')}
                </Label>
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
                      {port.label ?? port.id} {translateUi('guidance_f8aac527')}{' '}
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
                              ? [
                                  ...rest,
                                  {
                                    input_id: port.id,
                                    instruction: event.target.value,
                                  },
                                ]
                              : rest,
                          };
                        })
                      }
                    />
                  </div>
                );
              })}
              <div className="grid gap-1">
                <Label htmlFor="pipeline-invocation-notes">
                  {translateUi('invocation_notes_one_per_line_0b5b65a0')}
                </Label>
                <Textarea
                  id="pipeline-invocation-notes"
                  rows={2}
                  value={agentGuide.invocation_notes.join('\n')}
                  onChange={(event) =>
                    setAgentGuide((current) =>
                      current
                        ? {
                            ...current,
                            invocation_notes: lines(event.target.value),
                          }
                        : current,
                    )
                  }
                />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              {' '}
              {translateUi('draft_the_guide_then_edit_it_before_79e5f747')}{' '}
            </p>
          )}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('ready_to_save_255249e7')} {scopedNodes.length} {translateUi('node_545ea538')}
        {scopedNodes.length === 1 ? '' : 's'} {translateUi('and_6201111b')} {scopedEdges.length}{' '}
        {translateUi('connection_b38d9d16')}
        {scopedEdges.length === 1 ? '' : 's'}
        {isSelectionScoped ? translateUi('from_your_selection_3beaf146') : '.'}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
      {!brandProfileId && (
        <p className="text-xs text-muted-foreground">
          {translateUi('select_a_brand_before_saving_a_work_b22b9186')}
        </p>
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
              ? translateUi('select_a_brand_before_saving_a_work_b22b9186')
              : pipelineHasNoPorts
                ? translateUi('a_pipeline_needs_at_least_one_decla_3099f745')
                : pipelineCandidateNeedsRights
                  ? translateUi('a_person_element_candidate_needs_a__0f368e01')
                  : loadingEditorConfigurations
                    ? translateUi('loading_the_saved_editor_configurat_3c75b58d')
                    : editorConfigurationMissing
                      ? translateUi('choose_a_reusable_editor_source_slo_b886ea9c')
                      : kind === 'pipeline' && !agentGuide
                        ? translateUi('draft_and_review_the_agent_guide_be_b1cfeeac')
                        : undefined
          }
        >
          {isSaving
            ? kind === 'pipeline'
              ? translateUi('publishing_5f51143b')
              : translateUi('saving_dc85af8f')
            : kind === 'pipeline'
              ? translateUi('publish_pipeline_a760fceb')
              : isSelectionScoped
                ? translateUi('save_selection_dd183ea6')
                : translateUi('save_workflow_e77921c8')}
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
            <Upload className="mr-2 h-4 w-4" /> {translateUi('save_1509f561')}{' '}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[clamp(320px,80vw,460px)] p-0">
        {panel}
      </PopoverContent>
    </Popover>
  );
}
