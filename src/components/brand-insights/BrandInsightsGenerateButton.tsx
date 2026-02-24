"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  generateBrandInsights,
  isTerminalBrandInsightsStatus,
  subscribeToBrandInsightsJob,
} from "@/lib/api/brandInsights.client";
import { buildBrandInsightsProgressSteps } from "@/lib/brand-insights/progress";
import { revalidateBrandInsights } from "@/lib/actions/brandInsights";
import { ProgressSteps } from "@/components/brand-insights/ProgressSteps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/ToastProvider";

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
  const showStatusAlert = Boolean(error) || isWorkflowRunning || isFailureStatus;

  const buttonLabel = useMemo(() => {
    if (generationId) return "Generating…";
    if (isPending) return "Starting…";
    return "Regenerate insights";
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
    <div className="flex w-full flex-col items-end gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={handleRefresh} disabled={isWorking} variant="outline" size="sm">
          {isRefreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh data
        </Button>
        <Button onClick={handleRun} disabled={isWorking} size="sm">
          {isWorking ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {buttonLabel}
        </Button>
      </div>
      {showStatusAlert && (
        <Alert variant={error ? "destructive" : "default"}>
          {error || isFailureStatus ? <AlertTriangle /> : <Loader2 className="size-4 animate-spin" />}
          <AlertTitle>{error || isFailureStatus ? "Generation failed" : "Generation in progress"}</AlertTitle>
          <AlertDescription>
            {error
              ? error
              : isFailureStatus
                ? stageMessage ?? (status ? `Status: ${status}` : "Unable to complete generation")
                : `${Math.round(progressPercent ?? 0)}%${stageMessage ? ` · ${stageMessage}` : status ? ` · Status: ${status}` : ""}`}
          </AlertDescription>
        </Alert>
      )}
      {isWorkflowRunning && !error ? (
        <ProgressSteps data={{ steps: progressSteps }} progressPercent={progressPercent ?? undefined} />
      ) : null}
    </div>
  );
}
