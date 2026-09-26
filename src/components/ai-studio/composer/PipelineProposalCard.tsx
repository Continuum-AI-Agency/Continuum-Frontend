'use client';

// The Canvas Composer built and checked a pipeline but published NOTHING: this card is the
// approval. The user reads the capability the agent would publish, fixes the name and the
// description another agent will select it by, and either publishes or walks away.

import type { PipelinePublicationResponse } from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Workflow } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PipelineContract } from '@/components/ai-studio/PipelineContract';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import {
  brandPipelineManifestsQueryKey,
  pipelineCapabilitiesQueryKey,
  publishPipeline,
} from '@/lib/ai-studio/pipelines';
import type { ComposerPipelineProposal } from './useCanvasComposer';

const proposalFormSchema = z.object({
  name: z.string().trim().min(1, 'Name the pipeline').max(200),
  description: z
    .string()
    .trim()
    .min(1, 'Describe what this pipeline makes and when to use it.')
    .max(1_000),
});
type ProposalFormValues = z.infer<typeof proposalFormSchema>;

export function PipelineProposalCard({
  proposal,
  onPublished,
  onDismiss,
  publish = publishPipeline,
}: {
  proposal: ComposerPipelineProposal;
  onPublished: () => void;
  onDismiss: () => void;
  publish?: (input: unknown) => Promise<PipelinePublicationResponse>;
}) {
  const { request, capability } = proposal;
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  const published = proposal.outcome === 'published';
  const form = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalFormSchema),
    defaultValues: { name: request.name, description: request.description },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ name, description }) => {
    setError(null);
    try {
      await publish({ ...request, name, description, created_via: 'canvas_agent' });
      // Voided: an awaited invalidate holds the button in "Publishing…" after the row landed.
      void queryClient.invalidateQueries({
        queryKey: pipelineCapabilitiesQueryKey(request.brand_profile_id),
      });
      void queryClient.invalidateQueries({
        queryKey: brandPipelineManifestsQueryKey(request.brand_profile_id),
      });
      show({ title: 'Pipeline published', description: name, variant: 'success' });
      onPublished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The pipeline could not be published.');
    }
  });

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
      aria-label="Pipeline proposal"
      data-testid="composer-pipeline-proposal"
    >
      <div className="flex items-center gap-2">
        <Workflow className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-medium">
          {published ? 'Pipeline published' : 'Pipeline ready to publish'}
        </p>
        {published ? (
          <Pill variant="success">
            <PillIndicator variant="success" />
            Published
          </Pill>
        ) : null}
      </div>

      <PipelineContract manifest={capability} className="max-h-48 overflow-y-auto" />

      <div className="grid gap-1">
        <Label htmlFor={`pipeline-proposal-name-${capability.pipeline_id}`}>Name</Label>
        <Input
          id={`pipeline-proposal-name-${capability.pipeline_id}`}
          disabled={published}
          aria-invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
        {errors.name?.message ? <p className="text-xs text-danger">{errors.name.message}</p> : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`pipeline-proposal-description-${capability.pipeline_id}`}>
          What it makes and when to use it
        </Label>
        <Textarea
          id={`pipeline-proposal-description-${capability.pipeline_id}`}
          rows={3}
          disabled={published}
          aria-invalid={Boolean(errors.description)}
          {...form.register('description')}
        />
        {errors.description?.message ? (
          <p className="text-xs text-danger">{errors.description.message}</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={published || isSubmitting}
          onClick={onDismiss}
        >
          Dismiss
        </Button>
        <Button type="submit" size="sm" disabled={published || isSubmitting}>
          {isSubmitting ? 'Publishing…' : published ? 'Published' : 'Publish pipeline'}
        </Button>
      </div>
    </form>
  );
}
