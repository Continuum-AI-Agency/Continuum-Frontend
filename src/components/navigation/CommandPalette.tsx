"use client"

import { useRouter } from "next/navigation"
import { MessageSquare, Moon, Network, Sun } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { useTheme } from "@/components/theme-provider"
import { useActiveBrandContext } from "@/components/providers/ActiveBrandProvider"
import { isAdminUser } from "@/lib/brands/brand-switcher-utils"
import { APP_NAVIGATION, APP_NAVIGATION_FOOTER } from "./routes"
import { useCommandPalette } from "./CommandPaletteProvider"

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const router = useRouter()
  const { appearance, toggle } = useTheme()
  const { user } = useActiveBrandContext()
  const isAdmin = isAdminUser(user)

  function run(fn: () => void) {
    setOpen(false)
    fn()
  }

  const footerItems = APP_NAVIGATION_FOOTER.filter((item) => !item.adminOnly || isAdmin)

  return (
    <CommandDialog open={open} onOpenChange={setOpen} showCloseButton={false}>
      <CommandInput placeholder="Go to, search, or run..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {APP_NAVIGATION.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => run(() => router.push(item.href))}
              >
                <Icon />
                {item.label}
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Creative Studio">
          <CommandItem
            value="creative studio chat ai assistant"
            onSelect={() => run(() => router.push("/ai-studio?mode=chat"))}
          >
            <MessageSquare />
            Open Chat
          </CommandItem>
          <CommandItem
            value="creative studio canvas workflow builder"
            onSelect={() => run(() => router.push("/ai-studio?mode=canvas"))}
          >
            <Network />
            Open Canvas
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          {footerItems.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => run(() => router.push(item.href))}
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
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
