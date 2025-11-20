"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Badge, Flex, Text } from "@radix-ui/themes";
import { APP_NAVIGATION } from "./navigation/routes";

function isRouteActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (next: boolean) => void }) {
  const pathname = usePathname();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/40"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: "tween", duration: 0.2 }}
                className="fixed top-0 left-0 bottom-0 z-[51] w-72 border-r border-[var(--color-border)] bg-[rgba(8,15,30,0.92)] p-5 backdrop-blur-2xl"
              >
                <Flex direction="column" gap="5" className="h-full">
                  <Flex direction="column" gap="2">
                    <Badge size="2" color="violet" radius="full" highContrast>
                      Continuum
                    </Badge>
                    <Text size="2" color="gray">
                      Command Center
                    </Text>
                  </Flex>

                  <nav className="flex-1 overflow-y-auto">
                    <ul className="flex flex-col gap-2">
                      {APP_NAVIGATION.map((item) => {
                        const active = isRouteActive(pathname, item.href);
                      const Icon = item.icon;

                      return (
                          <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => onOpenChange(false)}
                            className={cn(
                                "group relative flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-medium transition-all duration-200",
                                active
                                  ? "border-[rgba(139,92,246,0.45)] bg-[rgba(139,92,246,0.12)] text-white"
                                  : "border-[rgba(148,163,184,0.16)] text-[var(--foreground)] hover:border-[rgba(139,92,246,0.35)] hover:bg-[rgba(139,92,246,0.15)] hover:text-white"
                              )}
                            >
                              <span className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-[rgba(148,163,184,0.08)] text-slate-200 transition-colors duration-200",
                                    active && "border-[rgba(139,92,246,0.45)] bg-[rgba(139,92,246,0.18)] text-white",
                                    "group-hover:border-[rgba(139,92,246,0.35)] group-hover:bg-[rgba(139,92,246,0.15)]"
                            )}
                          >
                                  <Icon className="h-5 w-5" aria-hidden />
                                </span>
                                <span className="flex flex-col gap-1">
                                  <span className="text-base font-medium leading-tight">{item.label}</span>
                                  {item.description && (
                                    <span className="text-xs font-normal text-slate-300">{item.description}</span>
                                  )}
                                </span>
                              </span>
                              {item.badge && (
                                <Badge size="1" color={item.badge.tone ?? "violet"} radius="full" highContrast>
                                  {item.badge.label}
                                </Badge>
                              )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
                </Flex>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}


