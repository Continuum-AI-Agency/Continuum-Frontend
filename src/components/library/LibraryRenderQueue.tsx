'use client';

import type { ClientRenderJob } from '@continuum/contracts';
import { Cpu, ExternalLink, Film, Loader2, RotateCcw, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useClientRenderQueue } from '@/lib/client-render/ClientRenderProvider';

const VISIBLE_STATES = new Set<ClientRenderJob['state']>([
  'ready',
  'claimed',
  'rendering',
  'saving',
  'failed',
]);

const KIND_LABEL: Record<ClientRenderJob['kind'], string> = {
  hyperframes_agent: 'HyperFrames',
  organic_hyperframe: 'Organic HyperFrame',
  planner_reel: 'Planner reel',
  mcp_clip_batch: 'UGC clip batch',
  timeline_editor: 'Video Editor master',
};

export function LibraryRenderQueue() {
  const queue = useClientRenderQueue();
  const router = useRouter();
  const [consentJob, setConsentJob] = useState<ClientRenderJob | null>(null);
  const [starting, setStarting] = useState(false);
  const jobs = useMemo(
    () => queue.jobs.filter((job) => VISIBLE_STATES.has(job.state)),
    [queue.jobs],
  );

  if (jobs.length === 0) return null;

  const confirm = async () => {
    if (!consentJob) return;
    setStarting(true);
    try {
      await queue.run(consentJob);
      setConsentJob(null);
      router.refresh();
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <section aria-labelledby="library-render-queue-title" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="library-render-queue-title" className="text-sm font-semibold">
              Ready to render
            </h2>
            <p className="text-xs text-muted-foreground">
              Pending media artifacts waiting for an operator to use this device.
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {jobs.length} job{jobs.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-[var(--app-shell-gap)] sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {jobs.map((job) => {
            const active = ['claimed', 'rendering', 'saving'].includes(job.state);
            const local = queue.isRunningLocally(job);
            return (
              <article key={job.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="relative flex aspect-video items-center justify-center bg-muted/60">
                  {active ? (
                    <Loader2 className="size-7 animate-spin text-primary" />
                  ) : (
                    <Film className="size-8 text-muted-foreground/45" />
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium shadow-sm">
                    {KIND_LABEL[job.kind]}
                  </span>
                </div>

                <div className="space-y-2 p-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold">{job.title}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {job.inputs.length} durable input{job.inputs.length === 1 ? '' : 's'} ·{' '}
                      {job.phase ?? (job.state === 'ready' ? 'Waiting for an operator' : job.state)}
                    </p>
                  </div>

                  {active ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-[width]"
                        style={{ width: `${Math.round(job.progress * 100)}%` }}
                      />
                    </div>
                  ) : null}

                  {job.errorMessage ? (
                    <p className="line-clamp-2 text-[11px] text-destructive">{job.errorMessage}</p>
                  ) : null}

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label="View render source"
                      onClick={() => window.location.assign(job.executionSpec.origin.viewHref)}
                    >
                      <ExternalLink />
                    </Button>
                    {job.state === 'ready' ? (
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        disabled={!queue.canExecute(job)}
                        onClick={() => setConsentJob(job)}
                      >
                        <Cpu />
                        Render
                      </Button>
                    ) : null}
                    {job.state === 'failed' ? (
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        variant="outline"
                        onClick={() => void queue.retry(job)}
                      >
                        <RotateCcw />
                        Retry
                      </Button>
                    ) : null}
                    {active && local ? (
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1"
                        variant="outline"
                        onClick={() => void queue.stop(job)}
                      >
                        <Square />
                        Stop
                      </Button>
                    ) : null}
                    {active && !local ? (
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        On another device
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Dialog open={Boolean(consentJob)} onOpenChange={(open) => !open && setConsentJob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Use this device to render?</DialogTitle>
            <DialogDescription>
              Rendering uses this device&apos;s CPU/GPU. Keep this tab open. One job runs at a time.
              You can stop at any time; unfinished jobs return to the shared queue.
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
