'use client';

// Trends+ brand listening: recent mentions of the brand, its competitors and custom keywords,
// classified once by the Backend. Brands without Trends+ see what it adds and how to get it.

import {
  LISTENING_MAX_KEYWORDS,
  LISTENING_TAGS,
  type ListeningKeyword,
  type ListeningMention,
  type ListeningTag,
} from '@continuum/contracts';
import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useListening, useSaveListeningKeywords } from '@/lib/api/listening';
import { billingHref } from '@/lib/billing/productAccess';
import { cn } from '@/lib/utils';

const TAG_LABEL: Record<ListeningTag, string> = {
  brand_mention: 'Brand',
  competitor_mention: 'Competitor',
  buy_intent: 'Buy intent',
  question: 'Question',
  complaint: 'Complaint',
  feedback: 'Feedback',
  praise: 'Praise',
};

const SENTIMENT_CLASS: Record<NonNullable<ListeningMention['sentiment']>, string> = {
  positive: 'text-emerald-600',
  neutral: 'text-muted-foreground',
  negative: 'text-rose-600',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function MentionRow({ mention }: { mention: ListeningMention }) {
  return (
    <li className="border-b px-3 py-2 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={mention.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <span className="truncate">{mention.title ?? hostOf(mention.url)}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
          {mention.body ? (
            <p className="text-muted-foreground line-clamp-2 text-xs">{mention.body}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground">
              {mention.platform === 'web' ? hostOf(mention.url) : mention.platform}
              {mention.publishedAt ? ` · ${mention.publishedAt.slice(0, 10)}` : ''}
            </span>
            {mention.sentiment ? (
              <span className={SENTIMENT_CLASS[mention.sentiment]}>{mention.sentiment}</span>
            ) : null}
            {mention.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {TAG_LABEL[tag]}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

function KeywordEditor({ brandId, keywords }: { brandId: string; keywords: ListeningKeyword[] }) {
  const [draft, setDraft] = useState('');
  const save = useSaveListeningKeywords(brandId);
  const full = keywords.length >= LISTENING_MAX_KEYWORDS;

  const add = (event: FormEvent) => {
    event.preventDefault();
    const keyword = draft.trim().toLowerCase();
    if (keyword.length < 2 || keywords.some((k) => k.keyword === keyword) || full) return;
    save.mutate([...keywords, { keyword, kind: 'custom' }], { onSuccess: () => setDraft('') });
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
      {keywords.map((k) => (
        <Badge key={k.keyword} variant={k.kind === 'brand' ? 'default' : 'secondary'}>
          {k.keyword}
          <button
            type="button"
            className="ml-1"
            aria-label={`Stop listening for ${k.keyword}`}
            disabled={save.isPending}
            onClick={() => save.mutate(keywords.filter((other) => other.keyword !== k.keyword))}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </Badge>
      ))}
      <form onSubmit={add} className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={full ? `Up to ${LISTENING_MAX_KEYWORDS} keywords` : 'Add a keyword'}
          aria-label="Add a keyword to listen for"
          disabled={full || save.isPending}
          maxLength={80}
          className="h-7 w-40 text-xs"
        />
        <Button type="submit" size="sm" variant="ghost" className="h-7 text-xs" disabled={full}>
          Add
        </Button>
      </form>
      {save.isError ? (
        <p className="w-full text-xs text-rose-600">Couldn't save keywords. Try again.</p>
      ) : null}
    </div>
  );
}

function Upsell() {
  return (
    <div className="space-y-2 p-4 text-sm">
      <p className="font-medium">See who's talking about your brand</p>
      <p className="text-muted-foreground text-xs">
        Trends+ listens across the web, news, reviews, forums and Reddit for your brand and your
        competitors, and flags buying intent, questions and complaints — $9.99 a month.
      </p>
      <Link href={billingHref('listening')} className={buttonVariants({ size: 'sm' })}>
        Get Trends+
      </Link>
    </div>
  );
}

export function ListeningFeed({ brandId, enabled }: { brandId?: string; enabled: boolean }) {
  const { data, error, isLoading } = useListening(brandId, enabled);
  const [tag, setTag] = useState<ListeningTag | 'all'>('all');
  const mentions = useMemo(
    () => (data?.mentions ?? []).filter((m) => tag === 'all' || m.tags.includes(tag)),
    [data, tag],
  );

  if (!brandId) return null;
  if (isLoading) {
    return (
      <div className="space-y-1 p-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={`listening-row-${i}`} className="h-9 w-full rounded-md bg-muted/70" />
        ))}
      </div>
    );
  }
  if (error) {
    if (error instanceof ApiError && error.status === 402) return <Upsell />;
    return <p className="text-muted-foreground p-3 text-xs">Listening is unavailable right now.</p>;
  }
  if (!data) return null;

  const presentTags = LISTENING_TAGS.filter((t) => data.mentions.some((m) => m.tags.includes(t)));

  return (
    <div className="flex flex-col">
      <KeywordEditor brandId={brandId} keywords={data.keywords} />
      {presentTags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {(['all', ...presentTags] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTag(option)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                tag === option ? 'bg-foreground text-background' : 'text-muted-foreground',
              )}
            >
              {option === 'all' ? 'All' : TAG_LABEL[option]}
            </button>
          ))}
        </div>
      ) : null}
      {mentions.length > 0 ? (
        <ul>
          {mentions.map((mention) => (
            <MentionRow key={mention.id} mention={mention} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground p-3 text-xs">
          {data.lastFetchedAt
            ? 'No mentions in the last week.'
            : 'Listening starts within a minute of adding keywords, then refreshes daily.'}
        </p>
      )}
    </div>
  );
}
