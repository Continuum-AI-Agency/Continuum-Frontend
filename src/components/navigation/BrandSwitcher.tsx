"use client"

import * as React from "react"
import { 
  ChevronsUpDown, 
  Plus, 
  Layers, 
  Moon, 
  Sun, 
  Monitor, 
  Settings, 
  CreditCard, 
  LogOut,
  Search
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import { useRouter } from "next/navigation"
import { createBrandProfileAction } from "@/app/(post-auth)/settings/actions"
import { getBrandMenuItemLabel } from "@/lib/brands/brand-switcher-utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import { useOnboarding } from "@/components/onboarding/providers/OnboardingContext"

export function BrandSwitcher() {
  const { isMobile } = useSidebar()
  const { activeBrandId, brandSummaries, selectBrand } = useActiveBrandContext()
  const router = useRouter()
  const [isCreating, startCreate] = React.useTransition()
  const [menuOpen, setMenuOpen] = React.useState(false)
  
  let onboarding: any = null;
  try { onboarding = useOnboarding(); } catch (e) {}

  const activeBrand = brandSummaries.find(b => b.id === activeBrandId) || brandSummaries[0]

  const brands = brandSummaries.map(brand => ({
    name: getBrandMenuItemLabel(brand),
    logo: brand.logoUrl ? brand.logoUrl : Layers,
    plan: "Enterprise", 
    id: brand.id,
    completed: brand.completed,
    isPending: brand.isPending
  }))

  const activeTeam = brands.find(b => b.id === activeBrandId) || brands[0]

  if (!activeTeam) {
    return null
  }

  const handleBrandSelect = async (brandId: string) => {
    await selectBrand(brandId);
    setMenuOpen(false);
    
    const targetBrand = brandSummaries.find(b => b.id === brandId);
    
    if (targetBrand?.completed && typeof window !== 'undefined' && window.location.pathname.startsWith('/onboarding')) {
      router.push('/dashboard');
    }
  };

  const TeamLogo = activeTeam.logo;

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
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
                <span className="truncate font-semibold">{activeTeam.name}</span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 p-0 rounded-lg overflow-hidden"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <Command className="bg-transparent">
              <CommandInput placeholder="Search brands..." className="h-9" />
              <CommandList>
                <CommandEmpty>No brands found.</CommandEmpty>
                <CommandGroup heading="Brands">
                  {brands.map((brand, index) => (
                    <CommandItem
                      key={brand.id}
                      onSelect={() => handleBrandSelect(brand.id)}
                      className="gap-2 p-2"
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
                      <span className="flex-1 truncate">{brand.name}</span>
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
                    className="gap-2 p-2"
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                      <Plus className="size-4" />
                    </div>
                    <div className="font-medium text-muted-foreground">Add brand</div>
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
