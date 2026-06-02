"use client"

import * as React from "react"
import {
  AlertTriangle,
  ChevronsUpDown,
  Loader2,
  Plus,
  Layers
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider"
import { useSwitchBrand } from "@/hooks/useSwitchBrand"
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions"
import { getBrandMenuItemLabel } from "@/lib/brands/brand-switcher-utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function BrandSwitcher() {
  const { isMobile } = useSidebar()
  const { activeBrandId, brandSummaries, isSwitching } = useActiveBrandContext()
  const switchBrand = useSwitchBrand()
  const [isCreating, startCreate] = React.useTransition()
  const [menuOpen, setMenuOpen] = React.useState(false)

  const brands = brandSummaries.map(brand => ({
    name: getBrandMenuItemLabel(brand),
    logo: brand.logoUrl ? brand.logoUrl : Layers,
    id: brand.id,
    completed: brand.completed,
    isPending: brand.isPending
  }))

  const activeTeam = brands.find(b => b.id === activeBrandId) || brands[0]

  if (!activeTeam) {
    return null
  }

  const handleBrandSelect = (brandId: string) => {
    setMenuOpen(false);
    void switchBrand(brandId);
  };

  const TeamLogo = activeTeam.logo;

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="text-[var(--sidebar-foreground)] data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground overflow-hidden">
                {typeof TeamLogo === "string" ? (
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={TeamLogo} alt={activeTeam.name} className="object-cover" />
                    <AvatarFallback className="rounded-lg">{activeTeam.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <TeamLogo className="size-4" />
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[0.78rem] font-medium tracking-[0.01em]">{activeTeam.name}</span>
              </div>
              {isSwitching ? (
                <Loader2 className="ml-auto h-4 w-4 animate-spin text-[var(--ring)] group-data-[collapsible=icon]:hidden" />
              ) : (
                <ChevronsUpDown className="ml-auto text-[color-mix(in_srgb,var(--sidebar-foreground)_64%,transparent)] group-data-[collapsible=icon]:hidden" />
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] text-[var(--popover-foreground)] p-0"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <Command className="bg-transparent text-[var(--popover-foreground)]">
              <CommandInput
                placeholder="Search brands..."
                className="h-9 text-[var(--popover-foreground)] placeholder:text-[color-mix(in_srgb,var(--popover-foreground)_56%,transparent)]"
              />
              <CommandList>
                <CommandEmpty>No brands found.</CommandEmpty>
                <CommandGroup heading="Brands">
                  {brands.map((brand) => (
                    <CommandItem
                      key={brand.id}
                      onSelect={() => handleBrandSelect(brand.id)}
                      className="gap-2 p-2 text-[var(--popover-foreground)] data-[selected=true]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[selected=true]:text-[var(--popover-foreground)]"
                    >
                      <div className="flex size-6 items-center justify-center rounded-sm border overflow-hidden">
                        {typeof brand.logo === "string" ? (
                          <Avatar className="size-6 rounded-sm">
                            <AvatarImage src={brand.logo} alt={brand.name} className="object-cover" />
                            <AvatarFallback className="text-[10px]">{brand.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        ) : (
                          <brand.logo className="size-4 shrink-0" />
                        )}
                      </div>
                      <span className="flex-1 truncate text-[0.8rem]">{brand.name}</span>
                      {!brand.completed && (
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-label="Onboarding incomplete" />
                      )}
                      {brand.isPending && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                          Pending
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    disabled={isCreating}
                    onSelect={() => {
                      startCreate(async () => {
                        await createBrandProfileAction();
                        setMenuOpen(false);
                      });
                    }}
                    className="gap-2 p-2 text-[var(--popover-foreground)] data-[selected=true]:bg-[color-mix(in_srgb,var(--ring)_12%,transparent)] data-[selected=true]:text-[var(--popover-foreground)]"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                      <Plus className="size-4" />
                    </div>
                    <div className="font-medium text-[color-mix(in_srgb,var(--popover-foreground)_70%,transparent)]">Add brand</div>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
