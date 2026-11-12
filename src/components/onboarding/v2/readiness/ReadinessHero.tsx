'use client';

import { useLocale, useTranslations } from 'next-intl';

// The onboarding agent's verdict on the brand, led by the radar. One component
// serves the Brand DNA reveal and Settings → Brand Book → Readiness.
//
// Axis ↔ move ↔ ledger are one selection: hovering or focusing an axis or a move
// previews that dimension's criteria ledger, clicking pins it.

import { Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useId, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ReadinessAnalysis, ReadinessDimension } from '@/lib/onboarding/agentClient';
import { cn } from '@/lib/utils';
import { CriteriaLedger } from './CriteriaLedger';
import { FindingCallout } from './FindingCallout';
import { ReadinessRadarChart, radarAxes } from './ReadinessRadarChart';
import { ScoreBadge } from './ScoreBadge';
import {
  DIMENSION_DISPLAY_ORDER,
  failedEvidenceSources,
  getDimensionLabels,
  isCriteriaScored,
  listInWords,
  meanCoverage,
} from './utils';

export type ReadinessHeroStatus = 'running' | 'error' | 'settled';

type Props = {
  readiness: ReadinessAnalysis | null;
  status: ReadinessHeroStatus;
  /** Sits in the header: Settings passes its Recalculate control. */
  action?: ReactNode;
  /** Shown on rows scored before criteria, e.g. a prompt to recalculate. */
  legacyHint?: string;
  className?: string;
};

type HeroState = 'pending' | 'empty' | 'error' | 'legacy' | 'scored';

function heroState(readiness: ReadinessAnalysis | null, status: ReadinessHeroStatus): HeroState {
  if (readiness) return isCriteriaScored(readiness) ? 'scored' : 'legacy';
  if (status === 'error') return 'error';
  return status === 'running' ? 'pending' : 'empty';
}

