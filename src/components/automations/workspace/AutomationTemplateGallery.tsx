'use client';

import type {
  AutomationWorkflowDefinition,
  ListAutomationTemplatesResponse,
} from '@continuum/contracts';
import { ArrowRight, LoaderCircle, Plus, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createWorkflowAutomation, fetchAutomationTemplates } from '@/lib/automations/automations';
import { createAutomationWorkflowNode } from './automationNodeCatalog';

type Template = ListAutomationTemplatesResponse['templates'][number];

const createBlankWorkflow = (): AutomationWorkflowDefinition => ({
  schemaVersion: 3,
  nodes: [
    createAutomationWorkflowNode({
      type: 'trigger.manual',
      id: 'manual-trigger',
      position: { x: 80, y: 160 },
    }),
  ],
  edges: [],
  execution: {
    maxRunSeconds: 900,
    maxParallelNodes: 4,
  },
  viewport: { x: 0, y: 0, zoom: 1 },
});

export function AutomationTemplateGallery({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAutomationTemplates(brandId)
      .then((next) => {
        if (!cancelled) setTemplates(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load workflow templates');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const createDraft = (
    id: string,
    name: string,
    definition: AutomationWorkflowDefinition,
  ): void => {
    setCreatingId(id);
    setError(null);
    void createWorkflowAutomation({
      brandId,
      name,
      definition: structuredClone(definition),
    })
      .then((automation) => router.push(`/automations/${automation.id}`))
      .catch((cause: unknown) => {
        setCreatingId(null);
        setError(cause instanceof Error ? cause.message : 'Could not create workflow draft');
      });
  };

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-medium">Start from a template</h2>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-violet-500/25 bg-violet-500/[0.035] p-5">
          <h3 className="font-medium">Blank canvas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with a manual trigger and construct the workflow directly—no agent conversation
            required.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">1 node · 0 connections</p>
          <Button
            size="sm"
            className="mt-4"
            disabled={creatingId !== null}
            onClick={() => createDraft('blank', 'Untitled workflow', createBlankWorkflow())}
          >
            {creatingId === 'blank' ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Create blank workflow
          </Button>
        </article>
        {templates.map((template) => (
          <article key={template.id} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-medium">{template.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              {template.definition.nodes.length} nodes · {template.definition.edges.length}{' '}
              connections
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={creatingId !== null}
              onClick={() => createDraft(template.id, template.name, template.definition)}
            >
              {creatingId === template.id ? (
                <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create editable draft
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
