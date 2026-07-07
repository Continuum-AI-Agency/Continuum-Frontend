'use client';

import { ChatBubbleIcon, Cross2Icon, PaperPlaneIcon } from '@radix-ui/react-icons';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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
};

export function AIStudioChat({ brandProfileId, roomId = 'main', className }: AIStudioChatProps) {
  const { messages, sendMessage, isLoading } = useAIStudioChatRealtime(brandProfileId, roomId);
  const { user } = useSession();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastViewedCountRef = useRef(0);

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
    if (!inputValue.trim()) return;
    await sendMessage(inputValue);
    setInputValue('');
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
          onClick={() => setIsOpen(true)}
          aria-label="Open studio chat"
          className="size-12 rounded-full shadow-2xl hover:scale-105 transition-transform"
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
        'flex flex-col shadow-2xl overflow-hidden transition-all duration-300 w-96 h-[500px] rounded-xl p-3',
        className,
      )}
      style={{ border: '1px solid var(--gray-7)', backgroundColor: 'var(--gray-2)' }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-border/10 bg-surface shadow-sm">
          <div className="flex items-center gap-2">
            <ChatBubbleIcon />
            <span className="font-medium text-sm">Studio Chat</span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
          >
            <Cross2Icon />
          </Button>
        </div>

        {/* Message List */}
        <ScrollArea className="flex-1 p-4" type="always">
          <div ref={scrollRef} className="flex flex-col gap-3 min-h-full justify-end">
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
                      'px-3 py-2 rounded-2xl text-sm max-w-[90%] break-words shadow-sm',
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-gray-700 text-gray-100 rounded-bl-none',
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
        <div className="p-3 border-t border-border/10 bg-surface">
          <div className="flex gap-2">
            <Input
              className="flex-1 rounded-full"
              inputSize="md"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              size="icon"
              variant="default"
              className="rounded-full"
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