export function ReadinessHero({ readiness, status, action, legacyHint, className }: Props) {
  const tUi = useTranslations('onboarding');

  const state = heroState(readiness, status);
  const ledgerId = useId();
  const reduceMotion = useReducedMotion();
  // undefined = the user has not chosen yet, so the top move's dimension is open.
  const [pinned, setPinned] = useState<ReadinessDimension | null | undefined>(undefined);
  const [preview, setPreview] = useState<ReadinessDimension | null>(null);

  const findings = state === 'scored' && readiness ? readiness.findings : [];
  const pinnedDimension = pinned === undefined ? (findings[0]?.dimension ?? null) : pinned;
  const activeDimension = preview ?? pinnedDimension;
  const select = (dimension: ReadinessDimension) =>
    setPinned((current) =>
      (current === undefined ? pinnedDimension : current) === dimension ? null : dimension,
    );

  return (
    <section
      aria-labelledby={`${ledgerId}-title`}
      className={cn('rounded-lg border border-border bg-card p-[var(--card-pad)]', className)}
      data-state={state}
      data-testid="readiness-hero"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-base font-semibold text-foreground" id={`${ledgerId}-title`}>
            {tUi('m_5f45796785')}
          </h3>
          <p className="text-xs text-muted-foreground">
            <Subline readiness={readiness} state={state} />
          </p>
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </header>

      {readiness?.completeness === 'partial' ? <PartialBanner readiness={readiness} /> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ReadinessRadarChart
            activeDimension={activeDimension}
            ledgerId={state === 'scored' ? ledgerId : undefined}
            onPreview={setPreview}
            onSelect={select}
            pending={state === 'pending'}
            pinnedDimension={pinnedDimension}
            readiness={readiness}
          />
          {readiness ? <Legend readiness={readiness} /> : null}
        </div>

        <div className="min-w-0 space-y-4">
          {state === 'pending' ? <PendingRail /> : null}
          {state === 'empty' || state === 'error' ? <Unscored state={state} /> : null}
          {state === 'legacy' && readiness ? (
            <LegacyScores
              activeDimension={activeDimension}
              hint={legacyHint}
              readiness={readiness}
            />
          ) : null}
          {state === 'scored' && readiness ? (
            <>
              <NextMoves
                activeDimension={activeDimension}
                ledgerId={ledgerId}
                onPreview={setPreview}
                onSelect={select}
                pinnedDimension={pinnedDimension}
                readiness={readiness}
              />
              {activeDimension ? (
                <motion.div
                  animate={{ opacity: 1 }}
                  initial={{ opacity: 0 }}
                  key={activeDimension}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  <CriteriaLedger
                    dimension={activeDimension}
                    id={ledgerId}
                    onClose={() => setPinned(null)}
                    pinned={pinnedDimension === activeDimension && preview === null}
                    readiness={readiness}
                  />
                </motion.div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Subline({ readiness, state }: { readiness: ReadinessAnalysis | null; state: HeroState }) {
  const tUi = useTranslations('onboarding');

  if (state === 'pending') return tUi('m_b4da6905e1');
  if (state === 'error') return tUi('m_c76df25059');
  if (!readiness || state === 'empty') return tUi('m_c8c18b2afc');
  if (state === 'legacy') return tUi('m_ba1e7ee90b');
  const total = DIMENSION_DISPLAY_ORDER.reduce(
    (sum, d) => sum + (readiness.dimensions[d].criteria?.length ?? 0),
    0,
  );
  return tUi('readinessScoredCriteria', { count: total });
}

function PartialBanner({ readiness }: { readiness: ReadinessAnalysis }) {
  const tUi = useTranslations('onboarding');
  const uiLocale = useLocale();

  const failed = failedEvidenceSources(readiness, tUi);
  const thin = radarAxes(readiness, getDimensionLabels(tUi))
    .filter((a) => a.confidence !== 'measured')
    .map((a) => a.label);
  const reason =
    failed.length > 0
      ? tUi('readinessUnreadSources', { sources: listInWords(failed, 'or', uiLocale) })
      : thin.length > 0
        ? tUi('readinessThinSources', { sources: listInWords(thin, 'and', uiLocale) })
        : tUi('m_51c7be80aa');
  return (
    <p
      className="mb-4 flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
      data-testid="readiness-partial"
      role="note"
    >
      <Info aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground">{tUi('m_09d1700a92')}</span> {reason}
      </span>
    </p>
  );
}

function Legend({ readiness }: { readiness: ReadinessAnalysis }) {
  const tUi = useTranslations('onboarding');

  const coverage = meanCoverage(readiness);
  const axes = radarAxes(readiness, getDimensionLabels(tUi));
  const uncertain = axes.some((a) => a.confidence !== 'measured');
  const reachable = readiness.reachable_score;
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-4 rounded-full bg-primary" />
        {tUi('m_4fc0e2bc80')}
      </li>
      {axes.some((a) => a.reachable !== null) ? (
        <li className="flex items-center gap-1.5" data-testid="legend-reachable">
          <span aria-hidden className="w-4 border-t-2 border-dashed border-muted-foreground" />
          {tUi('m_39868961a8')}
          {reachable !== undefined ? (
            <span className="tabular-nums text-foreground">{reachable}</span>
          ) : null}
        </li>
      ) : null}
      {coverage !== null ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-2 border-muted-foreground" />
          {tUi('m_8189f9af9f')}
          {Math.round(coverage * 100)}
          {tUi('m_31a784e2e3')}
        </li>
      ) : null}
      {uncertain ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-4 bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_1.5px,transparent_1.5px_4px)] opacity-60"
          />
          {tUi('m_29555e02e2')}
        </li>
      ) : null}
    </ul>
  );
}

function NextMoves({
  readiness,
  activeDimension,
  pinnedDimension,
  ledgerId,
  onPreview,
  onSelect,
}: {
  readiness: ReadinessAnalysis;
  activeDimension: ReadinessDimension | null;
  pinnedDimension: ReadinessDimension | null;
  ledgerId: string;
  onPreview: (dimension: ReadinessDimension | null) => void;
  onSelect: (dimension: ReadinessDimension) => void;
}) {
  const tUi = useTranslations('onboarding');

  const moves = readiness.findings;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tUi('m_afb97b151d')}
      </h4>
      {moves.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tUi('m_d6325483b9')}</p>
      ) : (
        <ol className="space-y-2" data-testid="readiness-moves">
          {moves.map((finding) => (
            <li
              data-active={activeDimension === finding.dimension || undefined}
              key={`${finding.dimension}-${finding.headline}`}
            >
              <FindingCallout
                controls={ledgerId}
                finding={finding}
                onPreview={(on) => onPreview(on ? finding.dimension : null)}
                onSelect={() => onSelect(finding.dimension)}
                selected={pinnedDimension === finding.dimension}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LegacyScores({
  readiness,
  activeDimension,
  hint,
}: {
  readiness: ReadinessAnalysis;
  activeDimension: ReadinessDimension | null;
  hint?: string;
}) {
  const tUi = useTranslations('onboarding');

  return (
    <div className="space-y-2" data-testid="readiness-legacy">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tUi('m_12b9b57ac7')}
      </h4>
      {hint ? (
        <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          {hint}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {DIMENSION_DISPLAY_ORDER.map((dimension) => {
          const dim = readiness.dimensions[dimension];
          return (
            <li
              className={cn(
                'space-y-1 px-1 py-2 transition-colors',
                activeDimension === dimension && 'bg-muted/60',
              )}
              data-dimension={dimension}
              key={dimension}
            >
              <ScoreBadge label={getDimensionLabels(tUi)[dimension]} score={dim.score} />
              <p className="text-xs leading-snug text-muted-foreground">{dim.rationale}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PendingRail() {
  const tUi = useTranslations('onboarding');

  return (
    <div aria-label={tUi('m_3258a73260')} className="space-y-2" role="status">
      <Skeleton className="h-3 w-24" />
      {[0, 1, 2].map((row) => (
        <Skeleton className="h-20 w-full rounded-md" key={row} />
      ))}
    </div>
  );
}

function Unscored({ state }: { state: 'empty' | 'error' }) {
  const tUi = useTranslations('onboarding');

  return (
    <div className="space-y-1.5 pt-2" data-testid="readiness-unscored">
      <p className="text-sm font-medium text-foreground">
        {state === 'error' ? tUi('m_56462192d7') : tUi('m_b5411d0885')}
      </p>
      <p className="text-sm leading-snug text-muted-foreground">
        {state === 'error' ? tUi('m_ca944aa8b8') : tUi('m_1ce2492747')}
      </p>
    </div>
  );
}
