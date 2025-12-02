"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Flex, Text } from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";

import { runStrategicAnalysis } from "@/lib/api/strategicAnalyses.client";
import { useToast } from "@/components/ui/ToastProvider";
import { requestStrategicRunsCatchUp } from "./realtimeBus";

type Props = {
  brandProfileId: string;
  compact?: boolean;
};

export function RunStrategicAnalysisButton({ brandProfileId, compact = false }: Props) {
  const { show } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRun = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runStrategicAnalysis(brandProfileId);
        const details = result.runId ?? result.taskId ?? result.status ?? undefined;
        show({
          title: "Strategic analysis queued",
          description: details ? `Run reference: ${details}` : "Regeneration requested for this brand.",
          variant: "success",
        });
        void requestStrategicRunsCatchUp(brandProfileId);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unable to start strategic analysis run.";
        setError(message);
        show({ title: "Run failed", description: message, variant: "error" });
      }
    });
  };

  return (
    <Flex direction="column" gap="3">
      {!compact && (
        <div className="space-y-1">
          <Text size="3" weight="bold" className="text-white">
            Strategic analyses
          </Text>
          <Text size="2" color="gray">
            Manually queue a fresh strategic analysis when no results exist for this brand.
          </Text>
        </div>
      )}

      {error ? (
        <Callout.Root color="red" variant="surface">
          <Callout.Icon>
            <RocketIcon />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      ) : null}

      <Button
        onClick={handleRun}
        disabled={isPending}
        color="indigo"
        variant="solid"
        size={compact ? "2" : "3"}
      >
        {isPending ? "Queuing..." : "Run analysis"}
      </Button>
    </Flex>
  );
}
