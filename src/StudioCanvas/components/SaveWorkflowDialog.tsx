import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Cross2Icon, UploadIcon } from '@radix-ui/react-icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { coerceToastOptions, throwToastError, useToast } from '@/components/ui/ToastProvider';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { useStudioStore } from '../stores/useStudioStore';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const WORKFLOW_PAYLOAD_MAX_BYTES = 30 * 1024 * 1024;

const saveWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  description: z.string().optional(),
});

type SaveWorkflowFormValues = z.infer<typeof saveWorkflowSchema>;

type SaveWorkflowDialogProps = {
  brandProfileId?: string;
};

export function SaveWorkflowDialog({ brandProfileId }: SaveWorkflowDialogProps) {
  const { nodes, edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

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
      });
      show({ title: 'Workflow saved', description: values.name, variant: 'success' });
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
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon className="mr-2 h-4 w-4" /> Save
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <form onSubmit={onSubmit} className="grid gap-3 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-primary">Save workflow</p>
              <p className="text-xs text-muted-foreground">Store this canvas as a reusable template for your brand.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={closePanel}
              aria-label="Close workflow saver"
            >
              <Cross2Icon className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input id="workflow-name" placeholder="Launch creative flow" {...form.register('name')} />
            {form.formState.errors.name?.message && <p className="text-xs text-danger">{form.formState.errors.name.message}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea id="workflow-description" placeholder="Optional notes for your team" rows={3} {...form.register('description')} />
          </div>

          <p className="text-xs text-muted-foreground">
            Ready to save {nodes.length} nodes and {edges.length} connections.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!brandProfileId || isSaving}>
              {isSaving ? 'Saving...' : 'Save workflow'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
