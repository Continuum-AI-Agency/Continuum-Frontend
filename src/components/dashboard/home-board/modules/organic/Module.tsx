'use client';

// H11 Organic week, expanded: the seven days with every published, scheduled and waiting post,
// inline approval for a waiting draft (the calendar's own Approve & schedule — the gated
// group-approve route, then each row to scheduled), and the 7-day reach / interactions rollup.
//
// Reach per post and the week's top post are the Backend's organic week (R4); until it deploys the
// module says they are not readable yet. Best time to post stays absent: it comes from
// organic_best_times, which the browser can only reach through the organic insights edge — and
// that edge generates the insights (a model call) on a cold cache, so the Home never asks it.
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useApproveScheduleDraft } from '@/components/organic/hooks/useApproveScheduleDraft';
import type {
  OrganicCalendarDraft,
  OrganicCalendarPostedContent,
} from '@/components/organic/primitives/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCount } from '@/lib/home/format';
import { useOrganicSnapshot } from '@/lib/home/homeAccounts';
import { type SnapshotAccountRef, summableRollups } from '@/lib/organic/brandOrganicSnapshot';
import { organicPlatformLabel } from '@/lib/organic/platforms';
import { cn } from '@/lib/utils';
import type { OrganicWeekDay, WaitingDraft } from './organicWeekModel';
import { reachRowsOf, topPostLine } from './organicWeekRead';
import { homeOrganicDraftsKey, useOrganicWeek } from './useOrganicWeek';
import { type OrganicWeekRead, useOrganicWeekRead } from './useOrganicWeekRead';

export const BEST_TIME_COLD = 'Best time not read yet — open Organic to read it.';
export const PER_POST_NOT_READABLE =
  "Reach per post this week and the week's top post are not readable yet.";

function platformsOf(platforms: string[]): string {
  return platforms.map(organicPlatformLabel).join(' · ');
}

function PublishedItem({ post }: { post: OrganicCalendarPostedContent }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-2 text-xs">
      <span className="text-2xs text-muted-foreground">
        {organicPlatformLabel(post.platform)} · {post.timeLabel}
      </span>
      <span className="line-clamp-2 font-medium">{post.title}</span>
      <Badge className="w-fit" variant="success">
        Published
      </Badge>
    </li>
  );
}

function ScheduledItem({ card }: { card: OrganicCalendarDraft }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background p-2 text-xs">
      <span className="text-2xs text-muted-foreground">{platformsOf(card.platforms)}</span>
      <span className="line-clamp-2 font-medium">{card.title}</span>
      <Badge className="w-fit" variant="outline">
        Scheduled · {card.timeLabel}
      </Badge>
    </li>
  );
}

function WaitingItem({
  item,
  busy,
  disabled,
  onApprove,
}: {
  item: WaitingDraft;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
}) {
  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-dashed p-2 text-xs"
      data-testid="home-organic-waiting"
    >
      <span className="text-2xs text-muted-foreground">
        {platformsOf(item.card.platforms)} · {item.card.timeLabel}
      </span>
      <span className="line-clamp-2 font-medium">{item.card.title}</span>
      {item.approvedNotScheduled ? (
        <span className="text-2xs text-muted-foreground">Approved, not scheduled yet</span>
      ) : null}
      <Button
        className="h-7 w-fit px-2 text-xs"
        data-testid="home-organic-approve"
        disabled={disabled}
        onClick={onApprove}
        size="sm"
        type="button"
        variant="outline"
      >
        {busy ? 'Approving…' : 'Approve & schedule'}
      </Button>
    </li>
  );
}

