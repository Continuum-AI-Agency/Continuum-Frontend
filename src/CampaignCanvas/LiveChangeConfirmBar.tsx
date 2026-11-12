'use client';

import type { JainaApprovalVariant, LiveChangePreviewPayload } from '@continuum/contracts';
import { useTranslations as useBetaTranslations } from 'next-intl';
import * as React from 'react';
import { type LiveChangeDecision, liveChangeConfirmBarOf } from '@/lib/campaign-canvas/liveChange';

export type ConfirmVariantOption = {
  variant: JainaApprovalVariant;
  label: string;
};

/** How long "Asking Jaina…" holds before the button is offered again (the turn may be held). */
export const IMPLEMENT_RETRY_MS = 15_000;

const PRIMARY =
  'rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary';
const SECONDARY =
  'rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary';

/**
 * What the canvas offers to do with the change it shows, under the before/after it rests on.
 * The decision in flight comes from the chat surface (`pendingDecision`), the single record the
 * card reads too, so a failed send re-enables the buttons and a decision made on the card
 * disables these. Remounted per preview (the host keys it on the part id), so one preview's
 * click never carries to the next.
 */
export function LiveChangeConfirmBar({
  preview,
  decision,
  pendingDecision,
  variants,
  onDecide,
  onImplement,
  implementBlocked = false,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
  pendingDecision: 'approve' | 'deny' | null;
  /** The choices the gated tool's card offers; null for an ordinary Approve/Deny. */
  variants: readonly ConfirmVariantOption[] | null;
  onDecide?: (decision: 'approve' | 'deny', variant?: JainaApprovalVariant) => void;
  onImplement?: () => void;
  /**
   * A run holds the conversation, or this click's turn is still waiting to be sent. Implement
   * stays disabled for as long: a click in that window would be sent into a busy conversation or
   * twice.
   */
  implementBlocked?: boolean;
}) {
  const betaUiText = useBetaTranslations('scale');

  const [asked, setAsked] = React.useState(false);
  React.useEffect(() => {
    if (!asked) return;
    const timer = setTimeout(() => setAsked(false), IMPLEMENT_RETRY_MS);
    return () => clearTimeout(timer);
  }, [asked]);
  // "Asking Jaina…" holds until the turn it asked for has run (blocked, then free again). If
  // that turn came to nothing and the proposal is still a proposal, the button comes back.
  const wasBlockedRef = React.useRef(false);
  React.useEffect(() => {
    if (wasBlockedRef.current && !implementBlocked) setAsked(false);
    wasBlockedRef.current = implementBlocked;
  }, [implementBlocked]);

  const bar = liveChangeConfirmBarOf({
    preview,
    decision,
    canDecide: Boolean(onDecide) && pendingDecision === null,
    canImplement: Boolean(onImplement),
  });
  const deciding = pendingDecision !== null;
  if (bar.kind === 'none' && !deciding) return null;

  const note =
    bar.kind === 'google_note'
      ? betaUiText('beta_de7643cfc7cb')
      : deciding
        ? pendingDecision === 'approve'
          ? betaUiText('beta_e99dcb0a97a2')
          : betaUiText('beta_fb03c72b9ced')
        : bar.kind === 'confirm'
          ? preview.projection
            ? betaUiText('beta_e78db4290f83')
            : betaUiText('beta_9d60cdf969d1')
          : betaUiText('beta_69bb060aa534');

  return (
    <fieldset
      className="m-0 flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2"
      data-testid="live-change-confirm"
    >
      <legend className="sr-only">{betaUiText('beta_704ac1d7acd8')}</legend>
      <span className="min-w-0 text-[13px] text-muted-foreground" aria-live="polite">
        {note}
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {bar.kind === 'confirm' || deciding ? (
          <>
            <button
              type="button"
              disabled={deciding || bar.kind !== 'confirm'}
              onClick={() => onDecide?.('deny')}
              className={SECONDARY}
              data-testid="live-change-deny"
            >
              {betaUiText('beta_a2d285b35287')}
            </button>
            {(variants ?? [{ variant: 'apply' as const, label: 'Confirm and apply' }]).map(
              (option) => (
                <button
                  key={option.variant}
                  type="button"
                  disabled={deciding || bar.kind !== 'confirm'}
                  onClick={() => onDecide?.('approve', variants ? option.variant : undefined)}
                  className={PRIMARY}
                  data-testid={`live-change-approve-${option.variant}`}
                >
                  {option.label}
                </button>
              ),
            )}
          </>
        ) : null}
        {bar.kind === 'implement' ? (
          <button
            type="button"
            disabled={asked || implementBlocked}
            onClick={() => {
              if (asked || implementBlocked) return;
              setAsked(true);
              onImplement?.();
            }}
            className={PRIMARY}
            data-testid="live-change-implement"
          >
            {asked
              ? betaUiText('beta_eb0bfc523238')
              : implementBlocked
                ? betaUiText('beta_a3d6d426fee7')
                : betaUiText('beta_1ddceca8de78')}
          </button>
        ) : null}
      </span>
    </fieldset>
  );
}
