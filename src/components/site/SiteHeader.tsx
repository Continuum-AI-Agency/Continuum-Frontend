'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
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
            {/* Five static links, no popups: <nav>/<ul> carries the same semantics that
                Radix's NavigationMenu was providing here. */}
            <nav className="hidden md:flex" aria-label="Primary navigation">
              <ul className="flex items-center gap-3 text-sm">
                <li>
                  <Link href="#product">Product</Link>
                </li>
                <li>
                  <Link href="#subscribe">Pricing</Link>
                </li>
                <li>
                  <Link href="#solutions">Solutions</Link>
                </li>
                <li>
                  <Link href="#resources">Resources</Link>
                </li>
                <li>
                  <Link href="/oauth/mock">Sign in</Link>
                </li>
              </ul>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/onboarding" className={buttonVariants()}>
                Start now
              </Link>
              <Link
                href="mailto:hello@continuum.ai"
                className={buttonVariants({ variant: 'outline' })}
              >
                Contact sales
              </Link>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
