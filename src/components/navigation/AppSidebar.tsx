'use client';

import { ChevronRight, Lock, LogOut, Moon, Search, Sun } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import { type ElementType, Suspense, useState } from 'react';
import { CurrentUserAvatar } from '@/components/current-user-avatar';
import { Pill } from '@/components/kibo-ui/pill';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/brands/brand-switcher-utils';
import { cn } from '@/lib/utils';
import { BrandSwitcher } from './BrandSwitcher';
import { useCommandPalette } from './CommandPaletteProvider';
import {
  APP_NAVIGATION_FOOTER,
  APP_NAVIGATION_GROUPS,
  type AppNavigationItem,
  isRouteActive,
} from './routes';

type NavBadgeTone = NonNullable<NonNullable<AppNavigationItem['badge']>['tone']>;

const NAV_BADGE_PILL_VARIANT: Record<NavBadgeTone, ComponentProps<typeof Pill>['variant']> = {
  green: 'success',
  red: 'destructive',
  blue: 'teal',
  violet: 'violet',
};

function NavIcon({
  icon: Icon,
  active,
  accentColor,
}: {
  icon: ElementType<{ className?: string }>;
  active?: boolean;
  accentColor?: string;
}) {
  return (
    <Icon
      className={cn(
        '!h-[18px] !w-[18px] stroke-[1.8] transition-colors duration-150',
        active
          ? (accentColor ?? 'text-[var(--ring)]')
          : 'text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]',
      )}
    />
  );
}

