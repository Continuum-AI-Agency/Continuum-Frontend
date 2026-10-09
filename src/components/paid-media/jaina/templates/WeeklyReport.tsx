'use client';

// OWNED BY the weekly_report agent — only that agent edits this file. Recipe:
// Continuum-Backend/App/agents-ts/Jaina/src/agents/templates/README.md.
//
// `weekly_report` — the weekly report as one answer. Under the thesis the body reads top to
// bottom: the header that states both windows, the timezone and the currency; the tiles,
// each against the week before with its read; one section per Optimizer objective with its
// Signal, the Period A | Period B table and what / so what / now what (or the explicit
// "no active campaigns" note); then the recommendation cards. The justification keeps only
// "measured" — the reads and windows — through the generic section body.
//
// Every value on screen is a figure element (`FigureById` / `FigureText`); this file prints
// words and dates, never a number of its own.

import type {
  TemplateFigure,
  WeeklyReportBody,
  WeeklyReportObjective,
  WeeklyReportPeriod,
  WeeklyReportPeriodRow,
  WeeklyReportRecommendation,
  WeeklyReportTile,
  WeeklyTileRead,
} from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { TILE_FIGURE } from '../blocks/MetricTiles';
import { JAINA_MODULE, MODULE_TINT } from '../blocks/modules';
import { JAINA_TABLE, JAINA_TYPE, JUDGEMENT_TEXT, READ_JUDGEMENT } from '../reading';
import { FigureById, FigureText } from './Figure';
import { GenericSectionBody, TONE_JUDGEMENT } from './GenericTemplate';
import type { TemplateHeroProps, TemplateRenderer } from './types';

type Figures = ReadonlyArray<TemplateFigure>;

const TILE_READ: Record<WeeklyTileRead, { label: string; className: string }> = {
  mejor: { label: 'Better', className: JUDGEMENT_TEXT.positive },
  peor: { label: 'Worse', className: JUDGEMENT_TEXT.risk },
  igual: { label: 'Unchanged', className: JUDGEMENT_TEXT.neutral },
  sin_comparacion: { label: 'No comparison', className: JUDGEMENT_TEXT.unjudged },
};

const IMPACT_LABEL: Record<WeeklyReportRecommendation['impact']['level'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_LABEL: Record<WeeklyReportRecommendation['priority'], string> = {
  this_week: 'This week',
  next_2_weeks: 'Next 2 weeks',
};

const LEVEL_LABEL: Record<WeeklyReportRecommendation['where']['level'], string> = {
  account: 'Account',
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
};

const range = (period: Pick<WeeklyReportPeriod, 'since' | 'until'>): string =>
  `${period.since} – ${period.until}`;

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className={cn('text-muted-foreground', JAINA_TYPE.label)}>{children}</span>
);

function Header({ header }: { header: WeeklyReportBody['header'] }) {
  const periods = [
    { key: 'a', name: 'Period A', period: header.period_a },
    { key: 'b', name: 'Period B', period: header.period_b },
  ] as const;
  return (
    <header data-testid="weekly-report-header" className="space-y-2">
      <p className={cn('font-semibold text-foreground', JAINA_TYPE.body)}>
        {header.brand_name}
        <span className="font-normal text-muted-foreground"> · {header.ad_account_id}</span>
      </p>
      <dl className={cn('grid gap-x-4 gap-y-1 sm:grid-cols-2', JAINA_TYPE.table)}>
        {periods.map(({ key, name, period }) => (
          <div key={key} data-period={key} data-period-range={`${period.since}..${period.until}`}>
            <dt className="inline">
              <Label>{name}</Label>{' '}
            </dt>
            <dd className="inline text-foreground">
              <span className="tabular-nums">{range(period)}</span>
              <span className="text-muted-foreground"> · {period.label}</span>
            </dd>
          </div>
        ))}
        <div data-testid="weekly-report-timezone">
          <dt className="inline">
            <Label>Timezone</Label>{' '}
          </dt>
          <dd className="inline text-foreground">{header.timezone}</dd>
        </div>
        <div data-testid="weekly-report-currency">
          <dt className="inline">
            <Label>Currency</Label>{' '}
          </dt>
          <dd className="inline text-foreground">{header.currency ?? 'Unknown'}</dd>
        </div>
      </dl>
    </header>
  );
}

