'use client';

import { ArchiveIcon, Cross2Icon, LayersIcon, ResetIcon, TargetIcon } from '@radix-ui/react-icons';
import React from 'react';
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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

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
    <header className="relative z-10 flex items-center justify-between gap-3 border-b border-border/70 bg-background/70 p-3 transition-all duration-300">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <h2 className="text-sm font-semibold tracking-tight whitespace-nowrap">Jaina</h2>
          <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </div>

        <div className="hidden sm:flex items-center gap-3 overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-1.5 shrink-0 text-2xs uppercase tracking-wider font-semibold text-muted-foreground">
            <ArchiveIcon className="size-3" />
            <span className="truncate max-w-[100px]">{brandName}</span>
          </div>

          {adAccountId && (
            <div className="flex items-center gap-1.5 shrink-0 text-2xs uppercase tracking-wider font-semibold text-muted-foreground">
              <LayersIcon className="size-3" />
              <span className="font-mono truncate max-w-[120px]">{adAccountId}</span>
            </div>
          )}

          {campaignId && (
            <div className="flex items-center gap-1.5 shrink-0 text-2xs uppercase tracking-wider font-semibold text-muted-foreground">
              <TargetIcon className="size-3" />
              <span className="truncate max-w-[120px]">{campaignId}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="hover:bg-white/10"
                aria-label="Clear Memory"
              >
                <ResetIcon />
                <span className="hidden xs:inline">Memory</span>
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Jaina's memory?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently erase Jaina's memory for this ad account. She will start fresh
                on your next message. This cannot be undone.
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
          <AlertDialogTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="hover:bg-white/10"
                aria-label="Clear Conversation"
              >
                <Cross2Icon />
                <span className="hidden xs:inline">Clear</span>
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the current conversation and all its messages. This cannot be
                undone.
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
          <Button variant="destructive" size="sm" onClick={onStop} className="animate-pulse">
            Stop
          </Button>
        )}
      </div>
    </header>
  );
}
