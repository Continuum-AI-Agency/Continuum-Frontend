"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Callout, Flex, Spinner } from "@radix-ui/themes";
import { CounterClockwiseClockIcon, LightningBoltIcon, ReloadIcon, RocketIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";

import { fetchBrandInsightsStatus, generateBrandInsights } from "@/lib/api/brandInsights.client";
import { revalidateBrandInsights } from "@/lib/actions/brandInsights";

type Props = {
  brandId: string;
};

export function BrandInsightsGenerateButton({ brandId }: Props) {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();

  const isWorking = isPending || Boolean(taskId) || isRefreshing;

  const buttonLabel = useMemo(() => {
    if (taskId) return "Generating…";
    if (isPending) return "Starting…";
    return "Regenerate insights";
  }, [isPending, taskId]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const result = await fetchBrandInsightsStatus(taskId);
        setStatus(result.status);
        if (result.status === "completed" || result.status === "error" || result.status === "not_found") {
          clearInterval(interval);
          setTaskId(null);
          if (!cancelled) {
            router.refresh();
          }
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Unable to poll status");
          setTaskId(null);
          clearInterval(interval);
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [taskId, router]);

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateBrandInsights({ brandId });
        if (result.status === "processing" && result.taskId) {
          setTaskId(result.taskId);
          setStatus("processing");
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
    <Flex direction="column" gap="2" align="end">
      <Flex gap="2" wrap="wrap" justify="end">
        <Button onClick={handleRefresh} disabled={isWorking} variant="outline" color="gray">
          {isRefreshing ? <Spinner loading /> : <ReloadIcon />}
          Refresh data
        </Button>
        <Button onClick={handleRun} disabled={isWorking} variant="solid" color="violet">
          {isWorking ? <Spinner loading /> : <RocketIcon />}
          {buttonLabel}
        </Button>
      </Flex>
      {(status || error) && (
        <Callout.Root color={error ? "red" : "amber"} variant="surface">
          <Callout.Icon>
            {error ? <LightningBoltIcon /> : <CounterClockwiseClockIcon />}
          </Callout.Icon>
          <Callout.Text>
            {error ? error : status === "processing" ? "Generating brand insights…" : `Status: ${status}`}
          </Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  );
}