// Active marker pill. Uses the single brand accent (--ring) for every item.
// Per the Singularity system, structural nav chrome stays on one accent;
// per-area identity is carried by the active icon tint, not a colored bar.
// When `layoutId` is shared across a group it becomes a "magic line" that
// glides to the newly-active item on navigation. Centered via inset/my-auto
// (not translate) so the shared-layout animation measures a clean box.
function ActiveMarker({
  className,
  layoutId,
  animate,
}: {
  className?: string;
  layoutId?: string;
  animate?: boolean;
}) {
  const markerClass = cn(
    'pointer-events-none absolute left-0 inset-y-0 my-auto rounded-full bg-[var(--ring)]',
    className,
  );

  if (animate && layoutId) {
    return (
      <motion.span
        aria-hidden="true"
        layoutId={layoutId}
        className={markerClass}
        transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
      />
    );
  }

  return <span aria-hidden="true" className={markerClass} />;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function AppSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isMobile, state } = useSidebar();
  const { logout, isPending } = useAuth();
  const { user } = useActiveBrandContext();
  const { appearance, toggle } = useTheme();
  const { setOpen: openPalette } = useCommandPalette();
  const reduce = useReducedMotion();
  const isAdmin = isAdminUser(user);
  const userDisplayName =
    readString(user?.user_metadata?.full_name) ??
    readString(user?.user_metadata?.name) ??
    readString(user?.email?.split('@')[0]) ??
    'User';
  const [hoveredQuickTabs, setHoveredQuickTabs] = useState<string | null>(null);

  function renderNavItem(item: AppNavigationItem) {
    if (item.disabled) {
      const DisabledIcon = item.icon;
      // Disabled entries always explain themselves: the reason drives both the
      // hover tooltip (visible expanded AND collapsed) and the accessible name,
      // so the entry never reads as an unexplained dead affordance (BUG-009).
      const disabledName = item.disabledReason
        ? `${item.label} (${item.disabledReason})`
        : item.label;
      return (
        <SidebarMenuItem key={item.href}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                aria-disabled="true"
                aria-label={disabledName}
                tabIndex={-1}
                size="default"
                className="group relative cursor-not-allowed opacity-50 text-[var(--sidebar-muted)] hover:bg-transparent hover:text-[var(--sidebar-muted)]"
              >
                <DisabledIcon className="!h-[18px] !w-[18px] stroke-[1.8] text-[var(--sidebar-muted)]" />
                <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                  {item.label}
                </span>
                {item.locked ? (
                  <Lock className="ml-auto !h-3.5 !w-3.5 stroke-[1.8] text-[var(--sidebar-muted-dim)] group-data-[collapsible=icon]:hidden" />
                ) : null}
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              {item.disabledReason ?? item.label}
            </TooltipContent>
          </Tooltip>
          {item.badge ? (
            <SidebarMenuBadge className="pointer-events-none opacity-60">
              <Pill variant={NAV_BADGE_PILL_VARIANT[item.badge.tone ?? 'violet']}>
                {item.badge.label}
              </Pill>
            </SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      );
    }

    const active = isRouteActive(pathname, searchParams, item);
    const hasSubItems = item.items && item.items.length > 0;
    const isSubActive =
      item.items?.some((sub) => isRouteActive(pathname, searchParams, sub)) ?? false;

    if (hasSubItems && item.quickTabs) {
      const showQuickTabs = state !== 'collapsed' && hoveredQuickTabs === item.href;

      return (
        <SidebarMenuItem key={item.href}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: hover/focus reveal is progressive enhancement only; keyboard users reach the sub-routes through the collapsible nav path, so no role is warranted on this wrapper. */}
          <div
            onMouseEnter={() => {
              router.prefetch(item.href);
              setHoveredQuickTabs(item.href);
            }}
            onMouseLeave={() =>
              setHoveredQuickTabs((current) => (current === item.href ? null : current))
            }
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
                'group relative transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]',
                active || isSubActive
                  ? 'text-[var(--sidebar-foreground)]'
                  : 'text-[var(--sidebar-muted)]',
              )}
            >
              <Link href={item.href}>
                {active || isSubActive ? (
                  <ActiveMarker
                    layoutId="nav-active-marker"
                    animate={!reduce}
                    className="h-4 w-0.5"
                  />
                ) : null}
                <NavIcon
                  icon={item.icon}
                  active={active || isSubActive}
                  accentColor={item.accentColor}
                />
                <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                  {item.label}
                </span>
              </Link>
            </SidebarMenuButton>
            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-150 ease-out pl-9 pr-1 group-data-[collapsible=icon]:hidden',
                showQuickTabs ? 'grid-rows-[1fr] opacity-100 pt-1' : 'grid-rows-[0fr] opacity-0',
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
                        variant={subActive ? 'secondary' : 'outline'}
                        onMouseEnter={() => router.prefetch(subItem.href)}
                        className={cn(
                          'h-6 rounded-md px-2 text-[0.65rem] font-medium tracking-[0.01em]',
                          subActive
                            ? 'border-[color-mix(in_srgb,var(--ring)_36%,transparent)] bg-[color-mix(in_srgb,var(--ring)_16%,transparent)] text-[var(--sidebar-foreground)]'
                            : 'border-[color-mix(in_srgb,var(--sidebar-foreground)_18%,transparent)] bg-transparent text-[color-mix(in_srgb,var(--sidebar-foreground)_76%,transparent)] hover:bg-[color-mix(in_srgb,var(--ring)_10%,transparent)] hover:text-[var(--sidebar-foreground)]',
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
              <Pill variant={NAV_BADGE_PILL_VARIANT[item.badge.tone ?? 'violet']}>
                {item.badge.label}
              </Pill>
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
                      'group relative transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]',
                      active || isSubActive
                        ? 'text-[var(--sidebar-foreground)]'
                        : 'text-[var(--sidebar-muted)]',
                    )}
                  >
                    {active || isSubActive ? (
                      <ActiveMarker
                        layoutId="nav-active-marker"
                        animate={!reduce}
                        className="h-4 w-0.5"
                      />
                    ) : null}
                    <NavIcon
                      icon={item.icon}
                      active={active || isSubActive}
                      accentColor={item.accentColor}
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
                hidden={state !== 'collapsed' || isMobile}
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
                    <SidebarMenuSubItem
                      key={subItem.href}
                      className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-full"
                    >
                      <SidebarMenuSubButton
                        asChild
                        isActive={subActive}
                        size="md"
                        onMouseEnter={() => router.prefetch(subItem.href)}
                        className={cn(
                          'group relative text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)] data-[active=true]:text-[var(--sidebar-foreground)] data-[active=true]:bg-[var(--sidebar-active-bg)]',
                          'group-data-[collapsible=icon]:!flex group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0',
                        )}
                      >
                        <Link href={subItem.href}>
                          {subActive ? <ActiveMarker className="h-3 w-0.5" /> : null}
                          {SubIcon && (
                            <NavIcon
                              icon={SubIcon}
                              active={subActive}
                              accentColor={item.accentColor}
                            />
                          )}
                          <span className="group-data-[collapsible=icon]:hidden text-[0.74rem] font-medium tracking-[0.01em]">
                            {subItem.label}
                          </span>
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
            'group relative transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]',
            active ? 'text-[var(--sidebar-foreground)]' : 'text-[var(--sidebar-muted)]',
          )}
        >
          <Link href={item.href}>
            {active ? (
              <ActiveMarker layoutId="nav-active-marker" animate={!reduce} className="h-4 w-0.5" />
            ) : null}
            <NavIcon icon={item.icon} active={active} accentColor={item.accentColor} />
            <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
              {item.label}
            </span>
          </Link>
        </SidebarMenuButton>
        {item.badge ? (
          <SidebarMenuBadge className="pointer-events-none">
            <Pill variant={NAV_BADGE_PILL_VARIANT[item.badge.tone ?? 'violet']}>
              {item.badge.label}
            </Pill>
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    );
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[var(--color-border)] bg-[var(--sidebar)] [view-transition-name:app-sidebar]"
    >
      <LayoutGroup>
        <SidebarHeader className="flex items-center justify-between gap-1 overflow-hidden px-3">
          <div className="min-w-0 flex-1">
            <BrandSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {state !== 'collapsed' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openPalette(true)}
                    className="flex h-7 w-7 min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-[var(--sidebar-muted-dim)] transition-colors hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]"
                    aria-label="Search (⌘K)"
                  >
                    <Search className="h-[14px] w-[14px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="flex items-center gap-2">
                  Search
                  <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1 font-mono text-2xs font-medium opacity-100">
                    ⌘K
                  </kbd>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
          >
            {APP_NAVIGATION_GROUPS.map((group, index) => (
              <SidebarGroup
                key={group.label ?? `group-${index}`}
                className={cn('p-1', index > 0 && 'mt-3 pt-3')}
              >
                {group.label ? (
                  <SidebarGroupLabel className="px-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--sidebar-muted-dim)] group-data-[collapsible=icon]:hidden">
                    {group.label}
                  </SidebarGroupLabel>
                ) : null}
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
                    {group.items.map(renderNavItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </motion.div>
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
                      'group relative transition-[color,background-color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 data-[active=true]:bg-[var(--sidebar-active-bg)] data-[active=true]:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)]',
                      active ? 'text-[var(--sidebar-foreground)]' : 'text-[var(--sidebar-muted)]',
                    )}
                  >
                    <Link href={item.href}>
                      {active ? (
                        <ActiveMarker
                          layoutId="nav-active-marker"
                          animate={!reduce}
                          className="h-4 w-0.5"
                        />
                      ) : null}
                      <NavIcon icon={item.icon} active={active} />
                      <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                        {item.label}
                      </span>
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
                  {isPending ? 'Signing out...' : 'Sign out'}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <SidebarSeparator className="my-2 bg-[var(--color-border)]" />
          <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                size="default"
                onClick={toggle}
                className="group text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-foreground)] transition-all duration-150"
              >
                <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={appearance}
                      initial={reduce ? false : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={
                        reduce ? { opacity: 0 } : { opacity: 0, scale: 0.25, filter: 'blur(4px)' }
                      }
                      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                      className="absolute inset-0 inline-flex items-center justify-center"
                    >
                      {appearance === 'dark' ? (
                        <Sun className="!h-[18px] !w-[18px] stroke-[1.8]" />
                      ) : (
                        <Moon className="!h-[18px] !w-[18px] stroke-[1.8]" />
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="group-data-[collapsible=icon]:hidden text-[0.78rem] font-medium tracking-[0.01em]">
                  {appearance === 'dark' ? 'Light mode' : 'Dark mode'}
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
                  <span className="truncate text-[0.78rem] font-medium tracking-[0.01em]">
                    {userDisplayName}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </LayoutGroup>
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
