import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { UploadIcon } from '@radix-ui/react-icons';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { coerceToastOptions, throwToastError, useToast } from '@/components/ui/ToastProvider';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { useStudioStore } from '../stores/useStudioStore';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const WORKFLOW_PAYLOAD_MAX_BYTES = 1024 * 1024;

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
      form.reset();
      setOpen(false);
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset();
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon className="w-4 h-4 mr-2" /> Save
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Save workflow</DialogTitle>
          <DialogDescription>
            Store this canvas as a reusable template for your brand.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="workflow-name">Name</Label>
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
          <div className="text-xs text-muted-foreground">
            Ready to save {nodes.length} nodes and {edges.length} connections.
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </form>
        <DialogFooter>
          <Button type="button" size="sm" onClick={onSubmit} disabled={!brandProfileId || isSaving}>
            {isSaving ? 'Saving...' : 'Save workflow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
