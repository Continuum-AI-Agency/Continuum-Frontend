"use client"

import * as React from "react"
import { ChevronsUpDown, Plus, Layers, Moon, Sun, Monitor, Settings, CreditCard, LogOut } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions"
import { getBrandMenuItemLabel } from "@/lib/brands/brand-switcher-utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function BrandSwitcher() {
  const { isMobile } = useSidebar()
  const { activeBrandId, brandSummaries, selectBrand } = useActiveBrandContext()
  const { setTheme, theme } = useTheme()
  const router = useRouter()
  const [isCreating, startCreate] = React.useTransition()

  const activeBrand = brandSummaries.find(b => b.id === activeBrandId) || brandSummaries[0]

  // Map brands to teams structure for consistency with the design pattern
  // In a real app we might have logos stored, here we fallback
  const brands = brandSummaries.map(brand => ({
    name: getBrandMenuItemLabel(brand),
    logo: Layers,
    plan: "Enterprise", // Placeholder
    id: brand.id
  }))

  const activeTeam = brands.find(b => b.id === activeBrandId) || brands[0]

  if (!activeTeam) {
    return null
  }

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <activeTeam.logo className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{activeTeam.name}</span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Brands
            </DropdownMenuLabel>
            <div className="max-h-[200px] overflow-y-auto">
              {brands.map((brand, index) => (
                <DropdownMenuItem
                  key={brand.id}
                  onClick={() => selectBrand(brand.id)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <brand.logo className="size-4 shrink-0" />
                  </div>
                  {brand.name}
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
               className="gap-2 p-2"
               disabled={isCreating}
               onClick={() => {
                  startCreate(async () => {
                     await createBrandProfileAction();
                  })
               }}
            >
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add brand</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
