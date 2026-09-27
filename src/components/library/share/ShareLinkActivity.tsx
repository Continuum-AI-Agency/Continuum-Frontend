'use client';

// What external reviewers did on a share link, per asset, each row naming the
// reviewer (their verified name and email) and when.

import type { ShareLinkActivityEvent, ShareLinkEventKind } from '@continuum/contracts';

const VERB: Record<ShareLinkEventKind, string> = {
  open: 'opened the link',
  view: 'viewed',
  play: 'played',
  download: 'downloaded',
  download_all: 'downloaded all',
  comment: 'commented',
  decision: 'gave a decision',
  field_edit: 'edited the field',
};

function reviewerLabel(event: ShareLinkActivityEvent): string {
  if (event.reviewerName && event.reviewerEmail) return `${event.reviewerName} <${event.reviewerEmail}>`;
  return event.reviewerName ?? event.reviewerEmail ?? 'Anonymous viewer';
}

export function ShareLinkActivity({
  events,
  emptyLabel = 'No activity yet.',
}: {
  events: ShareLinkActivityEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  const groups = new Map<string, { title: string; events: ShareLinkActivityEvent[] }>();
  for (const event of events) {
    const key = event.assetId ?? 'link';
    const group = groups.get(key) ?? {
      title: event.assetId ? (event.assetTitle ?? 'Asset') : 'Whole link',
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }
  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto" data-share-activity>
      {[...groups.entries()].map(([key, group]) => (
        <section key={key} data-activity-asset={key} className="flex flex-col gap-1">
          <h4 className="truncate text-xs font-semibold text-foreground">{group.title}</h4>
          <ul className="flex flex-col gap-0.5">
            {group.events.map((event) => (
              <li
                key={event.id}
                data-activity-kind={event.kind}
                className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
              >
                <span className="min-w-0 truncate">
                  <span className="text-foreground">{reviewerLabel(event)}</span> {VERB[event.kind]}
                </span>
                <time dateTime={event.createdAt} className="shrink-0 tabular-nums">
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
