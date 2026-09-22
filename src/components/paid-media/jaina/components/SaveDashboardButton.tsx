'use client';

// "Save as dashboard": keep this report's visible blocks under a name. The creation flow
// stays conversational — a person asked Jaina for an analysis and liked it; this is the
// one affordance that turns that exact output into something they come back to.

import { LayoutDashboardIcon } from 'lucide-react';
import { useState } from 'react';
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
import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { saveDashboard } from '@/lib/jaina/dashboards.client';
import type { CheckpointBlockV2, CheckpointReportV2 } from '@/lib/jaina/schemas';

type SaveDashboardButtonProps = {
  report: CheckpointReportV2;
  blocks: CheckpointBlockV2[];
  /**
   * The question this report answered — the user turn that preceded it.
   *
   * It is what "Ask Jaina to refresh" sends. Stored as null, the saved-dashboards panel falls
   * back to `Refresh the analysis "<title>" with today's data`, which is a generic template
   * standing in for whatever the person actually asked; the report then comes back answering a
   * different question from the one saved under that name.
   */
  sourcePrompt?: string | null;
  disabled?: boolean;
};

export function SaveDashboardButton({
  report,
  blocks,
  sourcePrompt,
  disabled,
}: SaveDashboardButtonProps) {
  const scope = useJainaBrandScope();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  if (!scope) return null;
  // A V2 report carries no title of its own; the first module's title is the closest thing
  // to what the person asked for.
  const defaultTitle = blocks[0]?.title ?? report.blocks[0]?.title ?? 'Jaina report';

  const submit = async () => {
    setState('saving');
    setMessage(null);
    try {
      await saveDashboard({
        brand_id: scope.brandId,
        ad_account_id: scope.adAccountId,
        name: name.trim() || defaultTitle,
        source_title: defaultTitle,
        source_prompt: sourcePrompt?.trim() || null,
        scope: report._meta?.primary_scope ?? 'account',
        // A V2 report carries no window of its own — `_meta` has scope and counts, nothing
        // dated — so there is nothing here to name honestly. Null, not a guess.
        window_label: null,
        blocks,
      });
      setState('saved');
      setMessage('Saved. It is listed under Saved dashboards above the chat.');
      setTimeout(() => setOpen(false), 900);
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Could not save the dashboard.');
    }
  };

  return (
    <>
      <Button
        aria-label="Save the visible modules as a dashboard"
        disabled={disabled || blocks.length === 0}
        onClick={() => {
          setName(defaultTitle);
          setState('idle');
          setMessage(null);
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <LayoutDashboardIcon className="size-3.5" />
        Save as dashboard
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as dashboard</DialogTitle>
            <DialogDescription>
              Keeps these {blocks.length} module{blocks.length === 1 ? '' : 's'} exactly as they
              are, for the whole brand. Refreshing means asking Jaina the same question again.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Dashboard name"
            id="dashboard-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder="Weekly account health"
            value={name}
          />
          {message ? (
            <p
              className={
                state === 'error' ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
              }
            >
              {message}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={state === 'saving'} onClick={() => void submit()} type="button">
              {state === 'saving' ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
