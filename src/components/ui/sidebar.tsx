'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeftIcon, XIcon } from 'lucide-react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { isValidElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SIDEBAR_WIDTH = 'var(--shell-sidebar-w)';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = 'var(--shell-sidebar-w-icon)';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';
// How long the pointer rests on the rail before it opens: longer than a pass on the way elsewhere.
const HOVER_OPEN_DELAY_MS = 150;
// A menu, popover or dialog opened from inside the panel: its trigger stays marked while it is open.
const OPEN_MENU_TRIGGER = '[aria-haspopup][aria-expanded="true"]';
// One spring for the panel and for the room the page makes for it, so a pin moves both edges together.
const SIDEBAR_SPRING = { type: 'spring', bounce: 0, duration: 0.3 } as const;

// '15rem' for 'var(--shell-sidebar-w)': a custom property only interpolates between concrete values.
function resolveWidth(value: string) {
  const name = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
  return name
    ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || value
    : value;
}

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  /** The explicit choice (click, keyboard), hover aside: the width the page makes room for. */
  pinnedOpen: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  // Ephemeral hover-expand is tracked separately from the pinned (click/keyboard)
  // open state so a swallowed `mouseleave` (e.g. a same-document ViewTransition
  // eating the pointer event mid-nav) can be force-reset on route change without
  // disturbing an intentionally pinned-open sidebar. See BUG-198.
  hoverExpanded: boolean;
  setHoverExpanded: (value: boolean) => void;
  collapseHover: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const reduceMotion = useReducedMotion();
    const [openMobile, setOpenMobile] = React.useState(false);
    const cssVars = (style ?? {}) as React.CSSProperties & {
      '--sidebar-width'?: string;
      '--sidebar-width-icon'?: string;
    };
    const providedSidebarWidth = cssVars['--sidebar-width'] ?? SIDEBAR_WIDTH;
    const providedSidebarWidthIcon = cssVars['--sidebar-width-icon'] ?? SIDEBAR_WIDTH_ICON;

    // Pinned open state: the explicit choice made by clicking the trigger or the
    // keyboard shortcut. openProp/setOpenProp allow external control.
    const [_open, _setOpen] = React.useState(defaultOpen);
    const pinnedOpen = openProp ?? _open;
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        const openState = typeof value === 'function' ? value(pinnedOpen) : value;
        if (setOpenProp) {
          setOpenProp(openState);
        } else {
          _setOpen(openState);
        }
      },
      [setOpenProp, pinnedOpen],
    );

    // Ephemeral hover-expand state, kept distinct from pinnedOpen so a lost
    // `mouseleave` can be reset independently (see the type note above).
    const [hoverExpanded, setHoverExpanded] = React.useState(false);
    const collapseHover = React.useCallback(() => setHoverExpanded(false), []);

    // Effective open = pinned OR transiently hovered.
    const open = pinnedOpen || hoverExpanded;

    // Helper to toggle the sidebar. Toggling commits an explicit pinned choice
    // and clears any transient hover-expand so the two states never disagree.
    const toggleSidebar = React.useCallback(() => {
      if (isMobile) {
        setOpenMobile((value) => !value);
        return;
      }
      setOpen(!pinnedOpen);
      setHoverExpanded(false);
    }, [isMobile, setOpen, setOpenMobile, pinnedOpen]);

    // Adds a keyboard shortcut to toggle the sidebar.
    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleSidebar]);

    // We add a state so that we can do data-state="expanded" or "collapsed".
    // This makes it easier to style the sidebar with Tailwind classes.
    const state = open ? 'expanded' : 'collapsed';

    // The width the page makes room for follows the pinned state only: a hover expands the panel
    // OVER the page, so the fixed surfaces that offset by this width stay where they are
    // (PP-DT-H-sidebar-hover-pushes-page: a hover moved the whole page 174 px right). A pin
    // animates it on the panel's own spring: the page edge and every fixed surface placed with
    // --app-sidebar-width travel with the panel edge instead of jumping ahead of it.
    React.useEffect(() => {
      const root = document.documentElement;
      const nextWidth = isMobile
        ? '0px'
        : resolveWidth(pinnedOpen ? providedSidebarWidth : providedSidebarWidthIcon);
      const current = root.style.getPropertyValue('--app-sidebar-width');
      if (!current || isMobile || reduceMotion || current === nextWidth) {
        root.style.setProperty('--app-sidebar-width', nextWidth);
        return;
      }
      const controls = animate(root, { '--app-sidebar-width': nextWidth }, SIDEBAR_SPRING);
      return () => controls.stop();
    }, [isMobile, pinnedOpen, providedSidebarWidth, providedSidebarWidthIcon, reduceMotion]);

    React.useEffect(() => {
      return () => {
        document.documentElement.style.removeProperty('--app-sidebar-width');
      };
    }, []);

    const contextValue = React.useMemo<SidebarContextProps>(
      () => ({
        state,
        open,
        pinnedOpen,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
        hoverExpanded,
        setHoverExpanded,
        collapseHover,
      }),
      [
        state,
        open,
        pinnedOpen,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
        hoverExpanded,
        collapseHover,
      ],
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delay={0}>
          <div
            style={
              {
                '--sidebar-width': SIDEBAR_WIDTH,
                '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              'group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full',
              className,
            )}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  },
);
SidebarProvider.displayName = 'SidebarProvider';

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  }
>(
  (
    {
      side = 'left',
      variant = 'sidebar',
      collapsible = 'offcanvas',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const tUi = useTranslations('common');

    const {
      isMobile,
      state,
      pinnedOpen,
      openMobile,
      setOpenMobile,
      hoverExpanded,
      setHoverExpanded,
    } = useSidebar();
    const reduce = useReducedMotion();
    const isIconCollapsible = collapsible === 'icon';
    // Hover-expand rail: a fixed icon-width footprint with an overlay panel
    // whose width is animated by Motion. Only for the standard icon variant.
    const useHoverWidth = isIconCollapsible && variant !== 'floating' && variant !== 'inset';

    // Hover intent is bound to the panel element itself (below) rather than to
    // document-level pointer geometry: the collapsed rail is always present at
    // left-0, so mouseenter/leave fire reliably. Entering opens only once the
    // pointer has rested on the rail, so passing over it on the way to the top bar
    // does not throw the panel over the page; leave starts a short grace timer so a
    // quick re-entry cancels the collapse without flicker. A menu opened from the panel
    // renders outside it, so while one is open the panel stays open under it, and closes
    // when that menu does if the pointer is no longer on the panel.
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelTimers = React.useCallback(() => {
      for (const timer of [openTimerRef, collapseTimerRef]) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      }
    }, []);
    const handleHoverEnter = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        cancelTimers();
        const panel = event.currentTarget;
        panelRef.current = panel;
        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = null;
          if (panel.matches(':hover')) setHoverExpanded(true);
        }, HOVER_OPEN_DELAY_MS);
      },
      [cancelTimers, setHoverExpanded],
    );
    const scheduleCollapse = React.useCallback(() => {
      cancelTimers();
      collapseTimerRef.current = setTimeout(() => {
        collapseTimerRef.current = null;
        setHoverExpanded(false);
      }, 180);
    }, [cancelTimers, setHoverExpanded]);
    const handleHoverLeave = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        cancelTimers();
        if (!event.currentTarget.querySelector(OPEN_MENU_TRIGGER)) scheduleCollapse();
      },
      [cancelTimers, scheduleCollapse],
    );
    React.useEffect(() => {
      const panel = panelRef.current;
      if (!hoverExpanded || !panel) return;
      const watch = new MutationObserver(() => {
        if (!panel.querySelector(OPEN_MENU_TRIGGER) && !panel.matches(':hover')) scheduleCollapse();
      });
      watch.observe(panel, { subtree: true, attributeFilter: ['aria-expanded'] });
      return () => watch.disconnect();
    }, [hoverExpanded, scheduleCollapse]);
    React.useEffect(() => cancelTimers, [cancelTimers]);
    const hoverHandlers =
      useHoverWidth && !isMobile
        ? { onMouseEnter: handleHoverEnter, onMouseLeave: handleHoverLeave }
        : undefined;

    if (collapsible === 'none') {
      return (
        <div
          className={cn(
            'bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col',
            className,
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0"
            style={
              {
                '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
            showOverlay
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{tUi('m_f5171c931c')}</SheetTitle>
              <SheetDescription>{tUi('m_5800c600e6')}</SheetDescription>
            </SheetHeader>
            {/* Outside the panel, over the scrim: the header's own top-right holds the search button. */}
            <SheetClose
              data-sidebar="mobile-close"
              render={
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn('absolute top-3', side === 'left' ? '-right-12' : '-left-12')}
                />
              }
            >
              <XIcon />
              <span className="sr-only">{tUi('close_7d9eb7a')}</span>
            </SheetClose>
            {/* Picking a destination closes the sheet, so the page it opened is visible. */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: delegation for the links inside, which keep their own roles */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: a link activated from the keyboard fires click, so it bubbles here too */}
            <div
              className="flex h-full w-full flex-col"
              onClick={(event) => {
                if ((event.target as Element).closest('a[href]')) setOpenMobile(false);
              }}
            >
              {children}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer text-sidebar-foreground hidden md:block"
        data-state={state}
        data-pinned={pinnedOpen ? 'expanded' : 'collapsed'}
        data-collapsible={state === 'collapsed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop. On the hover rail it follows the pinned
          state: a hover expands the panel over the page and never moves the page. */}
        <div
          className={cn(
            'relative bg-transparent',
            isIconCollapsible
              ? variant === 'floating' || variant === 'inset'
                ? 'w-[calc(var(--sidebar-width-icon)+(--spacing(4)))] group-data-[state=expanded]:w-(--sidebar-width) transition-[width] duration-200 ease-linear'
                : 'w-[var(--app-sidebar-width,var(--sidebar-width-icon))]'
              : 'w-(--sidebar-width) transition-[width] duration-200 ease-linear',
            !isIconCollapsible && 'group-data-[collapsible=offcanvas]:w-0',
            'group-data-[side=right]:rotate-180',
            !isIconCollapsible && (variant === 'floating' || variant === 'inset')
              ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
              : !isIconCollapsible && 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
          )}
        />
        <motion.div
          animate={
            useHoverWidth
              ? { width: state === 'expanded' ? SIDEBAR_WIDTH : SIDEBAR_WIDTH_ICON }
              : undefined
          }
          initial={false}
          transition={reduce ? { duration: 0 } : SIDEBAR_SPRING}
          className={cn(
            'fixed inset-y-0 z-[45] hidden h-svh md:flex',
            // The rail is the open panel clipped to the icon column, so opening only reveals it: nothing
            // inside re-lays out, and every icon stays where it is.
            useHoverWidth
              ? 'w-(--sidebar-width-icon) overflow-hidden group-data-[state=expanded]:shadow-2xl group-data-[state=expanded]:shadow-black/40'
              : 'w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear',
            side === 'left'
              ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
              : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
            // Adjust the padding for floating and inset variants.
            variant === 'floating' || variant === 'inset'
              ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
              : 'group-data-[side=left]:border-r group-data-[side=right]:border-l',
            !useHoverWidth && 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
            className,
          )}
          {...(props as unknown as React.ComponentProps<typeof motion.div>)}
          {...hoverHandlers}
        >
          <div
            data-sidebar="sidebar"
            className={cn(
              'bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full flex-col overflow-x-hidden group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm',
              useHoverWidth ? 'w-(--sidebar-width) shrink-0' : 'w-full',
            )}
          >
            {children}
          </div>
        </motion.div>
      </div>
    );
  },
);
Sidebar.displayName = 'Sidebar';

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const uiText = useTranslations('common');
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn('size-7', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">{uiText('toggle_sidebar_1d4c17d')}</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, ...props }, ref) => {
    const uiText = useTranslations('common');
    const { toggleSidebar } = useSidebar();

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label={uiText('toggle_sidebar_1d4c17d')}
        tabIndex={-1}
        onClick={toggleSidebar}
        title={uiText('toggle_sidebar_1d4c17d')}
        className={cn(
          'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
          'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
          '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
          'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
          '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
          '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarRail.displayName = 'SidebarRail';

// A layout box, not a landmark. The <main> landmark belongs to the scrolling
// content region inside it, which excludes the app header.
const SidebarInset = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('bg-background relative flex w-full flex-1 flex-col', className)}
        {...props}
      />
    );
  },
);
SidebarInset.displayName = 'SidebarInset';

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn('bg-background h-8 w-full shadow-none', className)}
      {...props}
    />
  );
});
SidebarInput.displayName = 'SidebarInput';

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="header"
        className={cn('flex flex-col gap-2 p-2', className)}
        {...props}
      />
    );
  },
);
SidebarHeader.displayName = 'SidebarHeader';

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="footer"
        className={cn('flex flex-col gap-2 p-2', className)}
        {...props}
      />
    );
  },
);
SidebarFooter.displayName = 'SidebarFooter';

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn('bg-sidebar-border mx-2 w-auto', className)}
      {...props}
    />
  );
});
SidebarSeparator.displayName = 'SidebarSeparator';

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="content"
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarContent.displayName = 'SidebarContent';

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="group"
        className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
        {...props}
      />
    );
  },
);
SidebarGroup.displayName = 'SidebarGroup';

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  // Base UI has no Slot; useRender is its equivalent and preserves the `asChild` API.
  const { children, ...rest } = props;
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(
          'text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
          'group-data-[collapsible=icon]:opacity-0',
          className,
        ),
      },
      asChild ? rest : props,
    ),
    ref,
    render: asChild && isValidElement(children) ? children : undefined,
    state: { sidebar: 'group-label' },
  });
});
SidebarGroupLabel.displayName = 'SidebarGroupLabel';

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  // Base UI has no Slot; useRender is its equivalent and preserves the `asChild` API.
  const { children, ...rest } = props;
  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(
      {
        className: cn(
          'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
          // Increases the hit area of the button on mobile.
          'after:absolute after:-inset-2 md:after:hidden',
          'group-data-[collapsible=icon]:invisible',
          className,
        ),
      },
      asChild ? rest : props,
    ),
    ref,
    render: asChild && isValidElement(children) ? children : undefined,
    state: { sidebar: 'group-action' },
  });
});
SidebarGroupAction.displayName = 'SidebarGroupAction';

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="group-content"
        className={cn('w-full text-sm', className)}
        {...props}
      />
    );
  },
);
SidebarGroupContent.displayName = 'SidebarGroupContent';

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => {
    return (
      <ul
        ref={ref}
        data-sidebar="menu"
        className={cn('flex w-full min-w-0 flex-col gap-1', className)}
        {...props}
      />
    );
  },
);
SidebarMenu.displayName = 'SidebarMenu';

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => {
    return (
      <li
        ref={ref}
        data-sidebar="menu-item"
        className={cn('group/menu-item relative', className)}
        {...props}
      />
    );
  },
);
SidebarMenuItem.displayName = 'SidebarMenuItem';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-has-data-[sidebar=menu-badge]/menu-item:pr-7 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(
  (
    {
      asChild = false,
      isActive = false,
      variant = 'default',
      size = 'default',
      tooltip,
      className,
      ...props
    },
    ref,
  ) => {
    const { isMobile, state } = useSidebar();
    // Base UI has no Slot; useRender is its equivalent and preserves the `asChild` API.
    const { children, ...rest } = props;
    const button = useRender({
      defaultTagName: 'button',
      props: mergeProps<'button'>(
        { className: cn(sidebarMenuButtonVariants({ variant, size }), className) },
        asChild ? rest : props,
      ),
      // Base UI triggers (Menu, Tooltip, Popover) reach their anchor element through
      // this ref. Dropping it leaves the trigger anchorless: tooltips never open on
      // hover and menu popups lose their positioning reference.
      ref,
      render: asChild && isValidElement(children) ? children : undefined,
      state: { sidebar: 'menu-button', size, active: isActive },
    });

    if (!tooltip) {
      return button;
    }

    if (typeof tooltip === 'string') {
      tooltip = {
        children: tooltip,
      };
    }

    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== 'collapsed' || isMobile}
          {...tooltip}
        />
      </Tooltip>
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  // Base UI has no Slot; useRender is its equivalent and preserves the `asChild` API.
  const { children, ...rest } = props;
  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(
      {
        className: cn(
          'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
          // Increases the hit area of the button on mobile.
          'after:absolute after:-inset-2 md:after:hidden',
          'peer-data-[size=sm]/menu-button:top-1',
          'peer-data-[size=default]/menu-button:top-1.5',
          'peer-data-[size=lg]/menu-button:top-2.5',
          'group-data-[collapsible=icon]:invisible',
          showOnHover &&
            'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
          className,
        ),
      },
      asChild ? rest : props,
    ),
    ref,
    render: asChild && isValidElement(children) ? children : undefined,
    state: { sidebar: 'menu-action' },
  });
});
SidebarMenuAction.displayName = 'SidebarMenuAction';

