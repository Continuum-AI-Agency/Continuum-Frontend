import { Skeleton } from "@/components/ui/skeleton";
import { CardSurface } from "./CardSurface";
import { ColorSwatch } from "./ColorSwatch";
import type { AgentPreviewBuckets } from "../state/agentPreview";

type Props = {
  buckets: AgentPreviewBuckets | null;
};

export function WebsiteSummaryCard({ buckets }: Props) {
  const website = buckets?.website ?? null;
  const status = buckets?.sectionStatus.website ?? "indeterminate";
  const isEmpty = website === null;

  return (
    <CardSurface
      title="Website summary"
      badge="Source"
      status={status}
      isEmpty={isEmpty}
      minBodyHeight={140}
      skeleton={
        <div className="space-y-3">
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
        </div>
      }
    >
      {website ? (
        <>
          {website.hero_statement ? (
            <p className="text-[13px] font-medium leading-snug text-[#0b1220]">
              {website.hero_statement}
            </p>
          ) : null}
          {website.hero_subhead ? (
            <p className="text-[12px] leading-snug text-[#475569]">{website.hero_subhead}</p>
          ) : null}
          {website.palette
            ? (() => {
                const swatches = [
                  website.palette.primary,
                  website.palette.secondary,
                  website.palette.accent,
                  website.palette.background,
                  website.palette.text,
                ].filter((hex): hex is string => Boolean(hex));
                if (swatches.length === 0) return null;
                return (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                      Palette
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {swatches.map((hex, idx) => (
                        <ColorSwatch key={`${hex}-${idx}`} hex={hex} />
                      ))}
                    </div>
                  </div>
                );
              })()
            : null}
          {website.typography ? (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                Typography
              </p>
              <p className="text-[12px] text-[#374151]">
                {[website.typography.primary, website.typography.secondary].filter(Boolean).join(" · ") ||
                  "Not detected"}
              </p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-[12px] text-[#94a3b8]">Website analysis didn&apos;t produce data for this run.</p>
      )}
    </CardSurface>
  );
}
