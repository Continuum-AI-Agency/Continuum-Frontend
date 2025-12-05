"use client";

import React from "react";
import { Badge, Button, Card, Flex, Text } from "@radix-ui/themes";
import { ReloadIcon, StopIcon } from "@radix-ui/react-icons";

import type { StreamState } from "@/lib/types/chatImage";

type PreviewPaneProps = {
  brandName: string;
  streamState: StreamState;
  onCancel?: () => void;
  onReset?: () => void;
};

export function PreviewPane({ brandName, streamState, onCancel, onReset }: PreviewPaneProps) {
  return (
    <Card
      className="relative flex h-full min-h-[480px] flex-col overflow-hidden shadow-2xl"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--gray-6)",
        color: "var(--gray-12)",
      }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <Text weight="medium">Preview for {brandName}</Text>
          <div className="text-xs text-gray-400">{streamState.status === "streaming" ? "Streaming" : "Idle"}</div>
        </div>
        <Flex gap="2">
          <Badge color={streamState.status === "streaming" ? "blue" : streamState.status === "error" ? "red" : "green"}>
            {streamState.status}
          </Badge>
          <Button size="1" variant="ghost" onClick={onReset}>
            <ReloadIcon /> Reset
          </Button>
        </Flex>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent-9), transparent 80%), transparent 35%), " +
            "radial-gradient(circle at 80% 10%, color-mix(in srgb, var(--accent-10), transparent 82%), transparent 30%), var(--color-panel)",
          minHeight: 320,
        }}
      >
        {streamState.currentBase64 || streamState.posterBase64 ? (
          <img
            src={`data:image/png;base64,${streamState.currentBase64 ?? streamState.posterBase64}`}
            alt="Current preview"
            className="max-h-full max-w-full object-contain transition duration-200"
          />
        ) : (
          <Text color="gray">Drop a prompt and generate to see preview.</Text>
        )}

        {streamState.status === "streaming" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <Text className="mb-2">Streaming… {streamState.progressPct ?? 0}%</Text>
            <div className="h-2 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-indigo-400 to-blue-400"
                style={{ width: `${Math.min(streamState.progressPct ?? 0, 100)}%` }}
              />
            </div>
            <Button size="2" variant="outline" color="red" className="mt-3" onClick={onCancel}>
              <StopIcon /> Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
