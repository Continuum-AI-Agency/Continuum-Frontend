'use client';

import type {
  AutomationWorkflowDefinition,
  ListAutomationTemplatesResponse,
} from '@continuum/contracts';
import { ArrowRight, LoaderCircle, Plus, Sparkles } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUiErrorMessage } from '@/i18n/errors';
import { useRouter } from '@/i18n/navigation';
import { createWorkflowAutomation, fetchAutomationTemplates } from '@/lib/automations/automations';
import { automationTemplateDisplay } from '@/lib/automations/template-display';
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
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('automations');
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
          setError(formatUiError(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, formatUiError]);

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
        setError(formatUiError(cause));
      });
  };

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h2 className="text-sm font-medium">{uiText('start_from_a_template_8e9184c')}</h2>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl border border-violet-500/25 bg-violet-500/[0.035] p-5">
          <h3 className="font-medium">{uiText('blank_canvas_d719689')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiText('start_with_a_manual_trigger_and_construct_the_34a1bfe')}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            {uiText('1_node_0_connections_9626bd0')}
          </p>
          <Button
            size="sm"
            className="mt-4"
            disabled={creatingId !== null}
            onClick={() => createDraft('blank', 'Untitled workflow', createBlankWorkflow())}
          >
            {uiText.rich('sentence_45d022a6a89e', {
              v0: () =>
                creatingId === 'blank' ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                ),
            })}
          </Button>
        </article>
        {templates.map((template) => (
          <article key={template.id} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-medium">{automationTemplateDisplay(template, uiText).name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {automationTemplateDisplay(template, uiText).description}
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              {uiText('m_c9be816ad1', {
                nodes: template.definition.nodes.length,
                edges: template.definition.edges.length,
              })}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              disabled={creatingId !== null}
              onClick={() => createDraft(template.id, template.name, template.definition)}
            >
              {uiText.rich('sentence_162ef5d3b999', {
                v0: () =>
                  creatingId === template.id ? (
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                  ),
              })}
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
