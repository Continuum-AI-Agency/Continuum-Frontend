'use client';

import {
  type RenderWorkspace,
  renderWorkspaceLabel,
  type WorkspaceTemplate,
  workspaceTemplateLabel,
} from '@continuum/contracts';
import { Check, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { discoverWorkspaceTemplates, setTemplateAdoption } from '@/lib/library/templateSources';

// Templates that are ALREADY in the workspace.
//
// Discovery ends at an intersection — what the workspace holds ∩ what this brand has been granted
// — so a brand nobody has granted anything sees an empty picker on the canvas no matter how much
// is really there. That was only fixable by an engineer writing a membership row. This is the
// same list, with the grant as a button.
//
// It is deliberately NOT the Library list above it: that one is uploads, this one is the
// workspace, and the interesting rows are precisely the ones that never came through the Library.

export function WorkspaceTemplates({
  brandId,
  workspaceId,
}: {
  brandId: string;
  workspaceId?: string;
}) {
  const [items, setItems] = useState<WorkspaceTemplate[]>([]);
  const [workspace, setWorkspace] = useState<RenderWorkspace | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await discoverWorkspaceTemplates(brandId, workspaceId);
      setItems(result.items);
      setWorkspace(result.workspace);
    } catch {
      // Advisory: a brand with no binding yet has no workspace to read, which is a normal state
      // for a new tenant and must not put an error on the page.
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, [brandId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (item: WorkspaceTemplate) => {
    setBusy(item.templateKey);
    try {
      await setTemplateAdoption({
        brandId,
        templateKey: item.templateKey,
        enabled: !item.granted,
        ...(workspaceId ? { workspaceId } : {}),
      });
      await load();
      toast.success(
        item.granted
          ? `${workspaceTemplateLabel(item.name)} removed from this brand`
          : `${workspaceTemplateLabel(item.name)} is now available to render`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change that');
    } finally {
      setBusy(null);
    }
  };

  // Nothing there, or no workspace yet: say nothing rather than showing an empty frame.
  if (!loaded || items.length === 0) return null;

  return (
    <section className="rounded-lg border p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          Already in {workspace ? renderWorkspaceLabel(workspace) : 'this workspace'}
        </h3>
        <p className="text-xs text-muted-foreground">
          Templates here can be rendered by this brand once you add them.
        </p>
      </header>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.templateKey}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{workspaceTemplateLabel(item.name)}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>template {item.templateKey}</span>
                {item.draft ? <Badge variant="warning">Draft — not published yet</Badge> : null}
                {item.sourceAssetId ? <span>· uploaded here</span> : null}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={item.granted ? 'outline' : 'default'}
              className="gap-2"
              disabled={busy !== null}
              onClick={() => onToggle(item)}
            >
              {busy === item.templateKey ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : item.granted ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {item.granted ? 'Available' : 'Add to this brand'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
