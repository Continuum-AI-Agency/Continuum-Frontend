'use client';

// O03 Decisions: the cards waiting on this account, in impact order. Each one carries the title
// the Optimizer generated, the line that names its figures, bars of the entities those figures
// compare, what acting is worth, and the button the reading's mode allows.
//
// Meta reads the account read's candidates and guards, with the approvals made since the read
// was composed (as the Overview applies them). Google reads optimizer_get_platform_cards. Every
// button is a write the Overview and the Actions queue already make (the platform card's
// approval dialog, the recommendation's rejected status), the clipboard, the create flow or a
// link; a verb with no wiring shows disabled and says why.

import type { AccountCandidate } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { ArrowRight } from '@/components/icons';
import {
  useAccountApprovals,
  useOptimizerAccountRead,
  useOptimizerMutations,
  useOptimizerPlatformCards,
} from '../../../useOptimizerData';
import { cardActionsOf } from '../../platformCards/platformCardActionModel';
import { ModuleFrame, ModuleFrameSkeleton, type ModuleFrameState } from '../ModuleFrame';
import type { BoardModuleProps } from '../types';
import type { DismissState } from './decisions/DecisionControls';
import { DecisionsView } from './decisions/DecisionsView';
import type { ControlContext } from './decisions/decisionControl';
import { decisionCardsOf, planPerDay, readCandidatesOf } from './decisions/decisionsModel';

const TEST_ID = 'board-module-decisions';

type DecisionsSource =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  /** Nothing to read yet, said plainly: it never reads as "nothing to decide". */
  | { status: 'empty'; message: string }
  | {
      status: 'ready';
      candidates: readonly AccountCandidate[];
      currency: string | null;
      dailySpend: number | null;
    };

/** What the frame tells the board's bench: a read that is not there yet is `missing`. */
const FRAME_STATE: Record<DecisionsSource['status'], ModuleFrameState> = {
  loading: 'loading',
  error: 'error',
  empty: 'missing',
  ready: 'ready',
};

/** Dismiss records the recommendation as rejected, the decision the Actions queue records. The
 *  card says "Dismissed" once the write returned; the refetch then takes it off the list. */
function useDismiss(brandId: string, adAccountId: string | null) {
  const { setStatus } = useOptimizerMutations(brandId, adAccountId);
  const { mutate, isPending, variables } = setStatus;
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const pendingId = isPending ? (variables?.recommendation_id ?? null) : null;

  const dismiss = useCallback(
    (recommendationId: string) => {
      setFailed((current) => {
        const next = new Set(current);
        next.delete(recommendationId);
        return next;
      });
      mutate(
        { recommendation_id: recommendationId, status: 'rejected' },
        {
          onSuccess: () => setDone((current) => new Set(current).add(recommendationId)),
          onError: () => setFailed((current) => new Set(current).add(recommendationId)),
        },
      );
    },
    [mutate],
  );

  const stateOf = useCallback(
    (recommendationId: string | null): DismissState => {
      if (recommendationId == null) return 'idle';
      if (done.has(recommendationId)) return 'done';
      if (pendingId === recommendationId) return 'pending';
      return failed.has(recommendationId) ? 'failed' : 'idle';
    },
    [done, failed, pendingId],
  );

  return { dismiss, stateOf };
}

function ReviewAll({ onOpenActions }: { onOpenActions: () => void }) {
  const uiText = useTranslations('scale');
  return (
    <button
      className="hit-area inline-flex items-center gap-1 font-semibold text-primary-ink text-xs hover:underline"
      data-testid="decisions-review-all"
      onClick={onOpenActions}
      type="button"
    >
      {uiText('review_all_d05163f')}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </button>
  );
}

