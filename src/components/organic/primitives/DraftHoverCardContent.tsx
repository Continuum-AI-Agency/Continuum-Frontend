"use client";

import { Progress } from "@/components/ui/progress";
import { PlatformBadge, StatusBadge } from "./DraftCardBadges";
import type { OrganicCalendarDraft } from "./types";

export function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <div className="w-[380px] p-0 overflow-hidden border border-border/80 bg-card shadow-2xl shadow-black/10">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/60 p-4">
           <div className="flex items-center gap-2">
              <PlatformBadge platform={draft.platforms[0]} />
              <StatusBadge status={draft.status} />
           </div>
           <span className="font-mono text-xs text-muted-foreground">{draft.timeLabel}</span>
        </div>

        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {draft.titleTopic && (
            <div className="space-y-1">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Post Idea</h4>
              <p className="text-xs leading-relaxed font-medium font-serif tracking-wide text-foreground">
                {draft.titleTopic}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Creative Direction</h4>
            <div className="relative overflow-hidden rounded-lg border border-border/70 bg-muted/50 p-3 group">
              <div className="absolute top-0 left-0 h-full w-1 bg-brand-primary/40 transition-colors group-hover:bg-brand-primary" />
              <p className="pl-2 text-sm leading-snug text-foreground">
                {draft.creativeIdea || draft.summary}
              </p>
              {draft.assetHints && draft.assetHints.length > 0 && (
                <div className="mt-3 space-y-2 pl-2">
                   {draft.assetHints.slice(0, 3).map((hint, idx) => (
                     <div
                       key={idx}
                       className="border-l border-brand-primary/30 pl-2 text-[11px] leading-relaxed text-muted-foreground"
                     >
                        <span className="mr-1 font-bold text-brand-primary/90">{hint.role}:</span>
                        {hint.suggestion}
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold">Caption Preview</h4>
                <p className="border-l-2 border-border/60 pl-2 text-xs leading-relaxed italic whitespace-pre-wrap text-muted-foreground line-clamp-6">
              &quot;{draft.captionPreview}&quot;
            </p>
          </div>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-4 border-t border-border/70 bg-muted/40 px-4 py-3">
            <div className="flex gap-4">
               <div className="flex flex-col">
                 <span className="text-[9px] uppercase font-bold text-muted-foreground/70">Format</span>
                 <span className="text-xs font-medium text-foreground">{draft.format}</span>
               </div>
               <div className="flex flex-col">
                 <span className="text-[9px] uppercase font-bold text-muted-foreground/70">Objective</span>
                 <span className="text-xs font-medium text-foreground">{draft.objective}</span>
               </div>
            </div>
            {draft.progress !== undefined && (
               <div className="flex-1 max-w-[100px] space-y-1">
                 <div className="flex justify-between text-[9px] text-muted-foreground font-bold">
                   <span className="animate-pulse text-amber-500">GENERATING</span>
                   <span>{draft.progress}%</span>
                 </div>
                 <Progress value={draft.progress} className="h-1" />
               </div>
            )}
        </div>
      </div>
    </div>
  );
}
