"use client";

import React from "react";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { RocketIcon } from "@radix-ui/react-icons";
import { motion } from "framer-motion";
import { Attachment } from "@/components/ai-elements/attachments";

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
          className="rounded-full bg-indigo-50 p-4 dark:bg-indigo-950/30"
        >
          <RocketIcon className="h-8 w-8 text-indigo-500" />
        </motion.div>
        <div className="space-y-1">
          <Heading size="4">Select an Ad Account</Heading>
          <Text color="gray">
            Choose an ad account above to start analyzing with Jaina.
          </Text>
        </div>
      </div>
    );
  }

  return (
    <Flex
      direction="column"
      gap="2"
      className="mt-20 items-center justify-center text-center"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        className="rounded-full bg-purple-500/10 p-4 mb-2 cursor-pointer"
      >
        <RocketIcon className="h-8 w-8 text-purple-400" />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <Heading size="5" className="text-white">
          How can Jaina help today?
        </Heading>
        <Text size="2" className="text-gray-400 max-w-sm block mt-1">
          Ask about campaign performance, creative ROAS, or budget optimizations.
        </Text>
      </motion.div>
      <Flex gap="2" mt="4" wrap="wrap" justify="center">
        {[
          "Which creatives improved ROAS week-over-week?",
          "Summarize spend shifts and recommend budget moves.",
          "What audiences are declining?",
        ].map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            onClick={() => onExampleClick?.(s, [])}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-secondary hover:bg-white/10 hover:border-white/20 transition-all"
          >
            {s}
          </motion.button>
        ))}
      </Flex>
    </Flex>
  );
}
