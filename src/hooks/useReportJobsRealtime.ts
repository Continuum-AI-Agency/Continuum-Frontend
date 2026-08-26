import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
// sonner's <Toaster/> is never mounted in this app, so every toast.*() call here was a
// silent no-op: "Report ready" has never once reached a user. ToastProvider is the mounted
// system, and its dedupeKey means a job that transitions twice updates one toast in place.
import { useToast } from '@/components/ui/ToastProvider';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

export const reportJobSchema = z.object({
  job_id: z.string(),
  brand_id: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  file_path: z.string().nullable(),
  error_message: z.string().nullable(),
  step_index: z.number().int().optional().default(0),
  step_name: z.string().nullable().optional(),
  steps_json: z.unknown().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  ad_account_id: z.string().nullable(),
});

export type ReportJob = z.infer<typeof reportJobSchema>;

export function useReportJobsRealtime(brandProfileId: string) {
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const { show } = useToast();
  // The subscription is rebuilt only on brand change; reading `show` through a ref keeps a
  // provider re-render from tearing down and re-opening the realtime channel.
  const showRef = useRef(show);
  showRef.current = show;

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    if (!brandProfileId) return;

    const scoped = {
      schema: 'paid_media',
      table: 'report_jobs',
      filter: `brand_id=eq.${brandProfileId}`,
    } as const;

    const applyJob = (row: Record<string, unknown>, removed: boolean) => {
      const result = reportJobSchema.safeParse(row);
      if (!result.success) return;

      const job = result.data;
      const prevStatus = prevStatusRef.current.get(job.job_id);

      setJobs((prev) => {
        const map = new Map(prev.map((j) => [j.job_id, j]));
        if (removed) {
          map.delete(job.job_id);
        } else {
          map.set(job.job_id, job);
        }
        return [...map.values()].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      });

      if (prevStatus !== undefined && prevStatus !== job.status) {
        if (job.status === 'done') {
          showRef.current({
            title: 'Report ready',
            description: 'Your performance report has been generated.',
            variant: 'success',
            dedupeKey: `report-job:${job.job_id}`,
          });
          setUnreadCount((c) => c + 1);
        } else if (job.status === 'failed') {
          showRef.current({
            title: 'Report failed',
            description: job.error_message ?? 'Report generation failed.',
            variant: 'error',
            dedupeKey: `report-job:${job.job_id}`,
          });
          setUnreadCount((c) => c + 1);
        }
      }

      prevStatusRef.current.set(job.job_id, job.status);
    };

    return subscribeToPostgresChanges({
      label: `report-jobs:${brandProfileId}`,
      bindings: [
        { ...scoped, event: 'INSERT', onRow: (row) => applyJob(row, false) },
        { ...scoped, event: 'UPDATE', onRow: (row) => applyJob(row, false) },
        { ...scoped, event: 'DELETE', onRow: (row) => applyJob(row, true) },
      ],
      onStatus: (status) => setIsConnected(status === 'SUBSCRIBED'),
    });
  }, [brandProfileId]);

  return { jobs, unreadCount, markAllRead, isConnected };
}
