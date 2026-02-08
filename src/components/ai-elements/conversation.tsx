"use client";

import React from "react";
import { ScrollArea, Button, Flex, Text } from "@radix-ui/themes";
import { ArrowDownIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";

type ConversationProps = {
  children: React.ReactNode;
  className?: string;
};

export function Conversation({ children, className }: ConversationProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (viewportRef.current) {
      const scrollElement = viewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [children]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <ScrollArea
        ref={viewportRef}
        type="always"
        scrollbars="vertical"
        className="h-full w-full"
      >
        {children}
      </ScrollArea>
    </div>
  );
}

type ConversationContentProps = {
  children: React.ReactNode;
  className?: string;
};

export function ConversationContent({ children, className }: ConversationContentProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 md:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}

type ConversationScrollButtonProps = {
  onClick?: () => void; 
};

export function ConversationScrollButton({ onClick }: ConversationScrollButtonProps) {
  return (
    <div className="absolute bottom-4 right-4 z-20">
      <Button
        variant="soft"
        color="gray"
        radius="full"
        className="shadow-lg backdrop-blur-md"
        onClick={onClick}
      >
        <ArrowDownIcon />
      </Button>
    </div>
  );
}

type ConversationEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function ConversationEmptyState({ icon, title, description, children }: ConversationEmptyStateProps) {
  return (
    <Flex direction="column" align="center" justify="center" className="h-full min-h-[300px] gap-4 text-center text-gray-500">
      {icon && <div className="text-gray-400">{icon}</div>}
      <div className="space-y-1">
        <Text size="3" weight="medium" className="text-foreground">
          {title}
        </Text>
        <Text size="2" className="text-muted-foreground">
          {description}
        </Text>
      </div>
      {children}
    </Flex>
  );
}

export function ConversationDownload({ messages }: { messages: any[] }) {
    return null;
}
