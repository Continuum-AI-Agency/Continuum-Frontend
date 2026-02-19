"use client";
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { useCampaignAI } from '../hooks/useCampaignAI';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Bot, User, Send, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => isTextUIPart(part))
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export const CampaignChat = () => {
  const { processAIAction } = useCampaignAI();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/campaign/chat' }),
    onFinish: ({ message }) => {
      try {
        const actionMatch = getMessageText(message).match(/```json\n([\s\S]*?)\n```/);
        if (actionMatch) {
          const action = JSON.parse(actionMatch[1]);
          if (Array.isArray(action)) {
            action.forEach(processAIAction);
          } else {
            processAIAction(action);
          }
        }
      } catch (e) {
        console.error('Failed to parse AI action', e);
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value);
  }, []);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextInput = input.trim();
    if (!nextInput || isLoading) return;

    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: nextInput }],
    });
    setInput('');
  }, [input, isLoading, sendMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col border-l bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2 p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Campaign Architect</h2>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Assistant Powered by Gemini</p>
        </div>
      </div>
      
      <Separator />

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
              <Bot className="mb-2 h-10 w-10" />
              <p className="text-sm font-medium">How can I help you build your campaign today?</p>
              <p className="mt-1 text-xs italic">"Create a sales campaign with 3 ad sets targeting fitness enthusiasts"</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn(
              "flex gap-3",
              m.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md border shadow",
                m.role === 'user' ? "bg-background" : "bg-primary text-primary-foreground"
              )}>
                {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                m.role === 'user' ? "bg-muted" : "bg-accent"
              )}>
                {getMessageText(m).replace(/```json\n[\s\S]*?\n```/g, '').trim() || "Building your campaign structure..."}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="rounded-lg bg-accent px-3 py-2 text-sm italic opacity-70">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Input */}
      <div className="p-4">
        <form onSubmit={handleSubmit} className="relative">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask Architect to build something..."
            className="pr-10"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            variant="ghost" 
            className="absolute right-1 top-1 h-8 w-8 text-primary"
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-[10px] text-center text-muted-foreground">
          Architect can create nodes, suggest targeting, and validate your structure.
        </p>
      </div>
    </div>
  );
};
