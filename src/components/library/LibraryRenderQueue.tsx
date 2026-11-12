'use client';

import type { ClientRenderJob } from '@continuum/contracts';
import { ChevronDown, Cpu, ExternalLink, Film, Loader2, RotateCcw, Square } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
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
import { useRouter } from '@/i18n/navigation';
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
  creative_ops: 'Creative edit',
};

export function LibraryRenderQueue() {
  const translateUi = useUiTranslations('library');

  const queue = useClientRenderQueue();
  const router = useRouter();
  const [consentJob, setConsentJob] = useState<ClientRenderJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState(false);
  const jobs = useMemo(
    () => queue.jobs.filter((job) => VISIBLE_STATES.has(job.state)),
    [queue.jobs],
  );
  const failed = jobs.filter((job) => job.state === 'failed').length;

  if (jobs.length === 0) return null;

  const confirm = async () => {
    if (!consentJob) return;
    setStarting(true);
    try {
      await queue.run(consentJob);
      setConsentJob(null);
      router.refresh();
    } catch {
      // `run` reports its own reason through a toast; the panel just stays open.
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <section aria-labelledby="library-render-queue-title" className="rounded-xl border bg-card">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <div className="min-w-0 flex-1">
            <h2 id="library-render-queue-title" className="text-sm font-semibold">
              {' '}
              {translateUi('jobs_2f17a0f8')}{' '}
            </h2>
            <p className="text-xs text-muted-foreground">
              {failed > 0
                ? translateUi('value0_failed_value1_on_this_device_4c140e5b', {
                    value0: String(failed),
                    value1: String(jobs.length),
                  })
                : translateUi('value0_waiting_on_this_device_9be5cafa', {
                    value0: String(jobs.length),
                  })}
            </p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{jobs.length}</span>
        </button>

        <div
          className={`grid grid-cols-2 gap-[var(--app-shell-gap)] border-t px-4 py-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${open ? '' : 'hidden'}`}
        >
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
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-2xs font-medium shadow-sm">
                    {KIND_LABEL[job.kind]}
                  </span>
                </div>

                <div className="space-y-2 p-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold">{job.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {job.inputs.length} {translateUi('durable_input_4de54763')}
                      {job.inputs.length === 1 ? '' : 's'} ·{' '}
                      {job.phase ??
                        (job.state === 'ready'
                          ? translateUi('waiting_for_an_operator_55735fa7')
                          : job.state)}
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
                    <p className="line-clamp-2 text-xs text-destructive">{job.errorMessage}</p>
                  ) : null}

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={translateUi('view_render_source_4948f59f')}
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
                        <Cpu /> {translateUi('render_6d89eb7d')}{' '}
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
                        <RotateCcw /> {translateUi('retry_942087cc')}{' '}
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
                        <Square /> {translateUi('stop_cae7d57b')}{' '}
                      </Button>
                    ) : null}
                    {active && !local ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {' '}
                        {translateUi('on_another_device_d0db529f')}{' '}
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
            <DialogTitle>{translateUi('use_this_device_to_render_b69fdd33')}</DialogTitle>
            <DialogDescription>
              {' '}
              {translateUi('rendering_uses_this_device_s_cpu_gp_56dddc4f')}{' '}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConsentJob(null)}>
              {' '}
              {translateUi('cancel_19766ed6')}{' '}
            </Button>
            <Button type="button" disabled={starting} onClick={() => void confirm()}>
              {starting ? <Loader2 className="animate-spin" /> : <Cpu />}{' '}
              {translateUi('claim_and_render_c8654218')}{' '}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
