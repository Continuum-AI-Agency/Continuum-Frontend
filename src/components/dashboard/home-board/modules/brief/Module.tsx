'use client';

// The brief opened: every ad account's stored read, newest first, each dated and in the words the
// worker wrote. Numbered evidence that re-runs each figure is Phase B; until then the module
// says so and links to the account's Optimizer, where the cards behind the read live.

import Link from 'next/link';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import {
  BRIEF_EVIDENCE_NOTE,
  type BriefEntry,
  optimizerHref,
  readOnLabel,
  staleLabel,
} from './briefModel';

const PLATFORM_LABEL: Record<BriefEntry['platform'], string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
};

export default function BriefModule({
  entries,
  failed,
}: {
  entries: readonly BriefEntry[];
  failed: number;
}) {
  const today = new Date();
  return (
    <div className="flex flex-col gap-4" data-testid="home-brief-module">
      {entries.map((entry) => {
        const age = staleLabel(entry);
        const readOn = readOnLabel(entry, today);
        return (
          <article
            className="flex flex-col gap-2 rounded-lg border p-3"
            data-account={entry.adAccountId}
            data-testid="home-brief-entry"
            key={`${entry.platform}:${entry.adAccountId}`}
          >
            <header className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold text-sm">{entry.accountName}</span>
              <span className="text-muted-foreground">{PLATFORM_LABEL[entry.platform]}</span>
              <time className="text-muted-foreground" dateTime={entry.day}>
                {readOn}
              </time>
              {age ? <span className="text-warning">{age}</span> : null}
            </header>
            <p className="whitespace-pre-line break-words text-sm leading-relaxed">
              {entry.narrative}
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <Link
                className="text-primary-ink underline-offset-2 hover:underline"
                href={optimizerHref(entry.adAccountId)}
              >
                Open in Optimizer
              </Link>
              <Link
                className="text-primary-ink underline-offset-2 hover:underline"
                href={jainaPromptHref(
                  `Walk me through your daily read of ${entry.accountName} (${readOn}).`,
                  null,
                  { newConversation: true },
                )}
              >
                Ask Jaina about this read
              </Link>
            </div>
          </article>
        );
      })}
      {failed > 0 ? (
        <p className="text-muted-foreground text-xs">
          {failed === 1 ? 'One account’s read' : `${failed} accounts’ reads`} could not be loaded.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs" data-testid="home-brief-evidence-note">
        {BRIEF_EVIDENCE_NOTE}
      </p>
    </div>
  );
}
