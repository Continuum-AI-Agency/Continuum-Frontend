import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const reportJobSchema = z.object({
  id: z.string(),
  brand_id: z.string(),
  status: z.enum(["pending", "running", "done", "failed"]),
  file_path: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  ad_account_id: z.string().nullable(),
});

export type ReportJob = z.infer<typeof reportJobSchema>;

export function useReportJobsRealtime(brandProfileId: string) {
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  const markAllRead = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    if (!brandProfileId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`report-jobs:${brandProfileId}`);
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "paid_media",
          table: "report_jobs",
          filter: `brand_id=eq.${brandProfileId}`,
        },
        (payload) => {
          const row =
            payload.eventType === "DELETE" ? payload.old : payload.new;
          const result = reportJobSchema.safeParse(row);
          if (!result.success) return;

          const job = result.data;
          const prevStatus = prevStatusRef.current.get(job.id);

          setJobs((prev) => {
            const map = new Map(prev.map((j) => [j.id, j]));
            if (payload.eventType === "DELETE") {
              map.delete(job.id);
            } else {
              map.set(job.id, job);
            }
            return [...map.values()].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            );
          });

          if (prevStatus !== undefined && prevStatus !== job.status) {
            if (job.status === "done") {
              toast.success("Report ready", {
                description: "Your Jaina report has been generated.",
              });
              setUnreadCount((c) => c + 1);
            } else if (job.status === "failed") {
              toast.error("Report failed", {
                description:
                  job.error_message ?? "Report generation failed.",
              });
              setUnreadCount((c) => c + 1);
            }
          }

          prevStatusRef.current.set(job.id, job.status);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandProfileId]);

  return { jobs, unreadCount, markAllRead, isConnected };
}
