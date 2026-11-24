'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type HomeInspection, HomeInspectionContext } from './HomePresentationContext';
import styles from './homeDots.module.css';

export type HomeDot = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  period?: string;
  freshness?: string;
  group?: string;
  tone?: 'positive' | 'attention' | 'neutral' | 'unknown';
  /** Actual observations only: numeric values, dates, or recorded spend shares. */
  number?: number;
  x?: number;
  column?: number;
};

export function HomeDots({
  label,
  title,
  items,
  trend = false,
  columns,
  named = false,
  rows = false,
  groups,
  xAxis,
  valueLabel,
  limit = 24,
  empty,
}: {
  label: string;
  title?: string;
  items: readonly HomeDot[];
  trend?: boolean;
  columns?: readonly string[];
  named?: boolean;
  rows?: boolean;
  groups?: readonly string[];
  xAxis?: { label: string; format: (value: number) => string };
  valueLabel?: (value: number) => string;
  limit?: number;
  empty?: string;
}) {
  const uiText = useTranslations('dashboard');
  const locale = useLocale();
  const formatValue =
    valueLabel ??
    ((value: number) =>
      new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
        value,
      ));
  const [own, setOwn] = useState<HomeInspection>(null);
  const [listSelected, setListView] = useState(false);
  const listView = rows || listSelected;
  const coordinator = useContext(HomeInspectionContext);
  const inspection = coordinator?.active ?? (coordinator ? null : own);
  const setInspection = coordinator?.setActive ?? setOwn;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const detailId = useId();
  const scope = useId();
  const shown = items.slice(0, limit);
  const active =
    inspection?.scope === scope ? shown.find((item) => item.id === inspection.id) : undefined;
  const held = active && inspection?.held ? active.id : null;
  const featured = active ?? shown.find((item) => item.tone === 'attention') ?? shown[0];
  useEffect(() => {
    if (
      inspection?.scope === scope &&
      !items.slice(0, limit).some((item) => item.id === inspection.id)
    )
      setInspection(null);
  }, [inspection, items, limit, scope, setInspection]);
  useEffect(() => {
    if (!active) return;
    const clear = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspection(null);
    };
    window.addEventListener('keydown', clear, true);
    return () => window.removeEventListener('keydown', clear, true);
  }, [active, setInspection]);
  const inspect = (id: string) =>
    setInspection((previous) => (previous?.held ? previous : { scope, id, held: false }));
  const plotted = shown.filter((item) =>
    xAxis
      ? Number.isFinite(item.x) && groups?.includes(item.group ?? '')
      : Number.isFinite(item.number),
  );
  const numbers = plotted.map((item) => item.number ?? 0);
  const low = Math.min(0, ...numbers);
  const high = Math.max(0, ...numbers);
  const dated = plotted.every((item) => Number.isFinite(item.x));
  const xs = plotted.map((item, index) => (dated ? (item.x as number) : index));
  const xLow = xAxis ? 0 : Math.min(...xs);
  const xHigh = Math.max(...xs);
  const xPosition = (item: HomeDot) =>
    xHigh === xLow
      ? 50
      : 5 + (((dated ? (item.x as number) : plotted.indexOf(item)) - xLow) / (xHigh - xLow)) * 90;
  const lane = (index: number, count: number) =>
    count === 1 ? 50 : 12 + (index / (count - 1)) * 76;
  const ticks = xAxis
    ? (groups?.map((group, index) => ({ label: group, position: lane(index, groups.length) })) ??
      [])
    : (high === low ? [low] : [high, (high + low) / 2, low]).map((value, index, values) => ({
        label: formatValue(value),
        position: lane(index, values.length),
      }));
  const yPosition = (item: HomeDot) =>
    xAxis && groups
      ? lane(groups.indexOf(item.group ?? ''), groups.length)
      : high === low
        ? 50
        : 12 + ((high - (item.number ?? 0)) / (high - low)) * 76;
  const isPlot = !listView && (trend || Boolean(xAxis)) && plotted.length > 0;
  const detail = (item: HomeDot) =>
    [item.detail, item.period, item.freshness ?? uiText('source_freshness_not_reported_60993e2')]
      .filter(Boolean)
      .join(' · ');

  function dot(item: HomeDot, plottedPoint = false) {
    const index = shown.indexOf(item);
    return (
      <Tooltip
        key={item.id}
        open={active?.id === item.id}
        onOpenChange={(open) => {
          if (open) inspect(item.id);
          else
            setInspection((previous) =>
              previous?.scope === scope && previous.id === item.id && !previous.held
                ? null
                : previous,
            );
        }}
      >
        <TooltipTrigger
          closeOnClick={false}
          render={
            <Button
              aria-describedby={detailId}
              aria-label={`${item.label}: ${item.value}${item.detail ? `. ${item.detail}` : ''}`}
              aria-pressed={held === item.id}
              className={cn(
                styles.dot,
                plottedPoint && styles.plotDot,
                listView && styles.namedDot,
                named && !listView && styles.mapDot,
              )}
              data-home-dot-id={item.id}
              data-home-dot-column={item.column}
              data-home-dot-label={item.label}
              data-home-dot-number={item.number}
              data-home-dot-x={item.x}
              data-home-dot-tone={item.tone ?? 'positive'}
              data-home-dot-value={item.value}
              data-active={active?.id === item.id || undefined}
              onClick={() =>
                setInspection((previous) =>
                  previous?.scope === scope && previous.id === item.id && previous.held
                    ? null
                    : { scope, id: item.id, held: true },
                )
              }
              onFocus={() => inspect(item.id)}
              onPointerEnter={() => inspect(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setInspection(null);
                  return;
                }
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
                  return;
                event.preventDefault();
                const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
                buttons.current[(index + step + shown.length) % shown.length]?.focus();
              }}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              size="icon-sm"
              style={
                plottedPoint
                  ? { left: `${xPosition(item)}%`, top: `${yPosition(item)}%` }
                  : undefined
              }
              type="button"
              variant="ghost"
            >
              <span aria-hidden="true" className={styles.pixel} />
              {named && !listView ? (
                <span aria-hidden="true" className={styles.mapLabel}>
                  {item.label}
                </span>
              ) : null}
              {listView ? (
                <span className={styles.checkLabel}>
                  {item.label}
                  {listView ? (
                    <small>
                      {item.value}
                      {item.x !== undefined && xAxis
                        ? ` · ${uiText('share_of_spend_a18c065', { share: xAxis.format(item.x) })}`
                        : ''}
                    </small>
                  ) : null}
                </span>
              ) : null}
            </Button>
          }
        />
        <TooltipContent role="tooltip" className={styles.callout} side="top" sideOffset={10}>
          <div>
            <p className={styles.calloutName}>{item.label}</p>
            <p className={styles.calloutValue}>{item.value}</p>
            <p className={styles.calloutDetail}>{detail(item)}</p>
            {held === item.id ? (
              <p className={styles.held}>{uiText('selection_held_escape_to_clear_59329f5')}</p>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (items.length === 0)
    return (
      <p className={styles.empty}>{empty ?? uiText('no_observations_in_this_window_6841bf2')}</p>
    );

  return (
    <TooltipProvider delay={0}>
      <div
        className={cn(styles.inspector, named && styles.namedInspector)}
        data-home-dot-inspector=""
        data-exploring={active ? '' : undefined}
      >
        {xAxis || named || trend ? (
          <div className={styles.chartTop}>
            <p className={styles.chartTitle}>
              {named
                ? uiText('check_map_f9626d8')
                : xAxis
                  ? uiText('recorded_verdict_14102a0')
                  : (title ?? label)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={styles.viewToggle}
              aria-label={
                listView
                  ? named
                    ? uiText('show_map_9166a7d')
                    : uiText('show_plot_653f8a7')
                  : uiText('show_list_28cd43f')
              }
              aria-pressed={listView}
              onClick={() => setListView((value) => !value)}
            >
              {listView
                ? named
                  ? uiText('map_be176b0')
                  : uiText('plot_a0f0539')
                : uiText('list_6f202f5')}
            </Button>
          </div>
        ) : null}
        {isPlot ? (
          <div className={styles.chart} data-plot-kind={xAxis ? 'category' : 'trend'}>
            <div className={styles.plotGrid}>
              <div aria-hidden="true" className={styles.yAxis}>
                {ticks.map((tick) => (
                  <span key={tick.label} style={{ top: `${tick.position}%` }}>
                    {tick.label}
                  </span>
                ))}
              </div>
              <fieldset aria-label={label} className={styles.plot}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className={styles.plotLines}
                >
                  {ticks.map(({ position: y }) => (
                    <line x1="0" x2="100" y1={y} y2={y} key={y} />
                  ))}
                  {trend && plotted.length > 1 ? (
                    <polyline
                      points={plotted
                        .map((item) => `${xPosition(item)},${yPosition(item)}`)
                        .join(' ')}
                    />
                  ) : null}
                  {active && plotted.includes(active) ? (
                    <line
                      className={styles.crosshair}
                      x1={xPosition(active)}
                      x2={xPosition(active)}
                      y1="0"
                      y2="100"
                    />
                  ) : null}
                </svg>
                {plotted.map((item) => dot(item, true))}
              </fieldset>
              <div aria-hidden="true" className={styles.xAxis}>
                {xAxis
                  ? [xLow, (xHigh + xLow) / 2, xHigh].map((value, index) => (
                      <span key={index} style={{ left: `${5 + index * 45}%` }}>
                        {xAxis.format(value)}
                      </span>
                    ))
                  : plotted.map((item) => (
                      <span key={item.id} style={{ left: `${xPosition(item)}%` }}>
                        {item.label}
                      </span>
                    ))}
              </div>
            </div>
            <p className={styles.axisCaption}>
              {xAxis?.label ??
                (dated ? uiText('reported_day_3af5100') : uiText('reported_observation_47f0c3d'))}
            </p>
            {shown.some((item) => !plotted.includes(item)) ? (
              <div className={styles.unplotted}>
                <span>{uiText('no_recorded_value_d9700a8')}</span>
                {shown.filter((item) => !plotted.includes(item)).map((item) => dot(item))}
              </div>
            ) : null}
          </div>
        ) : listView ? (
          <fieldset className={styles.recordList} aria-label={label}>
            {shown.map((item) => dot(item))}
          </fieldset>
        ) : named ? (
          <>
            <div className={styles.checkGroups}>
              {[...new Set(shown.map((item) => item.group ?? item.value))].map((group) => (
                <section className={styles.checkGroup} key={group} aria-label={group}>
                  <h4>
                    {group}
                    <span>
                      {shown.filter((item) => (item.group ?? item.value) === group).length}
                    </span>
                  </h4>
                  <div className={styles.checkList}>
                    {shown
                      .filter((item) => (item.group ?? item.value) === group)
                      .map((item) => dot(item))}
                  </div>
                </section>
              ))}
            </div>
            {featured ? (
              <div className={styles.checkEvidence} data-home-check-evidence="">
                <p className={styles.chartTitle}>
                  {active
                    ? uiText('value_inspecting_764cd14', { value: featured.value })
                    : featured.tone === 'attention'
                      ? uiText('value_first_check_needing_attention_8ef717a', {
                          value: featured.value,
                        })
                      : uiText('value_recorded_check_83842e3', { value: featured.value })}
                </p>
                <h4>{featured.label}</h4>
                <p>{featured.detail}</p>
                <small>
                  {featured.freshness ?? uiText('source_freshness_not_reported_60993e2')}
                </small>
              </div>
            ) : null}
          </>
        ) : columns ? (
          <fieldset aria-label={label} className={styles.calendar}>
            {columns.map((column, index) => (
              <div className={styles.day} key={column}>
                <span className={styles.dayLabel}>{column}</span>
                <div className={styles.dayDots}>
                  {shown.filter((item) => item.column === index + 1).map((item) => dot(item))}
                </div>
                {!shown.some((item) => item.column === index + 1) ? (
                  <span
                    className={styles.noPost}
                    role="img"
                    aria-label={uiText('no_records_e19d479')}
                  >
                    —
                  </span>
                ) : null}
              </div>
            ))}
          </fieldset>
        ) : (
          <fieldset aria-label={label} className={styles.dots}>
            {shown.map((item) => dot(item))}
          </fieldset>
        )}
        {items.length > limit ? (
          <p className={styles.caption}>
            {uiText('showing_limit_of_total_open_the_module_for_al_5233d3c', {
              limit,
              total: items.length,
            })}
          </p>
        ) : null}
        <p
          aria-live="polite"
          className="sr-only"
          data-home-dot-detail=""
          data-selected-id={held ?? undefined}
          id={detailId}
          role="status"
        >
          {active
            ? `${active.label} · ${active.value}. ${detail(active)}`
            : uiText('hover_or_focus_a_dot_to_inspect_click_to_hold_b1225f6')}
        </p>
      </div>
    </TooltipProvider>
  );
}
