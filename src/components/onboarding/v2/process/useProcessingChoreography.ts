import { useMemo } from "react";
import { useBackgroundJobs, type JobKey, type JobStatus } from "../state/BackgroundJobsProvider";
import type { AgentPreviewBuckets } from "../state/agentPreview";
import type { PreviewSection } from "@/lib/onboarding/agentClient";

const STEP_ORDER: {
  id: string;
  label: string;
  icon: string;
  jobs: JobKey[];
  field?: keyof AgentPreviewBuckets;
  section?: PreviewSection;
}[] = [
  { id: "scrape-assets", label: "Scanning website & extracting assets", icon: "🌐", jobs: ["scrape"] },
  { id: "scrape-style", label: "Detecting colors & typography", icon: "🎨", jobs: ["scrape"] },
  { id: "voice", label: "Analyzing brand voice & tone", icon: "✍️", jobs: ["agentPreview"], field: "voice", section: "voice" },
  { id: "audience", label: "Building market & audience profile", icon: "📊", jobs: ["agentPreview"], field: "audience", section: "audience" },
];

type ProcessStepView = {
  id: string;
  label: string;
  icon: string;
  status: "running" | "complete" | "waiting";
};

type Choreography = {
  steps: ProcessStepView[];
  progressPercent: number;
  allComplete: boolean;
  anyError: boolean;
  latestSparkLabel: string | null;
};

export function useProcessingChoreography(): Choreography {
  const { jobs } = useBackgroundJobs();
  const agentBuckets = jobs.agentPreview.data as AgentPreviewBuckets | null;

  return useMemo(() => {
    const steps = STEP_ORDER.map<ProcessStepView>((definition) => {
      const aggregate = aggregateStatus(definition.jobs.map((key) => jobs[key].status));
      if (aggregate === "complete") {
        return { id: definition.id, label: definition.label, icon: definition.icon, status: "complete" };
      }
      const sectionStatus = definition.section && agentBuckets
        ? agentBuckets.sectionStatus[definition.section]
        : undefined;
      const statusComplete = sectionStatus === "done" || sectionStatus === "error";
      const bucketFallback =
        !statusComplete && definition.field && agentBuckets
          ? Boolean(agentBuckets[definition.field])
          : false;
      const isComplete = statusComplete || bucketFallback;
      return {
        id: definition.id,
        label: definition.label,
        icon: definition.icon,
        status: isComplete ? "complete" : aggregate,
      };
    });
    const completedShare = steps.reduce(
      (acc, step) => acc + (step.status === "complete" ? 1 : step.status === "running" ? 0.5 : 0),
      0
    );
    const progressPercent = (completedShare / steps.length) * 100;
    const allComplete = steps.every((s) => s.status === "complete");
    const anyError = STEP_ORDER.some((d) => d.jobs.some((k) => jobs[k].status === "error"));
    return { steps, progressPercent, allComplete, anyError, latestSparkLabel: agentBuckets?.latestSpark?.label ?? null };
  }, [jobs, agentBuckets]);
}

function aggregateStatus(statuses: JobStatus[]): "running" | "complete" | "waiting" {
  if (statuses.every((s) => s === "done")) return "complete";
  if (statuses.some((s) => s === "running")) return "running";
  if (statuses.some((s) => s === "error")) return "complete";
  return "waiting";
}
