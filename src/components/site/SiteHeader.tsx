'use client';

import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ThemeToggle from '../theme-toggle';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/55 dark:bg-black/30 border-b border-white/40 dark:border-white/10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight">
              Continuum AI
            </Link>
            <span className="hidden sm:inline text-sm text-muted-foreground">
              Build, orchestrate, and ship marketing experiences fast
            </span>
          </div>

          <div className="flex items-center gap-4">
            <NavigationMenu.Root className="hidden md:flex" aria-label="Primary navigation">
              <NavigationMenu.List className="flex items-center gap-3 text-sm">
                <NavigationMenu.Item>
                  <NavigationMenu.Link asChild>
                    <Link href="#product">Product</Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item>
                  <NavigationMenu.Link asChild>
                    <Link href="#subscribe">Pricing</Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item>
                  <NavigationMenu.Link asChild>
                    <Link href="#solutions">Solutions</Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item>
                  <NavigationMenu.Link asChild>
                    <Link href="#resources">Resources</Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
                <NavigationMenu.Item>
                  <NavigationMenu.Link asChild>
                    <Link href="/oauth/mock">Sign in</Link>
                  </NavigationMenu.Link>
                </NavigationMenu.Item>
              </NavigationMenu.List>
            </NavigationMenu.Root>

            <div className="flex items-center gap-3">
              <Button asChild>
                <Link href="/onboarding">Start now</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="mailto:hello@continuum.ai">Contact sales</Link>
              </Button>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
