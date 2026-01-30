"use client";

import React from "react";
import { Avatar, Box, Flex, Text } from "@radix-ui/themes";
import { cn } from "@/lib/utils";

type MessageProps = {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
};

export function Message({ role, children }: MessageProps) {
  const isUser = role === "user";

  return (
    <Flex
      gap="3"
      direction={isUser ? "row-reverse" : "row"}
      className={cn("w-full", isUser ? "justify-end" : "justify-start")}
    >
      <Avatar
        size="2"
        radius="full"
        fallback={isUser ? "U" : "J"}
        color={isUser ? "gray" : "purple"}
        variant="soft"
        className="mt-1 shrink-0 shadow-sm"
      />
      <Box
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm",
          isUser
            ? "bg-gray-200 text-gray-900 rounded-tr-sm"
            : "border border-white/10 bg-white/5 text-gray-200 rounded-tl-sm"
        )}
      >
        {children}
      </Box>
    </Flex>
  );
}
