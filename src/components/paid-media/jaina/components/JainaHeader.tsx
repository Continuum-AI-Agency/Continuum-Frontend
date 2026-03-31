"use client";

import React from "react";
import { Button, Flex, Heading } from "@radix-ui/themes";
import {
  ArchiveIcon,
  Cross2Icon,
  LayersIcon,
  ResetIcon,
  TargetIcon,
} from "@radix-ui/react-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type JainaHeaderProps = {
  brandName: string;
  campaignId?: string | null;
  adAccountId?: string | null;
  onClearMemory: () => void;
  onClearConversation: () => void;
  onStop: () => void;
  isStreaming: boolean;
};

export function JainaHeader({
  brandName,
  campaignId,
  adAccountId,
  onClearMemory,
  onClearConversation,
  onStop,
  isStreaming,
}: JainaHeaderProps) {
  return (
    <header className="relative z-10 flex items-center justify-between gap-3 border-b border-border/60 bg-background/70 p-3 shadow-sm transition-all duration-300">
      <Flex align="center" gap="4" className="flex-1 min-w-0">
        <Flex align="center" gap="2" className="shrink-0 mr-2">
          <Heading size="3" className="tracking-tight font-bold whitespace-nowrap">
            Jaina
          </Heading>
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </Flex>

        <Flex align="center" gap="3" className="hidden sm:flex overflow-x-auto no-scrollbar py-1">
          <Flex align="center" gap="1.5" className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-secondary">
            <ArchiveIcon className="text-purple-400 size-3" />
            <span className="text-primary truncate max-w-[100px]">{brandName}</span>
          </Flex>

          {adAccountId && (
            <Flex align="center" gap="1.5" className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-secondary">
              <LayersIcon className="text-blue-400 size-3" />
              <span className="text-primary font-mono truncate max-w-[120px]">{adAccountId}</span>
            </Flex>
          )}

          {campaignId && (
            <Flex align="center" gap="1.5" className="shrink-0 text-[10px] uppercase tracking-wider font-semibold text-secondary">
              <TargetIcon className="text-emerald-400 size-3" />
              <span className="text-primary truncate max-w-[120px]">{campaignId}</span>
            </Flex>
          )}
        </Flex>
      </Flex>

      <Flex align="center" gap="2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="soft"
              color="gray"
              size="1"
              className="hover:bg-white/10"
              aria-label="Clear Memory"
            >
              <ResetIcon />
              <span className="hidden xs:inline">Memory</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Jaina's memory?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently erase Jaina's memory for this ad account. She will start fresh on your next message. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onClearMemory}
              >
                Clear memory
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="soft"
              color="gray"
              size="1"
              className="hover:bg-white/10"
              aria-label="Clear Conversation"
            >
              <Cross2Icon />
              <span className="hidden xs:inline">Clear</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the current conversation and all its messages. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onClearConversation}
              >
                Clear conversation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isStreaming && (
          <Button
            variant="solid"
            color="red"
            size="1"
            onClick={onStop}
            className="animate-pulse"
          >
            Stop
          </Button>
        )}
      </Flex>
    </header>
  );
}
