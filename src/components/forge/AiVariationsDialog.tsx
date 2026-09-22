'use client';

import {
  API_RENDER_SUGGEST_FORKS_MAX,
  API_RENDER_SUGGEST_ROWS_MAX,
  type ApiRenderInputValue,
  type ApiRenderRowGate,
  type ApiRenderSuggestRowsResponse,
  type ApiRenderTemplateContract,
  readableLayerName,
} from '@continuum/contracts';
import { Loader2, Sparkles, TriangleAlert } from 'lucide-react';
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
import { warmLaya } from '@/lib/api/layaWarm';
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
//
// Every drafted row comes back checked against the brand's written rules (Laya, on the Backend).
// Only a confident FAIL is shown: it is flagged and starts unticked — shown, never hidden, and the
// person decides. Measured, those flags were right every time; a pass was right ~9 times in 10 at
// any bar, which is not good enough to put a check mark on a row. So a pass, an unsure and a
// checker that was down all show nothing — a badge on every undecided row is a badge people learn to
// ignore. Every verdict stays in the contract for MCP and telemetry.

type DraftedRow = ApiRenderSuggestRowsResponse['rows'][number];

/** A flagged row's failure in words a person can act on; null for every other row. */
function gateSentence(gate: ApiRenderRowGate, labels: Map<string, string>): string | null {
  if (gate.status !== 'flagged') return null;
  const rule = (check: ApiRenderRowGate['checks'][number]) => {
    switch (check.rule) {
      case 'names_offer':
        return 'does not name the product in its picture';
      case 'brand_language':
        return "is not in the brand's language";
      default:
        return `“${readableLayerName(labels.get(check.subject ?? '') ?? check.subject ?? '')}” is not the kind of text its slot holds`;
    }
  };
  const said = [...new Set(gate.checks.filter((check) => check.verdict === 'fail').map(rule))];
  return `Fails: ${said.join('; ')}${gate.regenerated ? ' (rewritten once)' : ''}`;
}

const flaggedRow = (row: DraftedRow) => row.gate?.status === 'flagged';

/** The rows a person kept: ticked, and every row above it ticked too — a variation needs its row. */
function keptRows(rows: DraftedRow[], ticked: ReadonlySet<string>): DraftedRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept = (row: DraftedRow): boolean =>
    ticked.has(row.id) &&
    (!row.parentId || !byId.has(row.parentId) || kept(byId.get(row.parentId) as DraftedRow));
  return rows.filter(kept);
}

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
  initialVaryKeys,
  initialCount,
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
  /** What the path that opened this already decided may change — a cell ticks only its own key. */
  initialVaryKeys?: string[] | null;
  initialCount?: number | null;
  onDrafted: (response: ApiRenderSuggestRowsResponse) => void;
}) {
  const editable = contract.variables.filter((variable) => !variable.reserved);
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(parent ? 3 : 5);
  const [forks, setForks] = useState(0);
  const [vary, setVary] = useState<string[]>(() => editable.map((variable) => variable.key));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<ApiRenderSuggestRowsResponse | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());

  // A new opening starts from what it is for: variations ask for a few, new rows for five.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only opening resets the form.
  useEffect(() => {
    if (!open) return;
    // The checker scales to zero and takes about ninety seconds to wake: start it while they type.
    warmLaya();
    setDrafted(null);
    setCount(initialCount ?? (parent ? 3 : 5));
    setForks(0);
    setVary(initialVaryKeys?.length ? initialVaryKeys : editable.map((variable) => variable.key));
    setProblem(null);
  }, [open, parent?.id, initialCount, initialVaryKeys]);

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
      setPrompt('');
      // Nothing flagged — every row passed, was unsure, or went unchecked: nothing to show, so the
      // rows go straight in.
      if (!response.rows.some(flaggedRow)) {
        onDrafted(response);
        onOpenChange(false);
        return;
      }
      setTicked(
        new Set(response.rows.filter((row) => row.gate?.status !== 'flagged').map((row) => row.id)),
      );
      setDrafted(response);
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

  const addChecked = () => {
    if (!drafted) return;
    onDrafted({ ...drafted, rows: keptRows(drafted.rows, ticked) });
    setDrafted(null);
    onOpenChange(false);
  };

  if (drafted) {
    const labels = new Map(contract.variables.map((variable) => [variable.key, variable.label]));
    const byId = new Set(drafted.rows.map((row) => row.id));
    const kept = keptRows(drafted.rows, ticked).length;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Some rows failed your brand’s rules</DialogTitle>
            <DialogDescription>
              A row that failed a rule starts unticked — read why, and keep it if you disagree.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {drafted.rows.map((row) => {
              const sentence = row.gate ? gateSentence(row.gate, labels) : null;
              const nested = row.parentId !== null && byId.has(row.parentId);
              return (
                <li
                  key={row.id}
                  className={nested ? 'ml-6 flex items-start gap-2' : 'flex items-start gap-2'}
                >
                  <Checkbox
                    id={`ai-draft-keep-${row.id}`}
                    checked={ticked.has(row.id)}
                    onCheckedChange={(checked) =>
                      setTicked((current) => {
                        const next = new Set(current);
                        if (checked) next.add(row.id);
                        else next.delete(row.id);
                        return next;
                      })
                    }
                  />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Label htmlFor={`ai-draft-keep-${row.id}`} className="text-sm font-normal">
                      {row.label}
                    </Label>
                    {sentence ? (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        {sentence}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDrafted(null)}>
              Back
            </Button>
            <Button type="button" disabled={kept === 0} onClick={addChecked}>
              Add {kept} {kept === 1 ? 'row' : 'rows'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

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
