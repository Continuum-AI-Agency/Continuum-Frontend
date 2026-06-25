"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  subscribeToBrandInsightsJob,
} from "@/lib/api/brandInsights.client";
import { buildBrandInsightsProgressSteps } from "@/lib/brand-insights/progress";
import { revalidateBrandInsights } from "@/lib/actions/brandInsights";
import { useSmoothTrendProgress } from "@/hooks/useSmoothTrendProgress";
import { TrendGenerationProgress } from "@/components/brand-insights/TrendGenerationProgress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";

// Matches the backend reuse window (findFreshCompletedGeneration withinDays: 5):
// within this window a click re-pulls the cached generation; past it the backend
// regenerates. The single button reflects that to the user.
const STALE_AFTER_DAYS = 5;

type Props = {
  brandId: string;
  lastGeneratedAt?: string;
  // Render as a low-key, uncolored control (not a call-to-action). Used on the
  // dashboard where generation is automatic and the manual refresh is secondary.
  subtle?: boolean;
  // Always start a fresh generation, bypassing the backend's 5-day reuse window.
  force?: boolean;
};

function ageInDays(iso?: string): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

export function BrandInsightsGenerateButton({ brandId, lastGeneratedAt, subtle = false, force = false }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | undefined>(undefined);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const completedToastGenerationRef = useRef<string | null>(null);

  const isWorking = isPending || Boolean(generationId);
  const isFailureStatus = status === "failed" || status === "error" || status === "not_found";
  const isWorkflowRunning =
    isPending || Boolean(generationId) || (status ? !isTerminalBrandInsightsStatus(status) : false);
  const showProgress = isWorkflowRunning || isFailureStatus || Boolean(error);

  const ageDays = ageInDays(lastGeneratedAt);
  const isStale = ageDays === null || ageDays >= STALE_AFTER_DAYS;

  const buttonLabel = useMemo(() => {
    if (generationId) return "Generating…";
    if (isPending) return "Starting…";
    if (force) return "Refresh";
    return isStale ? "Regenerate" : "Refresh";
  }, [generationId, isPending, isStale, force]);

  // Relative age caption, hidden while a run is in flight (the progress row
  // takes over). Null when we have no prior generation to describe.
  const ageLabel = useMemo(() => {
    if (isWorking || ageDays === null) return null;
    if (ageDays <= 0) return "Up to date";
    return isStale ? `${ageDays}d old` : "Up to date";
  }, [isWorking, ageDays, isStale]);

  const progressSteps = useMemo(() => {
    const steps = buildBrandInsightsProgressSteps({ stage, status });
    const showAwaitingStrategic = stage === "awaiting_strategic_analysis";
    return steps.filter((step) => {
      if (step.id === "awaiting_strategic_analysis" && !showAwaitingStrategic) {
        return false;
      }
      if (step.id === "failed" && !isFailureStatus) {
        return false;
      }
      return true;
    });
  }, [stage, status, isFailureStatus]);

  const currentLabel = useMemo(
    () => progressSteps.find((s) => s.status === "current")?.label ?? "Queued",
    [progressSteps]
  );

  const isTerminal = isFailureStatus || status === "completed";
  const { displayPercent, etaSeconds } = useSmoothTrendProgress({
    targetPercent: progressPercent ?? 0,
    remainingMs,
    isTerminal,
  });

  useEffect(
    () => () => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
    },
    []
  );

  // Busting the tagged Data Cache (tags.brandInsights) is what actually pulls
  // the new generation in — router.refresh() alone re-renders against the stale
  // cached /api/trends/read response.
  const refreshInsights = async () => {
    try {
      await revalidateBrandInsights(brandId);
    } catch {
      // Best-effort; router.refresh still re-renders from the server.
    }
    router.refresh();
  };

  const handleRun = () => {
    setError(null);
    setStatus(null);
    setStage("queued");
    setProgressPercent(null);
    setRemainingMs(undefined);
    setStageMessage(null);
    startTransition(async () => {
      try {
        const result = await generateBrandInsights({ brandId, forceRegenerate: force });
        if (result.status === "processing" && result.generationId) {
          const activeGenerationId = result.generationId;
          setGenerationId(activeGenerationId);
          setStatus(result.jobStatus ?? "running");
          const awaitingStrategic =
            result.jobStatus === "pending" &&
            (result.dependencyStrategicAnalysis?.required === true ||
              result.dependencyStrategicAnalysis?.status === "pending");
          setStage(awaitingStrategic ? "awaiting_strategic_analysis" : "queued");
          setStageMessage(result.message ?? null);
          stopTrackingRef.current?.();
          stopTrackingRef.current = subscribeToBrandInsightsJob({
            generationId: activeGenerationId,
            streamChannel: result.stream?.channel,
            fallbackPollUrl: result.fallbackPollUrl,
            onStatus: (next) => {
              setStatus(next.status);
              setStage((previous) => {
                if (next.stage) return next.stage;
                if (next.status === "completed") return "completed";
                if (next.status === "failed" || next.status === "error" || next.status === "not_found") return "failed";
                return previous;
              });
              setProgressPercent(next.progressPercent ?? null);
              if (typeof next.runtime?.remainingMs === "number") {
                setRemainingMs(next.runtime.remainingMs);
              }
              setStageMessage(next.stageMessage ?? next.errorDetail ?? next.message ?? null);
              if (isTerminalBrandInsightsStatus(next.status)) {
                if (next.status === "completed" && completedToastGenerationRef.current !== activeGenerationId) {
                  completedToastGenerationRef.current = activeGenerationId;
                  show({
                    title: "Brand insights ready",
                    description: "Trend generation completed successfully.",
                    variant: "success",
                  });
                }
                stopTrackingRef.current?.();
                stopTrackingRef.current = null;
                setGenerationId(null);
                void refreshInsights();
              }
            },
            onMessage: (message) => {
              if (typeof message.progressPercent === "number") {
                setProgressPercent(message.progressPercent);
              }
              if (typeof message.runtime?.remainingMs === "number") {
                setRemainingMs(message.runtime.remainingMs);
              }
              if (message.stageMessage) {
                setStageMessage(message.stageMessage);
              }
              if (message.stage) {
                setStage(message.stage);
              }
              if (message.status) {
                setStatus(message.status);
              } else if (message.stage) {
                setStatus((current) => (isTerminalBrandInsightsStatus(current) ? current : "running"));
              }
            },
            onError: (streamError) => {
              setError(streamError.message);
            },
          });
        } else {
          // Fresh (<5d) generation reused by the backend — nothing to stream,
          // just re-pull the page so the latest saved trends render.
          show({
            title: "Trends up to date",
            description: "Showing the latest saved trends.",
            variant: "success",
          });
          await refreshInsights();
        }
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Unable to start generation");
      }
    });
  };

  const Icon = force ? RefreshCw : isStale ? Sparkles : RefreshCw;

  return (
    <div className={cn("flex flex-col items-end gap-1.5", showProgress ? "w-full" : "w-auto")}>
      <div className="flex items-center gap-2">
        {ageLabel && !subtle ? (
          <span className="text-xs tabular-nums text-muted-foreground">{ageLabel}</span>
        ) : null}
        <Button
          onClick={handleRun}
          disabled={isWorking}
          variant={subtle ? "ghost" : "default"}
          size="sm"
          aria-label={subtle ? buttonLabel : undefined}
          title={subtle ? buttonLabel : undefined}
          className={cn(
            "h-7 text-xs",
            subtle ? "w-7 px-0 text-muted-foreground hover:text-foreground" : "px-2",
          )}
        >
          {isWorking ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
          {!subtle && buttonLabel}
        </Button>
      </div>
      {showProgress && (
        <TrendGenerationProgress
          progressPercent={displayPercent}
          currentLabel={currentLabel}
          isError={isFailureStatus || Boolean(error)}
          errorMessage={error ?? stageMessage ?? undefined}
          etaSeconds={etaSeconds}
        />
      )}
    </div>
  );
}
