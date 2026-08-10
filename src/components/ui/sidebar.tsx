'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeftIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import * as React from 'react';
import { isValidElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
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

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
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
    const [openMobile, setOpenMobile] = React.useState(false);
    const cssVars = (style ?? {}) as React.CSSProperties & {
      '--sidebar-width'?: string;
      '--sidebar-width-icon'?: string;
    };
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

    React.useEffect(() => {
      const nextWidth = isMobile ? '0px' : providedSidebarWidthIcon;
      document.documentElement.style.setProperty('--app-sidebar-width', nextWidth);
    }, [isMobile, providedSidebarWidthIcon]);

    React.useEffect(() => {
      return () => {
        document.documentElement.style.removeProperty('--app-sidebar-width');
      };
    }, []);

    const contextValue = React.useMemo<SidebarContextProps>(
      () => ({
        state,
        open,
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
    const { isMobile, state, openMobile, setOpenMobile, setHoverExpanded } = useSidebar();
    const reduce = useReducedMotion();
    const isIconCollapsible = collapsible === 'icon';
    // Hover-expand rail: a fixed icon-width footprint with an overlay panel
    // whose width is animated by Motion. Only for the standard icon variant.
    const useHoverWidth = isIconCollapsible && variant !== 'floating' && variant !== 'inset';

    // Hover intent is bound to the panel element itself (below) rather than to
    // document-level pointer geometry: the collapsed rail is always present at
    // left-0, so mouseenter/leave fire reliably. Leave starts a short grace
    // timer so a quick re-entry cancels the collapse without flicker.
    const collapseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelCollapse = React.useCallback(() => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    }, []);
    const handleHoverEnter = React.useCallback(() => {
      cancelCollapse();
      setHoverExpanded(true);
    }, [cancelCollapse, setHoverExpanded]);
    const handleHoverLeave = React.useCallback(() => {
      cancelCollapse();
      collapseTimerRef.current = setTimeout(() => {
        collapseTimerRef.current = null;
        setHoverExpanded(false);
      }, 180);
    }, [cancelCollapse, setHoverExpanded]);
    React.useEffect(() => cancelCollapse, [cancelCollapse]);
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
            className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
            style={
              {
                '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Sidebar</SheetTitle>
              <SheetDescription>Displays the mobile sidebar.</SheetDescription>
            </SheetHeader>
            <div className="flex h-full w-full flex-col">{children}</div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="group peer text-sidebar-foreground hidden md:block"
        data-state={state}
        data-collapsible={state === 'collapsed' ? collapsible : ''}
        data-variant={variant}
        data-side={side}
      >
        {/* This is what handles the sidebar gap on desktop */}
        <div
          className={cn(
            'relative bg-transparent',
            isIconCollapsible
              ? variant === 'floating' || variant === 'inset'
                ? 'w-[calc(var(--sidebar-width-icon)+(--spacing(4)))] group-data-[state=expanded]:w-(--sidebar-width) transition-[width] duration-200 ease-linear'
                : 'w-(--sidebar-width-icon)'
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
          transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.3 }}
          className={cn(
            'fixed inset-y-0 z-[45] hidden h-svh md:flex',
            useHoverWidth
              ? 'w-(--sidebar-width-icon) group-data-[state=expanded]:shadow-2xl group-data-[state=expanded]:shadow-black/40'
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
            className="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col overflow-x-hidden group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
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
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label="Toggle Sidebar"
        tabIndex={-1}
        onClick={toggleSidebar}
        title="Toggle Sidebar"
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
          'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
          className,
        ),
      },
      asChild ? rest : props,
    ),
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
          'group-data-[collapsible=icon]:hidden',
          className,
        ),
      },
      asChild ? rest : props,
    ),
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
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-has-data-[sidebar=menu-badge]/menu-item:pr-7 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
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
          'group-data-[collapsible=icon]:hidden',
          showOnHover &&
            'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
          className,
        ),
      },
      asChild ? rest : props,
    ),
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
          'group-data-[collapsible=icon]:hidden',
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
          'group-data-[collapsible=icon]:hidden',
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
          'group-data-[collapsible=icon]:hidden',
          className,
        ),
      },
      asChild ? rest : props,
    ),
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
