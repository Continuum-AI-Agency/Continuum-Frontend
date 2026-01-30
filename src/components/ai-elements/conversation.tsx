"use client";

import React from "react";
import { ScrollArea } from "@radix-ui/themes";

type ConversationProps = {
  children: React.ReactNode;
};

export function Conversation({ children }: ConversationProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (viewportRef.current) {
      const scrollElement = viewportRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [children]);

  return (
    <ScrollArea
      ref={viewportRef}
      type="always"
      scrollbars="vertical"
      className="h-full w-full"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4">
        {children}
      </div>
    </ScrollArea>
  );
}
