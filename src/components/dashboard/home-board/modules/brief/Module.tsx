'use client';

// The brief opened: the numbered brief with the source of each figure when the Backend answers
// (until it deploys the module says so), then every ad account's stored read, newest first, each
// dated and in the words the worker wrote, with a link to the account's Optimizer.

import type { HomeBriefData, HomeBriefFigure } from '@continuum/contracts';
import Link from 'next/link';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { BriefSentence } from './BriefSentences';
import { briefFigureHref, briefFigureSource, briefFigureWindow } from './briefEvidence';
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

function FigureRow({ figure }: { figure: HomeBriefFigure }) {
  const href = briefFigureHref(figure);
  const covers = briefFigureWindow(figure);
  return (
    <li
      className="flex min-w-0 gap-2 text-xs"
      data-field={figure.field}
      data-n={figure.n}
      data-source-kind={figure.source.kind}
      data-testid="home-brief-figure"
      data-value={figure.value}
    >
      <span className="w-4 shrink-0 text-muted-foreground tabular-nums">{figure.n}</span>
      <span className="min-w-0 space-y-0.5">
        <span className="block">
          <span className="font-semibold tabular-nums">{figure.display}</span> · {figure.label}
        </span>
        <span className="block text-2xs text-muted-foreground">
          {briefFigureSource(figure)}
          {covers ? ` · ${covers}` : ''}
          {href ? (
            <>
              {' · '}
              <Link className="text-primary-ink underline-offset-2 hover:underline" href={href}>
                Open
              </Link>
            </>
          ) : null}
        </span>
      </span>
    </li>
  );
}

function NumberedBrief({ brief }: { brief: HomeBriefData }) {
  return (
    <section className="flex flex-col gap-3" data-testid="home-brief-numbered">
      <div className="space-y-1.5 text-sm leading-relaxed">
        {brief.sentences.map((sentence) => (
          <p className="break-words" key={sentence.id}>
            <BriefSentence sentence={sentence} />
          </p>
        ))}
      </div>
      <ol className="flex flex-col gap-2">
        {brief.sentences
          .flatMap((sentence) => sentence.figures)
          .map((figure) => (
            <FigureRow figure={figure} key={figure.n} />
          ))}
      </ol>
    </section>
  );
}

export default function BriefModule({
  brief,
  entries,
  failed,
}: {
  brief: HomeBriefData | null;
  entries: readonly BriefEntry[];
  failed: number;
}) {
  const today = new Date();
  return (
    <div className="flex flex-col gap-4" data-testid="home-brief-module">
      {brief ? <NumberedBrief brief={brief} /> : null}
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
      {brief ? null : (
        <p className="text-muted-foreground text-xs" data-testid="home-brief-evidence-note">
          {BRIEF_EVIDENCE_NOTE}
        </p>
      )}
    </div>
  );
}
