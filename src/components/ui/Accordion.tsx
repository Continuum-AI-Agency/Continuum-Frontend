"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import React from "react";
import { motion } from "framer-motion";
import { ChevronDownIcon } from "@radix-ui/react-icons";

export type AccordionItem = {
  value: string;
  header: React.ReactNode;
  content: React.ReactNode;
};

export function Accordion({ items, type = "single", collapsible = true }: { items: AccordionItem[]; type?: "single" | "multiple"; collapsible?: boolean }) {
  const rootProps =
    type === "single"
      ? { type, collapsible }
      : { type };

  return (
    <AccordionPrimitive.Root {...rootProps} className="w-full">
      {items.map((item) => (
        <AccordionPrimitive.Item key={item.value} value={item.value} className="border-b border-gray-200 dark:border-gray-800">
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="w-full flex items-center justify-between py-3 text-left">
              <span className="text-sm font-medium">{item.header}</span>
              <ChevronDownIcon className="transition-transform data-[state=open]:rotate-180" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}

function AccordionContent({ children }: { children: React.ReactNode }) {
  return (
    <AccordionPrimitive.Content forceMount asChild>
      <AnimatedAccordionContent>{children}</AnimatedAccordionContent>
    </AccordionPrimitive.Content>
  );
}

function AnimatedAccordionContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { children, className, ...rest } = props;
  const dataState = (rest as Record<string, unknown>)["data-state"];
  const state = dataState === "open" ? "open" : "closed";

  return (
    <motion.div
      {...rest}
      initial={false}
      animate={state}
      variants={{
        open: { height: "auto", opacity: 1 },
        closed: { height: 0, opacity: 0 },
      }}
      transition={{ type: "tween", duration: 0.2 }}
      className={`overflow-hidden ${className ?? ""}`}
    >
      <div className="py-2 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </motion.div>
  );
}
