'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Separator } from '@/components/ui/separator';
import type { CanvasGateStatus } from '@/lib/paid-media/jaina-activity-client';
import type { BaseCampaignNodeData } from '../types';

/**
 * The footer a HYDRATED node grows: which approval stands between it and Meta, who
 * signed it, and what it is doing on Meta if it got there.
 *
 * One component rather than the same block copied into five node files — a gate that
 * read "Approved" on an ad set and "approved" on an ad would be two vocabularies for
 * one fact. Draft nodes render nothing at all, which is how the two kinds of node stay
 * visually distinguishable without a badge announcing it.
 *
 * The pill vocabulary is deliberately the SAME one `ScaffoldStatusPill` uses on the
 * scaffold card, for the same reason: a reader moving between the two surfaces should
 * not have to relearn what a colour means.
 */

type Tone = 'success' | 'error' | 'warning' | 'info';

/** Short and absolute. A relative time on a record of an approval invites re-reading it. */
const formatApprovedAt = (value: string, locale: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function NodeProvenance({ data }: { data: BaseCampaignNodeData }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const GATE_PRESENTATION: Record<CanvasGateStatus, { tone: Tone; label: string; pulse: boolean }> =
    useMemo(
      () => ({
        proposed: { tone: 'info', label: uiText('proposed_9b0c660'), pulse: false },
        awaiting_approval: {
          tone: 'warning',
          label: uiText('awaiting_approval_ae25c9b'),
          pulse: true,
        },
        approved: { tone: 'success', label: uiText('approved_87b42e4'), pulse: false },
        denied: { tone: 'error', label: uiText('denied_da404de'), pulse: false },
        expired: { tone: 'warning', label: uiText('expired_424a255'), pulse: false },
        consumed: { tone: 'success', label: uiText('approval_used_7e440fe'), pulse: false },
      }),
      [uiText],
    );

  const provenance = data.provenance;
  if (!provenance) return null;

  const gate = provenance.gate;
  const presentation = GATE_PRESENTATION[gate?.status ?? 'proposed'];
  const approver = gate?.approvedBy;
  const approvedAt = gate?.approvedAt;
  const metaStatusKeys = {
    ACTIVE: 'entityActive',
    PAUSED: 'entityPaused',
    ARCHIVED: 'entityArchived',
    DELETED: 'entityDeleted',
  } as const;
  const metaStatusKey =
    provenance.metaStatus && Object.hasOwn(metaStatusKeys, provenance.metaStatus)
      ? metaStatusKeys[provenance.metaStatus as keyof typeof metaStatusKeys]
      : null;

  return (
    <>
      <Separator className="my-2" />
      <div className="flex flex-col gap-1.5" data-testid="canvas-node-provenance">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill className="gap-1.5 whitespace-nowrap" data-testid="canvas-node-gate">
            <PillIndicator variant={presentation.tone} pulse={presentation.pulse} />
            {presentation.label}
          </Pill>
          {provenance.metaStatus ? (
            <Pill
              className="gap-1.5 whitespace-nowrap"
              data-testid="canvas-node-meta-status"
              title={uiText('the_status_this_object_holds_in_meta_ads_mana_292cd2d')}
            >
              <PillIndicator
                variant={provenance.metaStatus === 'ACTIVE' ? 'success' : 'info'}
                pulse={false}
              />
              {metaStatusKey ? uiText(metaStatusKey) : provenance.metaStatus}
            </Pill>
          ) : null}
        </div>

        {approver || approvedAt ? (
          <span className="text-2xs text-muted-foreground" data-testid="canvas-node-approver">
            {approver
              ? uiText('template_b02b8406d8dc', { v0: approver })
              : uiText('by_a_former_member_bde6d42')}
            {approvedAt ? ` · ${formatApprovedAt(approvedAt, uiLocale)}` : ''}
          </span>
        ) : null}

        <span
          className="font-mono text-2xs text-muted-foreground"
          data-testid="canvas-node-meta-id"
        >
          {data.metaId
            ? uiText('template_096aad8393d3', { v0: data.metaId })
            : uiText('template_337832cd083c', { v0: provenance.pathKey })}
        </span>
      </div>
    </>
  );
}