function DayColumn({
  day,
  pendingId,
  onApprove,
}: {
  day: OrganicWeekDay;
  pendingId: string | null;
  onApprove: (card: OrganicCalendarDraft) => void;
}) {
  const empty = day.published.length + day.scheduled.length + day.waiting.length === 0;
  return (
    <section
      aria-label={`${day.label} ${day.dateLabel}`}
      className="flex min-w-0 flex-col gap-1.5"
      data-day={day.dayId}
    >
      <h4
        className={cn(
          'flex items-baseline gap-1.5 text-xs',
          day.isToday ? 'font-semibold' : 'text-muted-foreground',
        )}
      >
        {day.label} <span className="font-normal">{day.dateLabel}</span>
        {day.isToday ? <span className="text-2xs text-muted-foreground">Today</span> : null}
      </h4>
      {empty ? (
        <p className="text-2xs text-muted-foreground">Nothing planned</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-1.5">
          {day.published.map((post) => (
            <PublishedItem key={post.id} post={post} />
          ))}
          {day.scheduled.map((card) => (
            <ScheduledItem card={card} key={card.id} />
          ))}
          {day.waiting.map((item) => (
            <WaitingItem
              busy={pendingId === item.card.id}
              disabled={pendingId !== null}
              item={item}
              key={item.card.id}
              onApprove={() => onApprove(item.card)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReachRollup({
  brandId,
  organicAccounts,
}: {
  brandId: string;
  organicAccounts: SnapshotAccountRef[];
}) {
  const snapshot = useOrganicSnapshot(brandId, organicAccounts);
  if (snapshot.status === 'loading') {
    return <div aria-hidden="true" className="h-10 w-full animate-pulse rounded-md bg-muted/60" />;
  }
  const rollup =
    snapshot.status === 'ready'
      ? summableRollups(snapshot.data.accounts, ['reach', 'totalInteractions'])
      : [];
  if (rollup.every((item) => item.value === null)) {
    return <p className="text-muted-foreground text-xs">Couldn't read the last 7 days' reach.</p>;
  }
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1" data-testid="home-organic-rollup">
      {rollup.map((item) =>
        item.value === null ? null : (
          <div className="flex flex-col" key={item.metricId}>
            <dt className="text-2xs text-muted-foreground">{item.label} · last 7 days</dt>
            <dd className="font-semibold text-base tabular-nums">{formatCount(item.value)}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

function ReachPerPost({ read }: { read: OrganicWeekRead }) {
  if (!read.data) {
    return read.unavailable ? (
      <p className="text-2xs text-muted-foreground" data-testid="home-organic-reach-note">
        {PER_POST_NOT_READABLE}
      </p>
    ) : null;
  }
  const rows = reachRowsOf(read.data);
  const topPost = topPostLine(read.data);
  return (
    <section className="flex min-w-0 flex-col gap-1.5" data-testid="home-organic-reach">
      <h4 className="font-medium text-xs">Reach per post this week</h4>
      {topPost ? <p className="text-xs tabular-nums">{topPost}</p> : null}
      {rows.length === 0 ? (
        <p className="text-2xs text-muted-foreground">Nothing was published this week yet.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-1.5">
          {rows.map((row) => (
            <li
              className="flex min-w-0 flex-col text-xs"
              data-post={row.post.postId}
              data-reach={row.post.reach ?? undefined}
              data-testid="home-organic-reach-row"
              key={`${row.post.platform}:${row.post.postId}`}
            >
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
                <span className="min-w-0 text-muted-foreground">
                  {organicPlatformLabel(row.post.platform)}
                  {row.post.mediaType ? ` · ${row.post.mediaType.toLowerCase()}` : ''} ·{' '}
                  {row.post.day}
                </span>
                <span className="font-semibold tabular-nums">
                  {row.reach}
                  {row.lift ? ` · ${row.lift}` : ''}
                </span>
              </span>
              {row.note ? <span className="text-2xs text-muted-foreground">{row.note}</span> : null}
              {row.post.permalink ? (
                <a
                  className="w-fit text-2xs text-primary hover:underline"
                  href={row.post.permalink}
                  rel="noreferrer"
                  target="_blank"
                >
                  View post
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function OrganicWeekModule({
  brandId,
  organicAccounts,
}: {
  brandId: string;
  organicAccounts: SnapshotAccountRef[];
}) {
  const load = useOrganicWeek(brandId, organicAccounts);
  const read = useOrganicWeekRead(brandId, organicAccounts.length > 0);
  const { approveAndSchedule } = useApproveScheduleDraft();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const approve = async (card: OrganicCalendarDraft) => {
    setPendingId(card.id);
    try {
      if (await approveAndSchedule(card)) {
        await queryClient.invalidateQueries({ queryKey: homeOrganicDraftsKey(brandId) });
      }
    } finally {
      setPendingId(null);
    }
  };

  const week = load.week;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="home-organic-module">
      <p className="text-muted-foreground text-xs" data-testid="home-organic-best-time">
        <Link className="underline underline-offset-2" href="/organic?tab=metrics">
          {BEST_TIME_COLD}
        </Link>
      </p>
      {week ? (
        <>
          <p className="text-xs tabular-nums">
            {formatCount(week.published)} published · {formatCount(week.scheduled)} scheduled ·{' '}
            {formatCount(week.waiting)} waiting for approval
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-3">
            {week.days.map((day) => (
              <DayColumn day={day} key={day.dayId} onApprove={approve} pendingId={pendingId} />
            ))}
          </div>
        </>
      ) : load.failed ? (
        <p className="text-muted-foreground text-xs">Couldn't read this week's posts.</p>
      ) : (
        <div aria-hidden="true" className="h-40 w-full animate-pulse rounded-md bg-muted/60" />
      )}
      <ReachRollup brandId={brandId} organicAccounts={organicAccounts} />
      <ReachPerPost read={read} />
      <Link className="text-xs underline underline-offset-2" href="/organic?tab=planner">
        Open the Organic calendar
      </Link>
    </div>
  );
}
