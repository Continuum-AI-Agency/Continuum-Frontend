"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import type { OrganicCalendarDraft } from "./types";
import { PlatformBadge, StatusBadge } from "./CalendarDraftCard";

export function DraftTooltip({ 
  children, 
  draft 
}: { 
  children: React.ReactNode;
  draft: OrganicCalendarDraft;
}) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="w-[320px] rounded-lg bg-surface/95 backdrop-blur-xl border border-subtle p-4 shadow-xl z-[100]"
            sideOffset={8}
            side="right"
            align="start"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-secondary">
                  {draft.dateLabel} • {draft.timeLabel}
                </span>
                <StatusBadge status={draft.status} />
              </div>
              
              <div>
                <h4 className="font-semibold text-primary">{draft.title}</h4>
                <p className="text-sm text-secondary mt-1 line-clamp-2">
                  {draft.summary}
                </p>
              </div>
              
              {draft.captionPreview && (
                <div className="p-2 rounded bg-default/50 text-xs text-secondary">
                  "{draft.captionPreview}"
                </div>
              )}
              
              <div className="flex flex-wrap gap-1">
                {draft.platforms.map(platform => (
                  <PlatformBadge key={platform} platform={platform} />
                ))}
                {draft.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs text-brand-primary">
                    #{tag}
                  </span>
                ))}
              </div>
              
              <Tooltip.Arrow className="fill-surface/95" />
            </div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
