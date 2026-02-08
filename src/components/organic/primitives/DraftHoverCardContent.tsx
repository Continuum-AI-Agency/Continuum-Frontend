"use client";

import { Progress } from "@/components/ui/progress";
import { PlatformBadge, StatusBadge } from "./DraftCardBadges";
import type { OrganicCalendarDraft } from "./types";

export function DraftHoverCardContent({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <div className="w-[380px] p-0 overflow-hidden bg-slate-950 border-slate-800 shadow-2xl">
      <div className="flex flex-col">
        <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
           <div className="flex items-center gap-2">
              <PlatformBadge platform={draft.platforms[0]} />
              <StatusBadge status={draft.status} />
           </div>
           <span className="text-xs text-secondary font-mono">{draft.timeLabel}</span>
        </div>

        <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
          {draft.titleTopic && (
            <div className="space-y-1">
              <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Post Idea</h4>
              <p className="text-xs text-primary leading-relaxed font-medium font-serif tracking-wide">{draft.titleTopic}</p>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Creative Direction</h4>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand-primary/50 group-hover:bg-brand-primary transition-colors" />
              <p className="text-sm font-semibold text-primary leading-snug pl-2">
                {draft.creativeIdea || draft.summary}
              </p>
              {draft.assetHints && draft.assetHints.length > 0 && (
                <div className="mt-3 space-y-2 pl-2">
                   {draft.assetHints.slice(0, 3).map((hint, idx) => (
                     <div key={idx} className="text-[11px] text-secondary leading-relaxed pl-2 border-l border-brand-primary/30">
                        <span className="font-bold text-brand-primary/70 mr-1">{hint.role}:</span>
                        {hint.suggestion}
                     </div>
                   ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <h4 className="text-[10px] uppercase tracking-widest text-secondary font-bold opacity-70">Caption Preview</h4>
            <p className="text-xs text-secondary line-clamp-6 leading-relaxed italic whitespace-pre-wrap pl-2 border-l-2 border-slate-800">
              "{draft.captionPreview}"
            </p>
          </div>
        </div>
        
        <div className="px-4 py-3 bg-slate-900/30 border-t border-slate-800 flex items-center justify-between gap-4 mt-auto">
            <div className="flex gap-4">
               <div className="flex flex-col">
                 <span className="text-[9px] text-secondary uppercase font-bold opacity-50">Format</span>
                 <span className="text-xs text-primary font-medium">{draft.format}</span>
               </div>
               <div className="flex flex-col">
                 <span className="text-[9px] text-secondary uppercase font-bold opacity-50">Objective</span>
                 <span className="text-xs text-primary font-medium">{draft.objective}</span>
               </div>
            </div>
            {draft.progress !== undefined && (
               <div className="flex-1 max-w-[100px] space-y-1">
                 <div className="flex justify-between text-[9px] text-secondary font-bold">
                   <span className="animate-pulse text-amber-500">GENERATING</span>
                   <span>{draft.progress}%</span>
                 </div>
                 <Progress value={draft.progress} className="h-1 bg-slate-800" />
               </div>
            )}
        </div>
      </div>
    </div>
  );
}
