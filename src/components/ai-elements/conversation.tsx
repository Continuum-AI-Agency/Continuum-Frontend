"use client";

// House-modified: diverged from the upstream ai-elements component of the same name.
// Re-running the ai-elements CLI would overwrite this file by filename and lose the changes.
import * as React from "react";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Distance from the bottom (px) within which the view is considered "pinned".
// While pinned, new content auto-follows; scrolling further up detaches the
// view so streaming output never yanks the reader back down.
const STICK_THRESHOLD_PX = 64;

type ConversationProps = React.ComponentProps<"div">;

export function Conversation({ children, className, ...props }: ConversationProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickRef = React.useRef(true);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickRef.current = true;
    setShowScrollButton(false);
  }, []);

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    stickRef.current = pinned;
    setShowScrollButton(!pinned);
  }, []);

  // Follow content growth (new messages, streaming tokens) only while pinned. A
  // MutationObserver on the scroll container keeps this robust without tying the
  // effect to React children identity or wrapping the content in an extra node;
  // instant (not smooth) scrolling avoids a backlog of animated scrolls.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative h-full min-h-0 w-full overflow-hidden", className)} {...props}>
      <div ref={scrollRef} onScroll={handleScroll} className="h-full min-h-0 w-full overflow-y-auto">
        {children}
      </div>
      {showScrollButton ? <ConversationScrollButton onClick={() => scrollToBottom()} /> : null}
    </div>
  );
}

type ConversationContentProps = React.ComponentProps<"div">;

export function ConversationContent({ children, className, ...props }: ConversationContentProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 md:px-6 lg:px-8", className)}
      {...props}
    >
      {children}
    </div>
  );
}

type ConversationScrollButtonProps = {
  onClick?: () => void;
};

export function ConversationScrollButton({ onClick }: ConversationScrollButtonProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Scroll to latest"
        onClick={onClick}
        className="pointer-events-auto size-8 rounded-full border-border bg-background/90 text-muted-foreground shadow-md backdrop-blur hover:bg-accent hover:text-foreground"
      >
        <ArrowDown className="size-4" />
      </Button>
    </div>
  );
}

type ConversationEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function ConversationEmptyState({ icon, title, description, children }: ConversationEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 text-center">
      {icon ? <div className="text-muted-foreground/70">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function ConversationDownload({ messages }: { messages: unknown[] }) {
  void messages;
  return null;
}
