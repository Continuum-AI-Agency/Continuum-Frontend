"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Box, Flex } from "@radix-ui/themes";
import { motion } from "framer-motion";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect } from "react";
import type { AppNavigationItem } from "./routes";
import { APP_NAVIGATION } from "./routes";
import { cn } from "@/lib/utils";

function isRouteActive(currentPath: string, item: AppNavigationItem) {
  if (item.href === "/dashboard") {
    return currentPath === item.href;
  }
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const collapsedWidth = 88;

  useEffect(() => {
    // Reserve space for max width so content never shifts when expanding.
    const previous = document.body.style.paddingLeft;
    document.body.style.paddingLeft = `${collapsedWidth}px`;
    return () => {
      document.body.style.paddingLeft = previous;
    };
  }, [collapsedWidth]);

  return (
    <Tooltip.Provider delayDuration={200}>
    <motion.aside
      initial={{ width: collapsedWidth }}
      animate={{ width: collapsedWidth }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={cn(
        "sidebar-gradient-bg fixed left-0 top-0 bottom-0 hidden flex-col overflow-hidden border-r border-[var(--color-border)] md:flex z-30",
        "bg-slate-950/90 backdrop-blur-xl shadow-[8px_0_24px_-12px_rgba(0,0,0,0.65)]"
      )}
    >
      {/* Header Area */}
      <Box className="h-[72px] flex items-center justify-center border-b border-[var(--color-border)] overflow-hidden px-4">
        <Badge
          size="2"
          color="violet"
          radius="full"
          className="transition-all duration-300"
        >
          C
        </Badge>
      </Box>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <Flex direction="column" gap="1">
          {APP_NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(pathname, item);

            return (
              <Tooltip.Root key={item.href} delayDuration={200} disableHoverableContent>
                <Tooltip.Trigger asChild>
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    className={cn(
                      "group relative flex items-center justify-center rounded-lg py-2.5 px-0 transition-all duration-200 outline-none",
                      "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    )}
                  >
                    <div className={cn(
                        "flex items-center justify-center transition-colors duration-200",
                        active ? "text-[var(--ring)]" : "text-slate-400 group-hover:text-slate-100"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {item.badge ? (
                      <Badge size="1" color={item.badge.tone ?? "violet"} radius="full" variant="surface" className="absolute -right-2 -top-1">
                        {item.badge.label}
                      </Badge>
                    ) : null}
                  </Link>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content side="right" className="rounded-md border border-white/10 bg-slate-900/90 px-2 py-1 text-xs text-white shadow-lg" sideOffset={6}>
                    {item.label}
                    <Tooltip.Arrow className="fill-slate-900/90" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
        </Flex>
      </nav>

      {/* Footer Area */}
      <Box className="border-t border-[var(--color-border)] p-4 flex justify-center text-slate-500">
        ?
      </Box>
    </motion.aside>
    </Tooltip.Provider>
  );
}
