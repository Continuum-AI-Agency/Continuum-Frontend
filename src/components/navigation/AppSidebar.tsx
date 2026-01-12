"use client";

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
import { ChevronRightIcon, ExitIcon } from "@radix-ui/react-icons";
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER, type AppNavigationItem } from "./routes";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import { isAdminUser } from "@/lib/brands/brand-switcher-utils";
import { useAuth } from "@/hooks/useAuth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BrandSwitcher } from "./BrandSwitcher";

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

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isMobile, state } = useSidebar();
  const { user } = useSession();
  const { logout, isPending } = useAuth();
  const isAdmin = isAdminUser(user);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[var(--color-border)] bg-slate-950/90 backdrop-blur-xl"
    >
      <SidebarHeader>
        <BrandSwitcher />
      </SidebarHeader>

      <SidebarContent className="px-3 py-6">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2 group-data-[collapsible=icon]:items-center">
              {APP_NAVIGATION.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(pathname, searchParams, item);
                const hasSubItems = item.items && item.items.length > 0;

                if (hasSubItems) {
                  // Check if any sub-item is active to open the accordion
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
                                className={cn(
                                  "transition-all duration-200 data-[active=true]:text-[var(--ring)] data-[active=true]:bg-transparent hover:text-slate-100",
                                  (active || isSubActive) ? "text-[var(--ring)]" : "text-slate-400"
                                )}
                              >
                                <Icon className="!h-5 !w-5" />
                                <span className="group-data-[collapsible=icon]:hidden">
                                  {item.label}
                                </span>
                                <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden" />
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
                                    className={cn(
                                       "text-slate-400 hover:text-slate-100 data-[active=true]:text-[var(--ring)]",
                                       // Override hidden state in icon mode
                                       "group-data-[collapsible=icon]:!flex group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                                    )}
                                  >
                                    <Link href={subItem.href}>
                                      {SubIcon && <SubIcon className="h-4 w-4" />}
                                      <span className="group-data-[collapsible=icon]:hidden">{subItem.label}</span>
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
                      className={cn(
                        "transition-all duration-200 data-[active=true]:text-[var(--ring)] data-[active=true]:bg-transparent hover:text-slate-100",
                         active ? "text-[var(--ring)]" : "text-slate-400"
                      )}
                    >
                      <Link href={item.href}>
                        <Icon className="!h-5 !w-5" />
                        <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
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
          <SidebarMenuItem>
             <SidebarMenuButton
               size="lg"
               className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
             >
                <div className="flex items-center justify-center w-8">
                  <CurrentUserAvatar size={32} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">{user?.user_metadata?.name || "User"}</span>
                  <span className="truncate text-xs">{user?.email}</span>
                </div>
             </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <SidebarSeparator className="my-2 bg-[var(--color-border)]" />
        <SidebarMenu className="gap-2 group-data-[collapsible=icon]:items-center">
          {APP_NAVIGATION_FOOTER.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            const active = isRouteActive(pathname, searchParams, item);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  size="lg"
                  className={cn(
                    "transition-all duration-200 data-[active=true]:text-[var(--ring)] data-[active=true]:bg-transparent hover:text-slate-100",
                     active ? "text-[var(--ring)]" : "text-slate-400"
                  )}
                >
                  <Link href={item.href}>
                    <Icon className="!h-5 !w-5" />
                    <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
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
              className="text-red-400 hover:text-red-300 hover:bg-red-950/20 transition-all duration-200"
            >
              <ExitIcon className="!h-5 !w-5" />
              <span className="group-data-[collapsible=icon]:hidden">
                {isPending ? "Signing out..." : "Sign out"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
