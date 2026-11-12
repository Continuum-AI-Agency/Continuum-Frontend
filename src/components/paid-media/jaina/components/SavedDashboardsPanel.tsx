'use client';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { uiDateFormat } from '@/lib/paid-media/uiDateFormat';

// Saved dashboards, above the chat: a collapsed strip that opens into each saved report's
// blocks, rendered by the same block renderer. "Refresh" is a prepared question back to
// Jaina — the numbers on a dashboard are the numbers of the day it was saved, and the
// strip says so. Each module also says whether it is re-runnable — whether the row kept
// the tool, entity and window it was computed for — and which window that was; the picker
// that re-runs it is not here yet.

import { type DashboardBlockSpec, type JainaDashboard, rangeSpecLabel } from '@continuum/contracts';
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useJainaBrandScope } from '@/lib/jaina/brandScope';
import { orderDashboardBlocks } from '@/lib/jaina/dashboardBlocks';
import { deleteDashboard, listDashboards } from '@/lib/jaina/dashboards.client';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { checkpointBlockV2Schema, degradeToNarrativeBlockV2 } from '@/lib/jaina/schemas';
import { BlockRenderer } from '../blocks/BlockRenderer';

const DERIVED_NOTE: Record<
  NonNullable<NonNullable<DashboardBlockSpec['spec']>['derived']>,
  string
> = {
  severity: 'its judgements are recomputed, not re-fetched',
  pacing: 'its pacing is recomputed, not re-fetched',
  comparison: 'its comparison is recomputed, not re-fetched',
};

const SPEC_REASON_IDS: Record<string, string> = {
  'the scope frame is composed from the other blocks, not fetched': 'scope',
  'a survey is a question to the reader, not a fetch': 'survey',
  'a templated answer is composed from every read of its turn, not one fetch': 'template',
  'no tool recorded': 'tool',
  'no entity recorded': 'entity',
  'no window recorded': 'window',
};
function specReason(reason: string | null, t: ScaleCopy): string {
  if (!reason) return t('unknown_b23a6a8');
  const known = SPEC_REASON_IDS[reason];
  const tools = /^cites (\d+) tools \((.+)\)$/.exec(reason);
  const entity = /^entity "(.*)" carries no id$/.exec(reason);
  const window = /^window "(.*)" has no dates on record and no trailing-day preset$/.exec(reason);
  if (!known && !tools && !entity && !window) return reason;
  return t('savedSpecReason', {
    reason: known ?? (tools ? 'tools' : entity ? 'entityId' : 'windowDates'),
    count: tools ? Number(tools[1]) : 0,
    name: entity?.[1] ?? window?.[1] ?? '',
    tools: tools?.[2] ?? '',
  });
}

/** One line under a module: re-runnable and for which window, or why not. */
export function describeBlockSpec(
  entry: DashboardBlockSpec | undefined,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  if (!entry) return uiTranslate ? uiTranslate('savedSpecMissing') : 'Saved without a re-run spec';
  if (!entry.spec)
    return uiTranslate
      ? uiTranslate('helper_b7d6c82ec61b', {
          v0: specReason(entry.reason, uiTranslate),
        })
      : `Not re-runnable: ${entry.reason}`;
  if (uiTranslate) {
    const range = entry.spec.range;
    const window =
      range.kind === 'preset'
        ? uiTranslate('savedSpecWindow', {
            preset: range.preset,
            days: range.preset === 'flight' ? 0 : Number(range.preset.slice(1)),
          })
        : range.from === range.to
          ? uiDateFormat(uiLocale, {
              dateStyle: 'medium',
              timeZone: 'UTC',
            }).format(new Date(`${range.from}T00:00:00Z`))
          : `${uiDateFormat(uiLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${range.from}T00:00:00Z`))} → ${uiDateFormat(uiLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${range.to}T00:00:00Z`))}`;
    return uiTranslate('savedSpecDescription', {
      window,
      derived: entry.spec.derived ?? 'none',
    });
  }
  const derived = entry.spec.derived ? ` · ${DERIVED_NOTE[entry.spec.derived]}` : '';
  return `Re-runnable · computed for ${rangeSpecLabel(entry.spec.range)}${derived}`;
}

