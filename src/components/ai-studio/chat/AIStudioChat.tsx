"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Flex, IconButton, ScrollArea, Text, TextField, Badge } from "@radix-ui/themes";
import { PaperPlaneIcon, ChevronDownIcon, ChevronUpIcon, ChatBubbleIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useAIStudioChatRealtime, type ChatMessage } from "../hooks/useAIStudioChatRealtime";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

type AIStudioChatProps = {
  brandProfileId: string;
  roomId?: string;
  className?: string;
};

export function AIStudioChat({ brandProfileId, roomId = "main", className }: AIStudioChatProps) {
  const { messages, sendMessage, isLoading } = useAIStudioChatRealtime(brandProfileId, roomId);
  const { user } = useSession();
  const [inputValue, setInputValue] = useState("");
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
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <div className={cn("relative", className)}>
        <IconButton 
          size="4" 
          radius="full" 
          variant="solid" 
          highContrast
          onClick={() => setIsOpen(true)}
          className="shadow-2xl hover:scale-105 transition-transform"
        >
          <ChatBubbleIcon width="24" height="24" />
        </IconButton>
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1">
            <Badge color="red" variant="solid" radius="full">
              {unreadCount}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card 
      className={cn("flex flex-col shadow-2xl overflow-hidden transition-all duration-300 w-96 h-[500px]", className)} 
      variant="surface"
      style={{ border: '1px solid var(--gray-7)', backgroundColor: 'var(--gray-2)' }}
    >
      <Flex direction="column" height="100%">
        {/* Header */}
        <Flex 
          justify="between" 
          align="center" 
          p="3" 
          className="border-b border-border/10 bg-surface shadow-sm"
        >
          <Flex align="center" gap="2">
            <ChatBubbleIcon />
            <Text weight="medium" size="2">Studio Chat</Text>
          </Flex>
          <IconButton size="1" variant="ghost" color="gray" onClick={() => setIsOpen(false)}>
            <Cross2Icon />
          </IconButton>
        </Flex>

        {/* Message List */}
        <ScrollArea className="flex-1 p-4" type="always" scrollbars="vertical">
          <div ref={scrollRef} className="flex flex-col gap-3 min-h-full justify-end">
            {isLoading && (
              <Flex justify="center" p="4">
                <Text size="1" color="gray">Loading history...</Text>
              </Flex>
            )}
            
            {!isLoading && messages.length === 0 && (
              <Flex justify="center" p="4" className="text-center opacity-50">
                <Text size="1">No messages yet. Start the conversation!</Text>
              </Flex>
            )}

            {messages.map((msg) => {
              const isMe = msg.user_id === user?.id;
              return (
                <Flex
                  key={msg.id}
                  direction="column"
                  align={isMe ? "end" : "start"}
                  gap="1"
                  className="max-w-full"
                >
                  {!isMe && (
                    <Text size="1" color="gray" className="ml-1 text-[10px]">
                      {msg.user_name || "Unknown"}
                    </Text>
                  )}
                  <div
                    className={cn(
                      "px-3 py-2 rounded-2xl text-sm max-w-[90%] break-words shadow-sm",
                      isMe
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-gray-700 text-gray-100 rounded-bl-none"
                    )}
                  >
                    {msg.content}
                  </div>
                  <Text size="1" color="gray" className={cn("text-[9px] opacity-40", isMe ? "mr-1" : "ml-1")}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </Flex>
              );
            })}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-3 border-t border-border/10 bg-surface">
          <Flex gap="2">
            <TextField.Root
              className="flex-1"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              size="2"
              radius="full"
            />
            <IconButton onClick={handleSend} disabled={!inputValue.trim()} size="2" radius="full" variant="solid">
              <PaperPlaneIcon />
            </IconButton>
          </Flex>
        </div>
      </Flex>
    </Card>
  );
}
