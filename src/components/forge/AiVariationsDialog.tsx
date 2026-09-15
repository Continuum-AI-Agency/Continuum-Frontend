'use client';

import { API_RENDER_SUGGEST_ROWS_MAX } from '@continuum/contracts';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { Button } from '@/components/ui/button';
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
import { toast } from '@/components/ui/toast-imperative';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { describeRenderDiscoveryFailure } from '@/StudioCanvas/nodes/api-render/renderDiscoveryCopy';

// "Draft variations with AI": a prompt becomes rows, the rows become a saved render set, and the
// Render tab opens on it. Proposals only — nothing renders until a person fires it from the grid,
// where every drafted row goes through the same checks as a typed one.

/**
 * The workspace this template lives in, and whether naming it matters. One workspace is not a
 * question — the server answers from the default — so only a brand with several is asked in turn.
 */
async function bindingFor(
  brandId: string,
  templateKey: string,
): Promise<{ bindingId: string | null; several: boolean }> {
  const { items } = await apiRendersApi.listEnvironments(brandId);
  if (items.length <= 1) return { bindingId: items[0]?.bindingId ?? null, several: false };
  for (const environment of items) {
    const templates = await apiRendersApi.listTemplates(brandId, environment.bindingId);
    if (templates.items.some((template) => template.key === templateKey)) {
      return { bindingId: environment.bindingId, several: true };
    }
  }
  return { bindingId: null, several: true };
}

export function AiVariationsDialog({
  brandId,
  templateKey,
  onOpenRender,
}: {
  brandId: string;
  /** Null until the template is published — there is no contract to draft against before that. */
  templateKey: string | null;
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const draft = async () => {
    if (!templateKey || !prompt.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const { bindingId, several } = await bindingFor(brandId, templateKey);
      if (!bindingId) throw new Error('render_workspace_not_bound');
      const contract = await apiRendersApi.getContract(
        brandId,
        templateKey,
        several ? bindingId : null,
      );
      const suggested = await apiRendersApi.suggestRows({
        brandId,
        ...(several ? { bindingId } : {}),
        templateKey,
        contractHash: contract.template.contractHash,
        prompt: prompt.trim(),
        count,
      });
      if (suggested.rows.length === 0) {
        setProblem('Nothing usable came back. Try a more specific prompt.');
        return;
      }
      const name = prompt.trim().replace(/\s+/g, ' ');
      const set = await apiRendersApi.createRenderSet({
        brandId,
        bindingId,
        name: name.length > 80 ? `${name.slice(0, 79)}…` : name,
        templateKey,
        contractHash: contract.template.contractHash,
        rows: suggested.rows.map((row, index) => ({
          id: crypto.randomUUID(),
          parentId: null,
          label: row.label.trim().slice(0, 200) || `Variation ${index + 1}`,
          overrides: row.variables,
          clearedKeys: [],
          outputIds: contract.outputs.map((output) => output.id),
        })),
      });
      toast.success(
        `${set.rows.length} variation${set.rows.length === 1 ? '' : 's'} saved${
          suggested.dropped.length
            ? ` — ${suggested.dropped.length} value${suggested.dropped.length === 1 ? '' : 's'} dropped as off-template`
            : ''
        }`,
      );
      setOpen(false);
      setPrompt('');
      onOpenRender?.({ templateKey, renderSetId: set.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setProblem(
        message.includes('suggest_unavailable')
          ? 'The AI writer is unavailable right now. Try again in a few minutes, or add rows by hand in Render.'
          : describeRenderDiscoveryFailure(message),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="gap-2"
        disabled={!templateKey}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden />
        Draft variations with AI
      </Button>
      {templateKey ? null : (
        <p className="mt-2 text-xs text-muted-foreground">
          Available once this template is published.
        </p>
      )}
      <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft variations with AI</DialogTitle>
            <DialogDescription>
              Describe what should change between versions. The rows are saved as a new render set
              and open in Render for you to check before anything is rendered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-variations-prompt">Prompt</Label>
              <Textarea
                id="ai-variations-prompt"
                value={prompt}
                maxLength={2000}
                rows={4}
                placeholder="Five weekend offers for our summer range, each with a different headline and price"
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-variations-count">How many</Label>
              <Input
                id="ai-variations-count"
                type="number"
                min={1}
                max={API_RENDER_SUGGEST_ROWS_MAX}
                className="w-24"
                value={count}
                onChange={(event) =>
                  setCount(
                    Math.min(
                      API_RENDER_SUGGEST_ROWS_MAX,
                      Math.max(1, Math.round(Number(event.target.value) || 1)),
                    ),
                  )
                }
              />
            </div>
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={busy || !prompt.trim()}
              onClick={() => void draft()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              Draft rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