export function SavedDashboardsPanel() {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const scope = useJainaBrandScope();
  const brandId = scope?.brandId ?? null;
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dashboards, setDashboards] = useState<JainaDashboard[]>([]);
  // A plain effect rather than a query hook: this strip must render inside any host,
  // including one with no query client, and an unreachable table simply shows nothing.
  const reload = useCallback(async () => {
    if (!brandId) return;
    try {
      setDashboards(await listDashboards(brandId));
    } catch {
      setDashboards([]);
    }
  }, [brandId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  if (!scope || dashboards.length === 0) return null;

  const remove = async (id: string) => {
    await deleteDashboard(id);
    if (openId === id) setOpenId(null);
    await reload();
  };

  return (
    <section
      className="mb-2 rounded-lg border border-border/60 bg-background/70 text-sm"
      data-testid="saved-dashboards"
    >
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {uiText.rich('sentence_375df8af6920', {
          v0: () =>
            expanded ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            ),
          v1: () => <span className="text-muted-foreground text-xs">({dashboards.length})</span>,
        })}
      </button>
      {/* The opened dashboard is a REPORT — five modules of charts and tables — and it lands
       *  inside a host that bounds its own height. Without a scroll of its own the list grew
       *  past the host, the host clipped it, and there was nowhere to scroll: the only way
       *  back to the page was to close the panel. The names stay put; the reading scrolls. */}
      {expanded ? (
        <ul className="max-h-[min(62vh,720px)] divide-y divide-border/50 overflow-y-auto overscroll-contain border-border/60 border-t">
          {dashboards.map((dashboard) => {
            const isOpen = openId === dashboard.id;
            const refreshPrompt =
              dashboard.source_prompt ??
              `Refresh the analysis "${dashboard.source_title ?? dashboard.name}" with today's data, same scope and window.`;
            const specByBlock = new Map(
              (dashboard.spec?.blocks ?? []).map((entry) => [entry.block_id, entry] as const),
            );
            return (
              <li className="px-3 py-2" key={dashboard.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 truncate text-left font-medium"
                    onClick={() => setOpenId(isOpen ? null : dashboard.id)}
                    type="button"
                  >
                    {dashboard.name}
                  </button>
                  <span className="text-muted-foreground text-xs">
                    {uiText.rich('sentence_d16fe834cc14', {
                      date: uiDateFormat(uiLocale, {
                        month: 'short',
                        day: 'numeric',
                      }).format(new Date(dashboard.created_at)),
                      count: dashboard.blocks.length,
                      hasWindow: dashboard.window_label ? 'yes' : 'no',
                      window: dashboard.window_label ?? '',
                    })}
                  </span>
                  <a
                    className="inline-flex items-center gap-1 text-primary-ink text-xs hover:underline"
                    href={jainaPromptHref(refreshPrompt)}
                  >
                    <RefreshCwIcon className="size-3" />
                    {uiText('ask_jaina_to_refresh_8e49228')}
                  </a>
                  <Button
                    aria-label={uiText('template_ebfde02db718', {
                      v0: dashboard.name,
                    })}
                    onClick={() => void remove(dashboard.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                {isOpen ? (
                  <div className="mt-2 space-y-3">
                    <p className="text-muted-foreground text-xs">
                      {uiText.rich('sentence_7057a8de711c', {
                        v0: dashboard.spec
                          ? ''
                          : uiText('saved_without_a_re_run_spec_its_figures_canno_77d8d6f'),
                      })}
                    </p>
                    {/* The scope frame first, as the live report reads: the window before
                     *  the figures, even on a row saved before the save kept it in front. */}
                    {orderDashboardBlocks(
                      dashboard.blocks.map((raw) => {
                        const parsed = checkpointBlockV2Schema.safeParse(raw);
                        return parsed.success ? parsed.data : degradeToNarrativeBlockV2(raw);
                      }),
                    ).map((block, index) => (
                      <div key={`${dashboard.id}:${block.block_id}:${index}`}>
                        <BlockRenderer block={block} isStreaming={false} />
                        {dashboard.spec ? (
                          <p
                            className="mt-1 text-muted-foreground text-xs"
                            data-testid="block-rerun"
                          >
                            {describeBlockSpec(specByBlock.get(block.block_id), uiText, uiLocale)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
