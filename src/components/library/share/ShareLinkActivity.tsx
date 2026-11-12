'use client';

// What external reviewers did on a share link, per asset, each row naming the
// reviewer (their verified name and email) and when.

import type {
  ShareActivityTotals,
  ShareLinkActivityEvent,
  ShareLinkEventKind,
} from '@continuum/contracts';
import { useLocale as useUiLocale, useTranslations as useUiTranslations } from 'next-intl';

const VERB_KEYS = {
  open: 'shareOpened',
  view: 'shareViewed',
  play: 'sharePlayed',
  download: 'shareDownloaded',
  download_all: 'shareDownloadedAll',
  comment: 'shareCommented',
  decision: 'shareDecision',
  field_edit: 'shareFieldEdited',
} as const satisfies Record<ShareLinkEventKind, string>;

function reviewerLabel(event: ShareLinkActivityEvent, anonymousLabel: string): string {
  if (event.reviewerName && event.reviewerEmail)
    return `${event.reviewerName} <${event.reviewerEmail}>`;
  return event.reviewerName ?? event.reviewerEmail ?? anonymousLabel;
}

type Counts = { views: number; plays: number; downloads: number; comments: number };

function CountCells({ counts }: { counts: Counts }) {
  const locale = useUiLocale();
  const format = new Intl.NumberFormat(locale);
  return (
    <>
      {(['views', 'plays', 'downloads', 'comments'] as const).map((key) => (
        <td key={key} data-count={key} className="px-1 text-right tabular-nums">
          {format.format(counts[key])}
        </td>
      ))}
    </>
  );
}

// Views, plays, downloads and comments, per asset and per viewer.
export function ShareActivityTotalsTable({ totals }: { totals: ShareActivityTotals }) {
  const translateUi = useUiTranslations('library');

  if (totals.byAsset.length === 0 && totals.byViewer.length === 0) return null;
  const head = (label: string) => (
    <thead>
      <tr className="text-muted-foreground">
        <th className="text-left font-medium">{label}</th>
        <th className="px-1 text-right font-medium">{translateUi('views_69c40459')}</th>
        <th className="px-1 text-right font-medium">{translateUi('plays_725b66fb')}</th>
        <th className="px-1 text-right font-medium">{translateUi('downloads_d5fdc1af')}</th>
        <th className="px-1 text-right font-medium">{translateUi('comments_355f79f2')}</th>
      </tr>
    </thead>
  );
  return (
    <div className="flex flex-col gap-2 text-2xs" data-share-totals>
      {totals.byAsset.length > 0 ? (
        <table className="w-full">
          {head(translateUi('asset_80d298c9'))}
          <tbody>
            {totals.byAsset.map((row) => (
              <tr key={row.assetId} data-totals-asset={row.assetId}>
                <td className="max-w-40 truncate text-foreground">
                  {row.title ?? translateUi('asset_80d298c9')}
                </td>
                <CountCells counts={row} />
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <table className="w-full">
        {head(translateUi('shareViewer'))}
        <tbody>
          {totals.byViewer.map((row) => (
            <tr key={row.viewerKey} data-totals-viewer={row.email ?? row.name ?? row.viewerKey}>
              <td className="max-w-40 truncate text-foreground">
                {row.name ?? row.email ?? translateUi('anonymous_viewer_f88f3027')}
              </td>
              <CountCells counts={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ShareLinkActivity({
  events,
  totals,
  emptyLabel,
}: {
  events: ShareLinkActivityEvent[];
  totals?: ShareActivityTotals;
  emptyLabel?: string;
}) {
  const displayLocale = useUiLocale();

  const translateUi = useUiTranslations('library');

  if (events.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        {emptyLabel ?? translateUi('shareNoActivity')}
      </p>
    );
  const groups = new Map<string, { title: string; events: ShareLinkActivityEvent[] }>();
  for (const event of events) {
    const key = event.assetId ?? 'link';
    const group = groups.get(key) ?? {
      title: event.assetId
        ? (event.assetTitle ?? translateUi('asset_80d298c9'))
        : translateUi('whole_link_80b891f3'),
      events: [],
    };
    group.events.push(event);
    groups.set(key, group);
  }
  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto" data-share-activity>
      {totals ? <ShareActivityTotalsTable totals={totals} /> : null}
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
                  <span className="text-foreground">
                    {reviewerLabel(event, translateUi('anonymous_viewer_f88f3027'))}
                  </span>{' '}
                  {translateUi(VERB_KEYS[event.kind])}
                </span>
                <time dateTime={event.createdAt} className="shrink-0 tabular-nums">
                  {new Date(event.createdAt).toLocaleString(displayLocale)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
