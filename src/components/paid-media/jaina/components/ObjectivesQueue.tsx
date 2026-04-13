"use client";

import {
  ListChecksIcon,
} from "lucide-react";
import type { JainaObjective } from "@/lib/jaina/schemas";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";

function getObjectiveStatusLabel(status: JainaObjective["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Pending";
}

function getObjectiveStatusClasses(status: JainaObjective["status"]): string {
  if (status === "completed") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "in_progress") {
    return "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  if (status === "failed") {
    return "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-border/80 bg-muted/40 text-muted-foreground";
}

type ObjectivesQueueProps = {
  objectives: JainaObjective[];
  isStreaming: boolean;
};

export function ObjectivesQueue({ objectives, isStreaming }: ObjectivesQueueProps) {
  if (!objectives.length) return null;

  const completedCount = objectives.filter(
    (objective) => objective.status === "completed"
  ).length;

  return (
    <Queue className="border-border/70 bg-card/80 shadow-none">
      <QueueSection defaultOpen={false}>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={objectives.length}
            label="objectives"
            icon={<ListChecksIcon className="size-3.5" />}
          />
          <span className="text-xs text-muted-foreground">
            {completedCount}/{objectives.length} done
            {isStreaming ? " • live" : ""}
          </span>
        </QueueSectionTrigger>
        <QueueSectionContent className="pt-2">
          <QueueList className="h-[170px]">
            {objectives.map((objective) => {
              const completed = objective.status === "completed";
              return (
                <QueueItem key={objective.id}>
                  <div className="flex items-start gap-2">
                    <QueueItemIndicator
                      completed={completed}
                      className={
                        objective.status === "in_progress"
                          ? "border-blue-400/60 bg-blue-500/30"
                          : objective.status === "failed"
                            ? "border-red-400/60 bg-red-500/30"
                            : undefined
                      }
                    />
                    <QueueItemContent completed={completed}>
                      {objective.title}
                    </QueueItemContent>
                    <span
                      className={`ml-auto inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getObjectiveStatusClasses(
                        objective.status
                      )}`}
                    >
                      {getObjectiveStatusLabel(objective.status)}
                    </span>
                  </div>
                  {objective.description ? (
                    <QueueItemDescription completed={completed}>
                      {objective.description}
                    </QueueItemDescription>
                  ) : null}
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}
