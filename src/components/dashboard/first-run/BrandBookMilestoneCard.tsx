import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';
import { localizeDashboardCopy } from '@/i18n/dashboardCopy';
// Home Brand Book milestone card (IMP-005 — SURFACE only). The materialization
// pipeline already ships; this card surfaces its state on Home and explains the
// downstream payoff (voice, creative, trends, reporting) so the "aha" is not
// buried in Settings. It reuses the readiness ScoreBadge, the state-kit
// EmptyState, and the shared freshness adapter — it does not own generation, it
// links into the existing Brand Book flow.

import { BookOpenText, Loader2 } from 'lucide-react';
import { ScoreBadge } from '@/components/onboarding/v2/readiness/ScoreBadge';
import { EmptyState } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { freshnessFromSyncedAt } from '@/lib/freshness/freshnessMeta';
import type { DashboardSetupState } from './setupState';
import { SETTINGS_BRAND_BOOK_HREF } from './setupState';

const BRAND_BOOK_UNLOCKS = [
  'On-brand voice across every agent',
  'Grounded creative and content drafts',
  'Sharper trend and audience targeting',
  'Readiness scoring and reporting',
] as const;

function formatAge(seconds: number | null, locale: string): string | null {
  if (seconds === null) return null;
  const fmt = new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: 'short',
  });
  if (seconds < 60) return fmt.format(0, 'second');
  if (seconds < 3600) return fmt.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return fmt.format(-Math.floor(seconds / 3600), 'hour');
  return fmt.format(-Math.floor(seconds / 86400), 'day');
}

function ViewButton() {
  const uiText = useTranslations('dashboard');
  return (
    <Link
      href={SETTINGS_BRAND_BOOK_HREF}
      data-testid="brand-book-milestone-view"
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
    >
      {uiText('view_brand_book_4ca9331')}
    </Link>
  );
}

function GenerateButton() {
  const uiText = useTranslations('dashboard');
  return (
    <Link
      href={SETTINGS_BRAND_BOOK_HREF}
      data-testid="brand-book-milestone-generate"
      className={buttonVariants({ size: 'sm' })}
    >
      {uiText('generate_brand_book_ccb6169')}
    </Link>
  );
}

export function BrandBookMilestoneCard({
  setup,
  refreshedAt,
}: {
  setup: DashboardSetupState;
  refreshedAt: string | null;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  const uiText = useTranslations('dashboard');
  const uiLocale = useLocale();
  if (setup.brandBookStatus === 'assembling') {
    return (
      <section
        aria-label={uiText('brand_book_5c9844e')}
        data-testid="brand-book-milestone"
        className="flex items-center gap-3 p-[var(--card-pad)]"
      >
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-muted-foreground"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {uiText('assembling_your_brand_book_0c91a49')}
          </p>
          <p className="text-xs text-muted-foreground">
            {uiText('we_are_composing_your_brand_identity_this_unl_6c48333')}
          </p>
        </div>
      </section>
    );
  }

  if (!setup.brandBookReady) {
    return (
      <section
        aria-label={uiText('brand_book_5c9844e')}
        data-testid="brand-book-milestone"
        className="p-[var(--card-pad)]"
      >
        <EmptyState
          headline={localizeDashboardCopy('Generate your Brand Book', uiText)}
          media={<BookOpenText aria-hidden="true" className="size-5" />}
          description={uiText('your_living_brand_identity_the_foundation_eve_e696841')}
          unlocks={BRAND_BOOK_UNLOCKS.map((label) => localizeDashboardCopy(label, uiText))}
          action={<GenerateButton />}
        />
      </section>
    );
  }

  const age = formatAge(freshnessFromSyncedAt(refreshedAt).cache_age_seconds, uiLocale);

  return (
    <section
      aria-label={uiText('brand_book_5c9844e')}
      data-testid="brand-book-milestone"
      className="p-[var(--card-pad)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <BookOpenText
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {betaUiText('beta_54c3c3319fcb')}
              </p>
              {setup.readiness ? (
                <ScoreBadge label={betaUiText('beta_d53d98c17749')} score={setup.readiness.score} />
              ) : (
                // Never scored is not a 0: said as onboarding says it, in a muted badge.
                <Badge variant="muted" className="gap-1.5" data-testid="readiness-not-scored">
                  <span className="font-medium">{betaUiText('beta_d53d98c17749')}</span>
                  <span>{betaUiText('beta_94dbf1f3d52c')}</span>
                </Badge>
              )}
            </div>
            {setup.readiness?.next_action ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{uiText('next_5693e77')}</span>
                {setup.readiness.next_action}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {uiText('voice_creative_trends_and_reporting_are_groun_6331cae')}
              </p>
            )}
            {/* The ink token at full strength: at 80% it measured 4.03:1 on the page
                (PP-DT-H-first-run-checklist-contrast). */}
            {age ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {betaUiText('beta_3a5ecca188c0')} {age}
              </p>
            ) : null}
          </div>
        </div>
        <ViewButton />
      </div>
    </section>
  );
}
