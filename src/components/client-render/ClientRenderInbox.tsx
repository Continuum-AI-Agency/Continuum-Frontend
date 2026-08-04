'use client';

import type { ClientRenderJob } from '@continuum/contracts';
import { Cpu, ExternalLink, Loader2, RotateCcw, Square } from 'lucide-react';
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
};

export function ClientRenderInbox() {
  const queue = useClientRenderQueue();
  const [consentJob, setConsentJob] = useState<ClientRenderJob | null>(null);
  const [starting, setStarting] = useState(false);

  const confirm = async () => {
    if (!consentJob) return;
    setStarting(true);
    try {
      await queue.run(consentJob);
      setConsentJob(null);
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <Dialog open={queue.inboxOpen} onOpenChange={queue.setInboxOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={`${queue.readyCount} render jobs ready`}
            title="Ready to render"
          >
            <Cpu className="size-4" />
            {queue.readyCount > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
                {queue.readyCount > 99 ? '99+' : queue.readyCount}
              </span>
            ) : null}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ready to render</DialogTitle>
            <DialogDescription>
              Shared brand jobs wait here until an operator chooses to use this device.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
            {queue.jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No render jobs are waiting.
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
                            (job.state === 'ready' ? 'Waiting for an operator' : job.state)}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {job.inputs.length} durable input{job.inputs.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label="View source"
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
                                ? 'Review consent and claim this job'
                                : 'Open the source to use its render controls'
                            }
                            onClick={() => setConsentJob(job)}
                          >
                            Render
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
                            Retry
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
                            Stop
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {active ? (
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full bg-primary transition-[width]')}
                          style={{ width: `${Math.round(job.progress * 100)}%` }}
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
            <DialogTitle>Use this device to render?</DialogTitle>
            <DialogDescription>
              Rendering uses this device&apos;s CPU/GPU. Keep this tab open. One job runs at a time.
              You can stop at any time; unfinished jobs return to the queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsentJob(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={starting} onClick={() => void confirm()}>
              {starting ? <Loader2 className="animate-spin" /> : <Cpu />}
              Claim and render
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
