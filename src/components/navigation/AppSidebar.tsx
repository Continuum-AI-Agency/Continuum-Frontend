"use client";

import { Suspense, useState, ElementType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@radix-ui/themes";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
  SidebarFooter,
  SidebarSeparator,
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, LogOut, Moon, Search, Sun } from "lucide-react";
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER } from "./routes";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { isAdminUser } from "@/lib/brands/brand-switcher-utils";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { BrandSwitcher } from "./BrandSwitcher";
import { useTheme } from "@/components/theme-provider";
import { useCommandPalette } from "./CommandPaletteProvider";

function isRouteActive(currentPath: string, currentSearchParams: URLSearchParams, item: { href: string }) {
  if (item.href === "/dashboard") {
    return currentPath === item.href;
  }

  if (item.href.includes("?")) {
    const [path, query] = item.href.split("?");
    const itemParams = new URLSearchParams(query);

    if (currentPath !== path) return false;

    for (const [key, value] of itemParams.entries()) {
      if (currentSearchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

function NavIcon({ icon: Icon, active, accentColor }: { icon: ElementType<{ className?: string }>; active?: boolean; accentColor?: string }) {
  return (
    <Icon
      className={cn(
        "!h-[18px] !w-[18px] stroke-[1.8] transition-colors duration-150",
        active
          ? (accentColor ?? "text-[var(--ring)]")
          : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
      )}
    />
  );
}

import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";

function AppSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isMobile, state, toggleSidebar } = useSidebar();
  const { logout, isPending } = useAuth();
  const { user } = useActiveBrandContext();
  const { appearance, toggle } = useTheme();
  const { setOpen: openPalette } = useCommandPalette();
  const isAdmin = isAdminUser(user);
  const [hoveredQuickTabs, setHoveredQuickTabs] = useState<string | null>(null);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[var(--color-border)] bg-[var(--sidebar)] backdrop-blur-xl"
    >
      <SidebarHeader className="flex items-center justify-between gap-1 overflow-hidden px-3">
        <div className="min-w-0 flex-1">
          <BrandSwitcher />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {state !== "collapsed" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => openPalette(true)}
                    className="flex h-7 w-7 min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-[var(--sidebar-muted-dim)] transition-colors hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]"
                    aria-label="Search (⌘K)"
                  >
                    <Search className="h-[14px] w-[14px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="flex items-center gap-2">
                  Search
                  <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-[10px] font-medium opacity-100">
                    ⌘K
                  </kbd>
                </TooltipContent>
              </Tooltip>
          )}
          <button
            onClick={toggleSidebar}
            className="flex h-7 w-7 min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-[var(--sidebar-muted-dim)] transition-colors hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]"
            aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", state === "expanded" ? "rotate-180" : "")} />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup className="p-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
              {APP_NAVIGATION.map((item) => {
                const active = isRouteActive(pathname, searchParams, item);
                const hasSubItems = item.items && item.items.length > 0;
                const isSubActive = item.items?.some((sub) => isRouteActive(pathname, searchParams, sub)) ?? false;

                if (hasSubItems && item.quickTabs) {
                  const showQuickTabs = state !== "collapsed" && hoveredQuickTabs === item.href;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <div
                        onMouseEnter={() => { router.prefetch(item.href); setHoveredQuickTabs(item.href); }}
                        onMouseLeave={() => setHoveredQuickTabs((current) => (current === item.href ? null : current))}
                        onFocusCapture={() => setHoveredQuickTabs(item.href)}
                        onBlurCapture={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setHoveredQuickTabs((current) => (current === item.href ? null : current));
                          }
                        }}
                        className="group/quick-tabs"
                      >
                        <SidebarMenuButton
                          asChild
                          isActive={active || isSubActive}
                          tooltip={item.label}
                          size="default"
                          className={cn(
                            "group relative transition-colors duration-150 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]",
                            (active || isSubActive)
                              ? "text-[var(--sidebar-foreground)]"
                              : "text-[var(--sidebar-muted)]"
                          )}
                        >
                          <Link href={item.href}>
                            {active || isSubActive ? (
                              <span
                                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                                aria-hidden="true"
                              />
                            ) : null}
                            <NavIcon icon={item.icon} active={active || isSubActive} accentColor={item.accentColor} />
                            <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                              {item.label}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-150 ease-out pl-9 pr-1 group-data-[collapsible=icon]:hidden",
                            showQuickTabs ? "grid-rows-[1fr] opacity-100 pt-1" : "grid-rows-[0fr] opacity-0"
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className="flex flex-wrap gap-1.5">
                              {item.items?.map((subItem) => {
                                const subActive = isRouteActive(pathname, searchParams, subItem);
                                return (
                                  <Button
                                    key={subItem.href}
                                    asChild
                                    size="sm"
                                    variant={subActive ? "secondary" : "outline"}
                                    onMouseEnter={() => router.prefetch(subItem.href)}
                                    className={cn(
                                      "h-6 rounded-md px-2 text-[0.65rem] font-medium tracking-[0.01em]",
                                      subActive
                                        ? "border-[color-mix(in_srgb,var(--ring)_36%,transparent)] bg-[color-mix(in_srgb,var(--ring)_16%,transparent)] text-[var(--sidebar-foreground)]"
                                        : "border-[color-mix(in_srgb,var(--sidebar-foreground)_18%,transparent)] bg-transparent text-[color-mix(in_srgb,var(--sidebar-foreground)_76%,transparent)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]"
                                    )}
                                  >
                                    <Link href={subItem.href}>{subItem.label}</Link>
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                      {item.badge ? (
                        <SidebarMenuBadge className="pointer-events-none">
                          <Badge
                            size="1"
                            color={item.badge.tone ?? "violet"}
                            radius="full"
                            variant="surface"
                          >
                            {item.badge.label}
                          </Badge>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                }

                if (hasSubItems) {
                  return (
                    <Collapsible
                      key={item.href}
                      asChild
                      defaultOpen={active || isSubActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CollapsibleTrigger asChild>
                              <SidebarMenuButton
                                size="default"
                                isActive={active || isSubActive}
                                onMouseEnter={() => router.prefetch(item.href)}
                                className={cn(
                                  "group relative transition-colors duration-150 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]",
                                  (active || isSubActive)
                                    ? "text-[var(--sidebar-foreground)]"
                                    : "text-[var(--sidebar-muted)]"
                                )}
                              >
                                {(active || isSubActive) ? (
                                  <span
                                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <NavIcon icon={item.icon} active={active || isSubActive} accentColor={item.accentColor} />
                                <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                                  {item.label}
                                </span>
                                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
                              </SidebarMenuButton>
                            </CollapsibleTrigger>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            align="center"
                            hidden={state !== "collapsed" || isMobile}
                          >
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                        <CollapsibleContent>
                          <SidebarMenuSub className="group-data-[collapsible=icon]:!flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:m-0 group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:px-0">
                            {item.items?.map((subItem) => {
                              const subActive = isRouteActive(pathname, searchParams, subItem);
                              const SubIcon = subItem.icon;

                              return (
                                <SidebarMenuSubItem key={subItem.href} className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full">
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={subActive}
                                    size="md"
                                    onMouseEnter={() => router.prefetch(subItem.href)}
                                    className={cn(
                                      "group relative text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)] data-[active=true]:text-[var(--sidebar-foreground)] data-[active=true]:bg-[var(--sidebar-active-bg)]",
                                      "group-data-[collapsible=icon]:!flex group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                                    )}
                                  >
                                    <Link href={subItem.href}>
                                      {subActive ? (
                                        <span
                                          className="absolute left-0 top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                                          aria-hidden="true"
                                        />
                                      ) : null}
                                      {SubIcon && <NavIcon icon={SubIcon} active={subActive} accentColor={item.accentColor} />}
                                      <span className="group-data-[collapsible=icon]:hidden text-[0.74rem] font-medium tracking-[0.01em]">{subItem.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      size="default"
                      onMouseEnter={() => router.prefetch(item.href)}
                      className={cn(
                        "group relative transition-colors duration-150 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]",
                        active
                          ? "text-[var(--sidebar-foreground)]"
                          : "text-[var(--sidebar-muted)]"
                      )}
                    >
                      <Link href={item.href}>
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <NavIcon icon={item.icon} active={active} accentColor={item.accentColor} />
                        <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge className="pointer-events-none">
                        <Badge
                          size="1"
                          color={item.badge.tone ?? "violet"}
                          radius="full"
                          variant="surface"
                        >
                          {item.badge.label}
                        </Badge>
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
          {APP_NAVIGATION_FOOTER.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const active = isRouteActive(pathname, searchParams, item);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  size="default"
                  onMouseEnter={() => router.prefetch(item.href)}
                  className={cn(
                    "group relative transition-colors duration-150 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]",
                    active
                      ? "text-[var(--sidebar-foreground)]"
                      : "text-[var(--sidebar-muted)]"
                  )}
                >
                  <Link href={item.href}>
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <NavIcon icon={item.icon} active={active} />
                    <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              size="default"
              disabled={isPending}
              onClick={() => logout()}
              className="group text-[var(--destructive)] hover:bg-[var(--sidebar-destructive-bg)] hover:text-[var(--destructive)] transition-all duration-150"
            >
              <LogOut className="!h-[18px] !w-[18px] stroke-[1.8]" />
              <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                {isPending ? "Signing out..." : "Sign out"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2 bg-[var(--color-border)]" />
        <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={appearance === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              size="default"
              onClick={toggle}
              className="group text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)] transition-all duration-150"
            >
              {appearance === "dark"
                ? <Sun className="!h-[18px] !w-[18px] stroke-[1.8]" />
                : <Moon className="!h-[18px] !w-[18px] stroke-[1.8]" />}
              <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                {appearance === "dark" ? "Light mode" : "Dark mode"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex items-center justify-center w-8">
                <CurrentUserAvatar size={32} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[0.78rem] font-medium tracking-[0.01em]">{user?.user_metadata?.name || "User"}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppSidebar() {
  return (
    <Suspense fallback={null}>
      <AppSidebarInner />
    </Suspense>
  );
}
