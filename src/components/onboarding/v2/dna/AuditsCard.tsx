import { MinusCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CardSurface } from "./CardSurface";
import type { AgentPreviewBuckets, AuditAvailability, AuditKey } from "../state/agentPreview";

const AUDIT_KEYS: AuditKey[] = ["voice", "audience", "website", "business"];
const AUDIT_LABELS: Record<AuditKey, string> = {
  voice: "Voice",
  audience: "Audience",
  website: "Website",
  business: "Business",
};

type Props = {
  buckets: AgentPreviewBuckets | null;
};

type AuditPayload = {
  score?: number;
  severity?: "low" | "medium" | "high";
  findings?: unknown[];
};

const SEVERITY_BADGE: Record<NonNullable<AuditPayload["severity"]>, string> = {
  low: "bg-[var(--cs-success)]/10 text-[var(--cs-success,#53a88a)] border-[var(--cs-success)]/20",
  medium: "bg-[var(--cs-warning)]/10 text-[var(--cs-warning,#cb8e00)] border-[var(--cs-warning)]/20",
  high: "bg-[var(--cs-error)]/10 text-[var(--cs-error,#ef4444)] border-[var(--cs-error)]/20",
};

export function AuditsCard({ buckets }: Props) {
  const audits = buckets?.audits ?? {};
  const auditStatus = buckets?.auditStatus ?? {};
  const settledCount = AUDIT_KEYS.filter((k) => auditStatus[k] !== undefined).length;
  const isEmpty = settledCount === 0;
  const status = isEmpty ? (buckets?.result ? "done" : "running") : "done";

  return (
    <CardSurface
      title="Section audits"
      badge="Review"
      status={status}
      isEmpty={isEmpty}
      minBodyHeight={200}
      skeleton={
        <div className="grid grid-cols-2 gap-2">
          {AUDIT_KEYS.map((k) => (
            <div key={k} className="rounded-lg border border-border p-3">
              <Skeleton className="mb-2 h-3 w-1/2" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {AUDIT_KEYS.map((key) => (
          <AuditTile
            key={key}
            label={AUDIT_LABELS[key]}
            audit={audits[key] as AuditPayload | undefined}
            state={auditStatus[key]}
          />
        ))}
      </div>
    </CardSurface>
  );
}

function AuditTile({
  label,
  audit,
  state,
}: {
  label: string;
  audit: AuditPayload | undefined;
  state: AuditAvailability | undefined;
}) {
  if (state === "unavailable") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MinusCircle className="h-3 w-3 shrink-0 text-muted" />
          <span>Not available</span>
        </div>
      </div>
    );
  }

  if (state !== "available" || !audit) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Skeleton className="mt-2 h-6 w-12" />
      </div>
    );
  }

  const findingsCount = Array.isArray(audit.findings) ? audit.findings.length : 0;
  return (
    <div className="rounded-lg border border-border p-3 bg-card text-foreground">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {audit.severity ? (
          <Badge variant="outline" className={cn("text-[10px] capitalize", SEVERITY_BADGE[audit.severity])}>
            {audit.severity}
          </Badge>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-[20px] font-bold font-mono tabular-nums text-foreground">
          {typeof audit.score === "number" ? Math.round(audit.score) : "—"}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {findingsCount > 0 ? `${findingsCount} finding${findingsCount === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}
