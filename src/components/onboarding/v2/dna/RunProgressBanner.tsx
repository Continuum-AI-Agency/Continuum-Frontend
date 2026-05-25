import { useMemo } from "react";
import { CheckCircle2, MinusCircle, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { previewSectionSchema } from "@/lib/onboarding/agentClient";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type RunProgressBannerProps = {
  buckets: AgentPreviewBuckets | null;
  running: boolean;
  onRetry?: () => void;
};

const TOTAL = previewSectionSchema.options.length;

export function RunProgressBanner({ buckets, running, onRetry }: RunProgressBannerProps) {
  const counts = useMemo(() => tally(buckets), [buckets]);
  if (!buckets) return null;

  const settled = !running;
  const thin = settled && counts.done < 3;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[#64748b]">
      {running ? (
        <span className="inline-flex items-center gap-1.5 text-[#0b1220]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--ob-violet)]" />
          Analyzing {counts.done + counts.running} of {TOTAL}…
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[#0b1220]">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          {counts.done} of {TOTAL} sections complete
        </span>
      )}
      {counts.skipped > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <MinusCircle className="h-3 w-3 text-[#cbd5e1]" />
          {counts.skipped} unavailable
        </span>
      ) : null}
      {counts.error > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 text-[#f97316]" />
          {counts.error} couldn&apos;t complete
        </span>
      ) : null}
      {thin && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0b1220] shadow-sm transition-colors hover:border-[#cbd5e1]"
        >
          <RefreshCw className="h-3 w-3" />
          Re-run analysis
        </button>
      ) : null}
    </div>
  );
}

function tally(buckets: AgentPreviewBuckets | null) {
  const out = { done: 0, running: 0, skipped: 0, error: 0, idle: 0 };
  if (!buckets) return out;
  for (const section of previewSectionSchema.options) {
    const s = buckets.sectionStatus[section];
    if (s === "done") out.done += 1;
    else if (s === "running") out.running += 1;
    else if (s === "skipped") out.skipped += 1;
    else if (s === "error") out.error += 1;
    else out.idle += 1;
  }
  return out;
}
