'use client';

import type { ClientRenderJob } from '@continuum/contracts';
import { Cpu, ExternalLink, Loader2, RotateCcw, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useClientRenderQueue } from '@/lib/client-render/ClientRenderProvider';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<ClientRenderJob['kind'], string> = {
  hyperframes_agent: 'HyperFrames',
  organic_hyperframe: 'Organic HyperFrame',
  planner_reel: 'Planner reel',
  mcp_clip_batch: 'UGC clip batch',
  timeline_editor: 'Video Editor master',
  creative_ops: 'Creative edit',
};

export function ClientRenderInbox() {
  const uiText = useTranslations('common');
  const queue = useClientRenderQueue();
  const [consentJob, setConsentJob] = useState<ClientRenderJob | null>(null);
  const [starting, setStarting] = useState(false);

  const confirm = async () => {
    if (!consentJob) return;
    setStarting(true);
    try {
      await queue.run(consentJob);
      setConsentJob(null);
    } catch {
      // `run` reports its own reason through a toast; the dialog just stays open.
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Dialog open={queue.inboxOpen} onOpenChange={queue.setInboxOpen}>
        {/* The count badge is a SIBLING of the button, not a child. Buttons carry
            `overflow: hidden` (see `@utility btn-fill` in globals.css) so the hover fill stays
            inside their rounded box — which also clips any child hanging off a corner. */}
        <span className="relative inline-flex">
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={uiText('m_70ae795703', {
                  v0: String(queue.readyCount),
                })}
                title={uiText('ready_to_render_6f40bb0')}
              >
                <Cpu className="size-4" />
              </Button>
            }
          />
          {queue.readyCount > 0 ? (
            <span className="pointer-events-none absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-2xs font-semibold leading-4 text-primary-foreground">
              {queue.readyCount > 99 ? '99+' : queue.readyCount}
            </span>
          ) : null}
        </span>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiText('ready_to_render_6f40bb0')}</DialogTitle>
            <DialogDescription>{uiText('m_7f338a2f71')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
            {queue.jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {uiText('m_effb147303')}
              </div>
            ) : (
              queue.jobs.map((job) => {
                const active = ['claimed', 'rendering', 'saving'].includes(job.state);
                return (
                  <div key={job.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">
                          {KIND_LABEL[job.kind]}
                        </div>
                        <div className="truncate text-sm font-semibold">{job.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {job.phase ??
                            (job.state === 'ready'
                              ? uiText('waiting_for_an_operator_55735fa')
                              : job.state)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {job.inputs.length}
                          {uiText('m_9268243153')}
                          {job.inputs.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={uiText('m_31a7604a3c')}
                          onClick={() => window.location.assign(job.executionSpec.origin.viewHref)}
                        >
                          <ExternalLink />
                        </Button>
                        {job.state === 'ready' ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={!queue.canExecute(job)}
                            title={
                              queue.canExecute(job)
                                ? uiText('m_19b781dbe4')
                                : uiText('m_9541ddd7db')
                            }
                            onClick={() => setConsentJob(job)}
                          >
                            {uiText('render_6d89eb7')}
                          </Button>
                        ) : null}
                        {job.state === 'failed' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void queue.retry(job)}
                          >
                            <RotateCcw />
                            {uiText('retry_942087c')}
                          </Button>
                        ) : null}
                        {active && queue.isRunningLocally(job) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void queue.stop(job)}
                          >
                            <Square />
                            {uiText('stop_cae7d57')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {active ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full bg-primary transition-[width]')}
                          style={{
                            width: `${Math.round(job.progress * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                    {job.errorMessage ? (
                      <p className="mt-2 text-xs text-destructive">{job.errorMessage}</p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(consentJob)} onOpenChange={(open) => !open && setConsentJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText('use_this_device_to_render_b69fdd3')}</DialogTitle>
            <DialogDescription>{uiText('m_b70a801756')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsentJob(null)}>
              {uiText('cancel_19766ed')}
            </Button>
            <Button type="button" disabled={starting} onClick={() => void confirm()}>
              {starting ? <Loader2 className="animate-spin" /> : <Cpu />}
              {uiText('m_6d2c0923ec')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
