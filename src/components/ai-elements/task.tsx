"use client";

import type { ComponentProps } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { 
  ChevronDownIcon, 
  CircleIcon, 
  CheckCircle2Icon, 
  Loader2Icon, 
  AlertCircleIcon,
  FileIcon
} from "lucide-react";

export type TaskStatus = "pending" | "in_progress" | "completed" | "error";

export type TaskItemFileProps = ComponentProps<"div">;

export const TaskItemFile = ({
  children,
  className,
  ...props
}: TaskItemFileProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md border bg-secondary/50 px-2 py-0.5 text-foreground text-xs transition-colors hover:bg-secondary",
      className
    )}
    {...props}
  >
    <FileIcon className="size-3 text-muted-foreground" />
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div 
    className={cn(
      "text-muted-foreground text-sm flex items-start gap-2", 
      className
    )} 
    {...props}
  >
    <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
    <div className="flex-1">{children}</div>
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible> & {
  status?: TaskStatus;
};

export const Task = ({
  defaultOpen = true,
  className,
  status = "pending",
  ...props
}: TaskProps) => (
  <Collapsible 
    className={cn("group/task w-full", className)} 
    defaultOpen={defaultOpen} 
    {...props} 
  />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
  status?: TaskStatus;
  progress?: { current: number; total: number };
};

export const TaskTrigger = ({
  children,
  className,
  title,
  status = "pending",
  progress,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger asChild className={cn("group", className)} {...props}>
    {children ?? (
      <button 
        type="button" 
        className="flex w-full cursor-pointer items-center gap-2.5 text-muted-foreground text-sm transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <StatusIcon status={status} />
        <p className={cn(
          "text-sm font-medium flex-1 text-left",
          status === "completed" && "text-foreground",
          status === "in_progress" && "text-foreground"
        )}>
          {title}
        </p>
        {progress && (
          <span className="text-[10px] font-mono text-muted-foreground/60 uppercase">
            {progress.current}/{progress.total}
          </span>
        )}
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </button>
    )}
  </CollapsibleTrigger>
);

function StatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2Icon className="size-4 text-indigo-500 shrink-0" />;
    case "in_progress":
      return <Loader2Icon className="size-4 text-indigo-400 animate-spin shrink-0" />;
    case "error":
      return <AlertCircleIcon className="size-4 text-red-500 shrink-0" />;
    default:
      return <CircleIcon className="size-4 text-muted-foreground/40 shrink-0" />;
  }
}

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  children,
  className,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "overflow-hidden text-sm transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
      className
    )}
    {...props}
  >
    <div className="ml-[11px] mt-2 space-y-3 border-l border-muted/60 pl-5 pb-2">
      {children}
    </div>
  </CollapsibleContent>
);
