'use client';

// The four tiles under the anchor (P1, "Lectura continua"): no box at all — a 12px label, a
// 22px figure and two 12px lines, the tiles split by thin vertical hairlines. Four columns on a
// desktop pane, two by two below 56rem, measured on the pane. The figures stay in the
// foreground colour — the anchor is the one protagonist — and only a comparison line under a
// figure may take a subtle green or red; the decisions tile spends primary on its "Review →"
// press alone. Which four, and which line is coloured, is decided in ./headlineModel
// (relevantTiles).

import { cn } from '@/lib/utils';
import { KpiTile } from '../../components/KpiTile';
import { figureProps } from '../../format';
import type { HeadlineTone, ModuleTile } from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';
import { SETTING_TEXT } from './PortfolioHeaderLine';

/** A tile's sub-line: one line, ellipsized, clipped SIDEWAYS only. `truncate` (overflow: hidden)
 *  also clipped vertically, which cut a setting chip's invisible hit area to the 16px line. */
const ONE_LINE = 'block overflow-x-clip text-ellipsis whitespace-nowrap';

export type PortfolioTilesProps = {
  tiles: ModuleTile[];
  onEditSetting: (setting: HeroSetting) => void;
  /** The decisions tile's "Review →": where the decisions wait. */
  onReviewDecisions?: () => void;
};

/** KpiTile is shared with the account Overview; the module strips its frame and its rule. */
const FRAMELESS = 'rounded-none border-0 bg-transparent p-0';

const TONE_TEXT: Record<HeadlineTone, string> = {
  good: 'text-success',
  bad: 'text-destructive',
};

const toneOf = (tone: HeadlineTone | null): string | undefined =>
  tone ? TONE_TEXT[tone] : undefined;

/**
 * The hairline left of a tile. Two columns below 56rem put tiles 2 and 4 on the right; four
 * columns above it put every tile but the first beside another.
 */
function hairline(index: number): string {
  if (index === 0) return '';
  if (index % 2 === 1) return 'border-border/60 border-l pl-4';
  return '@[56rem]/news:border-border/60 @[56rem]/news:border-l @[56rem]/news:pl-4';
}

export function PortfolioTiles({ tiles, onEditSetting, onReviewDecisions }: PortfolioTilesProps) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-4 @[56rem]/news:grid-cols-4"
      data-testid="portfolio-tiles"
    >
      {tiles.map((tile, index) => {
        // A press with nowhere to go is not drawn.
        const cta = onReviewDecisions ? tile.cta : null;
        return (
          <div className={cn('min-w-0', hairline(index))} key={tile.key}>
            <KpiTile
              className={FRAMELESS}
              figure={figureProps(
                tile.figure.key,
                tile.figure.raw,
                tile.figure.currency,
                tile.figure.window,
                tile.figure.unit,
              )}
              label={tile.label}
              state={tile.state}
              sub={
                <>
                  <span className={cn(ONE_LINE, toneOf(tile.subTone))}>
                    {tile.sub.map((segment) =>
                      typeof segment === 'string' ? (
                        segment
                      ) : (
                        <button
                          className={SETTING_TEXT}
                          data-setting={segment.setting}
                          data-testid="header-chip"
                          key={segment.setting}
                          onClick={() => onEditSetting(segment.setting)}
                          title="Edit in Manage"
                          type="button"
                        >
                          {segment.text}
                        </button>
                      ),
                    )}
                  </span>
                  {tile.detail || cta ? (
                    <span className={ONE_LINE}>
                      {tile.detail ? (
                        <span className={toneOf(tile.detailTone)} data-testid="kpi-detail">
                          {tile.detail}
                        </span>
                      ) : null}
                      {tile.detail && cta ? <span aria-hidden> · </span> : null}
                      {cta ? (
                        <button
                          className="hit-area font-semibold text-primary-ink hover:underline focus-visible:underline focus-visible:outline-none"
                          data-testid="decisions-review-cta"
                          onClick={onReviewDecisions}
                          type="button"
                        >
                          {cta}
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </>
              }
              testId={`tile-${tile.key}`}
              value={tile.value}
            />
          </div>
        );
      })}
    </div>
  );
}
