'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import { useLocale } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useTranslations } from 'next-intl';

// A cross-platform move in Activity: ONE decision, its legs as sub-rows with their own platform
// receipt, and the move's state in words (prototipo.html Activity; escenarios 18 and 19).
//
// Each leg carries its own Undo: the same check-first per-write undo a platform write has in
// Activity (PlatformUndoControl → optimizer-apply-action-revert), in reverse leg order — every
// increase first, a decrease only once every increase of the move is undone, so an undo that
// stops halfway leaves the client spending less, never more (moveDecisionModel.legUndo).

import { GavelIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import * as typeScale from '../../typeScale';
import { ActionMeta } from '../actionCardParts';
import { readActionChange } from '../actionRows';
import { ReceiptToken } from '../feedChrome';
import { PlatformUndoControl } from '../platformCards/PlatformCardActionControl';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { MoveLegLine } from './MoveLegLine';
import type { MoveDecision, MoveDecisionLeg, MoveState } from './moveDecisionModel';
import { formatMinorExact } from './queuedMoveModel';

const STATE_LABEL: Record<MoveState, string> = {
  applied: 'applied',
  in_progress: 'in progress',
  compensated: 'reverted automatically',
  stranded: 'stuck — autopilot paused',
  refused: 'not applied',
  undone: 'undone',
};

const STATE_TONE: Record<MoveState, string> = {
  applied: 'text-muted-foreground',
  in_progress: 'text-muted-foreground',
  compensated: 'text-warning',
  stranded: 'text-destructive',
  refused: 'text-warning',
  undone: 'text-muted-foreground',
};

function platforms(
  list: MoveDecision['from'],
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (uiTranslate)
    return list.length
      ? new Intl.ListFormat(uiLocale, {
          style: 'long',
          type: 'conjunction',
        }).format(list.map((p) => PLATFORM_NAMES[p]))
      : uiTranslate('moveOnePlatform');
  return list.length > 0 ? list.map((p) => PLATFORM_NAMES[p]).join(' and ') : 'one platform';
}

function moveFailureReason(
  error: string | null | undefined,
  platform: string,
  t: ScaleCopy,
): string {
  if (platform === 'google_ads' && error && /^[A-Z][A-Z0-9_]+$/.test(error))
    return t('platformGoogleRefusal', { code: error });
  const code =
    error && /^OAuthException 190(?:\b|$)/.test(error)
      ? 'auth'
      : error && /^40001(?:\b|$)/.test(error)
        ? 'permission'
        : 'other';
  return t('moveRefusalReason', { code });
}

function legStateText(
  leg: MoveDecisionLeg,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  const money = (minor: number | null) =>
    minor == null ? '—' : formatMinorExact(minor, currency, uiLocale);
  if (uiTranslate)
    return uiTranslate('moveLegState', {
      state: leg.state,
      undone: leg.row.reverted_by ? 'yes' : 'no',
      before: money(leg.revert?.beforeMinor ?? null),
      after: money(leg.revert?.afterMinor ?? null),
      reason: moveFailureReason(leg.error, leg.platform, uiTranslate),
    });
  switch (leg.state) {
    case 'applied':
      return leg.row.reverted_by ? 'applied, then undone' : 'applied';
    case 'scheduled':
      return 'scheduled: the platform takes it from midnight';
    case 'refused':
      return leg.error ? `refused: ${leg.error}` : 'refused';
    case 'reverted':
      return `applied, then ${money(leg.revert?.beforeMinor ?? null)} → ${money(leg.revert?.afterMinor ?? null)} reverted`;
    case 'revert_refused':
      return leg.revert?.error
        ? `applied; the revert was refused: ${leg.revert.error}`
        : 'applied; the revert was refused';
  }
}

function stateExplainer(
  move: MoveDecision,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  if (uiTranslate)
    return ['compensated', 'stranded', 'refused'].includes(move.state)
      ? uiTranslate('moveExplainer', {
          state: move.state,
          from: platforms(move.from, uiTranslate, uiLocale),
          to: platforms(move.to, uiTranslate, uiLocale),
          amount: formatMinorExact(move.amountMinor, currency, uiLocale),
          reason: (() => {
            const failed = move.legs.find((leg) => leg.state === 'refused');
            return moveFailureReason(failed?.error, failed?.platform ?? '', uiTranslate);
          })(),
        })
      : null;
  if (move.state === 'compensated') {
    return `${move.reason ?? 'A later leg failed'}. The ${platforms(move.from)} decrease was put back, so spend is where it was.`;
  }
  if (move.state === 'stranded') {
    const amount = formatMinorExact(move.amountMinor, currency, uiLocale);
    return `${move.reason ?? 'A leg failed and so did its revert'}. ${platforms(move.from)} is up to ${amount}/day lower and ${platforms(move.to)} did not go up. Autopilot is paused on this portfolio until someone checks it.`;
  }
  if (move.state === 'refused') return move.reason;
  return null;
}

/** One leg's Undo. The dialog that is undoing it stays mounted until it is closed: the feed
 *  re-reads the leg as undone as soon as the undo lands (ActionRevertControl, G4). */
function LegUndo({ leg, currency }: { leg: MoveDecisionLeg; currency: string | null }) {
  const uiText = useTranslations('scale');
  const [open, setOpen] = React.useState(false);
  const portfolioId = leg.row.portfolio_id;
  if ((leg.undo === 'available' || open) && portfolioId) {
    return (
      <PlatformUndoControl
        auditId={leg.row.id}
        currency={currency}
        onOpenChange={setOpen}
        portfolioId={portfolioId}
        title={uiText('template_fd32956785c1', {
          v0: readActionChange(leg.row, uiText).label,
          v1: PLATFORM_NAMES[leg.platform],
        })}
      />
    );
  }
  if (leg.undo === 'after_increases') {
    return (
      <span className="text-muted-foreground text-xs" data-testid="move-leg-undo-waiting">
        {uiText('undo_after_the_increase_fd43e29')}
      </span>
    );
  }
  return null;
}

export function MoveDecisionCard({
  move,
  currency,
  className,
}: {
  move: MoveDecision;
  currency: string | null;
  className?: string;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const explainer = stateExplainer(move, currency, uiText, uiLocale);
  return (
    <li
      className={cn('space-y-2 py-3', className)}
      data-move-state={move.state}
      data-testid="move-decision"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${typeScale.label} inline-flex shrink-0 items-center gap-1 font-semibold text-muted-foreground`}
          >
            <GavelIcon aria-hidden="true" className="size-3.5" />
            {uiText('decision_640ae4b')}
          </span>
          <ActionMeta row={{ ...move.actorRow, ts: move.ts }} />
        </div>
        <span
          className={cn(`${typeScale.label} font-semibold`, STATE_TONE[move.state])}
          data-testid="move-state"
        >
          {uiText('moveState', { state: move.state })}
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="font-semibold text-sm leading-snug">
          {uiText.rich('sentence_dc0e3122e8ff', {
            v0: formatMinorExact(move.amountMinor, currency, uiLocale),
            v1: platforms(move.from, uiText, uiLocale),
            v2: platforms(move.to, uiText, uiLocale),
          })}
        </p>
        {move.portfolioName ? (
          <p className="text-muted-foreground text-xs">{move.portfolioName}</p>
        ) : null}
      </div>
      {explainer ? (
        <p
          className={cn(
            'border-l-2 pl-3 text-sm',
            move.state === 'stranded' ? 'border-destructive/60' : 'border-warning/60',
          )}
          data-testid="move-explainer"
        >
          {explainer}
        </p>
      ) : null}
      <ul className="divide-y divide-border/40">
        {move.legs.map((leg) => (
          <MoveLegLine
            afterMinor={leg.afterMinor}
            beforeMinor={leg.beforeMinor}
            currency={currency}
            direction={null}
            entityId={leg.entityId}
            entityName={null}
            key={leg.row.id}
            pct={null}
            platform={leg.platform}
            testId="move-decision-leg"
          >
            <span className="text-muted-foreground text-xs" data-testid="move-leg-state">
              {legStateText(leg, currency, uiText, uiLocale)}
            </span>
            {leg.error || leg.revert?.error ? (
              <details className="text-muted-foreground text-xs">
                <summary>{uiText('capiDiagnosticDetails')}</summary>
                <code>{[leg.error, leg.revert?.error].filter(Boolean).join(' · ')}</code>
              </details>
            ) : null}
            {leg.receipt ? (
              <ReceiptToken className="mt-0 text-xs" platform={leg.platform} value={leg.receipt} />
            ) : null}
            <LegUndo currency={currency} leg={leg} />
          </MoveLegLine>
        ))}
      </ul>
    </li>
  );
}
