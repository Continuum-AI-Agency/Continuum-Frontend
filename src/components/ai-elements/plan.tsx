"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { 
  ChevronsUpDownIcon, 
  CircleIcon, 
  CheckCircle2Icon, 
  Loader2Icon, 
  AlertCircleIcon,
  UserCheckIcon,
  MessageSquareIcon
} from "lucide-react";
import { createContext, useContext, useState } from "react";

import { Shimmer } from "./shimmer";

export type PlanStatus = 
  | "pending" 
  | "awaiting_approval" 
  | "approved" 
  | "rejected" 
  | "in_progress" 
  | "completed";

interface PlanContextValue {
  isStreaming: boolean;
  status: PlanStatus;
}

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error("Plan components must be used within Plan");
  }
  return context;
};

export type PlanProps = ComponentProps<typeof Collapsible> & {
  isStreaming?: boolean;
  status?: PlanStatus;
};

export const Plan = ({
  className,
  isStreaming = false,
  status = "pending",
  children,
  ...props
}: PlanProps) => (
  <PlanContext.Provider value={{ isStreaming, status }}>
    <Collapsible asChild data-slot="plan" {...props}>
      <Card className={cn(
        "shadow-none transition-all duration-300",
        status === "awaiting_approval" && "border-amber-500/50 bg-amber-500/5",
        status === "approved" && "border-emerald-500/50 bg-emerald-500/5",
        status === "rejected" && "border-red-500/50 bg-red-500/5",
        className
      )}>
        {children}
      </Card>
    </Collapsible>
  </PlanContext.Provider>
);

export type PlanHeaderProps = ComponentProps<typeof CardHeader>;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
  <CardHeader
    className={cn("flex items-start justify-between", className)}
    data-slot="plan-header"
    {...props}
  />
);

export type PlanTitleProps = Omit<
  ComponentProps<typeof CardTitle>,
  "children"
> & {
  children: string;
};

export const PlanTitle = ({ children, className, ...props }: PlanTitleProps) => {
  const { isStreaming, status } = usePlan();

  return (
    <CardTitle 
      data-slot="plan-title" 
      className={cn("flex items-center gap-2", className)} 
      {...props}
    >
      <StatusIcon status={status} />
      <span className="flex-1">
        {isStreaming ? <Shimmer>{children}</Shimmer> : children}
      </span>
    </CardTitle>
  );
};

function StatusIcon({ status }: { status: PlanStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2Icon aria-hidden="true" className="size-4 text-emerald-500 shrink-0" />;
    case "approved":
      return <UserCheckIcon aria-hidden="true" className="size-4 text-emerald-500 shrink-0" />;
    case "in_progress":
      return <Loader2Icon aria-hidden="true" className="size-4 text-indigo-400 animate-spin shrink-0" />;
    case "awaiting_approval":
      return <AlertCircleIcon aria-hidden="true" className="size-4 text-amber-500 shrink-0" />;
    case "rejected":
      return <AlertCircleIcon aria-hidden="true" className="size-4 text-red-500 shrink-0" />;
    default:
      return <CircleIcon aria-hidden="true" className="size-4 text-muted-foreground/40 shrink-0" />;
  }
}

export type PlanDescriptionProps = Omit<
  ComponentProps<typeof CardDescription>,
  "children"
> & {
  children: string;
};

export const PlanDescription = ({
  className,
  children,
  ...props
}: PlanDescriptionProps) => {
  const { isStreaming } = usePlan();

  return (
    <CardDescription
      className={cn("text-balance", className)}
      data-slot="plan-description"
      {...props}
    >
      {isStreaming ? <Shimmer>{children}</Shimmer> : children}
    </CardDescription>
  );
};

export type PlanActionProps = ComponentProps<typeof CardAction>;

export const PlanAction = (props: PlanActionProps) => (
  <CardAction data-slot="plan-action" {...props} />
);

export type PlanContentProps = ComponentProps<typeof CardContent>;

export const PlanContent = (props: PlanContentProps) => (
  <CollapsibleContent asChild>
    <CardContent data-slot="plan-content" {...props} />
  </CollapsibleContent>
);

export type PlanFooterProps = ComponentProps<"div">;

export const PlanFooter = (props: PlanFooterProps) => (
  <CardFooter data-slot="plan-footer" {...props} />
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = ({ className, ...props }: PlanTriggerProps) => (
  <CollapsibleTrigger asChild>
    <Button
      className={cn("size-8", className)}
      data-slot="plan-trigger"
      size="icon"
      variant="ghost"
      {...props}
    >
      <ChevronsUpDownIcon className="size-4" />
      <span className="sr-only">Toggle plan</span>
    </Button>
  </CollapsibleTrigger>
);

export type PlanFeedbackProps = Omit<ComponentProps<"div">, "onSubmit"> & {
  onFeedback?: (feedback: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export const PlanFeedback = ({ 
  onFeedback, 
  placeholder = "Provide feedback on this plan...", 
  disabled,
  className,
  ...props 
}: PlanFeedbackProps) => {
  const [value, setValue] = useState("");

  return (
    <div className={cn("mt-4 space-y-3", className)} {...props}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquareIcon className="size-3" />
        <span>Human Feedback</span>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full min-h-[80px] rounded-md border bg-muted/30 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          aria-label={placeholder}
        />
        <Button
          size="sm"
          className="absolute bottom-2 right-2"
          disabled={!value.trim() || disabled}
          onClick={() => {
            onFeedback?.(value);
            setValue("");
          }}
        >
          Send Feedback
        </Button>
      </div>
    </div>
  );
};
