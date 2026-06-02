"use client";

import * as React from "react";
import { CheckIcon, PaperPlaneIcon, ChatBubbleIcon } from "@radix-ui/react-icons";
import { Loader2, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrganicChatMessage, OrganicContentPlan } from "@/lib/organic/chat.types";
import { LinkifiedText } from "@/components/ai-elements/linkified-text";

// ─── Message bubble ───────────────────────────────────────────────────────────

type MessageBubbleProps = {
  message: OrganicChatMessage;
};

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex items-end gap-2", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {/* Avatar dot */}
      <div
        className={cn(
          "mb-0.5 h-5 w-5 shrink-0 rounded-full",
          isUser
            ? "bg-primary/20 ring-1 ring-primary/30"
            : "bg-muted ring-1 ring-border/60"
        )}
      />

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted/80 text-foreground ring-1 ring-border/40"
        )}
      >
        <p className="whitespace-pre-wrap break-words"><LinkifiedText text={message.content} /></p>
      </div>
    </motion.div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
      className="flex items-end gap-2"
    >
      <div className="mb-0.5 h-5 w-5 shrink-0 rounded-full bg-muted ring-1 ring-border/60" />
      <div className="rounded-2xl rounded-bl-sm bg-muted/80 px-3 py-2.5 ring-1 ring-border/40">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 0.9,
                delay: i * 0.18,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Plan proposal card ───────────────────────────────────────────────────────

type PlanProposalCardProps = {
  plan: OrganicContentPlan;
  isApproving: boolean;
  onApprove: (planId: string) => void;
  onCancel: () => void;
};

function PlanProposalCard({ plan, isApproving, onApprove, onCancel }: PlanProposalCardProps) {
  const platformCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of plan.placements) {
      counts[p.platform] = (counts[p.platform] ?? 0) + 1;
    }
    return Object.entries(counts);
  }, [plan.placements]);

  const isTerminal =
    plan.status === "completed" ||
    plan.status === "failed" ||
    plan.status === "cancelled";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="mx-1 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 ring-1 ring-primary/10"
    >
      <div className="border-b border-primary/15 bg-primary/8 px-3 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
            Content Plan Proposal
          </p>
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] uppercase tracking-wide",
              plan.status === "proposed" && "border-amber-500/30 bg-amber-500/10 text-amber-600",
              plan.status === "approved" && "border-primary/30 bg-primary/10 text-primary",
              plan.status === "generating" && "border-blue-500/30 bg-blue-500/10 text-blue-600",
              plan.status === "completed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
              plan.status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {plan.status}
          </Badge>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap gap-1">
          {platformCounts.map(([platform, count]) => (
            <span
              key={platform}
              className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground ring-1 ring-border/50"
            >
              {platform}
              <span className="font-semibold text-foreground">{count}</span>
            </span>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {plan.placements.length} post{plan.placements.length !== 1 ? "s" : ""} across week of{" "}
          <span className="font-medium text-foreground">{plan.week_start}</span>
        </p>

        {plan.guidance ? (
          <p className="line-clamp-2 text-xs text-muted-foreground/80 italic">
            &ldquo;{plan.guidance}&rdquo;
          </p>
        ) : null}
      </div>

      {plan.status === "proposed" && !isTerminal ? (
        <div className="flex gap-2 border-t border-primary/10 px-3 py-2">
          <Button
            size="sm"
            className="h-7 flex-1 gap-1.5 text-xs"
            disabled={isApproving}
            onClick={() => onApprove(plan.id)}
          >
            {isApproving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckIcon className="h-3 w-3" />
            )}
            {isApproving ? "Generating…" : "Approve & Generate"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={isApproving}
            onClick={onCancel}
          >
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}

      {plan.status === "generating" ? (
        <div className="flex items-center gap-2 border-t border-primary/10 px-3 py-2">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <p className="text-[11px] text-primary/70">Generating your content…</p>
        </div>
      ) : null}

      {plan.status === "completed" ? (
        <div className="flex items-center gap-2 border-t border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
          <CheckIcon className="h-3 w-3 text-emerald-600" />
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
            Content generated — review your calendar
          </p>
        </div>
      ) : null}
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/50">
        <ChatBubbleIcon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-foreground">Plan your week with AI</p>
        <p className="max-w-[18rem] text-[11px] leading-5 text-muted-foreground">
          Describe what you want to post and I&apos;ll propose a content plan for your calendar.
        </p>
      </div>
      <div className="mt-1 flex flex-col gap-1.5 text-left w-full max-w-[22rem]">
        {[
          "Plan 5 posts for this week focused on product launches",
          "Create a mix of educational and promotional content",
          "Generate content around our upcoming event",
        ].map((suggestion) => (
          <p
            key={suggestion}
            className="rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5 text-[10px] text-muted-foreground/80 leading-4"
          >
            &ldquo;{suggestion}&rdquo;
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export type OrganicChatSurfaceProps = {
  messages: OrganicChatMessage[];
  activePlan: OrganicContentPlan | null;
  isStreaming: boolean;
  isLoadingSession: boolean;
  isApproving: boolean;
  onSendMessage: (content: string) => void;
  onApprovePlan: (planId: string) => void;
  onCancelPlan: () => void;
};

export function OrganicChatSurface({
  messages,
  activePlan,
  isStreaming,
  isLoadingSession,
  isApproving,
  onSendMessage,
  onApprovePlan,
  onCancelPlan,
}: OrganicChatSurfaceProps) {
  const [input, setInput] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const hasContent = messages.length > 0 || Boolean(activePlan);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activePlan, isStreaming]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    onSendMessage(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg bg-card/70 ring-1 ring-border/40">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Planning Assistant
          </p>
        </div>
        {messages.length > 0 ? (
          <Badge variant="outline" className="text-[9px] uppercase tracking-wide">
            {messages.length} msg{messages.length !== 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>

      {/* Message list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {isLoadingSession ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !hasContent ? (
            <EmptyState />
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}

              <AnimatePresence>
                {isStreaming ? <TypingIndicator key="typing" /> : null}
              </AnimatePresence>

              {activePlan ? (
                <PlanProposalCard
                  plan={activePlan}
                  isApproving={isApproving}
                  onApprove={onApprovePlan}
                  onCancel={onCancelPlan}
                />
              ) : null}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/50 p-2">
        <div className="flex items-end gap-1.5 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring/40">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your content goals…"
            className="max-h-[7rem] min-h-[2.25rem] flex-1 resize-none border-0 bg-transparent p-0 text-xs leading-relaxed shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
            disabled={isStreaming || isApproving}
            rows={1}
          />
          <Button
            type="button"
            size="icon-xs"
            disabled={!input.trim() || isStreaming || isApproving}
            onClick={handleSend}
            className="mb-0.5 shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PaperPlaneIcon className="h-3 w-3" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </div>
        <p className="mt-1 px-1 text-[10px] text-muted-foreground/50">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </section>
  );
}
