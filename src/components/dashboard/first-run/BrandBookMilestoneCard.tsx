// Home Brand Book milestone card (IMP-005 — SURFACE only). The materialization
// pipeline already ships; this card surfaces its state on Home and explains the
// downstream payoff (voice, creative, trends, reporting) so the "aha" is not
// buried in Settings. It reuses the readiness ScoreBadge, the state-kit
// EmptyState, and the shared freshness adapter — it does not own generation, it
// links into the existing Brand Book flow.

import Link from "next/link";
import { BookOpenText, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/shared/state";
import { ScoreBadge } from "@/components/onboarding/v2/readiness/ScoreBadge";
import { Button } from "@/components/ui/button";
import { freshnessFromSyncedAt } from "@/lib/freshness/freshnessMeta";
import type { DashboardSetupState } from "./setupState";
import { SETTINGS_BRAND_BOOK_HREF } from "./setupState";

const BRAND_BOOK_UNLOCKS = [
  "On-brand voice across every agent",
  "Grounded creative and content drafts",
  "Sharper trend and audience targeting",
  "Readiness scoring and reporting",
] as const;

function formatAge(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ViewButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={SETTINGS_BRAND_BOOK_HREF} data-testid="brand-book-milestone-view">
        View Brand Book
      </Link>
    </Button>
  );
}

function GenerateButton() {
  return (
    <Button asChild size="sm">
      <Link href={SETTINGS_BRAND_BOOK_HREF} data-testid="brand-book-milestone-generate">
        Generate Brand Book
      </Link>
    </Button>
  );
}

export function BrandBookMilestoneCard({ setup, refreshedAt }: {
  setup: DashboardSetupState;
  refreshedAt: string | null;
}) {
  if (setup.brandBookStatus === "assembling") {
    return (
      <section
        aria-label="Brand Book"
        data-testid="brand-book-milestone"
        className="flex items-center gap-3 rounded-lg border border-border/70 bg-card p-4"
      >
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Assembling your Brand Book…</p>
          <p className="text-xs text-muted-foreground">
            We are composing your brand identity. This unlocks grounded voice, creative, and reporting.
          </p>
        </div>
      </section>
    );
  }

  if (!setup.brandBookReady) {
    return (
      <section
        aria-label="Brand Book"
        data-testid="brand-book-milestone"
        className="rounded-lg border border-border/70 bg-card p-4"
      >
        <EmptyState
          headline="Generate your Brand Book"
          media={<BookOpenText aria-hidden="true" className="size-5" />}
          description="Your living brand identity — the foundation everything else builds on."
          unlocks={BRAND_BOOK_UNLOCKS}
          action={<GenerateButton />}
        />
      </section>
    );
  }

  const age = formatAge(freshnessFromSyncedAt(refreshedAt).cache_age_seconds);

  return (
    <section
      aria-label="Brand Book"
      data-testid="brand-book-milestone"
      className="rounded-lg border border-border/70 bg-card p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <BookOpenText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Brand Book ready</p>
              <ScoreBadge label="Readiness" score={setup.readiness.score} />
            </div>
            {setup.readiness.next_action ? (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Next: </span>
                {setup.readiness.next_action}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Voice, creative, trends, and reporting are grounded in your brand.
              </p>
            )}
            {age ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">Updated {age}</p>
            ) : null}
          </div>
        </div>
        <ViewButton />
      </div>
    </section>
  );
}
