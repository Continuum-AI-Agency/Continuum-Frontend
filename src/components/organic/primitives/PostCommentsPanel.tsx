"use client";

import React from "react";
import { Heart, MessageCircle } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { OrganicComment } from "@/lib/schemas/organicMetrics";

type SortMode = "recency" | "likes";

function formatCommentDate(timestamp: string | undefined) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function userInitial(username: string | undefined) {
  const first = username?.trim()[0];
  return first ? first.toUpperCase() : "?";
}

function CommentRow({ comment }: { comment: OrganicComment }) {
  return (
    <div className="flex gap-2 px-2 py-1.5">
      <Avatar className="h-5 w-5 shrink-0 mt-0.5">
        <AvatarFallback className="bg-muted text-[9px] font-semibold">
          {userInitial(comment.username)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold truncate leading-none">
            {comment.username ?? "unknown"}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {(comment.likeCount ?? 0) > 0 && (
              <Badge variant="secondary" className="h-4 gap-0.5 px-1 py-0 text-[9px] font-medium">
                <Heart className="h-2 w-2" />
                {comment.likeCount}
              </Badge>
            )}
            {(comment.replies?.length ?? 0) > 0 && (
              <Badge variant="outline" className="h-4 gap-0.5 px-1 py-0 text-[9px] font-medium">
                <MessageCircle className="h-2 w-2" />
                {comment.replies!.length}
              </Badge>
            )}
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {formatCommentDate(comment.timestamp)}
            </span>
          </div>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
          {comment.text ?? ""}
        </p>
      </div>
    </div>
  );
}

export function PostCommentsPanel({
  comments,
}: {
  comments: OrganicComment[] | undefined;
}) {
  const [sortBy, setSortBy] = React.useState<SortMode>("recency");

  const sorted = React.useMemo(() => {
    const list = [...(comments ?? [])];
    if (sortBy === "likes") {
      return list.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    }
    return list.sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  }, [comments, sortBy]);

  if (!comments || comments.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Comments ({comments.length})
        </span>
        <div className="inline-flex rounded-md border border-subtle bg-muted/20 p-0.5">
          {(["recency", "likes"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/60",
                sortBy === mode
                  ? "bg-accent/20 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setSortBy(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="h-[168px] rounded-lg border border-subtle bg-surface/50">
        <div className="py-1">
          {sorted.map((comment, idx) => (
            <React.Fragment key={comment.id}>
              {idx > 0 && <Separator className="mx-2 my-0.5 opacity-30" />}
              <CommentRow comment={comment} />
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
