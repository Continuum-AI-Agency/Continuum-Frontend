"use client";

import { Box, Flex, Text } from "@radix-ui/themes";
import { CheckIcon, CircleIcon } from "@radix-ui/react-icons";
import { Spinner } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";

export type PlanStep = {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  details?: string;
};

type PlanProps = {
  steps: PlanStep[];
};

export function Plan({ steps }: PlanProps) {
  return (
    <div className="relative space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isCompleted = step.status === "completed";
        const isInProgress = step.status === "in_progress";
        const isPending = step.status === "pending";
        
        return (
          <div key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && (
              <div 
                className={cn(
                  "absolute left-[11px] top-6 bottom-0 w-[2px]",
                  isCompleted ? "bg-indigo-500/30" : "bg-white/10"
                )} 
              />
            )}
            
            <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface ring-4 ring-surface">
              <StepIcon status={step.status} />
            </div>

            <div className="flex-1 pt-0.5">
              <Text 
                size="2" 
                weight="medium" 
                className={cn(
                  isCompleted || isInProgress ? "text-white" : "text-gray-500",
                  step.status === "cancelled" && "text-gray-500 line-through"
                )}
              >
                {step.title}
              </Text>
              {step.details && (
                <Text as="div" size="1" color="gray" className="mt-1">
                  {step.details}
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepIcon({ status }: { status: PlanStep["status"] }) {
  switch (status) {
    case "completed":
      return <div className="h-5 w-5 rounded-full bg-indigo-500 flex items-center justify-center"><CheckIcon className="text-white h-3 w-3" /></div>;
    case "in_progress":
      return <div className="h-5 w-5 bg-surface rounded-full flex items-center justify-center"><Spinner size={16} /></div>;
    case "cancelled":
      return <div className="h-2 w-2 rounded-full bg-gray-600" />;
    default:
      return <div className="h-2 w-2 rounded-full bg-gray-700" />;
  }
}
