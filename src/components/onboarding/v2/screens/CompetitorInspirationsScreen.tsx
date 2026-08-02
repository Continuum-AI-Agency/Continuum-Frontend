'use client';

import type {
  InspirationAd,
  InspirationPost,
  OnboardingInspirationSelection,
  OnboardingInspirationsStreamFrame,
} from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { streamInspirations } from '@/lib/onboarding/inspirationsClient';
import { cn } from '@/lib/utils';

export type SelectedInspiration = OnboardingInspirationSelection;

type CompetitorCard = {
  name: string;
  website: string | null;
  organicPosts: InspirationPost[];
  paidAds: InspirationAd[];
  done: boolean;
};

type Phase = 'loading' | 'streaming' | 'done' | 'empty' | 'error';

type Props = {
  brandId: string;
  selected: SelectedInspiration | null;
  onSelect: (selection: SelectedInspiration) => void;
  onContinue: () => void;
  onBack: () => void;
};

export function CompetitorInspirationsScreen({
  brandId,
  selected,
  onSelect,
  onContinue,
  onBack,
}: Props) {
  const [order, setOrder] = useState<string[]>([]);
  const [cards, setCards] = useState<Record<string, CompetitorCard>>({});
  const [phase, setPhase] = useState<Phase>('loading');
  const startedRef = useRef(false);
  const discoveredRef = useRef(0);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();

    const upsert = (name: string, mutate: (card: CompetitorCard) => CompetitorCard) => {
      setCards((prev) => {
        const existing = prev[name] ?? {
          name,
          website: null,
          organicPosts: [],
          paidAds: [],
          done: false,
        };
        return { ...prev, [name]: mutate(existing) };
      });
    };

    const handleFrame = (frame: OnboardingInspirationsStreamFrame) => {
      setPhase((p) => (p === 'loading' ? 'streaming' : p));
      switch (frame.type) {
        case 'competitor_discovered': {
          const { competitorName, website } = frame.data;
          discoveredRef.current += 1;
          setOrder((prev) => (prev.includes(competitorName) ? prev : [...prev, competitorName]));
          upsert(competitorName, (card) => ({ ...card, website: website ?? card.website }));
          break;
        }
        case 'post_pulled':
          upsert(frame.data.competitorName, (card) => ({
            ...card,
            organicPosts: [...card.organicPosts, frame.data.post],
          }));
          break;
        case 'ad_pulled':
          upsert(frame.data.competitorName, (card) => ({
            ...card,
            paidAds: [...card.paidAds, frame.data.ad],
          }));
          break;
        case 'competitor_done':
          upsert(frame.data.competitorName, () => ({
            name: frame.data.competitorName,
            website: frame.data.website ?? null,
            organicPosts: frame.data.organicPosts,
            paidAds: frame.data.paidAds,
            done: true,
          }));
          break;
        case 'complete':
          setPhase(frame.data.competitorCount > 0 ? 'done' : 'empty');
          break;
        case 'error':
          break;
      }
    };

    void streamInspirations({ brandId, signal: controller.signal, onFrame: handleFrame })
      // A top-level failure arrives as an error FRAME and the stream then ends
      // cleanly (promise resolves). Settle on stream end too so we never leave the
      // "Finding more inspirations…" spinner running without a `complete` frame.
      .then(() =>
        setPhase((p) =>
          p === 'loading' || p === 'streaming' ? (discoveredRef.current > 0 ? 'done' : 'empty') : p,
        ),
      )
      .catch(() => setPhase((p) => (p === 'loading' ? 'error' : p)));

    return () => controller.abort();
  }, [brandId]);

  const competitors = order.map((name) => cards[name]).filter(Boolean) as CompetitorCard[];

  return (
    <div className="mx-auto flex w-full max-w-[1700px] flex-1 flex-col px-4 pb-28 md:px-8">
      <header className="py-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Inspirations from competitor success
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top organic posts and paid ads from the competitors we found in your brand profile. Pick
          one to guide your first generations — or just continue.
        </p>
      </header>

      {phase === 'loading' ? (
        <LoadingState />
      ) : phase === 'empty' ? (
        <EmptyState />
      ) : phase === 'error' ? (
        <ErrorState />
      ) : (
        <div className="flex flex-col gap-10">
          {competitors.map((competitor) => (
            <CompetitorSection
              key={competitor.name}
              competitor={competitor}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
          {phase === 'streaming' ? <LoadingRow label="Finding more inspirations…" /> : null}
        </div>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <div className="flex items-center gap-2">
          {/* Always-enabled escape hatch: competitor discovery can be slow or fail
              (it waits on strategic analysis). The user must never be locked here —
              creatives are generated from brand guidelines regardless. */}
          <Button variant="ghost" size="sm" onClick={onContinue}>
            Skip
          </Button>
          <Button variant="default" size="sm" onClick={onContinue}>
            Continue to generations →
          </Button>
        </div>
      </footer>
    </div>
  );
}

function CompetitorSection({
  competitor,
  selected,
  onSelect,
}: {
  competitor: CompetitorCard;
  selected: SelectedInspiration | null;
  onSelect: (selection: SelectedInspiration) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold text-foreground">{competitor.name}</h2>
        {competitor.website ? (
          <span className="truncate text-xs text-muted-foreground">{competitor.website}</span>
        ) : null}
      </div>

      <InspirationRow label="Organic posts">
        {competitor.organicPosts.length === 0 ? (
          <EmptyHint>No organic posts available.</EmptyHint>
        ) : (
          competitor.organicPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              competitorName={competitor.name}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        )}
      </InspirationRow>

      <InspirationRow label="Paid ads">
        {competitor.paidAds.length === 0 ? (
          <EmptyHint>No paid ads available.</EmptyHint>
        ) : (
          competitor.paidAds.map((ad) => (
            <AdCard
              key={ad.id}
              ad={ad}
              competitorName={competitor.name}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        )}
      </InspirationRow>
    </section>
  );
}

function InspirationRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

function InspirationTag() {
  return (
    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-white">
      Inspiration
    </span>
  );
}

function PostCard({
  post,
  competitorName,
  selected,
  onSelect,
}: {
  post: InspirationPost;
  competitorName: string;
  selected: SelectedInspiration | null;
  onSelect: (selection: SelectedInspiration) => void;
}) {
  const isSelected = Boolean(post.imageUrl && selected?.imageUrl === post.imageUrl);
  const selectable = Boolean(post.imageUrl);
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => post.imageUrl && onSelect({ competitorName, imageUrl: post.imageUrl })}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition',
        isSelected ? 'border-primary ring-2 ring-primary' : 'border-border hover:border-primary/50',
        !selectable && 'cursor-default opacity-80',
      )}
    >
      <InspirationTag />
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={`${competitorName} inspiration`}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
          No image
        </div>
      )}
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
        {typeof post.metrics?.likes === 'number' ? <span>♥ {post.metrics.likes}</span> : null}
        {typeof post.metrics?.comments === 'number' ? (
          <span>💬 {post.metrics.comments}</span>
        ) : null}
      </div>
    </button>
  );
}

