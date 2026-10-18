'use client';

import type {
  PresentationCommand,
  PresentationDocument,
  PresentationEnvelope,
  PresentationProposal,
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type PresentationScope, presentationsApi } from '@/lib/api/presentations.client';
import { cn } from '@/lib/utils';
import { PresentationCanvas } from './PresentationCanvas';
import type { PresentationEngine } from './presentationEngine';

const promptSchema = z.object({
  prompt: z.string().trim().min(1, 'Describe how the deck should change.').max(20_000),
  scope: z.enum(['deck', 'selected']),
});
const variantSchema = z.object({ name: z.string().trim().min(1, 'Name this variant.').max(120) });

export function PresentationAgentPanel({
  scope,
  envelope,
  document,
  engine,
  slideId,
  selectedSlideIds,
  dirty,
  save,
  adopt,
  onError,
  onChanged,
  onOpenVariant,
  onCommands,
  editorBusy = false,
}: {
  scope: PresentationScope;
  envelope: PresentationEnvelope;
  document: PresentationDocument;
  engine: PresentationEngine | null;
  slideId: string;
  selectedSlideIds: string[];
  dirty: boolean;
  save: () => Promise<boolean>;
  adopt: (envelope: PresentationEnvelope) => void;
  onError: (message: string) => void;
  onChanged: () => Promise<void>;
  onOpenVariant?: (assetId: string) => void;
  onCommands: (commands: PresentationCommand[]) => Promise<boolean>;
  editorBusy?: boolean;
}) {
  const form = useForm<z.infer<typeof promptSchema>>({
    resolver: zodResolver(promptSchema),
    defaultValues: { prompt: '', scope: 'deck' },
  });
  const variant = useForm<z.infer<typeof variantSchema>>({
    resolver: zodResolver(variantSchema),
    defaultValues: { name: '' },
  });
  const [requestBusy, setBusy] = useState(false);
  const busy = requestBusy || editorBusy;
  const [proposalSet, setProposalSet] = useState<{
    proposals: PresentationProposal[];
    expectedRevision: number;
  } | null>(null);
  const [selected, setSelected] = useState<PresentationProposal | null>(null);
  const [comparison, setComparison] = useState<PresentationDocument | null>(null);
  const [saved, setSaved] = useState<{ assetId: string; name: string } | null>(null);
  const stale = dirty || proposalSet?.expectedRevision !== envelope.draftRevision;

  useEffect(() => {
    setComparison(null);
    if (!selected || !engine || stale) return;
    let cancelled = false;
    void engine
      .process({
        operation: 'apply',
        document,
        expectedRevision: document.revision,
        retryId: crypto.randomUUID(),
        commands: selected.commands,
      })
      .then((result) => {
        if (!cancelled && result.ok && result.document) setComparison(result.document);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          onError(
            reason instanceof Error ? reason.message : 'This proposal could not be previewed.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [selected, engine, document, stale, onError]);

  const propose = form.handleSubmit(async (values) => {
    if (dirty)
      return onError(
        'Save your presentation before asking for variants so the proposal uses the current revision.',
      );
    if (values.scope === 'selected' && selectedSlideIds.length === 0)
      return onError('Choose one or more slides in the slide rail first.');
    setBusy(true);
    try {
      const result = await presentationsApi.propose(
        scope,
        envelope.draftRevision,
        values.prompt,
        values.scope === 'selected' ? selectedSlideIds : undefined,
      );
      setProposalSet(result);
      setSelected(null);
      setSaved(null);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'The agent could not draft variants.');
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Describe the audience, narrative, and changes you want. Review proposed edits before
        applying them or saving an independent variant.
      </p>
      {document.layouts?.length ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Allowed layouts</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Choose the layouts agents can use. Save these choices before drafting.
          </p>
          <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto">
            {document.layouts.map((layout) => (
              <Field key={layout.id} orientation="horizontal">
                <Checkbox
                  id={`agent-layout-${layout.id}`}
                  checked={layout.agentAllowed}
                  disabled={busy || !engine || document.capabilities.apply === false}
                  onCheckedChange={(value) =>
                    void onCommands([
                      { type: 'layout.allow', layoutId: layout.id, allowed: value === true },
                    ])
                  }
                />
                <FieldLabel htmlFor={`agent-layout-${layout.id}`}>{layout.name}</FieldLabel>
              </Field>
            ))}
          </div>
        </details>
      ) : null}
      <form onSubmit={propose}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="presentation-agent-scope">Change</FieldLabel>
            <Select
              value={form.watch('scope')}
              onValueChange={(value) => form.setValue('scope', value)}
              disabled={busy}
            >
              <SelectTrigger id="presentation-agent-scope">
                <SelectValue
                  items={{
                    deck: 'Whole deck',
                    selected: `${selectedSlideIds.length} selected slides`,
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="deck">Whole deck</SelectItem>
                  <SelectItem value="selected">Selected slides</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="presentation-agent-prompt">Brief</FieldLabel>
            <Textarea
              id="presentation-agent-prompt"
              rows={5}
              disabled={busy}
              placeholder="Adapt this deck for our customer pitch. Keep the supplied numbers and brand styling."
              {...form.register('prompt')}
            />
            <FieldError errors={[form.formState.errors.prompt]} />
          </Field>
          {dirty ? (
            <Button type="button" variant="outline" onClick={() => void save()}>
              Save before drafting
            </Button>
          ) : null}
          <Button type="submit" disabled={busy || dirty}>
            {busy ? 'Drafting variants…' : 'Draft variants'}
          </Button>
        </FieldGroup>
      </form>
      {proposalSet ? (
        <section aria-label="Proposed variants" className="flex flex-col gap-2">
          {stale ? (
            <p role="status" className="text-xs text-muted-foreground">
              These proposals refer to an earlier revision. Draft again after saving.
            </p>
          ) : null}
          {proposalSet.proposals.map((proposal) => (
            <Button
              key={proposal.id}
              variant="outline"
              className={cn(
                'h-auto justify-start whitespace-normal p-3 text-left',
                selected?.id === proposal.id && 'border-primary',
              )}
              disabled={busy || stale}
              onClick={() => {
                setSelected(proposal);
                variant.setValue('name', proposal.name);
              }}
            >
              <span className="flex flex-col gap-1">
                <span>{proposal.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {proposal.summary}
                </span>
                <span className="text-xs font-normal">
                  {proposal.commands.length} proposed edits
                </span>
              </span>
            </Button>
          ))}
        </section>
      ) : null}
      {selected && !stale ? (
        <section aria-label="Variant comparison" className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Original and proposed slide</h3>
          <PresentationCanvas document={document} slideId={slideId} engine={engine} thumbnail />
          {comparison ? (
            <PresentationCanvas
              document={comparison}
              slideId={
                comparison.slides.some((item) => item.id === slideId)
                  ? slideId
                  : comparison.slides[0]?.id || ''
              }
              engine={engine}
              thumbnail
            />
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              Rendering proposed changes…
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy || !comparison}
            onClick={async () => {
              setBusy(true);
              try {
                adopt(
                  await presentationsApi.applyProposals(
                    scope,
                    envelope.draftRevision,
                    [selected.id],
                    crypto.randomUUID(),
                  ),
                );
                setProposalSet(null);
                setSelected(null);
              } catch (reason) {
                onError(
                  reason instanceof Error ? reason.message : 'The proposal could not be applied.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply to this deck
          </Button>
        </section>
      ) : null}
      <form
        onSubmit={variant.handleSubmit(async (values) => {
          if (dirty) return onError('Save your changes before creating an independent variant.');
          setBusy(true);
          try {
            const result = await presentationsApi.saveVariant(
              scope,
              envelope.draftRevision,
              values.name,
              selected && !stale ? selected.id : undefined,
              crypto.randomUUID(),
            );
            setSaved(result);
            await onChanged();
          } catch (reason) {
            onError(reason instanceof Error ? reason.message : 'The variant could not be saved.');
          } finally {
            setBusy(false);
          }
        })}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="presentation-variant-name">Variant name</FieldLabel>
            <Input id="presentation-variant-name" disabled={busy} {...variant.register('name')} />
            <FieldError errors={[variant.formState.errors.name]} />
          </Field>
          <Button
            type="submit"
            variant="outline"
            disabled={busy || dirty || Boolean(selected && stale)}
          >
            Save independent variant
          </Button>
        </FieldGroup>
      </form>
      {saved ? (
        <p role="status" className="text-sm">
          Saved “{saved.name}”.{' '}
          {onOpenVariant ? (
            <Button size="sm" variant="link" onClick={() => onOpenVariant(saved.assetId)}>
              Open variant
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
