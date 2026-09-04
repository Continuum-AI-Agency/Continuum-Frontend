import { PIPELINE_METADATA_FLAG } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, X } from 'lucide-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { coerceToastOptions, throwToastError, useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { useStudioStore } from '../stores/useStudioStore';
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

type SaveWorkflowDialogProps = {
  brandProfileId?: string;
  roomId?: string;
};

export function SaveWorkflowDialog({ brandProfileId, roomId }: SaveWorkflowDialogProps) {
  const { nodes, edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [kind, setKind] = React.useState<SaveKind>('workflow');

  // Inferred from the WHOLE canvas: publishing is a statement about this graph, not about
  // whatever happens to be selected. Recomputed only while the panel is open — the pass
  // walks every node and edge, and the header re-renders on every canvas change.
  const ports = React.useMemo(
    () => (open && kind === 'pipeline' ? inferTechniquePorts(nodes, edges) : null),
    [open, kind, nodes, edges],
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
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!brandProfileId) {
      setError('Select a brand profile to save workflows.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const snapshot = serializeWorkflowSnapshot(nodes, edges, defaultEdgeType);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (payloadBytes > WORKFLOW_PAYLOAD_MAX_BYTES) {
        throwToastError({
          title: 'Workflow too large to save',
          description: `${formatMiB(payloadBytes)} (max ${formatMiB(WORKFLOW_PAYLOAD_MAX_BYTES)}). Remove large media inputs.`,
          variant: 'error',
        });
      }
      await createAiStudioWorkflowAction({
        brandProfileId,
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        metadata: {
          created_via: 'canvas_ui',
          ...(roomId ? { source_room_id: roomId } : {}),
          ...(kind === 'pipeline' && ports
            ? {
                [PIPELINE_METADATA_FLAG]: {
                  version: 1,
                  kind: 'generation',
                  inputPorts: ports.inputPorts,
                  outputPorts: ports.outputPorts,
                  publishedAt: new Date().toISOString(),
                },
              }
            : {}),
        },
      });
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

  return (
    <Popover open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closePanel())}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <Upload className="mr-2 h-4 w-4" /> Save
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[clamp(320px,80vw,460px)] p-0">
        <form onSubmit={onSubmit} className="grid gap-3 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-primary">
                {kind === 'pipeline' ? 'Publish pipeline' : 'Save workflow'}
              </p>
              <p className="text-xs text-muted-foreground">
                {kind === 'pipeline'
                  ? 'Publish this canvas for the optimizer to run on its own.'
                  : 'Store this canvas as a reusable template for your brand.'}
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
              value={[kind]}
              onValueChange={(value) => {
                const next = (value as SaveKind[])[0];
                if (next) setKind(next);
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
                        Takes:{' '}
                        {ports.inputPorts.map((port) => port.label ?? port.handleId).join(', ')}
                      </p>
                    )}
                    {ports.truncated && (
                      <p className="mt-1 text-warning">
                        More ports than a pipeline can declare — only the first 12 a side are kept.
                      </p>
                    )}
                  </>
                ) : (
                  // Publishing this would hand the optimizer a graph it can run but never
                  // steer, which is a worse outcome than refusing: it looks configurable and
                  // produces the same creative every time.
                  <p className="text-danger">
                    This canvas declares no ports, so a pipeline could not be given anything or read
                    anything back. Leave a required input unwired — a reference image or a prompt —
                    then publish.
                  </p>
                )}
              </div>
            ) : null}

            <Input
              id="workflow-name"
              placeholder="Launch creative flow"
              {...form.register('name')}
            />
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

          <p className="text-xs text-muted-foreground">
            Ready to save {nodes.length} nodes and {edges.length} connections.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          {!brandProfileId && (
            <p className="text-xs text-muted-foreground">
              Select a brand before saving a workflow.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!brandProfileId || isSaving}
              title={!brandProfileId ? 'Select a brand before saving a workflow.' : undefined}
            >
              {isSaving
                ? kind === 'pipeline'
                  ? 'Publishing...'
                  : 'Saving...'
                : kind === 'pipeline'
                  ? 'Publish pipeline'
                  : 'Save workflow'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