function AdCard({
  ad,
  competitorName,
  selected,
  onSelect,
}: {
  ad: InspirationAd;
  competitorName: string;
  selected: SelectedInspiration | null;
  onSelect: (selection: SelectedInspiration) => void;
}) {
  const isSelected = Boolean(ad.imageUrl && selected?.imageUrl === ad.imageUrl);
  const selectable = Boolean(ad.imageUrl);
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => ad.imageUrl && onSelect({ competitorName, imageUrl: ad.imageUrl })}
      className={cn(
        'group relative flex aspect-square flex-col justify-between overflow-hidden rounded-lg border bg-card p-3 text-left transition',
        isSelected ? 'border-primary ring-2 ring-primary' : 'border-border',
        !selectable && 'cursor-default',
      )}
    >
      <InspirationTag />
      <p className="mt-5 line-clamp-3 text-xs font-medium text-foreground">
        {ad.headline ?? 'Untitled ad'}
      </p>
      <p className="line-clamp-4 text-xs text-muted-foreground">{ad.bodyText ?? ''}</p>
      {ad.permalink ? (
        <a
          href={ad.permalink}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-2xs font-semibold uppercase tracking-wide text-primary hover:underline"
        >
          View ad ↗
        </a>
      ) : null}
    </button>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="col-span-full text-xs text-muted-foreground">{children}</p>;
}

function LoadingRow({ label }: { label: string }) {
  return <p className="animate-pulse text-sm text-muted-foreground">{label}</p>;
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">
        Analyzing your competitors and pulling their best work…
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t surface competitor inspirations yet. You can continue and explore them
        later from the dashboard.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
      <p className="text-sm text-muted-foreground">
        Something interrupted the inspirations pull. You can continue — your generations will still
        work.
      </p>
    </div>
  );
}
