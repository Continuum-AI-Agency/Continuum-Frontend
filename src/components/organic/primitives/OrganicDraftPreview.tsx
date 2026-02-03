"use client";

import * as React from "react";
import Image from "next/image";
import { 
  MobileIcon, 
  DesktopIcon, 
  PlayIcon,
  DotsHorizontalIcon,
  Pencil1Icon,
  CheckIcon
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import type { OrganicCalendarDraft } from "./types";
import { useCalendarStore } from "@/lib/organic/store";
import { Button } from "@/components/ui/button";

type PreviewMode = "mobile" | "desktop";

interface OrganicDraftPreviewProps {
  draft: OrganicCalendarDraft;
}

export function OrganicDraftPreview({ draft }: OrganicDraftPreviewProps) {
  const platform = draft.platforms[0] || "instagram";
  const [mode, setMode] = React.useState<PreviewMode>(
    platform === "linkedin" ? "desktop" : "mobile"
  );
  const [isEditing, setIsEditing] = React.useState(false);
  const updateDraft = useCalendarStore((s) => s.updateDraft);

  const [localDraft, setLocalDraft] = React.useState(draft);

  React.useEffect(() => {
    setLocalDraft(draft);
  }, [draft]);

  const handleSave = () => {
    updateDraft(draft.id, (d) => ({
      ...d,
      captionPreview: localDraft.captionPreview,
      creativeIdea: localDraft.creativeIdea,
    }));
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/50 rounded-xl border border-slate-800/50 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-primary/20 flex items-center justify-center border border-brand-primary/30">
             <span className="text-[10px] font-bold text-brand-primary uppercase">{platform.slice(0, 2)}</span>
          </div>
          <div>
            <p className="text-xs font-bold text-primary tracking-tight">{draft.format}</p>
            <p className="text-[10px] text-secondary font-medium uppercase tracking-widest opacity-60">{platform}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                className={cn(
                    "h-8 px-3 text-xs font-bold transition-all",
                    isEditing ? "text-emerald-400 hover:text-emerald-300" : "text-secondary hover:text-primary"
                )}
                onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            >
                {isEditing ? (
                    <><CheckIcon className="mr-2 h-3.5 w-3.5" /> Save</>
                ) : (
                    <><Pencil1Icon className="mr-2 h-3.5 w-3.5" /> Edit</>
                )}
            </Button>

            <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 ml-2">
                <button 
                    onClick={() => setMode("mobile")}
                    className={cn(
                    "p-1.5 rounded-md transition-all",
                    mode === "mobile" ? "bg-slate-800 text-primary shadow-sm" : "text-secondary hover:text-primary"
                    )}
                >
                    <MobileIcon className="w-4 h-4" />
                </button>
                <button 
                    onClick={() => setMode("desktop")}
                    className={cn(
                    "p-1.5 rounded-md transition-all",
                    mode === "desktop" ? "bg-slate-800 text-primary shadow-sm" : "text-secondary hover:text-primary"
                    )}
                >
                    <DesktopIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full flex flex-col lg:flex-row gap-8 items-start justify-center">
            <div className="flex-shrink-0">
                {platform === "instagram" && (
                    <InstagramMobilePreview draft={localDraft} />
                )}
                {platform === "linkedin" && mode === "mobile" && (
                    <InstagramMobilePreview draft={localDraft} isLinkedIn />
                )}
                {platform === "linkedin" && mode === "desktop" && (
                    <LinkedInDesktopPreview draft={localDraft} />
                )}
                {platform !== "instagram" && platform !== "linkedin" && (
                    <div className="w-[340px] p-8 text-center border border-dashed border-slate-800 rounded-2xl opacity-40">
                        <p className="text-sm">Preview for {platform} coming soon.</p>
                    </div>
                )}
            </div>

            {isEditing && (
                <div className="flex-1 w-full max-w-md space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-secondary">Creative Direction</label>
                        <textarea 
                            value={localDraft.creativeIdea || localDraft.title}
                            onChange={(e) => setLocalDraft(prev => ({ ...prev, creativeIdea: e.target.value }))}
                            className="w-full h-24 bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all resize-none"
                            placeholder="What's the creative hook?"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-secondary">Post Caption</label>
                        <textarea 
                            value={localDraft.captionPreview}
                            onChange={(e) => setLocalDraft(prev => ({ ...prev, captionPreview: e.target.value }))}
                            className="w-full h-64 bg-slate-900 border border-slate-800 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all resize-none"
                            placeholder="Write your caption here..."
                        />
                    </div>
                    
                    <div className="p-4 rounded-lg bg-brand-primary/5 border border-brand-primary/20">
                        <p className="text-[10px] text-brand-primary font-bold uppercase tracking-wider mb-2">Editor Note</p>
                        <p className="text-xs text-secondary leading-relaxed">
                            Changes made here will be reflected in the calendar immediately after saving. 
                            AI hints for scenes are preserved but not directly editable yet.
                        </p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

function InstagramMobilePreview({ draft, isLinkedIn = false }: { draft: OrganicCalendarDraft, isLinkedIn?: boolean }) {
  return (
    <div className="w-full max-w-[340px] bg-white dark:bg-black rounded-lg shadow-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden text-black dark:text-white">
        <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                    isLinkedIn ? "bg-blue-600" : "bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-[2px]"
                )}>
                    {isLinkedIn ? "in" : (
                        <div className="w-full h-full rounded-full bg-white dark:bg-black flex items-center justify-center">
                             <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-500">PT</div>
                        </div>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-semibold leading-none tracking-tight">thepizzatest</span>
                    <span className="text-[10px] text-zinc-500 mt-1">Sponsored</span>
                </div>
            </div>
            <button aria-label="More options">
                <DotsHorizontalIcon className="w-5 h-5" />
            </button>
        </div>

        <div className="aspect-square bg-zinc-100 dark:bg-zinc-900 relative flex flex-col items-center justify-center text-center p-8 border-b border-gray-100 dark:border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800" />
            
            <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-md flex items-center justify-center mb-4 border border-white/20 shadow-lg">
                    <PlayIcon className="w-8 h-8 text-zinc-600 dark:text-zinc-400" />
                </div>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 leading-tight max-w-[200px]">
                    {draft.creativeIdea || draft.title}
                </p>
                {draft.assetHints && draft.assetHints[0] && (
                    <p className="mt-2 text-[10px] text-zinc-500 line-clamp-2 px-4 italic">
                        Visualizing: {draft.assetHints[0].suggestion}
                    </p>
                )}
            </div>

            <div className="absolute bottom-4 left-0 right-0 px-4">
                <div className="bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded-md transition-colors shadow-lg">
                    Order Now
                </div>
            </div>
        </div>

        <div className="flex justify-between items-center p-3 pb-2">
            <div className="flex space-x-4">
                <button aria-label="Like post" className="hover:opacity-50 transition-opacity">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                </button>
                <button aria-label="Comment on post" className="hover:opacity-50 transition-opacity">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                </button>
                <button aria-label="Share post" className="hover:opacity-50 transition-opacity">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                </button>
            </div>
            <button aria-label="Save post" className="hover:opacity-50 transition-opacity">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path></svg>
            </button>
        </div>

        <div className="px-3 pb-1">
            <p className="text-xs font-bold">1,234 likes</p>
        </div>

        <div className="px-3 pb-2 max-h-[100px] overflow-y-auto">
            <p className="text-xs leading-relaxed">
                <span className="font-bold mr-2 hover:underline cursor-pointer">thepizzatest</span>
                {draft.captionPreview}
            </p>
        </div>

        <div className="px-3 pb-3">
            <p className="text-[10px] text-zinc-500 hover:underline cursor-pointer">
                View all 56 comments
            </p>
        </div>

        <div className="px-3 py-3 border-t border-gray-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-500 font-bold">PT</div>
                <p className="text-[11px] text-zinc-400 flex-grow">Add a comment...</p>
                <button className="text-[11px] font-bold text-blue-500 opacity-50 cursor-not-allowed">Post</button>
            </div>
        </div>
    </div>
  );
}

function LinkedInDesktopPreview({ draft }: { draft: OrganicCalendarDraft }) {
  return (
    <div className="w-full bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-2xl text-black dark:text-white overflow-hidden max-w-[500px]">
       <div className="p-3 flex items-center justify-between border-b border-gray-100 dark:border-zinc-900">
          <div className="flex items-center gap-2">
             <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center text-white text-xl font-bold">in</div>
             <div>
                <p className="text-sm font-bold tracking-tight">The Pizza Test</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">12,450 followers</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-bold tracking-widest mt-0.5">Promoted</p>
             </div>
          </div>
          <button className="text-blue-600 dark:text-blue-400 text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 px-4 py-1.5 rounded-full border border-blue-600 dark:border-blue-400 transition-colors">
            + Follow
          </button>
       </div>

       <div className="px-4 py-4 space-y-3">
          <p className="text-sm whitespace-pre-wrap leading-relaxed italic border-l-4 border-blue-500/30 pl-4 py-2 bg-blue-50/20 dark:bg-blue-900/10 rounded-r-md">
            {draft.creativeIdea || draft.title}
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {draft.captionPreview}
          </p>
       </div>

       <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 relative border-y border-gray-100 dark:border-zinc-800">
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-zinc-900 dark:to-zinc-950">
             <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 shadow-xl flex items-center justify-center mb-4 border border-gray-100 dark:border-zinc-700">
                <PlayIcon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
             </div>
             <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {draft.format} Direction
             </p>
             <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                Visualizing: {draft.creativeIdea}
             </p>
          </div>
       </div>

       <div className="px-4 py-2 border-b border-gray-100 dark:border-zinc-900 flex items-center justify-between">
          <div className="flex items-center -space-x-1">
             <div className="w-4 h-4 rounded-full bg-blue-500 border border-white dark:border-zinc-950 flex items-center justify-center text-[8px] text-white">👍</div>
             <div className="w-4 h-4 rounded-full bg-red-500 border border-white dark:border-zinc-950 flex items-center justify-center text-[8px] text-white">❤️</div>
             <div className="w-4 h-4 rounded-full bg-yellow-500 border border-white dark:border-zinc-950 flex items-center justify-center text-[8px] text-white">💡</div>
             <span className="text-[11px] text-zinc-500 dark:text-zinc-400 ml-4 font-medium">42 comments • 12 reposts</span>
          </div>
       </div>

       <div className="px-2 py-1 flex items-center justify-between text-zinc-600 dark:text-zinc-400">
          {['Like', 'Comment', 'Repost', 'Send'].map((action) => (
            <div key={action} className="flex-1 flex items-center justify-center py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded transition-colors font-bold text-xs cursor-pointer">
                {action}
            </div>
          ))}
       </div>
    </div>
  );
}