function Tile({ tile, figures }: { tile: WeeklyReportTile; figures: Figures }) {
  const read = TILE_READ[tile.read];
  return (
    <li
      data-tile={tile.id}
      data-tile-read={tile.read}
      className={cn(
        'min-w-0 space-y-1 rounded-xl p-3 sm:p-4',
        MODULE_TINT[READ_JUDGEMENT[tile.read]],
      )}
    >
      <Label>{tile.label}</Label>
      <p className={cn(TILE_FIGURE, 'text-foreground')}>
        <FigureById figures={figures} id={tile.figure_id} />
      </p>
      <p className={cn('text-muted-foreground', JAINA_TYPE.table)}>
        {'Prior week '}
        {tile.prior_figure_id ? (
          <FigureById
            figures={figures}
            id={tile.prior_figure_id}
            className="font-normal text-muted-foreground"
          />
        ) : (
          '—'
        )}
      </p>
      <p className={cn('font-semibold', JAINA_TYPE.table, read.className)} data-tile-read-label>
        {read.label}
      </p>
    </li>
  );
}

const ROW_METRICS: ReadonlyArray<{ key: keyof WeeklyReportPeriodRow; label: string }> = [
  { key: 'spend', label: 'Spend' },
  { key: 'results', label: 'Results' },
  { key: 'cost_per_result', label: 'Cost per result' },
  { key: 'target', label: 'Target' },
  { key: 'delta_vs_target', label: 'Δ vs target' },
];

