'use client';

import { useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';

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
import { prepareDashboardBlocks } from '@/lib/jaina/dashboardBlocks';
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
  const formatUiError = useUiErrorMessage();
  const uiText = useTranslations('scale');
  const scope = useJainaBrandScope();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  if (!scope) return null;
  // A V2 report carries no title of its own; the first module's title is the closest thing
  // to what the person asked for.
  const defaultTitle = blocks[0]?.title ?? report.blocks[0]?.title ?? 'Jaina report';
  // The report's own `data_scope` frame rides along whether or not it is visible, and it
  // names the window; a report with no frame has no window to name, and the dialog says so
  // instead of saving naked numbers.
  const plan = prepareDashboardBlocks(report, blocks);

  const submit = async () => {
    if (!plan.ok) return;
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
        window_label: plan.windowLabel,
        blocks: plan.blocks,
        spec: plan.spec,
      });
      setState('saved');
      setMessage(uiText('saved_it_is_listed_under_saved_dashboards_abo_4990147'));
      setTimeout(() => setOpen(false), 900);
    } catch (error) {
      setState('error');
      setMessage(formatUiError(error));
    }
  };

  return (
    <>
      <Button
        aria-label={uiText('save_the_visible_modules_as_a_dashboard_a0b7645')}
        disabled={disabled || blocks.length === 0}
        onClick={() => {
          setName(defaultTitle);
          setState(plan.ok ? 'idle' : 'error');
          setMessage(plan.ok ? null : plan.message);
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <LayoutDashboardIcon className="size-3.5" />
        {uiText('save_as_dashboard_f6c0cc6')}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{uiText('save_as_dashboard_f6c0cc6')}</DialogTitle>
            <DialogDescription>
              {plan.ok
                ? uiText('template_52bf2cdbe0c8', { count: plan.blocks.length })
                : uiText('a_dashboard_states_the_period_its_figures_cov_232fb65')}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={uiText('dashboard_name_df31dcc')}
            id="dashboard-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            placeholder={uiText('weekly_account_health_39afcb2')}
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
              {uiText('cancel_19766ed')}
            </Button>
            <Button
              disabled={!plan.ok || state === 'saving'}
              onClick={() => void submit()}
              type="button"
            >
              {state === 'saving' ? uiText('saving_23e3929') : uiText('save_1509f56')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
