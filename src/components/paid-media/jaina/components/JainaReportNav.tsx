"use client";

import { Box, Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { id: "executive-summary", label: "Executive Summary" },
  { id: "performance-snapshot", label: "Performance" },
  { id: "key-trends", label: "Key Trends" },
  { id: "strategic-recommendations", label: "Strategic Recommendations" },
  { id: "follow-up-questions", label: "Follow-up" },
];

export function JainaReportNav() {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -35% 0px" }
    );

    NAV_ITEMS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <Box className="hidden lg:block sticky top-4 w-64 shrink-0 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-4">
      <Flex direction="column" gap="2">
        <Text size="2" weight="bold" className="mb-2 text-gray-400 uppercase tracking-wider">
          Contents
        </Text>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollToSection(item.id)}
            className={`text-left text-sm py-1.5 px-3 rounded-md transition-colors ${
              activeId === item.id
                ? "bg-accent-a3 text-accent-11 font-medium"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </Flex>
    </Box>
  );
}
