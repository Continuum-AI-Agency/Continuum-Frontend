"use client";

import { Flex } from "@radix-ui/themes";
import React from "react";
import { useSession } from "@/hooks/useSession";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";
import { ActiveUsersStack } from "./presence/ActiveUsersStack";
import { usePathname } from "next/navigation";
import { useToastContext } from "@/components/ui/ToastProvider";
import {
  createDashboardWelcomeToastOptions,
  shouldShowDashboardWelcomeToast,
} from "@/lib/ui/dashboardWelcomeToast";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER } from "./navigation/routes";

export function DashboardHeader() {
  useDashboardWelcomeToast();
  const pathname = usePathname();
  
  // Find current route label for breadcrumb
  const allRoutes = [...APP_NAVIGATION, ...APP_NAVIGATION_FOOTER];
  const currentRoute = allRoutes.find(r => r.href === pathname) 
    || allRoutes.flatMap(r => r.items || []).find(sub => sub.href === pathname);

  const breadcrumbLabel = currentRoute?.label || "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b border-[var(--color-border)] px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/dashboard">
                Continuum
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="ml-auto flex items-center gap-3">
         <ActiveUsersStack />
         <BrandSwitcherMenu triggerId="dashboard-brand-menu-trigger" />
      </div>
    </header>
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
