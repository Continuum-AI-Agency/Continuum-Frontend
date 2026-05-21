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
import { TrendGenerationProgress } from "@/components/brand-insights/TrendGenerationProgress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/utils";

type Props = {
  brandId: string;
};

export function BrandInsightsGenerateButton({ brandId }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [stageMessage, setStageMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();
  const stopTrackingRef = useRef<(() => void) | null>(null);
  const completedToastGenerationRef = useRef<string | null>(null);

  const isWorking = isPending || Boolean(generationId) || isRefreshing;
  const isFailureStatus = status === "failed" || status === "error" || status === "not_found";
  const isWorkflowRunning =
    isPending || Boolean(generationId) || (status ? !isTerminalBrandInsightsStatus(status) : false);
  const showProgress = isWorkflowRunning || isFailureStatus || Boolean(error);

  const buttonLabel = useMemo(() => {
    if (generationId) return "Generating…";
    if (isPending) return "Starting…";
    return "Regenerate";
  }, [generationId, isPending]);

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

  useEffect(
    () => () => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
    },
    []
  );

  const handleRun = () => {
    setError(null);
    setStatus(null);
    setStage("queued");
    setProgressPercent(null);
    setStageMessage(null);
    startTransition(async () => {
      try {
        const result = await generateBrandInsights({ brandId });
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
                router.refresh();
              }
            },
            onMessage: (message) => {
              if (typeof message.progressPercent === "number") {
                setProgressPercent(message.progressPercent);
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
          router.refresh();
        }
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Unable to start generation");
      }
    });
  };

  const handleRefresh = () => {
    setError(null);
    startRefresh(async () => {
      setStatus(null);
      try {
        await revalidateBrandInsights();
      } catch {
        // Best-effort; router.refresh will still refetch in client.
      }
      router.refresh();
    });
  };

  return (
    <div className={cn("flex flex-col items-end gap-1.5", showProgress ? "w-full" : "w-auto")}>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button onClick={handleRefresh} disabled={isWorking} variant="outline" size="sm" className="h-7 px-2 text-xs">
          {isRefreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Refresh
        </Button>
        <Button onClick={handleRun} disabled={isWorking} size="sm" className="h-7 px-2 text-xs">
          {isWorking ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {buttonLabel}
        </Button>
      </div>
      {showProgress && (
        <TrendGenerationProgress
          progressPercent={progressPercent ?? 0}
          currentLabel={currentLabel}
          isError={isFailureStatus || Boolean(error)}
          errorMessage={error ?? stageMessage ?? undefined}
        />
      )}
    </div>
  );
}
