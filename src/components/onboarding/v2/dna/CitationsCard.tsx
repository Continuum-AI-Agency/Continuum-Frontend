import { Skeleton } from "@/components/ui/skeleton";
import { CardSurface } from "./CardSurface";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type Props = {
  buckets: AgentPreviewBuckets | null;
};

export function CitationsCard({ buckets }: Props) {
  const citations = buckets?.citations ?? {};
  const groupKeys = Object.keys(citations);
  const isEmpty = groupKeys.length === 0;
  const status = isEmpty ? (buckets?.result ? "done" : "running") : "done";

  return (
    <CardSurface
      title="Sources & citations"
      badge="Evidence"
      status={status}
      isEmpty={isEmpty}
      minBodyHeight={120}
      skeleton={
        <div className="space-y-3">
          <div>
            <Skeleton className="mb-1 h-3 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-4/5" />
          </div>
          <div>
            <Skeleton className="mb-1 h-3 w-1/4" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      }
    >
      {groupKeys.length > 0 ? (
        groupKeys.map((key) => (
          <div key={key}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
              {key.replace(/_/g, " ")}
            </p>
            <CitationGroup value={citations[key]} />
          </div>
        ))
      ) : (
        <p className="text-[12px] text-[#94a3b8]">No sources were recorded for this run.</p>
      )}
    </CardSurface>
  );
}

function CitationGroup({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1 text-[12px]">
        {value.map((item, idx) => (
          <li key={idx} className="leading-snug text-[#374151]">
            <CitationItem item={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "string") {
    return <CitationItem item={value} />;
  }
  return <CitationItem item={value} />;
}

function CitationItem({ item }: { item: unknown }) {
  if (typeof item === "string") {
    return isLikelyUrl(item) ? <ExternalLink href={item}>{item}</ExternalLink> : <span>{item}</span>;
  }
  if (item && typeof item === "object") {
    const obj = item as { title?: string; url?: string; label?: string };
    if (obj.url) {
      return <ExternalLink href={obj.url}>{obj.title ?? obj.label ?? obj.url}</ExternalLink>;
    }
    return <span>{obj.title ?? obj.label ?? JSON.stringify(item)}</span>;
  }
  return <span>{String(item ?? "")}</span>;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-[12px] text-[var(--ob-violet)] underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
