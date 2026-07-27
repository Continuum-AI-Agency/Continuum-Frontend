'use client';

import { ChatBubbleIcon, Cross2Icon, PaperPlaneIcon } from '@radix-ui/react-icons';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSession } from '@/hooks/useSession';
import { cn } from '@/lib/utils';
import { type ChatMessage, useAIStudioChatRealtime } from '../hooks/useAIStudioChatRealtime';

type AIStudioChatProps = {
  brandProfileId: string;
  roomId?: string;
  className?: string;
  /** Notifies the canvas when the panel opens/closes so overlapping overlays
   *  (the AI composer bar) can reserve this panel's footprint. */
  onOpenChange?: (open: boolean) => void;
};

// This is a human-to-human collaboration channel for the people editing the
// canvas together — deliberately NOT an AI assistant. It is labelled "Team chat"
// so it is never mistaken for the AI composer that builds the workflow.
export function AIStudioChat({
  brandProfileId,
  roomId = 'main',
  className,
  onOpenChange,
}: AIStudioChatProps) {
  const { messages, sendMessage, isLoading } = useAIStudioChatRealtime(brandProfileId, roomId);
  const { user } = useSession();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastViewedCountRef = useRef(0);

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  // Track unread messages when closed
  useEffect(() => {
    if (!isOpen) {
      setUnreadCount(messages.length - lastViewedCountRef.current);
    } else {
      setUnreadCount(0);
      lastViewedCountRef.current = messages.length;
    }
  }, [messages.length, isOpen]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(inputValue);
      setInputValue('');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <div className={cn('relative', className)}>
        <Button
          size="icon"
          variant="default"
          onClick={() => setOpen(true)}
          aria-label="Open team chat"
          className="size-11 rounded-full shadow-md transition-colors"
        >
          <ChatBubbleIcon width="24" height="24" />
        </Button>
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1">
            <Pill variant="destructive" className="rounded-full">
              {unreadCount}
            </Pill>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-[500px] w-96 flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md',
        className,
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex min-h-12 items-center justify-between border-b border-border px-3 py-2">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <ChatBubbleIcon />
              <span className="font-medium text-sm">Team chat</span>
            </div>
            <span className="text-2xs text-muted-foreground">
              Talk to your teammates on this canvas
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            aria-label="Close team chat"
          >
            <Cross2Icon />
          </Button>
        </div>

        {/* Message List */}
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="p-4"
          viewportRef={scrollRef}
          type="always"
        >
          <div className="flex min-h-full flex-col justify-end gap-3">
            {isLoading && (
              <div className="flex justify-center p-4">
                <span className="text-xs text-gray-400">Loading history...</span>
              </div>
            )}

            {!isLoading && messages.length === 0 && (
              <div className="flex justify-center p-4 text-center opacity-50">
                <span className="text-xs">No messages yet. Start the conversation!</span>
              </div>
            )}

            {messages.map((msg) => {
              const isMe = msg.user_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col gap-1 max-w-full',
                    isMe ? 'items-end' : 'items-start',
                  )}
                >
                  {!isMe && (
                    <span className="ml-1 text-2xs text-gray-400">
                      {msg.user_name || 'Unknown'}
                    </span>
                  )}
                  <div
                    className={cn(
                      'max-w-[90%] break-words rounded-lg px-3 py-2 text-sm',
                      isMe
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-muted text-foreground',
                    )}
                  >
                    {msg.content}
                  </div>
                  <span className={cn('text-3xs opacity-40 text-gray-400', isMe ? 'mr-1' : 'ml-1')}>
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <Input
              className="flex-1"
              inputSize="md"
              placeholder="Message your team…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending}
              size="icon"
              variant="default"
              aria-label="Send message"
            >
              <PaperPlaneIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
