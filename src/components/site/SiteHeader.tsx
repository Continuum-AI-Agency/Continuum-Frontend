'use client';

import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import ThemeToggle from '../theme-toggle';

export function SiteHeader() {
  const uiText = useTranslations('public');
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/55 dark:bg-black/30 border-b border-white/40 dark:border-white/10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight">
              Continuum AI
            </Link>
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {uiText('build_orchestrate_and_ship_marketing_experien_2daca65')}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Five static links, no popups: <nav>/<ul> carries the same semantics that
                Radix's NavigationMenu was providing here. */}
            <nav className="hidden md:flex" aria-label={uiText('primary_navigation_e1bfe7e')}>
              <ul className="flex items-center gap-3 text-sm">
                <li>
                  <Link href="#product">{uiText('product_fb9ef89')}</Link>
                </li>
                <li>
                  <Link href="#subscribe">{uiText('pricing_dfe9578')}</Link>
                </li>
                <li>
                  <Link href="#solutions">{uiText('solutions_900fe12')}</Link>
                </li>
                <li>
                  <Link href="#resources">{uiText('resources_e89b30a')}</Link>
                </li>
                <li>
                  <Link href="/oauth/mock">{uiText('sign_in_bfd402b')}</Link>
                </li>
              </ul>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/onboarding" className={buttonVariants()}>
                {uiText('start_now_9ff3a61')}
              </Link>
              <Link
                href="mailto:hello@continuum.ai"
                className={buttonVariants({ variant: 'outline' })}
              >
                {uiText('contact_sales_604abea')}
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
