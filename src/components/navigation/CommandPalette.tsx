"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Moon, Sun } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useTheme } from "@/components/theme-provider"
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider"
import { isAdminUser } from "@/lib/brands/brand-switcher-utils"
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER } from "./routes"
import { useCommandPalette } from "./CommandPaletteProvider"

const RECENT_KEY = "continuum:recent-pages"
const MAX_RECENT = 5

type RecentPage = { href: string; label: string }

function readRecent(): RecentPage[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
  } catch {
    return []
  }
}

function saveRecent(pages: RecentPage[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(pages))
  } catch {}
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const router = useRouter()
  const { appearance, toggle } = useTheme()
  const { user, brandSummaries, activeBrandId, selectBrand, isSwitching, switchingToBrandId } =
    useActiveBrandContext()
  const isAdmin = isAdminUser(user)

  const [recentPages, setRecentPages] = React.useState<RecentPage[]>([])

  // Load recent pages when palette opens
  React.useEffect(() => {
    if (open) setRecentPages(readRecent())
  }, [open])

  function run(fn: () => void, recent?: RecentPage) {
    setOpen(false)
    if (recent) {
      const updated = [recent, ...recentPages.filter((p) => p.href !== recent.href)].slice(
        0,
        MAX_RECENT,
      )
      setRecentPages(updated)
      saveRecent(updated)
    }
    fn()
  }

  const footerItems = APP_NAVIGATION_FOOTER.filter((item) => !item.adminOnly || isAdmin)
  const switchableBrands = brandSummaries.filter(
    (b) => b.id !== activeBrandId && !b.isPending,
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} showCloseButton={false}>
      <CommandInput placeholder="Go to, search, or run..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recentPages.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentPages.map((page) => (
                <CommandItem
                  key={page.href}
                  value={`recent ${page.label} ${page.href}`}
                  onSelect={() => run(() => router.push(page.href))}
                >
                  <span className="text-muted-foreground font-mono text-xs">↩</span>
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Navigation">
          {APP_NAVIGATION.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() =>
                  run(() => router.push(item.href), { href: item.href, label: item.label })
                }
              >
                <Icon />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        {switchableBrands.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Switch Brand">
              {switchableBrands.map((brand) => {
                const isPending = isSwitching && switchingToBrandId === brand.id
                return (
                  <CommandItem
                    key={brand.id}
                    value={`switch brand ${brand.name}`}
                    onSelect={() => run(() => void selectBrand(brand.id))}
                    disabled={isSwitching}
                  >
                    {brand.logoUrl ? (
                      <img
                        src={brand.logoUrl}
                        alt=""
                        className="h-4 w-4 rounded-sm object-cover"
                      />
                    ) : (
                      <Building2 />
                    )}
                    {brand.name}
                    {isPending && (
                      <CommandShortcut>
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Settings">
          {footerItems.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() =>
                  run(() => router.push(item.href), { href: item.href, label: item.label })
                }
              >
                <Icon />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            value={`toggle theme ${appearance === "dark" ? "light" : "dark"} mode appearance`}
            onSelect={() => run(toggle)}
          >
            {appearance === "dark" ? <Sun /> : <Moon />}
            {appearance === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
            <CommandShortcut>Theme</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
