"use client";

import React from "react";
import { Badge, Button, Card, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { ReloadIcon, StopIcon } from "@radix-ui/react-icons";

import type { ChatImageHistoryItem, StreamState } from "@/lib/types/chatImage";

type PreviewPaneProps = {
  brandName: string;
  streamState: StreamState;
  history: ChatImageHistoryItem[];
  onSelectHistory: (item: ChatImageHistoryItem) => void;
  onCancel?: () => void;
  onReset?: () => void;
};

export function PreviewPane({ brandName, streamState, history, onSelectHistory, onCancel, onReset }: PreviewPaneProps) {
  const isVideo = history[0]?.medium === "video" && !!history[0]?.videoUrl;

  return (
    <Card className="relative h-full min-h-[560px] overflow-hidden border border-white/15 bg-gradient-to-b from-slate-900/90 via-slate-950/85 to-black text-white shadow-2xl">
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

      <div className="relative flex h-[380px] items-center justify-center bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.12),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.12),transparent_30%),rgba(5,8,20,0.95)]">
        {streamState.currentBase64 ? (
          <img
            src={`data:image/png;base64,${streamState.currentBase64}`}
            alt="Current preview"
            className="h-full w-full object-contain"
          />
        ) : isVideo && history[0]?.posterBase64 ? (
          <img src={`data:image/png;base64,${history[0].posterBase64}`} alt="Poster" className="h-full w-full object-contain" />
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

      <div className="border-t border-white/10 bg-slate-950/80 px-3 py-2">
        <Text size="2" weight="medium">History</Text>
        <ScrollArea type="always" scrollbars="horizontal" className="mt-2">
          <Flex gap="2">
            {history.length === 0 ? (
              <Text size="1" color="gray">No generations yet.</Text>
            ) : (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectHistory(item)}
                  className="group relative h-24 w-24 overflow-hidden rounded-lg border border-white/15 bg-white/5 transition hover:-translate-y-1 hover:border-white/30"
                >
                  {item.thumbBase64 ? (
                    <img src={`data:image/png;base64,${item.thumbBase64}`} alt={item.prompt} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">No thumb</div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-slate-900/70 px-1 text-[10px] uppercase text-gray-200">
                    {item.model === "nano-banana" ? "Image" : "Video"}
                  </span>
                </button>
              ))
            )}
          </Flex>
        </ScrollArea>
      </div>
    </Card>
  );
}
