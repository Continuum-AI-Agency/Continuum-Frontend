"use client";

import * as React from "react";
import { Card, Flex, Text, Box, Badge } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { GridStatus } from "@/lib/organic/store";

const stageColors: Record<string, string> = {
  analyzing: "blue",
  optimizing: "amber",
  drafting: "violet",
  matching: "cyan",
  finalizing: "emerald",
};

const stageLabels: Record<string, string> = {
  analyzing: "Analyzing",
  optimizing: "Optimizing",
  drafting: "Drafting",
  matching: "Matching",
  finalizing: "Finalizing",
};

interface GenerationProgressPanelProps {
  status: GridStatus;
  percent: number;
  message?: string;
  stage?: string;
  error?: string | null;
}

export function GenerationProgressPanel({
  status,
  percent,
  message,
  stage,
  error,
}: GenerationProgressPanelProps) {
  if (status === "idle") {
    return null;
  }

  const isError = status === "error" || error;
  const isComplete = status === "complete";
  const isCompleteWithErrors = status === "complete_with_errors";
  const stageColor = stage ? stageColors[stage] : "gray";
  const stageLabel = stage ? stageLabels[stage] : "Processing";

  return (
    <Card data-testid="generation-progress-panel">
      <Box p="4">
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Flex align="center" gap="3">
              {isError ? (
                <Box
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "bg-red-100 text-red-600"
                  )}
                >
                  <Cross2Icon className="w-4 h-4" />
                </Box>
              ) : isComplete ? (
                <Box
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "bg-emerald-100 text-emerald-600"
                  )}
                >
                  <CheckIcon className="w-4 h-4" />
                </Box>
              ) : isCompleteWithErrors ? (
                <Box
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "bg-amber-100 text-amber-600"
                  )}
                >
                  <Cross2Icon className="w-4 h-4" />
                </Box>
              ) : (
                <Box
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    "bg-amber-100 text-amber-600 animate-spin"
                  )}
                >
                  <ReloadIcon className="w-4 h-4" />
                </Box>
              )}

              <Flex direction="column" gap="1">
                <Text weight="bold" size="3">
                  {isError
                    ? "Generation Failed"
                    : isComplete
                    ? "Generation Complete"
                    : isCompleteWithErrors
                    ? "Generation Complete with Failures"
                    : "Generating Content"}
                </Text>
                {!isError && !isComplete && !isCompleteWithErrors && stage && (
                  <Badge color={stageColor as any} size="1">
                    {stageLabel}
                  </Badge>
                )}
              </Flex>
            </Flex>

            {!isError && (
              <Text weight="bold" size="5" color="gray">
                {percent}%
              </Text>
            )}
          </Flex>

          {!isError && (
            <Progress
              value={percent}
              data-testid="generation-progress-bar"
              className={cn(
                isComplete && "[&>div]:bg-emerald-500",
                isCompleteWithErrors && "[&>div]:bg-amber-500",
                isError && "[&>div]:bg-red-500"
              )}
            />
          )}

          {message && !isError && (
            <Text size="2" color="gray">
              {message}
            </Text>
          )}

          {isError && error && (
            <Box
              className="p-3 rounded-md bg-red-50 border border-red-200"
              role="alert"
              aria-live="assertive"
            >
              <Text size="2" color="red">
                {error}
              </Text>
            </Box>
          )}
        </Flex>
      </Box>
    </Card>
  );
}
