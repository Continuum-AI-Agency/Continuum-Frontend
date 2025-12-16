"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import React from "react";
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
    <AccordionPrimitive.Content
      forceMount
      className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
    >
      <div className="py-2 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </AccordionPrimitive.Content>
  );
}
