'use client';

import {
  API_RENDER_SUGGEST_FORKS_MAX,
  API_RENDER_SUGGEST_ROWS_MAX,
  type ApiRenderInputValue,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  readableLayerName,
} from '@continuum/contracts';
import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// "Draft with AI": a brief becomes rows in the Render grid — new rows, each with variations if
// asked, or variations of one row that change only what the person ticks. The rows arrive
// PROPOSED: on screen and checked like any typed row, but not saved, reviewed or rendered until
// they are kept. The model chooses pictures from the brand's Library and colours from its palette;
// it never names an asset or a hex of its own.
//
// Called rows, not variants: a VARIANT is a sibling version of the template — a ratio, a language —
// and lives in the Variants tab. See template-forge docs/TEMPLATE_IDENTITY.md.

export type AiDraftParent = {
  id: string;
  label: string;
  values: Record<string, ApiRenderInputValue>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value) || min));

export function AiDraftDialog({
  open,
  onOpenChange,
  brandId,
  bindingId,
  contract,
  parent,
  onDrafted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  /** Named only when the brand has more than one render workspace. */
  bindingId: string | null;
  contract: ApiRenderTemplateContract;
  /** Set: draft variations of this row. Unset: draft new rows. */
  parent: AiDraftParent | null;
  onDrafted: (response: ApiRenderSuggestRowsResponse) => void;
}) {
  const editable = contract.variables.filter((variable) => !variable.reserved);
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(parent ? 3 : 5);
  const [forks, setForks] = useState(0);
  const [vary, setVary] = useState<string[]>(() => editable.map((variable) => variable.key));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A new opening starts from what it is for: variations ask for a few, new rows for five.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only opening resets the form.
  useEffect(() => {
    if (!open) return;
    setCount(parent ? 3 : 5);
    setForks(0);
    setVary(editable.map((variable) => variable.key));
    setProblem(null);
  }, [open, parent?.id]);

  // Rows and their variations together stay within what one draft may return.
  const maxForks = Math.min(
    API_RENDER_SUGGEST_FORKS_MAX,
    Math.floor(API_RENDER_SUGGEST_ROWS_MAX / count) - 1,
  );
  const total = parent ? count : count * (1 + Math.min(forks, Math.max(0, maxForks)));

  const draft = async () => {
    if (!prompt.trim() || (parent && vary.length === 0)) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await apiRendersApi.suggestRows({
        brandId,
        ...(bindingId ? { bindingId } : {}),
        templateKey: contract.template.key,
        contractHash: contract.template.contractHash,
        prompt: prompt.trim(),
        count,
        forksPerRow: parent ? 0 : Math.min(forks, Math.max(0, maxForks)),
        ...(parent ? { parent, varyKeys: vary } : {}),
      });
      if (response.rows.length === 0) {
        setProblem(
          [
            'Nothing usable came back. Try a more specific brief.',
            ...response.unfilled,
            ...response.dropped.slice(0, 3),
          ].join(' '),
        );
        return;
      }
      onDrafted(response);
      setPrompt('');
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setProblem(
        message.includes('suggest_unavailable')
          ? 'The AI writer is unavailable right now. Try again in a few minutes, or add rows by hand.'
          : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {parent ? `Vary “${parent.label}” with AI` : 'Draft rows with AI'}
          </DialogTitle>
          <DialogDescription>
            {parent
              ? 'New variations of this row that change only what you tick. They arrive proposed: keep the ones you want.'
              : 'Rows from a brief, with pictures from your Library and colours from your palette. They arrive proposed: keep the ones you want.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-draft-prompt">Brief</Label>
            <Textarea
              id="ai-draft-prompt"
              value={prompt}
              maxLength={2000}
              rows={3}
              placeholder={
                parent
                  ? 'Punchier headlines, one per season'
                  : 'Five weekend offers for the summer range, each a different product and headline'
              }
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ai-draft-count">{parent ? 'Variations' : 'Rows'}</Label>
              <Input
                id="ai-draft-count"
                type="number"
                min={1}
                max={API_RENDER_SUGGEST_ROWS_MAX}
                className="w-24"
                value={count}
                onChange={(event) =>
                  setCount(clamp(Number(event.target.value), 1, API_RENDER_SUGGEST_ROWS_MAX))
                }
              />
            </div>
            {parent ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ai-draft-forks">Variations of each</Label>
                <Input
                  id="ai-draft-forks"
                  type="number"
                  min={0}
                  max={Math.max(0, maxForks)}
                  className="w-24"
                  value={Math.min(forks, Math.max(0, maxForks))}
                  onChange={(event) =>
                    setForks(clamp(Number(event.target.value), 0, Math.max(0, maxForks)))
                  }
                />
              </div>
            )}
            <p className="self-end pb-1.5 text-xs text-muted-foreground tabular-nums">
              {total} {total === 1 ? 'row' : 'rows'} in all
            </p>
          </div>
          {parent ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">What may change</legend>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {editable.map((variable) => (
                  // Siblings, not a checkbox inside its label: the label's own click would
                  // toggle it straight back.
                  <div key={variable.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`ai-draft-vary-${variable.key}`}
                      checked={vary.includes(variable.key)}
                      onCheckedChange={(checked) =>
                        setVary((current) =>
                          checked
                            ? [...current, variable.key]
                            : current.filter((key) => key !== variable.key),
                        )
                      }
                    />
                    <Label
                      htmlFor={`ai-draft-vary-${variable.key}`}
                      className="text-xs font-normal"
                    >
                      {readableLayerName(variable.label)}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={busy || !prompt.trim() || (parent !== null && vary.length === 0)}
            onClick={() => void draft()}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** On a template: go to Render with the draft dialog open, where the rows will land. */
export function DraftWithAiButton({
  templateKey,
  onOpenRender,
}: {
  /** Null until the template is published — there is no contract to draft against before that. */
  templateKey: string | null;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!templateKey}
        onClick={() => templateKey && onOpenRender?.({ templateKey, draftWithAi: true })}
      >
        <Sparkles className="size-3.5" aria-hidden />
        Draft rows with AI
      </Button>
      {templateKey ? null : (
        <span className="text-xs text-muted-foreground">
          Available once this template is published.
        </span>
      )}
    </>
  );
}