const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-sidebar="menu-badge"
        className={cn(
          'text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none',
          'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
          'peer-data-[size=sm]/menu-button:top-1',
          'peer-data-[size=default]/menu-button:top-1.5',
          'peer-data-[size=lg]/menu-button:top-2.5',
          'group-data-[collapsible=icon]:invisible',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuBadge.displayName = 'SidebarMenuBadge';

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  // Fixed deterministic width to avoid hydration mismatch in server/client rendering.
  const width = React.useMemo(() => {
    return '72%';
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar="menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      {...props}
    >
      {showIcon ? <Skeleton className="size-4 rounded-sm" /> : null}
      <Skeleton className="h-4 rounded" style={{ width }} />
    </div>
  );
});
SidebarMenuSkeleton.displayName = 'SidebarMenuSkeleton';

const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => {
    return (
      <ul
        ref={ref}
        data-sidebar="menu-sub"
        className={cn(
          'border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5',
          'group-data-[collapsible=icon]:invisible',
          className,
        )}
        {...props}
      />
    );
  },
);
SidebarMenuSub.displayName = 'SidebarMenuSub';

const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => {
    return (
      <li
        ref={ref}
        data-sidebar="menu-sub-item"
        className={cn('group/menu-sub-item relative', className)}
        {...props}
      />
    );
  },
);
SidebarMenuSubItem.displayName = 'SidebarMenuSubItem';

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<'a'> & {
    asChild?: boolean;
    size?: 'sm' | 'md';
    isActive?: boolean;
  }
>(({ asChild = false, size = 'md', isActive = false, className, ...props }, ref) => {
  // Base UI has no Slot; useRender is its equivalent and preserves the `asChild` API.
  const { children, ...rest } = props;
  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>(
      {
        className: cn(
          'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
          'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
          size === 'sm' && 'text-xs',
          size === 'md' && 'text-sm',
          'group-data-[collapsible=icon]:invisible',
          className,
        ),
      },
      asChild ? rest : props,
    ),
    ref,
    render: asChild && isValidElement(children) ? children : undefined,
    state: { sidebar: 'menu-sub-button', size, active: isActive },
  });
});
SidebarMenuSubButton.displayName = 'SidebarMenuSubButton';

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
