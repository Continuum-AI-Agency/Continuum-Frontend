"use client";

import React, { Suspense } from "react";
import { useSession } from "@/hooks/useSession";
import { usePathname, useSearchParams } from "next/navigation";
import { useToastContext } from "@/components/ui/ToastProvider";
import {
  createDashboardWelcomeToastOptions,
  shouldShowDashboardWelcomeToast,
} from "@/lib/ui/dashboardWelcomeToast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER } from "./navigation/routes";
import { motion, useReducedMotion } from "motion/react";
import { HeaderReplayWalkthroughButton } from "@/components/onboarding/v2/tour/HeaderReplayWalkthroughButton";

function DashboardHeaderInner() {
  useDashboardWelcomeToast();
  useInviteToast();
  const pathname = usePathname();
  
  // Find current route label for breadcrumb
  const allRoutes = [...APP_NAVIGATION, ...APP_NAVIGATION_FOOTER];
  const currentRoute = allRoutes.find(r => r.href === pathname) 
    || allRoutes.flatMap(r => r.items || []).find(sub => sub.href === pathname);

  const breadcrumbLabel = currentRoute?.label || "Dashboard";
  const CurrentIcon = currentRoute?.icon;
  const shouldReduceMotion = useReducedMotion();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_76%,transparent)] px-3 py-1.5">
          <motion.span
            aria-hidden="true"
            className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ring)]"
            animate={
              shouldReduceMotion
                ? undefined
                : { opacity: [1, 0.45, 1], scale: [1, 1.08, 1] }
            }
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          {CurrentIcon ? <CurrentIcon className="h-[15px] w-[15px] text-[var(--ring)]" aria-hidden="true" /> : null}
          <span className="text-[0.78rem] font-medium tracking-[0.01em] text-[var(--color-foreground)]">
            {breadcrumbLabel}
          </span>
        </div>
        <HeaderReplayWalkthroughButton />
      </div>

      <div className="ml-auto flex items-center gap-3">
      </div>
    </header>
  );
}

export function DashboardHeader() {
  return (
    <Suspense
      fallback={
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4" />
      }
    >
      <DashboardHeaderInner />
    </Suspense>
  );
}

function useDashboardWelcomeToast() {
  const pathname = usePathname();
  const toast = useToastContext();
  const { user } = useSession();
  const lastShownKeyRef = React.useRef<string | null>(null);

  const displayName = user?.user_metadata?.name || user?.email?.split("@")[0] || null;

  React.useEffect(() => {
    if (!user) return;
    if (!toast) return;
    if (!shouldShowDashboardWelcomeToast(pathname)) return;

    const key = `${pathname}:${displayName ?? "User"}`;
    if (lastShownKeyRef.current === key) return;
    lastShownKeyRef.current = key;

    toast.show(createDashboardWelcomeToastOptions(displayName ?? "User"));
  }, [displayName, pathname, toast, user]);
}

function useInviteToast() {
  const toast = useToastContext();
  const searchParams = useSearchParams();
  const lastShownKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const inviteStatus = searchParams.get("invite");
    if (!inviteStatus) return;

    const messageParam = searchParams.get("message");
    const key = `${inviteStatus}:${messageParam ?? ""}`;
    if (lastShownKeyRef.current === key) return;
    lastShownKeyRef.current = key;

    if (inviteStatus === "accepted") {
      toast.show({
        title: "Invite accepted",
        description: "You're now a member of this brand.",
        variant: "success",
        durationMs: 6000,
      });
    } else if (inviteStatus === "missing_params") {
      toast.show({
        title: "Invite link incomplete",
        description: "The invite link is missing details. Please request a new invite.",
        variant: "warning",
        durationMs: 6000,
      });
    } else if (inviteStatus === "error") {
      toast.show({
        title: "Invite failed",
        description: messageParam ?? "The invite could not be accepted.",
        variant: "error",
        durationMs: 7000,
      });
    }

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, toast]);
}
