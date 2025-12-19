"use client";

import { Flex, IconButton } from "@radix-ui/themes";
import {
  HamburgerMenuIcon,
} from "@radix-ui/react-icons";
import React from "react";
import { useSession } from "@/hooks/useSession";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import { usePathname } from "next/navigation";
import { useToastContext } from "@/components/ui/ToastProvider";
import {
  createDashboardWelcomeToastOptions,
  shouldShowDashboardWelcomeToast,
} from "@/lib/ui/dashboardWelcomeToast";

export function DashboardHeader({
  onOpenMobile,
}: {
  onOpenMobile?: () => void;
}) {
  useDashboardWelcomeToast();

  return (
    <div className="px-4 sm:px-6 pt-3 sm:pt-4">
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" gap="3">
          <div className="sm:hidden">
            <IconButton variant="ghost" onClick={onOpenMobile} aria-label="Open navigation">
              <HamburgerMenuIcon />
            </IconButton>
          </div>

          <Flex align="center" gap="3 sm:gap-4" className="ml-auto">
            <BrandSwitcherMenu triggerId="dashboard-brand-menu-trigger" />
          </Flex>
        </Flex>
      </Flex>
    </div>
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