/** Period A beside Period B, one metric per row, so it reads at phone width. */
function PeriodTable({
  a,
  b,
  header,
  figures,
}: {
  a: WeeklyReportPeriodRow;
  b: WeeklyReportPeriodRow;
  header: WeeklyReportBody['header'];
  figures: Figures;
}) {
  return (
    <div className={JAINA_TABLE.wrap}>
      <table className={JAINA_TABLE.table} data-testid="weekly-report-period-table">
        <thead>
          <tr className={JAINA_TABLE.headRow}>
            <th scope="col" className={cn(JAINA_TABLE.th, 'text-left')}>
              Metric
            </th>
            <th scope="col" className={cn(JAINA_TABLE.th, 'text-right')} data-column="period_a">
              Period A
              <span className="block font-normal normal-case tracking-normal">
                {range(header.period_a)}
              </span>
            </th>
            <th scope="col" className={cn(JAINA_TABLE.th, 'text-right')} data-column="period_b">
              Period B
              <span className="block font-normal normal-case tracking-normal">
                {range(header.period_b)}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ROW_METRICS.map(({ key, label }) => (
            <tr key={key} className={JAINA_TABLE.row} data-metric={key}>
              <th
                scope="row"
                className={cn(JAINA_TABLE.td, 'text-left font-normal text-foreground')}
              >
                {label}
              </th>
              {[a, b].map((row, index) => (
                <td key={index === 0 ? 'a' : 'b'} className={cn(JAINA_TABLE.td, 'text-right')}>
                  {row[key] ? <FigureById figures={figures} id={row[key]} /> : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const THREE_PARTS = [
  { key: 'what', label: 'What' },
  { key: 'so_what', label: 'So what' },
  { key: 'now_what', label: 'Now what' },
] as const;

function ObjectiveSection({
  section,
  header,
  figures,
}: {
  section: WeeklyReportObjective;
  header: WeeklyReportBody['header'];
  figures: Figures;
}) {
  const tone = JUDGEMENT_TEXT[TONE_JUDGEMENT[section.signal.tone]];
  return (
    <section
      data-objective={section.objective}
      data-objective-active={section.active ? 'true' : 'false'}
      className={cn('break-inside-avoid space-y-3', JAINA_MODULE.neutral)}
    >
      <h4 className={cn('font-semibold text-foreground', JAINA_TYPE.body)}>{section.label}</h4>
      <p
        className={JAINA_TYPE.body}
        data-testid="weekly-report-signal"
        data-tone={section.signal.tone}
      >
        <span className={cn('mr-1.5', JAINA_TYPE.label, tone)}>Signal</span>
        <span className="text-foreground">
          <FigureText text={section.signal.text} figures={figures} />
        </span>
      </p>
      {section.active && section.period_a && section.period_b ? (
        <PeriodTable a={section.period_a} b={section.period_b} header={header} figures={figures} />
      ) : (
        <p
          data-testid="weekly-report-no-active"
          className={cn('text-muted-foreground', JAINA_TYPE.body)}
        >
          <FigureText text={section.no_active_note ?? 'No active campaigns.'} figures={figures} />
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-3">
        {THREE_PARTS.map(({ key, label }) => (
          <div key={key} data-part={key} className="space-y-1">
            <Label>{label}</Label>
            <p className={cn('text-foreground', JAINA_TYPE.table)}>
              <FigureText text={section[key]} figures={figures} />
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendationCard({
  card,
  figures,
}: {
  card: WeeklyReportRecommendation;
  figures: Figures;
}) {
  return (
    <li
      data-recommendation={card.id}
      data-priority={card.priority}
      className={cn('break-inside-avoid space-y-2', JAINA_MODULE.decision)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p
          className={cn('min-w-0 flex-1 font-semibold text-foreground', JAINA_TYPE.body)}
          data-part="what"
        >
          <FigureText text={card.what} figures={figures} />
        </p>
        <span
          data-part="priority"
          className={cn(
            'shrink-0 rounded-full bg-background/80 px-2.5 py-0.5 text-foreground',
            JAINA_TYPE.table,
          )}
        >
          {PRIORITY_LABEL[card.priority]}
        </span>
      </div>
      <dl className={cn('grid gap-2', JAINA_TYPE.table)}>
        <div data-part="where">
          <dt>
            <Label>Where</Label>
          </dt>
          <dd className="text-foreground">
            {card.where.entity_name}
            <span className="text-muted-foreground">
              {' '}
              · {LEVEL_LABEL[card.where.level]} · {card.where.entity_id}
            </span>
          </dd>
        </div>
        <div data-part="why">
          <dt>
            <Label>Why</Label>
          </dt>
          <dd className="text-foreground">
            <FigureText text={card.why.text} figures={figures} />
            <span className="mt-0.5 block text-muted-foreground" data-part="source">
              Source: {card.why.source.tool} · {card.why.source.window.label} (
              {range(card.why.source.window)})
            </span>
          </dd>
        </div>
        <div data-part="impact" data-impact-level={card.impact.level}>
          <dt className="flex items-center gap-2">
            <Label>Expected impact</Label>
            <span
              data-impact-basis={card.impact.basis}
              className={cn(
                'rounded bg-background/80 px-1.5 text-muted-foreground',
                JAINA_TYPE.label,
              )}
            >
              Estimate
            </span>
          </dt>
          <dd className="text-foreground">
            <span className="font-semibold">{IMPACT_LABEL[card.impact.level]}</span>
            {' · '}
            <FigureText text={card.impact.note} figures={figures} />
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function WeeklyReportHero({ block }: TemplateHeroProps) {
  const body = block.weekly_report;
  if (!body) return null;
  const { figures } = block;
  return (
    <div className="space-y-4" data-testid="weekly-report">
      <Header header={body.header} />
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="weekly-report-tiles">
        {body.tiles.map((tile) => (
          <Tile key={tile.id} tile={tile} figures={figures} />
        ))}
      </ul>
      <div className="space-y-3" data-testid="weekly-report-objectives">
        {body.objectives.map((section) => (
          <ObjectiveSection
            key={section.objective}
            section={section}
            header={body.header}
            figures={figures}
          />
        ))}
      </div>
      <section className="space-y-2" data-testid="weekly-report-recommendations">
        <h4 className={cn('text-foreground', JAINA_TYPE.label)}>Recommendations</h4>
        {body.recommendations.length > 0 ? (
          <ol className="space-y-2">
            {body.recommendations.map((card) => (
              <RecommendationCard key={card.id} card={card} figures={figures} />
            ))}
          </ol>
        ) : (
          <p className={cn('text-muted-foreground', JAINA_TYPE.body)}>
            No pending recommendations this week.
          </p>
        )}
      </section>
    </div>
  );
}

export const weeklyReportRenderer: TemplateRenderer = {
  Hero: WeeklyReportHero,
  SectionBody: GenericSectionBody,
};
