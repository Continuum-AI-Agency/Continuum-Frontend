"use client";

import { useState } from "react";
import {
  BellIcon,
  CheckCircle2Icon,
  DownloadIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { http } from "@/lib/api/http";
import {
  useReportJobsRealtime,
  type ReportJob,
} from "@/hooks/useReportJobsRealtime";

type Props = {
  brandProfileId: string;
};

const statusConfig = {
  pending: {
    Icon: LoaderIcon,
    className: "text-muted-foreground",
    label: "Queued",
  },
  running: {
    Icon: LoaderIcon,
    className: "text-blue-500 animate-spin",
    label: "Generating",
  },
  done: {
    Icon: CheckCircle2Icon,
    className: "text-emerald-500",
    label: "Ready",
  },
  failed: {
    Icon: XCircleIcon,
    className: "text-red-500",
    label: "Failed",
  },
};

const STEP_LABELS: Record<string, string> = {
  validating: "Validating…",
  "writing:executive": "Writing executive summary…",
  "writing:kpis": "Writing KPIs…",
  "writing:campaigns": "Writing campaign breakdown…",
  "writing:competitive": "Writing competitive context…",
  "writing:recommendations": "Writing recommendations…",
  assembling: "Assembling report…",
};

async function fetchSignedUrl(jobId: string): Promise<string> {
  const data = await http.request<{ signed_url: string }>({
    path: `/api/agents/jaina/report-artifacts/jobs/${jobId}/file-url`,
  });
  return data.signed_url;
}

function JobRow({ job }: { job: ReportJob }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { Icon, className, label } = statusConfig[job.status];

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const url = await fetchSignedUrl(job.job_id);
      window.open(url, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const stepLabel =
    job.status === "running" && job.step_name
      ? (STEP_LABELS[job.step_name] ?? job.step_name)
      : null;

  return (
    <div className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50">
      <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">{label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {job.ad_account_id ?? job.job_id}
        </p>
        {stepLabel && (
          <p className="mt-0.5 truncate text-xs text-blue-500">{stepLabel}</p>
        )}
        {job.status === "failed" && job.error_message && (
          <p className="mt-0.5 line-clamp-2 text-xs text-red-500">
            {job.error_message}
          </p>
        )}
      </div>
      {job.status === "done" && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 active:scale-[0.96] transition-[transform]"
          disabled={isDownloading}
          onClick={handleDownload}
          aria-label="Download report"
        >
          <DownloadIcon className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export function ReportJobsBell({ brandProfileId }: Props) {
  const { jobs, unreadCount, markAllRead } =
    useReportJobsRealtime(brandProfileId);

  return (
    <Popover onOpenChange={(open) => { if (open) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 active:scale-[0.96] transition-[transform]"
          aria-label={
            unreadCount > 0 ? `${unreadCount} report updates` : "Report jobs"
          }
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-3xs font-bold tabular-nums text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Report Jobs
        </p>
        {jobs.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No report jobs this session.
          </p>
        ) : (
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {jobs.map((job) => (
              <JobRow key={job.job_id} job={job} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