function DecisionsModule({ ctx, slot, source }: BoardModuleProps & { source: DecisionsSource }) {
  const uiText = useTranslations('scale');
  const { dismiss, stateOf } = useDismiss(ctx.brandId, ctx.adAccountId);
  const cards = useMemo(
    () =>
      source.status === 'ready'
        ? decisionCardsOf({
            candidates: source.candidates,
            currency: source.currency,
            dailySpend: source.dailySpend,
            cardActions: cardActionsOf(source.candidates),
          })
        : [],
    [source],
  );
  const portfolioNames = useMemo(
    () => new Map(ctx.portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [ctx.portfolios],
  );

  if (source.status === 'loading') {
    return <ModuleFrameSkeleton size={slot.size} testId={TEST_ID} />;
  }

  const context: ControlContext = {
    mode: ctx.reading.mode,
    platform: ctx.platform,
    adAccountId: ctx.adAccountId,
    firstFix: cards.find((card) => card.group === 'fix')?.title ?? null,
  };
  const nothingWaits = source.status === 'ready' && cards.length === 0;

  return (
    <ModuleFrame
      action={nothingWaits ? null : <ReviewAll onOpenActions={ctx.onOpenActions} />}
      reason={slot.reason}
      size={slot.size}
      state={FRAME_STATE[source.status]}
      testId={TEST_ID}
      title={uiText('decisions_cfa6a08')}
    >
      {source.status === 'ready' ? (
        <DecisionsView
          cards={cards}
          context={context}
          dismissStateOf={stateOf}
          onCreatePortfolio={ctx.onCreatePortfolio}
          onDismiss={dismiss}
          onSelectPortfolio={ctx.onSelectPortfolio}
          portfolioNames={portfolioNames}
          size={slot.size}
        />
      ) : (
        <p
          className="text-muted-foreground text-sm"
          data-testid={`${TEST_ID}-${source.status}`}
          role="status"
        >
          {source.message}
        </p>
      )}
    </ModuleFrame>
  );
}

/** Meta: the account read of the selected act_ account. */
function MetaDecisions({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const accountRead = useOptimizerAccountRead(ctx.brandId, ctx.adAccountId);
  const approvals = useAccountApprovals(ctx.brandId, ctx.adAccountId);
  const read = accountRead.data?.read ?? null;
  const { isLoading, isError } = accountRead;
  const source = useMemo((): DecisionsSource => {
    if (ctx.adAccountId == null) {
      return {
        status: 'empty',
        message: uiText('pick_a_meta_ad_account_to_see_what_waits_on_i_86f6084'),
      };
    }
    if (read) {
      return {
        status: 'ready',
        candidates: readCandidatesOf(read, approvals.data),
        currency: read.currency ?? ctx.currency,
        dailySpend: read.scale_per_day ?? planPerDay(ctx.portfolios),
      };
    }
    if (isLoading) return { status: 'loading' };
    if (isError) {
      return {
        status: 'error',
        message: uiText('the_account_read_could_not_be_loaded_so_this__92cbf58'),
      };
    }
    return {
      status: 'empty',
      message: uiText('the_optimizer_has_not_read_this_account_yet_i_a31ecd0'),
    };
  }, [
    ctx.adAccountId,
    ctx.currency,
    ctx.portfolios,
    read,
    approvals.data,
    isLoading,
    isError,
    uiText,
  ]);
  return <DecisionsModule ctx={ctx} slot={slot} source={source} />;
}

/** Google: the brand's pending Google cards, across its Google portfolios. */
function GoogleDecisions({ ctx, slot }: BoardModuleProps) {
  const uiText = useTranslations('scale');
  const platformCards = useOptimizerPlatformCards(ctx.brandId, 'google_ads');
  const source = useMemo((): DecisionsSource => {
    switch (platformCards.status) {
      case 'loading':
        return { status: 'loading' };
      case 'unavailable':
        return {
          status: 'empty',
          message: uiText('google_s_recommendations_are_not_available_on_9ae6dd9'),
        };
      case 'error':
        return {
          status: 'error',
          message: uiText('google_s_recommendations_could_not_be_read_so_f6becd5'),
        };
      case 'ready':
        return {
          status: 'ready',
          candidates: platformCards.cards,
          currency: ctx.currency,
          dailySpend: planPerDay(ctx.portfolios),
        };
    }
  }, [platformCards, ctx.currency, ctx.portfolios, uiText]);
  return <DecisionsModule ctx={ctx} slot={slot} source={source} />;
}

export default function DecisionsStack({ ctx, slot }: BoardModuleProps) {
  return ctx.platform === 'meta' ? (
    <MetaDecisions ctx={ctx} slot={slot} />
  ) : (
    <GoogleDecisions ctx={ctx} slot={slot} />
  );
}
