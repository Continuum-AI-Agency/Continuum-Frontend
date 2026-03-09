"use client";

import { useState, ElementType } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
import { ChevronRight, LogOut, Moon, Sun } from "lucide-react";
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
import { BrandSwitcher } from "./BrandSwitcher";
import { motion } from "framer-motion";
import { useTheme } from "@/components/theme-provider";

function isRouteActive(currentPath: string, currentSearchParams: URLSearchParams, item: { href: string }) {
  // Exact match for dashboard
  if (item.href === "/dashboard") {
    return currentPath === item.href;
  }

  // If the item has query params (e.g. ?mode=chat), we need to check both path and params
  if (item.href.includes("?")) {
    const [path, query] = item.href.split("?");
    const itemParams = new URLSearchParams(query);
    
    // Path must match
    if (currentPath !== path) return false;

    // All params in the item link must be present in current URL
    for (const [key, value] of itemParams.entries()) {
      if (currentSearchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

interface AnimatedIconProps {
  icon: ElementType<{ className?: string }>;
  isHovered: boolean;
  active?: boolean;
}

function AnimatedIcon({ icon: Icon, isHovered, active }: AnimatedIconProps) {
  return (
    <div className="relative flex items-center justify-center">
      <Icon className={cn(
        "z-10 !h-[18px] !w-[18px] stroke-[1.8] transition-colors duration-200",
        active
          ? "text-[var(--ring)]"
          : "text-[color-mix(in_srgb,var(--sidebar-foreground)_64%,transparent)] group-hover:text-[var(--sidebar-foreground)]"
      )} />
      <motion.div
        className="absolute -bottom-1.5 h-px w-3 rounded-full bg-[var(--ring)]"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ 
          scaleX: isHovered ? 1 : 0, 
          opacity: isHovered ? 1 : 0 
        }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 25,
          mass: 0.5
        }}
        style={{ originX: 0.5 }}
      />
    </div>
  );
}

import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, state, toggleSidebar } = useSidebar();
  const { logout, isPending } = useAuth();
  const { user } = useActiveBrandContext();
  const { appearance, toggle } = useTheme();
  const isAdmin = isAdminUser(user);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[var(--color-border)] bg-[var(--sidebar)] backdrop-blur-xl"
    >
      <SidebarHeader className="flex items-center justify-between px-3">
        <BrandSwitcher />
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[color-mix(in_srgb,var(--sidebar-foreground)_64%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]"
          aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
        >
          <ChevronRight className={cn("h-4 w-4 transition-transform duration-200", state === "expanded" ? "rotate-180" : "")} />
        </button>
      </SidebarHeader>

      <SidebarContent className="px-3 py-6">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2 group-data-[collapsible=icon]:items-center">
              {APP_NAVIGATION.map((item) => {
                const active = isRouteActive(pathname, searchParams, item);
                const hasSubItems = item.items && item.items.length > 0;

                if (hasSubItems) {
                  const isSubActive = item.items?.some(sub => isRouteActive(pathname, searchParams, sub));
                  
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
                                size="lg"
                                isActive={active || isSubActive}
                                onMouseEnter={() => setHoveredHref(item.href)}
                                onMouseLeave={() => setHoveredHref(null)}
                                className={cn(
                                  "group relative transition-colors duration-200 data-[active=true]:bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]",
                                  (active || isSubActive)
                                    ? "text-[var(--sidebar-foreground)]"
                                    : "text-[color-mix(in_srgb,var(--sidebar-foreground)_68%,transparent)]"
                                )}
                              >
                                {(active || isSubActive) ? (
                                  <span
                                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <AnimatedIcon 
                                  icon={item.icon} 
                                  isHovered={hoveredHref === item.href} 
                                  active={active || isSubActive} 
                                />
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
                                    onMouseEnter={() => setHoveredHref(subItem.href)}
                                    onMouseLeave={() => setHoveredHref(null)}
                                    className={cn(
                                       "group relative text-[color-mix(in_srgb,var(--sidebar-foreground)_66%,transparent)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)] data-[active=true]:text-[var(--sidebar-foreground)] data-[active=true]:bg-[color-mix(in_srgb,var(--ring)_14%,transparent)]",
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
                                      {SubIcon && (
                                        <AnimatedIcon 
                                          icon={SubIcon} 
                                          isHovered={hoveredHref === subItem.href} 
                                          active={subActive} 
                                        />
                                      )}
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
                      size="lg"
                      onMouseEnter={() => setHoveredHref(item.href)}
                      onMouseLeave={() => setHoveredHref(null)}
                      className={cn(
                        "group relative transition-colors duration-200 data-[active=true]:bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]",
                        active
                          ? "text-[var(--sidebar-foreground)]"
                          : "text-[color-mix(in_srgb,var(--sidebar-foreground)_68%,transparent)]"
                      )}
                    >
                      <Link href={item.href}>
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <AnimatedIcon 
                          icon={item.icon} 
                          isHovered={hoveredHref === item.href} 
                          active={active} 
                        />
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

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu className="gap-2 group-data-[collapsible=icon]:items-center">
          {APP_NAVIGATION_FOOTER.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const active = isRouteActive(pathname, searchParams, item);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  size="lg"
                  onMouseEnter={() => setHoveredHref(item.href)}
                  onMouseLeave={() => setHoveredHref(null)}
                  className={cn(
                    "group relative transition-colors duration-200 data-[active=true]:bg-[color-mix(in_srgb,var(--ring)_14%,transparent)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]",
                    active
                      ? "text-[var(--sidebar-foreground)]"
                      : "text-[color-mix(in_srgb,var(--sidebar-foreground)_68%,transparent)]"
                  )}
                >
                  <Link href={item.href}>
                    {active ? (
                      <span
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--ring)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    <AnimatedIcon 
                      icon={item.icon} 
                      isHovered={hoveredHref === item.href} 
                      active={active} 
                    />
                    <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
          
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              size="lg"
              disabled={isPending}
              onClick={() => logout()}
              onMouseEnter={() => setHoveredHref("sign-out")}
              onMouseLeave={() => setHoveredHref(null)}
              className="group text-[var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)] hover:text-[var(--destructive)] transition-all duration-200"
            >
              <AnimatedIcon 
                icon={LogOut} 
                isHovered={hoveredHref === "sign-out"} 
                active={false} 
              />
              <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                {isPending ? "Signing out..." : "Sign out"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="my-2 bg-[var(--color-border)]" />
        <SidebarMenu className="gap-2 group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={appearance === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              size="lg"
              onClick={toggle}
              onMouseEnter={() => setHoveredHref("theme-toggle")}
              onMouseLeave={() => setHoveredHref(null)}
              className="group text-[color-mix(in_srgb,var(--sidebar-foreground)_64%,transparent)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)] transition-all duration-200"
            >
              <AnimatedIcon
                icon={appearance === "dark" ? Sun : Moon}
                isHovered={hoveredHref === "theme-toggle"}
                active={false}
              />
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
