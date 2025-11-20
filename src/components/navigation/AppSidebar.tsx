"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.aside
      initial={{ width: 80 }}
      animate={{ width: isHovered ? 240 : 80 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "sidebar-gradient-bg relative hidden h-full shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] md:flex z-20",
      )}
    >
      {/* Header Area */}
      <Box className="h-[72px] flex items-center justify-center border-b border-[var(--color-border)] overflow-hidden px-4">
        <Flex align="center" justify={isHovered ? "start" : "center"} className="w-full">
            <Badge 
              size="2" 
              color="violet" 
              radius="full" 
              className={cn(
                "transition-all duration-300",
                !isHovered && "scale-75 origin-center"
              )}
            >
              {isHovered ? "Continuum" : "C"}
            </Badge>
        </Flex>
      </Box>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto px-3 py-6">
        <Flex direction="column" gap="1">
          {APP_NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center rounded-lg py-2.5 transition-all duration-200 outline-none",
                  "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  isHovered ? "px-3" : "justify-center px-0"
                )}
              >
                {/* Icon Container */}
                <div className={cn(
                    "flex items-center justify-center transition-colors duration-200",
                    active ? "text-[var(--ring)]" : "text-slate-400 group-hover:text-slate-100"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {/* Label (Collapsible) */}
                <AnimatePresence mode="wait">
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="ml-3 flex flex-1 items-center justify-between overflow-hidden whitespace-nowrap"
                    >
                      <Text
                        size="1"
                        weight="medium"
                        className={cn(
                          "transition-colors duration-200",
                          active ? "text-[var(--ring)]" : "text-slate-400 group-hover:text-slate-100"
                        )}
                      >
                        {item.label}
                      </Text>
                      {item.badge && (
                        <Badge size="1" color={item.badge.tone ?? "violet"} radius="full" variant="surface">
                          {item.badge.label}
                        </Badge>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </Flex>
      </nav>

      {/* Footer Area */}
      <Box className="border-t border-[var(--color-border)] p-4">
         <AnimatePresence mode="wait">
            {isHovered ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-slate-500"
                >
                    Need help? <span className="text-[var(--ring)] hover:underline cursor-pointer">Contact Support</span>
                </motion.div>
            ) : (
                <div className="flex justify-center text-slate-600">?</div>
            )}
         </AnimatePresence>
      </Box>
    </motion.aside>
  );
}
