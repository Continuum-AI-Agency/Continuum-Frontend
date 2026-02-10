"use client";

import React from "react";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";
import { motion } from "framer-motion";
import { Attachment } from "@/components/ai-elements/attachments";

import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";

type JainaEmptyStateProps = {
  adAccountId: string | null;
  onExampleClick?: (query: string, attachments: Attachment[]) => void;
};

export function JainaEmptyState({
  adAccountId,
  onExampleClick,
}: JainaEmptyStateProps) {
  if (!adAccountId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="rounded-full bg-indigo-50/5 p-4 border border-indigo-500/20 backdrop-blur-sm shadow-[0_0_20px_rgba(79,70,229,0.1)]"
        >
          <RocketIcon className="h-8 w-8 text-indigo-400" />
        </motion.div>
        <div className="space-y-1">
          <Heading size="4" className="text-primary font-bold tracking-tight">Select an Ad Account</Heading>
          <Text color="gray" size="2">
            Choose an ad account above to start analyzing with Jaina.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <Flex
      direction="column"
      gap="4"
      className="mt-20 items-center justify-center text-center"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        className="rounded-full bg-purple-500/10 p-4 mb-2 cursor-pointer border border-purple-500/20 shadow-lg shadow-purple-500/5"
      >
        <RocketIcon className="h-10 w-10 text-purple-400" />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="space-y-2"
      >
        <Heading size="6" className="text-white tracking-tight font-bold">
          How can Jaina help today?
        </Heading>
        <Text size="2" className="text-secondary max-w-sm block opacity-70">
          Ask about campaign performance, creative ROAS, or budget optimizations.
        </Text>
      </motion.div>

      <div className="mt-6 w-full max-w-lg">
        <Suggestions className="justify-center">
          {[
            "Which creatives improved ROAS week-over-week?",
            "Summarize spend shifts and recommend budget moves.",
            "What audiences are declining?",
          ].map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              <Suggestion
                suggestion={s}
                onClick={(q) => onExampleClick?.(q, [])}
                className="bg-white/5 border-white/10 text-secondary hover:bg-white/10 h-auto py-2 px-6"
              />
            </motion.div>
          ))}
        </Suggestions>
      </div>
    </Flex>
  );
}
